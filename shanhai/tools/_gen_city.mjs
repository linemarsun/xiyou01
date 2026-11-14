// 云京 128×128 城制布局生成器（v2 · 参考图风格重排）· 唯一真源
//
// 与 v1 的区别：朱红城墙制式下的「窄券洞四门 + 四角角楼」、居中 40×40 完整宫城、
// 棋盘街巷 + 高密民居、移除环城护城河、城外草地/两片蜿蜒河湾/针叶林。
// 鼓楼删除，中心广场清空重建；玩法坐标 (62,3) / (16,32) 保持可走且不动。
//
// 运行：node tools/_gen_city.mjs   → 覆写 public/assets/art/iso/taoyuan.json
// 注意：格网与 rules 保持不变；world.ts 的出口/落点坐标不在此文件里，不要联动修改。
import { writeFileSync } from 'node:fs';

const OUT = new URL('../public/assets/art/iso/taoyuan.json', import.meta.url);
const N = 128;
const GRID = { cols: N, rows: N, tileW: 64, tileH: 32, ox: 4096, oy: 16 };
const RULES = { streetWidth: 10, houseClearanceFromStreetCenter: 5, roofLift: 0 };

// 参考图民居为深灰瓦 + 红木构：贴图本身已是深灰，tint 只做极轻的暖/冷差，
// 不再用旧版的靛青乘法染色（0xdde6ff 会把瓦压成蓝灰）。
const COOL = 0xffffff;
const WARM = 0xffead6;
let tintI = 0;
const tintPick = () => (tintI++ % 7 === 0 ? WARM : COOL);

const ground = [];                 // 地面层矩形
const items = [];                  // 构件层
const placed = new Set();          // 构件已占格
const stoneCells = new Set();
const dirtCells = new Set();
const waterCells = new Set();
const marbleCells = new Set();
const reserved = new Set();        // 玩法点位：禁止放任何阻挡构件
const key = (x, y) => `${x},${y}`;

const groundRect = (x, y, w, h, type) => {
  if (x < 0 || y < 0 || x + w > N || y + h > N) throw new Error(`ground out of bounds ${x},${y},${w},${h}`);
  ground.push({ type, gx: x, gy: y, w, h });
};
const fillCells = (set, x, y, w, h) => {
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) set.add(key(x + dx, y + dy));
};
const STONE = (x, y, w, h) => { groundRect(x, y, w, h, 'ground_stone'); fillCells(stoneCells, x, y, w, h); };
const DIRT = (x, y, w, h) => { groundRect(x, y, w, h, 'ground_dirt'); fillCells(dirtCells, x, y, w, h); };
const WATER = (x, y, w, h) => { groundRect(x, y, w, h, 'ground_water'); fillCells(waterCells, x, y, w, h); };
const MARBLE = (x, y, w, h) => { groundRect(x, y, w, h, 'ground_marble'); fillCells(marbleCells, x, y, w, h); };

const markReserved = (x, y, r = 1) => {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) reserved.add(key(x + dx, y + dy));
};
// 北门出口路牌 (62,3) 与 A* 起点 (16,32)：周围保持空旷可走
markReserved(62, 3, 2);
markReserved(16, 32, 2);

// ---------------------------------------------------------------- 地面
groundRect(0, 0, N, N, 'ground_grass');

// 城外：右上 / 左下两片蜿蜒河湾（参考图城外水系，取代原环城护城河）
const RIVER = [
  // 右上：贴东侧外缘的竖河 + 北缘横河湾，阶梯状蜿蜒
  [100, 0, 28, 3], [110, 3, 18, 4], [118, 7, 10, 6], [123, 13, 5, 10], [124, 23, 4, 10],
  // 左下：贴南侧外缘的横河 + 西缘竖河湾
  [0, 100, 4, 28], [4, 110, 4, 18], [8, 118, 6, 10], [14, 123, 10, 5], [24, 124, 12, 4],
];
for (const [x, y, w, h] of RIVER) WATER(x, y, w, h);

// 城外土路：四门外的通路 + 沿边蜿蜒小径（不覆盖水体）
for (const [x, y, w, h] of [
  [60, 0, 4, 5], [0, 60, 5, 4], [123, 60, 5, 4], [60, 123, 4, 5],
  [20, 1, 4, 3], [40, 2, 5, 3], [80, 1, 4, 3], [1, 24, 3, 5], [2, 80, 3, 5],
  [36, 125, 6, 3], [60, 125, 6, 3], [125, 40, 3, 6], [126, 80, 2, 6],
]) {
  // 跳过与水重叠的格子，避免把水改成不可走又不可读的补丁
  let ok = true;
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) if (waterCells.has(key(x + dx, y + dy))) ok = false;
  if (ok) DIRT(x, y, w, h);
}

