/**
 * 世界逻辑（纯逻辑层，不依赖 DOM）：
 * 地图与出口、野外刷怪、任务链、战斗奖励掉落、宠物栏、进度存档（localStorage）。
 */
import { MONSTERS, PETS, CLASSES, SKILLS, classById } from './content';
import type { AllySpec } from './battle';
import {
  PET_EQUIP_SLOTS, emptyBonus, generateEquipment, describeItem, itemBonus, rollTier, sellValue,
  type EquipSlot, type EquipmentItem, type StatBonus,
} from './equipment';
import { SKILL_MAX_LEVEL, skillUpgradeCost } from './skill';
import type { WalkBounds } from './path';
import { cellToWorld, type IsoGrid } from './iso';
import type { UnitStats, Resists } from './types';

// ===== 地图 =====

export interface MapExit {
  x: number;
  y: number;
  r: number;
  to: string;
  toX: number;
  toY: number;
  label: string;
}

export interface MapSpawn {
  /** 遭遇战怪物组（BattleOptions.enemyIds） */
  group: string[];
  x: number;
  y: number;
}

export interface WorldMap {
  id: string;
  name: string;
  /** 对应 art/maps/<scene>_<n>.png（旧单屏）或 art/world/<scene>/<cx>_<cy>.png（分块）的目录前缀 */
  scene: string;
  /** 横向区段数量（旧单屏地图按 1440×900 拼接）；二维分块地图用 width / TILE_W 折算 */
  segments: number;
  w: number;
  h: number;
  /** 本图独立可行走区（不同地图地平线不同） */
  bounds: WalkBounds;
  spawns: MapSpawn[];
  exits: MapExit[];
  npc?: { x: number; y: number; name: string };
  /** 酒馆（雇佣组队同伴），仅主城西岐城有 */
  tavern?: { x: number; y: number; name: string };
  /** 传送 NPC（土行孙）：靠近即弹出四境传送菜单，可直达任意舆图 */
  teleporter?: { x: number; y: number; name: string };
  /** 等距构件布局（相对 public/assets/art，例如 `iso/taoyuan.json`）；有值时按构件合成，尺寸仍由 w/h 决定 */
  iso?: { layout: string };
}

/** 判断某地图坐标是否可走：仅做地图边界与地平线区间兜底；构件级碰撞由渲染器的等距碰撞层再取交 */
export function isWalkable(map: WorldMap, x: number, y: number): boolean {
  const b = map.bounds;
  return x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY;
}

/**
 * 切图落地保护：若落点正好压在某个出口路牌的触发圈内，抵达当帧就会被再次传送，
 * 表现为「去不了那张图 / 一进去就弹回来」。渲染器据此在玩家首次离开触发圈前屏蔽这些出口。
 * margin 给一点余量，避免站在圈边缘反复触发。
 */
export function exitsSuppressedOnArrival(
  map: WorldMap, p: { x: number; y: number }, margin = 40,
): number[] {
  const out: number[] = [];
  map.exits.forEach((e, i) => {
    if (Math.hypot(e.x - p.x, e.y - p.y) < e.r + margin) out.push(i);
  });
  return out;
}

/**
 * 横向分块卷轴：每张地图由若干 1440×900 的「区段」横向拼接（逐段索引取图，不做镜像）。
 * 新素材到位前，同一张 1440×900 图会被重复用于每个区段（不裁切、不缩放）。
 * 只改 BASE_MAPS 的 segments 即可调整宽度；纵向保持 900（与视口等高，无纵向滚动）。
 */
export const TILE_W = 1440;
export const TILE_H = 900;
export const MAP_H = TILE_H;
/** 默认区段数（素材只有 1 段时按此宽度重复铺满，保持旧地图尺度与刷怪密度） */
export const DEFAULT_SEGMENTS = 8;

export const DEFAULT_WALK_BOUNDS: WalkBounds = { minX: 60, maxX: TILE_W - 60, minY: 478, maxY: 862 };

/**
 * 一景一制：每张等距地图有自己的格网。cols/rows 不同 ⇒ 菱形轮廓的胖瘦与歪斜方向不同，
 * 世界尺寸也不同（都参考西岐城 128×128 的量级）。字段必须与 iso/<id>.json 的 grid 逐项一致，
 * 由 tools/regression.mjs 校验。ox = rows*tileW/2、oy = tileH/2 保证菱形四角贴住世界边界。
 */
export const ISO_GRIDS: Record<string, IsoGrid> = {
  taoyuan:       { cols: 128, rows: 128, tileW: 64, tileH: 32, ox: 4096, oy: 16 },
  wild_heifeng:  { cols: 128, rows: 96,  tileW: 64, tileH: 32, ox: 3072, oy: 16 },
  wild_luanzang: { cols: 96,  rows: 128, tileW: 64, tileH: 32, ox: 4096, oy: 16 },
  wild_shanxiao: { cols: 104, rows: 104, tileW: 64, tileH: 32, ox: 3328, oy: 16 },
  difu:          { cols: 80,  rows: 112, tileW: 64, tileH: 32, ox: 3584, oy: 16 },
  wild_yunmeng:  { cols: 112, rows: 90,  tileW: 64, tileH: 32, ox: 2880, oy: 16 },
  wild_kunlun:   { cols: 120, rows: 88,  tileW: 64, tileH: 32, ox: 2816, oy: 16 },
  yuxugong:      { cols: 72,  rows: 88,  tileW: 64, tileH: 32, ox: 2816, oy: 16 },
  chentangguan:  { cols: 88,  rows: 72,  tileW: 64, tileH: 32, ox: 2304, oy: 16 },
  qianyuan:      { cols: 96,  rows: 72,  tileW: 64, tileH: 32, ox: 2304, oy: 16 },
  jinaodao:      { cols: 104, rows: 88,  tileW: 64, tileH: 32, ox: 2816, oy: 16 },
  zhaoge:        { cols: 96,  rows: 96,  tileW: 64, tileH: 32, ox: 3072, oy: 16 },
  nvwagong:      { cols: 88,  rows: 88,  tileW: 64, tileH: 32, ox: 2816, oy: 16 },
  sishuiguan:    { cols: 96,  rows: 88,  tileW: 64, tileH: 32, ox: 2816, oy: 16 },
  panxi:         { cols: 88,  rows: 96,  tileW: 64, tileH: 32, ox: 3072, oy: 16 },
  juelongling:   { cols: 120, rows: 104, tileW: 64, tileH: 32, ox: 3328, oy: 16 },
  fengmingshan:  { cols: 80,  rows: 80,  tileW: 64, tileH: 32, ox: 2560, oy: 16 },
  xidacamp:      { cols: 100, rows: 72,  tileW: 64, tileH: 32, ox: 2304, oy: 16 },
  jiepaiguan:    { cols: 96,  rows: 80,  tileW: 64, tileH: 32, ox: 2560, oy: 16 },
  yanshan:       { cols: 80,  rows: 88,  tileW: 64, tileH: 32, ox: 2816, oy: 16 },
  zhongnanshan:  { cols: 96,  rows: 104, tileW: 64, tileH: 32, ox: 3328, oy: 16 },
  lintongguan:   { cols: 80,  rows: 100, tileW: 64, tileH: 32, ox: 3200, oy: 16 },
  chuanyunguan:  { cols: 88,  rows: 104, tileW: 64, tileH: 32, ox: 3328, oy: 16 },
  mianchi:       { cols: 104, rows: 96,  tileW: 64, tileH: 32, ox: 3072, oy: 16 },
  jizhou:        { cols: 88,  rows: 112, tileW: 64, tileH: 32, ox: 3584, oy: 16 },
  meishan:       { cols: 104, rows: 72,  tileW: 64, tileH: 32, ox: 2304, oy: 16 },
  sanxiandao:    { cols: 112, rows: 72,  tileW: 64, tileH: 32, ox: 2304, oy: 16 },
  emeishan:      { cols: 72,  rows: 104, tileW: 64, tileH: 32, ox: 3328, oy: 16 },
  beihai:        { cols: 112, rows: 80,  tileW: 64, tileH: 32, ox: 2560, oy: 16 },
  zhaixinglou:   { cols: 72,  rows: 96,  tileW: 64, tileH: 32, ox: 3072, oy: 16 },
};
/** 西岐城格网：保留旧名以兼容外部引用与历史存档换算 */
export const ISO_GRID: IsoGrid = ISO_GRIDS.taoyuan;

export function isoGridOf(mapId: string): IsoGrid {
  return ISO_GRIDS[mapId] ?? ISO_GRIDS.taoyuan;
}
/** 由格网推导菱形世界尺寸（cell(0,0) 上顶点在 y=0，最右/最下顶点贴 w/h） */
export function isoWorldSize(g: IsoGrid): { w: number; h: number } {
  return { w: (g.cols + g.rows) * g.tileW / 2, h: (g.cols + g.rows) * g.tileH / 2 };
}

