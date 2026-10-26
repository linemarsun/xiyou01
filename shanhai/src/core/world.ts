/**
 * 世界逻辑（纯逻辑层，不依赖 DOM）：
 * 地图与出口、野外刷怪、任务链、战斗奖励掉落、宠物栏、进度存档（localStorage）。
 */
import { MONSTERS, PETS, CLASSES } from './content';
import { generateEquipment, describeItem, itemBonus, type EquipmentItem, type StatBonus } from './equipment';
import { SKILL_MAX_LEVEL, skillUpgradeCost } from './skill';
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
  /** 对应 scenes/world_<scene>.png */
  scene: string;
  w: number;
  h: number;
  spawns: MapSpawn[];
  exits: MapExit[];
  npc?: { x: number; y: number; name: string };
}

/** 可行走区域（避开地平线以上的远景） */
export const WALK_BOUNDS = { minX: 60, maxX: 1380, minY: 478, maxY: 862 };

export const WORLD_MAPS: Record<string, WorldMap> = {
  taoyuan: {
    id: 'taoyuan',
    name: '桃源镇',
    scene: 'taoyuan',
    w: 1440,
    h: 900,
    spawns: [],
    exits: [{ x: 720, y: 850, r: 70, to: 'wild_heifeng', toX: 720, toY: 540, label: '黑风岭' }],
    npc: { x: 920, y: 560, name: '缉妖司长老' },
  },
  wild_heifeng: {
    id: 'wild_heifeng',
    name: '黑风岭',
    scene: 'wild_heifeng',
    w: 1440,
    h: 900,
    spawns: [
      { group: ['yelang'], x: 400, y: 570 },
      { group: ['yelang'], x: 880, y: 720 },
      { group: ['yelang', 'yelang'], x: 1080, y: 580 },
      { group: ['heixiong'], x: 620, y: 780 },
    ],
    exits: [
      { x: 200, y: 852, r: 70, to: 'taoyuan', toX: 520, toY: 560, label: '桃源镇' },
      { x: 1372, y: 620, r: 70, to: 'wild_luanzang', toX: 150, toY: 620, label: '乱葬岗' },
      { x: 1100, y: 478, r: 70, to: 'wild_shanxiao', toX: 720, toY: 800, label: '山魈岭' },
    ],
  },
  wild_luanzang: {
    id: 'wild_luanzang',
    name: '乱葬岗',
    scene: 'wild_luanzang',
    w: 1440,
    h: 900,
    spawns: [
      { group: ['kulou'], x: 460, y: 580 },
      { group: ['kulou', 'kulou'], x: 760, y: 640 },
      { group: ['zhizhu'], x: 1120, y: 680 },
    ],
    exits: [{ x: 65, y: 620, r: 70, to: 'wild_heifeng', toX: 1280, toY: 620, label: '黑风岭' }],
  },
  wild_shanxiao: {
    id: 'wild_shanxiao',
    name: '千年山魈岭',
    scene: 'wild_shanxiao',
    w: 1440,
    h: 900,
    spawns: [
      { group: ['shanxiao'], x: 500, y: 580 },
      { group: ['shanxiao', 'shanxiao'], x: 860, y: 700 },
      { group: ['shanxiaowang'], x: 1150, y: 600 },
    ],
    exits: [{ x: 720, y: 852, r: 70, to: 'wild_heifeng', toX: 1100, toY: 570, label: '黑风岭' }],
  },
};

// ===== 任务链 =====

export interface QuestDef {
  id: string;
  name: string;
  desc: string;
  targets: { defIds: string[]; need: number; label: string };
  rewardSilver: number;
  rewardItems: { heal?: number; mana?: number };
}

export const QUESTS: QuestDef[] = [
  {
    id: 'q1',
    name: '缉狼令',
    desc: '近来黑风岭的野狼频频下山伤人，少侠替乡亲们清剿几头，缉妖司必有重谢。',
    targets: { defIds: ['yelang'], need: 3, label: '击杀野狼' },
    rewardSilver: 100,
    rewardItems: { heal: 2 },
  },
  {
    id: 'q2',
    name: '净乱葬',
    desc: '乱葬岗阴气冲天，骷髅兵与蜘蛛精日夜作祟。少侠武功已成，前去净化此地。',
    targets: { defIds: ['kulou', 'zhizhu'], need: 4, label: '诛除骷髅兵或蜘蛛精' },
    rewardSilver: 160,
    rewardItems: { mana: 2 },
  },
  {
    id: 'q3',
    name: '讨山魈',
    desc: '千年山魈王率众占岭为王，气焰嚣张。缉妖司张榜悬赏，讨伐此獠！',
    targets: { defIds: ['shanxiaowang'], need: 1, label: '讨伐千年山魈王' },
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

export interface GameState {
  classId: string;
  /** 出战宠物实例 uid */
  activePetUid: string;
  /** 召唤兽个体（含初始宠物与收服的怪），上限 6 */
  petInstances: PetInstance[];
  playerName: string;
  silver: number;
  inv: { heal: number; mana: number };
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
  const g = petGrowth(inst.level);
  const r = (v: number) => Math.round(v * g);
  return { hp: r(base.hp), mp: r(base.mp), atk: r(base.atk), def: r(base.def), mag: r(base.mag), spd: r(base.spd) };
}

export function activePet(gs: GameState): PetInstance | undefined {
  return gs.petInstances.find((p) => p.uid === gs.activePetUid) ?? gs.petInstances[0];
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

let petUidSeq = 0;

export function newGame(setup: { classId: string; petId: string; playerName: string }): GameState {
  const first: PetInstance = { uid: `pet_${++petUidSeq}_${Math.random().toString(36).slice(2, 6)}`, defId: setup.petId, level: 1, exp: 0 };
  return {
    classId: setup.classId,
    activePetUid: first.uid,
    petInstances: [first],
    playerName: setup.playerName || '无名少侠',
    silver: 50,
    inv: { heal: 3, mana: 3 },
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
    px: 700,
    py: 640,
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

  // 4. 装备掉落（头目必掉，普通怪 18%）
  const tier = info.enemyIds.includes('shanxiaowang')
    ? (3 as const)
    : info.enemyIds.some((id) => id === 'heixiong' || id === 'zhizhu')
      ? (Math.random() < 0.5 ? 2 : 1)
      : Math.random() < 0.25 ? 2 : 1;
  if (Math.random() < (info.enemyIds.includes('shanxiaowang') ? 1 : 0.18)) {
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
  if (done) lines.push(`任务达成：「${done.name}」—— 回桃源镇向长老交付！`);

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
  const name = WORLD_MAPS.taoyuan.npc?.name ?? '长老';
  if (gs.questStep === 0) {
    return {
      name,
      text: `${gs.playerName}，来得正好！缉妖司正缺人手。第一桩差事：黑风岭野狼伤人，去清剿它们！`,
      actions: [{ label: '接下缉狼令', kind: 'accept' }],
    };
  }
  if (gs.questStep > QUESTS.length) {
    return {
      name,
      text: '妖物暂退，桃源镇恢复安宁。少侠威名，老朽记下了！',
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
  const place = q.id === 'q1' ? '黑风岭' : q.id === 'q2' ? '乱葬岗' : '山魈岭';
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

export function claimQuest(gs: GameState): { silver: number; items: { heal?: number; mana?: number } } {
  const q = QUESTS[gs.questStep - 1];
  gs.silver += q.rewardSilver;
  if (q.rewardItems.heal) gs.inv.heal += q.rewardItems.heal;
  if (q.rewardItems.mana) gs.inv.mana += q.rewardItems.mana;
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
