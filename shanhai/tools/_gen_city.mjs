// 临时布局生成器：按城市结构重排 128×128 云京，产物写入 art/iso/taoyuan.json。
// 本轮规则：十字主街 10 格直通四门 / 次级巷道 4 格 / 建筑 60~80 栋 /
// 四坊成组留空且无 >4×4 纯草地 / 靛青瓦为主、朱红瓦点缀 10~20% / 鼓楼为制高点。
// 仅本次使用，生成后可删除。
import { writeFileSync } from 'node:fs';

const OUT = new URL('../public/assets/art/iso/taoyuan.json', import.meta.url);
const N = 128;
const GRID = { cols: N, rows: N, tileW: 64, tileH: 32, ox: 4096, oy: 16 };

// 瓦色：靛青为主，朱红只作点缀（乘法着色，图本身的靛青顶被压暖后读作红褐瓦）
const COOL = 0xdde6ff;
const WARM = 0xff8f6b;
let tintI = 0;
/** 每 7 栋取 1 栋暖色（≈14%），同一坊内混色，不按坊整片换色 */
const tintPick = () => {
  const i = tintI++;
  return i % 7 === 0 ? WARM : COOL;
};

const items = [];
const placed = new Set();
const stoneCells = new Set();
const waterCells = new Set();
const dirtCells = new Set();
const key = (x, y) => `${x},${y}`;

const ground = [];
const groundRect = (x, y, w, h, type) => ground.push({ type, gx: x, gy: y, w, h });

// ---------- 地面 ----------
groundRect(0, 0, N, N, 'ground_grass');

// 十字主街：从四门门庭直通中心，路面连续、同轴对齐（EW 沿 y59..68，NS 沿 x59..68）
// 广场与门庭也按 4 格网格对齐，避免"随机补丁"感。
const STONE = [
  [4, 59, 117, 10],   // 东西主街：西门外门庭 → 东门内
  [59, 4, 10, 117],   // 南北主街：北门内 → 南门外门庭
  [56, 56, 16, 16],   // 中心广场（与主街同轴 16×16，边界整齐）
  [34, 34, 14, 14],   // 市集广场
  [34, 69, 12, 12],   // 庙署前广场（接月台甬道）
  [2, 62, 4, 6],      // 西门外门庭
  [122, 62, 4, 6],    // 东门外门庭
  [62, 119, 6, 5],    // 南门外门庭
  // 次级巷道 4 格：市集
  [28, 7, 4, 52],     // 市集纵巷（接东西主街）
  [7, 28, 46, 4],     // 市集横巷（接南北主街）
  // 次级巷道 4 格：宅院（院落组之间，接东西主街）
  [84, 7, 4, 52],     // 宅院纵巷 x84..87
  [70, 22, 48, 4],    // 宅院横巷 y22..25
  [70, 40, 48, 4],    // 宅院横巷 y40..43
  // 园林坊 3 格曲径
];
for (const [x, y, w, h] of STONE) {
  groundRect(x, y, w, h, 'ground_stone');
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) stoneCells.add(key(x + dx, y + dy));
}

const DIRT = [
  // 庙署：甬道（广场尽端 → 月台）与后院
  [40, 81, 3, 5],
  [7, 84, 26, 4],
  [7, 106, 26, 3],
  // 园林：曲径
  [72, 74, 10, 4],
  [114, 88, 3, 22],
  [70, 104, 26, 4],
  [72, 112, 3, 8],
];
const dirtRect = (x, y, w, h) => {
  groundRect(x, y, w, h, 'ground_dirt');
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) dirtCells.add(key(x + dx, y + dy));
};
for (const [x, y, w, h] of DIRT) dirtRect(x, y, w, h);

const WATER = [
  [88, 86, 26, 18],   // 园林主水面（扩大）
  [70, 94, 14, 10],   // 曲池
  [86, 74, 4, 12],    // 水渠
  [96, 108, 16, 8],   // 南池（扩大）
];
for (const [x, y, w, h] of WATER) {
  groundRect(x, y, w, h, 'ground_water');
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) waterCells.add(key(x + dx, y + dy));
}

