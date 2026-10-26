/**
 * 2.5D 战斗渲染器（PixiJS）：消费与 DOM UI 相同的事件流。
 * - renderState：把战场状态（血条/状态章/阵亡姿态）同步到精灵 —— 联机客户端同样可用；
 * - playEvent：把事件翻译成动画（突进、闪红、飘字、粒子、倒地）。
 * 素材来自 public/assets（tools/gen-assets.mjs 生成，可逐文件替换）。
 */
import { Application, AnimatedSprite, Assets, Container, Graphics, Text, Texture } from 'pixi.js';
import { SKILLS } from '../core/content';
import type { BattleEvent, Unit } from '../core/types';
import { STATUS_META } from '../core/types';
import { Particles } from './particles';
import { Tweens, easeInOut } from './tween';

const W = 1152;
const H = 540;

const ELEMENT_COLORS: Record<string, number> = {
  fire: 0xff7a3c,
  water: 0x4fa8e8,
  wind: 0x9fe8a8,
  thunder: 0xf5e04a,
  physical: 0xd8d8d8,
};

interface AnimDef { frames: string[]; fps: number; loop: boolean }
interface CharManifest { frameSize: [number, number]; anims: Record<string, AnimDef> }

/**
 * 敌我站位（大话式左右对峙，各容 5 槽）：
 * 敌方在左列纵向错开；我方在右列拆两排——人物排（后）+ 宠物排（前，靠中线）。
 */
const ENEMY_SLOTS = [
  { x: 235, y: 175, scale: 1.3 },
  { x: 165, y: 262, scale: 1.42 },
  { x: 245, y: 350, scale: 1.54 },
  { x: 165, y: 438, scale: 1.66 },
  { x: 262, y: 495, scale: 1.72 },
];
const CHAR_SLOTS = [
  { x: 1000, y: 195, scale: 1.4 },
  { x: 928, y: 285, scale: 1.5 },
  { x: 1002, y: 375, scale: 1.6 },
  { x: 930, y: 458, scale: 1.7 },
  { x: 1004, y: 500, scale: 1.72 },
];
const PET_SLOTS = [
  { x: 810, y: 165, scale: 1.3 },
  { x: 748, y: 258, scale: 1.42 },
  { x: 816, y: 348, scale: 1.54 },
  { x: 744, y: 438, scale: 1.66 },
  { x: 814, y: 505, scale: 1.72 },
];

/** n 个单位在 5 槽中的均匀取位 */
function pickSlots(n: number): number[] {
  switch (n) {
    case 1: return [2];
    case 2: return [1, 3];
    case 3: return [0, 2, 4];
    case 4: return [0, 1, 3, 4];
    default: return [0, 1, 2, 3, 4];
  }
}

function slotFor(side: 'ally' | 'enemy', tag: Unit['tag'], index: number, count: number): { x: number; y: number; scale: number } {
  const picks = pickSlots(count);
  const table = side === 'enemy' ? ENEMY_SLOTS : tag === 'pet' ? PET_SLOTS : CHAR_SLOTS;
  return table[picks[index] ?? index % table.length];
}

class UnitView {
  root = new Container();          // 脚底锚点，参与 Y 排序
  shadow = new Graphics();
  sprite: AnimatedSprite;
  bars = new Graphics();
  nameText: Text;
  chipLayer = new Container();
  ring = new Graphics();           // 选中/行动光环（脚底）
  badge = new Graphics();          // ✓ 指令徽标
  baseScale: number;
  anims: Record<string, Texture[]> = {};
  animFps: Record<string, number> = {};
  animLoop: Record<string, boolean> = {};
  unit: Unit | null = null;