/** 格坐标 → 世界坐标：源图用自己格网，跨图落点用目标图格网 */
const at = (mapId: string, gx: number, gy: number) => cellToWorld(isoGridOf(mapId), gx, gy);
const isoSpawn = (mapId: string, gx: number, gy: number, group: string[]): MapSpawn => ({ group, ...at(mapId, gx, gy) });
const isoNpc = (mapId: string, gx: number, gy: number, name: string) => ({ ...at(mapId, gx, gy), name });
const isoExit = (
  mapId: string, gx: number, gy: number, to: string, toGx: number, toGy: number, label: string, r = 80,
): MapExit => {
  const p = at(mapId, gx, gy);
  const q = at(to, toGx, toGy);
  return { x: p.x, y: p.y, r, to, toX: q.x, toY: q.y, label };
};

interface BaseLayout {
  name: string;
  scene: string;
  segments?: number;
  /** 该图地平线以下的可行走纵向范围（横向在 expandMap 里按宽度推导） */
  walk?: { minY: number; maxY: number };
  spawns: MapSpawn[];
  exits: MapExit[];
  npc?: { x: number; y: number; name: string };
  tavern?: { x: number; y: number; name: string };
  teleporter?: { x: number; y: number; name: string };

  // —— 等距构件地图（给出 iso 时启用；尺寸仍由 width/height 决定）——
  /** 世界宽高（像素），省略时按 segments 推导 */
  width?: number;
  height?: number;
  /** 构件布局 JSON（相对 public/assets/art） */
  iso?: { layout: string };
}

/**
 * 等距图的尺寸与 bounds 由各自 ISO_GRIDS 推导（见 expandMap），这里只写格坐标。
 * 出入口一般贴在格网边界带：gx ∈ {1, cols-2} 或 gy ∈ {1, rows-2}；
 * 例外：西岐城的出城口嵌在北城墙线上（城门券洞 gx=62, gy≈4），以画面城门为准。
 * 成对的路牌互为对方落点，玩家一进图就站在回程路牌上。
 */
