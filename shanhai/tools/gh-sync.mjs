#!/usr/bin/env node
/**
 * 跨环境 GitHub 同步工具 —— git 智能协议被代理拦截时的替代通道。
 *
 * 背景：某些网络只放行 api.github.com / codeload.github.com，
 * git clone / fetch / push 会返回 502 或 SSL EOF。本工具用 REST Git Data API
 * 与 codeload 快照完成同样的「比对 / 下拉 / 推送 / 打 tag」，
 * 并且按 git blob sha 比对文件，不依赖本地 .git 的历史是否与远端连通。
 *
 * 用法（在 shanhai/ 目录下执行）：
 *   node tools/gh-sync.mjs status
 *   node tools/gh-sync.mjs pull [--apply] [--prune]
 *   node tools/gh-sync.mjs push [--apply] [--tag v0.0.0] [--message "..."]
 *   node tools/gh-sync.mjs push --apply --allow-delete   # 显式允许删除远端文件
 *
 * 约定：
 *   - 所有写操作默认 dry-run，必须显式加 --apply。
 *   - 凭据优先读 GITHUB_TOKEN / GH_TOKEN，否则走 git credential fill（绝不打印）。
 *   - status / pull 对公开仓库可不提供令牌。
 *   - 安全护栏：push 检测到「远端有、本地没有」默认直接中止，避免误删。
 *
 * 详见 HANDOFF.md 第 4 节。
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  readFileSync, writeFileSync, readdirSync, statSync, mkdtempSync,
  mkdirSync, copyFileSync, rmSync, existsSync,
} from 'node:fs';
import { join, posix, relative, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const SHANHAI = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = dirname(SHANHAI);
const CMD = (process.argv[2] || 'status').toLowerCase();
const APPLY = process.argv.includes('--apply');
const PRUNE = process.argv.includes('--prune');
const ALLOW_DELETE = process.argv.includes('--allow-delete');

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1]
    : def;
}
const TAG = arg('--tag', '');
const MESSAGE = arg('--message', arg('-m', 'chore: 同步本地改动'));

if (CMD === 'help' || CMD === '--help' || process.argv.includes('--help')) {
  console.log([
    '用法（在 shanhai/ 下执行）:',
    '  node tools/gh-sync.mjs status',
    '  node tools/gh-sync.mjs pull [--apply] [--prune]',
    '  node tools/gh-sync.mjs push [--apply] [--tag v0.0.0] [--message "..."] [--allow-delete]',
    '',
    '  status  按 git blob sha 比对本地与远端 main 的 tree（只读）',
    '  pull    codeload 快照下拉；默认 dry-run、不删本地独有文件',
    '  push    差异上传为新 commit 并快进 main，可选附注 tag；默认 dry-run',
    '',
    '凭据: GITHUB_TOKEN / GH_TOKEN → git credential fill（令牌不打印、不落盘）',
    '详见 HANDOFF.md 第 4 节。',
  ].join('\n'));
  process.exit(0);
}
if (!['status', 'pull', 'push'].includes(CMD)) {
  console.error(`未知命令: ${CMD}（可用: status / pull / push / help）`);
  process.exit(2);
}

// ---- 仓库与凭据 ----------------------------------------------------------
function gitCfg(key, def) {
  try {
    return execFileSync('git', ['config', '--get', key], { cwd: REPO, encoding: 'utf8' }).trim() || def;
  } catch { return def; }
}
function detectRepo() {
  let url = '';
  try { url = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: REPO, encoding: 'utf8' }).trim(); } catch { /* 无 remote 时用默认值 */ }
  const m = /github\.com[:/]([^/]+)\/([^/.]+?)(?:\.git)?$/.exec(url);
  return {
    owner: process.env.GITHUB_OWNER || m?.[1] || 'linemarsun',
    name: process.env.GITHUB_REPO || m?.[2] || 'xiyou01',
  };
}
function getToken() {
  const env = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (env) return env.trim();
  try {
    const out = execFileSync('git', ['credential', 'fill'], {
      input: 'protocol=https\nhost=github.com\n\n',
      encoding: 'utf8',
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' },
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    return /^password=(.+)$/m.exec(out)?.[1]?.trim() || '';
  } catch { return ''; }
}

const { owner, name } = detectRepo();
const TOKEN = getToken();
const API = `https://api.github.com/repos/${owner}/${name}`;
const TMP = mkdtempSync(join(tmpdir(), 'gh-sync-'));
process.on('exit', () => { try { rmSync(TMP, { recursive: true, force: true }); } catch { /* 忽略清理失败 */ } });

// ---- HTTP（令牌经 curl --config - 从 stdin 传入，不进命令行/日志） --------
let reqNo = 0;
function http(method, url, body) {
  const n = ++reqNo;
  const cfg = [
    ...(TOKEN ? [`header = "Authorization: Bearer ${TOKEN}"`] : []),
    'header = "Accept: application/vnd.github+json"',
    'header = "X-GitHub-Api-Version: 2022-11-28"',
    'header = "Content-Type: application/json"',
  ].join('\n') + '\n';
  const outFile = join(TMP, `res-${n}.json`);
  const args = ['--config', '-', '-sS', '--max-time', '180', '-L', '-o', outFile, '-w', '%{http_code}'];
  if (method !== 'GET') args.push('-X', method);
  if (body !== undefined) {
    const f = join(TMP, `req-${n}.json`);
    writeFileSync(f, JSON.stringify(body));
    args.push('--data-binary', `@${f}`);
  }
  args.push(url);
  const code = execFileSync('curl', args, { input: cfg, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }).trim();
  const text = readFileSync(outFile, 'utf8');
  let json = null;
  try { json = JSON.parse(text); } catch { /* 非 JSON 响应 */ }
  if (!/^2\d\d$/.test(code)) {
    throw new Error(`${method} ${url.replace(API, '')} → HTTP ${code}: ${text.slice(0, 500)}`);
  }
  return json;
}
const api = (method, path, body) => http(method, API + path, body);

/** 二进制下载（codeload zip）：不按文本读取响应体。 */
function download(url, destFile) {
  const cfg = TOKEN ? `header = "Authorization: Bearer ${TOKEN}"\n` : '';
  const code = execFileSync('curl', [
    '--config', '-', '-sS', '--max-time', '300', '-L',
    '-o', destFile, '-w', '%{http_code}', url,
  ], { input: cfg, encoding: 'utf8' }).trim();
  if (!/^2\d\d$/.test(code)) throw new Error(`下载快照失败: HTTP ${code} (${url})`);
  if (!statSync(destFile).size) throw new Error('下载快照为空');
}

// ---- 本地 / 远端 tree ----------------------------------------------------
const SKIP = /(^|\/)(node_modules|dist|\.git|\.vite|coverage|\.workbuddy)(\/|$)/;
function walk(dir, base = REPO, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const rel = posix.normalize(relative(base, full).replace(/\\/g, '/'));
    if (SKIP.test(rel)) continue;
    const st = statSync(full);
    if (st.isDirectory()) walk(full, base, out);
    else if (st.isFile()) out.push({ rel, full });
  }
  return out;
}
const blobSha = (buf) => createHash('sha1')
  .update(Buffer.concat([Buffer.from(`blob ${buf.length}\0`), buf]))
  .digest('hex');

function remoteTree() {
  const ref = api('GET', '/git/ref/heads/main');
  const sha = ref.object.sha;
  const commit = api('GET', `/git/commits/${sha}`);
  const tree = api('GET', `/git/trees/${commit.tree.sha}?recursive=1`);
  if (tree.truncated) throw new Error('远端 tree 被截断，无法安全比对');
  return {
    sha,
    parent: commit.parents?.[0]?.sha || '',
    treeSha: commit.tree.sha,
    map: new Map(tree.tree.filter((e) => e.type === 'blob').map((e) => [e.path, e])),
  };
}
function diffAgainst(remoteMap) {
  const changed = [], unchanged = [], missing = [];
  const seen = new Set();
  for (const f of walk(REPO)) {
    seen.add(f.rel);
    const buf = readFileSync(f.full);
    const sha = blobSha(buf);
    const up = remoteMap.get(f.rel);
    if (up && up.sha === sha) unchanged.push(f.rel);
    else changed.push({ ...f, buf, mode: up?.mode || '100644' });
  }
  for (const [p, e] of remoteMap) if (!seen.has(p)) missing.push({ path: p, mode: e.mode });
  return { changed, unchanged, missing };
}
function printList(label, items, limit = 40) {
  console.log(`${label} ${items.length} 个${items.length > limit ? `（仅列前 ${limit} 个）` : ''}：`);
  for (const it of items.slice(0, limit)) console.log(`    ${it}`);
  if (!items.length) console.log('    （无）');
}
function handoffLine(remoteSha, parentSha) {
  const f = join(SHANHAI, 'HANDOFF.md');
  if (!existsSync(f)) return;
  const text = readFileSync(f, 'utf8');
  const g = (k) => (new RegExp(`^${k}:\\s*(.+)$`, 'm').exec(text)?.[1] || '').trim();
  const base = g('baseline_main');
  const aligned = base && [remoteSha, parentSha].some((s) => s && base.startsWith(s.slice(0, 7)));
  console.log(`文档基线: baseline_main=${base.slice(0, 7)} | baseline_tag=${g('baseline_tag')} | this_release=${g('this_release')} | tests=${g('tests')} | updated=${g('updated')}`);
  console.log(`  ${aligned ? '✓ 文档基线与当前 main 或其父提交一致' : '⚠ 文档基线与当前 main 及父提交均不一致，请核对是否漏同步'}`);
}

// ---- status --------------------------------------------------------------
if (CMD === 'status') {
  const { sha, parent, treeSha, map } = remoteTree();
  const tags = api('GET', '/tags?per_page=10').map((t) => `${t.name}→${t.commit.sha.slice(0, 7)}`);
  console.log(`仓库: ${owner}/${name} | 认证: ${TOKEN ? '已提供令牌' : '匿名（公开仓库）'}`);
  console.log(`远端 main: ${sha} | tree ${treeSha.slice(0, 7)} | ${map.size} 个文件`);
  console.log(`最近 tags: ${tags.join(', ') || '（无）'}`);
  const { changed, unchanged, missing } = diffAgainst(map);
  console.log(`\n本地比对: 一致 ${unchanged.length} | 本地有差异 ${changed.length} | 远端有而本地无 ${missing.length}`);
  printList('本地有差异', changed.map((c) => `${map.has(c.rel) ? 'M' : 'A'}  ${c.rel}`));
  printList('远端有而本地无', missing.map((m) => `D  ${m.path}`));
  handoffLine(sha, parent);
  console.log(`\n结论: ${changed.length || missing.length ? '本地与远端 tree 不完全一致' : '本地与远端 tree 完全一致'}。`);
  console.log('提示: 本地 .git 若为快照重建，历史与远端不连通，请勿直接用 git push；用 push --apply 代替。');
  process.exit(0);
}

// ---- pull（codeload 快照） -----------------------------------------------
if (CMD === 'pull') {
  const { sha } = remoteTree();
  const zip = join(TMP, 'main.zip');
  const extractDir = join(TMP, 'src');
  mkdirSync(extractDir, { recursive: true });
  download(`https://codeload.github.com/${owner}/${name}/zip/refs/heads/main`, zip);
  try {
    execFileSync('unzip', ['-q', '-o', zip, '-d', extractDir], { stdio: 'ignore' });
  } catch {
    try { execFileSync('tar', ['-xf', zip, '-C', extractDir], { stdio: 'ignore' }); }
    catch { throw new Error('解压失败：需要 unzip 或 tar'); }
  }
  const tops = readdirSync(extractDir).filter((d) => statSync(join(extractDir, d)).isDirectory());
  const src = tops.length === 1 ? join(extractDir, tops[0]) : extractDir;
  const incoming = walk(src, src);
  const inMap = new Map();
  for (const f of incoming) inMap.set(f.rel, blobSha(readFileSync(f.full)));

  const toUpdate = [], toAdd = [], toDelete = [];
  for (const f of incoming) {
    const local = join(REPO, f.rel);
    const shaInc = inMap.get(f.rel);
    if (!existsSync(local)) toAdd.push(f.rel);
    else if (blobSha(readFileSync(local)) !== shaInc) toUpdate.push(f.rel);
  }
  for (const f of walk(REPO)) if (!inMap.has(f.rel)) toDelete.push(f.rel);

  console.log(`下拉来源: main@${sha.slice(0, 7)} | 快照 ${incoming.length} 个文件`);
  console.log(`将新增 ${toAdd.length} | 覆盖 ${toUpdate.length} | 本地独有 ${toDelete.length}`);
  printList('新增', toAdd);
  printList('覆盖', toUpdate);
  if (PRUNE) printList('本地独有（--prune 将删除）', toDelete);
  else if (toDelete.length) console.log(`本地独有 ${toDelete.length} 个文件默认保留；确认后可加 --prune 清理。`);

  if (!APPLY) {
    console.log('\n[dry-run] 未写入。确认后执行: node tools/gh-sync.mjs pull --apply');
    process.exit(0);
  }
  const needCopy = new Set([...toAdd, ...toUpdate]);
  for (const f of incoming) {
    if (!needCopy.has(f.rel)) continue;
    const dest = join(REPO, f.rel);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(f.full, dest);
  }
  if (PRUNE) for (const rel of toDelete) rmSync(join(REPO, rel), { force: true });
  console.log(`\n已同步 main@${sha.slice(0, 7)} 内容到本地（新增/覆盖 ${toAdd.length + toUpdate.length}${PRUNE ? `，删除 ${toDelete.length}` : ''}）。`);
  console.log('注意: codeload 快照不会创建本地 git 提交；历史不连通时请继续用本工具推送，或在网络放行后重新 git clone。');
  process.exit(0);
}

// ---- push（Git Data API） ------------------------------------------------
if (CMD === 'push') {
  if (!TOKEN) throw new Error('push 需要凭据：设置 GITHUB_TOKEN / GH_TOKEN，或配置 git credential helper');
  const who = http('GET', 'https://api.github.com/user');
  const repoInfo = api('GET', '');
  console.log(`认证账号: ${who.login} | 仓库: ${repoInfo.full_name} | push 权限: ${repoInfo.permissions?.push}`);
  if (!repoInfo.permissions?.push) throw new Error('当前凭据没有该仓库的 push 权限');

  const { sha, treeSha, map } = remoteTree();
  const { changed, unchanged, missing } = diffAgainst(map);
  console.log(`上游 main: ${sha.slice(0, 7)} | tree ${treeSha.slice(0, 7)} | ${map.size} 个文件`);
  console.log(`本轮: 改动 ${changed.length} | 未变 ${unchanged.length} | 远端有而本地无 ${missing.length}`);
  printList('改动', changed.map((c) => `${map.has(c.rel) ? 'M' : 'A'}  ${c.rel}  (${(c.buf.length / 1024).toFixed(1)} KB)`));
  if (missing.length) {
    printList('远端有而本地无', missing.map((m) => `D  ${m.path}`));
    if (!ALLOW_DELETE) throw new Error('检测到本地缺失的远端文件，已中止以防误删；确认无误可加 --allow-delete');
  }
  if (!changed.length && !(ALLOW_DELETE && missing.length)) {
    console.log('\n没有需要推送的改动。');
    process.exit(0);
  }
  if (TAG) {
    const exists = api('GET', '/tags?per_page=100').some((t) => t.name === TAG);
    if (exists) throw new Error(`tag ${TAG} 已存在，请换一个版本号`);
  }
  if (!APPLY) {
    console.log(`\n[dry-run] 提交信息: ${MESSAGE}${TAG ? ` | tag: ${TAG}` : ''}`);
    console.log('确认后执行: node tools/gh-sync.mjs push --apply --tag <版本> --message "<说明>"');
    process.exit(0);
  }

  const entries = [];
  for (const c of changed) {
    const blob = api('POST', '/git/blobs', { content: c.buf.toString('base64'), encoding: 'base64' });
    entries.push({ path: c.rel, mode: c.mode, type: 'blob', sha: blob.sha });
    console.log(`  blob ${c.rel} → ${blob.sha.slice(0, 7)}`);
  }
  if (ALLOW_DELETE) for (const m of missing) entries.push({ path: m.path, mode: m.mode, type: 'blob', sha: null });

  const now = new Date().toISOString();
  const identity = {
    name: process.env.GIT_AUTHOR_NAME || gitCfg('user.name', who.login),
    email: process.env.GIT_AUTHOR_EMAIL || gitCfg('user.email', `${who.login}@users.noreply.github.com`),
  };
  const tree = api('POST', '/git/trees', { base_tree: treeSha, tree: entries });
  const commit = api('POST', '/git/commits', {
    message: MESSAGE,
    tree: tree.sha,
    parents: [sha],
    author: { ...identity, date: now },
    committer: { ...identity, date: now },
  });
  api('PATCH', '/git/refs/heads/main', { sha: commit.sha, force: false });
  const verify = api('GET', '/git/ref/heads/main');
  if (verify.object.sha !== commit.sha) throw new Error('main 引用更新后校验失败');
  console.log(`\nmain 已快进到 ${verify.object.sha.slice(0, 7)} ✓`);

  if (TAG) {
    const tagObj = api('POST', '/git/tags', {
      tag: TAG,
      message: `${MESSAGE}\n\n基于 ${sha.slice(0, 7)}，本轮提交 ${commit.sha.slice(0, 7)}`,
      object: commit.sha,
      type: 'commit',
      tagger: { ...identity, date: now },
    });
    api('POST', '/git/refs', { ref: `refs/tags/${TAG}`, sha: tagObj.sha });
    const ref = api('GET', `/git/ref/tags/${TAG}`);
    console.log(`tag ${TAG} → ${ref.object.sha.slice(0, 7)} (${ref.object.type}) ✓`);
  }
  console.log(`完成: https://github.com/${owner}/${name}/commit/${commit.sha}`);
}