  constructor(public id: string, public side: 'ally' | 'enemy', slot: { x: number; y: number; scale: number }, textures: Record<string, Texture[]>, fps: Record<string, number>, loop: Record<string, boolean>, name: string) {
    this.baseScale = slot.scale;
    this.anims = textures;
    this.animFps = fps;
    this.animLoop = loop;

    this.root.x = slot.x;
    this.root.y = slot.y;
    this.root.zIndex = slot.y;

    this.shadow.ellipse(0, -2, 22, 7).fill({ color: 0x0a0a10, alpha: 0.3 });
    this.root.addChild(this.shadow);

    const idle = textures.idle;
    this.sprite = new AnimatedSprite(idle);
    this.sprite.anchor.set(0.5, 0.94);
    this.sprite.scale.set(slot.scale);
    this.sprite.animationSpeed = (fps.idle ?? 2.5) / 60;
    this.sprite.loop = true;
    this.sprite.play();
    this.root.addChild(this.sprite);

    this.ring.ellipse(0, -3, 26, 9).stroke({ width: 2, color: 0xffd24a, alpha: 1 });
    this.ring.visible = false;
    this.root.addChild(this.ring);

    this.nameText = new Text({ text: name, style: { fontFamily: 'Microsoft YaHei, sans-serif', fontSize: 13, fill: 0xf5eeda, stroke: { color: 0x1c1810, width: 3 } } });
    this.nameText.anchor.set(0.5, 1);
    this.nameText.y = -66 * slot.scale;
    this.root.addChild(this.nameText);

    this.root.addChild(this.bars);
    this.root.addChild(this.chipLayer);

    this.badge.circle(0, -78 * slot.scale, 9).fill(0x3f7d3f).stroke({ width: 2, color: 0xf5eeda });
    const check = new Text({ text: '✓', style: { fontSize: 12, fill: 0xffffff } });
    check.anchor.set(0.5, 0.5);
    this.badge.addChild(check);
    this.badge.visible = false;
    this.root.addChild(this.badge);

    this.sprite.eventMode = 'static';
    this.sprite.cursor = 'default';
  }

  playAnim(name: string, speed: number): void {
    const frames = this.anims[name];
    if (!frames || this.sprite.textures === frames) return;
    this.sprite.textures = frames;
    this.sprite.animationSpeed = ((this.animFps[name] ?? 8) * speed) / 60;
    this.sprite.loop = this.animLoop[name] ?? false;
    // 非循环动作（攻击/施法）播完自动回到待机
    this.sprite.onComplete = this.sprite.loop ? undefined : () => {
      this.sprite.textures = this.anims.idle;
      this.sprite.animationSpeed = ((this.animFps.idle ?? 2.5) * speed) / 60;
      this.sprite.loop = true;
      this.sprite.gotoAndPlay(0);
    };
    this.sprite.gotoAndPlay(0);
  }

  /** 状态同步：血条 / 蓝条 / 状态章 / 阵亡姿态 */
  renderState(u: Unit): void {
    this.unit = u;
    const s = this.baseScale;
    this.nameText.y = -66 * s;
    this.nameText.alpha = u.alive ? 1 : 0.5;

    this.bars.clear();
    const barW = 56;
    const by = -58 * s;
    // 血条
    this.bars.roundRect(-barW / 2 - 1, by - 1, barW + 2, 9, 3).fill({ color: 0x1c1810, alpha: 0.75 });
    const ratio = Math.max(0, u.hp / u.maxHp);
    const hpColor = ratio > 0.5 ? 0x4c944c : ratio > 0.25 ? 0xb39428 : 0xa63d2f;
    if (ratio > 0) this.bars.roundRect(-barW / 2, by, barW * ratio, 7, 2).fill(hpColor);
    // 蓝条
    this.bars.roundRect(-barW / 2 - 1, by + 9, barW + 2, 6, 2).fill({ color: 0x1c1810, alpha: 0.75 });
    const mpRatio = Math.max(0, u.mp / u.maxMp);
    if (mpRatio > 0) this.bars.roundRect(-barW / 2, by + 10, barW * mpRatio * 0.82, 4, 1).fill(0x4f7fb5);

    // 状态章
    this.chipLayer.removeChildren().forEach((c) => c.destroy());
    let cx = -(u.statuses.length * 21) / 2;
    for (const st of u.statuses) {
      const meta = STATUS_META[st.kind];
      const bg = new Graphics();
      bg.roundRect(0, 0, 19, 14, 4).fill(meta.bad ? 0x8c3a28 : 0x3f6a38).stroke({ width: 1, color: 0x1c1810 });
      const label = new Text({ text: `${meta.chip}${st.rounds}`, style: { fontFamily: 'Microsoft YaHei, sans-serif', fontSize: 10, fill: 0xf5eeda } });
      label.anchor.set(0.5, 0.5);
      label.x = 9.5;
      label.y = 7;
      bg.addChild(label);
      bg.x = cx;
      bg.y = by - 20;
      this.chipLayer.addChild(bg);
      cx += 21;
    }

    // 阵亡姿态：仅在快照直接同步时摆出（正常对局由 death 事件动画完成）
    if (!u.alive) {
      if (this.sprite.rotation === 0) {
        this.sprite.rotation = this.side === 'ally' ? -1.42 : 1.42;
        this.sprite.alpha = 0.42;
        this.sprite.tint = 0x8a8a8a;
        this.shadow.alpha = 0.15;
      }
      this.chipLayer.visible = false;
    } else {
      this.chipLayer.visible = true;
    }
  }
}

