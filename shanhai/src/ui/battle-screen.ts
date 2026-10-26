/**
 * 战斗界面：大话式指挥流程 —— 每回合开始为所有己方单位依次下指令，
 * 点「出手」后按事件流播放结算。战场画面由 PixiJS 渲染器负责（2.5D），
 * 本组件保留 DOM 的指令面板 / 战斗日志 / 结算浮层。
 */
import { Battle, elementName, type BattleOptions } from '../core/battle';
import { ITEMS, SKILLS, classById, petById } from '../core/content';
import type { BattleEvent, Command, Skill, Unit } from '../core/types';
import { STATUS_META } from '../core/types';
import { effectiveSkill, describeSkillAt } from '../core/skill';
import { h } from './dom';
import { BattleRenderer } from '../render/battle-renderer';

const DELAYS: Record<BattleEvent['t'], number> = {
  roundStart: 620,
  actionStart: 380,
  actSkip: 460,
  actOverride: 460,
  cast: 540,
  attack: 380,
  defend: 360,
  damage: 500,
  heal: 500,
  mpChange: 60,
  statusHit: 480,
  statusResist: 400,
  statusEnd: 260,
  poisonTick: 500,
  death: 700,
  catchSuccess: 620,
  catchFail: 440,
  itemUsed: 480,
  battleEnd: 700,
};

type Choice =
  | { kind: 'attack' }
  | { kind: 'skill'; skill: Skill }
  | { kind: 'item'; itemId: 'heal' | 'mana' }
  | { kind: 'catch' };

export interface BattleFinishInfo {
  winner: 'ally' | 'enemy' | null;
  rounds: number;
  itemsUsed: { heal: number; mana: number };
  caught: string[];
}

/** 世界模式钩子：战斗结束时结算奖励/任务/存档，返回展示用摘要行 */
export interface BattleHooks {
  finish: (info: BattleFinishInfo) => { lines: string[] };
}

export class BattleScreen {
  private battle: Battle;
  private root: HTMLElement;
  private opts: BattleOptions;
  private onExit: () => void;
  private renderer: BattleRenderer;
  private hooks: BattleHooks | null;
  private rewardLines: string[] = [];

  private speed = 1;
  private auto = false;
  private autoTimer: number | null = null;
  private autoBtn!: HTMLButtonElement;
  private mode: 'idle' | 'menu' | 'target' = 'idle';
  private pending = new Map<string, Command>();
  private cmdQueue: Unit[] = [];
  private cmdIdx = 0;
  private choosing: Choice | null = null;

  private roundEl!: HTMLElement;
  private bannerEl!: HTMLElement;
  private logEl!: HTMLElement;
  private cmdEl!: HTMLElement;
  private speedBtn!: HTMLButtonElement;
  /** UI 侧战场状态：指挥阶段与引擎同步，播放期间按事件流增量更新 */
  private uiUnits = new Map<string, Unit>();

  private constructor(root: HTMLElement, opts: BattleOptions, onExit: () => void, renderer: BattleRenderer, battle: Battle, hooks: BattleHooks | null) {
    this.root = root;
    this.opts = opts;
    this.onExit = onExit;
    this.battle = battle;
    this.renderer = renderer;
    this.hooks = hooks;
  }

  static async create(root: HTMLElement, opts: BattleOptions, onExit: () => void, hooks: BattleHooks | null = null): Promise<BattleScreen> {
    const battle = new Battle(opts);
    const sceneHost = h('div', { class: 'scene-host' });
    const renderer = await BattleRenderer.create(sceneHost, battle.sceneKey, battle.snapshot());
    const screen = new BattleScreen(root, opts, onExit, renderer, battle, hooks);
    screen.buildSkeleton(sceneHost);
    screen.syncFromBattle();
    screen.renderState();
    screen.startCommandPhase();
    return screen;
  }

  destroy(): void {
    if (this.autoTimer !== null) window.clearTimeout(this.autoTimer);
    this.renderer.destroy();
    this.root.innerHTML = '';
  }

  // ===== 自动战斗 =====