const BASE_MAPS: Record<string, BaseLayout> = {
  taoyuan: {
    name: '西岐城', scene: 'taoyuan',
    // 128×128 城制样板；北城门券洞在 cell(62,4)（城墙线 gy≈4），
    // 路牌放门洞北沿 cell(62,3)：城内北上穿过券洞即触发，与画面城门严格对齐
    iso: { layout: 'iso/taoyuan.json' },
    spawns: [],
    exits: [
      isoExit('taoyuan', 62, 3, 'wild_heifeng', 32, 1, '穿云岭古道'),
      isoExit('taoyuan', 62, 126, 'wild_yunmeng', 50, 1, '云梦泽'),
    ],
    npc: isoNpc('taoyuan', 32, 32, '姜子牙'),
    tavern: isoNpc('taoyuan', 32, 20, '西岐酒肆掌柜'),
  },
  /** 穿云岭古道 128×96：盘山之字栈道，三口分别在北 / 西 / 东边界 */
  wild_heifeng: {
    name: '穿云岭古道', scene: 'wild_heifeng',
    iso: { layout: 'iso/wild_heifeng.json' },
    spawns: [
      isoSpawn('wild_heifeng', 32, 12, ['yelang']),
      isoSpawn('wild_heifeng', 32, 22, ['yelang', 'yelang']),
      isoSpawn('wild_heifeng', 72, 14, ['yelang']),
      isoSpawn('wild_heifeng', 58, 44, ['heixiong']),
      isoSpawn('wild_heifeng', 40, 64, ['yelang']),
      isoSpawn('wild_heifeng', 22, 64, ['yelang', 'yelang']),
      isoSpawn('wild_heifeng', 104, 52, ['yelang']),
      isoSpawn('wild_heifeng', 116, 62, ['heixiong']),
    ],
    exits: [
      isoExit('wild_heifeng', 32, 1, 'taoyuan', 62, 3, '西岐城'),
      isoExit('wild_heifeng', 1, 62, 'wild_luanzang', 11, 1, '黄泉鬼渡'),
      isoExit('wild_heifeng', 126, 62, 'wild_shanxiao', 1, 52, '骷髅山白骨洞'),
      isoExit('wild_heifeng', 64, 94, 'wild_kunlun', 60, 1, '昆仑山道'),
    ],
  },
  /** 黄泉鬼渡 96×128：黄泉斜贯，北渡口通山道、南渡口通朝歌 */
  wild_luanzang: {
    name: '黄泉鬼渡', scene: 'wild_luanzang',
    iso: { layout: 'iso/wild_luanzang.json' },
    spawns: [
      isoSpawn('wild_luanzang', 17, 20, ['kulou']),
      isoSpawn('wild_luanzang', 53, 40, ['kulou', 'kulou']),
      isoSpawn('wild_luanzang', 48, 56, ['zhizhu']),
      isoSpawn('wild_luanzang', 45, 76, ['kulou']),
      isoSpawn('wild_luanzang', 81, 96, ['zhizhu', 'kulou']),
      isoSpawn('wild_luanzang', 65, 116, ['zhizhu']),
    ],
    exits: [
      isoExit('wild_luanzang', 11, 1, 'wild_heifeng', 1, 62, '穿云岭古道'),
      isoExit('wild_luanzang', 73, 126, 'difu', 40, 1, '朝歌 · 鹿台'),
      isoExit('wild_luanzang', 1, 64, 'jizhou', 86, 52, '冀州'),
    ],
  },
  /** 骷髅山白骨洞 104×104：环形洞厅 + 四向放射石阶，只有西口通山道 */
  wild_shanxiao: {
    name: '骷髅山白骨洞', scene: 'wild_shanxiao',
    iso: { layout: 'iso/wild_shanxiao.json' },
    spawns: [
      isoSpawn('wild_shanxiao', 52, 20, ['shanxiao']),
      isoSpawn('wild_shanxiao', 52, 38, ['shanxiao', 'shanxiao']),
      isoSpawn('wild_shanxiao', 52, 86, ['shanxiao']),
      isoSpawn('wild_shanxiao', 52, 92, ['shanxiaowang']),
      isoSpawn('wild_shanxiao', 84, 52, ['shanxiao', 'shanxiao']),
      isoSpawn('wild_shanxiao', 20, 52, ['shanxiao']),
    ],
    exits: [
      isoExit('wild_shanxiao', 1, 52, 'wild_heifeng', 126, 62, '穿云岭古道'),
      isoExit('wild_shanxiao', 102, 52, 'meishan', 1, 44, '梅山'),
    ],
  },
  /** 地府 80×112：一条黄泉直道贯穿南北，北口回黄泉、南口还阳回西岐城；鹿台深处妖火中藏着妲己真身 */
  difu: {
    name: '朝歌 · 鹿台', scene: 'difu',
    iso: { layout: 'iso/difu.json' },
    spawns: [
      isoSpawn('difu', 40, 90, ['daji']),
    ],
    exits: [
      isoExit('difu', 40, 1, 'wild_luanzang', 73, 126, '黄泉鬼渡'),
      isoExit('difu', 40, 110, 'taoyuan', 62, 3, '还阳 · 西岐城'),
      isoExit('difu', 1, 40, 'zhaoge', 94, 48, '朝歌城'),
    ],
    npc: isoNpc('difu', 40, 72, '妲己'),
  },
  /** 云梦泽 112×90：烟波大泽居中，环湖道路成环，北口通西岐城南门；蛟妖盘踞泽中 */
  wild_yunmeng: {
    name: '云梦泽', scene: 'wild_yunmeng',
    iso: { layout: 'iso/wild_yunmeng.json' },
    spawns: [
      isoSpawn('wild_yunmeng', 30, 24, ['shuiyao']),
      isoSpawn('wild_yunmeng', 80, 24, ['shuiyao', 'shuiyao']),
      isoSpawn('wild_yunmeng', 94, 40, ['yelang']),
      isoSpawn('wild_yunmeng', 26, 36, ['shuiyao']),
      isoSpawn('wild_yunmeng', 30, 64, ['yelang', 'shuiyao']),
      isoSpawn('wild_yunmeng', 70, 70, ['kulou', 'shuiyao']),
    ],
    exits: [
      isoExit('wild_yunmeng', 50, 1, 'taoyuan', 62, 126, '西岐城'),
      isoExit('wild_yunmeng', 110, 44, 'chentangguan', 1, 36, '陈塘关'),
      isoExit('wild_yunmeng', 50, 88, 'jinaodao', 52, 1, '金鳌岛碧游宫'),
      isoExit('wild_yunmeng', 1, 44, 'panxi', 86, 44, '磻溪'),
    ],
  },
  /** 昆仑山道 120×88：仙阶之字上山，北口通穿云岭、东口通玉虚宫；截教妖修伏道 */
  wild_kunlun: {
    name: '昆仑山道', scene: 'wild_kunlun',
    iso: { layout: 'iso/wild_kunlun.json' },
    spawns: [
      isoSpawn('wild_kunlun', 44, 26, ['jiaotu']),
      isoSpawn('wild_kunlun', 82, 22, ['jiaotu', 'jiaotu']),
      isoSpawn('wild_kunlun', 28, 50, ['zhizhu']),
      isoSpawn('wild_kunlun', 92, 58, ['jiaotu']),
      isoSpawn('wild_kunlun', 44, 72, ['jiaotu', 'zhizhu']),
      isoSpawn('wild_kunlun', 76, 70, ['heixiong']),
    ],
    exits: [
      isoExit('wild_kunlun', 60, 1, 'wild_heifeng', 64, 94, '穿云岭古道'),
      isoExit('wild_kunlun', 118, 44, 'yuxugong', 1, 44, '玉虚宫'),
      isoExit('wild_kunlun', 1, 44, 'emeishan', 70, 52, '罗浮洞'),
    ],
  },
  /** 玉虚宫 72×88：阐教圣地，安全图无刷怪，元始天尊坐镇宫前丹陛 */
  yuxugong: {
    name: '玉虚宫', scene: 'yuxugong',
    iso: { layout: 'iso/yuxugong.json' },
    spawns: [],
    exits: [isoExit('yuxugong', 1, 44, 'wild_kunlun', 118, 44, '昆仑山道')],
    npc: isoNpc('yuxugong', 36, 36, '元始天尊'),
  },
  /** 陈塘关 88×72：哪吒故里海滨关城，安全图，李靖总兵坐镇；东口通乾元山 */
  chentangguan: {
    name: '陈塘关', scene: 'chentangguan',
    iso: { layout: 'iso/chentangguan.json' },
    spawns: [],
    exits: [
      isoExit('chentangguan', 1, 36, 'wild_yunmeng', 110, 44, '云梦泽'),
      isoExit('chentangguan', 86, 36, 'qianyuan', 1, 36, '乾元山金光洞'),
    ],
    npc: isoNpc('chentangguan', 52, 32, '李靖'),
  },
  /** 乾元山金光洞 96×72：哪吒师门，安全图，太乙真人道场 */
  qianyuan: {
    name: '乾元山金光洞', scene: 'qianyuan',
    iso: { layout: 'iso/qianyuan.json' },
    spawns: [],
    exits: [isoExit('qianyuan', 1, 36, 'chentangguan', 86, 36, '陈塘关')],
    npc: isoNpc('qianyuan', 46, 34, '太乙真人'),
  },
  /** 金鳌岛碧游宫 104×88：截教总舵，东海仙岛妖修环伺，通天教主坐镇宫前 */
  jinaodao: {
    name: '金鳌岛碧游宫', scene: 'jinaodao',
    iso: { layout: 'iso/jinaodao.json' },
    spawns: [
      isoSpawn('jinaodao', 30, 24, ['jiaotu']),
      isoSpawn('jinaodao', 72, 20, ['jiaotu', 'jiaotu']),
      isoSpawn('jinaodao', 22, 52, ['shanxiao']),
      isoSpawn('jinaodao', 84, 54, ['jiaotu', 'zhizhu']),
      isoSpawn('jinaodao', 48, 68, ['shanxiao', 'jiaotu']),
    ],
  exits: [
    isoExit('jinaodao', 52, 1, 'wild_yunmeng', 50, 88, '云梦泽'),
    isoExit('jinaodao', 102, 44, 'sanxiandao', 1, 36, '三仙岛'),
  ],
    npc: isoNpc('jinaodao', 52, 38, '通天教主'),
  },
  /** 朝歌城 96×96：商都妖城，妖氛环伺，比干孤忠守街口 */
  zhaoge: {
    name: '朝歌城', scene: 'zhaoge',
    iso: { layout: 'iso/zhaoge.json' },
    spawns: [
      isoSpawn('zhaoge', 28, 24, ['jiaotu', 'kulou']),
      isoSpawn('zhaoge', 66, 22, ['kulou', 'kulou']),
      isoSpawn('zhaoge', 22, 52, ['zhizhu']),
      isoSpawn('zhaoge', 72, 54, ['jiaotu']),
      isoSpawn('zhaoge', 40, 74, ['jiaotu', 'heixiong']),
      isoSpawn('zhaoge', 66, 78, ['kulou', 'zhizhu']),
    ],
    exits: [
      isoExit('zhaoge', 94, 48, 'difu', 1, 40, '朝歌 · 鹿台'),
      isoExit('zhaoge', 48, 1, 'nvwagong', 44, 86, '女娲宫'),
      isoExit('zhaoge', 1, 30, 'sishuiguan', 94, 44, '汜水关'),
      isoExit('zhaoge', 20, 1, 'mianchi', 44, 94, '渑池县'),
    ],
    npc: isoNpc('zhaoge', 48, 44, '比干'),
  },
  /** 凤鸣山 80×80：凤鸣岐山祥瑞地，安全图，散宜生观礼 */
  fengmingshan: {
    name: '凤鸣山', scene: 'fengmingshan',
    iso: { layout: 'iso/fengmingshan.json' },
    spawns: [],
    exits: [
      isoExit('fengmingshan', 40, 78, 'panxi', 44, 1, '磻溪'),
      isoExit('fengmingshan', 78, 40, 'xidacamp', 1, 44, '西岐大营'),
    ],
    npc: isoNpc('fengmingshan', 40, 40, '散宜生'),
  },
  /** 西岐大营 100×72：伐商前线，安全图，南宫适练兵 */
  xidacamp: {
    name: '西岐大营', scene: 'xidacamp',
    iso: { layout: 'iso/xidacamp.json' },
    spawns: [],
    exits: [
      isoExit('xidacamp', 1, 44, 'fengmingshan', 78, 40, '凤鸣山'),
      isoExit('xidacamp', 48, 1, 'jiepaiguan', 44, 78, '界牌关'),
    ],
    npc: isoNpc('xidacamp', 48, 40, '南宫适'),
  },
  /** 界牌关 96×80：五关首镇，妖兵前哨，西通燕山 */
  jiepaiguan: {
    name: '界牌关', scene: 'jiepaiguan',
    iso: { layout: 'iso/jiepaiguan.json' },
    spawns: [
      isoSpawn('jiepaiguan', 26, 22, ['jiaotu', 'kulou']),
      isoSpawn('jiepaiguan', 68, 20, ['kulou', 'kulou']),
      isoSpawn('jiepaiguan', 26, 44, ['jiaotu']),
      isoSpawn('jiepaiguan', 70, 46, ['jiaotu', 'zhizhu']),
      isoSpawn('jiepaiguan', 46, 64, ['kulou', 'heixiong']),
    ],
    exits: [
      isoExit('jiepaiguan', 44, 78, 'xidacamp', 48, 1, '西岐大营'),
      isoExit('jiepaiguan', 44, 1, 'lintongguan', 40, 98, '临潼关'),
      isoExit('jiepaiguan', 1, 44, 'yanshan', 78, 44, '燕山'),
    ],
  },
  /** 燕山 80×88：栈道悬崖安全图，雷震子候命 */
  yanshan: {
    name: '燕山', scene: 'yanshan',
    iso: { layout: 'iso/yanshan.json' },
    spawns: [],
    exits: [
      isoExit('yanshan', 78, 44, 'jiepaiguan', 1, 44, '界牌关'),
      isoExit('yanshan', 40, 1, 'zhongnanshan', 44, 102, '终南山'),
    ],
    npc: isoNpc('yanshan', 40, 44, '雷震子'),
  },
  /** 终南山 96×104：云中子洞府，安全图 */
  zhongnanshan: {
    name: '终南山', scene: 'zhongnanshan',
    iso: { layout: 'iso/zhongnanshan.json' },
    spawns: [],
    exits: [isoExit('zhongnanshan', 44, 102, 'yanshan', 40, 1, '燕山')],
    npc: isoNpc('zhongnanshan', 48, 44, '云中子'),
  },
  /** 临潼关 80×88：五关次镇，纵贯关道 */
  lintongguan: {
    name: '临潼关', scene: 'lintongguan',
    iso: { layout: 'iso/lintongguan.json' },
    spawns: [
      isoSpawn('lintongguan', 30, 24, ['jiaotu', 'kulou']),
      isoSpawn('lintongguan', 52, 22, ['kulou']),
      isoSpawn('lintongguan', 30, 44, ['jiaotu']),
      isoSpawn('lintongguan', 52, 46, ['kulou', 'zhizhu']),
      isoSpawn('lintongguan', 40, 64, ['jiaotu', 'heixiong']),
    ],
    exits: [
      isoExit('lintongguan', 40, 98, 'jiepaiguan', 44, 1, '界牌关'),
      isoExit('lintongguan', 40, 1, 'chuanyunguan', 44, 102, '穿云关'),
    ],
  },
  /** 穿云关 88×104：云雾锁关 */
  chuanyunguan: {
    name: '穿云关', scene: 'chuanyunguan',
    iso: { layout: 'iso/chuanyunguan.json' },
    spawns: [
      isoSpawn('chuanyunguan', 36, 26, ['jiaotu', 'kulou']),
      isoSpawn('chuanyunguan', 56, 28, ['kulou', 'kulou']),
      isoSpawn('chuanyunguan', 34, 50, ['jiaotu']),
      isoSpawn('chuanyunguan', 58, 52, ['jiaotu', 'zhizhu']),
      isoSpawn('chuanyunguan', 44, 72, ['kulou', 'heixiong']),
    ],
    exits: [
      isoExit('chuanyunguan', 44, 102, 'lintongguan', 40, 1, '临潼关'),
      isoExit('chuanyunguan', 44, 1, 'mianchi', 44, 94, '渑池县'),
    ],
  },
  /** 渑池县 104×96：五关最后一城，妖氛最重 */
  mianchi: {
    name: '渑池县', scene: 'mianchi',
    iso: { layout: 'iso/mianchi.json' },
    spawns: [
      isoSpawn('mianchi', 28, 26, ['jiaotu', 'jiaotu']),
      isoSpawn('mianchi', 74, 24, ['kulou', 'kulou']),
      isoSpawn('mianchi', 26, 48, ['zhizhu']),
      isoSpawn('mianchi', 78, 50, ['jiaotu', 'zhizhu']),
      isoSpawn('mianchi', 34, 70, ['kulou', 'heixiong']),
      isoSpawn('mianchi', 72, 72, ['jiaotu', 'kulou']),
    ],
    exits: [
      isoExit('mianchi', 44, 94, 'chuanyunguan', 44, 1, '穿云关'),
      isoExit('mianchi', 44, 1, 'zhaoge', 20, 1, '朝歌城'),
    ],
  },
  /** 冀州 96×104：妲己故里，安全图，苏护坐镇侯府 */
  jizhou: {
    name: '冀州', scene: 'jizhou',
    iso: { layout: 'iso/jizhou.json' },
    spawns: [],
    exits: [isoExit('jizhou', 86, 52, 'wild_luanzang', 1, 64, '黄泉鬼渡')],
    npc: isoNpc('jizhou', 48, 44, '苏护'),
  },
  /** 梅山 104×72：七怪山寨，袁洪称尊 */
  meishan: {
    name: '梅山', scene: 'meishan',
    iso: { layout: 'iso/meishan.json' },
    spawns: [
      isoSpawn('meishan', 40, 20, ['jiaotu']),
      isoSpawn('meishan', 66, 24, ['jiaotu', 'zhizhu']),
      isoSpawn('meishan', 26, 44, ['shanxiao']),
      isoSpawn('meishan', 76, 48, ['jiaotu', 'shanxiao']),
      isoSpawn('meishan', 24, 44, ['yuanhong']),
    ],
    exits: [isoExit('meishan', 1, 44, 'wild_shanxiao', 102, 52, '骷髅山白骨洞')],
  },
  /** 三仙岛 112×72：九曲黄河阵，云霄布阵 */
  sanxiandao: {
    name: '三仙岛', scene: 'sanxiandao',
    iso: { layout: 'iso/sanxiandao.json' },
    spawns: [
      isoSpawn('sanxiandao', 30, 22, ['jiaotu', 'jiaotu']),
      isoSpawn('sanxiandao', 78, 24, ['jiaotu', 'zhizhu']),
      isoSpawn('sanxiandao', 28, 52, ['zhizhu']),
      isoSpawn('sanxiandao', 80, 54, ['jiaotu']),
      isoSpawn('sanxiandao', 84, 36, ['yunxiao']),
    ],
    exits: [isoExit('sanxiandao', 1, 36, 'jinaodao', 102, 44, '金鳌岛碧游宫')],
  },
  /** 峨眉山罗浮洞 72×104：赵公明财宝洞府，安全图 */
  emeishan: {
    name: '峨眉山罗浮洞', scene: 'emeishan',
    iso: { layout: 'iso/emeishan.json' },
    spawns: [],
    exits: [isoExit('emeishan', 70, 52, 'wild_kunlun', 1, 44, '昆仑山道')],
    npc: isoNpc('emeishan', 40, 44, '赵公明'),
  },
  /** 北海 112×80：闻仲十年征伐的冰海战场 */
  beihai: {
    name: '北海', scene: 'beihai',
    iso: { layout: 'iso/beihai.json' },
    spawns: [
      isoSpawn('beihai', 30, 24, ['kulou', 'kulou']),
      isoSpawn('beihai', 78, 22, ['jiaotu']),
      isoSpawn('beihai', 26, 48, ['zhizhu', 'kulou']),
      isoSpawn('beihai', 82, 50, ['jiaotu', 'heixiong']),
      isoSpawn('beihai', 52, 64, ['kulou', 'zhizhu']),
    ],
    exits: [isoExit('beihai', 56, 78, 'juelongling', 60, 1, '绝龙岭')],
  },
  /** 摘星楼 72×96：纣王亲守高台 */
  zhaixinglou: {
    name: '摘星楼', scene: 'zhaixinglou',
    iso: { layout: 'iso/zhaixinglou.json' },
    spawns: [
      isoSpawn('zhaixinglou', 40, 40, ['kulou', 'kulou']),
      isoSpawn('zhaixinglou', 30, 62, ['jiaotu']),
      isoSpawn('zhaixinglou', 36, 26, ['zhouwang']),
    ],
    exits: [isoExit('zhaixinglou', 1, 48, 'nvwagong', 86, 44, '女娲宫')],
  },
  /** 女娲宫 88×88：朝歌圣庙，安全图，女娲娘娘坐镇娲皇大殿 */
  nvwagong: {
    name: '女娲宫', scene: 'nvwagong',
    iso: { layout: 'iso/nvwagong.json' },
    spawns: [],
    exits: [
      isoExit('nvwagong', 44, 86, 'zhaoge', 48, 1, '朝歌城'),
      isoExit('nvwagong', 86, 44, 'zhaixinglou', 1, 48, '摘星楼'),
    ],
    npc: isoNpc('nvwagong', 44, 40, '女娲娘娘'),
  },
  /** 汜水关 96×88：关隘重地，妖兵列阵，西通绝龙岭 */
  sishuiguan: {
    name: '汜水关', scene: 'sishuiguan',
    iso: { layout: 'iso/sishuiguan.json' },
    spawns: [
      isoSpawn('sishuiguan', 24, 22, ['jiaotu', 'kulou']),
      isoSpawn('sishuiguan', 70, 20, ['kulou', 'kulou']),
      isoSpawn('sishuiguan', 30, 44, ['jiaotu']),
      isoSpawn('sishuiguan', 66, 44, ['jiaotu', 'zhizhu']),
      isoSpawn('sishuiguan', 24, 64, ['kulou']),
      isoSpawn('sishuiguan', 72, 66, ['jiaotu', 'heixiong']),
    ],
    exits: [
      isoExit('sishuiguan', 94, 44, 'zhaoge', 1, 30, '朝歌城'),
      isoExit('sishuiguan', 1, 44, 'juelongling', 118, 52, '绝龙岭'),
    ],
  },
  /** 磻溪 88×96：渭水钓台安全图，武吉守着子牙先生当年的钓竿 */
  panxi: {
    name: '磻溪', scene: 'panxi',
    iso: { layout: 'iso/panxi.json' },
    spawns: [],
    exits: [
      isoExit('panxi', 86, 44, 'wild_yunmeng', 1, 44, '云梦泽'),
      isoExit('panxi', 44, 1, 'fengmingshan', 40, 78, '凤鸣山'),
    ],
    npc: isoNpc('panxi', 56, 40, '武吉'),
  },
  /** 绝龙岭 120×104：闻太师亲征结阵之地，深谷 Boss 场坪 */
  juelongling: {
    name: '绝龙岭', scene: 'juelongling',
    iso: { layout: 'iso/juelongling.json' },
    spawns: [
      isoSpawn('juelongling', 60, 20, ['jiaotu', 'jiaotu']),
      isoSpawn('juelongling', 92, 36, ['jiaotu']),
      isoSpawn('juelongling', 88, 70, ['zhizhu', 'kulou']),
      isoSpawn('juelongling', 56, 82, ['jiaotu', 'heixiong']),
      isoSpawn('juelongling', 20, 52, ['wenzhong']),
    ],
    exits: [
      isoExit('juelongling', 118, 52, 'sishuiguan', 1, 44, '汜水关'),
      isoExit('juelongling', 60, 1, 'beihai', 56, 78, '北海'),
    ],
  },
};

