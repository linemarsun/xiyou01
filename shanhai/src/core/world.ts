/**
 * 世界逻辑（纯逻辑层，不依赖 DOM）：
 * 地图与出口、野外刷怪、任务链、战斗奖励掉落、宠物栏、进度存档（localStorage）。
 */
import { MONSTERS, PETS, CLASSES, SKILLS, classById } from './content';
import type { AllySpec } from './battle';
import {
  PET_EQUIP_SLOTS, emptyBonus, generateEquipment, describeItem, itemBonus, rollTier,
  type EquipSlot, type EquipmentItem, type StatBonus,
} from './equipment';
import { SKILL_MAX_LEVEL, skillUpgradeCost } from './skill';
import type { WalkBounds } from './path';
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
  /** 酒馆（雇佣组队同伴），仅主城云京有 */
  tavern?: { x: number; y: number; name: string };
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

  // —— 等距构件地图（给出 iso 时启用；尺寸仍由 width/height 决定）——
  /** 世界宽高（像素），省略时按 segments 推导 */
  width?: number;
  height?: number;
  /** 构件布局 JSON（相对 public/assets/art） */
  iso?: { layout: string };
}

/** 基础布局仍用原 1440×900 坐标书写，便于维护与调平衡 */
const BASE_MAPS: Record<string, BaseLayout> = {
  taoyuan: {
    name: '云京', scene: 'taoyuan',
    // 等距构件地图：128×128 格，世界 (128+128)*32 × (128+128)*16 = 8192×4096；内容全部来自布局 JSON
    width: 8192, height: 4096,
    iso: { layout: 'iso/taoyuan.json' },
    walk: { minY: 60, maxY: 4036 },
    spawns: [],
    // 城门（gx15,gy0 三门石坊）拱洞下方 cell(16,1) → 世界 (4576, 288)：向北出城
    // 落点必须离目标图所有出口路牌都足够远，否则"落地即弹回"（见 exitsSuppressedOnArrival）
    exits: [{ x: 4576, y: 288, r: 80, to: 'wild_heifeng', toX: 4000, toY: 608, label: '青崖山道' }],
    // 长老在 Q1 市集广场中心 cell(32,32)；酒肆在广场北沿临街 cell(32,20)
    npc: { x: 4096, y: 1040, name: '玄鹤长老' },
    tavern: { x: 4480, y: 848, name: '云京酒肆掌柜' },
  },
  wild_heifeng: {
    name: '青崖山道', scene: 'wild_heifeng',
    // 等距构件地图：与云京同规格 8192×4096，S 形折返山径 / 松林 / 溪涧木桥 / 崖道栈桥，
    // 布局由 tools/_gen_heifeng.mjs 生成，见 art/iso/wild_heifeng.json。
    width: 8192, height: 4096,
    iso: { layout: 'iso/wild_heifeng.json' },
    walk: { minY: 60, maxY: 4036 },
    spawns: [
      { group: ['yelang'], x: 3776, y: 816 },
      { group: ['yelang'], x: 3584, y: 1552 },
      { group: ['yelang', 'yelang'], x: 2688, y: 2000 },
      { group: ['heixiong'], x: 3392, y: 2736 },
    ],
    exits: [
      { x: 4224, y: 336, r: 80, to: 'taoyuan', toX: 3584, toY: 784, label: '云京' },
      { x: 4096, y: 3664, r: 80, to: 'wild_luanzang', toX: 240, toY: 620, label: '渡忘川' },
      { x: 3136, y: 1904, r: 80, to: 'wild_shanxiao', toX: 720, toY: 560, label: '玲珑洞天' },
    ],
  },
  wild_luanzang: {
    name: '渡忘川', scene: 'wild_luanzang',
    walk: { minY: 500, maxY: 862 },
    spawns: [
      { group: ['kulou'], x: 460, y: 580 },
      { group: ['kulou', 'kulou'], x: 760, y: 640 },
      { group: ['zhizhu'], x: 1120, y: 680 },
    ],
    exits: [{ x: 65, y: 620, r: 70, to: 'wild_heifeng', toX: 4032, toY: 3440, label: '青崖山道' }],
  },
  wild_shanxiao: {
    name: '玲珑洞天', scene: 'wild_shanxiao',
    walk: { minY: 500, maxY: 862 },
    spawns: [
      { group: ['shanxiao'], x: 500, y: 580 },
      { group: ['shanxiao', 'shanxiao'], x: 860, y: 700 },
      { group: ['shanxiaowang'], x: 1150, y: 600 },
    ],
    exits: [{ x: 720, y: 852, r: 70, to: 'wild_heifeng', toX: 3136, toY: 1712, label: '青崖山道' }],
  },
  /** 地府：战败重生点。地图素材未到位时渲染器用占位底色，不影响流程闭环 */
  difu: {
    name: '地府 · 忘川渡口', scene: 'difu',
    segments: 1,
    walk: { minY: 560, maxY: 866 },
    spawns: [],
    exits: [{ x: 1320, y: 800, r: 80, to: 'taoyuan', toX: 3584, toY: 784, label: '还阳 · 云京' }],
    npc: { x: 620, y: 680, name: '孟婆' },
  },
};

