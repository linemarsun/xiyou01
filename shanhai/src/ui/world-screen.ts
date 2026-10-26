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
  REFINE_COST,
  WORLD_MAPS,
  activePet,
  activeQuest,
  acceptQuest,
  claimQuest,
  dialogueFor,
  expNeeded,
  learnSkill,
  petBase,
  petExpNeeded,
  petUnitStats,
  questReady,
  registerBattleInventory,
  saveGame,
  settleBattle,
  skillLevel,
  totalBonus,
} from '../core/world';
import { describeItem, rerollAffixes, SLOT_NAMES, STAT_NAMES, type EquipSlot, type EquipmentItem } from '../core/equipment';
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
import { WorldRenderer } from '../render/world-renderer';
import { h } from './dom';

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

  private constructor(root: HTMLElement, gs: GameState, hooks: { onExitToSetup: () => void }) {
    this.root = root;
    this.gs = gs;
    this.hooks = hooks;
    this.map = WORLD_MAPS[gs.mapId] ?? WORLD_MAPS.taoyuan;
  }

  static async create(root: HTMLElement, gs: GameState, hooks: { onExitToSetup: () => void }): Promise<WorldScreen> {
    const screen = new WorldScreen(root, gs, hooks);
    screen.buildSkeleton();
    screen.renderer = await WorldRenderer.create(screen.sceneHost, screen.map, gs, {
      onEncounter: (group, groupKey) => screen.onEncounter(group, groupKey),
      onNpc: () => screen.openDialogue(),
      onExit: (exit) => screen.travel(exit),
    });
    screen.refreshHud();
    return screen;
  }

  private sceneHost!: HTMLElement;

  private allocBtn!: HTMLButtonElement;

  private buildSkeleton(): void {
    this.root.innerHTML = '';
    this.mapNameEl = h('b', {}, this.map.name);
    this.silverEl = h('span', {}, '');
    this.invEl = h('span', {}, '');
    this.petEl = h('span', {}, '');
    this.levelEl = h('span', {}, '');
    this.questEl = h('span', { class: 'quest-chip' }, '');
    this.dialogueEl = h('div', { class: 'dialogue', style: 'display:none' });
    this.petPanelEl = h('div', { class: 'dialogue', style: 'display:none' });
    this.bagPanelEl = h('div', { class: 'dialogue', style: 'display:none' });
    this.allocPanelEl = h('div', { class: 'dialogue', style: 'display:none' });
    this.skillPanelEl = h('div', { class: 'dialogue', style: 'display:none' });
    this.sceneHost = h('div', { class: 'scene-host' });
    this.allocBtn = h('button', {
      class: 'btn small',
      onclick: () => this.toggleAllocPanel(),
    }, '✨ 加点');

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
        this.allocBtn,
        h('button', { class: 'btn small', onclick: () => this.toggleSkillPanel() }, '📜 师门'),
        h('button', { class: 'btn small', onclick: () => this.togglePetPanel() }, '🐾 宠物'),
        h('button', { class: 'btn small', onclick: () => this.toggleBagPanel() }, '🎒 背包'),
        h('button', { class: 'btn small', onclick: () => this.backToSetup() }, '💾 菜单'),
      ),
      this.sceneHost,
      this.petPanelEl,
      this.bagPanelEl,
      this.allocPanelEl,
      this.skillPanelEl,
      this.dialogueEl,
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
      const base = petBase(inst.defId);
      const expText = `经验 ${inst.exp}/${petExpNeeded(inst.level)}`;
      rows.append(h('div', { class: 'bag-row' },
        h('span', { class: 'bag-slot' }, `Lv.${inst.level}`),
        h('span', { class: 'bag-item' },
          h('span', {}, `${base.emoji} ${base.name}`),
          h('span', { style: 'color:#a3937a;font-size:12px;margin-left:8px' },
            `攻${petUnitStats(inst).atk} 气血${petUnitStats(inst).hp} · ${expText}`),
        ),
        h('button', {
          class: this.gs.activePetUid === inst.uid ? 'btn primary small' : 'btn small',
          onclick: () => {
            this.gs.activePetUid = inst.uid;
            saveGame(this.gs);
            this.refreshHud();
            this.renderPetPanel();
            this.toast(`出战召唤兽：${base.name} Lv.${inst.level}`);
          },
        }, this.gs.activePetUid === inst.uid ? '出战中' : '出战'),
      ));
    }
    this.petPanelEl.append(
      h('div', { class: 'dname' }, '【召唤兽】出战宠物打怪可获经验升级'),
      rows,
      h('div', { style: 'text-align:right;margin-top:8px' },
        h('button', { class: 'btn small', onclick: () => this.togglePetPanel() }, '关闭'),
      ),
    );
  }

  private petSpec(): { defId: string; name: string; emoji: string; stats: import('../core/types').UnitStats; resists: import('../core/types').Resists; skillIds: string[] } | null {
    const inst = activePet(this.gs);
    if (!inst) return null;
    const base = petBase(inst.defId);
    return { defId: inst.defId, name: base.name, emoji: base.emoji, stats: petUnitStats(inst), resists: base.resists, skillIds: base.skillIds };
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
      h('div', { class: 'dname' }, '【潜能加点】剩余潜能点：' + this.gs.potential),
      rows,
      h('div', { class: 'bag-row', style: 'margin-top:6px' },
        h('span', { class: 'bag-item', style: 'color:#a3937a' },
          `当前总加成：攻+${bonus.atk} 防+${bonus.def} 法+${bonus.mag} 速+${bonus.spd} 气血+${bonus.hp} 法力+${bonus.mp}（含装备，下一场战斗生效）`),
      ),
      h('div', { style: 'text-align:right;margin-top:8px' },
        h('button', { class: 'btn small', onclick: () => this.toggleAllocPanel() }, '关闭'),
      ),
    );
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
      h('div', { class: 'dname' }, `【${cls.sect} · 师门法术】用银两与潜能点提升法术威力（最高 Lv.${SKILL_MAX_LEVEL}）`),
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
    rows.append(h('div', { class: 'bag-sep' }));

    // 背包内未穿的装备
    const free = this.gs.bag.filter((i) => !Object.values(this.gs.equipped).includes(i.uid));
    if (free.length === 0) {
      rows.append(h('div', { class: 'bag-row' }, h('span', { class: 'bag-item', style: 'color:#a3937a' }, '背包里暂无装备——去野外打怪掉落吧')));
    }
    for (const it of free) {
      rows.append(h('div', { class: 'bag-row' },
        h('span', { class: 'bag-item' }, describeItem(it)),
        h('button', { class: 'btn small', onclick: () => this.equip(it) }, '装备'),
        h('button', {
          class: 'btn small',
          title: `重掷词条（花费 ${REFINE_COST} 银两）`,
          onclick: () => this.refine(it),
        }, `炼化 ${REFINE_COST}银`),
      ));
    }

    this.bagPanelEl.append(
      h('div', { class: 'dname' }, '【背包 · 装备】加成在下一场战斗生效'),
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
    this.gs.equipped[it.slot] = it.uid;
    saveGame(this.gs);
    this.renderBagPanel();
    this.toast(`已装备 ${it.name}（下一场战斗生效）`);
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
    this.invEl.textContent = `🧪 金疮药 ×${this.gs.inv.heal} ｜ 凝气丹 ×${this.gs.inv.mana}`;
    const pet = activePet(this.gs);
    const petName = pet ? petBase(pet.defId).name : '？';
    this.petEl.textContent = pet ? `🐾 出战：${petName} Lv.${pet.level}（${this.gs.petInstances.length}只）` : '🐾 无宠物';
    this.allocBtn.textContent = this.gs.potential > 0 ? `✨ 加点(${this.gs.potential})` : '✨ 加点';
    this.allocBtn.classList.toggle('auto-on', this.gs.potential > 0);
    const q = activeQuest(this.gs);
    if (!q) {
      this.questEl.textContent = this.gs.questStep === 0 ? '📜 任务：去缉妖司找长老' : '📜 任务：全部完成 🎉';
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
    const d = dialogueFor(this.gs);
    this.closePanels();
    this.dialogueEl.innerHTML = '';
    this.dialogueEl.style.display = '';
    const body = h('div', { class: 'dtext' }, d.text);
    const btns = h('div', { class: 'cmd-row' });
    for (const a of d.actions) {
      btns.append(h('button', {
        class: a.kind === 'claim' ? 'btn primary' : 'btn',
        onclick: () => {
          if (a.kind === 'accept') {
            acceptQuest(this.gs);
            this.toast('接受任务：缉狼令');
          } else if (a.kind === 'claim') {
            const r = claimQuest(this.gs);
            this.toast(`领取赏银 ${r.silver}，任务链推进！`);
          }
          this.refreshHud();
          this.closeDialogue();
        },
      }, a.label));
    }
    this.dialogueEl.append(h('div', { class: 'dname' }, `【${d.name}】`), body, btns);
  }

  private closeDialogue(): void {
    this.dialogueEl.style.display = 'none';
  }

  // ===== 战斗衔接 =====

  private async onEncounter(group: string[], groupKey: string): Promise<void> {
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
      skillLevels: { ...this.gs.skillLevels },
      petUnit: this.petSpec() ?? undefined,
    };
    const bHooks: BattleHooks = {
      finish: (info) => {
        const summary = settleBattle(
          this.gs,
          { winner: info.winner, enemyIds: group, itemsUsed: info.itemsUsed, caught: info.caught },
          groupKey,
        );
        return { lines: summary.lines };
      },
    };
    await BattleScreen.create(
      this.root,
      opts,
      () => void WorldScreen.create(this.root, this.gs, this.hooks),
      bHooks,
    );
    await this.fade(false);
  }

  // ===== 切图 =====

  private async travel(exit: MapExit): Promise<void> {
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
}
