/**
 * 手绘风等距素材批量入库管线
 * 1. AI 生成图（白底）→ 去背 → 白边清理 → 缩放 → 底中锚点 → 写入 public/assets/art/iso/
 * 2. 地面类从大砖阵裁切单格菱形（128×64）
 * 3. v 向 / 背面素材由 u 向水平镜像派生（等距 2:1 镜像成立）
 * 4. 入库前把原像素 PNG 备份到 _pixel_backup/
 */
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const GEN = 'D:/onenote/OneDrive/Documents/Loomy Workspace/generated-images';
const ISO = 'D:/onenote/OneDrive/Documents/Loomy Workspace/xiyou01/shanhai/public/assets/art/iso';
const BACKUP = path.join(ISO, '_pixel_backup');
fs.mkdirSync(BACKUP, { recursive: true });

function loadPng(p) { return PNG.sync.read(fs.readFileSync(p)); }
/** filterType 0 是本仓库 PNG 编码契约：回归测试的轻量解码器只认逐行 filter 0 */
function savePng(png, p) { fs.writeFileSync(p, PNG.sync.write(png, { filterType: 0 })); }
function backup(name) {
  const dst = path.join(BACKUP, name);
  if (!fs.existsSync(dst) && fs.existsSync(path.join(ISO, name))) {
    fs.copyFileSync(path.join(ISO, name), dst);
  }
}

function removeWhiteBg(png, thr = 238) {
  const { width: W, height: H, data } = png;
  const idx = (x, y) => (y * W + x) * 4;
  const isWhite = (i) => data[i] >= thr && data[i + 1] >= thr && data[i + 2] >= thr;
  const visited = new Uint8Array(W * H);
  const stack = [];
  for (let x = 0; x < W; x++) stack.push(x, 0, x, H - 1);
  for (let y = 0; y < H; y++) stack.push(0, y, W - 1, y);
  while (stack.length) {
    const y = stack.pop(), x = stack.pop();
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const k = y * W + x;
    if (visited[k]) continue;
    const i = idx(x, y);
    if (!isWhite(i)) continue;
    visited[k] = 1;
    data[i + 3] = 0;
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }
  return png;
}

function erodeWhiteEdge(png, thr = 232) {
  const { width: W, height: H, data } = png;
  const kill = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    if (data[i + 3] === 0) continue;
    if (!(data[i] >= thr && data[i + 1] >= thr && data[i + 2] >= thr)) continue;
    let edge = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) { edge = true; break; }
      if (data[(ny * W + nx) * 4 + 3] < 128) { edge = true; break; }
    }
    if (edge) kill.push(i);
  }
  for (const i of kill) data[i + 3] = 0;
  return png;
}

function alphaBBox(png) {
  const { width: W, height: H, data } = png;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (data[(y * W + x) * 4 + 3] > 8) {
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) throw new Error('全透明');
  return { x0, y0, x1, y1 };
}

function resize(src, dw, dh) {
  const out = new PNG({ width: dw, height: dh });
  const { width: sw, height: sh, data: sd } = src;
  for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
    const gx = Math.min(sw - 1, ((x + 0.5) * sw) / dw - 0.5);
    const gy = Math.min(sh - 1, ((y + 0.5) * sh) / dh - 0.5);
    const x0 = Math.max(0, Math.floor(gx)), y0 = Math.max(0, Math.floor(gy));
    const x1 = Math.min(sw - 1, x0 + 1), y1 = Math.min(sh - 1, y0 + 1);
    const fx = gx - x0, fy = gy - y0;
    const di = (y * dw + x) * 4;
    for (let c = 0; c < 4; c++) {
      const v00 = sd[(y0 * sw + x0) * 4 + c], v10 = sd[(y0 * sw + x1) * 4 + c];
      const v01 = sd[(y1 * sw + x0) * 4 + c], v11 = sd[(y1 * sw + x1) * 4 + c];
      out.data[di + c] = Math.round(v00 * (1 - fx) * (1 - fy) + v10 * fx * (1 - fy) + v01 * (1 - fx) * fy + v11 * fx * fy);
    }
  }
  return out;
}

function fitCanvas(src, w, h) {
  const bbox = alphaBBox(src);
  const sw = bbox.x1 - bbox.x0 + 1, sh = bbox.y1 - bbox.y0 + 1;
  const scale = Math.min(w / sw, h / sh);
  const rw = Math.max(1, Math.round(sw * scale)), rh = Math.max(1, Math.round(sh * scale));
  const cut = new PNG({ width: sw, height: sh });
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
    const si = ((bbox.y0 + y) * src.width + (bbox.x0 + x)) * 4;
    const di = (y * sw + x) * 4;
    for (let c = 0; c < 4; c++) cut.data[di + c] = src.data[si + c];
  }
  const scaled = resize(cut, rw, rh);
  const out = new PNG({ width: w, height: h });
  const ox = Math.floor((w - rw) / 2), oy = h - rh;
  for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
    const si = (y * rw + x) * 4, di = ((oy + y) * w + (ox + x)) * 4;
    for (let c = 0; c < 4; c++) out.data[di + c] = scaled.data[si + c];
  }
  return out;
}