export class BattleRenderer {
  private app = new Application();
  private world = new Container();
  private fx = new Container();
  private uiLayer = new Container();
  private dimmer = new Graphics();
  private tweens = new Tweens();
  private particles = new Particles();
  private views = new Map<string, UnitView>();
  private targetable = new Set<string>();
  private commanded = new Set<string>();
  private focusId: string | null = null;
  private speed = 1;
  private elapsed = 0;
  private destroyed = false;

  onUnitClick: ((unitId: string) => void) | null = null;

  private constructor(private host: HTMLElement) {}

  static async create(host: HTMLElement, encounterId: string, units: Unit[]): Promise<BattleRenderer> {
    const r = new BattleRenderer(host);
    await r.init(encounterId, units);
    return r;
  }

  private async init(encounterId: string, units: Unit[]): Promise<void> {
    await this.app.init({ width: W, height: H, backgroundAlpha: 0, antialias: false });
    if (this.destroyed) return;
    this.app.canvas.style.width = '100%';
    this.app.canvas.style.height = 'auto';
    this.app.canvas.style.display = 'block';
    this.host.appendChild(this.app.canvas);

    // 加载清单与素材
    const manifestUrl = new URL('/assets/manifest.json', location.origin).href;
    const manifest = (await (await fetch(manifestUrl)).json()) as Record<string, CharManifest> & { $scenes: Record<string, string> };

    const sceneKey = manifest.$scenes[encounterId] ? encounterId : 'default';
    const sceneTex: Texture = await Assets.load(new URL(`/assets/${manifest.$scenes[sceneKey]}`, location.origin).href);
    const scene = new AnimatedSprite([sceneTex]);
    scene.scale.set(W / sceneTex.width, H / sceneTex.height);
    this.app.stage.addChild(scene);

    // 收集全部帧 URL 一次加载
    const urls = new Set<string>();
    const charIds = new Set<string>();
    for (const u of units) charIds.add(u.defId);
    for (const id of charIds) {
      const cm = manifest[id];
      if (!cm) continue;
      for (const a of Object.values(cm.anims)) a.frames.forEach((f) => urls.add(new URL(`/assets/${f}`, location.origin).href));
    }
    await Assets.load([...urls]);

    this.world.sortableChildren = true;
    this.app.stage.addChild(this.world);
    this.app.stage.addChild(this.particles.container);
    this.app.stage.addChild(this.fx);

    for (const u of units) {
      const cm = manifest[u.defId];
      if (!cm) continue;
      const textures: Record<string, Texture[]> = {};
      const fps: Record<string, number> = {};
      const loop: Record<string, boolean> = {};
      for (const [anim, def] of Object.entries(cm.anims)) {
        textures[anim] = def.frames.map((f) => Assets.get(new URL(`/assets/${f}`, location.origin).href) as Texture);
        fps[anim] = def.fps;
        loop[anim] = def.loop;
      }
      const side = u.side;
      // 我方拆两排：人物与宠物各自计数取位
      const sameRow = units.filter((x) => x.side === side && (side === 'enemy' || x.tag === u.tag));
      const index = sameRow.indexOf(u);
      const count = sameRow.length;
      const view = new UnitView(u.id, side, slotFor(side, u.tag, index, count), textures, fps, loop, u.name);
      view.sprite.on('pointertap', () => {
        if (this.targetable.has(u.id)) this.onUnitClick?.(u.id);
      });
      this.views.set(u.id, view);
      this.world.addChild(view.root);
    }

    // 结算压暗层
    this.dimmer.rect(0, 0, W, H).fill({ color: 0x0a0a10, alpha: 0 });
    this.uiLayer.addChild(this.dimmer);
    this.app.stage.addChild(this.uiLayer);

    this.app.ticker.add(() => this.tick(this.app.ticker.deltaMS));
  }

