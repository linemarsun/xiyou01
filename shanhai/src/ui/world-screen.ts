/**
 * 世界界面：HUD（银两/背包/任务追踪）、对话框、大地图探索，
 * 与战斗界面互相衔接（遇敌 → 战斗 → 结算奖励 → 回地图）。
 */
import { BattleScreen, type BattleHooks } from './battle-screen';
import { MONSTERS, SKILLS } from '../core/content';
import type { BattleOptions } from '../core/battle';
import type { GameState, MapExit } from '../core/world';
import {
  ALLOC_INFO,
  BAG_CAP,
  COMPANION_CAP,
  COMPANION_TEMPLATES,
  FUSE_COST,
  HIRE_COST,
  QUESTS,
  REFINE_COST,
  WORLD_MAPS,
  companionSpec,
  dismissCompanion,
  fusePets,
  hireCompanion,
  activePet,
  activeQuest,
  acceptQuest,
  claimQuest,
  dialogueFor,
  expNeeded,
  isEquippedAnywhere,
  learnSkill,
  petBase,
  petEquipBonus,
  petExpNeeded,
  petUnitSpec,
  questReady,
  registerBattleInventory,
  saveGame,
  settleBattle,
  skillLevel,
  totalBonus,
  useRespecPill,
} from '../core/world';
import {
  PET_EQUIP_SLOTS, describeItem, rerollAffixes, hasRareAffix,
  SLOT_NAMES, STAT_NAMES, type EquipSlot, type EquipmentItem,
} from '../core/equipment';
import { SKILL_MAX_LEVEL, describeSkillAt, effectiveSkill, skillUpgradeCost } from '../core/skill';
import { classById } from '../core/content';
import type { AllocStats } from '../core/world';

/** 四维已加点数的加成文案 */
const ALLOC_BONUS_TEXT: Record<keyof AllocStats, (n: number) => string> = {
  str: (n) => `攻+${n * 2}`,
  vit: (n) => `气血+${n * 12} 防+${n}`,
  int: (n) => `法+${n * 2} 法力+${n * 8}`,
  agi: (n) => `速+${n * 2}`,
};
import { nextAutoAction } from '../core/autoplay';
import { ICON_ART, artUrl } from '../core/art';
import { WorldRenderer } from '../render/world-renderer';
import { audio } from '../audio/audio';
import { h } from './dom';

/** 挂机总开关：模块级状态，切图 / 战斗返回重建 WorldScreen 时保持；刷新页面后重置为关 */
let autoPlayEnabled = false;

export class WorldScreen {
  private root: HTMLElement;
  private gs: GameState;
  private hooks: { onExitToSetup: () => void };
  private renderer: WorldRenderer | null = null;
  private map = WORLD_MAPS.taoyuan;

  private mapNameEl!: HTMLElement;
  private silverEl!: HTMLElement;
  private invEl!: HTMLElement;
  private petEl!: HTMLElement;
  private levelEl!: HTMLElement;
  private questEl!: HTMLElement;
  private dialogueEl!: HTMLElement;
  private petPanelEl!: HTMLElement;
  private bagPanelEl!: HTMLElement;
  private allocPanelEl!: HTMLElement;
  private skillPanelEl!: HTMLElement;
  private tavernPanelEl!: HTMLElement;

  private constructor(root: HTMLElement, gs: GameState, hooks: { onExitToSetup: () => void }) {
    this.root = root;
    this.gs = gs;
    this.hooks = hooks;
    this.map = WORLD_MAPS[gs.mapId] ?? WORLD_MAPS.taoyuan;
  }

  static async create(root: HTMLElement, gs: GameState, hooks: { onExitToSetup: () => void }): Promise<WorldScreen> {
    const screen = new WorldScreen(root, gs, hooks);
    audio.setScene('world');
    screen.buildSkeleton();
    screen.renderer = await WorldRenderer.create(screen.sceneHost, screen.map, gs, {
      onEncounter: (group, groupKey) => screen.onEncounter(group, groupKey),
      onNpc: () => screen.openDialogue(),
      onTavern: () => screen.openTavern(),
      onExit: (exit) => screen.travel(exit),
    });
    screen.refreshHud();
    // 切图 / 战斗返回都会重建 WorldScreen，调试句柄必须跟着换新实例
    if (import.meta.env.DEV) {
      screen.bindDebug();
      // 开发态截图辅助：?at=x,y 直接把角色落到指定世界坐标
      const params = new URLSearchParams(location.search);
      const at = params.get('at');
      if (at) {
        const [x, y] = at.split(',').map(Number);
        if (Number.isFinite(x) && Number.isFinite(y)) screen.debugTeleport(x, y);
      }
      // ?view=overview 缩小视口俯瞰整块街区；?view=scale,x,y 指定缩放与聚焦点（转角近景）
      const view = params.get('view');
      if (view === 'overview') screen.renderer?.debugView(0.17, 4096, 2048);
      else if (view) {
        const [s, x, y] = view.split(',').map(Number);
        if (Number.isFinite(s)) screen.renderer?.debugView(s, Number.isFinite(x) ? x : undefined, Number.isFinite(y) ? y : undefined);
      }
      // ?shot=1 纯画布截图模式；?walkfps=N 自动沿主街走动 N 秒并采样帧率
      if (params.get('shot') === '1') screen.enterShotMode();
      if (params.get('stats') === '1') {
        window.setTimeout(() => {
          const info = screen.renderer?.debugInfo();
          if (info) console.log('[iso-stats]', JSON.stringify(info));
        }, 1200);
      }
      const walkfps = Number(params.get('walkfps'));
      if (Number.isFinite(walkfps) && walkfps > 0) {
        void screen.renderer?.debugWalkFps(walkfps * 1000).then((r) => {
          (window as unknown as Record<string, unknown>).__fpsReport = r;
          console.log('[walk-fps]', JSON.stringify(r));
        });
      }
    }
    if (autoPlayEnabled) screen.scheduleAutoStep(650);
    return screen;
  }

