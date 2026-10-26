/**
 * 原创内容数据：职业、技能、宠物、怪物、遭遇、道具。
 * 全部数值集中在这里，方便调平衡（改完刷新页面即生效）。
 * 命名与文案均为原创，只借鉴回合制玩法机制。
 */
import type {
  ClassDef,
  EncounterDef,
  ItemDef,
  MonsterDef,
  PetDef,
  Resists,
  Skill,
  SkillTarget,
} from './types';

/** 抗性简写构造器：抗混乱/昏睡/封印/遗忘/蚀毒 + 火/水/风/雷（0-100，越高越抗） */
const r = (
  chaos: number, sleep: number, seal: number, forget: number, poison: number,
  fire: number, water: number, wind: number, thunder: number,
): Resists => ({ chaos, sleep, seal, forget, poison, fire, water, wind, thunder });

// ===== 技能表 =====

const sk = (
  id: string, name: string, desc: string, kind: Skill['kind'], target: SkillTarget,
  mpCost: number, extra: Partial<Skill> = {},
): Skill => ({ id, name, desc, kind, target, element: 'physical', mpCost, ...extra });

export const SKILLS: Record<string, Skill> = {
  // —— 缉妖司（人族 · 武技 + 三控：混乱/封印/昏睡，对应大话人族法术体系） ——
  jy_zhan: sk('jy_zhan', '缚妖斩', '锁链刀法（威力随法术等级提升）。', 'physical', 'enemy', 15, { power: 1.55 }),
  jy_ding: sk('jy_ding', '定魂符', '封印系：使敌人无法行动（命中/回合随等级提升）。', 'status', 'enemy', 24,
    { status: { kind: 'seal', baseHit: 72, rounds: 2 } }),
  jy_luan: sk('jy_luan', '乱神咒', '混乱系：使敌人敌我不分、胡乱出手（命中/回合随等级提升）。', 'status', 'enemy', 22,
    { status: { kind: 'chaos', baseHit: 62, rounds: 2 } }),
  jy_mi: sk('jy_mi', '迷魂咒', '昏睡系：使敌人昏睡，受击即醒（命中/回合随等级提升）。', 'status', 'enemy', 22,
    { status: { kind: 'sleep', baseHit: 66, rounds: 2 } }),

  // —— 紫霄宫（仙族 · 四系仙法：火/雷/水/风，对应大话仙族法术体系） ——
  zx_huo: sk('zx_huo', '离火真诀', '火系单体法术（威力随法术等级提升）。', 'magic', 'enemy', 30, { element: 'fire', power: 135 }),
  zx_lei: sk('zx_lei', '紫霄神雷', '雷系单体法术（威力随法术等级提升）。', 'magic', 'enemy', 26, { element: 'thunder', power: 122 }),
  zx_bing: sk('zx_bing', '玄冰咒', '水系单体法术（威力随法术等级提升）。', 'magic', 'enemy', 24, { element: 'water', power: 112 }),
  zx_feng: sk('zx_feng', '罡风卷云', '风系群体法术，打击所有敌人（威力随法术等级提升）。', 'magic', 'enemyAll', 42, { element: 'wind', power: 86 }),

  // —— 血狼堡（魔族 · 强化/摄血/重击，对应大话魔族法术体系） ——
  xl_hou: sk('xl_hou', '战意狂嚎', '加攻系：提升自身物理伤害（幅度/回合随等级提升）。', 'buff', 'self', 25,
    { buff: { kind: 'atkUp', percent: 35, rounds: 3 } }),
  xl_chui: sk('xl_chui', '碎岳锤', '沉重一击（威力随法术等级提升）。', 'physical', 'enemy', 20, { power: 1.7 }),
  xl_xue: sk('xl_xue', '摄血魔功', '摄血系：造成伤害并回复其中一半（威力随法术等级提升）。', 'physical', 'enemy', 24,
    { power: 1.25, drain: 0.5 }),

  // —— 酆都祠（鬼族 · 遗忘/三尸/鬼火，对应大话鬼族法术体系） ——
  fd_ling: sk('fd_ling', '勾魂铃', '遗忘系：使敌人法术尽忘、只能挥砍（命中/回合随等级提升）。', 'status', 'enemy', 24,
    { status: { kind: 'forget', baseHit: 75, rounds: 2 } }),
  fd_gu: sk('fd_gu', '三尸蛊', '三尸系：蛊毒缠身，回合损失气血（伤害/回合随等级提升）。', 'status', 'enemy', 28,
    { status: { kind: 'poison', baseHit: 85, rounds: 3, power: 75 } }),
  fd_huo: sk('fd_huo', '幽冥鬼火', '鬼火系：鬼火灼魂（威力随法术等级提升）。', 'magic', 'enemy', 27, { element: 'fire', power: 128 }),

  // —— 宠物 ——
  cm_mian: sk('cm_mian', '催眠粉', '撒出迷粉，使敌人昏睡 2 回合，受击即醒（可被抵抗）。', 'status', 'enemy', 20,
    { status: { kind: 'sleep', baseHit: 62, rounds: 2 } }),
  cm_hu: sk('cm_hu', '狐火', '火系单体法术，威力 98。', 'magic', 'enemy', 18, { element: 'fire', power: 98 }),
  yan_han: sk('yan_han', '撼地击', '沉重一击，造成 155% 攻击力的物理伤害。', 'physical', 'enemy', 16, { power: 1.55 }),
  yan_bi: sk('yan_bi', '铁壁', '缩甲凝神，2 回合内受到的伤害降低 45%。', 'buff', 'self', 14,
    { buff: { kind: 'defUp', percent: 45, rounds: 2 } }),
  lei_luo: sk('lei_luo', '落雷', '雷系单体法术，威力 128。', 'magic', 'enemy', 24, { element: 'thunder', power: 128 }),
  lei_feng: sk('lei_feng', '疾风突', '风系群体法术，打击所有敌人，威力 66。', 'magic', 'enemyAll', 30, { element: 'wind', power: 66 }),

  // —— 怪物 ——
  m_yao: sk('m_yao', '撕咬', '野性撕咬，造成 125% 攻击力的物理伤害。', 'physical', 'enemy', 0, { power: 1.25 }),
  m_xiong: sk('m_xiong', '熊掌重击', '沉重熊掌，造成 160% 攻击力的物理伤害。', 'physical', 'enemy', 0, { power: 1.6 }),
  m_guci: sk('m_guci', '骨刺突袭', '骨刺突刺，造成 120% 攻击力的物理伤害。', 'physical', 'enemy', 0, { power: 1.2 }),
  m_duwu: sk('m_duwu', '毒雾', '喷吐毒雾，使所有敌人中毒 3 回合、每回合损失 45 点气血（可被抵抗）。', 'status', 'enemyAll', 0,
    { status: { kind: 'poison', baseHit: 80, rounds: 3, power: 45 } }),
  m_zhua: sk('m_zhua', '抓挠', '利爪抓挠，造成 120% 攻击力的物理伤害。', 'physical', 'enemy', 0, { power: 1.2 }),
  m_chui: sk('m_chui', '夺命重锤', '狂暴重锤，造成 175% 攻击力的物理伤害。', 'physical', 'enemy', 0, { power: 1.75 }),
  m_hou: sk('m_hou', '猴王怒吼', '仰天长啸，2 回合内自身物理伤害提升 40%。', 'buff', 'self', 0,
    { buff: { kind: 'atkUp', percent: 40, rounds: 2 } }),
};

