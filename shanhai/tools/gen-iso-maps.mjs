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
 * 每图的完整定义。anchors 一般落在边界带（距边 ≤1 格）：
 *   gx ∈ {1, cols-2} 或 gy ∈ {1, rows-2}。
 * 例外：西岐城的出城口嵌在北城墙线上（城门券洞 gx=62, gy≈4），路牌/落点取门洞 (62,3)。
 * 拓扑（成对的路牌互为对方落点，玩家一进图就站在回程路牌上）：
 *   西岐城城门(62,3) ⇄ 山道(32,1)
 *   山道(1,62) ⇄ 黄泉(11,1)      山道(126,62) ⇄ 洞天(1,52)
 *   黄泉(73,126) ⇄ 地府(40,1)     地府(40,110) → 西岐城城门(62,3)（单向还阳）
 */
const THEMES = [
  {
    id: 'wild_heifeng', name: '穿云岭古道', seed: 20261109,
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
        { gx: 32, gy: 1, to: 'taoyuan', toGx: 62, toGy: 3, label: '西岐城' },
        { gx: 1, gy: 62, to: 'wild_luanzang', toGx: 11, toGy: 1, label: '黄泉鬼渡' },
        { gx: 126, gy: 62, to: 'wild_shanxiao', toGx: 1, toGy: 52, label: '骷髅山白骨洞' },
        { gx: 64, gy: 94, to: 'wild_kunlun', toGx: 60, toGy: 1, label: '昆仑山道' },
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
      // 南支路：从中枢南下，通往昆仑山道山口
      line([[62, 64], [64, 94]], 6, 'ground_dirt');
      // 环山小径：把北段与东段接成回路，不必原路折返
      line([[32, 14], [104, 14], [104, 46]], 4, 'ground_dirt');
      // 山腰歇脚坪（不是中心广场）
      rect(56, 40, 14, 14, (x, y) => markR(x, y, 'ground_stone'));

      // 溪桥：桥面全格可走；落点选在溪涧上、避开玩法锚点
      for (const [gx, gy] of [[22, 58], [60, 32], [98, 78], [26, 84]]) {
        prop('bridge', gx, gy, 3, 5);
      }
      // 四座指路牌坊分立四个山口，牌坊中列可穿行
      for (const [gx, gy] of [[36, 6], [7, 68], [118, 68], [60, 88]]) placeNear('paifang', gx, gy, 3, 3);
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
    id: 'wild_luanzang', name: '黄泉鬼渡', seed: 20261110,
    cols: 96, rows: 128,
    base: 'ground_dirt', signature: 'diagonal-river',
    tagline: '黄泉斜贯 · 两岸石堤 · 六渡石桥',
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
        { gx: 11, gy: 1, to: 'wild_heifeng', toGx: 1, toGy: 62, label: '穿云岭古道' },
        { gx: 73, gy: 126, to: 'difu', toGx: 40, toGy: 1, label: '朝歌 · 鹿台' },
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
    id: 'wild_shanxiao', name: '骷髅山白骨洞', seed: 20261111,
    cols: 104, rows: 104,
    base: 'ground_dirt', signature: 'ring-cavern',
    tagline: '青苔环廊 · 青石圆厅 · 四条放射石阶 · 晶壁围合',
    treeVariant: 'pine', rockVariant: 'crystal',
    decoDensity: 0.105, lampStep: 0,
    // 晶石按「洞厅留白 / 环廊通透 / 洞壁成丛」分层：旧版均匀撒点把环廊和石阶全淹了
    decoDensityAt: (gx, gy) => {
      const d = Math.hypot(gx - 52, gy - 52);
      if (d < 19) return 0.012;
      if (d < 31) return 0.032;
      return 0.095;
    },
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
        { gx: 1, gy: 52, to: 'wild_heifeng', toGx: 126, toGy: 62, label: '穿云岭古道' },
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
    id: 'difu', name: '朝歌 · 鹿台', seed: 20261112,
    cols: 80, rows: 112,
    base: 'ground_dirt', signature: 'straight-road',
    tagline: '黄泉直道 · 黄泉横河 · 奈何桥 · 碑阵引魂灯',
    treeVariant: 'dead', rockVariant: 'dark', bridgeVariant: 'dark',
    decoDensity: 0.018, lampStep: 0,
    deco: [['rock', 0.56], ['fence', 0.22], ['tree', 0.14], ['stele', 0.08]],
    anchors: {
      spawns: [{ gx: 40, gy: 90, group: ['daji'] }],
      exits: [
        { gx: 40, gy: 1, to: 'wild_luanzang', toGx: 73, toGy: 126, label: '黄泉鬼渡' },
        { gx: 40, gy: 110, to: 'taoyuan', toGx: 62, toGy: 3, label: '还阳 · 西岐城' },
        { gx: 1, gy: 40, to: 'zhaoge', toGx: 94, toGy: 48, label: '朝歌城' },
      ],
      npc: { gx: 40, gy: 72, name: '妲己' },
    },
    build(c) {
      const { setT, line, rect, markR, prop, tryProp, placeNear, cols } = c;
      // 黄泉横河：把朝歌切成南北两半
      rect(0, 54, cols, 7, (x, y) => setT(x, y, 'ground_water'));
      // 一条笔直黄泉道贯穿南北（唯一主路，无十字、无广场）
      line([[40, 1], [40, 110]], 7, 'ground_stone');
      // 西支路：黄泉道西出，通往朝歌城
      line([[40, 40], [1, 40]], 5, 'ground_stone');
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

  {
    id: 'wild_yunmeng', name: '云梦泽', seed: 20261114,
    cols: 112, rows: 90,
    base: 'ground_grass', signature: 'misty-lake',
    tagline: '烟波大泽 · 芦苇荡 · 环湖栈道',
    treeVariant: 'leaf', rockVariant: 'moss',
    decoDensity: 0.048, lampStep: 12,
    deco: [['tree', 0.52], ['rock', 0.24], ['lantern_post', 0.08], ['fence', 0.09], ['stall', 0.04], ['well', 0.03]],
    anchors: {
      spawns: [
        { gx: 30, gy: 24, group: ['kulou'] },
        { gx: 80, gy: 24, group: ['kulou', 'kulou'] },
        { gx: 94, gy: 40, group: ['yelang'] },
        { gx: 26, gy: 36, group: ['kulou'] },
        { gx: 30, gy: 64, group: ['yelang', 'kulou'] },
      ],
      exits: [
        { gx: 50, gy: 1, to: 'taoyuan', toGx: 62, toGy: 126, label: '西岐城' },
        { gx: 110, gy: 44, to: 'chentangguan', toGx: 1, toGy: 36, label: '陈塘关' },
        { gx: 50, gy: 88, to: 'jinaodao', toGx: 52, toGy: 1, label: '金鳌岛碧游宫' },
        { gx: 1, gy: 44, to: 'panxi', toGx: 86, toGy: 44, label: '磻溪' },
      ],
    },
    build(c) {
      const { waterLine, line, rect, markR, prop, placeNear, setT } = c;
      // 云梦大泽：水带拼出烟波湖形（中部偏南），路后画 → 跨湖段自然成堤
      waterLine([[20, 50], [40, 56], [64, 50], [88, 56]], 14);
      rect(30, 42, 50, 12, (x, y) => setT(x, y, 'ground_water'));
      // 环湖道路：北口 → 岔口 → 东岸渔村；西支路沿芦苇荡南伸
      line([[50, 1], [50, 16], [78, 20]], 6, 'ground_dirt');
      line([[78, 20], [94, 32], [94, 56]], 5, 'ground_dirt');
      line([[50, 16], [26, 24], [26, 44]], 5, 'ground_dirt');
      // 东支路：东岸渔村向东，出泽口通往陈塘关
      line([[94, 56], [104, 50], [110, 44]], 5, 'ground_dirt');
      // 南支路：西支路南下经泽畔苇荡，出南水口通往金鳌岛海路
      line([[26, 44], [30, 70], [50, 88]], 5, 'ground_dirt');
      // 西支路：西岸小径向西，通往渭水磻溪
      line([[26, 44], [1, 44]], 5, 'ground_dirt');
      // 湖畔歇坪 × 2 + 曲岸栈桥跨水
      rect(40, 24, 12, 10, (x, y) => markR(x, y, 'ground_stone'));
      rect(84, 40, 10, 8, (x, y) => markR(x, y, 'ground_stone'));
      for (const [gx, gy] of [[48, 46], [72, 44]]) prop('bridge', gx, gy, 3, 5);
      // 泽口牌坊 + 水榭楼阁 + 渔家摊 + 石井
      for (const [gx, gy] of [[44, 6], [92, 28]]) placeNear('paifang', gx, gy, 3, 3);
      placeNear('hall', 90, 22, 6, 6);
      placeNear('house', 26, 32, 4, 4, { variant: 'lattice', facing: 'sw' });
      placeNear('stall', 56, 14, 2, 2, { variant: 'silk' });
      placeNear('well', 40, 38, 1, 1);
    },
  },

  {
    id: 'wild_kunlun', name: '昆仑山道', seed: 20261121,
    cols: 120, rows: 88,
    base: 'ground_dirt', signature: 'sacred-switchback',
    tagline: '仙阶之字 · 雪岭牌坊 · 截教妖修伏道',
    treeVariant: 'pine', rockVariant: 'crystal',
    decoDensity: 0.052, lampStep: 12,
    deco: [['rock', 0.42], ['tree', 0.40], ['lantern_post', 0.08], ['stele', 0.06], ['crate', 0.04]],
    anchors: {
      spawns: [
        { gx: 44, gy: 26, group: ['jiaotu'] },
        { gx: 82, gy: 22, group: ['jiaotu', 'jiaotu'] },
        { gx: 28, gy: 50, group: ['zhizhu'] },
        { gx: 92, gy: 58, group: ['jiaotu'] },
        { gx: 44, gy: 72, group: ['jiaotu', 'zhizhu'] },
        { gx: 76, gy: 70, group: ['heixiong'] },
      ],
      exits: [
        { gx: 60, gy: 1, to: 'wild_heifeng', toGx: 64, toGy: 94, label: '穿云岭古道' },
        { gx: 118, gy: 44, to: 'yuxugong', toGx: 1, toGy: 44, label: '玉虚宫' },
      ],
    },
    build(c) {
      const { line, rect, markR, prop, placeNear, tryProp, setT } = c;
      // 山巅云海：北段一线浅水带作云海意象（不可走，只作观感分隔）
      setT(0, 0, 'ground_dirt');
      // 仙阶之字主道：北口 → 三折 → 山腰平台 → 东口
      line([[60, 1], [60, 16], [38, 30]], 6, 'ground_stone');
      line([[38, 30], [60, 44], [82, 32]], 6, 'ground_stone');
      line([[60, 44], [60, 60], [40, 72], [58, 86]], 6, 'ground_stone');
      line([[82, 32], [104, 40], [118, 44]], 5, 'ground_stone');
      // 山腰拜道平台（玉虚宫方向的中继）
      rect(52, 40, 16, 12, (x, y) => markR(x, y, 'ground_stone'));
      // 山门牌坊分立两处山口
      for (const [gx, gy] of [[56, 8], [112, 46]]) placeNear('paifang', gx, gy, 3, 3);
      // 道观与碑阵：截教伏兵据点意象
      placeNear('hall', 88, 62, 6, 6);
      placeNear('house', 28, 62, 4, 4, { variant: 'wood', facing: 'se' });
      for (const [type, gx, gy] of [['stele', 50, 22], ['stele', 70, 52], ['incense', 58, 44], ['well', 66, 64]]) {
        placeNear(type, gx, gy, 1, type === 'stele' ? 2 : 1);
      }
    },
  },

  {
    id: 'yuxugong', name: '玉虚宫', seed: 20261122,
    cols: 72, rows: 88,
    base: 'ground_stone', signature: 'celestial-terrace',
    tagline: '云台石殿 · 阶陛三重 · 圣人道场',
    treeVariant: 'pine', rockVariant: 'crystal',
    decoDensity: 0.036, lampStep: 10,
    deco: [['lantern_post', 0.30], ['tree', 0.28], ['incense', 0.16], ['stele', 0.14], ['rock', 0.12]],
    anchors: {
      spawns: [],
      exits: [
        { gx: 1, gy: 44, to: 'wild_kunlun', toGx: 118, toGy: 44, label: '昆仑山道' },
      ],
      npc: { gx: 36, gy: 36, name: '元始天尊' },
    },
    build(c) {
      const { line, rect, markR, prop, placeNear } = c;
      // 西口 → 三重阶陛 → 宫前广场 → 大殿
      line([[1, 44], [20, 44]], 6, 'ground_stone');
      rect(20, 38, 10, 12, (x, y) => markR(x, y, 'ground_stone'));
      line([[30, 44], [36, 44]], 6, 'ground_stone');
      rect(32, 34, 20, 20, (x, y) => markR(x, y, 'ground_stone'));
      line([[36, 44], [36, 30]], 6, 'ground_stone');
      // 玉虚大殿居中高台，圣人 NPC 立于殿前丹陛
      placeNear('hall', 33, 20, 7, 6);
      // 山门牌坊 + 两翼碑亭
      placeNear('paifang', 14, 40, 3, 3);
      for (const [type, gx, gy] of [['stele', 16, 52], ['stele', 50, 50], ['incense', 32, 40], ['incense', 42, 40], ['well', 50, 62]]) {
        placeNear(type, gx, gy, 1, type === 'stele' ? 2 : 1);
      }
    },
  },

  {
    id: 'chentangguan', name: '陈塘关', seed: 20261123,
    cols: 88, rows: 72,
    base: 'ground_grass', signature: 'seafront-town',
    tagline: '海滨关城 · 十里横街 · 总兵府 · 九湾河口',
    treeVariant: 'leaf', rockVariant: 'moss',
    decoDensity: 0.050, lampStep: 10,
    deco: [['tree', 0.24], ['stall', 0.20], ['lantern_post', 0.16], ['fence', 0.14], ['well', 0.10], ['crate', 0.16]],
    anchors: {
      spawns: [],
      exits: [
        { gx: 1, gy: 36, to: 'wild_yunmeng', toGx: 110, toGy: 44, label: '云梦泽' },
        { gx: 86, gy: 36, to: 'qianyuan', toGx: 1, toGy: 36, label: '乾元山金光洞' },
      ],
      npc: { gx: 52, gy: 32, name: '李靖' },
    },
    build(c) {
      const { waterLine, line, rect, markR, prop, placeNear, setT } = c;
      // 九湾河口：南缘一带海水（码头栈桥跨水观景）
      waterLine([[0, 64], [24, 62], [52, 66], [87, 62]], 10);
      // 横街：西关口 → 十里横街 → 东关厢
      line([[1, 36], [86, 36]], 6, 'ground_dirt');
      // 纵街：北门校场 → 横街 → 码头前街
      line([[44, 4], [44, 58]], 5, 'ground_dirt');
      line([[60, 36], [66, 56]], 4, 'ground_dirt');
      // 总兵府（李靖理政处）+ 校场歇坪
      placeNear('hall', 54, 24, 7, 6);
      rect(36, 10, 14, 10, (x, y) => markR(x, y, 'ground_stone'));
      // 关门牌坊 + 码头栈桥 + 市井摊贩
      placeNear('paifang', 8, 32, 3, 3);
      prop('bridge', 64, 58, 3, 5);
      placeNear('stall', 30, 40, 1, 1, { variant: 'silk' });
      placeNear('stall', 52, 42, 1, 1);
      placeNear('well', 38, 30, 1, 1);
      placeNear('crate', 70, 44, 1, 1);
      for (const [gx, gy] of [[24, 40], [60, 44]]) placeNear('house', gx, gy, 4, 4, { variant: 'lattice', facing: 'sw' });
    },
  },

  {
    id: 'qianyuan', name: '乾元山金光洞', seed: 20261131,
    cols: 96, rows: 72,
    base: 'ground_dirt', signature: 'immortal-cave',
    tagline: '金光洞府 · 仙山石阶 · 太乙真人道场',
    treeVariant: 'pine', rockVariant: 'crystal',
    decoDensity: 0.042, lampStep: 10,
    deco: [['tree', 0.38], ['rock', 0.30], ['lantern_post', 0.14], ['incense', 0.10], ['stele', 0.08]],
    anchors: {
      spawns: [],
      exits: [
        { gx: 1, gy: 36, to: 'chentangguan', toGx: 86, toGy: 36, label: '陈塘关' },
      ],
      npc: { gx: 46, gy: 34, name: '太乙真人' },
    },
    build(c) {
      const { line, rect, markR, prop, placeNear } = c;
      // 西口 → 之字山道 → 山腰洞前广场 → 金光洞大殿
      line([[1, 36], [28, 36], [46, 24], [46, 40]], 6, 'ground_stone');
      rect(38, 40, 18, 12, (x, y) => markR(x, y, 'ground_stone'));
      line([[46, 40], [46, 52], [70, 58]], 5, 'ground_stone');
      // 金光洞大殿（洞府）居上，真人立于洞前
      placeNear('hall', 44, 26, 7, 6);
      // 山门牌坊分立来路
      placeNear('paifang', 8, 32, 3, 3);
      for (const [type, gx, gy] of [['stele', 34, 44], ['incense', 42, 42], ['incense', 52, 42], ['well', 64, 48]]) {
        placeNear(type, gx, gy, 1, type === 'stele' ? 2 : 1);
      }
    },
  },

  {
    id: 'jinaodao', name: '金鳌岛碧游宫', seed: 20261132,
    cols: 104, rows: 88,
    base: 'ground_grass', signature: 'island-sanctum',
    tagline: '东海仙岛 · 碧游宫阙 · 截教总舵',
    treeVariant: 'leaf', rockVariant: 'dark',
    decoDensity: 0.048, lampStep: 12,
    deco: [['tree', 0.40], ['rock', 0.28], ['lantern_post', 0.14], ['stele', 0.10], ['fence', 0.08]],
    anchors: {
      spawns: [
        { gx: 30, gy: 24, group: ['jiaotu'] },
        { gx: 72, gy: 20, group: ['jiaotu', 'jiaotu'] },
        { gx: 22, gy: 52, group: ['shanxiao'] },
        { gx: 84, gy: 54, group: ['jiaotu', 'zhizhu'] },
        { gx: 48, gy: 68, group: ['shanxiao', 'jiaotu'] },
      ],
      exits: [
        { gx: 52, gy: 1, to: 'wild_yunmeng', toGx: 50, toGy: 88, label: '云梦泽' },
      ],
      npc: { gx: 52, gy: 38, name: '通天教主' },
    },
    build(c) {
      const { waterLine, line, rect, markR, prop, placeNear, setT } = c;
      // 东海环岛：南缘与东南角海水（岛心高、四缘滩涂意象）
      waterLine([[0, 78], [30, 82], [64, 78], [103, 74]], 11);
      // 北口 → 环岛干道 → 宫前广场
      line([[52, 1], [52, 18], [30, 30]], 6, 'ground_dirt');
      line([[52, 18], [74, 30], [52, 44]], 5, 'ground_dirt');
      line([[30, 30], [24, 52], [52, 44]], 5, 'ground_dirt');
      line([[52, 44], [80, 56], [78, 74]], 5, 'ground_dirt');
      // 碧游宫大殿 + 宫前广场
      rect(42, 36, 22, 14, (x, y) => markR(x, y, 'ground_stone'));
      placeNear('hall', 46, 26, 7, 6);
      // 岛门牌坊 + 沿滩栅栏
      placeNear('paifang', 48, 8, 3, 3);
      for (const [type, gx, gy] of [['stele', 38, 40], ['stele', 66, 40], ['well', 36, 62], ['crate', 70, 66]]) {
        placeNear(type, gx, gy, 1, type === 'stele' ? 2 : 1);
      }
    },
  },

  {
    id: 'zhaoge', name: '朝歌城', seed: 20261133,
    cols: 96, rows: 96,
    base: 'ground_dirt', signature: 'occupied-capital',
    tagline: '商都妖城 · 鹿台宫阙 · 酒池肉林坊市',
    treeVariant: 'dead', rockVariant: 'dark', bridgeVariant: 'dark',
    decoDensity: 0.030, lampStep: 10,
    deco: [['rock', 0.30], ['fence', 0.24], ['tree', 0.18], ['stele', 0.14], ['lantern_post', 0.14]],
    anchors: {
      spawns: [
        { gx: 28, gy: 24, group: ['jiaotu', 'kulou'] },
        { gx: 66, gy: 22, group: ['kulou', 'kulou'] },
        { gx: 22, gy: 52, group: ['zhizhu'] },
        { gx: 72, gy: 54, group: ['jiaotu'] },
        { gx: 40, gy: 74, group: ['jiaotu', 'heixiong'] },
        { gx: 66, gy: 78, group: ['kulou', 'zhizhu'] },
      ],
      exits: [
        { gx: 94, gy: 48, to: 'difu', toGx: 1, toGy: 40, label: '朝歌 · 鹿台' },
        { gx: 48, gy: 1, to: 'nvwagong', toGx: 44, toGy: 86, label: '女娲宫' },
        { gx: 1, gy: 30, to: 'sishuiguan', toGx: 94, toGy: 44, label: '汜水关' },
      ],
      npc: { gx: 48, gy: 44, name: '比干' },
    },
    build(c) {
      const { line, rect, markR, prop, placeNear } = c;
      // 东口 → 环城干道 → 宫城横街 → 西北坊市
      line([[94, 48], [64, 48], [64, 30], [40, 30]], 6, 'ground_dirt');
      line([[64, 48], [64, 66], [36, 74], [14, 74]], 5, 'ground_dirt');
      line([[40, 30], [14, 30]], 5, 'ground_dirt');
      // 北支路：宫城东北上出北口，通女娲宫
      line([[64, 30], [48, 1]], 5, 'ground_dirt');
      // 西支路：西北坊市西出西口，通汜水关
      line([[14, 30], [1, 30]], 5, 'ground_dirt');
      // 鹿台宫城平台 + 大殿
      rect(52, 36, 20, 16, (x, y) => markR(x, y, 'ground_stone'));
      placeNear('hall', 56, 26, 7, 6);
      // 城门牌坊 + 坊市栅栏 + 酒池碑
      placeNear('paifang', 88, 44, 3, 3);
      for (const [type, gx, gy] of [['stele', 40, 40], ['stele', 60, 56], ['crate', 20, 34], ['crate', 26, 66], ['well', 46, 62]]) {
        placeNear(type, gx, gy, 1, type === 'stele' ? 2 : 1);
      }
    },
  },

  {
    id: 'nvwagong', name: '女娲宫', seed: 20261141,
    cols: 88, rows: 88,
    base: 'ground_stone', signature: 'sacred-temple',
    tagline: '圣庙香庭 · 娲皇宫阙 · 七宝池畔',
    treeVariant: 'pine', rockVariant: 'crystal',
    decoDensity: 0.040, lampStep: 10,
    deco: [['lantern_post', 0.30], ['incense', 0.26], ['tree', 0.22], ['stele', 0.14], ['rock', 0.08]],
    anchors: {
      spawns: [],
      exits: [
        { gx: 44, gy: 86, to: 'zhaoge', toGx: 48, toGy: 1, label: '朝歌城' },
      ],
      npc: { gx: 44, gy: 40, name: '女娲娘娘' },
    },
    build(c) {
      const { line, rect, markR, prop, placeNear, setT } = c;
      // 南口 → 三重阶陛 → 宫前广场 → 娲皇大殿
      line([[44, 86], [44, 64]], 6, 'ground_stone');
      rect(34, 58, 22, 12, (x, y) => markR(x, y, 'ground_stone'));
      line([[44, 58], [44, 46]], 6, 'ground_stone');
      rect(32, 34, 26, 18, (x, y) => markR(x, y, 'ground_stone'));
      // 娲皇大殿居中高台
      placeNear('hall', 41, 22, 7, 6);
      // 山门牌坊 + 七宝池（浅水方池）+ 香炉阵
      placeNear('paifang', 38, 62, 3, 3);
      for (const [gx, gy] of [[30, 44], [58, 44]]) rect(gx - 3, gy - 2, 7, 5, (x, y) => setT(x, y, 'ground_water'));
      for (const [type, gx, gy] of [['incense', 36, 42], ['incense', 52, 42], ['stele', 26, 56], ['stele', 62, 56], ['well', 44, 70]]) {
        placeNear(type, gx, gy, 1, type === 'stele' ? 2 : 1);
      }
    },
  },

  {
    id: 'sishuiguan', name: '汜水关', seed: 20261142,
    cols: 96, rows: 88,
    base: 'ground_dirt', signature: 'border-pass',
    tagline: '一夫当关 · 关楼横贯 · 妖兵列阵',
    treeVariant: 'dead', rockVariant: 'dark',
    decoDensity: 0.030, lampStep: 10,
    deco: [['rock', 0.34], ['fence', 0.26], ['tree', 0.16], ['stele', 0.14], ['lantern_post', 0.10]],
    anchors: {
      spawns: [
        { gx: 24, gy: 22, group: ['jiaotu', 'kulou'] },
        { gx: 70, gy: 20, group: ['kulou', 'kulou'] },
        { gx: 30, gy: 44, group: ['jiaotu'] },
        { gx: 66, gy: 44, group: ['jiaotu', 'zhizhu'] },
        { gx: 24, gy: 64, group: ['kulou'] },
        { gx: 72, gy: 66, group: ['jiaotu', 'heixiong'] },
      ],
      exits: [
        { gx: 94, gy: 44, to: 'zhaoge', toGx: 1, toGy: 30, label: '朝歌城' },
        { gx: 1, gy: 44, to: 'juelongling', toGx: 118, toGy: 52, label: '绝龙岭' },
      ],
    },
    build(c) {
      const { line, rect, markR, prop, placeNear } = c;
      // 关道横贯东西：东口 → 关楼广场 → 西口
      line([[94, 44], [1, 44]], 7, 'ground_stone');
      rect(38, 36, 20, 16, (x, y) => markR(x, y, 'ground_stone'));
      // 关楼居中（一夫当关）+ 两侧城墙段
      placeNear('hall', 44, 30, 7, 6);
      for (const w of [
        { type: 'city_wall_u6', gx: 24, gy: 30, w: 6, h: 2 },
        { type: 'city_wall_v6', gx: 24, gy: 34, w: 2, h: 6 },
        { type: 'city_wall_u6', gx: 66, gy: 30, w: 6, h: 2 },
        { type: 'city_wall_v6', gx: 70, gy: 34, w: 2, h: 6 },
        { type: 'city_wall_u6', gx: 24, gy: 56, w: 6, h: 2 },
        { type: 'city_wall_v6', gx: 24, gy: 50, w: 2, h: 6 },
        { type: 'city_wall_u6', gx: 66, gy: 56, w: 6, h: 2 },
        { type: 'city_wall_v6', gx: 70, gy: 50, w: 2, h: 6 },
      ]) placeNear(w.type, w.gx, w.gy, w.w, w.h);
      // 关门牌坊 + 关厢石碑
      placeNear('paifang', 86, 40, 3, 3);
      for (const [type, gx, gy] of [['stele', 40, 50], ['crate', 32, 52], ['well', 58, 52]]) {
        placeNear(type, gx, gy, 1, type === 'stele' ? 2 : 1);
      }
    },
  },

  {
    id: 'panxi', name: '磻溪', seed: 20261143,
    cols: 88, rows: 96,
    base: 'ground_grass', signature: 'angling-creek',
    tagline: '渭水一湾 · 直钩钓台 · 柳岸柴扉',
    treeVariant: 'leaf', rockVariant: 'moss',
    decoDensity: 0.052, lampStep: 14,
    deco: [['tree', 0.46], ['fence', 0.20], ['rock', 0.14], ['stall', 0.10], ['well', 0.10]],
    anchors: {
      spawns: [],
      exits: [
        { gx: 86, gy: 44, to: 'wild_yunmeng', toGx: 1, toGy: 44, label: '云梦泽' },
      ],
      npc: { gx: 56, gy: 40, name: '武吉' },
    },
    build(c) {
      const { waterLine, line, rect, markR, prop, placeNear, tryProp } = c;
      // 渭水一湾：斜贯西南的溪流
      waterLine([[0, 70], [24, 60], [52, 66], [87, 58]], 9);
      // 东口 → 溪畔小径 → 钓台坪
      line([[86, 44], [56, 40], [40, 52]], 5, 'ground_dirt');
      rect(34, 48, 14, 10, (x, y) => markR(x, y, 'ground_stone'));
      // 直钩钓台（临水石台）+ 茅屋柴扉 + 溪畔草堂
      prop('bridge', 36, 60, 3, 5);
      placeNear('house', 62, 52, 4, 4, { variant: 'wood', facing: 'sw' });
      placeNear('house', 22, 40, 4, 4, { variant: 'lattice', facing: 'se' });
      placeNear('hall', 66, 34, 6, 6);
      // 溪畔石碑与栅栏
      for (const [type, gx, gy] of [['stele', 46, 54], ['well', 64, 44], ['crate', 70, 48]]) {
        placeNear(type, gx, gy, 1, type === 'stele' ? 2 : 1);
      }
      // 沿溪栅栏点缀
      for (let gx = 8; gx < 80; gx += 9) tryProp('fence', gx, 66, 2, 1);
    },
  },

  {
    id: 'juelongling', name: '绝龙岭', seed: 20261144,
    cols: 120, rows: 104,
    base: 'ground_dirt', signature: 'dead-dragon-ridge',
    tagline: '枯木怪岭 · 石阵天绝 · 太师亲征之地',
    treeVariant: 'dead', rockVariant: 'dark', bridgeVariant: 'dark',
    decoDensity: 0.046, lampStep: 0,
    deco: [['rock', 0.44], ['tree', 0.34], ['stele', 0.12], ['fence', 0.10]],
    decoDensityAt: (gx, gy) => {
      const d = Math.hypot(gx - 30, gy - 52);
      if (d < 14) return 0.012;
      if (d < 24) return 0.030;
      return 0.075;
    },
    anchors: {
      spawns: [
        { gx: 60, gy: 20, group: ['jiaotu', 'jiaotu'] },
        { gx: 92, gy: 36, group: ['jiaotu'] },
        { gx: 88, gy: 70, group: ['zhizhu', 'kulou'] },
        { gx: 56, gy: 82, group: ['jiaotu', 'heixiong'] },
        { gx: 20, gy: 52, group: ['wenzhong'] },
      ],
      exits: [
        { gx: 118, gy: 52, to: 'sishuiguan', toGx: 1, toGy: 44, label: '汜水关' },
      ],
    },
    build(c) {
      const { line, rect, markR, prop, placeNear, setT } = c;
      // 东口 → 岭脊干道 → 深谷场坪（太师结阵处）
      line([[118, 52], [76, 52]], 6, 'ground_dirt');
      line([[76, 52], [60, 36], [44, 52]], 5, 'ground_dirt');
      line([[44, 52], [30, 52]], 6, 'ground_stone');
      rect(16, 42, 26, 20, (x, y) => markR(x, y, 'ground_stone'));
      // 岭上石阵（八方位黑石柱）
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        placeNear('rock', Math.round(29 + Math.cos(a) * 9), Math.round(52 + Math.sin(a) * 9), 1, 1, { variant: 'dark' });
      }
      // 枯木关隘牌坊 + 殒命碑 + 太师行辕
      placeNear('paifang', 108, 48, 3, 3);
      placeNear('hall', 48, 34, 6, 6);
      for (const [type, gx, gy] of [['stele', 24, 48], ['stele', 24, 56], ['crate', 70, 48]]) {
        placeNear(type, gx, gy, 1, type === 'stele' ? 2 : 1);
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
      const density = theme.decoDensityAt ? theme.decoDensityAt(gx, gy) : theme.decoDensity;
      if (rnd() > density) continue;
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
