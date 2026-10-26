/**
 * 敌方 AI：为一批单位生成这一回合的指令。
 * 纯函数 —— 同样输入 + 同样 RNG 必产出同样指令，联机时可放服务器执行。
 * 优先级：增益 → 控制 → 输出技能 → 普通攻击。
 */
import { SKILLS } from './content';
import type { Rng } from './rng';
import type { Command, Skill, Unit } from './types';
import { resistKeyOf } from './types';

export function planCommands(selfSide: Unit[], foeSide: Unit[], rng: Rng): Command[] {
  const cmds: Command[] = [];

  for (const u of selfSide) {
    if (!u.alive) continue;
    const foes = foeSide.filter((f) => f.alive);
    if (foes.length === 0) break;

    const skills: Skill[] = u.skillIds.map((id) => SKILLS[id]).filter(Boolean);

    // 目标选择：一半概率补刀血量百分比最低者，一半随机
    const pickFoe = (): Unit =>
      rng.chance(0.5)
        ? foes.reduce((a, b) => (a.hp / a.maxHp <= b.hp / b.maxHp ? a : b))
        : rng.pick(foes);

    let cmd: Command | null = null;

    // 1. 增益：自身没有同类增益时按概率使用
    for (const s of skills) {
      if (!s.buff || cmd) continue;
      const has = u.statuses.some((st) => st.kind === s.buff!.kind);
      if (!has && rng.chance(0.45)) {
        cmd = { type: 'skill', actorId: u.id, skillId: s.id, targetId: u.id };
      }
    }

    // 2. 控制：敌方场上还没有该状态时，对正确抗性最低的目标使用
    //    遗忘只对会用法的敌人才有价值，对面全是物理怪时不浪费回合
    if (!cmd) {
      const ctrl = skills.filter((s) => s.kind === 'status' && s.status);
      const foesHaveCaster = foes.some((f) =>
        f.skillIds.some((id) => {
          const fs = SKILLS[id];
          return !!fs && (fs.kind === 'magic' || fs.kind === 'status' || fs.kind === 'buff');
        }),
      );
      const usable = ctrl.filter((s) => {
        const kind = s.status!.kind;
        if (kind === 'forget' && !foesHaveCaster) return false;
        return !foes.some((f) => f.statuses.some((st) => st.kind === kind));
      });
      if (usable.length > 0 && rng.chance(0.5)) {
        const s = rng.pick(usable);
        const key = resistKeyOf(s.status!.kind)!;
        const tgt = foes.reduce((a, b) => (a.resists[key] <= b.resists[key] ? a : b));
        cmd = { type: 'skill', actorId: u.id, skillId: s.id, targetId: tgt.id };
      }
    }

    // 3. 输出技能
    if (!cmd) {
      const dmg = skills.filter((s) => s.kind === 'magic' || s.kind === 'physical');
      if (dmg.length > 0 && rng.chance(0.8)) {
        const s = rng.pick(dmg);
        cmd = { type: 'skill', actorId: u.id, skillId: s.id, targetId: pickFoe().id };
      }
    }

    cmds.push(cmd ?? { type: 'attack', actorId: u.id, targetId: pickFoe().id });
  }

  return cmds;
}

/**
 * 自动战斗（玩家方）指令规划：在敌方 AI 优先级的基础上增加自保——
 * 血量低于 40% 且背包有金疮药时优先嗑药，其余交给通用 AI。
 */
export function planAutoCommands(
  allies: Unit[], foeSide: Unit[], items: { heal: number }, rng: Rng,
): Command[] {
  const cmds: Command[] = [];
  const rest: Unit[] = [];
  for (const u of allies) {
    if (!u.alive) continue;
    if (!foeSide.some((f) => f.alive)) break;
    if (u.hp / u.maxHp < 0.4 && items.heal > 0) {
      items.heal--;
      cmds.push({ type: 'item', actorId: u.id, itemId: 'heal', targetId: u.id });
    } else {
      rest.push(u);
    }
  }
  cmds.push(...planCommands(rest, foeSide, rng));
  return cmds;
}