  private tick(dtMs: number): void {
    const dt = dtMs * this.speed;
    this.elapsed += dtMs;
    this.tweens.update(dt);
    this.particles.update(dt);
    // 光环呼吸
    for (const [, v] of this.views) {
      if (v.ring.visible) v.ring.alpha = 0.55 + 0.4 * Math.sin(this.elapsed / 160);
    }
  }

  // ===== 状态同步 =====

  renderState(units: Unit[]): void {
    for (const u of units) this.views.get(u.id)?.renderState(u);
    for (const [id, v] of this.views) {
      v.badge.visible = this.commanded.has(id);
      const isTarget = this.targetable.has(id);
      v.sprite.eventMode = isTarget ? 'static' : 'none';
      v.sprite.cursor = isTarget ? 'pointer' : 'default';
      const isFocus = this.focusId === id;
      v.ring.visible = isTarget || isFocus;
      if (isFocus && !isTarget) {
        v.ring.clear();
        v.ring.ellipse(0, -3, 26, 9).stroke({ width: 2.5, color: 0xf0c060 });
      } else if (isTarget) {
        v.ring.clear();
        v.ring.ellipse(0, -3, 28, 10).stroke({ width: 3, color: 0xff8a5a });
      }
    }
  }

  setCommanded(ids: string[]): void {
    this.commanded = new Set(ids);
  }

  setTargetable(ids: string[]): void {
    this.targetable = new Set(ids);
  }

  setFocus(id: string | null): void {
    this.focusId = id;
  }

  setSpeed(speed: number): void {
    this.speed = speed;
    for (const [, v] of this.views) {
      v.sprite.animationSpeed = ((v.animFps[this.currentAnimName(v)] ?? 8) * speed) / 60;
    }
  }

  private currentAnimName(v: UnitView): string {
    for (const [name, texs] of Object.entries(v.anims)) {
      if (texs === v.sprite.textures) return name;
    }
    return 'idle';
  }

  // ===== 事件动画 =====

