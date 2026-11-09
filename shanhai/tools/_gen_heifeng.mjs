// 青崖山道等距构件布局生成器（与 _gen_city.mjs 同一套 128×128 格 / 2:1 菱形契约）。
// 主题依据 assets_src/docs/maps_and_animation_plan.md §4.2：
//   段1 入山口·松荫 / 段2 折道·岔路（溪涧）/ 段3 崖道·悬桥。
// 分区用 s = gx + gy（0..254）划分，产物写入 public/assets/art/iso/wild_heifeng.json。
// 固定种子，重复运行结果一致。
import { writeFileSync } from 'node:fs';

const OUT = new URL('../public/assets/art/iso/wild_heifeng.json', import.meta.url);
const N = 128;
const GRID = { cols: N, rows: N, tileW: 64, tileH: 32, ox: 4096, oy: 16 };
const cellToWorld = (gx, gy) => ({
  x: GRID.ox + (gx - gy) * (GRID.tileW / 2),
  y: GRID.oy + (gx + gy) * (GRID.tileH / 2),
});

let seed = 20261108;
const rnd = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 0x100000000;
};
const COOL = 0xdde6ff;
const WARM = 0xffd9b0;

const ground = [];
const items = [];
const placed = new Set();
const pathCells = new Set();
const waterCells = new Set();
const stoneCells = new Set();
const key = (x, y) => `${x},${y}`;
const groundRect = (gx, gy, w, h, type) => ground.push({ type, gx, gy, w, h });
const mark = (set, x, y, w, h) => {
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) set.add(key(x + dx, y + dy));
};

// ---------- 地面：草地打底 + S 形折返山径 + 溪涧 + 崖道石台 ----------
groundRect(0, 0, N, N, 'ground_grass');

const PATH = [
  [12, 4, 10, 40],   // 入山口：自北侧南下
  [12, 40, 30, 10],  // 第一次折返：东行
  [34, 44, 10, 40],  // 再折：南下（与溪涧相交）
  [34, 84, 40, 10],  // 岔路：东行
  [68, 84, 10, 40],  // 崖道：南下至出口
];
for (const [x, y, w, h] of PATH) {
  groundRect(x, y, w, h, 'ground_dirt');
  mark(pathCells, x, y, w, h);
}

const WATER = [
  [30, 62, 26, 6],   // 溪涧横穿段2 山径（桥跨此处）
  [88, 20, 8, 90],   // 东侧纵向水带
  [40, 100, 20, 5],  // 支流
];
for (const [x, y, w, h] of WATER) {
  groundRect(x, y, w, h, 'ground_water');
  mark(waterCells, x, y, w, h);
}

const STONE = [
  [10, 8, 12, 8],    // 入山口石台（山门基座）
  [68, 96, 40, 28],  // 段3 崖道石台
  [34, 44, 10, 6],   // 溪涧桥头衔接
];
for (const [x, y, w, h] of STONE) {
  groundRect(x, y, w, h, 'ground_stone');
  mark(stoneCells, x, y, w, h);
}

// ---------- 构件摆放 ----------
const boundsOk = (x, y, w, h) => x >= 4 && y >= 4 && x + w <= N - 4 && y + h <= N - 4;
const blocked = (x, y, w, h, opt = {}) => {
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
    const k = key(x + dx, y + dy);
    if (placed.has(k)) return true;
    if (!opt.allowWater && waterCells.has(k)) return true;
    if (!opt.allowPath && pathCells.has(k)) return true;
    if (!opt.allowStone && stoneCells.has(k)) return true;
  }
  return false;
};
const put = (item, opt = {}) => {
  const w = item.w ?? 1, h = item.h ?? 1;
  if (!boundsOk(item.gx, item.gy, w, h)) return false;
  if (blocked(item.gx, item.gy, w, h, opt)) return false;
  mark(placed, item.gx, item.gy, w, h);
  items.push(item);
  return true;
};

