/**
 * 回合制战斗引擎（大话式：回合开始统一下指令 → 按速度依次结算）。
 * 纯逻辑层：不依赖 DOM；输入指令、输出事件流；同种子同指令结果完全一致。
 * 将来联机：客户端只发 playerCommands，服务器跑同一份 resolveRound。
 */
import { ENCOUNTERS, ITEMS, MONSTERS, SKILLS, classById, encounterById, petById } from './content';
import { planAutoCommands, planCommands } from './ai';
import { Rng } from './rng';
import { effectiveSkill } from './skill';
import type { StatBonus } from './equipment';
import type {
  BattleEvent,
  Command,
  Element,
  Resists,
  Skill,
  StatusInstance,
  Unit,
  UnitStats,
} from './types';
import { ELEMENT_NAMES, resistKeyOf } from './types';

export interface BattleOptions {
  encounterId: string; // ENCOUNTERS 的 id 或 'random'；世界模式传 'custom'
  classId: string;
  /** 初始宠物物种（无 petUnit 时使用；世界模式忽略） */
  petId?: string;
  playerName: string;
  seed: number;
  /** 世界模式：直接指定怪物组（绕过 ENCOUNTERS 预设） */
  enemyIds?: string[];
  encounterName?: string;
  /** 渲染场景键（世界模式下传地图场景 id） */
  sceneId?: string;
  /** 初始道具数量（默认各 3；世界模式传背包存量） */
  startItems?: { heal: number; mana: number };
  /** 主角装备加成（世界模式由已穿装备汇总） */
  playerBonus?: Partial<StatBonus>;
  /** 师门法术等级（缺省按 1 级） */
  skillLevels?: Record<string, number>;
  /** 宠物个体规格（世界模式由召唤兽实例计算；不传则按 petId 查初始宠物表） */
  petUnit?: { defId: string; name: string; emoji: string; stats: UnitStats; resists: Resists; skillIds: string[] };
}

const SUFFIX = ['甲', '乙', '丙', '丁', '戊'];
const RESIST_CAP = 75;
const CRIT_RATE = 0.08;
const CRIT_MULT = 1.6;

export class Battle {
  readonly seed: number;
  readonly encounterId: string;
  readonly encounterName: string;
  readonly sceneKey: string;
  readonly units: Unit[] = [];
  round = 0;
  over = false;
  winner: 'ally' | 'enemy' | null = null;
  readonly items: { heal: number; mana: number };
  /** 本场战斗消耗的道具（世界模式用于扣背包） */
  readonly usedItems = { heal: 0, mana: 0 };
  /** 本场战斗收服的怪物 defId（世界模式加入宠物栏） */
  readonly caught: string[] = [];

  private rng: Rng;
  private idSeq = 0;
  private skillLevels: Record<string, number>;

  constructor(opts: BattleOptions) {
    this.seed = opts.seed;
    this.rng = new Rng(opts.seed);
    this.encounterId = opts.encounterId;
    this.skillLevels = opts.skillLevels ?? {};
    this.items = {
      heal: opts.startItems?.heal ?? ITEMS.heal.startCount,
      mana: opts.startItems?.mana ?? ITEMS.mana.startCount,
    };

    let members: string[];
    if (opts.enemyIds && opts.enemyIds.length > 0) {
      members = opts.enemyIds;
      this.encounterName = opts.encounterName ?? '遭遇战';
      this.sceneKey = opts.sceneId ?? 'default';
    } else {
      const enc =
        opts.encounterId === 'random'
          ? this.rng.pick(ENCOUNTERS)
          : encounterById(opts.encounterId);
      members = enc.members;
      this.encounterName = enc.name;
      this.sceneKey = opts.sceneId ?? enc.id;
    }

    const cls = classById(opts.classId);
    // 装备加成只作用于主角
    const pb = opts.playerBonus ?? {};
    const pStats: UnitStats = {
      hp: cls.stats.hp + (pb.hp ?? 0),
      mp: cls.stats.mp + (pb.mp ?? 0),
      atk: cls.stats.atk + (pb.atk ?? 0),
      def: cls.stats.def + (pb.def ?? 0),
      mag: cls.stats.mag + (pb.mag ?? 0),
      spd: cls.stats.spd + (pb.spd ?? 0),
    };
    this.addUnit(cls.id, opts.playerName || '无名少侠', cls.emoji, 'ally', 'player', pStats, cls.resists, cls.skillIds);

    const petSpec = opts.petUnit ?? (() => {
      const p = petById(opts.petId ?? 'linghu');
      return { defId: p.id, name: p.name, emoji: p.emoji, stats: p.stats, resists: p.resists, skillIds: p.skillIds };
    })();
    this.addUnit(petSpec.defId, petSpec.name, petSpec.emoji, 'ally', 'pet', petSpec.stats, petSpec.resists, petSpec.skillIds);

    const dupCount = new Map<string, number>();
    for (const mid of members) {
      const m = MONSTERS[mid];
      if (!m) throw new Error(`未知怪物: ${mid}`);
      const n = dupCount.get(mid) ?? 0;
      dupCount.set(mid, n + 1);
      const name = members.filter((x) => x === mid).length > 1
        ? `${m.name}·${SUFFIX[n] ?? n + 1}`
        : m.name;
      this.addUnit(m.id, name, m.emoji, 'enemy', 'monster', m.stats, m.resists, m.skillIds);
    }
  }