  private toggleAuto(): void {
    this.auto = !this.auto;
    this.autoBtn.textContent = this.auto ? '⏸ 自动 开' : '▶ 自动 关';
    this.autoBtn.classList.toggle('auto-on', this.auto);

    if (this.auto) {
      // 指挥阶段中开启：立即接管本回合；结算播放中开启：下一回合生效
      if (this.mode !== 'idle' && !this.battle.over) this.scheduleAutoRound();
    } else if (this.autoTimer !== null) {
      // 出手前反悔：撤销自动指令，回到手动指挥
      window.clearTimeout(this.autoTimer);
      this.autoTimer = null;
      this.pending.clear();
      this.startCommandPhase();
    }
  }

  private scheduleAutoRound(): void {
    if (this.autoTimer !== null) return;
    this.mode = 'idle';
    this.choosing = null;
    this.renderer.setTargetable([]);
    this.renderer.setCommanded([]);
    this.renderState();

    const cmds = this.battle.planAllyAutoCommands();
    this.pending.clear();
    for (const c of cmds) this.pending.set(c.actorId, c);
    this.renderer.setCommanded([...this.pending.keys()]);
    this.renderState();
    this.setBanner('🤖 自动战斗中 —— 本回合指令已自动下达');
    this.cmdEl.innerHTML = '';
    this.cmdEl.append(
      h('div', { class: 'cmd-hint' },
        '🤖 自动战斗中… ',
        h('button', { class: 'btn small', onclick: () => this.toggleAuto() }, '停止自动'),
      ),
    );
    this.autoTimer = window.setTimeout(() => {
      this.autoTimer = null;
      if (this.auto && !this.battle.over) void this.commitRound();
    }, 700);
  }

  // ===== 骨架 =====

  private buildSkeleton(sceneHost: HTMLElement): void {
    this.root.innerHTML = '';
    this.autoBtn = h('button', {
      class: 'btn small',
      onclick: () => this.toggleAuto(),
    }, '▶ 自动 关');

    this.speedBtn = h('button', {
      class: 'btn small',
      onclick: () => {
        this.speed = this.speed === 1 ? 2 : 1;
        this.speedBtn.textContent = `速度 ×${this.speed}`;
        this.renderer.setSpeed(this.speed);
      },
    }, '速度 ×1');

    this.roundEl = h('span', {}, '第 1 回合');
    const header = h('div', { class: 'bheader' },
      h('div', { class: 'btitle' }, `⚔ 山海奇谭 · ${this.battle.encounterName}`),
      h('div', { class: 'bround' }, this.roundEl, ` · 种子 ${this.battle.seed}`),
      h('div', { class: 'bspace' }),
      this.autoBtn,
      this.speedBtn,
    );

    this.bannerEl = h('div', { class: 'banner' }, '');
    this.logEl = h('div', { class: 'log' });
    this.cmdEl = h('div', { class: 'cmd-panel' });
    this.renderer.onUnitClick = (unitId) => this.onUnitClick(unitId);

    this.root.append(
      header,
      this.bannerEl,
      h('div', { class: 'bmain' },
        h('div', { class: 'bcol' }, sceneHost, this.cmdEl),
        h('div', { class: 'sidebar' }, h('div', { class: 'side-label' }, '战斗记录'), this.logEl),
      ),
    );
  }

  // ===== 状态同步 =====

  private syncFromBattle(): void {
    this.uiUnits.clear();
    for (const u of this.battle.snapshot()) this.uiUnits.set(u.id, u);
  }

  private renderState(): void {
    this.renderer.renderState([...this.uiUnits.values()]);
  }