  /** 开发模式：暴露当前世界实例的调试句柄（供浏览器自动化 / 手动排查） */
  private bindDebug(): void {
    (window as unknown as Record<string, unknown>).__shanhai = {
      state: () => this.getState(),
      playerPos: () => this.playerPos(),
      info: () => this.debugInfo(),
      moveTo: (x: number, y: number) => this.debugMoveTo(x, y),
      teleport: (x: number, y: number) => this.debugTeleport(x, y),
      view: (scale: number, x?: number, y?: number) => this.renderer?.debugView(scale, x, y),
      fpsWalk: (ms: number) => this.renderer?.debugWalkFps(ms),
    };
  }

  /** DEV 截图模式：隐藏 HUD/对话，画布铺满视口（外框品红色，裁剪脚本据此定位画布矩形） */
  private enterShotMode(): void {
    document.body.classList.add('shot-mode');
    document.body.style.overflow = 'hidden';
  }

  private sceneHost!: HTMLElement;

  private allocBtn!: HTMLButtonElement;
  private autoBtn!: HTMLButtonElement;
  private autoTimer: number | null = null;

  private buildSkeleton(): void {
    this.root.innerHTML = '';
    this.mapNameEl = h('b', {}, this.map.name);
    this.silverEl = h('span', {}, '');
    this.invEl = h('span', {}, '');
    this.petEl = h('span', {}, '');
    this.levelEl = h('span', {}, '');
    this.questEl = h('span', { class: 'quest-chip' }, '');
    this.dialogueEl = h('div', { class: 'dialogue quest-panel', style: 'display:none' });
    this.petPanelEl = h('div', { class: 'dialogue', style: 'display:none' });
    this.bagPanelEl = h('div', { class: 'dialogue', style: 'display:none' });
    this.allocPanelEl = h('div', { class: 'dialogue', style: 'display:none' });
    this.skillPanelEl = h('div', { class: 'dialogue', style: 'display:none' });
    this.tavernPanelEl = h('div', { class: 'dialogue', style: 'display:none' });
    this.sceneHost = h('div', { class: 'scene-host' });
    this.allocBtn = h('button', {
      class: 'btn small',
      onclick: () => this.toggleAllocPanel(),
    }, '✨ 淬灵');

    this.autoBtn = h('button', {
      class: 'btn small',
      onclick: () => this.toggleAutoPlay(),
    }, autoPlayEnabled ? '🤖 挂机 开' : '🤖 挂机 关');
    this.autoBtn.classList.toggle('auto-on', autoPlayEnabled);

    const soundBtn = h('button', {
      class: 'btn small',
      onclick: () => {
        const m = audio.toggleMute();
        soundBtn.textContent = m ? '🔇 音效' : '🔊 音效';
        audio.play('click');
      },
    }, audio.isMuted() ? '🔇 音效' : '🔊 音效');

    this.root.append(
      h('div', { class: 'hud' },
        h('div', { class: 'btitle', style: 'font-size:17px' }, '⚔ ', this.mapNameEl),
        h('span', { class: 'spacer' }),
        this.levelEl,
        this.silverEl,
        this.invEl,
        this.petEl,
        h('span', { class: 'spacer' }),
        this.questEl,
        h('button', { class: 'btn small', onclick: () => this.openQuestBoard() }, '📜 悬赏'),
        this.autoBtn,
        this.allocBtn,
        h('button', { class: 'btn small', onclick: () => this.toggleSkillPanel() }, '📜 道法'),
        h('button', { class: 'btn small', onclick: () => this.togglePetPanel() }, '🐾 灵兽'),
        h('button', { class: 'btn small', onclick: () => this.toggleBagPanel() }, '🎒 乾坤囊'),
        soundBtn,
        h('button', { class: 'btn small', onclick: () => this.backToSetup() }, '💾 卷宗'),
      ),
      this.sceneHost,
      this.petPanelEl,
      this.bagPanelEl,
      this.allocPanelEl,
      this.skillPanelEl,
      this.tavernPanelEl,
      this.dialogueEl,
    );
  }

  // ===== 挂机（自动寻路 + 自动战斗 + 跨图巡游） =====

  private toggleAutoPlay(): void {
    autoPlayEnabled = !autoPlayEnabled;
    this.refreshAutoBtn();
    audio.play('click');
    if (autoPlayEnabled) {
      this.toast('挂机开启：自动寻路 → 自动战斗 → 自动交任务');
      this.scheduleAutoStep();
    } else {
      this.clearAutoStep();
      this.toast('挂机已停止');
    }
  }