/** 把基础布局铺到每个区段：怪组等比例补充、每 2 个区段补一组完整出口；NPC/酒馆留在起点区段 */
function expandMap(id: string, base: BaseLayout): WorldMap {
  const segments = base.segments ?? DEFAULT_SEGMENTS;
  const w = base.width ?? TILE_W * segments;
  const h = base.height ?? MAP_H;
  const minY = base.walk?.minY ?? DEFAULT_WALK_BOUNDS.minY;
  const maxY = base.walk?.maxY ?? DEFAULT_WALK_BOUNDS.maxY;

  // 等距构件地图：大小由该图自己的格网推导；bounds 覆盖整个菱形，
  // 具体可走性完全交给布局碰撞（边界格 y 可低至 16px，不能被旧卷轴的 60px 内缩裁掉）
  if (base.iso) {
    const isoSize = isoWorldSize(isoGridOf(id));
    const iw = isoSize.w, ih = isoSize.h;
    return {
      id, name: base.name, scene: base.scene,
      segments: Math.max(1, Math.round(iw / TILE_W)), w: iw, h: ih,
      bounds: { minX: 0, maxX: iw, minY: 0, maxY: ih },
      spawns: base.spawns.map((s) => ({ group: [...s.group], x: s.x, y: s.y })),
      exits: base.exits.map((e) => ({ ...e })),
      npc: base.npc ? { ...base.npc } : undefined,
      tavern: base.tavern ? { ...base.tavern } : undefined,
      teleporter: base.teleporter ? { ...base.teleporter } : undefined,
      iso: { ...base.iso },
    };
  }

  const spawns: MapSpawn[] = [];
  const exits: MapExit[] = [];
  for (let seg = 0; seg < segments; seg++) {
    const off = seg * TILE_W;
    for (const s of base.spawns) spawns.push({ group: [...s.group], x: s.x + off, y: s.y });
    if (seg % 2 === 0 || seg === segments - 1) {
      for (const e of base.exits) exits.push({ ...e, x: e.x + off });
    }
  }
  return {
    id, name: base.name, scene: base.scene, segments, w, h,
    bounds: { minX: 60, maxX: w - 60, minY, maxY },
    spawns, exits,
    npc: base.npc ? { ...base.npc } : undefined,
    tavern: base.tavern ? { ...base.tavern } : undefined,
    teleporter: base.teleporter ? { ...base.teleporter } : undefined,
  };
}