  private addUnit(
    defId: string, name: string, emoji: string, side: Unit['side'], tag: Unit['tag'],
    stats: UnitStats, resists: Resists, skillIds: string[],
  ): void {
    this.units.push({
      id: `u${++this.idSeq}`,
      defId, name, emoji, side, tag,
      hp: stats.hp, maxHp: stats.hp,
      mp: stats.mp, maxMp: stats.mp,
      atk: stats.atk, def: stats.def, mag: stats.mag, spd: stats.spd,
      resists: { ...resists },
      skillIds: [...skillIds],
      statuses: [],
      alive: true,
      tiebreak: this.rng.next(),
    });
  }

  unitById(id: string): Unit | undefined {
    return this.units.find((u) => u.id === id);
  }

  aliveOf(side: Unit['side']): Unit[] {
    return this.units.filter((u) => u.side === side && u.alive);
  }

  /** UI 用只读快照（联机时即为服务器下发的战场状态） */
  snapshot(): Unit[] {
    return this.units.map((u) => structuredClone(u));
  }

  /** 自动战斗：为己方全体规划本回合指令（与敌方 AI 同源，走战斗内种子随机，可回放） */
  planAllyAutoCommands(): Command[] {
    return planAutoCommands(this.aliveOf('ally'), this.aliveOf('enemy'), { heal: this.items.heal }, this.rng);
  }

  /**
   * 结算一个回合：己方指令由 UI/客户端提供，敌方由 AI 生成。
   * 返回按时间排序的事件流，UI 顺序播放即可。
   */
  resolveRound(playerCommands: Command[]): BattleEvent[] {
    const events: BattleEvent[] = [];
    if (this.over) return events;

    this.round++;
    events.push({ t: 'roundStart', round: this.round });

    const enemyCommands = planCommands(this.aliveOf('enemy'), this.aliveOf('ally'), this.rng);
    const all = [...playerCommands, ...enemyCommands];

    const order = this.units
      .filter((u) => u.alive)
      .sort((a, b) => b.spd - a.spd || b.tiebreak - a.tiebreak);

    for (const actor of order) {
      if (!actor.alive || this.over) break;
      const cmd = all.find((c) => c.actorId === actor.id);
      this.performTurn(actor, cmd, events);
      this.checkEnd(events);
    }

    if (!this.over) {
      this.endOfRound(events);
      this.checkEnd(events);
    }
    return events;
  }

  // ===== 单个单位的一次行动 =====