  private refreshAutoBtn(): void {
    if (!this.autoBtn) return;
    this.autoBtn.textContent = autoPlayEnabled ? '🤖 挂机 开' : '🤖 挂机 关';
    this.autoBtn.classList.toggle('auto-on', autoPlayEnabled);
  }

  private clearAutoStep(): void {
    if (this.autoTimer !== null) {
      window.clearTimeout(this.autoTimer);
      this.autoTimer = null;
    }
  }

  private stopAuto(reason: string): void {
    autoPlayEnabled = false;
    this.refreshAutoBtn();
    this.clearAutoStep();
    this.toast(`挂机结束：${reason}`);
  }

  private scheduleAutoStep(delay = 420): void {
    this.clearAutoStep();
    this.autoTimer = window.setTimeout(() => {
      this.autoTimer = null;
      if (autoPlayEnabled) this.runAutoStep();
    }, delay);
  }

  /** 自动执行当前长老对话里的动作（接任务 / 领赏）；无可执行动作时什么都不做，幂等 */
  private performAutoQuest(): void {
    const d = dialogueFor(this.gs);
    const act = d.actions.find((a) => a.kind !== 'close');
    if (act?.kind === 'accept') {
      acceptQuest(this.gs);
      this.toast('挂机：自动接取任务');
    } else if (act?.kind === 'claim') {
      const r = claimQuest(this.gs);
      this.toast(`挂机：自动交付任务，赏银 ${r.silver}`);
    }
    this.refreshHud();
  }

  private runAutoStep(): void {
    if (!autoPlayEnabled || !this.renderer) return;
    const pos = this.renderer.getPlayerPos();
    const action = nextAutoAction(this.gs, pos);
    if (action.kind === 'stop') { this.stopAuto(action.reason); return; }
    // 已到长老附近就直接交付，不依赖渲染器的靠近触发（避免站在原地空等）
    if (action.kind === 'quest' && Math.hypot(pos.x - action.target.x, pos.y - action.target.y) < 130) {
      this.performAutoQuest();
      this.scheduleAutoStep(420);
      return;
    }
    // 怪物会游荡，追它们的当前位置而不是出生点
    const target = action.kind === 'fight'
      ? (this.renderer.monsterPosFor(action.spawnIndex) ?? action.target)
      : action.target;
    this.renderer.moveTo(target.x, target.y);
    // 周期性重新决策：追游荡的怪、到达后继续下一组 / 切图
    this.scheduleAutoStep(1600);
  }

  // ===== 酒馆（组队同伴） =====

  private openTavern(): void {
    if (autoPlayEnabled) return;
    this.closePanels();
    this.renderTavernPanel();
  }

  private renderTavernPanel(): void {
    this.tavernPanelEl.innerHTML = '';
    this.tavernPanelEl.style.display = '';
    const rows = h('div', { class: 'bag-list' });

    rows.append(h('div', { class: 'bag-row' },
      h('span', { class: 'bag-slot' }, '当前队伍'),
      h('span', { class: 'bag-item', style: 'color:#a3937a' },
        `${this.gs.playerName} ＋ 出战召唤兽 ＋ ${this.gs.companions.length}/${COMPANION_CAP} 名同伴`),
    ));
    for (const c of this.gs.companions) {
      const t = COMPANION_TEMPLATES.find((x) => x.id === c.templateId);
      const spec = companionSpec(c);
      rows.append(h('div', { class: 'bag-row' },
        h('span', { class: 'bag-slot' }, `Lv.${c.level}`),
        h('span', { class: 'bag-item' },
          `${spec.emoji} ${spec.name} ｜ 攻${spec.stats.atk} 气血${spec.stats.hp} ｜ ${t?.desc ?? ''}`),
        h('button', {
          class: 'btn small',
          onclick: () => {
            const r = dismissCompanion(this.gs, c.uid);
            this.toast(r.ok ? `${spec.name} 离队了` : (r.reason ?? '无法解雇'));
            this.refreshHud();
            this.renderTavernPanel();
          },
        }, '解雇'),
      ));
    }
    rows.append(h('div', { class: 'bag-sep' }));
    for (const t of COMPANION_TEMPLATES) {
      rows.append(h('div', { class: 'bag-row' },
        h('span', { class: 'bag-slot' }, `${HIRE_COST} 银`),
        h('span', { class: 'bag-item' }, `${classById(t.classId).emoji} ${t.name} ｜ ${t.desc}`),
        h('button', {
          class: 'btn small',
          disabled: this.gs.companions.length >= COMPANION_CAP || this.gs.silver < t.price,
          onclick: () => {
            const r = hireCompanion(this.gs, t.id);
            this.toast(r.ok ? `${t.name} 加入队伍！` : (r.reason ?? '无法雇佣'));
            this.refreshHud();
            this.renderTavernPanel();
          },
        }, '雇佣'),
      ));
    }

    this.tavernPanelEl.append(
      h('div', { class: 'dname' }, `【云京酒肆】雇佣同道（最多 ${COMPANION_CAP} 名）· 同道不食经验，境界始终跟随少侠`),
      rows,
      h('div', { style: 'text-align:right;margin-top:8px' },
        h('button', { class: 'btn small', onclick: () => { this.tavernPanelEl.style.display = 'none'; } }, '关闭'),
      ),
    );
  }

  // ===== 宠物栏 =====