  private log(text: string, cls = ''): void {
    const line = h('div', { class: `logline ${cls}` }, text);
    this.logEl.append(line);
    while (this.logEl.children.length > 250) this.logEl.firstChild?.remove();
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  private setBanner(text: string): void {
    this.bannerEl.textContent = text;
  }

  private nameOf(id: string): string {
    return this.battle.unitById(id)?.name ?? id;
  }

  // ===== 指挥阶段 =====

  private startCommandPhase(): void {
    if (this.battle.over) {
      this.syncFromBattle();
      this.renderState();
      this.showEndOverlay();
      return;
    }
    this.mode = 'menu';
    this.choosing = null;
    this.pending.clear();
    this.renderer.setCommanded([]);
    this.renderer.setTargetable([]);
    this.renderer.setFocus(null);
    this.cmdQueue = this.battle.units.filter((u) => u.side === 'ally' && u.alive);
    this.cmdIdx = 0;
    this.syncFromBattle();
    this.renderState();
    this.cmdEl.style.display = '';
    this.roundEl.textContent = `第 ${this.battle.round + 1} 回合`;
    this.setBanner(`⚡ 指挥阶段 —— 为【${this.cmdQueue[0]?.name ?? ''}】下指令`);
    this.renderCmdPanel();
    if (this.auto) this.scheduleAutoRound();
  }

  private currentCommander(): Unit | undefined {
    return this.cmdQueue[this.cmdIdx];
  }

  private renderCmdPanel(): void {
    this.mode = 'menu';
    this.choosing = null;
    this.renderer.setTargetable([]);
    this.cmdEl.innerHTML = '';
    const cur = this.currentCommander();
    this.renderer.setFocus(cur?.id ?? null);

    if (!cur) {
      this.cmdEl.append(
        h('div', { class: 'cmd-hint' }, '✅ 指令已就绪，可以出手了'),
        h('button', { class: 'btn primary big', onclick: () => void this.commitRound() }, '出 手 ！'),
      );
      return;
    }

    this.cmdEl.append(
      h('div', { class: 'cmd-hint' },
        `为【${cur.name}】下指令（${this.cmdIdx + 1}/${this.cmdQueue.length}）`,
        this.pending.size === this.cmdQueue.length
          ? h('button', { class: 'btn primary', style: 'margin-left:12px', onclick: () => void this.commitRound() }, '出手！')
          : '',
      ),
      h('div', { class: 'cmd-row' },
        h('button', { class: 'btn', onclick: () => this.beginTarget({ kind: 'attack' }) }, '⚔ 攻击'),
        h('button', { class: 'btn', onclick: () => this.renderSkillMenu(cur) }, '✨ 法术'),
        h('button', { class: 'btn', onclick: () => this.renderItemMenu(cur) }, '🧪 道具'),
        h('button', { class: 'btn', onclick: () => this.storeCommand({ type: 'defend', actorId: cur.id }) }, '🛡 防御'),
        cur.tag === 'player'
          ? h('button', {
              class: 'btn',
              title: '对方气血越低越容易收服（头目不可收服）',
              onclick: () => this.beginTarget({ kind: 'catch' }),
            }, '🪢 捕捉')
          : '',
        this.cmdIdx > 0
          ? h('button', { class: 'btn small', onclick: () => this.undoLast() }, '⤺ 重选上一人')
          : '',
      ),
    );
  }

  private renderSkillMenu(cur: Unit): void {
    this.cmdEl.innerHTML = '';
    this.cmdEl.append(h('div', { class: 'cmd-hint' }, `选择法术（${cur.name} · 法力 ${cur.mp}/${cur.maxMp}）`));
    const row = h('div', { class: 'cmd-row' });
    for (const id of cur.skillIds) {
      const s = SKILLS[id];
      if (!s) continue;
      const lvl = this.opts.skillLevels?.[id] ?? 1;
      const e = effectiveSkill(s, lvl);
      row.append(h('button', {
        class: 'btn',
        disabled: cur.mp < e.mpCost,
        title: `Lv.${lvl} · ${describeSkillAt(s, lvl)}（耗蓝 ${e.mpCost}）`,
        onclick: () => this.chooseSkill(cur, s),
      }, `${s.name} Lv${lvl} (${e.mpCost})`));
    }
    row.append(h('button', { class: 'btn small', onclick: () => this.renderCmdPanel() }, '返回'));
    this.cmdEl.append(row);
  }

  private renderItemMenu(cur: Unit): void {
    this.cmdEl.innerHTML = '';
    this.cmdEl.append(h('div', { class: 'cmd-hint' }, `选择道具（${cur.name}）`));
    const row = h('div', { class: 'cmd-row' });
    for (const itemId of ['heal', 'mana'] as const) {
      const def = ITEMS[itemId];
      row.append(h('button', {
        class: 'btn',
        disabled: this.battle.items[itemId] <= 0,
        title: def.desc,
        onclick: () => this.beginTarget({ kind: 'item', itemId }),
      }, `${def.name} ×${this.battle.items[itemId]}`));
    }
    row.append(h('button', { class: 'btn small', onclick: () => this.renderCmdPanel() }, '返回'));
    this.cmdEl.append(row);
  }

  private chooseSkill(cur: Unit, s: Skill): void {
    if (s.target === 'self') {
      this.storeCommand({ type: 'skill', actorId: cur.id, skillId: s.id, targetId: cur.id });
      return;
    }
    if (s.target === 'enemyAll') {
      this.storeCommand({ type: 'skill', actorId: cur.id, skillId: s.id, targetId: '' });
      return;
    }
    this.beginTarget({ kind: 'skill', skill: s });
  }

  private beginTarget(choice: Choice): void {
    const cur = this.currentCommander();
    if (!cur) return;
    this.choosing = choice;
    this.mode = 'target';

    let targets: Unit[];
    if (choice.kind === 'attack' || choice.kind === 'catch') {
      targets = this.battle.aliveOf(cur.side === 'ally' ? 'enemy' : 'ally');
    } else if (choice.kind === 'item') {
      targets = this.battle.aliveOf('ally');
    } else {
      const foeSide = cur.side === 'ally' ? 'enemy' : 'ally';
      targets = choice.skill.target === 'ally' ? this.battle.aliveOf('ally') : this.battle.aliveOf(foeSide);
    }
    this.renderer.setTargetable(targets.map((t) => t.id));
    this.renderState();
    this.setBanner(`🎯 请点选场景中的目标（${cur.name} · ${this.choiceLabel(choice)}）`);
    // 选目标期间面板只留提示与返回，防止误点改指令
    this.cmdEl.innerHTML = '';
    this.cmdEl.append(
      h('div', { class: 'cmd-hint' }, `🎯 为【${cur.name}】选择${this.choiceLabel(choice)}的目标…`),
      h('button', { class: 'btn small', onclick: () => this.renderCmdPanel() }, '⤺ 返回重选'),
    );
  }

  private choiceLabel(c: Choice): string {
    if (c.kind === 'attack') return '攻击';
    if (c.kind === 'item') return ITEMS[c.itemId].name;
    if (c.kind === 'catch') return '捕捉';
    return c.skill.name;
  }

  private onUnitClick(unitId: string): void {
    if (this.mode !== 'target' || !this.choosing) return;
    const cur = this.currentCommander();
    if (!cur) return;

    const c = this.choosing;
    const cmd: Command =
      c.kind === 'attack' ? { type: 'attack', actorId: cur.id, targetId: unitId }
        : c.kind === 'skill' ? { type: 'skill', actorId: cur.id, skillId: c.skill.id, targetId: unitId }
          : c.kind === 'catch' ? { type: 'catch', actorId: cur.id, targetId: unitId }
            : { type: 'item', actorId: cur.id, itemId: c.itemId, targetId: unitId };
    this.storeCommand(cmd);
  }

  private storeCommand(cmd: Command): void {
    this.pending.set(cmd.actorId, cmd);
    this.cmdIdx++;
    this.choosing = null;
    this.mode = 'menu';
    this.renderer.setTargetable([]);
    this.renderer.setCommanded([...this.pending.keys()]);
    this.renderState();
    const next = this.currentCommander();
    this.setBanner(next ? `⚡ 指挥阶段 —— 为【${next.name}】下指令` : '✅ 指令已就绪');
    this.renderCmdPanel();
  }

  private undoLast(): void {
    if (this.cmdIdx <= 0) return;
    this.cmdIdx--;
    const u = this.cmdQueue[this.cmdIdx];
    this.pending.delete(u.id);
    this.renderer.setCommanded([...this.pending.keys()]);
    this.renderState();
    this.setBanner(`⚡ 指挥阶段 —— 重新为【${u.name}】下指令`);
    this.renderCmdPanel();
  }

  // ===== 结算播放 =====

  private async commitRound(): Promise<void> {
    this.mode = 'idle';
    this.cmdEl.style.display = 'none';
    this.renderer.setTargetable([]);
    this.renderer.setCommanded([]);
    this.renderer.setFocus(null);
    this.renderState();
    this.setBanner('⏳ 回合结算中…');

    const events = this.battle.resolveRound([...this.pending.values()]);
    for (const ev of events) {
      this.applyStateToUi(ev);
      this.applyEvent(ev);
      this.renderer.playEvent(ev);
      this.renderState();
      await this.sleep(DELAYS[ev.t]);
    }
    this.syncFromBattle();
    this.renderState();
    if (this.battle.over) {
      if (this.hooks) {
        this.rewardLines = this.hooks.finish({
          winner: this.battle.winner,
          rounds: this.battle.round,
          itemsUsed: { ...this.battle.usedItems },
          caught: [...this.battle.caught],
        }).lines;
      }
      this.showEndOverlay();
    } else {
      this.startCommandPhase();
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms / this.speed));
  }