export const WORLD_MAPS: Record<string, WorldMap> = Object.fromEntries(
  Object.entries(BASE_MAPS).map(([id, base]) => [id, expandMap(id, base)]),
);

// 四境每图配一名「土行孙」传送 NPC：等距图默认站在格网中心（渲染时吸附到最近可走格），
// 横版长卷站中央地带；靠近即弹出传送菜单直达任意舆图
for (const m of Object.values(WORLD_MAPS)) {
  if (m.teleporter) continue;
  const mid = m.iso
    ? at(m.id, isoGridOf(m.id).cols >> 1, isoGridOf(m.id).rows >> 1)
    : { x: m.w / 2, y: (m.bounds.minY + m.bounds.maxY) / 2 };
  m.teleporter = { ...mid, name: '土行孙' };
}

// ===== 任务链 =====

export interface QuestDef {
  id: string;
  name: string;
  desc: string;
  targets: { defIds: string[]; need: number; label: string };
  rewardSilver: number;
  rewardItems: { heal?: number; mana?: number; respec?: number };
}

export const QUESTS: QuestDef[] = [
  {
    id: 'q1',
    name: '穿云荡寇',
    desc: '穿云岭古道妖狼成群，截教妖人暗中煽动兽性。少侠替西岐扫平狼患，子牙先生必有重谢。',
    targets: { defIds: ['yelang'], need: 3, label: '清剿穿云妖狼' },
    rewardSilver: 100,
    rewardItems: { heal: 2, respec: 1 },
  },
  {
    id: 'q2',
    name: '黄泉镇魂',
    desc: '黄泉鬼渡阴气冲天，黄泉骨卒与幽冥蛛妖日夜作祟。少侠道法已成，前去净化此地。',
    targets: { defIds: ['kulou', 'zhizhu'], need: 4, label: '镇压黄泉骨卒或幽冥蛛妖' },
    rewardSilver: 160,
    rewardItems: { mana: 2 },
  },
  {
    id: 'q3',
    name: '白骨洞讨妖',
    desc: '白骨洞妖王率众占据骷髅山白骨洞，助纣为虐。西岐城张榜悬赏，讨伐此獠！',
    targets: { defIds: ['shanxiaowang'], need: 1, label: '讨伐白骨洞妖王' },
    rewardSilver: 300,
    rewardItems: { heal: 2, mana: 1 },
  },
  {
    id: 'q4',
    name: '云梦泽靖泽',
    desc: '云梦泽烟波之下妖氛翻涌，截教门人驱蛟布阵，欲断西岐水路粮道。少侠驾舟入泽，扫平妖群，靖我泽国！',
    targets: { defIds: ['shuiyao', 'yelang'], need: 5, label: '清缴云梦蛟妖或穿云妖狼' },
    rewardSilver: 220,
    rewardItems: { heal: 2, mana: 2 },
  },
  {
    id: 'q5',
    name: '五关破阵',
    desc: '界牌关、临潼关、穿云关一线妖兵列阵，五关不破，朝歌难进。少侠随大军攻关，扫平关隘妖氛！',
    targets: { defIds: ['jiaotu', 'kulou'], need: 8, label: '破五关妖兵' },
    rewardSilver: 400,
    rewardItems: { heal: 3, mana: 2 },
  },
  {
    id: 'q6',
    name: '梅山收妖',
    desc: '梅山七怪白猿袁洪称尊，九转玄功刀枪不入。子牙先生敕令：上山收伏此獠，绝大军后顾之忧！',
    targets: { defIds: ['yuanhong'], need: 1, label: '收伏梅山袁洪' },
    rewardSilver: 600,
    rewardItems: { heal: 3, mana: 3, respec: 1 },
  },
  {
    id: 'q7',
    name: '三仙岛破阵',
    desc: '三霄之首云霄仙子于三仙岛布下九曲黄河石阵，阵中仙光惑人。破阵者，方有资格登鹿台！',
    targets: { defIds: ['yunxiao'], need: 1, label: '破三仙岛云霄阵' },
    rewardSilver: 700,
    rewardItems: { heal: 3, mana: 3 },
  },
  {
    id: 'q8',
    name: '鹿台决战',
    desc: '狐妖妲己现身朝歌鹿台，妖火照彻夜空。五关已破、梅山已平、黄河阵已破——登台讨妖，代天封神！',
    targets: { defIds: ['daji'], need: 1, label: '讨伐九尾狐妖·妲己' },
    rewardSilver: 800,
    rewardItems: { heal: 3, mana: 3, respec: 1 },
  },
];

export function activeQuest(gs: GameState): QuestDef | null {
  return gs.questStep >= 1 && gs.questStep <= QUESTS.length ? QUESTS[gs.questStep - 1] : null;
}

export function questReady(gs: GameState): boolean {
  const q = activeQuest(gs);
  return !!q && gs.questKills >= q.targets.need;
}

/** 击杀记账；若刚好达成当前任务则返回该任务 */
export function onKilled(gs: GameState, defIds: string[]): QuestDef | null {
  const q = activeQuest(gs);
  if (!q) return null;
  const n = defIds.filter((id) => q.targets.defIds.includes(id)).length;
  if (n <= 0) return null;
  gs.questKills = Math.min(q.targets.need, gs.questKills + n);
  return gs.questKills >= q.targets.need ? q : null;
}

// ===== 游戏状态与存档 =====

/** 背包消耗品：heal/mana 会带入战斗，respec 只在世界界面使用 */
export interface Inventory { heal: number; mana: number; respec: number }

export interface GameState {
  classId: string;
  /** 出战宠物实例 uid */
  activePetUid: string;
  /** 召唤兽个体（含初始宠物与收服的怪），上限 6 */
  petInstances: PetInstance[];
  /** 酒馆雇佣的组队同伴（上限 COMPANION_CAP） */
  companions: Companion[];
  playerName: string;
  silver: number;
  inv: Inventory;
  /** 等级与经验 */
  level: number;
  exp: number;
  /** 加点：已分配的四维潜能 */
  stats: AllocStats;
  /** 未分配的潜能点 */
  potential: number;
  /** 装备：已穿（槽位 → 装备 uid）与背包（含已穿的） */
  equipped: Partial<Record<'weapon' | 'armor' | 'accessory', string>>;
  bag: EquipmentItem[];
  /** 师门法术等级（skillId → 等级，缺省 1） */
  skillLevels: Record<string, number>;
  /** 0=未接任务，1..QUESTS.length=第 N 个任务进行中，>QUESTS.length=全部完成 */
  questStep: number;
  questKills: number;
  mapId: string;
  /** 玩家位置（地图坐标） */
  px: number;
  py: number;
  /** 本次访问某地图期间已清除的怪物组键（`mapId:下标`），换图即重置刷怪 */
  killedGroups: Record<string, boolean>;
}

// ===== 召唤兽（宠物个体） =====

export interface PetInstance {
  uid: string;
  /** 物种 defId（初始宠物为 PETS 表，收服的为 MONSTERS 表） */
  defId: string;
  level: number;
  exp: number;
  /** 召唤兽装备（槽位 → 装备 uid）；与人物共用背包，只允许 PET_EQUIP_SLOTS */
  equipped?: Partial<Record<EquipSlot, string>>;
  /** 炼妖后的技能表（缺省走物种原始技能） */
  skillIds?: string[];
  /** 炼妖成长系数（缺省 1，叠乘在全属性上） */
  growth?: number;
}

export const PETS_CAP = 6;

export function petExpNeeded(level: number): number {
  return 30 + level * 25;
}

/** 宠物成长率：每级 +8% 全属性 */
export function petGrowth(level: number): number {
  return 1 + 0.08 * (level - 1);
}