  private togglePetPanel(): void {
    if (this.petPanelEl.style.display !== 'none') {
      this.petPanelEl.style.display = 'none';
      return;
    }
    this.closePanels();
    this.renderPetPanel();
  }

  private renderPetPanel(): void {
    this.petPanelEl.innerHTML = '';
    this.petPanelEl.style.display = '';
    const rows = h('div', { class: 'bag-list' });
    for (const inst of this.gs.petInstances) {
      const spec = petUnitSpec(inst);
      const expText = `经验 ${inst.exp}/${petExpNeeded(inst.level)}`;
      const skillText = spec.skillIds.map((id) => SKILLS[id]?.name ?? id).join('·');
      const growthText = inst.growth ? ` ×${inst.growth.toFixed(2)}` : '';
      rows.append(h('div', { class: 'bag-row' },
        h('span', { class: 'bag-slot' }, `Lv.${inst.level}`),
        h('span', { class: 'bag-item' },
          h('span', {}, `${spec.emoji} ${spec.name}${growthText}`),
          h('span', { style: 'color:#a3937a;font-size:12px;margin-left:8px' },
            `攻${spec.stats.atk} 气血${spec.stats.hp} · ${expText} · ${skillText}`),
        ),
        h('button', {
          class: this.gs.activePetUid === inst.uid ? 'btn primary small' : 'btn small',
          onclick: () => {
            this.gs.activePetUid = inst.uid;
            saveGame(this.gs);
            this.refreshHud();
            this.renderPetPanel();
            this.toast(`出战召唤兽：${spec.name} Lv.${inst.level}`);
          },
        }, this.gs.activePetUid === inst.uid ? '出战中' : '出战'),
      ));
    }

    // 炼妖：两只非出战召唤兽 → 一只新个体
    const candidates = this.gs.petInstances.filter((p) => p.uid !== this.gs.activePetUid);
    const mkSelect = (): HTMLSelectElement => {
      const sel = h('select', { class: 'name-input' }) as HTMLSelectElement;
      for (const p of candidates) {
        sel.append(h('option', { value: p.uid }, `${petBase(p.defId).name} Lv.${p.level}`));
      }
      return sel;
    };
    const selA = mkSelect();
    const selB = mkSelect();
    if (selB.options.length > 1) selB.selectedIndex = 1;
    const fuseBlock = h('div', { class: 'bag-list' },
      h('div', { class: 'bag-row' },
        h('span', { class: 'bag-slot' }, '⚗ 合灵'),
        h('span', { class: 'bag-item', style: 'color:#a3937a;font-size:12px' },
          `两只非出战召唤兽合成一只 · 花费 ${FUSE_COST} 银 · 物种二选一 / 等级取高 / 技能继承 / 随机成长`),
      ),
      candidates.length >= 2
        ? h('div', { class: 'bag-row' }, selA, h('span', { class: 'bag-slot' }, '＋'), selB,
            h('button', {
              class: 'btn small',
              onclick: () => {
                const r = fusePets(this.gs, selA.value, selB.value);
                if (!r.ok) { this.toast(r.reason ?? '炼妖失败'); return; }
                this.toast(r.lines.join(' ｜ '));
                this.refreshHud();
                this.renderPetPanel();
              },
            }, '开始炼妖'))
        : h('div', { class: 'bag-row' },
            h('span', { class: 'bag-item', style: 'color:#a3937a' }, '至少需要 2 只非出战召唤兽（去野外捕捉吧）')),
    );

    this.petPanelEl.append(
      h('div', { class: 'dname' }, '【灵兽】出战灵兽历战可得经验升级'),
      rows,
      fuseBlock,
      h('div', { style: 'text-align:right;margin-top:8px' },
        h('button', { class: 'btn small', onclick: () => this.togglePetPanel() }, '关闭'),
      ),
    );
  }

  private petSpec(): ReturnType<typeof petUnitSpec> | null {
    const inst = activePet(this.gs);
    return inst ? petUnitSpec(inst) : null;
  }

  // ===== 加点（潜能） =====

  private toggleAllocPanel(): void {
    if (this.allocPanelEl.style.display !== 'none') {
      this.allocPanelEl.style.display = 'none';
      return;
    }
    this.closePanels();
    this.renderAllocPanel();
  }