// 城内：环宫城环路 + 四条门内主街 + 棋盘巷道（宫城范围内不铺巷道）
// 环路宽 6 格，围住 40×40 宫城（x44..83 / y44..83）
STONE(38, 38, 52, 6);   // 北环 x38..89 / y38..43
STONE(38, 84, 52, 6);   // 南环 y84..89
STONE(38, 38, 6, 52);   // 西环 x38..43
STONE(84, 38, 6, 52);   // 东环 x84..89
// 四门内主街（6 格宽），从城墙门洞直通环路
STONE(61, 5, 6, 38);    // 北门 → 北环
STONE(61, 85, 6, 38);   // 南环 → 南门
STONE(5, 61, 38, 6);    // 西门 → 西环
STONE(85, 61, 38, 6);   // 东环 → 东门
// 棋盘巷道：4 格宽，分象限贯通，避开宫城
const LANES = [16, 30, 54, 70, 94, 108];
for (const x of LANES) {
  STONE(x, 7, 4, 35);    // 北半 y7..41
  STONE(x, 86, 4, 35);   // 南半 y86..120
}
for (const y of LANES) {
  STONE(7, y, 35, 4);    // 西半 x7..41
  STONE(86, y, 35, 4);   // 东半 x86..120
}
// 宫城内院：汉白玉地面（x44..83，直抵环路内缘，不留裸草缝）
MARBLE(44, 44, 40, 40);
// 宫内曲水（参考图宫城内的水池/水渠；高度对齐 2×2 分块，避免边缘块被汉白玉吞行）
WATER(50, 64, 10, 4);
WATER(68, 66, 8, 4);
// 宫门前月台（8×4 对齐 2×2 分块网格：块内 stone 与 marble 打平时按先入序会输，半块会被吞）
STONE(60, 82, 8, 4);

// ---------------------------------------------------------------- 构件
const boundsOk = (x, y, w, h, interior = true) => interior
  ? x >= 7 && y >= 7 && x + w <= 121 && y + h <= 121
  : x >= 0 && y >= 0 && x + w <= N && y + h <= N;

const cellBlocked = (x, y, w, h, opt) => {
  const { allowStone = false, allowWater = false, clearance = 0, interior = true } = opt;
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
    const gx = x + dx, gy = y + dy, k = key(gx, gy);
    if (placed.has(k) || reserved.has(k)) return true;
    if (!allowWater && (waterCells.has(k) || marbleCells.has(k))) return true;
    if (!allowStone && stoneCells.has(k)) return true;
    if (clearance > 0 && !interior) continue;
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
  if (!boundsOk(item.gx, item.gy, w, h, interior)) return false;
  if (cellBlocked(item.gx, item.gy, w, h, { ...opt, interior })) return false;
  fillCells(placed, item.gx, item.gy, w, h);
  items.push(item);
  return true;
};
// 城墙/宫墙是「制式铺排」，允许压地面矩形，不检查碰撞
const rigid = (type, gx, gy, w, h, extra = {}) => {
  items.push({ type, gx, gy, w, h, ...extra });
  fillCells(placed, gx, gy, w, h);
};

// ---------------------------------------------------------------- 城墙与四门
const wallSeg = (x, y, w, h, type) => rigid(type, x, y, w, h);
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
// 四门为参考图制式城台门楼（gate_keep 12×6）：城台垛口顶高出城墙垛口 ~26px，
// 城墙在 x58..69 / y58..69 断开（豁口 12 格），gate_keep 券洞通道 6 格宽与主街同宽（中列/中行 ±3）
wallRun(7, 5, 51, 2);       // 北墙西段 x7..57
wallRun(70, 5, 51, 2);      // 北墙东段 x70..120（城台开口 x58..69）
wallRun(7, 121, 51, 2);     // 南墙西段
wallRun(70, 121, 51, 2);    // 南墙东段
wallRun(5, 7, 2, 51);       // 西墙北段 y7..57
wallRun(5, 70, 2, 51);      // 西墙南段 y70..120（城台开口 y58..69）
wallRun(121, 7, 2, 51);     // 东墙北段
wallRun(121, 70, 2, 51);    // 东墙南段
// 四角：朱红角台 + 内侧朱墙黄瓦角楼（参考图四角楼）
for (const [x, y] of [[5, 5], [121, 5], [5, 121], [121, 121]]) {
  rigid('city_wall_corner', x, y, 2, 2);
}
for (const [x, y] of [[7, 7], [119, 7], [7, 119], [119, 119]]) {
  rigid('palace_corner', x, y, 2, 2);
}
// 四门城台门楼（灰白石城台 + 朱红券洞 + 黄瓦重檐门楼，足迹 12×6 / 6×12，与主街同轴居中）
rigid('gate_keep', 58, 5, 12, 6, { facing: 'sw' });
rigid('gate_keep', 58, 121, 12, 6, { facing: 'sw' });
rigid('gate_keep', 5, 58, 6, 12, { facing: 'se' });
rigid('gate_keep', 121, 58, 6, 12, { facing: 'se' });