// ---------- 构件 ----------
const boundsOk = (x, y, w, h, interior = true) => {
  if (interior) return x >= 7 && y >= 7 && x + w <= 121 && y + h <= 121;
  return x >= 0 && y >= 0 && x + w <= N && y + h <= N;
};
const cellBlocked = (x, y, w, h, allowStone, clearance, allowWater) => {
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
    const gx = x + dx, gy = y + dy, k = key(gx, gy);
    if (placed.has(k)) return true;
    if (!allowWater && waterCells.has(k)) return true;
    if (!allowStone && stoneCells.has(k)) return true;
    if (clearance > 0) {
      for (const [nx, ny] of [[gx - 1, gy], [gx + 1, gy], [gx, gy - 1], [gx, gy + 1]]) {
        if (stoneCells.has(key(nx, ny))) return true;
      }
    }
  }
  return false;
};
const put = (item, opt = {}) => {
  const w = item.w ?? 1, h = item.h ?? 1;
  const interior = opt.interior ?? true;
  const allowStone = opt.allowStone ?? false;
  const allowWater = opt.allowWater ?? false;
  const clearance = opt.clearance ?? 0;
  if (!boundsOk(item.gx, item.gy, w, h, interior)) return false;
  if (cellBlocked(item.gx, item.gy, w, h, allowStone, clearance, allowWater)) return false;
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) placed.add(key(item.gx + dx, item.gy + dy));
  items.push(item);
  return true;
};

// ---------- 城墙与城门（合围 + 四门；城门对准十字主街轴线） ----------
const wallSeg = (x, y, w, h, type) => {
  items.push({ type, gx: x, gy: y, w, h });
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) placed.add(key(x + dx, y + dy));
};
// 美术直段只有 6 格 / 2 格两种模块：先铺 6 格，余下用 2 格；
// 奇数尾（余 1 格）用 2 格模块与前一段重叠 1 格。
const wallRun = (x, y, w, h) => {
  const horizontal = w >= h;
  const len = horizontal ? w : h;
  const seg = (start, n) => {
    if (horizontal) wallSeg(x + start, y, n, 2, n === 6 ? 'city_wall_u6' : 'city_wall_u2');
    else wallSeg(x, y + start, 2, n, n === 6 ? 'city_wall_v6' : 'city_wall_v2');
  };
  let i = 0;
  for (; len - i >= 6; i += 6) seg(i, 6);
  for (; len - i >= 2; i += 2) seg(i, 2);
  if (len - i === 1) seg(i - 1, 2);
};
// 北门在 x62..64（对准南北主街 x59..68），南北墙各留 3 格门洞
wallRun(7, 5, 55, 2);     // 北墙西段 7..61
wallRun(65, 5, 56, 2);    // 北墙东段 65..120
wallRun(7, 121, 55, 2);   // 南墙西段 7..61
wallRun(66, 121, 55, 2);  // 南墙东段 66..120
wallRun(5, 7, 2, 56);     // 西墙北段
wallRun(5, 66, 2, 55);    // 西墙南段
wallRun(121, 7, 2, 56);   // 东墙北段
wallRun(121, 66, 2, 55);  // 东墙南段
for (const [x, y] of [[5, 5], [121, 5], [5, 121], [121, 121]]) {
  items.push({ type: 'city_wall_corner', gx: x, gy: y, w: 2, h: 2 });
  for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) placed.add(key(x + dx, y + dy));
}
items.push({ type: 'gate_arch', gx: 62, gy: 0, w: 3, h: 3, facing: 'sw' });
items.push({ type: 'gate_arch', gx: 4, gy: 63, w: 3, h: 3, facing: 'se' });
items.push({ type: 'gate_arch', gx: 120, gy: 63, w: 3, h: 3, facing: 'nw' });
items.push({ type: 'city_gate_tower', gx: 62, gy: 121, w: 4, h: 3, facing: 'sw' });
for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 4; dx++) placed.add(key(62 + dx, 121 + dy));