  private renderAllocPanel(): void {
    this.allocPanelEl.innerHTML = '';
    this.allocPanelEl.style.display = '';
    const bonus = totalBonus(this.gs);
    const rows = h('div', { class: 'bag-list' });
    for (const info of ALLOC_INFO) {
      const allocated = this.gs.stats[info.key as keyof AllocStats];
      rows.append(h('div', { class: 'bag-row' },
        h('span', { class: 'bag-slot' }, info.name),
        h('span', { class: 'bag-item' },
          `已加 ${allocated} 点 ｜ ${info.desc} ｜ 当前加成 ${ALLOC_BONUS_TEXT[info.key](allocated)}`),
        h('button', {
          class: 'btn small',
          disabled: this.gs.potential <= 0,
          onclick: () => this.allocate(info.key, 1),
        }, '+'),
        h('button', {
          class: 'btn small',
          disabled: allocated <= 0,
          onclick: () => this.allocate(info.key, -1),
        }, '−'),
      ));
    }
    this.allocPanelEl.append(
      h('div', { class: 'dname' }, '【灵根淬炼】剩余潜能点：' + this.gs.potential),
      rows,
      h('div', { class: 'bag-row', style: 'margin-top:6px' },
        h('span', { class: 'bag-item', style: 'color:#a3937a' },
          `当前总加成：攻+${bonus.atk} 防+${bonus.def} 法+${bonus.mag} 速+${bonus.spd} 气血+${bonus.hp} 法力+${bonus.mp}（含装备，下一场战斗生效）`),
      ),
      h('div', { class: 'bag-row' },
        h('span', { class: 'bag-slot' }, '洗点丹'),
        h('span', { class: 'bag-item' }, `持有 ×${this.gs.inv.respec ?? 0} ｜ 使用后清空四维加点、全额退还潜能点`),
        h('button', {
          class: 'btn small',
          disabled: (this.gs.inv.respec ?? 0) <= 0
            || (this.gs.stats.str + this.gs.stats.vit + this.gs.stats.int + this.gs.stats.agi) <= 0,
          onclick: () => this.doRespec(),
        }, '使用'),
      ),
      h('div', { style: 'text-align:right;margin-top:8px' },
        h('button', { class: 'btn small', onclick: () => this.toggleAllocPanel() }, '关闭'),
      ),
    );
  }

  private doRespec(): void {
    const r = useRespecPill(this.gs);
    this.toast(r.ok ? '洗点成功：潜能点已全额退还' : (r.reason ?? '无法使用洗点丹'));
    this.refreshHud();
    this.renderAllocPanel();
  }

  private allocate(key: keyof AllocStats, delta: number): void {
    if (delta > 0) {
      if (this.gs.potential <= 0) return;
      this.gs.potential--;
      this.gs.stats[key]++;
    } else {
      if (this.gs.stats[key] <= 0) return;
      this.gs.stats[key]--;
      this.gs.potential++;
    }
    saveGame(this.gs);
    this.refreshHud();
    this.renderAllocPanel();
  }

  // ===== 师门修炼 =====

  private toggleSkillPanel(): void {
    if (this.skillPanelEl.style.display !== 'none') {
      this.skillPanelEl.style.display = 'none';
      return;
    }
    this.closePanels();
    this.renderSkillPanel();
  }

  private renderSkillPanel(): void {
    this.skillPanelEl.innerHTML = '';
    this.skillPanelEl.style.display = '';
    const cls = classById(this.gs.classId);
    const rows = h('div', { class: 'bag-list' });
    for (const skillId of cls.skillIds) {
      const base = SKILLS[skillId];
      const lvl = skillLevel(this.gs, skillId);
      const e = effectiveSkill(base, lvl);
      const maxed = lvl >= SKILL_MAX_LEVEL;
      const cost = skillUpgradeCost(lvl);
      rows.append(h('div', { class: 'bag-row' },
        h('span', { class: 'bag-slot' }, `Lv.${lvl}`),
        h('span', { class: 'bag-item' },
          h('span', {}, `【${base.name}】`),
          h('span', { style: 'color:#a3937a;font-size:12px' }, describeSkillAt(base, lvl) + `（耗蓝 ${e.mpCost}）`),
        ),
        maxed
          ? h('span', { class: 'bag-item', style: 'color:#b8892f' }, '已满级')
          : h('button', {
              class: 'btn small',
              title: `修炼到 Lv.${lvl + 1}：银两 ${cost.silver} + 潜能 ${cost.potential}`,
              onclick: () => {
                const r = learnSkill(this.gs, skillId);
                if (!r.ok) this.toast(r.reason ?? '无法修炼');
                else this.toast(`【${base.name}】修炼至 Lv.${lvl + 1}！`);
                this.refreshHud();
                this.renderSkillPanel();
              },
            }, `修炼 ${cost.silver}银+${cost.potential}潜`),
      ));
    }
    this.skillPanelEl.append(
      h('div', { class: 'dname' }, `【${cls.sect} · 道法】用银两与潜能点提升法术威力（最高 Lv.${SKILL_MAX_LEVEL}）`),
      rows,
      h('div', { style: 'text-align:right;margin-top:8px' },
        h('button', { class: 'btn small', onclick: () => this.toggleSkillPanel() }, '关闭'),
      ),
    );
  }

  // ===== 背包与装备 =====

  private toggleBagPanel(): void {
    if (this.bagPanelEl.style.display !== 'none') {
      this.bagPanelEl.style.display = 'none';
      return;
    }
    this.closePanels();
    this.renderBagPanel();
  }

  private closePanels(): void {
    this.petPanelEl.style.display = 'none';
    this.bagPanelEl.style.display = 'none';
    this.allocPanelEl.style.display = 'none';
    this.skillPanelEl.style.display = 'none';
    this.tavernPanelEl.style.display = 'none';
    this.dialogueEl.style.display = 'none';
  }

  private equippedIn(slot: EquipSlot): EquipmentItem | undefined {
    const uid = this.gs.equipped[slot];
    return uid ? this.gs.bag.find((i) => i.uid === uid) : undefined;
  }

