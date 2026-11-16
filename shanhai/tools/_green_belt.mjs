/**
 * 城外土带截面感知绿化（一次性）：
 * - 护城河与城墙间土带（ground_dirt）同属窄带截面可走契约（回归[17]：沿长轴每横截面至少一格可走）
 * - 放置算法：逐截面扫描，仅宽 ≥2 的截面放 1 棵树（截面内轮换位置），每 6 格错落一棵；
 *   城门通道口 ±8 格避让；松/阔交替 + 山石点缀（山石同样占格，受同约束）
 * - 全程不碰 streetCells / occupied / 宫城禁区
 */
import fs from 'node:fs';

const p = 'public/assets/art/iso/taoyuan.json';
const j = JSON.parse(fs.readFileSync(p, 'utf8'));
const { cols, rows } = j.grid;
const items = j.items;
const key = (x, y) => `${x},${y}`;
const inB = (x, y) => x >= 0 && y >= 0 && x < cols && y < rows;

// 占用与地面
const occupied = new Map();
const streetCells = new Set();
const dirtBands = []; // { gx, gy, w, h }
for (const it of items) {
  const w = it.w || 1, h = it.h || 1;
  if (it.type.startsWith('ground_')) {
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
      const k = key(it.gx + dx, it.gy + dy);
      if (it.type === 'ground_stone' || it.type === 'ground_marble') streetCells.add(k);
    }
    if (it.type === 'ground_dirt') dirtBands.push({ gx: it.gx, gy: it.gy, w, h });
    continue;
  }
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) occupied.set(key(it.gx + dx, it.gy + dy), it.type);
}

// 城门通道口（四门 ±8 格）
const GATES = [[58, 5], [58, 121], [5, 58], [121, 58]];
const nearGate = (x, y) => GATES.some(([gx, gy]) => Math.abs(x - gx) <= 8 && Math.abs(y - gy) <= 8);

const isFree = (x, y) => inB(x, y) && !occupied.has(key(x, y)) && !streetCells.has(key(x, y)) && !nearGate(x, y);

// 逐土带截面扫描
let placed = 0;
const logs = [];
for (const band of dirtBands) {
  const horiz = band.w >= band.h;
  const len = horiz ? band.w : band.h;
  const wide = horiz ? band.h : band.w;
  if (wide < 2) continue; // 单格宽的带完全不能放（放了截面全堵）
  for (let a = 2; a < len - 2; a++) {
    if (a % 6 !== 3) continue; // 每 6 格错落一棵
    // 截面内选格：沿带轮换位置（(a/6) 轮换），找第一个空格
    const startB = (Math.floor(a / 6) + band.gx + band.gy) % wide;
    for (let step = 0; step < wide; step++) {
      const b = (startB + step) % wide;
      const x = horiz ? band.gx + a : band.gx + b;
      const y = horiz ? band.gy + b : band.gy + a;
      if (!isFree(x, y)) continue;
      const variant = placed % 2 === 0 ? 'pine' : 'leaf';
      items.push({ type: 'tree', gx: x, gy: y, w: 1, h: 1, variant });
      occupied.set(key(x, y), 'tree');
      placed++;
      logs.push(`tree (${x},${y}) [带(${band.gx},${band.gy}) 截面${a} 位${b}]`);
      break;
    }
  }
  // 山石点缀：每带 1-2 块，放在带内另一处空格
  let rocksInBand = 0;
  for (let a = 4; a < len - 2 && rocksInBand < 1; a += 9) {
    for (let b = 0; b < wide; b++) {
      const x = horiz ? band.gx + a : band.gx + b;
      const y = horiz ? band.gy + b : band.gy + a;
      if (!isFree(x, y)) continue;
      items.push({ type: 'rock', gx: x, gy: y, w: 1, h: 1 });
      occupied.set(key(x, y), 'rock');
      placed++;
      rocksInBand++;
      logs.push(`rock (${x},${y})`);
      break;
    }
  }
}

fs.writeFileSync(p, JSON.stringify(j, null, 1) + '\n');
console.log(`土带绿化完成：tree + rock 共 ${placed} 处`);
logs.slice(0, 12).forEach((l) => console.log('  - ' + l));
if (logs.length > 12) console.log(`  ...等共 ${logs.length} 处`);