// ---------- 中心：鼓楼（7×7 三层）+ 环绕广场 + 牌坊 ----------
const bellOk = put({ type: 'bell_tower', gx: 60, gy: 60, w: 7, h: 7 }, { allowStone: true });
for (const [x, y] of [[52, 57], [70, 57], [52, 66], [70, 66]]) {
  put({ type: 'paifang', gx: x, gy: y, w: 3, h: 3, facing: 'sw' }, { allowStone: true });
}
put({ type: 'well', gx: 56, gy: 58 }, { allowStone: true });
put({ type: 'stele', gx: 56, gy: 56, w: 1, h: 2 }, { allowStone: true });
put({ type: 'stele', gx: 71, gy: 56, w: 1, h: 2 }, { allowStone: true });
for (const [x, y] of [[54, 54], [73, 54], [54, 73], [73, 73]]) {
  put({ type: 'lantern_post', gx: x, gy: y }, { allowStone: true });
}

// ---------- 市集坊（西北）：四组街区 + 市集广场，铺面密、摊棚成排、货箱堆叠 ----------
const FACINGS = ['sw', 'se', 'nw', 'ne'];
const M_VAR = ['shop', 'shop', 'lattice', 'carved'];
let mi = 0;
const marketBlock = (x0, y0, x1, y1, cap) => {
  let n = 0;
  for (let y = y0; y + 4 <= y1 && n < cap; y += 6) {
    for (let x = x0; x + 4 <= x1 && n < cap; x += 6) {
      const ok = put({
        type: 'house', gx: x, gy: y, w: 4, h: 4,
        facing: FACINGS[mi % 4], variant: M_VAR[mi % 4], tint: tintPick(),
      }, { clearance: 1 });
      mi++;
      if (ok) n++;
    }
  }
  return n;
};
const marketCount =
  marketBlock(8, 8, 27, 27, 9) +
  marketBlock(32, 8, 53, 27, 9) +
  marketBlock(8, 32, 27, 53, 9);

// 市集广场：摊棚成行成列（3 列 × 4 行），货箱沿摊棚堆叠
for (let y = 36; y <= 48; y += 3) {
  for (let x = 36; x <= 48; x += 3) {
    put({ type: 'stall', gx: x, gy: y, w: 2, h: 2, facing: (x + y) % 2 ? 'sw' : 'se' }, { allowStone: true });
  }
}
let crates = 0;
const crateSpots = [
  [35, 37], [35, 40], [35, 43], [35, 46], [35, 49],
  [38, 35], [41, 35], [44, 35], [47, 35],
  [50, 37], [50, 40], [50, 43], [50, 46], [50, 49],
  [38, 50], [41, 50], [44, 50], [47, 50],
  [39, 39], [45, 45], [39, 45], [45, 39],
  [37, 48], [48, 37],
];
for (const [x, y] of crateSpots) {
  if (put({ type: 'crate', gx: x, gy: y }, { allowStone: true })) crates++;
}
put({ type: 'well', gx: 35, gy: 35 }, { allowStone: true });
for (const [x, y] of [[13, 13], [51, 13], [13, 51], [51, 51], [30, 12], [12, 30], [31, 50], [50, 31]]) {
  put({ type: 'lantern_post', gx: x, gy: y });
}
// 临街铺面：贴两条主街排一列，读作"市集大街"，同时把主街两侧立面补齐
for (let y = 8; y <= 50; y += 6) {
  put({ type: 'house', gx: 54, gy: y, w: 4, h: 4, facing: 'se', variant: 'shop', tint: tintPick() }, { clearance: 1 });
}
for (const x of [8, 20, 38, 44, 50]) {
  put({ type: 'house', gx: x, gy: 54, w: 4, h: 4, facing: 'sw', variant: 'shop', tint: tintPick() }, { clearance: 1 });
}
// 市集坊南侧巷道旁：手推货摊补空
for (const [x, y] of [[8, 57], [30, 57], [46, 57]]) {
  put({ type: 'stall', gx: x, gy: y, w: 2, h: 2, facing: 'sw' });
}