  private renderBagPanel(): void {
    this.bagPanelEl.innerHTML = '';
    this.bagPanelEl.style.display = '';
    const b = totalBonus(this.gs);
    const bonusText = (Object.keys(b) as Array<keyof typeof b>)
      .filter((k) => b[k] !== 0)
      .map((k) => `${k === 'mp' ? '法力' : k === 'hp' ? '气血' : STAT_NAMES[k]}+${b[k]}`)
      .join(' ');
    const rows = h('div', { class: 'bag-list' });

    // 已穿三部位
    for (const slot of ['weapon', 'armor', 'accessory'] as EquipSlot[]) {
      const it = this.equippedIn(slot);
      rows.append(h('div', { class: 'bag-row' },
        h('span', { class: 'bag-slot' }, SLOT_NAMES[slot]),
        h('span', { class: 'bag-item' }, it ? describeItem(it) : '—— 未穿戴 ——'),
        it
          ? h('button', { class: 'btn small', onclick: () => this.unequip(slot) }, '卸下')
          : '',
      ));
    }
    // 出战召唤兽的两个装备位（与人物共用装备池）
    const pet = activePet(this.gs);
    if (pet) {
      rows.append(h('div', { class: 'bag-sep' }));
      for (const slot of PET_EQUIP_SLOTS) {
        const uid = pet.equipped?.[slot];
        const pit = uid ? this.gs.bag.find((i) => i.uid === uid) : undefined;
        rows.append(h('div', { class: 'bag-row' },
          h('span', { class: 'bag-slot' }, `🐾 ${SLOT_NAMES[slot]}`),
          h('span', { class: 'bag-item' }, pit ? describeItem(pit) : '—— 未穿戴 ——'),
          pit
            ? h('button', { class: 'btn small', onclick: () => this.unequipPet(slot) }, '卸下')
            : '',
        ));
      }
    }
    rows.append(h('div', { class: 'bag-sep' }));

    // 背包内未被任何人穿戴的装备
    const free = this.gs.bag.filter((i) => !isEquippedAnywhere(this.gs, i.uid));
    if (free.length === 0) {
      rows.append(h('div', { class: 'bag-row' }, h('span', { class: 'bag-item', style: 'color:#a3937a' }, '背包里暂无装备——去野外打怪掉落吧')));
    }
    for (const it of free) {
      rows.append(h('div', { class: 'bag-row' },
        h('span', { class: 'bag-item', style: hasRareAffix(it) ? 'color:#b8892f' : '' }, describeItem(it)),
        h('button', { class: 'btn small', onclick: () => this.equip(it) }, '装备'),
        PET_EQUIP_SLOTS.includes(it.slot)
          ? h('button', {
              class: 'btn small',
              title: '装备到出战召唤兽（同一件装备不能同时给人物和召唤兽穿戴）',
              onclick: () => this.equipPet(it),
            }, '给宠物')
          : '',
        h('button', {
          class: 'btn small',
          title: `重掷词条（花费 ${REFINE_COST} 银两）；极品有概率掷出 ★稀有词条`,
          onclick: () => this.refine(it),
        }, `炼化 ${REFINE_COST}银`),
      ));
    }

    this.bagPanelEl.append(
      h('div', { class: 'dname' }, '【乾坤囊 · 法器】加成在下一场战斗生效'),
      h('div', { class: 'bag-row' },
        h('span', { class: 'bag-slot' }, '加成'),
        h('span', { class: 'bag-item' }, bonusText || '—— 无 ——'),
        h('span', { class: 'bag-item', style: 'color:#a3937a' }, `背包 ${this.gs.bag.length}/${BAG_CAP}`),
      ),
      rows,
      h('div', { style: 'text-align:right;margin-top:8px' },
        h('button', { class: 'btn small', onclick: () => this.toggleBagPanel() }, '关闭'),
      ),
    );
  }

  private equip(it: EquipmentItem): void {
    if (isEquippedAnywhere(this.gs, it.uid)) {
      this.toast('这件装备已被召唤兽穿戴，请先卸下');
      return;
    }
    this.gs.equipped[it.slot] = it.uid;
    saveGame(this.gs);
    this.renderBagPanel();
    this.toast(`已装备 ${it.name}（下一场战斗生效）`);
  }

  private equipPet(it: EquipmentItem): void {
    const pet = activePet(this.gs);
    if (!pet) { this.toast('没有出战召唤兽'); return; }
    if (!PET_EQUIP_SLOTS.includes(it.slot)) { this.toast('召唤兽只能穿戴护甲与饰品'); return; }
    if (isEquippedAnywhere(this.gs, it.uid)) { this.toast('这件装备已被穿戴，请先卸下'); return; }
    pet.equipped = { ...(pet.equipped ?? {}), [it.slot]: it.uid };
    saveGame(this.gs);
    this.renderBagPanel();
    this.toast(`已给 ${petBase(pet.defId).name} 装备 ${it.name}（下一场战斗生效）`);
  }

  private unequipPet(slot: EquipSlot): void {
    const pet = activePet(this.gs);
    if (!pet?.equipped) return;
    delete pet.equipped[slot];
    saveGame(this.gs);
    this.renderBagPanel();
  }

  private unequip(slot: EquipSlot): void {
    delete this.gs.equipped[slot];
    saveGame(this.gs);
    this.renderBagPanel();
  }

  private refine(it: EquipmentItem): void {
    if (this.gs.silver < REFINE_COST) {
      this.toast(`银两不足（需要 ${REFINE_COST}）`);
      return;
    }
    this.gs.silver -= REFINE_COST;
    const desc = rerollAffixes(it);
    saveGame(this.gs);
    this.renderBagPanel();
    this.refreshHud();
    this.toast(`炼化完成：${desc}`);
  }

