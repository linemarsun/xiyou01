// 宫墙/游戏 dev server 守护启动器：
// 以 detached + 无控制台 方式拉起 vite，免疫 Ctrl+C 与计划任务窗口关闭。
// 用法：node tools/_dev_daemon.mjs  （由计划任务 ShanhaiVite 调起）
import { spawn, execSync } from 'child_process';
import { openSync, realpathSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
// 计划任务批处理可能以 8.3 短路径调起本脚本：realpathSync 不展开短名（实测），
// 需经 PowerShell Get-Item 还原长路径，否则 vite root/fs.allow 为短路径、
// 请求 id 为长路径 → 403 Restricted
let project = realpathSync(path.resolve(here, '..'));
if (project.includes('~')) {
  try {
    const real = execSync(
      `powershell -NoProfile -Command "(Get-Item -LiteralPath '${project.replace(/'/g, "''")}').FullName"`,
      { encoding: 'utf8' },
    ).trim();
    if (real && !real.includes('~')) project = real;
  } catch { /* 还原失败则沿用原路径 */ }
}
const NODE_EXE = 'C:\\Program Files\\Loomy\\resources\\node-runtime\\node.exe';
const VITE = path.join(project, 'node_modules', 'vite', 'bin', 'vite.js');
const LOG = path.join(project, '.vite-dev.log');

// 若 5288 已在监听则不重复启动
try {
  execSync('netstat -ano | findstr ":5288 .*LISTENING"', { stdio: 'pipe' });
  console.log('5288 已在监听，跳过启动');
  process.exit(0);
} catch { /* 未监听，继续 */ }

const out = openSync(LOG, 'a');
out && out.write && out.write(`\n[daemon] ${new Date().toISOString()} 启动 vite\n`);
const child = spawn(NODE_EXE, [VITE], {
  cwd: project,
  detached: true,
  stdio: ['ignore', out, out],
  env: { ...process.env },
});
child.unref();
console.log('vite 已守护启动 pid=', child.pid);
