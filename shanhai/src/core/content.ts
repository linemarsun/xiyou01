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
  // —— 乾元山（人族 · 武技 + 三控：混乱/封印/昏睡，哪吒枪系） ——
  jy_zhan: sk('jy_zhan', '火尖枪刺', '锁链刀法（威力随法术等级提升）。', 'physical', 'enemy', 15, { power: 1.55 }),
  jy_ding: sk('jy_ding', '乾坤圈', '封印系：使敌人无法行动（命中/回合随等级提升）。', 'status', 'enemy', 24,
    { status: { kind: 'seal', baseHit: 72, rounds: 2 } }),
  jy_luan: sk('jy_luan', '混天绫缚', '混乱系：使敌人敌我不分、胡乱出手（命中/回合随等级提升）。', 'status', 'enemy', 22,
    { status: { kind: 'chaos', baseHit: 62, rounds: 2 } }),
  jy_mi: sk('jy_mi', '莲花幻影', '昏睡系：使敌人昏睡，受击即醒（命中/回合随等级提升）。', 'status', 'enemy', 22,
    { status: { kind: 'sleep', baseHit: 66, rounds: 2 } }),
  jy_zhao: sk('jy_zhao', '九龙神火罩', '火系群体法术：九龙神火罩罩落，火龙焚群敌（威力随法术等级提升）。', 'magic', 'enemyAll', 38,
    { element: 'fire', power: 82 }),
  jy_lianhua: sk('jy_lianhua', '莲华护体', '护体系：莲花化身凝光护体，3 回合内受到的伤害降低 40%。', 'buff', 'self', 26,
    { buff: { kind: 'defUp', percent: 40, rounds: 3 } }),

  // —— 玉虚宫（阐教 · 四系仙法：火/雷/水/风，姜太公体系） ——
  zx_huo: sk('zx_huo', '打神鞭', '火系单体法术（威力随法术等级提升）。', 'magic', 'enemy', 30, { element: 'fire', power: 135 }),
  zx_lei: sk('zx_lei', '太乙神雷', '雷系单体法术（威力随法术等级提升）。', 'magic', 'enemy', 26, { element: 'thunder', power: 122 }),
  zx_bing: sk('zx_bing', '玉虚甘霖', '水系单体法术（威力随法术等级提升）。', 'magic', 'enemy', 24, { element: 'water', power: 112 }),
  zx_feng: sk('zx_feng', '昆仑罡风', '风系群体法术，打击所有敌人（威力随法术等级提升）。', 'magic', 'enemyAll', 42, { element: 'wind', power: 86 }),
  zx_qi: sk('zx_qi', '戊己杏黄旗', '护体系：杏黄旗护身，万法不侵，3 回合内受到的伤害降低 40%。', 'buff', 'self', 26,
    { buff: { kind: 'defUp', percent: 40, rounds: 3 } }),
  zx_fengshen: sk('zx_fengshen', '封神敕令', '雷系群体法术：敕令一下，天雷贯群敌（威力随法术等级提升）。', 'magic', 'enemyAll', 44,
    { element: 'thunder', power: 80 }),

  // —— 碧游宫（妖族 · 强化/摄血/重击，申公豹体系） ——
  xl_hou: sk('xl_hou', '蛊惑人心', '加攻系：提升自身物理伤害（幅度/回合随等级提升）。', 'buff', 'self', 25,
    { buff: { kind: 'atkUp', percent: 35, rounds: 3 } }),
  xl_chui: sk('xl_chui', '开天珠击', '沉重一击（威力随法术等级提升）。', 'physical', 'enemy', 20, { power: 1.7 }),
  xl_xue: sk('xl_xue', '摄血魔功', '摄血系：造成伤害并回复其中一半（威力随法术等级提升）。', 'physical', 'enemy', 24,
    { power: 1.25, drain: 0.5 }),
  xl_hu: sk('xl_hu', '白额虎啸', '化出白额虎扑咬敌手，凶悍沉重（威力随法术等级提升）。', 'physical', 'enemy', 26, { power: 1.85 }),
  xl_leizhu: sk('xl_leizhu', '风雷珠', '风系单体法术：风雷珠掷出，罡风雷光炸裂（威力随法术等级提升）。', 'magic', 'enemy', 28,
    { element: 'wind', power: 128 }),

  // —— 青峰山紫阳洞（幽冥 · 遗忘/蛊毒/神火，杨任体系） ——
  fd_ling: sk('fd_ling', '摄魂幡', '遗忘系：使敌人法术尽忘、只能挥砍（命中/回合随等级提升）。', 'status', 'enemy', 24,
    { status: { kind: 'forget', baseHit: 75, rounds: 2 } }),
  fd_gu: sk('fd_gu', '三尸蛊', '三尸系：蛊毒缠身，回合损失气血（伤害/回合随等级提升）。', 'status', 'enemy', 28,
    { status: { kind: 'poison', baseHit: 85, rounds: 3, power: 75 } }),
  fd_huo: sk('fd_huo', '五火七禽扇', '鬼火系：鬼火灼魂（威力随法术等级提升）。', 'magic', 'enemy', 27, { element: 'fire', power: 128 }),
  fd_san: sk('fd_san', '瘟癀伞', '毒系群体：撑开瘟癀伞，毒瘴弥漫全场，回合损血（可被抵抗）。', 'status', 'enemyAll', 34,
    { status: { kind: 'poison', baseHit: 72, rounds: 3, power: 55 } }),
  fd_shou: sk('fd_shou', '幽冥鬼手', '摄血系：鬼手攫魂，伤害一半化归己身（威力随法术等级提升）。', 'physical', 'enemy', 26,
    { power: 1.3, drain: 0.5 }),

  // —— 宠物 ——
  cm_mian: sk('cm_mian', '迷魂仙雾', '撒出迷粉，使敌人昏睡 2 回合，受击即醒（可被抵抗）。', 'status', 'enemy', 20,
    { status: { kind: 'sleep', baseHit: 62, rounds: 2 } }),
  cm_hu: sk('cm_hu', '仙家灵火', '火系单体法术，威力 98。', 'magic', 'enemy', 18, { element: 'fire', power: 98 }),
  yan_han: sk('yan_han', '哮天猛扑', '沉重一击，造成 155% 攻击力的物理伤害。', 'physical', 'enemy', 16, { power: 1.55 }),
  yan_bi: sk('yan_bi', '铜头铁臂', '缩甲凝神，2 回合内受到的伤害降低 45%。', 'buff', 'self', 14,
    { buff: { kind: 'defUp', percent: 45, rounds: 2 } }),
  lei_luo: sk('lei_luo', '鸾鸣引雷', '雷系单体法术，威力 128。', 'magic', 'enemy', 24, { element: 'thunder', power: 128 }),
  lei_feng: sk('lei_feng', '青鸾振翅', '风系群体法术，打击所有敌人，威力 66。', 'magic', 'enemyAll', 30, { element: 'wind', power: 66 }),
  ky_lei: sk('ky_lei', '麒麟踏雷', '雷系单体法术，威力 118。', 'magic', 'enemy', 22, { element: 'thunder', power: 118 }),
  ky_jia: sk('ky_jia', '墨鳞铁甲', '墨鳞凝甲，2 回合内受到的伤害降低 40%。', 'buff', 'self', 14,
    { buff: { kind: 'defUp', percent: 40, rounds: 2 } }),
  niu_chong: sk('niu_chong', '神牛撞山', '沉重一击，造成 160% 攻击力的物理伤害。', 'physical', 'enemy', 16, { power: 1.6 }),
  niu_hou: sk('niu_hou', '牛王怒吼', '仰首怒吼，2 回合内自身物理伤害提升 35%。', 'buff', 'self', 14,
    { buff: { kind: 'atkUp', percent: 35, rounds: 2 } }),

  // —— 炼妖可领悟的通用召唤兽技能（模块 3） ——
  pt_xue: sk('pt_xue', '噬血爪', '撕咬并汲取气血，造成 135% 攻击力的物理伤害并回复其中 35%。', 'physical', 'enemy', 18,
    { power: 1.35, drain: 0.35 }),
  pt_dun: sk('pt_dun', '玄岩甲', '凝出岩甲，2 回合内受到的伤害降低 35%。', 'buff', 'self', 16,
    { buff: { kind: 'defUp', percent: 35, rounds: 2 } }),
  pt_lei: sk('pt_lei', '引雷诀', '雷系单体法术，威力 105。', 'magic', 'enemy', 22,
    { element: 'thunder', power: 105 }),

  // —— 怪物 ——
  m_yao: sk('m_yao', '撕咬', '野性撕咬，造成 125% 攻击力的物理伤害。', 'physical', 'enemy', 0, { power: 1.25 }),
  m_xiong: sk('m_xiong', '熊掌重击', '沉重熊掌，造成 160% 攻击力的物理伤害。', 'physical', 'enemy', 0, { power: 1.6 }),
  m_guci: sk('m_guci', '骨刺突袭', '骨刺突刺，造成 120% 攻击力的物理伤害。', 'physical', 'enemy', 0, { power: 1.2 }),
  m_duwu: sk('m_duwu', '毒雾', '喷吐毒雾，使所有敌人中毒 3 回合、每回合损失 45 点气血（可被抵抗）。', 'status', 'enemyAll', 0,
    { status: { kind: 'poison', baseHit: 80, rounds: 3, power: 45 } }),
  m_zhua: sk('m_zhua', '抓挠', '利爪抓挠，造成 120% 攻击力的物理伤害。', 'physical', 'enemy', 0, { power: 1.2 }),
  m_chui: sk('m_chui', '夺命重锤', '狂暴重锤，造成 175% 攻击力的物理伤害。', 'physical', 'enemy', 0, { power: 1.75 }),
  m_hou: sk('m_hou', '妖王怒吼', '仰天长啸，2 回合内自身物理伤害提升 40%。', 'buff', 'self', 0,
    { buff: { kind: 'atkUp', percent: 40, rounds: 2 } }),
  m_shuijian: sk('m_shuijian', '水箭', '喷吐高压水箭，造成水系法术伤害，威力 100。', 'magic', 'enemy', 0,
    { element: 'water', power: 100 }),
  m_huhuo: sk('m_huhuo', '狐火燎原', '妖火席卷全场，造成火系法术伤害，威力 92。', 'magic', 'enemyAll', 0,
    { element: 'fire', power: 92 }),
  m_meihuo: sk('m_meihuo', '媚惑众生', '媚眼如丝，使所有敌人敌我不分、胡乱出手（可被抵抗）。', 'status', 'enemyAll', 0,
    { status: { kind: 'chaos', baseHit: 68, rounds: 2 } }),
};