// ---------------------------------------------------------------- 宫城 40×40（居中，用户反馈增大避免堆叠）
// 工笔围墙：朱红宫墙 + 金琉璃帽（AI 重绘，palace_wall_u6/u2 及 v 系镜像），四角工笔角楼、南面工笔宫门
for (const [x, y] of [[44, 44], [82, 44], [44, 82], [82, 82]]) rigid('palace_corner', x, y, 2, 2);
// 北墙 y44 / x46..81（36 格 = 6×u6）
for (const x of [46, 52, 58, 64, 70, 76]) rigid('palace_wall_u6', x, 44, 6, 2);
// 南墙 y82：宫门占 x62..65，两侧各 16 格 = 2×u6 + 2×u2
for (const x of [46, 52, 66, 72]) rigid('palace_wall_u6', x, 82, 6, 2);
for (const x of [58, 60, 78, 80]) rigid('palace_wall_u2', x, 82, 2, 2);
rigid('palace_gate', 62, 82, 4, 2, { facing: 'sw' });
// 东西墙 x44 / x82，y46..81（各 36 格 = 6×v6）
for (const y of [46, 52, 58, 64, 70, 76]) {
  rigid('palace_wall_v6', 44, y, 2, 6);
  rigid('palace_wall_v6', 82, y, 2, 6);
}
// 内院：主殿居中偏北、东西配殿、白塔在东南、曲水石桥
rigid('palace_hall', 59, 48, 10, 10);  // AI 宏伟版：足迹 10×10，内院北部居中（檐出挑 1.8 格仍留 4 格间距）
// 配殿：40×40 后间距充裕，东西配殿对称落在主殿两侧（50,50 / 74,50），
// 精灵横向范围（~49.5..53.5 / 73.5..77.5）与主殿檐体（~57.1..69.9）互不相交
rigid('palace_hall_s', 50, 50, 4, 4);
rigid('palace_hall_s', 74, 50, 4, 4);
rigid('pagoda', 46, 68, 3, 3);   // 塔 764px 高（≈24 格投影），须与主殿/配殿/宫门横向精灵范围全部错开 → 西腹地 (46,68)
rigid('bridge', 54, 63, 3, 5);
rigid('bridge', 70, 66, 3, 5);
// 宫内行列树 / 灯（避开主殿与水面）
for (const [x, y] of [
  [48, 58], [56, 58], [74, 56], [77, 60], [50, 72], [58, 74], [68, 74], [76, 74],
]) put({ type: 'tree', gx: x, gy: y, variant: 'pine' }, { interior: false, allowWater: true });
for (const [x, y] of [[60, 60], [66, 60], [60, 70], [66, 70]]) {
  put({ type: 'lantern_post', gx: x, gy: y }, { interior: false, allowWater: true });
}
for (const [x, y] of [[58, 76], [68, 76]]) {
  put({ type: 'incense', gx: x, gy: y }, { interior: false, allowWater: true });
}

// 宫前坊：放在街坊空地，不压石板路（旧版压在十字主街轴线上会挡住通路）
for (const [x, y] of [[50, 20], [74, 20], [20, 74], [104, 74]]) {
  put({ type: 'paifang', gx: x, gy: y, w: 3, h: 3, facing: 'sw' });
}
// 井 / 碑：固定坐标地标，先于民居撒点落位（8×8 合院体量大，后放会被占位）
for (const [x, y] of [[20, 20], [104, 20], [20, 104], [104, 104], [46, 20], [80, 104]]) {
  put({ type: 'well', gx: x, gy: y });
}
for (const [x, y] of [[36, 20], [92, 20], [36, 108], [92, 108], [20, 62], [108, 62]]) {
  put({ type: 'stele', gx: x, gy: y, w: 1, h: 2 });
}