/** 兼容初始宠物（PETS 表）与收服怪（MONSTERS 表）的物种数据 */
export function petBase(defId: string): { name: string; emoji: string; stats: UnitStats; resists: Resists; skillIds: string[] } {
  const p = PETS.find((x) => x.id === defId);
  if (p) return { name: p.name, emoji: p.emoji, stats: p.stats, resists: p.resists, skillIds: p.skillIds };
  const m = MONSTERS[defId];
  if (m) return { name: m.name, emoji: m.emoji, stats: m.stats, resists: m.resists, skillIds: m.skillIds };
  throw new Error(`未知宠物: ${defId}`);
}

export function petUnitStats(inst: PetInstance): UnitStats {
  const base = petBase(inst.defId).stats;
  const g = petGrowth(inst.level) * (inst.growth ?? 1);
  const r = (v: number) => Math.round(v * g);
  return { hp: r(base.hp), mp: r(base.mp), atk: r(base.atk), def: r(base.def), mag: r(base.mag), spd: r(base.spd) };
}

/** 出战召唤兽的完整战斗规格：等级/成长后的属性 + 炼妖后的技能表 */
export function petUnitSpec(inst: PetInstance): {
  defId: string; name: string; emoji: string; stats: UnitStats; resists: Resists; skillIds: string[];
} {
  const b = petBase(inst.defId);
  return {
    defId: inst.defId, name: b.name, emoji: b.emoji,
    stats: petUnitStats(inst), resists: b.resists,
    skillIds: inst.skillIds?.length ? [...inst.skillIds] : [...b.skillIds],
  };
}

export function activePet(gs: GameState): PetInstance | undefined {
  return gs.petInstances.find((p) => p.uid === gs.activePetUid) ?? gs.petInstances[0];
}

// ===== 炼妖（两只召唤兽合成一只） =====

export const FUSE_COST = 100;
export const FUSE_GROWTH_MIN = 1;
export const FUSE_GROWTH_MAX = 1.2;
export const FUSE_EXTRA_SKILL_CHANCE = 0.2;
export const FUSE_SKILL_POOL = ['pt_xue', 'pt_dun', 'pt_lei'];
export const PET_SKILL_CAP = 4;

export interface FuseResult {
  ok: boolean;
  reason?: string;
  result?: PetInstance;
  lines: string[];
}

/**
 * 炼妖：消耗两只非出战召唤兽 + 银两，合成一只新个体。
 * 物种二选一 / 等级取较高 / 技能取并集去重最多 3 个 / 20% 领悟通用技能 / 成长系数 1.00~1.20。
 * 装备不继承，出战宠物不变。
 */
export function fusePets(gs: GameState, uidA: string, uidB: string): FuseResult {
  const fail = (reason: string): FuseResult => ({ ok: false, reason, lines: [] });
  if (uidA === uidB) return fail('请选择两只不同的召唤兽');
  const a = gs.petInstances.find((p) => p.uid === uidA);
  const b = gs.petInstances.find((p) => p.uid === uidB);
  if (!a || !b) return fail('召唤兽不存在');
  if (uidA === gs.activePetUid || uidB === gs.activePetUid) return fail('出战中的召唤兽不能参与炼妖');
  if (gs.silver < FUSE_COST) return fail(`银两不足（需要 ${FUSE_COST}）`);

  const specA = petUnitSpec(a), specB = petUnitSpec(b);
  const defId = Math.random() < 0.5 ? a.defId : b.defId;
  const level = Math.max(a.level, b.level);
  const growth = Math.round((FUSE_GROWTH_MIN + Math.random() * (FUSE_GROWTH_MAX - FUSE_GROWTH_MIN)) * 100) / 100;

  const union = [...new Set([...specA.skillIds, ...specB.skillIds])];
  for (let i = union.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [union[i], union[j]] = [union[j], union[i]];
  }
  const skillIds = union.slice(0, Math.min(3, union.length));

  const lines: string[] = [`消耗银两 ${FUSE_COST}`];
  let learned = '';
  if (Math.random() < FUSE_EXTRA_SKILL_CHANCE && skillIds.length < PET_SKILL_CAP) {
    const pool = FUSE_SKILL_POOL.filter((id) => !skillIds.includes(id));
    if (pool.length > 0) {
      learned = pool[Math.floor(Math.random() * pool.length)];
      skillIds.push(learned);
      lines.push(`✨ 领悟通用技能【${SKILLS[learned]?.name ?? learned}】`);
    }
  }

  const result: PetInstance = {
    uid: `pet_${++petUidSeq}_${Math.random().toString(36).slice(2, 6)}`,
    defId, level, exp: 0, growth, skillIds, equipped: {},
  };
  gs.silver -= FUSE_COST;
  gs.petInstances = gs.petInstances.filter((p) => p.uid !== uidA && p.uid !== uidB);
  gs.petInstances.push(result);
  saveGame(gs);

  lines.unshift(
    `炼成【${petBase(defId).name}】Lv.${level} · 成长 ×${growth.toFixed(2)}`,
    `技能：${skillIds.map((id) => SKILLS[id]?.name ?? id).join(' / ') || '无'}`,
  );
  return { ok: true, result, lines };
}

export const BAG_CAP = 12;
export const REFINE_COST = 30;

// ===== 加点（潜能） =====

export interface AllocStats { str: number; vit: number; int: number; agi: number }

/** 每级获得的潜能点 */
export const POTENTIAL_PER_LEVEL = 5;

export const ALLOC_INFO: { key: keyof AllocStats; name: string; desc: string }[] = [
  { key: 'str', name: '力量', desc: '每点 攻击 +2' },
  { key: 'vit', name: '根骨', desc: '每点 气血 +12、防 +1' },
  { key: 'int', name: '灵性', desc: '每点 法强 +2、法力 +8' },
  { key: 'agi', name: '敏捷', desc: '每点 速度 +2' },
];

export function expNeeded(level: number): number {
  return 40 + level * 35;
}

/** 加点带来的属性加成 */
export function allocationBonus(gs: GameState): StatBonus {
  const s = gs.stats;
  return {
    atk: s.str * 2,
    def: s.vit * 1,
    mag: s.int * 2,
    spd: s.agi * 2,
    hp: s.vit * 12,
    mp: s.int * 8,
  };
}

/** 加点 + 装备的合计加成（战斗主角用） */
export function totalBonus(gs: GameState): StatBonus {
  const a = allocationBonus(gs);
  const e = equipBonus(gs);
  return {
    atk: a.atk + e.atk,
    def: a.def + e.def,
    mag: a.mag + e.mag,
    spd: a.spd + e.spd,
    hp: a.hp + e.hp,
    mp: a.mp + e.mp,
  };
}

/** 已穿装备的属性加成汇总 */
export function equipBonus(gs: GameState): StatBonus {
  const total: StatBonus = { atk: 0, def: 0, mag: 0, spd: 0, hp: 0, mp: 0 };
  for (const uid of Object.values(gs.equipped)) {
    const it = gs.bag.find((i) => i.uid === uid);
    if (!it) continue;
    const b = itemBonus(it);
    for (const k of Object.keys(total) as Array<keyof StatBonus>) total[k] += b[k];
  }
  return total;
}

/** 出战召唤兽装备加成（只统计 PET_EQUIP_SLOTS，经 BattleOptions.petBonus 只作用于宠物） */
export function petEquipBonus(gs: GameState): StatBonus {
  const total = emptyBonus();
  const eq = activePet(gs)?.equipped;
  if (!eq) return total;
  for (const slot of PET_EQUIP_SLOTS) {
    const uid = eq[slot];
    if (!uid) continue;
    const it = gs.bag.find((i) => i.uid === uid);
    if (!it) continue;
    const b = itemBonus(it);
    for (const k of Object.keys(total) as Array<keyof StatBonus>) total[k] += b[k];
  }
  return total;
}

/** 该装备是否已被人物或任一召唤兽穿戴（共用装备池，避免一件两穿） */
export function isEquippedAnywhere(gs: GameState, uid: string): boolean {
  if (Object.values(gs.equipped).includes(uid)) return true;
  return gs.petInstances.some((p) => p.equipped && Object.values(p.equipped).includes(uid));
}

/** 出售装备换银两：已穿戴的不允许出售；按品阶回收（★稀有词条另计） */
export function sellEquipment(gs: GameState, uid: string): { ok: boolean; reason?: string; silver?: number } {
  const idx = gs.bag.findIndex((i) => i.uid === uid);
  if (idx < 0) return { ok: false, reason: '装备不存在' };
  if (isEquippedAnywhere(gs, uid)) return { ok: false, reason: '已穿戴的装备请先卸下再出售' };
  const silver = sellValue(gs.bag[idx]);
  gs.bag.splice(idx, 1);
  gs.silver += silver;
  saveGame(gs);
  return { ok: true, silver };
}

/** 使用洗点丹：清空四维加点并全额退还潜能点（世界侧消耗品，不进战斗） */
export function useRespecPill(gs: GameState): { ok: boolean; reason?: string } {
  if ((gs.inv.respec ?? 0) <= 0) return { ok: false, reason: '没有洗点丹' };
  const spent = gs.stats.str + gs.stats.vit + gs.stats.int + gs.stats.agi;
  if (spent <= 0) return { ok: false, reason: '尚未分配潜能点' };
  gs.inv.respec--;
  gs.potential += spent;
  gs.stats = { str: 0, vit: 0, int: 0, agi: 0 };
  saveGame(gs);
  return { ok: true };
}