// ---------- 宅院坊（东北）：院落成组，巷道 4 格贯通主街 ----------
let resHouses = 0, resFence = 0;
const compound = (x0, y0, tag) => {
  dirtRect(x0 + 1, y0 + 1, 12, 12);
  // 外围院墙（南墙留门洞）
  for (let x = x0; x < x0 + 14; x += 2) {
    const gate = x >= x0 + 5 && x <= x0 + 8;
    if (!gate) { if (put({ type: 'fence', gx: x, gy: y0, w: 2, h: 1 })) resFence++; }
    if (put({ type: 'fence', gx: x, gy: y0 + 13, w: 2, h: 1 })) resFence++;
  }
  for (let y = y0; y < y0 + 14; y += 2) {
    if (put({ type: 'fence', gx: x0, gy: y, w: 1, h: 2 })) resFence++;
    if (put({ type: 'fence', gx: x0 + 13, gy: y, w: 1, h: 2 })) resFence++;
  }
  // 院套院：四座 4×4 屋身围出中央天井（前厅 / 后房 / 东西厢）
  for (const [hx, hy] of [[x0 + 2, y0 + 2], [x0 + 8, y0 + 2], [x0 + 2, y0 + 8], [x0 + 8, y0 + 8]]) {
    if (put({
      type: 'house', gx: hx, gy: hy, w: 4, h: 4,
      facing: 'sw', variant: tag, tint: tintPick(),
    }, { clearance: 0 })) resHouses++;
  }
  put({ type: 'tree', gx: x0 + 6, gy: y0 + 6, variant: (x0 + y0) % 2 ? 'pine' : 'leaf' });
  // 天井水井 + 巷道灯
  put({ type: 'well', gx: x0 + 6, gy: y0 + 4 });
  put({ type: 'lantern_post', gx: x0 + 6, gy: y0 + 12 });
};
const compoundTags = ['carved', 'lattice', 'carved', 'lattice', 'carved', 'lattice', 'carved', 'lattice'];
let ci = 0;
for (const [x0, y0] of [
  [70, 8], [70, 26], [70, 44],
  [88, 8], [88, 26], [88, 44],
  [104, 8], [104, 44],
]) {
  compound(x0, y0, compoundTags[ci % compoundTags.length]);
  ci++;
}
// 宅院坊东侧空档：竹林小院 + 界墙
for (const [x, y] of [[104, 30], [110, 26], [116, 32], [104, 38], [112, 40], [118, 36]]) {
  put({ type: 'tree', gx: x, gy: y, variant: x % 2 ? 'pine' : 'leaf' });
}
for (const [x, y, w, h] of [[102, 26, 2, 2], [102, 30, 1, 8], [118, 26, 1, 8]]) {
  put({ type: 'fence', gx: x, gy: y, w, h });
}

