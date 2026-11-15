/**
 * 云京民居全局算法重排（一次性）：
 * - 问题：哈希抢占撒点的 26 座 9×9 合院中，纵列相邻座 (u+v) 差仅 10（投影间距 160px），
 *   而合院视觉高 476px → 后排被前排盖掉大半（q_sw 目检实锤）。
 * - 算法：迭代消除违规对 —— |Δ(u+v)| < 15 且 |Δ(u-v)| < 10 的两座，将后者挪到
 *   半径内合法空位（不压街/宫城/构件、与其他合院满足间距或横向错列 ≥10、离街心 ≥5）。
 * - 宫城构件（palace/city_wall/gate_keep/paifang/hall/bridge）与 ground 系全部固定不动。
 * - 挪位新足迹内压到的装饰小件（tree/rock/crate/fence）直接移除（数量断言有余量）；
 *   SOFT 地标类（well/stele/incense/lantern_post/stall）迁移到最近空位。
 */
import fs from 'node:fs';

const p = 'public/assets/art/iso/taoyuan.json';
const j = JSON.parse(fs.readFileSync(p, 'utf8'));
const { cols, rows } = j.grid;
const items = j.items;

const MIN_DU = 15; // (u+v) 投影间距：后排至少可见一半立面
const MIN_DV = 10; // (u-v) 横向错列：纵向间距不足时允许横向完全错开
const CLEAR_STREET = 5; // 离街心 ≥5（rules.houseClearanceFromStreetCenter=5）

const key = (x, y) => `${x},${y}`;
const inB = (x, y) => x >= 0 && y >= 0 && x < cols && y < rows;

// ground 系：street/blocked 判定
const GROUND_STREET = new Set(['ground_stone', 'ground_dirt', 'ground_marble']);
const GROUND_BLOCK = new Set(['ground_water']);
const streetCells = new Set();
for (const it of items) {
  if (GROUND_STREET.has(it.type)) {
    const w = it.w || 1, h = it.h || 1;
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) streetCells.add(key(it.gx + dx, it.gy + dy));
  }
}

// 固定构件占用格（非 house、非 ground）——Map 记录类型，纯装饰件可被合院落位清理
const occupiedType = new Map();
const SOFT = new Set(['well', 'stele', 'incense', 'lantern_post', 'stall']);
const SOFT_DECO = new Set(['tree', 'rock', 'crate', 'fence']);
const softItems = [];
const houses = [];
for (const it of items) {
  if (it.type.startsWith('ground_')) continue;
  const w = it.w || 1, h = it.h || 1;
  if (it.type === 'house') { houses.push(it); continue; }
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) occupiedType.set(key(it.gx + dx, it.gy + dy), it.type);
  if (SOFT.has(it.type)) softItems.push(it);
}

// house 足迹占用（动态维护）
const houseCells = new Set();
for (const h of houses) {
  for (let dy = 0; dy < 9; dy++) for (let dx = 0; dx < 9; dx++) houseCells.add(key(h.gx + dx, h.gy + dy));
}

const canPlace = (gx, gy) => {
  // 纯装饰件（tree/rock/crate/fence）可被清理，不算硬阻塞；街/水/宫城/地标/其他合院为硬阻塞
  for (let dy = -2; dy < 11; dy++) for (let dx = -2; dx < 11; dx++) {
    const x = gx + dx, y = gy + dy;
    if (!inB(x, y)) return false;
    const k = key(x, y);
    if (streetCells.has(k)) return false;
    const t = occupiedType.get(k);
    if (t && !SOFT_DECO.has(t)) return false;
    if (houseCells.has(k)) return false;
  }
  return true;
};

const violates = (a, b) => {
  const duv = Math.abs((a.gx + a.gy) - (b.gx + b.gy));
  const duv2 = Math.abs(a.gx - a.gy - (b.gx - b.gy));
  return duv < MIN_DU && duv2 < MIN_DV;
};

