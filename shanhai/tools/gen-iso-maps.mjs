/**
 * 等距场景布局生成器（模块 12：一景一制）。
 *
 * 与模块 11 的「四张共用 128×128 十字城」不同，本版每张地图有：
 *  - 独立的 cols/rows 格网 ⇒ 菱形轮廓的胖瘦与歪斜方向不同、世界尺寸也不同；
 *  - 独立的地形轮廓与路网骨架（盘山之字 / 斜河双堤 / 环形洞厅 / 黄泉直道）；
 *  - 独立的地表铺装、植被、地标组合，不再共用中心券门与十字广场；
 *  - 全部出入口（路牌与跨图落点）贴在格网边界带上。
 *
 * 输出 public/assets/art/iso/<region>.json，供 world-renderer 合成等距地图。
 * 约定：layout.grid 与 src/core/world.ts 的 ISO_GRIDS 逐字段一致；
 *      layout.anchors 与 WORLD_MAPS 的格坐标逐条一致（npm test 校验）。
 *
 * 运行：npm run maps   （确定性、幂等；生成末尾自带 BFS 连通性自检）
 */
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT_DIR = new URL('../public/assets/art/iso/', import.meta.url);
const TILE_W = 64;
const TILE_H = 32;

/** 由格网推导菱形世界：cell(0,0) 上顶点贴 (0,0)，四角恰好落在 w×h 内 */
function makeGrid(cols, rows) {
  return {
    cols, rows, tileW: TILE_W, tileH: TILE_H,
    ox: rows * TILE_W / 2, oy: TILE_H / 2,
    width: (cols + rows) * TILE_W / 2,
    height: (cols + rows) * TILE_H / 2,
  };
}

/** 确定性随机：同一主题每次生成完全一致，方便回归与 diff */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 每图的完整定义。anchors 全部落在边界带（距边 ≤1 格）：
 *   gx ∈ {1, cols-2} 或 gy ∈ {1, rows-2}。
 * 拓扑（成对的路牌互为对方落点，玩家一进图就站在回程路牌上）：
 *   云京(16,1) ⇄ 山道(32,1)
 *   山道(1,62) ⇄ 忘川(11,1)      山道(126,62) ⇄ 洞天(1,52)
 *   忘川(73,126) ⇄ 地府(40,1)     地府(40,110) → 云京(16,1)（单向还阳）
 */
