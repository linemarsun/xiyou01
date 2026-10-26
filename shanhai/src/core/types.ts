/**
 * 核心类型定义。
 * 约定：core/ 内不允许 import DOM —— 指令与事件全部是可序列化纯对象，
 * 将来联机时把这一层原样搬上服务器即可（指令上行、事件下行）。
 */

// ===== 基础枚举 =====

export type Side = 'ally' | 'enemy';
export type Element = 'physical' | 'fire' | 'water' | 'wind' | 'thunder';

export const ELEMENT_NAMES: Record<Element, string> = {
  physical: '物理',
  fire: '火',
  water: '水',
  wind: '风',
  thunder: '雷',
};

export type StatusKind =
  | 'chaos'   // 混乱：出手时攻击随机目标（可能打到队友）
  | 'sleep'   // 昏睡：跳过行动，受击即醒
  | 'seal'    // 封印：跳过行动
  | 'forget'  // 遗忘：法术/控制/增益失效，只能普通攻击
  | 'poison'  // 蚀毒：回合末固定掉血
  | 'atkUp'   // 攻升：物理伤害提升
  | 'defUp'   // 防升：受到伤害降低
  | 'defend'; // 防御：本回合内受伤减半（即时生效，回合末消失）

export interface StatusMeta {
  name: string;
  chip: string;
  bad: boolean;
}

export const STATUS_META: Record<StatusKind, StatusMeta> = {
  chaos:  { name: '混乱', chip: '混', bad: true },
  sleep:  { name: '昏睡', chip: '睡', bad: true },
  seal:   { name: '封印', chip: '封', bad: true },
  forget: { name: '遗忘', chip: '忘', bad: true },
  poison: { name: '蚀毒', chip: '毒', bad: true },
  atkUp:  { name: '攻升', chip: '怒', bad: false },
  defUp:  { name: '防升', chip: '壁', bad: false },
  defend: { name: '防御', chip: '守', bad: false },
};

export type ResistKey =
  | 'chaos' | 'sleep' | 'seal' | 'forget' | 'poison'
  | 'fire' | 'water' | 'wind' | 'thunder';

export type Resists = Record<ResistKey, number>;

/** 控制类状态 → 对应抗性键；增益/防御无抗性判定 */
export function resistKeyOf(kind: StatusKind): ResistKey | null {
  switch (kind) {
    case 'chaos':
    case 'sleep':
    case 'seal':
    case 'forget':
    case 'poison':
      return kind;
    default:
      return null;
  }
}

// ===== 单位 =====

export interface StatusInstance {
  kind: StatusKind;
  /** 剩余回合数，回合末递减（施加当回合不递减） */
  rounds: number;
  /** 数值参数：poison=每回合伤害，atkUp/defUp=百分比 */
  power?: number;
  /** 施加于第几回合（用于回合末递减的锚点） */
  appliedRound: number;
}

export interface Unit {
  id: string;
  /** 内容表定义 id（职业/宠物/怪物） */
  defId: string;
  name: string;
  emoji: string;
  side: Side;
  tag: 'player' | 'pet' | 'monster';
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  atk: number;
  def: number;
  mag: number;
  spd: number;
  resists: Resists;
  skillIds: string[];
  statuses: StatusInstance[];
  alive: boolean;
  /** 同速度时的出手顺序打破用（开局随机定死） */
  tiebreak: number;
}

// ===== 技能 / 道具 =====

export type SkillKind = 'physical' | 'magic' | 'status' | 'buff';
export type SkillTarget = 'enemy' | 'enemyAll' | 'ally' | 'self';

export interface Skill {
  id: string;
  name: string;
  desc: string;
  kind: SkillKind;
  target: SkillTarget;
  element: Element;
  mpCost: number;
  /** physical：攻击力倍率（1.5 = 150%）；magic：威力（×法强/100） */
  power?: number;
  /** 吸血比例（0.5 = 回复造成伤害的 50%），仅物理技能生效 */
  drain?: number;
  /** status 类技能的控制效果 */
  status?: { kind: StatusKind; baseHit: number; rounds: number; power?: number };
  /** buff 类技能的增益 */
  buff?: { kind: 'atkUp' | 'defUp'; percent: number; rounds: number };
}

export interface ItemDef {
  id: 'heal' | 'mana';
  name: string;
  desc: string;
  heal?: number;
  mana?: number;
  startCount: number;
}

// ===== 指令（可序列化 → 联机时上行给服务器） =====

export type Command =
  | { type: 'attack'; actorId: string; targetId: string }
  | { type: 'skill'; actorId: string; skillId: string; targetId: string }
  | { type: 'defend'; actorId: string }
  | { type: 'item'; actorId: string; itemId: 'heal' | 'mana'; targetId: string }
  | { type: 'catch'; actorId: string; targetId: string };

// ===== 事件（可序列化 → 联机时下行给客户端，UI 只消费事件流） =====

export type BattleEvent =
  | { t: 'roundStart'; round: number }
  | { t: 'actionStart'; actorId: string }
  | { t: 'actSkip'; actorId: string; reason: 'sleep' | 'seal' }
  | { t: 'actOverride'; actorId: string; reason: 'chaos' | 'forget' | 'exhausted' }
  | { t: 'cast'; actorId: string; skillId: string }
  | { t: 'attack'; actorId: string }
  | { t: 'defend'; actorId: string }
  | { t: 'damage'; sourceId: string; targetId: string; amount: number; element: Element; crit: boolean; hpAfter: number }
  | { t: 'heal'; sourceId: string; targetId: string; amount: number; hpAfter: number }
  | { t: 'mpChange'; targetId: string; delta: number; mpAfter: number }
  | { t: 'statusHit'; targetId: string; kind: StatusKind; rounds: number }
  | { t: 'statusResist'; targetId: string; kind: StatusKind }
  | { t: 'statusEnd'; targetId: string; kind: StatusKind; reason: 'expire' | 'woken' }
  | { t: 'poisonTick'; targetId: string; amount: number; hpAfter: number }
  | { t: 'death'; targetId: string }
  | { t: 'catchSuccess'; targetId: string; defId: string }
  | { t: 'catchFail'; targetId: string; chance: number }
  | { t: 'itemUsed'; actorId: string; itemId: 'heal' | 'mana'; remain: number }
  | { t: 'battleEnd'; winner: Side; rounds: number };

// ===== 内容定义 =====

export interface UnitStats {
  hp: number;
  mp: number;
  atk: number;
  def: number;
  mag: number;
  spd: number;
}

export interface ClassDef {
  id: string;
  name: string;
  race: string;
  /** 所属门派（参考大话的门派体系原创命名） */
  sect: string;
  emoji: string;
  desc: string;
  stats: UnitStats;
  resists: Resists;
  skillIds: string[];
}

export interface PetDef {
  id: string;
  name: string;
  emoji: string;
  desc: string;
  stats: UnitStats;
  resists: Resists;
  skillIds: string[];
}

export interface MonsterDef {
  id: string;
  name: string;
  emoji: string;
  stats: UnitStats;
  resists: Resists;
  skillIds: string[];
}

export interface EncounterDef {
  id: string;
  name: string;
  desc: string;
  members: string[];
}