// ===== 道具 =====

export const ITEMS: Record<'heal' | 'mana', ItemDef> = {
  heal: { id: 'heal', name: '金疮药', desc: '恢复 200 点气血', heal: 200, startCount: 3 },
  mana: { id: 'mana', name: '凝气丹', desc: '恢复 90 点法力', mana: 90, startCount: 3 },
};

// ===== 玩家职业 =====

export const CLASSES: ClassDef[] = [
  {
    id: 'xiake', name: '侠客', race: '人族', sect: '缉妖司', emoji: '⚔️',
    desc: '官府缉妖司的刀客，一手缚妖刀法、一手朱符咒术，封得住身、乱得了心。',
    stats: { hp: 620, mp: 150, atk: 96, def: 62, mag: 30, spd: 55 },
    resists: r(30, 30, 28, 28, 20, 10, 10, 10, 10),
    skillIds: ['jy_zhan', 'jy_ding', 'jy_luan', 'jy_mi'],
  },
  {
    id: 'lingguan', name: '灵官', race: '仙族', sect: '紫霄宫', emoji: '🔮',
    desc: '紫霄宫座下的行法方士，风火雷水四系仙法样样精通，身板脆但爆发惊人。',
    stats: { hp: 470, mp: 300, atk: 42, def: 42, mag: 108, spd: 50 },
    resists: r(35, 35, 25, 25, 25, 15, 15, 15, 15),
    skillIds: ['zx_huo', 'zx_lei', 'zx_bing', 'zx_feng'],
  },
  {
    id: 'moshi', name: '魔师', race: '魔族', sect: '血狼堡', emoji: '👹',
    desc: '血狼堡的北荒魔战士，血厚抗揍，嚎啸增威之余更能摄血还身、越战越勇。',
    stats: { hp: 620, mp: 170, atk: 88, def: 58, mag: 55, spd: 46 },
    resists: r(45, 30, 22, 22, 30, 12, 12, 12, 12),
    skillIds: ['xl_hou', 'xl_chui', 'xl_xue'],
  },
  {
    id: 'wuzhu', name: '巫祝', race: '鬼族', sect: '酆都祠', emoji: '💀',
    desc: '酆都祠里通幽冥的祭祝，勾魂废术、三尸蚀骨，让敌人求生不得、求法不能。',
    stats: { hp: 550, mp: 250, atk: 55, def: 50, mag: 98, spd: 52 },
    resists: r(30, 32, 26, 40, 40, 12, 12, 12, 12),
    skillIds: ['fd_ling', 'fd_gu', 'fd_huo'],
  },
];

