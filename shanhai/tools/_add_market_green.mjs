/**
 * 云京布局增补（一次性）：市集烟火气 + 城外土带绿化
 * 1. 市集：主街环路内侧空位放 stall×10 + crate×8（工笔版），贴街不压街、避宫城/合院/锚点
 * 2. 城外绿化：护城河与城墙间土带每隔 6 格补 tree（工笔松/阔叶交替）+ rock 点缀
 * 全程占用校验，不碰宫城构件与现有建筑。
 */
import fs from 'node:fs';

const p = 'public/assets/art/iso/taoyuan.json';
const j = JSON.parse(fs.readFileSync(p, 'utf8'));
const { cols, rows } = j.grid;
const items = j.items;
const key = (x, y) => `${x},${y}`;
const inB = (x, y) => x >= 0 && y >= 0 && x < cols && y < rows;

// 占用网格（全部非 ground 构件足迹）
const occupied = new Map();
const streetCells = new Set();
const dirtCells = new Set();
for (const it of items) {
  const w = it.w || 1, h = it.h || 1;
  if (it.type.startsWith('ground_')) {
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
      const k = key(it.gx + dx, it.gy + dy);
      if (it.type === 'ground_stone' || it.type === 'ground_marble') streetCells.add(k);
      if (it.type === 'ground_dirt') dirtCells.add(k);
    }
    continue;
  }
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) occupied.set(key(it.gx + dx, it.gy + dy), it.type);
}

// 宫城禁区（x38..89, y38..89 外扩 2）与护城河内岸带
const inPalaceZone = (x, y) => x >= 36 && x <= 91 && y >= 36 && y <= 91;

// 窄带道路格（对齐回归 [17]：min(w,h)≤6 非 1×1 非 grass/water 的 ground）——禁止放置（截面堵死判死）
const narrowCells = new Set();
for (const it of items) {
  if (!it.type.startsWith('ground_')) continue;
  if (it.type === 'ground_grass' || it.type === 'ground_water') continue;
  const w = it.w || 1, h = it.h || 1;
  if (Math.min(w, h) > 6 || (w === 1 && h === 1)) continue;
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) narrowCells.add(key(it.gx + dx, it.gy + dy));
}

let added = 0;
const tryPlace = (type, gx, gy, w = 1, h = 1, extra = {}) => {
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
    const x = gx + dx, y = gy + dy;
    if (!inB(x, y)) return false;
    const k = key(x, y);
    if (occupied.has(k) || streetCells.has(k) || narrowCells.has(k)) return false; // 不压构件/街道/窄带截面
  }
  // 贴街判定：足迹外扩 1 格内须有街道（市集摊棚要临街）
  items.push({ type, gx, gy, w, h, ...extra });
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) occupied.set(key(gx + dx, gy + dy), type);
  added++;
  return true;
};

const nearStreet = (gx, gy, w = 1, h = 1) => {
  for (let dy = -1; dy < h + 1; dy++) for (let dx = -1; dx < w + 1; dx++) {
    if (streetCells.has(key(gx + dx, gy + dy))) return true;
  }
  return false;
};

// —— 市集：环路内主街两侧，确定性枚举空位（排除窄带），哈希取前 N 个 ——
const market = [];
for (let gy = 12; gy < rows - 12; gy++) {
  for (let gx = 12; gx < cols - 12; gx++) {
    const k = key(gx, gy);
    if (occupied.has(k) || streetCells.has(k) || narrowCells.has(k) || inPalaceZone(gx, gy)) continue;
    if (!nearStreet(gx, gy)) continue;
    market.push({ gx, gy, hseed: ((gx * 73856093) ^ (gy * 19349663)) >>> 0 });
  }
}
market.sort((a, b) => a.hseed - b.hseed);
let stalls = 0, crates = 0;
for (const m of market) {
  if (stalls >= 10 && crates >= 8) break;
  if (stalls < 10 && m.hseed % 3 === 0) {
    if (tryPlace('stall', m.gx, m.gy, 2, 2, { facing: 'sw' })) { stalls++; continue; }
  }
  if (crates < 8) {
    if (tryPlace('crate', m.gx, m.gy, 1, 1)) { crates++; continue; }
  }
}
console.log(`市集：stall ×${stalls}, crate ×${crates}`);

// —— 城外绿化：土带（dirt）沿带补树 ——
let trees = 0, rocks = 0;
const belt = [];
for (const k of dirtCells) {
  const [gx, gy] = k.split(',').map(Number);
  if (inPalaceZone(gx, gy)) continue;
  if (!occupied.has(k) && !streetCells.has(k)) belt.push({ gx, gy, hseed: ((gx * 19349663) ^ (gy * 73856093)) >>> 0 });
}
belt.sort((a, b) => a.hseed - b.hseed);
for (const b of belt) {
  if (trees >= 18) break;
  const variant = b.hseed % 2 === 0 ? 'pine' : 'leaf';
  if (tryPlace('tree', b.gx, b.gy, 1, 1, { variant })) trees++;
}
for (const b of belt) {
  if (rocks >= 5) break;
  if (tryPlace('rock', b.gx, b.gy, 1, 1)) rocks++;
}
console.log(`城外绿化：tree ×${trees}, rock ×${rocks}`);

fs.writeFileSync(p, JSON.stringify(j, null, 1) + '\n');
console.log('taoyuan.json 已写回');