function groundCell(src, outW = 128, outH = 64) {
  const cut = removeWhiteBg(src);
  const b = alphaBBox(cut);
  const cx = (b.x0 + b.x1) / 2, y0 = b.y0;
  const Wd = b.x1 - b.x0 + 1, Hd = b.y1 - b.y0 + 1;
  const w1 = Wd / 4, h1 = Hd / 4;
  const topY = y0 + h1, botY = y0 + 2 * h1;
  const bx0 = Math.round(cx - w1 / 2), bx1 = Math.round(cx + w1 / 2);
  const by0 = Math.round(topY), by1 = Math.round(botY);
  const bw = bx1 - bx0, bh = by1 - by0;
  const cell = new PNG({ width: bw, height: bh });
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    const dx = (bx0 + x - cx) / (w1 / 2);
    const dy = (by0 + y - (topY + botY) / 2) / (h1 / 2);
    const inside = Math.abs(dx) + Math.abs(dy) <= 1.0;
    const si = ((by0 + y) * cut.width + (bx0 + x)) * 4, di = (y * bw + x) * 4;
    for (let c = 0; c < 4; c++) cell.data[di + c] = cut.data[si + c];
    if (!inside) cell.data[di + 3] = 0;
  }
  return erodeWhiteEdge(resize(cell, outW, outH));
}

/**
 * 构件适配（核心比例语义）：
 * - tall：竖直构件（建筑/树/石/碑/塔…）。高度铺满目标画布（实体高度 = 旧版画布高，
 *   与人物 112px 的 2.87:1 观感比例对齐），画布宽按内容原始比例加宽——渲染锚点是
 *   底边中心且 1:1 不缩放，画布尺寸即显示尺寸，旧 fitCanvas 的 min 缩放会把
 *   宽扁 AI 构图压矮 30%+，导致建筑比人物小太多。
 * - wide：横长构件（桥/台阶/栅栏）。宽度铺满（足迹长度语义），高度按比例。
 */
function propTall(src, w, h, thr = 238, cropLimit = Infinity) {
  const cut = removeWhiteBg(src, thr);
  const bbox = alphaBBox(cut);
  let sw = bbox.x1 - bbox.x0 + 1;
  const sh = bbox.y1 - bbox.y0 + 1;
  const scale = h / sh;
  // 裁宽保高：AI 宽构图超出足迹语义宽上限时，居中裁掉两侧延伸（构图对称时锚点语义不变）
  if (sw * scale > cropLimit) {
    const keep = Math.ceil(cropLimit / scale);
    const nx0 = bbox.x0 + Math.floor((sw - keep) / 2);
    bbox.x1 = nx0 + keep - 1;
    sw = keep;
  }
  const rw = Math.max(1, Math.round(sw * scale));
  const trimmed = new PNG({ width: sw, height: sh });
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
    const si = ((bbox.y0 + y) * cut.width + (bbox.x0 + x)) * 4;
    const di = (y * sw + x) * 4;
    for (let c = 0; c < 4; c++) trimmed.data[di + c] = cut.data[si + c];
  }
  const scaled = resize(trimmed, rw, h);
  const out = new PNG({ width: Math.max(w, rw), height: h });
  const ox = Math.floor((out.width - rw) / 2);
  for (let y = 0; y < h; y++) for (let x = 0; x < rw; x++) {
    const si = (y * rw + x) * 4, di = (y * out.width + (ox + x)) * 4;
    for (let c = 0; c < 4; c++) out.data[di + c] = scaled.data[si + c];
  }
  return erodeWhiteEdge(out);
}