// 迭代消除违规对
let moved = [];
for (let round = 0; round < 4; round++) {
  let fixed = 0;
  for (let i = 0; i < houses.length; i++) {
    const a = houses[i];
    const bad = houses.filter((b) => b !== a && violates(a, b));
    if (!bad.length) continue;
    // 挪动 b（按数组序，稳定收敛）
    for (const b of bad) {
      // 释放 b 的足迹后搜索
      for (let dy = 0; dy < 9; dy++) for (let dx = 0; dx < 9; dx++) houseCells.delete(key(b.gx + dx, b.gy + dy));
      let placed = false;
      outer: for (let r = 2; r <= 40 && !placed; r++) {
        for (let dy = -r; dy <= r && !placed; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            const nx = b.gx + dx, ny = b.gy + dy;
            if (!canPlace(nx, ny)) continue;
            const cand = { gx: nx, gy: ny };
            // 与全部其他合院满足间距
            if (houses.some((o) => o !== b && violates(cand, o))) continue;
            b.gx = nx; b.gy = ny;
            placed = true;
            moved.push(`(${nx},${ny}) ← r=${r}`);
            break;
          }
        }
      }
      if (!placed) {
        // 找不到空位则原位放回
        for (let dy = 0; dy < 9; dy++) for (let dx = 0; dx < 9; dx++) houseCells.add(key(b.gx + dx, b.gy + dy));
      } else {
        // 新足迹登记
        for (let dy = 0; dy < 9; dy++) for (let dx = 0; dx < 9; dx++) houseCells.add(key(b.gx + dx, b.gy + dy));
        // 清理新足迹内压到的装饰小件 / 迁移 SOFT 地标
        for (let k = items.length - 1; k >= 0; k--) {
          const it = items[k];
          if (it.type === 'house' || it.type.startsWith('ground_')) continue;
          const w = it.w || 1, hh = it.h || 1;
          let hit = false;
          for (let dy = 0; dy < hh && !hit; dy++) for (let dx = 0; dx < w && !hit; dx++) {
            if (it.gx + dx >= b.gx && it.gx + dx < b.gx + 9 && it.gy + dy >= b.gy && it.gy + dy < b.gy + 9) hit = true;
          }
          if (!hit) continue;
          if (SOFT.has(it.type)) {
            // 就近迁移
            let ok = false;
            for (let r = 1; r <= 10 && !ok; r++) {
              for (let dy = -r; dy <= r && !ok; dy++) for (let dx = -r; dx <= r && !ok; dx++) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
                const nx = it.gx + dx, ny = it.gy + dy;
                let free = true;
                for (let dy2 = 0; dy2 < (it.h || 1) && free; dy2++) for (let dx2 = 0; dx2 < (it.w || 1) && free; dx2++) {
                  const kk = key(nx + dx2, ny + dy2);
                  if (!inB(nx + dx2, ny + dy2) || occupiedType.has(kk) || streetCells.has(kk) || houseCells.has(kk)) free = false;
                }
                if (free) { it.gx = nx; it.gy = ny; ok = true; }
              }
            }
            if (!ok) { items.splice(k, 1); moved.push(`SOFT ${it.type} 移除`); }
          } else {
            items.splice(k, 1);
            moved.push(`${it.type} 移除`);
          }
        }
        fixed++;
      }
    }
  }
  if (!fixed) break;
}

// 朝向规划：院门面向最近街道（消除"背街房子"），街道在南侧时按左右分 se/sw
for (const h of houses) {
  const fx = h.gx + 4.5, fy = h.gy + 4.5;
  let best = null;
  for (const k of streetCells) {
    const [sx, sy] = k.split(',').map(Number);
    const d = Math.hypot(sx - fx, sy - fy);
    if (!best || d < best.d) best = { d, sx, sy };
  }
  if (!best) continue;
  const dv = best.sy - fy;
  const du = best.sx - fx;
  if (dv > 0) h.facing = Math.abs(du) <= dv ? 'se' : 'sw'; // 街在南侧：正南 se / 偏西 sw
}

fs.writeFileSync(p, JSON.stringify(j, null, 1) + '\n');
console.log(`重排完成：挪动 ${moved.length} 处`);
moved.forEach((m) => console.log('  - ' + m));
const still = [];
for (let i = 0; i < houses.length; i++) for (let k = i + 1; k < houses.length; k++) {
  if (violates(houses[i], houses[k])) still.push(`(${houses[i].gx},${houses[i].gy})~(${houses[k].gx},${houses[k].gy})`);
}
console.log('剩余违规对:', still.length ? still.join(' ') : '0 ✓');
console.log('合院总数:', houses.length);
