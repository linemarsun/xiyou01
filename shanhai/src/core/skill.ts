/**
 * 师门法术等级（大话2 式）：每个法术系 1~10 级，
 * 威力/命中率/持续回合/MP 消耗随等级成长；升级消耗银两+潜能点（师门修炼）。
 */
import type { Skill } from './types';

export const SKILL_MAX_LEVEL = 10;

const r2 = (v: number) => Math.round(v * 100) / 100;

/** 按法术等级换算出实际生效的技能数值 */
export function effectiveSkill(s: Skill, level: number): Skill {
  const L = Math.max(1, Math.min(SKILL_MAX_LEVEL, level)) - 1;
  const e: Skill = { ...s, mpCost: s.mpCost + 2 * L };
  if (s.kind === 'physical' && s.power !== undefined) {
    e.power = r2(s.power * (1 + 0.06 * L));
  }
  if (s.kind === 'magic' && s.power !== undefined) {
    e.power = r2(s.power * (1 + 0.07 * L));
  }
  if (s.status) {
    e.status = {
      ...s.status,
      baseHit: Math.min(95, Math.round(s.status.baseHit + 1.5 * L)),
      rounds: s.status.rounds + (level >= 6 ? 1 : 0),
      power: s.status.power !== undefined ? s.status.power + 8 * L : undefined,
    };
  }
  if (s.buff) {
    e.buff = {
      ...s.buff,
      percent: s.buff.percent + 2 * L,
      rounds: s.buff.rounds + (level >= 6 ? 1 : 0),
    };
  }
  return e;
}

/** 修到 level+1 级的费用 */
export function skillUpgradeCost(level: number): { silver: number; potential: number } {
  return { silver: 40 * (level + 1), potential: level + 1 };
}

/** 当前等级下的效果描述（比 base desc 更精确） */
export function describeSkillAt(s: Skill, level: number): string {
  const e = effectiveSkill(s, level);
  switch (e.kind) {
    case 'physical':
      return `造成 ${Math.round((e.power ?? 1) * 100)}% 攻击力的物理伤害`;
    case 'magic': {
      const elem = e.element === 'wind' ? '风' : e.element === 'fire' ? '火' : e.element === 'water' ? '水' : e.element === 'thunder' ? '雷' : '';
      return `${elem}系${e.target === 'enemyAll' ? '群体' : '单体'}法术，威力 ${Math.round(e.power ?? 0)}`;
    }
    case 'status': {
      const st = e.status!;
      const names: Record<string, string> = { chaos: '混乱', sleep: '昏睡', seal: '封印', forget: '遗忘', poison: '中毒' };
      const dur = st.kind === 'poison' ? `每回合损失 ${st.power} 点、持续 ${st.rounds} 回合` : `${st.rounds} 回合`;
      return `使敌人 ${names[st.kind]}（命中 ${st.baseHit}%），${dur}`;
    }
    case 'buff': {
      const b = e.buff!;
      return `${b.kind === 'atkUp' ? '物理伤害' : '受到的伤害'}${b.kind === 'atkUp' ? '提升' : '降低'} ${b.percent}%，持续 ${b.rounds} 回合`;
    }
    default:
      return s.desc;
  }
}