function propWide(src, w, h) {
  const cut = removeWhiteBg(src);
  const bbox = alphaBBox(cut);
  const sw = bbox.x1 - bbox.x0 + 1, sh = bbox.y1 - bbox.y0 + 1;
  const scale = w / sw;
  const rh = Math.max(1, Math.round(sh * scale));
  const trimmed = new PNG({ width: sw, height: sh });
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
    const si = ((bbox.y0 + y) * cut.width + (bbox.x0 + x)) * 4;
    const di = (y * sw + x) * 4;
    for (let c = 0; c < 4; c++) trimmed.data[di + c] = cut.data[si + c];
  }
  const scaled = resize(trimmed, w, rh);
  const out = new PNG({ width: w, height: Math.max(h, rh) });
  const ox = 0, oy = out.height - rh;
  for (let y = 0; y < rh; y++) for (let x = 0; x < w; x++) {
    const si = (y * w + x) * 4, di = ((oy + y) * w + (ox + x)) * 4;
    for (let c = 0; c < 4; c++) out.data[di + c] = scaled.data[si + c];
  }
  return erodeWhiteEdge(out);
}

function mirror(src) {
  const out = new PNG({ width: src.width, height: src.height });
  const { width: W, height: H, data: sd } = src;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const si = (y * W + (W - 1 - x)) * 4, di = (y * W + x) * 4;
    for (let c = 0; c < 4; c++) out.data[di + c] = sd[si + c];
  }
  return out;
}

// —— 入库清单：源图 → 目标名 + 模式 + 规格 [宽, 高, 去背阈值?, 宽度上限?] ——
// tall 模式：高度铺满（实体高 = 旧版画布高，对齐 2.87:1 人物观感比）；宽超上限时居中裁切
const jobs = [
  // 地面（groundCell 裁单格 128×64）
  ['2-1-2-1-1794580783194-1.png', 'ground_stone.png', 'ground'],
  ['2-1-2-1-1794580853941-1.png', 'ground_grass.png', 'ground'],
  ['2-1-2-1-1794582107961-1.png', 'ground_water.png', 'ground'],
  ['2-1-2-1-1794583025832-1.png', 'ground_dirt.png', 'ground'],
  ['2-1-2-1-1794583026633-1.png', 'ground_marble.png', 'ground'],
  // 通用构件（高度以 0.75 档人物 84px 为基准：箱 ≤ 人胸、碑 ≈ 1.6 倍人高、树 ≈ 2 倍人高）
  ['2-1-1794580863606-1.png', 'tree_leaf.png', 'tall', 96, 170, 150],
  ['2-1-1794583071962-1.png', 'tree_pine.png', 'tall', 70, 190, 130],
  ['2-1-1794583073309-1.png', 'tree_dead.png', 'tall', 84, 160, 130],
  ['2-1-1794580903655-1.png', 'rock.png', 'tall', 112, 110, 140],
  ['2-1-1794583111444-1.png', 'rock_moss.png', 'tall', 112, 110, 140],
  ['2-1-1794583110838-1.png', 'rock_dark.png', 'tall', 112, 110, 140],
  ['2-1-1794583147173-1.png', 'rock_crystal.png', 'tall', 112, 120, 140],
  ['2-1-1794583183731-1.png', 'stele.png', 'tall', 148, 135, 170],
  ['2-1-1794583185312-1.png', 'well.png', 'tall', 116, 115, 150],
  ['2-1-1794583227744-1.png', 'incense.png', 'tall', 116, 130, 150],
  ['2-1-1794583232742-1.png', 'crate.png', 'tall', 108, 70, 110],
  ['2-1-1794583268212-1.png', 'lantern_post.png', 'tall', 55, 150, 110],
  ['2-1-1794583279988-1.png', 'fence.png', 'wide', 85, 75],
  ['2-1-1794583325470-1.png', 'stall.png', 'tall', 154, 160, 200],
  ['2-1-1794583319058-1.png', 'stairs.png', 'wide', 170, 85],
  ['2-1-1794581139231-1.png', 'gate_arch.png', 'tall', 194, 200, 250],
  ['2-1-1794582111236-1.png', 'bridge.png', 'wide', 320, 205],
  ['2-1-2-1-1794582154250-1.png', 'hall.png', 'tall', 440, 590, 228, 880],
  ['2-1-2-1-1794583371613-1.png', 'hall_stone.png', 'tall', 440, 590, 238, 800],
  // 云京民居（4 向 × 变体）
  ['2-1-2-1-1794580943171-1.png', 'house_4x4_sw.png', 'tall', 273, 327, 238, 360],
  ['2-1-2-1-1794583411489-1.png', 'house_4x4_sw_carved.png', 'tall', 273, 327, 238, 360],
  ['2-1-lattice-2-1-1794583415481-1.png', 'house_4x4_sw_lattice.png', 'tall', 273, 327, 238, 360],
  ['2-1-2-1-1794583452867-1.png', 'house_4x4_sw_shop.png', 'tall', 273, 327, 238, 360],
  ['2-1-2-1-1794583454038-1.png', 'house_4x4_se.png', 'tall', 273, 327, 238, 360],
  ['2-1-2-1-1794583493455-1.png', 'house_4x4_se_carved.png', 'tall', 273, 327, 238, 360],
  ['2-1-2-1-1794583499371-1.png', 'house_4x4_se_lattice.png', 'tall', 273, 327, 238, 360],
  ['2-1-2-1-1794583543721-1.png', 'house_4x4_se_shop.png', 'tall', 273, 327, 238, 360],
  ['2-1-2-1-1794583546162-1.png', 'house_4x4_nw.png', 'tall', 273, 327, 238, 360],
  // 云京城防（拼接件必须贴合足迹宽度）
  ['2-1-1794583602762-1.png', 'city_wall_u2.png', 'tall', 128, 297, 238, 170],
  ['2-1-1794583608380-1.png', 'city_wall_u6.png', 'tall', 256, 361, 238, 330],
  ['2-1-1794583650590-1.png', 'city_wall_corner.png', 'tall', 128, 308, 238, 170],
  ['2-1-1794583650789-1.png', 'city_gate_wide.png', 'tall', 416, 604, 238, 520],
  ['2-1-1794583686638-1.png', 'bell_tower.png', 'tall', 458, 606, 238, 580],
  ['2-1-1794583691224-1.png', 'pagoda.png', 'tall', 267, 756, 238, 360],
  // 宫城（主殿/配殿/宫门为独立完整建筑，保持完整构图不裁翼）
  ['2-1-2-1-1794583743991-1.png', 'palace_hall.png', 'tall', 504, 686, 238, 930],
  ['2-1-2-1-1794583787859-1.png', 'palace_hall_s.png', 'tall', 324, 453, 238, 580],
  ['2-1-1794583786662-1.png', 'palace_gate.png', 'tall', 206, 426, 238, 530],
  ['2-1-1794583822547-1.png', 'palace_corner.png', 'tall', 142, 422, 238, 220],
  ['2-1-1794583832388-1.png', 'palace_wall_u6.png', 'tall', 256, 275, 238, 320],
  ['2-1-1794583877985-1.png', 'palace_wall_u2.png', 'tall', 128, 211, 238, 170],
  // 野外专属大件
  ['2-1-1794583878982-1.png', 'mountain_gate.png', 'tall', 170, 170, 220],
  ['2-1-1794622719531-1.png', 'ferry_dock.png', 'wide', 320, 205],
  ['2-1-1794622730482-1.png', 'cave_gate.png', 'tall', 170, 170, 220],
  ['2-1-1794622783671-1.png', 'soul_lantern.png', 'tall', 48, 150, 100],
  // 阎罗殿（地府主题大件，独立完整建筑）
  ['2-1-2-1-1794582156024-1.png', 'hell_palace.png', 'tall', 440, 590, 238, 620],
];