  private performTurn(actor: Unit, cmd: Command | undefined, events: BattleEvent[]): void {
    events.push({ t: 'actionStart', actorId: actor.id });

    const has = (k: StatusInstance['kind']) => actor.statuses.some((s) => s.kind === k);

    if (has('sleep')) {
      events.push({ t: 'actSkip', actorId: actor.id, reason: 'sleep' });
      return;
    }
    if (has('seal')) {
      events.push({ t: 'actSkip', actorId: actor.id, reason: 'seal' });
      return;
    }

    if (has('chaos')) {
      // 混乱：不受控制，向随机目标（双方皆可、不含自己）普攻
      events.push({ t: 'actOverride', actorId: actor.id, reason: 'chaos' });
      const pool = this.units.filter((u) => u.alive && u.id !== actor.id);
      if (pool.length > 0) this.basicAttack(actor, this.rng.pick(pool), events);
      return;
    }

    let effective: Command = cmd ?? { type: 'defend', actorId: actor.id };
    let scaled: Skill | undefined;

    if (effective.type === 'skill') {
      const base = SKILLS[effective.skillId];
      if (!base) {
        effective = { type: 'defend', actorId: actor.id };
      } else {
        scaled = effectiveSkill(base, this.skillLevels[effective.skillId] ?? 1);
        if (has('forget') && scaled.kind !== 'physical') {
          // 遗忘：非物理技能全部失效，只能普攻
          events.push({ t: 'actOverride', actorId: actor.id, reason: 'forget' });
          effective = this.fallbackAttack(actor);
        } else if (actor.mp < scaled.mpCost) {
          events.push({ t: 'actOverride', actorId: actor.id, reason: 'exhausted' });
          effective = this.fallbackAttack(actor);
        }
      }
    }

    switch (effective.type) {
      case 'attack': {
        // basicAttack 内部会推送 attack 事件，这里不用重复
        const target = this.resolveTarget(actor, effective.targetId, 'foe');
        if (target) this.basicAttack(actor, target, events);
        break;
      }
      case 'skill': {
        if (!scaled) break;
        actor.mp -= scaled.mpCost;
        events.push({ t: 'cast', actorId: actor.id, skillId: scaled.id });
        this.castSkill(actor, scaled, (effective as Extract<typeof effective, { type: 'skill' }>).targetId, events);
        break;
      }
      case 'defend': {
        this.applyStatusRaw(actor, actor, { kind: 'defend', rounds: 1 }, events);
        events.push({ t: 'defend', actorId: actor.id });
        break;
      }
      case 'item': {
        const def = ITEMS[effective.itemId];
        if (this.items[effective.itemId] <= 0) break;
        const target = this.resolveTarget(actor, effective.targetId, 'self-side');
        this.items[effective.itemId]--;
        this.usedItems[effective.itemId]++;
        events.push({ t: 'itemUsed', actorId: actor.id, itemId: effective.itemId, remain: this.items[effective.itemId] });
        if (!target) break;
        if (def.heal) {
          const amount = Math.min(def.heal, target.maxHp - target.hp);
          target.hp += amount;
          events.push({ t: 'heal', sourceId: actor.id, targetId: target.id, amount, hpAfter: target.hp });
        }
        if (def.mana) {
          const delta = Math.min(def.mana, target.maxMp - target.mp);
          target.mp += delta;
          events.push({ t: 'mpChange', targetId: target.id, delta, mpAfter: target.mp });
        }
        break;
      }
      case 'catch': {
        // 只有玩家方可以收服野怪；头目（王）不可收服
        const target = this.resolveTarget(actor, effective.targetId, 'foe');
        if (!target || actor.side !== 'ally' || target.tag !== 'monster') break;
        if (target.defId === 'shanxiaowang') {
          events.push({ t: 'catchFail', targetId: target.id, chance: 0 });
          break;
        }
        const chance = 0.2 + (1 - target.hp / target.maxHp) * 0.55;
        if (this.rng.chance(chance)) {
          target.alive = false;
          target.statuses = [];
          this.caught.push(target.defId);
          events.push({ t: 'catchSuccess', targetId: target.id, defId: target.defId });
        } else {
          events.push({ t: 'catchFail', targetId: target.id, chance });
        }
        break;
      }
    }
  }

  private fallbackAttack(actor: Unit): Command {
    const foes = this.aliveOf(actor.side === 'ally' ? 'enemy' : 'ally');
    const targetId = foes.length > 0 ? this.rng.pick(foes).id : actor.id;
    return { type: 'attack', actorId: actor.id, targetId };
  }