// ---------------------------------------------------------------- 民居（一进四合院，AI 合院贴图）
// 合院体量 9×9（菱形 576px，画布 581×520，×1.21 加大版）：旧 4×4/5 步长不再适用。
// 细步长全枚举候选点 + 哈希序抢占（put 自动避让道路/水面/宫城/玩法点位与已占格），
// 每个街坊块落 1 座合院，数量约为旧版 1/4（体量 5 倍）。
// 只做 se/sw 两向（院门朝镜头一侧），sw 为 se 的水平镜像；无 variant（直取 house_4x4_se/_sw.png）。
const candidates = [];
for (let y = 8; y + 9 <= 121; y += 2) {
  for (let x = 8; x + 9 <= 121; x += 2) {
    candidates.push({ x, y, h: ((x * 73 + y * 151) % 1009) });
  }
}
candidates.sort((a, b) => a.h - b.h);
let houseCount = 0;
for (const { x, y } of candidates) {
  if (houseCount >= 80) break;
  // 宫城与环路范围不撒民居（x38..89 / y38..89）
  if (x >= 38 && x <= 89 && y >= 38 && y <= 89) continue;
  const ok = put({
    type: 'house', gx: x, gy: y, w: 9, h: 9,
    facing: ((x + y) >> 1) % 2 ? 'sw' : 'se',   // 枚举步长为 2，x+y 恒偶 → 取半再取奇偶才两向都有
    tint: houseCount % 7 === 3 ? WARM : COOL,   // 按成功落位计数取暖色，约 14%（枚举有失败尝试，不能用递增序号）
  });
  if (ok) houseCount++;
}

// ---------------------------------------------------------------- 绿化与市井点缀
// 旧平涂摊棚/货箱已清理（用户反馈风格不统一）：街巷点缀保留工笔灯笼/山石/井/碑
// 灯笼（宫城外围四向主轴；井/碑已前移至民居撒点前）
let lanternCount = 0;
for (let y = 9; y <= 118; y += 11) {
  for (let x = 9; x <= 118; x += 11) { if (put({ type: 'lantern_post', gx: x, gy: y })) lanternCount++; }
}
// 行道树 / 街坊绿化：针叶为主（参考图城内外成片针叶林）。
// 用户反馈太密：步长 3+1/3 过滤 → 步长 6 全枚举，密度约减半；宽冠树冠交叠留足空隙。
let innerTrees = 0;
for (let y = 9; y <= 119; y += 6) {
  for (let x = 9; x <= 119; x += 6) {
    if (x >= 38 && x <= 89 && y >= 38 && y <= 89) continue;
    if (put({ type: 'tree', gx: x, gy: y, variant: (x + y) % 5 === 0 ? 'leaf' : 'pine' })) innerTrees++;
  }
}
// 假山点缀
let rockCount = 0;
for (let y = 12; y <= 116; y += 13) {
  for (let x = 12; x <= 116; x += 13) {
    if (put({ type: 'rock', gx: x, gy: y })) rockCount++;
  }
}

// ---------------------------------------------------------------- 城外针叶林
// 5 格外缘带（避开水体、土路、四门通路与玩法点位）
let outerTrees = 0;
for (let i = 1; i < N; i += 2) {
  for (const [x, y] of [[i, 1], [i, 3], [i, 125], [i, 127], [1, i], [3, i], [125, i], [127, i]]) {
    if (x < 0 || y < 0 || x >= N || y >= N) continue;
    if ((x + y) % 4 !== 0) continue;
    if (put({ type: 'tree', gx: x, gy: y, variant: 'pine' }, { interior: false })) outerTrees++;
  }
}

// ---------------------------------------------------------------- 输出
const layout = { grid: GRID, rules: RULES, items: [...ground, ...items] };
writeFileSync(OUT, `${JSON.stringify(layout, null, 2)}\n`);

const count = (t) => items.filter((i) => i.type === t).length;
const all = layout.items.filter((i) => !['ground_grass', 'ground_stone', 'ground_dirt', 'ground_water', 'ground_marble'].includes(i.type));
console.log(JSON.stringify({
  total: layout.items.length, ground: ground.length, props: items.length,
  houses: houseCount, lanterns: lanternCount,
  innerTrees, outerTrees, rocks: rockCount,
  bellTower: count('bell_tower'),
  gates: count('gate_keep'), wideGate: count('city_gate_wide') + count('city_gate_wide_v') + count('city_gate_tower'),
  wallCorner: count('city_wall_corner'), cornerTower: count('palace_corner'),
  palaceWalls: count('palace_wall_u6') + count('palace_wall_u2') + count('palace_wall_v6') + count('palace_wall_v2'),
  bridges: count('bridge'), paifang: count('paifang'),
  waterRects: ground.filter((g) => g.type === 'ground_water').length,
  warmTint: all.filter((i) => i.tint === WARM).length,
  coolTint: all.filter((i) => i.tint === COOL).length,
}, null, 2));