let ok = 0, fail = 0;
for (const [src, dst, mode, ...rest] of jobs) {
  try {
    backup(dst);
    const raw = loadPng(path.join(GEN, src));
    let out;
    if (mode === 'ground') out = groundCell(raw);
    else if (mode === 'wide') out = propWide(raw, rest[0], rest[1]);
    else {
      // rest: [宽, 高, 宽度上限] 或 [宽, 高, 去背阈值, 宽度上限]
      const [w, h, a, b] = rest;
      const thr = rest.length >= 4 ? a : 238;
      const cropLimit = rest.length >= 4 ? b : a;
      out = propTall(raw, w, h, thr, cropLimit);
    }
    savePng(out, path.join(ISO, dst));
    ok++;
    console.log('入库 ✓', dst, `(${out.width}x${out.height})`);
  } catch (e) {
    fail++;
    console.log('入库 ✗', dst, '—', e.message);
  }
}

// —— 镜像派生（等距 2:1 水平镜像 = 对向朝向） ——
const mirrorJobs = [
  ['house_4x4_nw.png', 'house_4x4_ne.png'],
  ['city_wall_u6.png', 'city_wall_v6.png'],
  ['city_wall_u2.png', 'city_wall_v2.png'],
  ['city_gate_wide.png', 'city_gate_wide_v.png'],
  ['palace_wall_u6.png', 'palace_wall_v6.png'],
  ['palace_wall_u2.png', 'palace_wall_v2.png'],
];
for (const [srcName, dstName] of mirrorJobs) {
  try {
    backup(dstName);
    const out = mirror(loadPng(path.join(ISO, srcName)));
    savePng(out, path.join(ISO, dstName));
    ok++;
    console.log('镜像 ✓', dstName, '←', srcName);
  } catch (e) {
    fail++;
    console.log('镜像 ✗', dstName, '—', e.message);
  }
}

console.log(`\n完成：成功 ${ok}，失败 ${fail}`);