// ===== 道具 =====

export const ITEMS: Record<'heal' | 'mana', ItemDef> = {
  heal: { id: 'heal', name: '金疮药', desc: '恢复 200 点气血', heal: 200, startCount: 3 },
  mana: { id: 'mana', name: '凝气丹', desc: '恢复 90 点法力', mana: 90, startCount: 3 },
};

// ===== 玩家职业 =====

export const CLASSES: ClassDef[] = [
  {
    id: 'xiake', name: '哪吒', race: '人族', sect: '乾元山金光洞', emoji: '⚔️',
    desc: '陈塘关李府三公子，灵珠子转世。乾坤圈、混天绫、火尖枪，闹海屠龙、代天伐纣。',
    stats: { hp: 620, mp: 150, atk: 96, def: 62, mag: 30, spd: 55 },
    resists: r(30, 30, 28, 28, 20, 10, 10, 10, 10),
    skillIds: ['jy_zhan', 'jy_ding', 'jy_luan', 'jy_mi', 'jy_zhao', 'jy_lianhua'],
  },
  {
    id: 'lingguan', name: '子牙', race: '仙族', sect: '昆仑山玉虚宫', emoji: '🔮',
    desc: '昆仑山玉虚宫门下掌阐道法师，奉师命下山扶周灭商、执掌封神榜。',
    stats: { hp: 470, mp: 300, atk: 42, def: 42, mag: 108, spd: 50 },
    resists: r(35, 35, 25, 25, 25, 15, 15, 15, 15),
    skillIds: ['zx_huo', 'zx_lei', 'zx_bing', 'zx_feng', 'zx_qi', 'zx_fengshen'],
  },
  {
    id: 'moshi', name: '申公豹', race: '妖族', sect: '碧游宫门下', emoji: '👹',
    desc: '截教门下的妖族道修，三寸不烂之舌蛊惑人心，开天珠一出摄血还身。',
    stats: { hp: 620, mp: 170, atk: 88, def: 58, mag: 55, spd: 46 },
    resists: r(45, 30, 22, 22, 30, 12, 12, 12, 12),
    skillIds: ['xl_hou', 'xl_chui', 'xl_xue', 'xl_hu', 'xl_leizhu'],
  },
  {
    id: 'wuzhu', name: '杨任', race: '幽冥', sect: '青峰山紫阳洞', emoji: '💀',
    desc: '青峰山紫阳洞门下双目含光的神官，五火七禽扇一扇，瘟癀蛊毒随烟而散。',
    stats: { hp: 550, mp: 250, atk: 55, def: 50, mag: 98, spd: 52 },
    resists: r(30, 32, 26, 40, 40, 12, 12, 12, 12),
    skillIds: ['fd_ling', 'fd_gu', 'fd_huo', 'fd_san', 'fd_shou'],
  },
];