  // ===== HUD =====

  private refreshHud(): void {
    this.mapNameEl.textContent = this.map.name;
    this.levelEl.textContent = `⭐ Lv.${this.gs.level}（${this.gs.exp}/${expNeeded(this.gs.level)}）`;
    this.silverEl.textContent = `💰 银两 ${this.gs.silver}`;
    this.invEl.textContent = `🧪 金疮药 ×${this.gs.inv.heal} ｜ 凝气丹 ×${this.gs.inv.mana} ｜ 洗点丹 ×${this.gs.inv.respec ?? 0}`;
    const pet = activePet(this.gs);
    const petName = pet ? petBase(pet.defId).name : '？';
    this.petEl.textContent = `${pet ? `🐾 出战：${petName} Lv.${pet.level}（${this.gs.petInstances.length}只）` : '🐾 无宠物'} ｜ 👥 同伴 ${this.gs.companions.length}/${COMPANION_CAP}`;
    this.allocBtn.textContent = this.gs.potential > 0 ? `✨ 淬灵(${this.gs.potential})` : '✨ 淬灵';
    this.allocBtn.classList.toggle('auto-on', this.gs.potential > 0);
    const q = activeQuest(this.gs);
    if (!q) {
      this.questEl.textContent = this.gs.questStep === 0 ? '📜 任务：往云京寻玄鹤长老' : '📜 任务：全部完成 🎉';
    } else if (questReady(this.gs)) {
      this.questEl.textContent = `📜 ${q.name}：可交付！`;
    } else {
      this.questEl.textContent = `📜 ${q.name}：${q.targets.label} ${this.gs.questKills}/${q.targets.need}`;
    }
  }

  private toast(text: string): void {
    const t = h('div', { class: 'toast' }, text);
    document.body.append(t);
    setTimeout(() => t.remove(), 2600);
  }

  private backToSetup(): void {
    const pos = this.renderer?.getPlayerPos();
    if (pos) {
      this.gs.px = pos.x;
      this.gs.py = pos.y;
    }
    saveGame(this.gs);
    this.renderer?.destroy();
    this.hooks.onExitToSetup();
  }

  // ===== 对话 =====

  private openDialogue(): void {
    if (autoPlayEnabled) {
      this.performAutoQuest();
      this.scheduleAutoStep();
      return;
    }
    this.closePanels();
    if (this.map.id === 'difu') {
      this.renderMengpo();
      return;
    }
    this.renderQuestBoard(false);
  }

  /** 地府孟婆：战败重生后的对话（不参与悬赏链） */
  private renderMengpo(): void {
    this.dialogueEl.innerHTML = '';
    this.dialogueEl.style.display = '';
    this.dialogueEl.append(
      h('div', { class: 'quest-body' },
        h('div', { class: 'quest-title' }, '地府 · 忘川渡口'),
        h('div', { class: 'quest-text' }, '孟婆递来一碗温热的汤：「阳寿未尽，魂且归来。沿黄泉道往南，尽头的还阳牌可回云京；往北过奈何桥，便又到忘川了。」'),
      ),
      h('div', { class: 'cmd-row' },
        h('button', { class: 'btn small', onclick: () => this.closeDialogue() }, '谢过孟婆'),
      ),
    );
  }

  /** HUD「📜 悬赏」：只读查看榜单，接取/交付仍需在云京找玄鹤长老 */
  private openQuestBoard(): void {
    this.closePanels();
    this.renderQuestBoard(true);
  }

  private renderQuestBoard(readonlyBoard: boolean): void {
    const d = dialogueFor(this.gs);
    this.dialogueEl.innerHTML = '';
    this.dialogueEl.style.display = '';

    const detail = h('div', { class: 'quest-body' });
    detail.append(h('div', { class: 'quest-head' },
      h('img', { class: 'quest-seal', src: artUrl(ICON_ART.bambooScroll), alt: '' }),
      h('div', {},
        h('div', { class: 'quest-title' }, '云京司礼府 · 悬赏榜'),
        h('div', { class: 'quest-npc' }, `司礼：${d.name}`),
      ),
    ));

    const q = activeQuest(this.gs);
    if (q) {
      const pct = Math.min(100, Math.round((this.gs.questKills / q.targets.need) * 100));
      const reward = [
        q.rewardItems.heal ? `金疮药 ×${q.rewardItems.heal}` : '',
        q.rewardItems.mana ? `凝气丹 ×${q.rewardItems.mana}` : '',
        q.rewardItems.respec ? `洗点丹 ×${q.rewardItems.respec}` : '',
      ].filter(Boolean).join('　｜　');
      detail.append(h('div', { class: 'quest-card' },
        h('div', { class: 'quest-name' }, `「${q.name}」${questReady(this.gs) ? ' · 已达成' : ''}`),
        h('div', { class: 'quest-desc' }, q.desc),
        h('div', { class: 'quest-progress' }, `${q.targets.label}　${this.gs.questKills}/${q.targets.need}`),
        h('div', { class: 'quest-bar' }, h('div', { class: 'quest-bar-fill', style: `width:${pct}%` })),
        h('div', { class: 'quest-reward' }, `赏银 ${q.rewardSilver}　｜　${reward}`),
      ));
    }
    detail.append(h('div', { class: 'quest-text' }, d.text));

    const btns = h('div', { class: 'cmd-row' });
    if (readonlyBoard) {
      btns.append(h('button', { class: 'btn small', onclick: () => this.closeDialogue() }, '合上榜单'));
    } else {
      for (const a of d.actions) {
        btns.append(h('button', {
          class: a.kind === 'claim' ? 'btn primary' : 'btn',
          onclick: () => {
            if (a.kind === 'accept') {
              acceptQuest(this.gs);
              this.toast(`接受任务：${QUESTS[0].name}`);
            } else if (a.kind === 'claim') {
              const r = claimQuest(this.gs);
              this.toast(`领取赏银 ${r.silver}，任务链推进！`);
            }
            this.refreshHud();
            this.closeDialogue();
          },
        }, a.label));
      }
    }
    this.dialogueEl.append(detail, btns);
  }