// 段1：入山口山门 / 石砌小庙 / 路标石 / 茶棚（全部避开 gx12..22 的入山径）
put({ type: 'paifang', gx: 24, gy: 8, w: 3, h: 3, facing: 'sw' });
put({ type: 'house', gx: 24, gy: 16, w: 4, h: 4, facing: 'sw', variant: 'lattice' });
put({ type: 'stele', gx: 24, gy: 30, w: 1, h: 2 });
put({ type: 'stall', gx: 26, gy: 34, w: 2, h: 2, facing: 'sw' });
put({ type: 'lantern_post', gx: 24, gy: 12 });
put({ type: 'lantern_post', gx: 28, gy: 26 });

// 段2：溪涧木桥 / 岔口石堆 / 山魈巢穴入口 / 经幡
put({ type: 'bridge', gx: 36, gy: 62, w: 3, h: 5 }, { allowWater: true, allowPath: true, allowStone: true });
put({ type: 'house', gx: 72, gy: 70, w: 4, h: 4, facing: 'se', variant: 'carved' });
put({ type: 'stele', gx: 46, gy: 76, w: 1, h: 2 });
put({ type: 'lantern_post', gx: 48, gy: 60 });
put({ type: 'lantern_post', gx: 50, gy: 96 });
for (const [x, y] of [[40, 72], [42, 74], [44, 72], [46, 78]]) put({ type: 'rock', gx: x, gy: y }, { allowPath: true });

// 段3：崖道石阶 / 悬桥 / 铁链护栏 / 经幡 / 崖口牌坊
// 栈道位置避开东侧纵向水带 gx88..96
const LANE = [68, 74, 80, 98, 104];
for (const gx of LANE) {
  put({ type: 'stairs', gx, gy: 100, w: 3, h: 1 }, { allowStone: true, allowPath: true });
  put({ type: 'fence', gx, gy: 104, w: 2, h: 1 }, { allowStone: true });
}
put({ type: 'bridge', gx: 92, gy: 104, w: 3, h: 5 }, { allowWater: true, allowStone: true });
put({ type: 'paifang', gx: 110, gy: 112, w: 3, h: 3, facing: 'se' }, { allowStone: true });
put({ type: 'lantern_post', gx: 100, gy: 96 }, { allowStone: true });
put({ type: 'lantern_post', gx: 108, gy: 100 }, { allowStone: true });

// 松林：按三段密度散布（段1/2 密、段3 稀），不占山径/水面/石台
for (let gy = 6; gy < N - 6; gy++) {
  for (let gx = 6; gx < N - 6; gx++) {
    const s = gx + gy;
    // 与云京同量级（云京 559 棵）：段1/2 松林密、段3 崖道稀疏
    const density = s < 85 ? 0.085 : s < 170 ? 0.06 : 0.025;
    if (rnd() > density) continue;
    put({
      type: 'tree', variant: 'pine', gx, gy,
      tint: rnd() < 0.16 ? WARM : COOL,
    });
  }
}

// 碎石：沿山径两侧稀疏点缀
for (let i = 0; i < 110; i++) {
  const gx = 6 + Math.floor(rnd() * (N - 12));
  const gy = 6 + Math.floor(rnd() * (N - 12));
  put({ type: 'rock', gx, gy, tint: rnd() < 0.2 ? WARM : undefined });
}

const layout = {
  grid: GRID,
  rules: { streetWidth: 10, houseClearanceFromStreetCenter: 5, roofLift: 0 },
  items: [...ground, ...items],
};
writeFileSync(OUT, `${JSON.stringify(layout, null, 2)}\n`);

const count = (t) => items.filter((i) => i.type === t).length;
console.log(JSON.stringify({
  total: layout.items.length,
  ground: ground.length,
  props: items.length,
  counts: {
    pine: count('tree'), rock: count('rock'), bridge: count('bridge'),
    stairs: count('stairs'), fence: count('fence'), lantern: count('lantern_post'),
    house: count('house'), paifang: count('paifang'), stele: count('stele'), stall: count('stall'),
  },
  anchors: {
    entry: cellToWorld(12, 8),
    fork: cellToWorld(44, 74),
    cliffExit: cellToWorld(114, 114),
    spawns: [cellToWorld(20, 30), cellToWorld(40, 56), cellToWorld(40, 84), cellToWorld(74, 96)],
  },
}, null, 2));