// ===== 宠物 =====

export const PETS: PetDef[] = [
  {
    id: 'linghu', name: '四不相', emoji: '🦌',
    desc: '麟首豹尾、通灵善走的神兽四不相，姜太公的坐骑，一缕仙雾便能令敌人昏睡。',
    stats: { hp: 380, mp: 160, atk: 55, def: 34, mag: 78, spd: 72 },
    resists: r(15, 15, 10, 10, 10, 5, 5, 5, 5),
    skillIds: ['cm_mian', 'cm_hu'],
  },
  {
    id: 'yanjia', name: '哮天犬', emoji: '🐕',
    desc: '金瞳铁骨的神犬哮天犬，随主出征冲锋在前，铜头铁臂撕咬凶悍。',
    stats: { hp: 660, mp: 110, atk: 74, def: 76, mag: 20, spd: 34 },
    resists: r(25, 20, 15, 15, 30, 8, 8, 8, 8),
    skillIds: ['yan_han', 'yan_bi'],
  },
  {
    id: 'leisun', name: '青鸾', emoji: '🦅',
    desc: '鸾鸣引雷、振翅带风的青鸾神鸟，速度极快，雷击与风刃兼备。',
    stats: { hp: 360, mp: 170, atk: 62, def: 32, mag: 86, spd: 80 },
    resists: r(12, 15, 10, 10, 5, 10, 10, 10, 10),
    skillIds: ['lei_luo', 'lei_feng'],
  },
  {
    id: 'moqilin', name: '墨麒麟', emoji: '🐎',
    desc: '闻太师的坐骑墨麒麟，弃商归周。墨鳞映雷光，踏雷而行，铁甲护身。',
    stats: { hp: 640, mp: 150, atk: 68, def: 70, mag: 46, spd: 44 },
    resists: r(20, 15, 15, 15, 15, 10, 10, 10, 20),
    skillIds: ['ky_lei', 'ky_jia'],
  },
  {
    id: 'wusheniu', name: '五色神牛', emoji: '🐂',
    desc: '武成王黄飞虎的坐骑五色神牛，五彩斑纹力大无穷，撞阵如山崩，怒吼震三军。',
    stats: { hp: 780, mp: 100, atk: 82, def: 82, mag: 15, spd: 26 },
    resists: r(30, 20, 20, 15, 20, 8, 8, 8, 8),
    skillIds: ['niu_chong', 'niu_hou'],
  },
];