  private closeDialogue(): void {
    this.dialogueEl.style.display = 'none';
  }

  // ===== 战斗衔接 =====

  private async onEncounter(group: string[], groupKey: string): Promise<void> {
    this.clearAutoStep();
    await this.fade(true);
    const pos = this.renderer!.getPlayerPos();
    this.gs.px = pos.x;
    this.gs.py = pos.y;
    registerBattleInventory(groupKey, this.gs.inv);
    this.renderer!.destroy();
    this.renderer = null;

    const opts: BattleOptions = {
      encounterId: 'custom',
      enemyIds: group,
      encounterName: group.map((id) => MONSTERS[id]?.name ?? id).join('、') + ' 袭击',
      classId: this.gs.classId,
      playerName: this.gs.playerName,
      seed: Math.floor(Math.random() * 1e9),
      sceneId: this.map.scene,
      startItems: { ...this.gs.inv },
      playerBonus: totalBonus(this.gs),
      petBonus: petEquipBonus(this.gs),
      skillLevels: { ...this.gs.skillLevels },
      petUnit: this.petSpec() ?? undefined,
      companions: this.gs.companions.map((c) => companionSpec(c)),
    };
    const bHooks: BattleHooks = {
      autoBattle: autoPlayEnabled,
      onAutoOff: () => { if (autoPlayEnabled) this.stopAuto('已切回手动指挥'); },
      finish: (info) => {
        const defeated = info.winner === 'enemy';
        if (defeated && autoPlayEnabled) this.stopAuto('战斗败北');
        const summary = settleBattle(
          this.gs,
          { winner: info.winner, enemyIds: group, itemsUsed: info.itemsUsed, caught: info.caught },
          groupKey,
        );
        if (defeated) {
          // 战败重生：dead 播完后淡出，魂魄传送到地府孟婆身旁（等距地图用格坐标换算的落点）
          const mengpo = WORLD_MAPS.difu.npc;
          this.gs.mapId = 'difu';
          this.gs.px = mengpo ? mengpo.x - 64 : 4096;
          this.gs.py = mengpo ? mengpo.y + 32 : 2064;
          saveGame(this.gs);
          summary.lines.push('你力竭倒下——魂魄被引至地府忘川，孟婆就在身旁。');
        }
        return { lines: summary.lines };
      },
    };
    await BattleScreen.create(
      this.root,
      opts,
      () => { void this.returnFromBattle(); },
      bHooks,
    );
    await this.fade(false);
  }

  /** 战斗结束回地图：战败时先淡出，再在孟婆旁重生 */
  private async returnFromBattle(): Promise<void> {
    const reviving = this.gs.mapId === 'difu';
    if (reviving) await this.fade(true);
    await WorldScreen.create(this.root, this.gs, this.hooks);
    if (reviving) {
      this.toast('魂归地府：在孟婆身旁苏醒，气血已复');
      await this.fade(false);
    }
  }

  // ===== 切图 =====

  private async travel(exit: MapExit): Promise<void> {
    this.clearAutoStep();
    await this.fade(true);
    this.gs.mapId = exit.to;
    this.gs.px = exit.toX;
    this.gs.py = exit.toY;
    this.gs.killedGroups = {};
    saveGame(this.gs);
    this.renderer?.destroy();
    this.renderer = null;
    await WorldScreen.create(this.root, this.gs, this.hooks);
    this.toast(`来到 ${WORLD_MAPS[exit.to].name}`);
    await this.fade(false);
  }

  private async fade(on: boolean): Promise<void> {
    let el = document.querySelector('.fade-layer') as HTMLElement | null;
    if (!el) {
      el = h('div', { class: 'fade-layer' });
      document.body.append(el);
    }
    el.classList.toggle('on', on);
    await new Promise((r) => setTimeout(r, 380));
  }

  // ===== 调试（DEV） =====
  getState(): GameState {
    return this.gs;
  }

  playerPos(): { x: number; y: number } | null {
    return this.renderer?.getPlayerPos() ?? null;
  }

  debugInfo(): unknown {
    return this.renderer?.debugInfo() ?? null;
  }

  debugMoveTo(x: number, y: number): void {
    this.renderer?.debugMoveTo(x, y);
  }

  debugTeleport(x: number, y: number): void {
    this.renderer?.debugTeleport(x, y);
  }
}