// ===== 组队同伴（酒馆雇佣） =====

export interface Companion {
  uid: string;
  templateId: string;
  level: number;
}

export interface CompanionTemplate {
  id: string;
  name: string;
  /** 复用 CLASSES 里的数值、技能与精灵素材 */
  classId: string;
  desc: string;
  price: number;
}

export const COMPANION_CAP = 2;
export const HIRE_COST = 150;

export const COMPANION_TEMPLATES: CompanionTemplate[] = [
  { id: 'wuzhu', name: '黄泉引灯人', classId: 'wuzhu', desc: '遗忘 / 三尸蛊 / 鬼火，擅长压制', price: HIRE_COST },
  { id: 'lingguan', name: '玉虚仙官', classId: 'lingguan', desc: '打神鞭与四系仙法，群体输出', price: HIRE_COST },
  { id: 'moshi', name: '碧游妖刀客', classId: 'moshi', desc: '加攻 / 重击 / 摄血，能扛能打', price: HIRE_COST },
  { id: 'neza', name: '陈塘先锋官', classId: 'xiake', desc: '火尖枪刺与乾坤圈封印，近战强控', price: HIRE_COST },
];

export function companionGrowth(level: number): number {
  return 1 + 0.06 * (level - 1);
}

/** 同伴战斗规格：职业数值按等级缩放；技能沿用职业表，按 1 级生效 */
export function companionSpec(c: Companion): AllySpec {
  const t = COMPANION_TEMPLATES.find((x) => x.id === c.templateId) ?? COMPANION_TEMPLATES[0];
  const cls = classById(t.classId);
  const g = companionGrowth(c.level);
  const r = (v: number) => Math.round(v * g);
  return {
    defId: t.classId, name: t.name, emoji: cls.emoji,
    stats: {
      hp: r(cls.stats.hp), mp: r(cls.stats.mp), atk: r(cls.stats.atk),
      def: r(cls.stats.def), mag: r(cls.stats.mag), spd: r(cls.stats.spd),
    },
    resists: cls.resists,
    skillIds: [...cls.skillIds],
  };
}

let companionUidSeq = 0;

export function hireCompanion(gs: GameState, templateId: string): { ok: boolean; reason?: string } {
  const t = COMPANION_TEMPLATES.find((x) => x.id === templateId);
  if (!t) return { ok: false, reason: '没有这位同伴' };
  if (gs.companions.length >= COMPANION_CAP) return { ok: false, reason: `队伍最多 ${COMPANION_CAP} 名同伴` };
  if (gs.silver < t.price) return { ok: false, reason: '银两不足' };
  gs.silver -= t.price;
  gs.companions.push({
    uid: `cmp_${++companionUidSeq}_${Math.random().toString(36).slice(2, 6)}`,
    templateId, level: Math.max(1, gs.level),
  });
  saveGame(gs);
  return { ok: true };
}

/** 解雇不退款 */
export function dismissCompanion(gs: GameState, uid: string): { ok: boolean; reason?: string } {
  const i = gs.companions.findIndex((c) => c.uid === uid);
  if (i < 0) return { ok: false, reason: '同伴不存在' };
  gs.companions.splice(i, 1);
  saveGame(gs);
  return { ok: true };
}

let petUidSeq = 0;

export function newGame(setup: { classId: string; petId: string; playerName: string }): GameState {
  const first: PetInstance = { uid: `pet_${++petUidSeq}_${Math.random().toString(36).slice(2, 6)}`, defId: setup.petId, level: 1, exp: 0, equipped: {} };
  // 出生地：朝歌帝都——落在比干身旁的御街（不可走时渲染器会就近吸附到可走格）
  const zhao = WORLD_MAPS.zhaoge;
  const zhaoHome = zhao.npc ?? zhao.teleporter!;
  return {
    classId: setup.classId,
    activePetUid: first.uid,
    petInstances: [first],
    companions: [],
    playerName: setup.playerName || '无名少侠',
    silver: 50,
    inv: { heal: 3, mana: 3, respec: 0 },
    level: 1,
    exp: 0,
    stats: { str: 0, vit: 0, int: 0, agi: 0 },
    potential: 0,
    equipped: {},
    bag: [],
    skillLevels: {},
    questStep: 0,
    questKills: 0,
    mapId: 'zhaoge',
    px: zhaoHome.x,
    py: zhaoHome.y + 140,
    killedGroups: {},
  };
}

const SAVE_KEY = 'shanhai-save-1';

export function saveGame(gs: GameState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(gs));
  } catch {
    // 隐私模式等场景下静默失败
  }
}

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const gs = JSON.parse(raw) as GameState;
    if (!gs || !gs.classId || !WORLD_MAPS[gs.mapId]) return null;
    // 旧存档迁移：宠物个体化（pets/petId → petInstances）、等级、装备、加点
    const legacy = gs as unknown as { pets?: string[]; petId?: string };
    if (!Array.isArray(gs.petInstances) || gs.petInstances.length === 0) {
      const species: string[] = Array.isArray(legacy.pets) && legacy.pets.length > 0 ? legacy.pets : [legacy.petId ?? 'linghu'];
      gs.petInstances = species.map((defId) => ({ uid: `pet_${++petUidSeq}_${Math.random().toString(36).slice(2, 6)}`, defId, level: 1, exp: 0 }));
      gs.activePetUid = gs.petInstances[0].uid;
    }
    if (!gs.activePetUid || !gs.petInstances.some((p) => p.uid === gs.activePetUid)) {
      gs.activePetUid = gs.petInstances[0].uid;
    }
    if (typeof gs.level !== 'number') gs.level = 1;
    if (typeof gs.exp !== 'number') gs.exp = 0;
    if (!gs.equipped) gs.equipped = {};
    if (!Array.isArray(gs.bag)) gs.bag = [];
    if (!gs.skillLevels || typeof gs.skillLevels !== 'object') gs.skillLevels = {};
    if (!gs.stats) gs.stats = { str: 0, vit: 0, int: 0, agi: 0 };
    if (typeof gs.potential !== 'number') gs.potential = Math.max(0, gs.level - 1) * POTENTIAL_PER_LEVEL;
    // 新字段迁移：洗点丹、宠物装备位
    if (!gs.inv) gs.inv = { heal: 0, mana: 0, respec: 0 };
    if (typeof gs.inv.respec !== 'number') gs.inv.respec = 0;
    for (const p of gs.petInstances) if (!p.equipped) p.equipped = {};
    if (!Array.isArray(gs.companions)) gs.companions = [];
    return gs;
  } catch {
    return null;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // ignore
  }
}

// ===== 奖励与掉落 =====

const SILVER_PER_KILL: Record<string, number> = {
  yelang: 14,
  kulou: 16,
  shanxiao: 18,
  zhizhu: 26,
  heixiong: 36,
  shanxiaowang: 90,
  shuiyao: 22,
  daji: 250,
  wenzhong: 180,
  jiaotu: 24,
  yuanhong: 160,
  yunxiao: 170,
  zhouwang: 400,
};

/**
 * 掉落装备品阶权重 [凡品, 良品, 极品]：怪物越强，高品质权重越高。
 * 一组怪取组内「品质期望」最高者作为该组的掉落池。
 */
export const DROP_TIER_WEIGHTS: Record<string, [number, number, number]> = {
  default: [75, 23, 2],
  yelang: [80, 20, 0],
  kulou: [70, 28, 2],
  shanxiao: [55, 40, 5],
  zhizhu: [35, 50, 15],
  heixiong: [40, 50, 10],
  shanxiaowang: [0, 20, 80],
  shuiyao: [55, 38, 7],
  daji: [0, 5, 95],
  wenzhong: [0, 10, 90],
  jiaotu: [45, 45, 10],
  yuanhong: [0, 10, 90],
  yunxiao: [0, 10, 90],
  zhouwang: [0, 0, 100],
};

/** 头目名单：必掉洗点丹/装备/凝气丹 */
const BOSS_IDS = new Set(['shanxiaowang', 'daji', 'wenzhong', 'yuanhong', 'yunxiao', 'zhouwang']);

/** 洗点丹掉落：头目必掉，普通战斗 8% */
export const RESPEC_DROP_CHANCE = 0.08;

export function dropTierFor(enemyIds: string[]): 1 | 2 | 3 {
  let best: [number, number, number] = DROP_TIER_WEIGHTS.default;
  let bestScore = -1;
  for (const id of enemyIds) {
    const w = DROP_TIER_WEIGHTS[id] ?? DROP_TIER_WEIGHTS.default;
    const score = w[1] + 2 * w[2];
    if (score > bestScore) { best = w; bestScore = score; }
  }
  return rollTier(best);
}

export interface RewardSummary {
  lines: string[];
  questCompleted?: string;
}