const THEMES = [
  {
    id: 'wild_heifeng', name: '青崖山道', seed: 20261109,
    cols: 128, rows: 96,
    base: 'ground_grass', signature: 'switchback-ridge',
    tagline: '盘山之字栈道 · 三溪石桥 · 林海',
    treeVariant: 'leaf', rockVariant: 'moss',
    decoDensity: 0.050, lampStep: 12,
    deco: [['tree', 0.64], ['rock', 0.30], ['lantern_post', 0.03], ['crate', 0.015], ['stele', 0.015]],
    anchors: {
      spawns: [
        { gx: 32, gy: 12, group: ['yelang'] },
        { gx: 32, gy: 22, group: ['yelang', 'yelang'] },
        { gx: 72, gy: 14, group: ['yelang'] },
        { gx: 58, gy: 44, group: ['heixiong'] },
        { gx: 40, gy: 64, group: ['yelang'] },
        { gx: 22, gy: 64, group: ['yelang', 'yelang'] },
        { gx: 104, gy: 52, group: ['yelang'] },
        { gx: 116, gy: 62, group: ['heixiong'] },
      ],
      exits: [
        { gx: 32, gy: 1, to: 'taoyuan', toGx: 16, toGy: 1, label: '云京' },
        { gx: 1, gy: 62, to: 'wild_luanzang', toGx: 11, toGy: 1, label: '渡忘川' },
        { gx: 126, gy: 62, to: 'wild_shanxiao', toGx: 1, toGy: 52, label: '玲珑洞天' },
      ],
    },
    build(c) {
      const { waterLine, line, rect, markR, prop, placeNear } = c;
      // 三条蜿蜒溪涧（先画水，路后画 → 路跨水处自然成堤）
      waterLine([[24, 0], [30, 30], [20, 62], [26, 95]], 4);
      waterLine([[62, 0], [68, 34], [58, 66], [64, 95]], 4);
      waterLine([[100, 0], [94, 28], [104, 60], [98, 95]], 4);

      // 「之」字盘山主干：北口 → 枢纽 → 西口 / 东口，三个端点分别贴三条边界
      line([[32, 1], [32, 22], [62, 22], [62, 46]], 7, 'ground_dirt');
      line([[62, 46], [62, 64], [22, 64], [1, 62]], 7, 'ground_dirt');
      line([[62, 46], [104, 46], [104, 62], [126, 62]], 7, 'ground_dirt');
      // 环山小径：把北段与东段接成回路，不必原路折返
      line([[32, 14], [104, 14], [104, 46]], 4, 'ground_dirt');
      // 山腰歇脚坪（不是中心广场）
      rect(56, 40, 14, 14, (x, y) => markR(x, y, 'ground_stone'));

      // 溪桥：桥面全格可走；落点选在溪涧上、避开玩法锚点
      for (const [gx, gy] of [[22, 58], [60, 32], [98, 78], [26, 84]]) {
        prop('bridge', gx, gy, 3, 5);
      }
      // 三座指路牌坊分立三个山口，牌坊中列可穿行
      for (const [gx, gy] of [[36, 6], [7, 68], [118, 68]]) placeNear('paifang', gx, gy, 3, 3);
      // 山神庙 + 山间木屋（远离主路，不挡行走）
      placeNear('hall', 78, 74, 6, 6);
      placeNear('house', 44, 32, 4, 4, { variant: 'lattice', facing: 'sw' });
      placeNear('house', 84, 28, 4, 4, { variant: 'wood', facing: 'se' });
      placeNear('stall', 72, 36, 2, 2, { variant: 'silk' });
      for (const [type, gx, gy] of [['well', 52, 52], ['incense', 46, 76], ['stele', 88, 80]]) {
        placeNear(type, gx, gy, 1, type === 'stele' ? 2 : 1);
      }
    },
  },

  {
    id: 'wild_luanzang', name: '渡忘川', seed: 20261110,
    cols: 96, rows: 128,
    base: 'ground_dirt', signature: 'diagonal-river',
    tagline: '忘川斜贯 · 两岸石堤 · 六渡石桥',
    treeVariant: 'dead', rockVariant: 'dark', bridgeVariant: 'dark',
    decoDensity: 0.032, lampStep: 14,
    deco: [['tree', 0.44], ['rock', 0.38], ['fence', 0.10], ['lantern_post', 0.05], ['stele', 0.03]],
    anchors: {
      spawns: [
        { gx: 17, gy: 20, group: ['kulou'] },
        { gx: 53, gy: 40, group: ['kulou', 'kulou'] },
        { gx: 48, gy: 56, group: ['zhizhu'] },
        { gx: 45, gy: 76, group: ['kulou'] },
        { gx: 81, gy: 96, group: ['zhizhu', 'kulou'] },
        { gx: 65, gy: 116, group: ['zhizhu'] },
      ],
      exits: [
        { gx: 11, gy: 1, to: 'wild_heifeng', toGx: 1, toGy: 62, label: '青崖山道' },
        { gx: 73, gy: 126, to: 'difu', toGx: 40, toGy: 1, label: '幽都 · 忘川渡口' },
      ],
    },
    build(c) {
      const { setT, rect, markR, prop, tryProp, placeNear, rows } = c;
      const riverX = (gy) => 20 + gy * 0.5;
      // 斜向大河（宽 9 格），从西北角斜穿到东南，把地图切成两岸
      for (let gy = 0; gy < rows; gy++) {
        const cx = Math.round(riverX(gy));
        rect(cx - 4, gy, 9, 1, (x, y) => setT(x, y, 'ground_water'));
      }
      // 两岸平行石堤（宽 5），南北纵贯；后画 → 覆盖河面处成渡口
      for (let gy = 0; gy < rows; gy++) {
        for (const off of [-13, 13]) {
          rect(Math.round(riverX(gy) + off) - 2, gy, 5, 1, (x, y) => markR(x, y, 'ground_stone'));
        }
      }
      // 六座跨河石桥：横向铺路接两岸 + 桥面构件
      for (const gy of [16, 36, 56, 76, 96, 116]) {
        const cx = Math.round(riverX(gy));
        rect(cx - 14, gy - 2, 29, 5, (x, y) => markR(x, y, 'ground_stone'));
        prop('bridge', cx - 1, gy - 2, 3, 5, { variant: 'dark' });
      }
      // 北渡口 / 南渡口广场，锚点落在广场内且贴边界
      rect(6, 0, 12, 8, (x, y) => markR(x, y, 'ground_stone'));
      rect(68, 120, 12, 8, (x, y) => markR(x, y, 'ground_stone'));
      // 望乡台与两岸渡亭
      placeNear('hall', 66, 24, 6, 6);
      placeNear('house', 12, 44, 4, 4, { variant: 'lattice', facing: 'se' });
      placeNear('house', 76, 88, 4, 4, { variant: 'carved', facing: 'sw' });
      placeNear('paifang', 6, 12, 3, 3);
      for (const [type, gx, gy] of [['stele', 10, 28], ['incense', 13, 64], ['well', 9, 92], ['crate', 15, 108]]) {
        placeNear(type, gx, gy, 1, type === 'stele' ? 2 : 1);
      }
      // 河岸芦苇（fence 2×1），只落在非路基地上
      for (let gy = 8; gy < rows - 8; gy += 7) {
        const cx = Math.round(riverX(gy));
        tryProp('fence', cx - 9, gy, 2, 1);
        tryProp('fence', cx + 7, gy, 2, 1);
      }
    },
  },

  {
    id: 'wild_shanxiao', name: '玲珑洞天', seed: 20261111,
    cols: 104, rows: 104,
    base: 'ground_dirt', signature: 'ring-cavern',
    tagline: '青苔环廊 · 青石圆厅 · 四条放射石阶 · 晶壁围合',
    treeVariant: 'pine', rockVariant: 'crystal',
    decoDensity: 0.105, lampStep: 0,
    deco: [['rock', 0.90], ['tree', 0.06], ['lantern_post', 0.03], ['crate', 0.01]],
    anchors: {
      spawns: [
        { gx: 52, gy: 20, group: ['shanxiao'] },
        { gx: 52, gy: 38, group: ['shanxiao', 'shanxiao'] },
        { gx: 52, gy: 86, group: ['shanxiao'] },
        { gx: 52, gy: 92, group: ['shanxiaowang'] },
        { gx: 84, gy: 52, group: ['shanxiao', 'shanxiao'] },
        { gx: 20, gy: 52, group: ['shanxiao'] },
      ],
      exits: [
        { gx: 1, gy: 52, to: 'wild_heifeng', toGx: 126, toGy: 62, label: '青崖山道' },
      ],
    },
    build(c) {
      const { markR, line, prop, placeNear, cols, rows, setT } = c;
      const cx = 52, cy = 52;
      // 中央圆形洞厅 + 一圈环形回廊（不是方形十字广场）
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const d = Math.hypot(x - cx, y - cy);
          if (d <= 16) markR(x, y, 'ground_stone');          // 青石圆厅
          else if (d >= 22 && d <= 27) markR(x, y, 'ground_grass'); // 青苔环廊（与土色洞底、石厅都不同色）
        }
      }
      // 四条青石放射阶道通往四条边界（与土色洞底区分，玩家一眼能看出路）；
      // 只有西口是路牌，其余三口为观景死路
      line([[cx, 1], [cx, cy]], 5, 'ground_stone');
      line([[cx, cy], [cx, rows - 2]], 5, 'ground_stone');
      line([[1, cy], [cx, cy]], 5, 'ground_stone');
      line([[cx, cy], [cols - 2, cy]], 5, 'ground_stone');
      for (const [gx, gy] of [[52, 4], [52, 101], [98, 52], [4, 52]]) {
        prop('stairs', gx, gy, 3, 1);
      }
      // 洞壁：四段真实城墙模块，围出「山壁夹道」
      for (const w of [
        { type: 'city_wall_u6', gx: 16, gy: 16, w: 6, h: 2 },
        { type: 'city_wall_v6', gx: 16, gy: 22, w: 2, h: 6 },
        { type: 'city_wall_u6', gx: 82, gy: 16, w: 6, h: 2 },
        { type: 'city_wall_v6', gx: 86, gy: 22, w: 2, h: 6 },
        { type: 'city_wall_u6', gx: 16, gy: 86, w: 6, h: 2 },
        { type: 'city_wall_v6', gx: 16, gy: 80, w: 2, h: 6 },
        { type: 'city_wall_u6', gx: 82, gy: 86, w: 6, h: 2 },
        { type: 'city_wall_v6', gx: 86, gy: 80, w: 2, h: 6 },
      ]) placeNear(w.type, w.gx, w.gy, w.w, w.h);
      // 环内晶柱阵（八方位），洞厅中央留空给玩家与头目
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        placeNear('rock', Math.round(cx + Math.cos(a) * 12), Math.round(cy + Math.sin(a) * 12), 1, 1, { variant: 'crystal' });
      }
      // 洞府屋舍依崖而建 + 洞主祭台
      placeNear('house', 34, 34, 4, 4, { variant: 'carved', facing: 'sw' });
      placeNear('house', 66, 66, 4, 4, { variant: 'lattice', facing: 'se' });
      placeNear('hall', 64, 34, 6, 6);
      for (const [type, gx, gy] of [['incense', 52, 52], ['stele', 46, 58], ['well', 58, 46], ['crate', 40, 62]]) {
        placeNear(type, gx, gy, 1, type === 'stele' ? 2 : 1);
      }
      // 洞顶暗河（一小段，视觉上区别于方整岩地）
      for (let gy = 6; gy < 20; gy++) for (let gx = 70; gx < 76; gx++) setT(gx, gy, 'ground_water');
    },
  },

  {
    id: 'difu', name: '地府 · 忘川渡口', seed: 20261112,
    cols: 80, rows: 112,
    base: 'ground_dirt', signature: 'straight-road',
    tagline: '黄泉直道 · 忘川横河 · 奈何桥 · 碑阵引魂灯',
    treeVariant: 'dead', rockVariant: 'dark', bridgeVariant: 'dark',
    decoDensity: 0.018, lampStep: 0,
    deco: [['rock', 0.56], ['fence', 0.22], ['tree', 0.14], ['stele', 0.08]],
    anchors: {
      spawns: [],
      exits: [
        { gx: 40, gy: 1, to: 'wild_luanzang', toGx: 73, toGy: 126, label: '渡忘川' },
        { gx: 40, gy: 110, to: 'taoyuan', toGx: 16, toGy: 1, label: '还阳 · 云京' },
      ],
      npc: { gx: 40, gy: 72, name: '孟婆' },
    },
    build(c) {
      const { setT, line, rect, markR, prop, tryProp, placeNear, cols } = c;
      // 忘川横河：把幽都切成南北两半
      rect(0, 54, cols, 7, (x, y) => setT(x, y, 'ground_water'));
      // 一条笔直黄泉道贯穿南北（唯一主路，无十字、无广场）
      line([[40, 1], [40, 110]], 7, 'ground_stone');
      // 奈何桥：桥头平台 + 石桥
      rect(34, 52, 13, 11, (x, y) => markR(x, y, 'ground_stone'));
      prop('bridge', 38, 53, 3, 5, { variant: 'dark' });
      // 判官殿（桥南）+ 孟婆茶寮（孟婆身旁但有空隙）
      placeNear('hall', 54, 76, 6, 6);
      placeNear('house', 24, 68, 4, 4, { variant: 'carved', facing: 'se' });
      placeNear('paifang', 46, 68, 3, 3);
      // 碑阵：主街两侧每隔 8 格一碑，形成引导纵深
      for (let gy = 10; gy <= 104; gy += 8) {
        for (const gx of [33, 47]) tryProp('stele', gx, gy, 1, 2);
      }
      // 引魂灯：主街两侧每隔 6 格一对
      for (let gy = 6; gy <= 108; gy += 6) {
        for (const gx of [35, 45]) tryProp('lantern_post', gx, gy);
      }
      for (const [type, gx, gy] of [['incense', 36, 72], ['well', 44, 72], ['crate', 30, 90]]) {
        placeNear(type, gx, gy);
      }
    },
  },
];