// ===== 怪物 =====

export const MONSTERS: Record<string, MonsterDef> = {
  yelang: {
    id: 'yelang', name: '穿云妖狼', emoji: '🐺',
    stats: { hp: 230, mp: 50, atk: 52, def: 30, mag: 20, spd: 66 },
    resists: r(10, 10, 8, 8, 20, 8, 8, 8, 8),
    skillIds: ['m_yao'],
  },
  heixiong: {
    id: 'heixiong', name: '黑风熊罴', emoji: '🐻',
    stats: { hp: 460, mp: 80, atk: 64, def: 48, mag: 25, spd: 38 },
    resists: r(30, 20, 12, 12, 25, 10, 10, 10, 10),
    skillIds: ['m_xiong'],
  },
  kulou: {
    id: 'kulou', name: '黄泉骨卒', emoji: '💀',
    stats: { hp: 220, mp: 40, atk: 48, def: 28, mag: 20, spd: 48 },
    resists: r(15, 30, 10, 50, 60, 8, 8, 8, 8),
    skillIds: ['m_guci'],
  },
  zhizhu: {
    id: 'zhizhu', name: '幽冥蛛妖', emoji: '🕷️',
    stats: { hp: 330, mp: 120, atk: 44, def: 34, mag: 70, spd: 54 },
    resists: r(20, 20, 12, 12, 90, 10, 10, 10, 10),
    skillIds: ['m_duwu'],
  },
  shanxiao: {
    id: 'shanxiao', name: '骷髅山妖魈', emoji: '🐵',
    stats: { hp: 240, mp: 50, atk: 54, def: 34, mag: 20, spd: 58 },
    resists: r(12, 12, 10, 10, 15, 10, 10, 10, 10),
    skillIds: ['m_zhua'],
  },
  shanxiaowang: {
    id: 'shanxiaowang', name: '白骨洞妖王', emoji: '🦍',
    stats: { hp: 560, mp: 120, atk: 72, def: 52, mag: 40, spd: 52 },
    resists: r(40, 25, 15, 15, 30, 15, 15, 15, 15),
    skillIds: ['m_chui', 'm_hou'],
  },
  shuiyao: {
    id: 'shuiyao', name: '云梦蛟妖', emoji: '🐉',
    stats: { hp: 300, mp: 70, atk: 58, def: 36, mag: 45, spd: 56 },
    resists: r(12, 12, 10, 10, 15, 8, 25, 8, 8),
    skillIds: ['m_yao', 'm_shuijian'],
  },
  daji: {
    id: 'daji', name: '九尾狐妖·妲己', emoji: '🦊',
    stats: { hp: 1350, mp: 320, atk: 88, def: 62, mag: 112, spd: 62 },
    resists: r(45, 45, 35, 35, 60, 30, 30, 30, 30),
    skillIds: ['m_huhuo', 'm_meihuo', 'm_hou'],
  },
};

// ===== 遭遇战 =====

export const ENCOUNTERS: EncounterDef[] = [
  { id: 'heifengling', name: '穿云岭 · 拦路', desc: '两头穿云妖狼与一头黑风熊罴拦路', members: ['yelang', 'yelang', 'heixiong'] },
  { id: 'luanzanggang', name: '黄泉鬼渡 · 魅影', desc: '两具黄泉骨卒与一只幽冥蛛妖游荡', members: ['kulou', 'kulou', 'zhizhu'] },
  { id: 'shanxiao', name: '骷髅山 · 妖王', desc: '两只骷髅山妖魈护卫着白骨洞妖王', members: ['shanxiao', 'shanxiao', 'shanxiaowang'] },
  { id: 'yunmengze', name: '云梦泽 · 蛟踪', desc: '一头云梦蛟妖率妖狼出没烟波', members: ['shuiyao', 'yelang', 'shuiyao'] },
  { id: 'lutai', name: '朝歌鹿台 · 狐妖现形', desc: '九尾狐妖妲己现出真形，妖火照彻鹿台', members: ['daji'] },
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