/** 战斗结算：扣道具、发银两、掷掉落、收服宠物、记任务（胜败都结算道具消耗） */
export function settleBattle(
  gs: GameState,
  info: { winner: 'ally' | 'enemy' | null; enemyIds: string[]; itemsUsed: { heal: number; mana: number }; caught?: string[] },
  groupKey: string,
): RewardSummary {
  // 1. 背包扣耗（以战斗开始时的存量为基准）
  const start = battleStartInventory.get(groupKey) ?? { ...gs.inv };
  battleStartInventory.delete(groupKey);
  gs.inv = {
    ...gs.inv,
    heal: Math.max(0, start.heal - info.itemsUsed.heal),
    mana: Math.max(0, start.mana - info.itemsUsed.mana),
  };

  const lines: string[] = [];
  if (info.winner !== 'ally') {
    lines.push('败北而归……休整后再战。');
    saveGame(gs);
    return { lines };
  }

  gs.killedGroups[groupKey] = true;

  // 2. 收服的召唤兽入栏（以人物当前等级入场）
  for (const defId of info.caught ?? []) {
    if (gs.petInstances.length >= PETS_CAP) {
      lines.push(`宠物栏已满，无奈放生了 ${MONSTERS[defId]?.name ?? defId}`);
    } else {
      const inst: PetInstance = {
        uid: `pet_${++petUidSeq}_${Math.random().toString(36).slice(2, 6)}`,
        defId,
        level: Math.max(1, gs.level),
        exp: 0,
        equipped: {},
      };
      gs.petInstances.push(inst);
      lines.push(`收服召唤兽：${MONSTERS[defId]?.name ?? defId}（Lv.${inst.level}）！`);
    }
  }

  // 3. 银两与掉落
  let silver = 0;
  const drops: { itemId: 'heal' | 'mana'; n: number }[] = [];
  for (const id of info.enemyIds) {
    silver += SILVER_PER_KILL[id] ?? 10;
    if (Math.random() < 0.35) drops.push({ itemId: 'heal', n: 1 });
    else if (Math.random() < 0.25) drops.push({ itemId: 'mana', n: 1 });
  }
  if (info.enemyIds.some((id) => BOSS_IDS.has(id))) drops.push({ itemId: 'mana', n: 2 });
  gs.silver += silver;
  for (const d of drops) gs.inv[d.itemId] += d.n;
  lines.push(`获得银两 ${silver}`);
  for (const d of drops) {
    const name = d.itemId === 'heal' ? '金疮药' : '凝气丹';
    lines.push(`获得 ${name} ×${d.n}`);
  }
  const isBossFight = info.enemyIds.some((id) => BOSS_IDS.has(id));
  if (isBossFight || Math.random() < RESPEC_DROP_CHANCE) {
    gs.inv.respec = (gs.inv.respec ?? 0) + 1;
    lines.push('获得 洗点丹 ×1');
  }

  // 4. 装备掉落（头目必掉，普通怪 18%；品阶按怪物难度权重）
  const tier = dropTierFor(info.enemyIds);
  if (Math.random() < (isBossFight ? 1 : 0.18)) {
    if (gs.bag.length >= BAG_CAP) {
      lines.push('背包已满，装备遗落在地……');
    } else {
      const eq = generateEquipment(tier);
      gs.bag.push(eq);
      lines.push(`获得装备 ${describeItem(eq)}`);
    }
  }

  // 5. 经验与升级（每级 +5 潜能点）
  const EXP_PER_KILL: Record<string, number> = { yelang: 18, kulou: 20, shanxiao: 24, zhizhu: 30, heixiong: 42, shanxiaowang: 120, shuiyao: 26, daji: 260, jiaotu: 30, wenzhong: 180, yuanhong: 160, yunxiao: 170, zhouwang: 400 };
  let exp = 0;
  for (const id of info.enemyIds) exp += EXP_PER_KILL[id] ?? 12;
  gs.exp += exp;
  lines.push(`获得经验 ${exp}`);
  while (gs.exp >= expNeeded(gs.level)) {
    gs.exp -= expNeeded(gs.level);
    gs.level++;
    gs.potential += POTENTIAL_PER_LEVEL;
    lines.push(`⭐ 升级！当前 Lv.${gs.level}（潜能点 +${POTENTIAL_PER_LEVEL}）`);
  }

  // 同伴不吃经验，等级始终同步人物等级
  for (const c of gs.companions) c.level = gs.level;

  // 出战召唤兽分得一半经验并升级
  const pet = activePet(gs);
  if (pet && info.winner === 'ally' && exp > 0) {
    pet.exp += Math.round(exp / 2);
    while (pet.exp >= petExpNeeded(pet.level)) {
      pet.exp -= petExpNeeded(pet.level);
      pet.level++;
      lines.push(`🐾 出战召唤兽升级：${petBase(pet.defId).name} Lv.${pet.level}！`);
    }
  }

  // 6. 任务进度
  const done = onKilled(gs, info.enemyIds);
  if (done) lines.push(`任务达成：「${done.name}」—— 回西岐城向姜子牙交付！`);

  saveGame(gs);
  return { lines, questCompleted: done?.name };
}

/** 战斗开始前登记背包存量（settleBattle 用） */
const battleStartInventory = new Map<string, { heal: number; mana: number }>();
export function registerBattleInventory(groupKey: string, inv: { heal: number; mana: number }): void {
  battleStartInventory.set(groupKey, { ...inv });
}

// ===== NPC 对话 =====

export interface DialogueAction {
  label: string;
  kind: 'accept' | 'claim' | 'close';
}

export interface Dialogue {
  name: string;
  text: string;
  actions: DialogueAction[];
}

export function dialogueFor(gs: GameState): Dialogue {
  const name = WORLD_MAPS.taoyuan.npc?.name ?? '姜子牙';
  if (gs.questStep === 0) {
    return {
      name,
      text: `${gs.playerName}，来得正好！纣王失德，鹿台高筑酒池肉林，妲己惑主，妖氛四起，天下苦不堪言。吾奉师命下山扶周灭商——界牌关至穿云关五关妖兵列阵，梅山七怪称尊，三仙岛石阵惑人，正缺人手。第一桩差事：穿云岭古道妖狼伤人，去清剿它们！`,
      actions: [{ label: `接下${QUESTS[0].name}`, kind: 'accept' }],
    };
  }
  if (gs.questStep > QUESTS.length) {
    return {
      name,
      text: '鹿台火熄，狐妖授首，成汤气数至此而尽。天下既定，西岐城的百姓已重归安宁，然四海妖氛未靖：西岐大营尚需南宫适练兵，梅山七怪余孽未清，三仙岛石阵仍待高人。少侠若有余兴，尽管游历——封神台上，姜某虚位以待！上榜诸神，各归其位！',
      actions: [{ label: '告辞', kind: 'close' }],
    };
  }
  const q = QUESTS[gs.questStep - 1];
  if (questReady(gs)) {
    return {
      name,
      text: `干得漂亮！「${q.name}」的差事办成了，这是赏银，收好。`,
      actions: [{ label: '领取赏银', kind: 'claim' }],
    };
  }
  const place = { q1: '穿云岭古道', q2: '黄泉鬼渡', q3: '骷髅山白骨洞', q4: '云梦泽', q5: '界牌关至穿云关一线', q6: '梅山', q7: '三仙岛', q8: '朝歌 · 鹿台' }[q.id] ?? '野外';
  return {
    name,
    text: `「${q.name}」尚未完成——${q.targets.label} ${gs.questKills}/${q.targets.need}。${place}妖物众多，小心行事。`,
    actions: [{ label: '知道了', kind: 'close' }],
  };
}

export function acceptQuest(gs: GameState): void {
  gs.questStep = 1;
  gs.questKills = 0;
  saveGame(gs);
}

export function claimQuest(gs: GameState): { silver: number; items: QuestDef['rewardItems'] } {
  const q = QUESTS[gs.questStep - 1];
  gs.silver += q.rewardSilver;
  if (q.rewardItems.heal) gs.inv.heal += q.rewardItems.heal;
  if (q.rewardItems.mana) gs.inv.mana += q.rewardItems.mana;
  if (q.rewardItems.respec) gs.inv.respec = (gs.inv.respec ?? 0) + q.rewardItems.respec;
  gs.questStep++;
  gs.questKills = 0;
  saveGame(gs);
  return { silver: q.rewardSilver, items: q.rewardItems };
}

// ===== 师门修炼（法术等级） =====

export function skillLevel(gs: GameState, skillId: string): number {
  return gs.skillLevels[skillId] ?? 1;
}

export function learnSkill(gs: GameState, skillId: string): { ok: boolean; reason?: string } {
  const cls = CLASSES.find((c) => c.id === gs.classId);
  if (!cls || !cls.skillIds.includes(skillId)) return { ok: false, reason: '非本门派法术' };
  const lvl = skillLevel(gs, skillId);
  if (lvl >= SKILL_MAX_LEVEL) return { ok: false, reason: '已达最高等级' };
  const cost = skillUpgradeCost(lvl);
  if (gs.silver < cost.silver) return { ok: false, reason: '银两不足' };
  if (gs.potential < cost.potential) return { ok: false, reason: '潜能点不足' };
  gs.silver -= cost.silver;
  gs.potential -= cost.potential;
  gs.skillLevels[skillId] = lvl + 1;
  saveGame(gs);
  return { ok: true };
}