// ---------- 庙署坊（西南）：甬道 + 月台 + 香炉列 + 碑列，低密度大体量 ----------
let templeLarge = 0, templeMedium = 0;
for (const [x, y, w, h, v] of [
  [36, 94, 8, 8, 'stone'],   // 大殿
  [22, 104, 6, 6, 'stone'],  // 藏经阁
  [12, 86, 6, 6, 'stone'],   // 衙署
]) {
  if (put({ type: 'hall', gx: x, gy: y, w, h, variant: v, tint: tintPick() }, { allowStone: true, clearance: 0 })) templeLarge++;
}
put({ type: 'paifang', gx: 41, gy: 69, w: 3, h: 3, facing: 'sw' }, { allowStone: true });
// 月台：大殿前石台（甬道尽端）
for (const [x, y, w, h] of [[34, 86, 12, 8]]) {
  groundRect(x, y, w, h, 'ground_stone');
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) stoneCells.add(key(x + dx, y + dy));
}
// 香炉列（甬道两侧，3 对）
for (const [x, y] of [[38, 76], [38, 80], [38, 84], [44, 76], [44, 80], [44, 84]]) {
  put({ type: 'incense', gx: x, gy: y }, { allowStone: true });
}
// 碑列：甬道两侧各 3 通
for (const x of [37, 45]) {
  for (const y of [72, 76, 80]) put({ type: 'stele', gx: x, gy: y, w: 1, h: 2 }, { allowStone: true });
}
// 庙署院内甬道界墙
for (const [x, y, w, h] of [[33, 70, 1, 18], [46, 70, 1, 18], [33, 104, 1, 8], [8, 84, 1, 4], [8, 106, 1, 3]]) {
  put({ type: 'fence', gx: x, gy: y, w, h });
}
for (const [x, y] of [[12, 106], [48, 108], [30, 112], [8, 116], [44, 116], [18, 96]]) {
  if (put({ type: 'house', gx: x, gy: y, w: 4, h: 4, facing: 'sw', variant: 'lattice', tint: tintPick() }, { clearance: 1 })) templeMedium++;
}
put({ type: 'well', gx: 30, gy: 84 }, { allowStone: true });
for (const [x, y] of [[8, 74], [8, 96], [8, 112], [20, 74], [28, 92], [32, 76], [50, 88], [50, 102], [44, 108], [18, 118], [34, 118], [52, 96]]) {
  put({ type: 'tree', gx: x, gy: y, variant: x % 2 ? 'pine' : 'leaf' });
}

// ---------- 园林坊（东南）：大水面 + 竹林假山 + 曲径，房屋零星 ----------
let gardenHouse = 0;
for (const [x, y] of [[74, 72], [112, 74], [76, 114], [116, 90]]) {
  if (put({ type: 'house', gx: x, gy: y, w: 4, h: 4, facing: 'nw', variant: 'lattice', tint: tintPick() })) gardenHouse++;
}
put({ type: 'bridge', gx: 86, gy: 88, w: 3, h: 5 }, { allowWater: true });
put({ type: 'bridge', gx: 96, gy: 108, w: 3, h: 5 }, { allowWater: true });
put({ type: 'bridge', gx: 70, gy: 98, w: 3, h: 5 }, { allowWater: true });

let gardenTrees = 0;
for (let y = 70; y <= 118; y += 3) {
  for (let x = 70; x <= 118; x += 3) {
    if (waterCells.has(key(x, y)) || placed.has(key(x, y))) continue;
    if (put({ type: 'tree', gx: x, gy: y, variant: (x + y) % 2 ? 'pine' : 'leaf' })) gardenTrees++;
  }
}
let rocks = 0;
for (let y = 72; y <= 118; y += 7) {
  for (let x = 72; x <= 118; x += 7) {
    if (rocks >= 30) break;
    if (waterCells.has(key(x, y)) || placed.has(key(x, y))) continue;
    if (put({ type: 'rock', gx: x, gy: y })) rocks++;
  }
}

// ---------- 收尾：消灭 >4×4 纯草地（城内每 4×4 窗口至少一处内容） ----------
const isBare = (k) =>
  !placed.has(k) && !stoneCells.has(k) && !waterCells.has(k) && !dirtCells.has(k);
let fillTrees = 0, fillRocks = 0;
for (let yy = 7; yy + 4 <= 121; yy++) {
  for (let xx = 7; xx + 4 <= 121; xx++) {
    let bare = true;
    for (let dy = 0; dy < 4 && bare; dy++) {
      for (let dx = 0; dx < 4; dx++) {
        if (!isBare(key(xx + dx, yy + dy))) { bare = false; break; }
      }
    }
    if (!bare) continue;
    // 窗口内全空：中心优先，失败再试四角
    const spots = [[2, 2], [1, 1], [0, 0], [3, 3], [2, 0], [0, 2], [1, 3], [3, 1]];
    for (const [ox, oy] of spots) {
      const it = (xx + yy) % 5 === 0
        ? { type: 'rock', gx: xx + ox, gy: yy + oy }
        : { type: 'tree', gx: xx + ox, gy: yy + oy, variant: (xx + oy) % 2 ? 'pine' : 'leaf' };
      if (!put(it)) continue;
      if (it.type === 'rock') fillRocks++; else fillTrees++;
      break;
    }
  }
}