  /** 播放期间按事件流增量更新 UI 状态（联机客户端同理：只有事件流可用） */
  private applyStateToUi(ev: BattleEvent): void {
    const get = (id: string) => this.uiUnits.get(id);
    switch (ev.t) {
      case 'damage':
      case 'heal':
      case 'poisonTick': {
        const u = get(ev.targetId);
        if (u) u.hp = ev.hpAfter;
        break;
      }
      case 'mpChange': {
        const u = get(ev.targetId);
        if (u) u.mp = ev.mpAfter;
        break;
      }
      case 'death':
      case 'catchSuccess': {
        const u = get(ev.targetId);
        if (u) {
          u.alive = false;
          u.statuses = [];
        }
        break;
      }
      case 'statusHit': {
        const u = get(ev.targetId);
        if (!u) break;
        const exist = u.statuses.find((s) => s.kind === ev.kind);
        if (exist) exist.rounds = ev.rounds;
        else u.statuses.push({ kind: ev.kind, rounds: ev.rounds, appliedRound: 0 });
        break;
      }
      case 'statusEnd': {
        const u = get(ev.targetId);
        if (u) u.statuses = u.statuses.filter((s) => s.kind !== ev.kind);
        break;
      }
      default:
        break;
    }
  }

  private applyEvent(ev: BattleEvent): void {
    switch (ev.t) {
      case 'roundStart':
        this.roundEl.textContent = `第 ${ev.round} 回合`;
        this.log(`—— 第 ${ev.round} 回合 ——`, 'sys');
        break;
      case 'actionStart':
        this.setBanner(`▸ ${this.nameOf(ev.actorId)} 的回合`);
        this.renderer.setFocus(ev.actorId);
        break;
      case 'actSkip':
        this.log(`${this.nameOf(ev.actorId)} ${ev.reason === 'sleep' ? '睡得正香，无法行动' : '被封印，动弹不得！'}`, 'warn');
        break;
      case 'actOverride':
        this.log(
          ev.reason === 'chaos' ? `${this.nameOf(ev.actorId)} 陷入混乱，敌我不分地胡乱出手！`
            : ev.reason === 'forget' ? `${this.nameOf(ev.actorId)} 忘却了法术，只能挥砍攻击`
              : `${this.nameOf(ev.actorId)} 法力不足，转为普通攻击`,
          'warn',
        );
        break;
      case 'cast':
        this.log(`${this.nameOf(ev.actorId)} 使用【${SKILLS[ev.skillId]?.name ?? '?'}】`, 'cast');
        break;
      case 'attack':
        this.log(`${this.nameOf(ev.actorId)} 发起普通攻击`);
        break;
      case 'defend':
        this.log(`${this.nameOf(ev.actorId)} 摆出防御姿态`);
        break;
      case 'damage':
        this.log(
          `${this.nameOf(ev.sourceId)} 对 ${this.nameOf(ev.targetId)} 造成 ${ev.amount} 点${elementName(ev.element)}伤害${ev.crit ? '（会心一击！）' : ''}`,
          'dmg',
        );
        break;
      case 'heal':
        this.log(`${this.nameOf(ev.targetId)} 恢复了 ${ev.amount} 点气血`, 'heal');
        break;
      case 'mpChange':
        break;
      case 'statusHit': {
        const meta = STATUS_META[ev.kind];
        this.log(
          meta.bad
            ? `${this.nameOf(ev.targetId)} 陷入了【${meta.name}】（${ev.rounds}回合）`
            : `${this.nameOf(ev.targetId)} 获得【${meta.name}】（${ev.rounds}回合）`,
          meta.bad ? 'warn' : 'good',
        );
        break;
      }
      case 'statusResist':
        this.log(`${this.nameOf(ev.targetId)} 抵抗了【${STATUS_META[ev.kind].name}】`, 'warn');
        break;
      case 'statusEnd':
        if (ev.reason === 'woken') this.log(`${this.nameOf(ev.targetId)} 被打醒了`, 'sys');
        else if (ev.kind !== 'defend') this.log(`${this.nameOf(ev.targetId)} 的【${STATUS_META[ev.kind].name}】效果结束了`, 'sys');
        break;
      case 'poisonTick':
        this.log(`${this.nameOf(ev.targetId)} 毒发，损失 ${ev.amount} 点气血`, 'dmg');
        break;
      case 'catchSuccess': {
        const u = this.uiUnits.get(ev.targetId);
        if (u) {
          u.alive = false;
          u.statuses = [];
        }
        this.log(`🎉 成功收服 ${this.nameOf(ev.targetId)}！`, 'good');
        break;
      }
      case 'catchFail':
        this.log(`${this.nameOf(ev.targetId)} 挣脱了收服（成功率 ${Math.round(ev.chance * 100)}%）`, 'warn');
        break;
      case 'death':
        this.log(`☠ ${this.nameOf(ev.targetId)} 倒下了`, 'death');
        break;
      case 'itemUsed':
        this.log(`${this.nameOf(ev.actorId)} 使用了【${ITEMS[ev.itemId].name}】（剩 ${ev.remain}）`, 'good');
        break;
      case 'battleEnd':
        this.log(ev.winner === 'ally' ? '🎉 敌人全灭，战斗胜利！' : '💀 我方全军覆没……', 'end');
        break;
    }
  }