// ===== 宠物 =====

export const PETS: PetDef[] = [
  {
    id: 'linghu', name: '灵狐', emoji: '🦊',
    desc: '机敏的小狐狸，出手奇快，会撒催眠粉让敌人昏睡。',
    stats: { hp: 380, mp: 160, atk: 55, def: 34, mag: 78, spd: 72 },
    resists: r(15, 15, 10, 10, 10, 5, 5, 5, 5),
    skillIds: ['cm_mian', 'cm_hu'],
  },
  {
    id: 'yanjia', name: '岩甲兽', emoji: '🐗',
    desc: '披着岩甲的莽兽，皮糙肉厚，是顶在前排的肉盾。',
    stats: { hp: 660, mp: 110, atk: 74, def: 76, mag: 20, spd: 34 },
    resists: r(25, 20, 15, 15, 30, 8, 8, 8, 8),
    skillIds: ['yan_han', 'yan_bi'],
  },
  {
    id: 'leisun', name: '雷隼', emoji: '🦅',
    desc: '振翅带雷声的猛禽，速度快，雷击与风刃兼备。',
    stats: { hp: 360, mp: 170, atk: 62, def: 32, mag: 86, spd: 80 },
    resists: r(12, 15, 10, 10, 5, 10, 10, 10, 10),
    skillIds: ['lei_luo', 'lei_feng'],
  },
];

// ===== 怪物 =====

export const MONSTERS: Record<string, MonsterDef> = {
  yelang: {
    id: 'yelang', name: '野狼', emoji: '🐺',
    stats: { hp: 230, mp: 50, atk: 52, def: 30, mag: 20, spd: 66 },
    resists: r(10, 10, 8, 8, 20, 8, 8, 8, 8),
    skillIds: ['m_yao'],
  },
  heixiong: {
    id: 'heixiong', name: '黑熊精', emoji: '🐻',
    stats: { hp: 460, mp: 80, atk: 64, def: 48, mag: 25, spd: 38 },
    resists: r(30, 20, 12, 12, 25, 10, 10, 10, 10),
    skillIds: ['m_xiong'],
  },
  kulou: {
    id: 'kulou', name: '骷髅兵', emoji: '💀',
    stats: { hp: 220, mp: 40, atk: 48, def: 28, mag: 20, spd: 48 },
    resists: r(15, 30, 10, 50, 60, 8, 8, 8, 8),
    skillIds: ['m_guci'],
  },
  zhizhu: {
    id: 'zhizhu', name: '蜘蛛精', emoji: '🕷️',
    stats: { hp: 330, mp: 120, atk: 44, def: 34, mag: 70, spd: 54 },
    resists: r(20, 20, 12, 12, 90, 10, 10, 10, 10),
    skillIds: ['m_duwu'],
  },
  shanxiao: {
    id: 'shanxiao', name: '山魈', emoji: '🐵',
    stats: { hp: 240, mp: 50, atk: 54, def: 34, mag: 20, spd: 58 },
    resists: r(12, 12, 10, 10, 15, 10, 10, 10, 10),
    skillIds: ['m_zhua'],
  },
  shanxiaowang: {
    id: 'shanxiaowang', name: '千年山魈王', emoji: '🦍',
    stats: { hp: 560, mp: 120, atk: 72, def: 52, mag: 40, spd: 52 },
    resists: r(40, 25, 15, 15, 30, 15, 15, 15, 15),
    skillIds: ['m_chui', 'm_hou'],
  },
};

// ===== 遭遇战 =====

export const ENCOUNTERS: EncounterDef[] = [
  { id: 'heifengling', name: '黑风岭劫道', desc: '两头野狼与一头黑熊精拦路', members: ['yelang', 'yelang', 'heixiong'] },
  { id: 'luanzanggang', name: '乱葬岗魅影', desc: '两具骷髅兵与一只蜘蛛精游荡', members: ['kulou', 'kulou', 'zhizhu'] },
  { id: 'shanxiao', name: '千年山魈', desc: '两只山魈护卫着它们的千年山魈王', members: ['shanxiao', 'shanxiao', 'shanxiaowang'] },
];

export function classById(id: string): ClassDef {
  const c = CLASSES.find((x) => x.id === id);
  if (!c) throw new Error(`未知职业: ${id}`);
  return c;
}

export function petById(id: string): PetDef {
  const p = PETS.find((x) => x.id === id);
  if (!p) throw new Error(`未知宠物: ${id}`);
  return p;
}

export function encounterById(id: string): EncounterDef {
  const e = ENCOUNTERS.find((x) => x.id === id);
  if (!e) throw new Error(`未知遭遇: ${id}`);
  return e;
}