// ---------- 城外林带（4~6 格空地，房屋不贴边界） ----------
let outerTrees = 0;
for (let i = 3; i < N; i += 6) {
  for (const [x, y] of [[i, 1], [i, 3], [i, 125], [i, 127], [1, i], [3, i], [125, i], [127, i]]) {
    if (x < 0 || y < 0 || x >= N || y >= N) continue;
    if (!put({ type: 'tree', gx: x, gy: y, variant: (x + y) % 2 ? 'pine' : 'leaf' }, { interior: false })) continue;
    outerTrees++;
  }
}

const layout = {
  grid: GRID,
  rules: { streetWidth: 10, houseClearanceFromStreetCenter: 5, roofLift: 0 },
  items: [...ground, ...items],
};
writeFileSync(OUT, `${JSON.stringify(layout, null, 2)}\n`);

// ---------- 统计 ----------
const count = (t) => items.filter((i) => i.type === t).length;
const BUILDING = ['house', 'house_large', 'hall'];
const region = (i) => {
  const cx = i.gx + (i.w ?? 1) / 2, cy = i.gy + (i.h ?? 1) / 2;
  if (cx >= 55 && cx <= 72 && cy >= 55 && cy <= 72) return 'center';
  if (cx < 64 && cy < 64) return 'market';
  if (cx >= 64 && cy < 64) return 'residence';
  if (cx < 64 && cy >= 64) return 'temple';
  if (cx >= 64 && cy >= 64) return 'garden';
  return 'other';
};
const quarters = ['market', 'residence', 'temple', 'garden'];
const detail = {};
for (const q of quarters) detail[q] = {};
for (const it of items) {
  const q = region(it);
  if (!detail[q]) continue;
  detail[q][it.type] = (detail[q][it.type] ?? 0) + 1;
}

// 剩余 >4×4 纯草地：扫描每个 4×4 窗口是否有内容（与收尾逻辑同判据）
let emptyWindows = 0;
for (let yy = 7; yy + 4 <= 121; yy++) {
  for (let xx = 7; xx + 4 <= 121; xx++) {
    let bare = true;
    for (let dy = 0; dy < 4 && bare; dy++) {
      for (let dx = 0; dx < 4; dx++) {
        if (!isBare(key(xx + dx, yy + dy))) { bare = false; break; }
      }
    }
    if (bare) emptyWindows++;
  }
}

console.log(JSON.stringify({
  total: layout.items.length,
  ground: ground.length,
  props: items.length,
  counts: {
    buildings: BUILDING.reduce((a, t) => a + count(t), 0),
    house: count('house'), hall: count('hall'),
    bellTower: count('bell_tower'),
    gate: count('gate_arch'), gateTower: count('city_gate_tower'),
    cityWall: count('city_wall_u6') + count('city_wall_u2') + count('city_wall_v6') + count('city_wall_v2'),
    wallCorner: count('city_wall_corner'),
    fence: count('fence'), tree: count('tree'), rock: count('rock'),
    stall: count('stall'), crate: count('crate'),
    paifang: count('paifang'), stele: count('stele'), incense: count('incense'),
    well: count('well'), lantern: count('lantern_post'), bridge: count('bridge'),
    water: count('ground_water'),
    tintWarm: items.filter((i) => i.tint === WARM).length,
    tintCool: items.filter((i) => i.tint === COOL).length,
  },
  empty4x4: emptyWindows,
  bellOk,
  fillTrees, fillRocks,
  compoundHouses: resHouses,
  marketCount,
}, null, 2));
console.log('QUARTERS ' + JSON.stringify(detail));