/** 把基础布局铺到每个区段：怪组等比例补充、每 2 个区段补一组完整出口；NPC/酒馆留在起点区段 */
function expandMap(id: string, base: BaseLayout): WorldMap {
  const segments = base.segments ?? DEFAULT_SEGMENTS;
  const w = base.width ?? TILE_W * segments;
  const h = base.height ?? MAP_H;
  const minY = base.walk?.minY ?? DEFAULT_WALK_BOUNDS.minY;
  const maxY = base.walk?.maxY ?? DEFAULT_WALK_BOUNDS.maxY;

  // 等距构件地图：整张图由布局 JSON 描述，不再按区段重复
  if (base.iso) {
    return {
      id, name: base.name, scene: base.scene,
      segments: Math.max(1, Math.round(w / TILE_W)), w, h,
      bounds: { minX: 60, maxX: w - 60, minY, maxY },
      spawns: base.spawns.map((s) => ({ group: [...s.group], x: s.x, y: s.y })),
      exits: base.exits.map((e) => ({ ...e })),
      npc: base.npc ? { ...base.npc } : undefined,
      tavern: base.tavern ? { ...base.tavern } : undefined,
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
  };
}

export const WORLD_MAPS: Record<string, WorldMap> = Object.fromEntries(
  Object.entries(BASE_MAPS).map(([id, base]) => [id, expandMap(id, base)]),
);

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
    name: '青崖清狼',
    desc: '近来青崖山道的苍狼频频下山伤人，少侠替云京乡亲清剿几头，司礼府必有重谢。',
    targets: { defIds: ['yelang'], need: 3, label: '清剿青崖苍狼' },
    rewardSilver: 100,
    rewardItems: { heal: 2, respec: 1 },
  },
  {
    id: 'q2',
    name: '忘川镇骨',
    desc: '渡忘川阴气冲天，忘川骨卒与幽丝蛛妖日夜作祟。少侠道法已成，前去净化此地。',
    targets: { defIds: ['kulou', 'zhizhu'], need: 4, label: '镇压忘川骨卒或幽丝蛛妖' },
    rewardSilver: 160,
    rewardItems: { mana: 2 },
  },
  {
    id: 'q3',
    name: '洞天讨魈',
    desc: '洞天山魈王率众占据玲珑洞天，气焰嚣张。司礼府张榜悬赏，讨伐此獠！',
    targets: { defIds: ['shanxiaowang'], need: 1, label: '讨伐洞天山魈王' },
    rewardSilver: 300,
    rewardItems: { heal: 2, mana: 1 },
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
  { id: 'wuzhu', name: '忘川引灯人', classId: 'wuzhu', desc: '遗忘 / 三尸蛊 / 鬼火，擅长压制', price: HIRE_COST },
  { id: 'lingguan', name: '琼霄云游使', classId: 'lingguan', desc: '风火雷水四系仙法，群体输出', price: HIRE_COST },
  { id: 'moshi', name: '玄炎墨刀客', classId: 'moshi', desc: '加攻 / 重击 / 摄血，能扛能打', price: HIRE_COST },
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
    mapId: 'taoyuan',
    px: 3584,
    py: 784,
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
};

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
  if (info.enemyIds.includes('shanxiaowang')) drops.push({ itemId: 'mana', n: 2 });
  gs.silver += silver;
  for (const d of drops) gs.inv[d.itemId] += d.n;
  lines.push(`获得银两 ${silver}`);
  for (const d of drops) {
    const name = d.itemId === 'heal' ? '金疮药' : '凝气丹';
    lines.push(`获得 ${name} ×${d.n}`);
  }
  const isBossFight = info.enemyIds.includes('shanxiaowang');
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
  const EXP_PER_KILL: Record<string, number> = { yelang: 18, kulou: 20, shanxiao: 24, zhizhu: 30, heixiong: 42, shanxiaowang: 120 };
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
  if (done) lines.push(`任务达成：「${done.name}」—— 回云京向玄鹤长老交付！`);

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
  const name = WORLD_MAPS.taoyuan.npc?.name ?? '玄鹤长老';
  if (gs.questStep === 0) {
    return {
      name,
      text: `${gs.playerName}，来得正好！司礼府正缺人手。第一桩差事：青崖山道苍狼伤人，去清剿它们！`,
      actions: [{ label: `接下${QUESTS[0].name}`, kind: 'accept' }],
    };
  }
  if (gs.questStep > QUESTS.length) {
    return {
      name,
      text: '妖物暂退，云京恢复安宁。少侠威名，老朽记下了！',
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
  const place = q.id === 'q1' ? '青崖山道' : q.id === 'q2' ? '渡忘川' : '玲珑洞天';
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