function buildLayout(theme) {
  const grid = makeGrid(theme.cols, theme.rows);
  const { cols, rows } = grid;
  const terrain = new Array(cols * rows).fill(theme.base);
  const road = new Uint8Array(cols * rows);
  const items = [];
  const occupied = new Set();
  const passable = new Set();
  const reserved = new Set();
  const propCount = {};
  const rnd = mulberry32(theme.seed);
  const key = (x, y) => `${x},${y}`;
  const idx = (x, y) => y * cols + x;
  const inside = (x, y) => x >= 0 && y >= 0 && x < cols && y < rows;
  const setT = (x, y, t) => { if (inside(x, y)) terrain[idx(x, y)] = t; };
  const markR = (x, y, t) => { if (!inside(x, y)) return; terrain[idx(x, y)] = t; road[idx(x, y)] = 1; };
  const rect = (x, y, w, h, fn) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (inside(i, j)) fn(i, j);
  };
  /** 折线刷成连续路面：逐格插值，每步铺 width×width 的方刷（拐角自然变宽） */
  const line = (pts, width, type) => {
    const half = Math.floor(width / 2);
    for (let s = 1; s < pts.length; s++) {
      const [x0, y0] = pts[s - 1], [x1, y1] = pts[s];
      const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
      for (let k = 0; k <= steps; k++) {
        const x = Math.round(x0 + (x1 - x0) * k / steps);
        const y = Math.round(y0 + (y1 - y0) * k / steps);
        rect(x - half, y - half, width, width, (i, j) => markR(i, j, type));
      }
    }
  };
  const waterLine = (pts, width) => {
    const half = Math.floor(width / 2);
    for (let s = 1; s < pts.length; s++) {
      const [x0, y0] = pts[s - 1], [x1, y1] = pts[s];
      const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
      for (let k = 0; k <= steps; k++) {
        const x = Math.round(x0 + (x1 - x0) * k / steps);
        const y = Math.round(y0 + (y1 - y0) * k / steps);
        rect(x - half, y - half, width, width, (i, j) => setT(i, j, 'ground_water'));
      }
    }
  };
  const prop = (type, gx, gy, w = 1, h = 1, extra = {}) => {
    items.push({ type, gx, gy, w, h, ...extra });
    propCount[type] = (propCount[type] ?? 0) + 1;
    rect(gx, gy, w, h, (x, y) => occupied.add(key(x, y)));
    // 桥面 / 券门中列与 core/iso.ts 的 passable 规则保持一致
    if (type === 'bridge') rect(gx, gy, w, h, (x, y) => passable.add(key(x, y)));
    if (type === 'paifang' || type === 'gate_arch') {
      for (let dy = 0; dy < h; dy++) passable.add(key(gx + Math.floor(w / 2), gy + dy));
      for (let dx = 0; dx < w; dx++) passable.add(key(gx + dx, gy + Math.floor(h / 2)));
    }
  };
  const reserve = (gx, gy, r = 2) => rect(gx - r, gy - r, 2 * r + 1, 2 * r + 1, (x, y) => reserved.add(key(x, y)));
  /** 大件只落在「原始基地、非路面、非预留、未占用」的格上 */
  const canPlace = (gx, gy, w = 1, h = 1) => {
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
      const x = gx + dx, y = gy + dy;
      if (!inside(x, y)) return false;
      const k = key(x, y);
      if (reserved.has(k) || occupied.has(k) || road[idx(x, y)] || terrain[idx(x, y)] !== theme.base) return false;
    }
    return true;
  };
  const tryProp = (type, gx, gy, w = 1, h = 1, extra = {}) => {
    if (!canPlace(gx, gy, w, h)) return false;
    prop(type, gx, gy, w, h, extra);
    return true;
  };
  /** 地标「就近找空位」：路网形状各异，写死的坐标可能正好压在路/环廊上，环形外扩找最近可用的基地 */
  const placeNear = (type, gx, gy, w = 1, h = 1, extra = {}, maxR = 16) => {
    for (let r = 0; r <= maxR; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (canPlace(gx + dx, gy + dy, w, h)) {
            prop(type, gx + dx, gy + dy, w, h, extra);
            return true;
          }
        }
      }
    }
    return false;
  };

  // 1) 玩法锚点先预留，任何构件都不得侵占出入口与刷怪点周围 2 格
  const anchors = theme.anchors;
  for (const s of anchors.spawns) reserve(s.gx, s.gy);
  for (const e of anchors.exits) reserve(e.gx, e.gy);
  if (anchors.npc) reserve(anchors.npc.gx, anchors.npc.gy);

  // 2) 每图专属地形 / 路网 / 地标
  theme.build({ cols, rows, setT, markR, rect, line, waterLine, prop, tryProp, placeNear, canPlace, reserve });

  // 3) 场景装饰：只落在原始基地上，跳过路面、水面、锚点预留与已占格
  const roll = () => {
    const r = rnd();
    let acc = 0;
    for (const [type, weight] of theme.deco) { acc += weight; if (r < acc) return type; }
    return theme.deco[theme.deco.length - 1][0];
  };
  const SOFT = new Set(['stele', 'incense', 'crate', 'stall', 'well', 'fence', 'lantern_post']);
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const k = key(gx, gy);
      if (occupied.has(k) || reserved.has(k) || road[idx(gx, gy)]) continue;
      if (terrain[idx(gx, gy)] !== theme.base) continue;
      if (rnd() > theme.decoDensity) continue;
      let type = roll();
      const cap = type === 'fence' ? 40 : 12;
      if (SOFT.has(type) && (propCount[type] ?? 0) >= cap) type = theme.deco[0][0];
      const variant = type === 'tree' ? { variant: theme.treeVariant }
        : type === 'rock' ? { variant: theme.rockVariant } : {};
      prop(type, gx, gy, 1, type === 'stele' ? 2 : type === 'fence' ? 1 : 1, variant);
    }
  }

  // 4) 沿路灯笼：从路面格向外找一格空基地，按主题步长成列
  if (theme.lampStep > 0) {
    const step = theme.lampStep;
    for (let gy = 6; gy < rows - 6; gy += step) {
      for (let gx = 6; gx < cols - 6; gx += step) {
        if (!road[idx(gx, gy)]) continue;
        for (const [dx, dy] of [[-3, 0], [3, 0], [0, -3], [0, 3]]) {
          const x = gx + dx, y = gy + dy;
          if (!inside(x, y)) continue;
          const k = key(x, y);
          if (occupied.has(k) || reserved.has(k) || road[idx(x, y)] || terrain[idx(x, y)] !== theme.base) continue;
          prop('lantern_post', x, y);
          break;
        }
      }
    }
  }

  // 5) 地面按行 RLE 合并成矩形（每格只出现一次，顺序不影响碰撞）
  const groundItems = [];
  for (let y = 0; y < rows; y++) {
    let x = 0;
    while (x < cols) {
      const t = terrain[idx(x, y)];
      let n = 1;
      while (x + n < cols && terrain[idx(x + n, y)] === t) n++;
      groundItems.push({ type: t, gx: x, gy: y, w: n, h: 1 });
      x += n;
    }
  }

  // 6) 内置 BFS 自检：所有出入口、刷怪点、NPC 必须四邻接连通且落在可走格
  const walkable = (x, y) => {
    if (!inside(x, y)) return false;
    const k = key(x, y);
    if (passable.has(k)) return true;
    if (terrain[idx(x, y)] === 'ground_water') return false;
    return !occupied.has(k);
  };
  const points = [
    ...anchors.exits.map((e) => ({ gx: e.gx, gy: e.gy, name: `路牌 ${e.label}` })),
    ...anchors.spawns.map((s) => ({ gx: s.gx, gy: s.gy, name: `怪组 (${s.gx},${s.gy})` })),
    ...(anchors.npc ? [{ ...anchors.npc, name: `NPC ${anchors.npc.name}` }] : []),
  ];
  for (const p of points) {
    if (!walkable(p.gx, p.gy)) throw new Error(`[${theme.id}] ${p.name} 落在不可走格`);
  }
  if (points.length > 1) {
    const start = points[0];
    const seen = new Set([key(start.gx, start.gy)]);
    const queue = [[start.gx, start.gy]];
    for (let head = 0; head < queue.length; head++) {
      const [x, y] = queue[head];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, k = key(nx, ny);
        if (seen.has(k) || !walkable(nx, ny)) continue;
        seen.add(k); queue.push([nx, ny]);
      }
    }
    for (const p of points.slice(1)) {
      if (!seen.has(key(p.gx, p.gy))) throw new Error(`[${theme.id}] ${p.name} 与 ${start.name} 不连通`);
    }
  }

  return {
    grid: { cols: grid.cols, rows: grid.rows, tileW: grid.tileW, tileH: grid.tileH, ox: grid.ox, oy: grid.oy },
    rules: { streetWidth: theme.signature === 'straight-road' ? 7 : 5, houseClearanceFromStreetCenter: 5, roofLift: 0 },
    signature: theme.signature,
    tagline: theme.tagline,
    size: { width: grid.width, height: grid.height },
    anchors,
    items: [...groundItems, ...items],
  };
}

mkdirSync(OUT_DIR, { recursive: true });
for (const theme of THEMES) {
  const layout = buildLayout(theme);
  const file = new URL(`${theme.id}.json`, OUT_DIR);
  writeFileSync(file, `${JSON.stringify(layout)}\n`);
  const kinds = {};
  for (const it of layout.items) kinds[it.type] = (kinds[it.type] ?? 0) + 1;
  console.log(`${theme.name} (${theme.id}) ${theme.cols}×${theme.rows} → ${layout.size.width}×${layout.size.height}  ${layout.items.length} 件`);
  console.log(`  ${theme.tagline}`);
  console.log(`  ${Object.entries(kinds).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k}×${v}`).join('  ')}`);
}