  playEvent(ev: BattleEvent): void {
    switch (ev.t) {
      case 'actionStart': {
        const v = this.views.get(ev.actorId);
        if (!v) break;
        this.tweens.add(320, (p) => {
          const s = v.baseScale * (1 + 0.1 * Math.sin(p * Math.PI));
          v.sprite.scale.set(s);
        }, { done: () => v.sprite.scale.set(v.baseScale) });
        break;
      }
      case 'attack': {
        const v = this.views.get(ev.actorId);
        if (!v) break;
        v.playAnim('attack', this.speed);
        // 左右对峙：我方在右列向左突进，敌方在左列向右突进
        const dx = v.side === 'ally' ? -34 : 34;
        const ox = v.root.x;
        this.tweens.add(220, (p) => {
          v.root.x = ox + dx * Math.sin(p * Math.PI);
        }, { ease: easeInOut, done: () => { v.root.x = ox; } });
        break;
      }
      case 'cast': {
        const v = this.views.get(ev.actorId);
        if (!v) break;
        v.playAnim('cast', this.speed);
        const skill = SKILLS[ev.skillId];
        const color = ELEMENT_COLORS[skill?.element ?? 'physical'] ?? 0xffffff;
        this.particles.gather(v.root.x, v.root.y - 56 * v.baseScale, color);
        break;
      }
      case 'damage': {
        const v = this.views.get(ev.targetId);
        if (v) {
          v.sprite.tint = 0xff6a5a;
          this.tweens.add(150, (p) => {
            v.sprite.tint = p < 1 ? 0xff6a5a : 0xffffff;
          }, { done: () => { v.sprite.tint = 0xffffff; } });
          const ox = v.root.x;
          this.tweens.add(240, (p) => {
            v.root.x = ox + Math.sin(p * Math.PI * 4) * 5 * (1 - p);
          }, { done: () => { v.root.x = ox; } });
          const skillEl = 'physical';
          this.particles.burst(v.root.x, v.root.y - 34 * v.baseScale, ELEMENT_COLORS[skillEl]);
          if (ev.element !== 'physical') {
            this.particles.burst(v.root.x, v.root.y - 34 * v.baseScale, ELEMENT_COLORS[ev.element] ?? 0xffffff, 10, 0.1);
          }
        }
        this.float(ev.targetId, `-${ev.amount}${ev.crit ? ' 会心!' : ''}`, ev.crit ? 'crit' : 'dmg');
        break;
      }
      case 'heal':
        this.float(ev.targetId, `+${ev.amount}`, 'heal');
        this.sparkle(ev.targetId, 0x58c858);
        break;
      case 'poisonTick':
        this.float(ev.targetId, `-${ev.amount}`, 'poison');
        this.sparkle(ev.targetId, 0xb06ae8);
        break;
      case 'statusHit': {
        const meta = STATUS_META[ev.kind];
        this.float(ev.targetId, meta.chip, meta.bad ? 'bad' : 'good');
        this.sparkle(ev.targetId, meta.bad ? 0xb06ae8 : 0x8ad8a0);
        break;
      }
      case 'statusResist':
        this.float(ev.targetId, '抵抗', 'resist');
        break;
      case 'actSkip':
        this.float(ev.actorId, ev.reason === 'sleep' ? 'Zzz' : '封！', 'resist');
        break;
      case 'defend': {
        const v = this.views.get(ev.actorId);
        if (v) this.particles.burst(v.root.x, v.root.y - 20 * v.baseScale, 0x6a9ad8, 8, 0.08);
        break;
      }
      case 'catchSuccess': {
        const v = this.views.get(ev.targetId);
        if (v) {
          this.particles.gather(v.root.x, v.root.y - 30 * v.baseScale, 0x9ae8a8, 18);
          this.particles.burst(v.root.x, v.root.y - 30 * v.baseScale, 0xd8f0d8, 10, 0.08);
        }
        this.float(ev.targetId, '收服！', 'good');
        break;
      }
      case 'catchFail':
        this.float(ev.targetId, '挣脱了！', 'resist');
        break;
      case 'death': {
        const v = this.views.get(ev.targetId);
        if (!v) break;
        const rot = v.side === 'ally' ? -1.42 : 1.42;
        this.tweens.add(520, (p) => {
          v.sprite.rotation = rot * p;
          v.sprite.alpha = 1 - 0.55 * p;
          v.shadow.alpha = 1 - 0.85 * p;
        }, { ease: easeInOut });
        break;
      }
      case 'battleEnd':
        this.tweens.add(700, (p) => {
          this.dimmer.clear();
          this.dimmer.rect(0, 0, W, H).fill({ color: 0x0a0a10, alpha: 0.32 * p });
        });
        break;
      default:
        break;
    }
  }

  private sparkle(unitId: string, color: number): void {
    const v = this.views.get(unitId);
    if (v) this.particles.rise(v.root.x, v.root.y - 30 * v.baseScale, color);
  }

  private float(unitId: string, text: string, kind: string): void {
    const v = this.views.get(unitId);
    if (!v) return;
    const colors: Record<string, number> = {
      dmg: 0xff5a4a, crit: 0xffa02a, heal: 0x58c858, poison: 0xc08ae8,
      resist: 0xd8d8d8, bad: 0xd88ae8, good: 0x9ae8a8,
    };
    const t = new Text({
      text,
      style: {
        fontFamily: 'Microsoft YaHei, sans-serif',
        fontSize: kind === 'crit' ? 26 : kind === 'dmg' || kind === 'heal' ? 19 : 15,
        fill: colors[kind] ?? 0xffffff,
        stroke: { color: 0x1c1810, width: 4 },
        fontWeight: 'bold',
      },
    });
    t.anchor.set(0.5, 0.5);
    t.x = v.root.x + (Math.random() - 0.5) * 14;
    t.y = v.root.y - 66 * v.baseScale;
    t.zIndex = 999;
    this.fx.addChild(t);
    this.tweens.add(950, (p) => {
      t.y = v.root.y - 66 * v.baseScale - 40 * p;
      t.alpha = 1 - p;
    }, { done: () => t.destroy() });
  }

  destroy(): void {
    this.destroyed = true;
    this.tweens.clear();
    this.particles.clear();
    this.app.destroy({ removeView: true }, { children: true });
  }
}
