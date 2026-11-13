/**
 * 装备系统（纯逻辑）：生成、词条、炼化、加成汇总。
 * 设计：三部位（武器/护甲/饰品）× 三品阶（凡品/良品/极品）；
 * 基础属性固定、词条（affixes）可花银两炼化重掷。
 */

export type EquipSlot = 'weapon' | 'armor' | 'accessory';
export type StatKey = 'atk' | 'def' | 'mag' | 'spd' | 'hp';
export type StatBonus = Record<StatKey, number> & { mp: number };

export interface Affix { stat: StatKey; value: number; rare?: boolean }

export interface EquipmentItem {
  uid: string;
  slot: EquipSlot;
  tier: 1 | 2 | 3;
  name: string;
  /** 固定基础属性（不随炼化变化） */
  base: Partial<Record<StatKey, number>>;
  /** 词条：炼化重掷的部分；rare 为极品装备的稀有词条（数值翻倍） */
  affixes: Affix[];
}

export const EQUIP_SLOTS: EquipSlot[] = ['weapon', 'armor', 'accessory'];
/** 召唤兽不持械，只开放护甲与饰品两个部位 */
export const PET_EQUIP_SLOTS: EquipSlot[] = ['armor', 'accessory'];
export const SLOT_NAMES: Record<EquipSlot, string> = { weapon: '武器', armor: '护甲', accessory: '饰品' };

/** 极品装备出现稀有词条的概率与数值倍率 */
export const RARE_AFFIX_CHANCE = 0.25;
export const RARE_AFFIX_MULT = 2;

const TIER_NAMES = ['', '凡品', '良品', '极品'];
const BASE_NAMES: Record<EquipSlot, string[]> = {
  weapon: ['铁剑', '青锋剑', '游龙剑'],
  armor: ['布甲', '精钢甲', '云锦仙衣'],
  accessory: ['铜铃', '碧玉佩', '紫金葫芦'],
};

export const STAT_NAMES: Record<StatKey, string> = { atk: '攻', def: '防', mag: '法', spd: '速', hp: '气血' };

let uidSeq = 0;

export function generateEquipment(tier: 1 | 2 | 3): EquipmentItem {
  const slot = EQUIP_SLOTS[Math.floor(Math.random() * EQUIP_SLOTS.length)];
  const t = tier - 1;
  const base: Partial<Record<StatKey, number>> = {};
  if (slot === 'weapon') base.atk = [8, 14, 22][t];
  if (slot === 'armor') {
    base.def = [6, 10, 16][t];
    base.hp = [30, 60, 100][t];
  }
  if (slot === 'accessory') {
    if (Math.random() < 0.5) base.mag = [6, 10, 16][t];
    else base.spd = [4, 6, 9][t];
    base.hp = [15, 30, 50][t];
  }
  const name = `${TIER_NAMES[tier]}·${BASE_NAMES[slot][t]}`;
  const item: EquipmentItem = {
    uid: `eq_${(++uidSeq).toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    slot, tier, name, base, affixes: [],
  };
  rerollAffixes(item);
  return item;
}

/** 重掷词条（炼化）；极品装备每次都有概率掷出稀有词条，返回新描述 */
export function rerollAffixes(it: EquipmentItem): string {
  const n = Math.max(1, it.affixes.length);
  const scale = [4, 8, 13][it.tier - 1];
  const pool: StatKey[] = ['atk', 'def', 'mag', 'spd', 'hp'];
  const affixes: Affix[] = [];
  for (let i = 0; i < n; i++) {
    const stat = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
    const rare = it.tier === 3 && Math.random() < RARE_AFFIX_CHANCE;
    const value = (scale + Math.floor(Math.random() * scale)) * (rare ? RARE_AFFIX_MULT : 1);
    affixes.push({ stat, value, ...(rare ? { rare: true } : {}) });
  }
  it.affixes = affixes;
  return describeItem(it);
}

/** 是否含稀有词条（背包列表标记用） */
export function hasRareAffix(it: EquipmentItem): boolean {
  return it.affixes.some((a) => a.rare === true);
}

export function itemBonus(it: EquipmentItem): StatBonus {
  const b: StatBonus = { atk: 0, def: 0, mag: 0, spd: 0, hp: 0, mp: 0 };
  for (const k of Object.keys(it.base) as StatKey[]) b[k] += it.base[k] ?? 0;
  for (const a of it.affixes) b[a.stat] += a.value;
  return b;
}

export function describeItem(it: EquipmentItem): string {
  const b = itemBonus(it);
  const parts = (Object.keys(b) as StatKey[])
    .filter((k) => b[k] !== 0)
    .map((k) => (k === 'hp' ? `气血+${b[k]}` : `${STAT_NAMES[k]}+${b[k]}`));
  const rareMark = hasRareAffix(it) ? '★' : '';
  return `${rareMark}${it.name}（${parts.join(' ')}）`;
}

/** 按怪物难度权重掷出掉落装备品阶（见 world.ts 的 DROP_TIER_WEIGHTS） */
export function rollTier(weights: readonly [number, number, number]): 1 | 2 | 3 {
  const total = weights[0] + weights[1] + weights[2];
  const x = Math.random() * total;
  if (x < weights[0]) return 1;
  if (x < weights[0] + weights[1]) return 2;
  return 3;
}

export function emptyBonus(): StatBonus {
  return { atk: 0, def: 0, mag: 0, spd: 0, hp: 0, mp: 0 };
}