  // ===== 结算界面 =====

  private showEndOverlay(): void {
    const won = this.battle.winner === 'ally';
    const sub = h('div', { class: 'end-sub' },
      `${won ? '🎉' : '💀'} ${this.battle.encounterName} · 共 ${this.battle.round} 回合`,
      h('br'),
            `阵容：${classById(this.opts.classId).name} + ${this.opts.petUnit?.name ?? (this.opts.petId ? petById(this.opts.petId).name : '宠物')} · 种子 ${this.battle.seed}`,
    );
    const buttons = h('div', { class: 'end-btns' });

    if (this.hooks) {
      // 世界模式：展示奖励摘要，返回冒险
      for (const line of this.rewardLines) {
        sub.append(h('div', { class: 'reward-line' }, line));
      }
      buttons.append(
        h('button', {
          class: 'btn primary big',
          onclick: () => {
            this.destroy();
            this.onExit();
          },
        }, '返 回'),
      );
    } else {
      sub.append(
        h('br'),
        `独立战斗模式 · 可用「#sim」批量仿真`,
      );
      buttons.append(
        h('button', {
          class: 'btn primary big',
          onclick: () => {
            this.destroy();
            void BattleScreen.create(this.root, { ...this.opts, seed: Math.floor(Math.random() * 1e9) }, this.onExit);
          },
        }, '再战一场'),
        h('button', {
          class: 'btn big',
          onclick: () => {
            this.destroy();
            this.onExit();
          },
        }, '更换阵容'),
      );
    }

    this.root.append(
      h('div', { class: 'end-overlay' },
        h('div', { class: 'end-panel' },
          h('div', { class: 'end-title' }, won ? '战 斗 胜 利' : '战 败'),
          sub,
          buttons,
        ),
      ),
    );
  }
}