  /** 把可能已失效的目标换成同阵营的存活者；pool 为空返回 null */
  private resolveTarget(actor: Unit, targetId: string, which: 'foe' | 'self-side'): Unit | null {
    const side = which === 'foe'
      ? (actor.side === 'ally' ? 'enemy' : 'ally')
      : actor.side;
    const t = this.units.find((u) => u.id === targetId);
    if (t && t.alive && t.side === side) return t;
    const pool = this.aliveOf(side);
    return pool.length > 0 ? this.rng.pick(pool) : null;
  }

  private basicAttack(actor: Unit, target: Unit, events: BattleEvent[]): void {
    events.push({ t: 'attack', actorId: actor.id });
    const atkEff = actor.atk * this.buffMult(actor, 'atkUp');
    const raw = (atkEff * 100) / (100 + target.def);
    this.dealDamage(actor, target, raw, 'physical', events, true);
  }

  private buffMult(u: Unit, kind: 'atkUp' | 'defUp'): number {
    const s = u.statuses.find((st) => st.kind === kind);
    return s ? 1 + (s.power ?? 0) / 100 : 1;
  }

  private castSkill(actor: Unit, skill: Skill, targetId: string, events: BattleEvent[]): void {
    const foesSide = actor.side === 'ally' ? 'enemy' : 'ally';

    if (skill.kind === 'physical') {
      const target = this.resolveTarget(actor, targetId, 'foe');
      if (!target) return;
      const atkEff = actor.atk * this.buffMult(actor, 'atkUp');
      const raw = ((atkEff * (skill.power ?? 1)) * 100) / (100 + target.def);
      const dealt = this.dealDamage(actor, target, raw, 'physical', events, true);
      // 吸血：按造成伤害的比例回复自身
      if (skill.drain && actor.alive) {
        const amount = Math.min(actor.maxHp - actor.hp, Math.round(dealt * skill.drain));
        if (amount > 0) {
          actor.hp += amount;
          events.push({ t: 'heal', sourceId: actor.id, targetId: actor.id, amount, hpAfter: actor.hp });
        }
      }
      return;
    }

    if (skill.kind === 'magic') {
      const targets =
        skill.target === 'enemyAll'
          ? this.aliveOf(foesSide)
          : [this.resolveTarget(actor, targetId, 'foe')].filter((u): u is Unit => u !== null);
      for (const target of targets) {
        const res = target.resists[skill.element as keyof Resists] ?? 0;
        const elemFactor = (100 - Math.min(res, RESIST_CAP) * 0.6) / 100;
        const raw = actor.mag * ((skill.power ?? 100) / 100) * elemFactor;
        this.dealDamage(actor, target, raw, skill.element, events, false);
      }
      return;
    }

    if (skill.kind === 'status') {
      if (!skill.status) return;
      const targets =
        skill.target === 'enemyAll'
          ? this.aliveOf(foesSide)
          : [this.resolveTarget(actor, targetId, 'foe')].filter((u): u is Unit => u !== null);
      for (const target of targets) {
        this.rollStatus(actor, target, skill.status, events);
      }
      return;
    }

    if (skill.kind === 'buff') {
      if (!skill.buff) return;
      const target = skill.target === 'self' ? actor : this.resolveTarget(actor, targetId, 'self-side');
      if (!target) return;
      this.applyStatusRaw(actor, target, { kind: skill.buff.kind, rounds: skill.buff.rounds, power: skill.buff.percent }, events);
    }
  }

  /** 带抗性判定的状态施加 */
  private rollStatus(
    source: Unit, target: Unit,
    st: { kind: StatusInstance['kind']; baseHit: number; rounds: number; power?: number },
    events: BattleEvent[],
  ): void {
    const key = resistKeyOf(st.kind);
    if (key) {
      const hit = Math.max(5, Math.min(95, st.baseHit - target.resists[key]));
      if (!this.rng.chance(hit / 100)) {
        events.push({ t: 'statusResist', targetId: target.id, kind: st.kind });
        return;
      }
    }
    this.applyStatusRaw(source, target, st, events);
  }

  /** 无视抗性直接施加（buff、防御） */
  private applyStatusRaw(
    _source: Unit, target: Unit,
    st: { kind: StatusInstance['kind']; rounds: number; power?: number },
    events: BattleEvent[],
  ): void {
    const exist = target.statuses.find((s) => s.kind === st.kind);
    if (exist) {
      // 重复施加：重新锚定并刷新时长
      exist.rounds = st.rounds;
      exist.appliedRound = this.round;
      if (st.power !== undefined) exist.power = Math.max(exist.power ?? 0, st.power);
    } else {
      const inst: StatusInstance = { kind: st.kind, rounds: st.rounds, appliedRound: this.round };
      if (st.power !== undefined) inst.power = st.power;
      target.statuses.push(inst);
    }
    events.push({ t: 'statusHit', targetId: target.id, kind: st.kind, rounds: st.rounds });
  }

  private dealDamage(
    source: Unit | null, target: Unit, raw: number, element: Element,
    events: BattleEvent[], canCrit: boolean,
  ): number {
    let dmg = raw;
    let crit = false;
    if (canCrit && this.rng.chance(CRIT_RATE)) {
      dmg *= CRIT_MULT;
      crit = true;
    }
    for (const s of target.statuses) {
      if (s.kind === 'defend') dmg *= 0.5;
      else if (s.kind === 'defUp') dmg *= 1 - (s.power ?? 0) / 100;
    }
    dmg = Math.max(1, Math.round(dmg));

    target.hp = Math.max(0, target.hp - dmg);
    events.push({
      t: 'damage', sourceId: source?.id ?? '', targetId: target.id,
      amount: dmg, element, crit, hpAfter: target.hp,
    });

    if (target.hp === 0 && target.alive) {
      target.alive = false;
      target.statuses = [];
      events.push({ t: 'death', targetId: target.id });
    } else if (target.statuses.some((s) => s.kind === 'sleep')) {
      // 受击即醒
      target.statuses = target.statuses.filter((s) => s.kind !== 'sleep');
      events.push({ t: 'statusEnd', targetId: target.id, kind: 'sleep', reason: 'woken' });
    }
    return dmg;
  }

  // ===== 回合末：蚀毒结算 → 法力回复 → 状态递减 =====

  private endOfRound(events: BattleEvent[]): void {
    for (const u of this.units) {
      if (!u.alive) continue;
      const ps = u.statuses.find((s) => s.kind === 'poison');
      if (ps && ps.power) {
        u.hp = Math.max(0, u.hp - ps.power);
        events.push({ t: 'poisonTick', targetId: u.id, amount: ps.power, hpAfter: u.hp });
        if (u.hp === 0 && u.alive) {
          u.alive = false;
          u.statuses = [];
          events.push({ t: 'death', targetId: u.id });
        }
      }
      if (u.mp < u.maxMp) {
        const regen = Math.max(3, Math.round(u.maxMp * 0.08));
        u.mp = Math.min(u.maxMp, u.mp + regen);
        events.push({ t: 'mpChange', targetId: u.id, delta: regen, mpAfter: u.mp });
      }
    }

    for (const u of this.units) {
      if (!u.alive) continue;
      // 防御姿态只保护当前回合，回合末即失效
      if (u.statuses.some((s) => s.kind === 'defend')) {
        u.statuses = u.statuses.filter((s) => {
          if (s.kind !== 'defend') return true;
          events.push({ t: 'statusEnd', targetId: u.id, kind: 'defend', reason: 'expire' });
          return false;
        });
      }
      for (const s of [...u.statuses]) {
        if (this.round <= s.appliedRound) continue; // 施加当回合不递减
        s.rounds--;
        if (s.rounds <= 0) {
          u.statuses = u.statuses.filter((x) => x !== s);
          events.push({ t: 'statusEnd', targetId: u.id, kind: s.kind, reason: 'expire' });
        }
      }
    }
  }

  private checkEnd(events: BattleEvent[]): void {
    if (this.over) return;
    const allyAlive = this.aliveOf('ally').length > 0;
    const enemyAlive = this.aliveOf('enemy').length > 0;
    if (!allyAlive || !enemyAlive) {
      this.over = true;
      this.winner = enemyAlive ? 'enemy' : 'ally';
      events.push({ t: 'battleEnd', winner: this.winner, rounds: this.round });
    }
  }
}

/** 伤害日志用的元素名（含物理） */
export function elementName(e: Element): string {
  return ELEMENT_NAMES[e];
}
