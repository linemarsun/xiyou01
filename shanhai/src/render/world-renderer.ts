/**
 * 世界地图渲染器（PixiJS）：大图卷动、点击走路、怪物游荡、NPC、出口路牌。
 * 只负责画面与输入；地图/任务/背包状态在 core/world.ts。
 */
import { Application, AnimatedSprite, Assets, Container, Graphics, Text, Texture } from 'pixi.js';
import type { GameState, MapExit, WorldMap } from '../core/world';
import { WALK_BOUNDS } from '../core/world';

const VIEW_W = 960;
const VIEW_H = 520;
const WALK_SPEED = 135; // px/s
const MONSTER_SPEED = 34;

interface AnimDef { frames: string[]; fps: number; loop: boolean }
type Manifest = Record<string, { frameSize: [number, number]; anims: Record<string, AnimDef> }> & {
  $scenes: Record<string, string>;
};

interface Actor {
  root: Container;
  sprite: AnimatedSprite;
  baseScale: number;
  // 游荡参数（怪物）
  homeX?: number;
  homeY?: number;
  targetX?: number;
  targetY?: number;
  waitUntil?: number;
}

export interface WorldHooks {
  onEncounter: (group: string[], groupKey: string) => void;
  onNpc: () => void;
  onExit: (exit: MapExit) => void;
}

export class WorldRenderer {
  private app = new Application();
  private world = new Container();
  private player!: Actor;
  private npc: Actor | null = null;
  private monsters = new Map<string, Actor>();
  private targetX: number;
  private targetY: number;
  private camX = 0;
  private camY = 0;
  private engaged = false;
  private npcPrompted = false;
  private elapsed = 0;
  private destroyed = false;
  private inputEnabled = true;

  private constructor(
    private map: WorldMap,
    private gs: GameState,
    private hooks: WorldHooks,
  ) {
    this.targetX = gs.px;
    this.targetY = gs.py;
  }

  static async create(host: HTMLElement, map: WorldMap, gs: GameState, hooks: WorldHooks): Promise<WorldRenderer> {
    const r = new WorldRenderer(map, gs, hooks);
    await r.init(host);
    return r;
  }

  private async init(host: HTMLElement): Promise<void> {
    await this.app.init({ width: VIEW_W, height: VIEW_H, backgroundAlpha: 0, antialias: false });
    if (this.destroyed) return;
    this.app.canvas.style.width = '100%';
    this.app.canvas.style.height = 'auto';
    this.app.canvas.style.display = 'block';
    host.appendChild(this.app.canvas);

    const manifestUrl = new URL('/assets/manifest.json', location.origin).href;
    const manifest = (await (await fetch(manifestUrl)).json()) as Manifest;

    const sceneKey = manifest.$scenes[this.map.scene] ? this.map.scene : 'default';
    const sceneTex: Texture = await Assets.load(new URL(`/assets/${manifest.$scenes[sceneKey]}`, location.origin).href);
    const scene = new AnimatedSprite([sceneTex]);
    scene.scale.set(this.map.w / sceneTex.width, this.map.h / sceneTex.height);
    this.world.addChild(scene);

    // 需要的精灵帧：玩家职业 + 长老 + 各怪物
    const ids = new Set<string>([this.gs.classId, 'elder']);
    for (const s of this.map.spawns) s.group.forEach((id) => ids.add(id));
    const urls = new Set<string>();
    for (const id of ids) {
      const cm = manifest[id];
      if (!cm) continue;
      for (const a of Object.values(cm.anims)) a.frames.forEach((f) => urls.add(new URL(`/assets/${f}`, location.origin).href));
    }
    await Assets.load([...urls]);

    this.app.stage.addChild(this.world);

    // 出口路牌
    for (const ex of this.map.exits) {
      const sign = new Container();
      sign.x = ex.x;
      sign.y = ex.y;
      const post = new Graphics();
      post.rect(-3, -46, 6, 46).fill(0x6a4a30);
      post.roundRect(-30, -78, 60, 34, 5).fill(0x8a6a42).stroke({ width: 2, color: 0x4a3020 });
      const label = new Text({ text: ex.label, style: { fontFamily: 'Microsoft YaHei, sans-serif', fontSize: 15, fill: 0xf5eeda, stroke: { color: 0x1c1810, width: 3 } } });
      label.anchor.set(0.5, 0.5);
      label.y = -61;
      sign.addChild(post, label);
      this.world.addChild(sign);
    }

    // NPC
    if (this.map.npc) {
      this.npc = this.buildActor(this.map.npc.x, this.map.npc.y, 'elder', 1.9, manifest);
      const tag = new Text({ text: this.map.npc.name, style: { fontFamily: 'Microsoft YaHei, sans-serif', fontSize: 13, fill: 0xffe9a8, stroke: { color: 0x1c1810, width: 3 } } });
      tag.anchor.set(0.5, 1);
      tag.y = -70 * 1.9;
      this.npc.root.addChild(tag);
      this.world.addChild(this.npc.root);
    }

    // 怪物
    this.map.spawns.forEach((spawn, i) => {
      const key = `${this.map.id}:${i}`;
      if (this.gs.killedGroups[key]) return;
      spawn.group.forEach((defId, j) => {
        const ox = (j - (spawn.group.length - 1) / 2) * 44;
        const a = this.buildActor(spawn.x + ox, spawn.y + (j % 2) * 14, defId, 1.5, manifest);
        a.homeX = spawn.x + ox;
        a.homeY = spawn.y;
        this.monsters.set(`${key}:${j}`, a);
        this.world.addChild(a.root);
      });
    });

    // 玩家
    this.player = this.buildActor(this.gs.px, this.gs.py, this.gs.classId, 1.8, manifest);
    this.world.addChild(this.player.root);

    this.app.canvas.addEventListener('pointerdown', (e) => this.onTap(e));
    this.app.ticker.add(() => this.tick(this.app.ticker.deltaMS));
  }

  private buildActor(x: number, y: number, defId: string, scale: number, manifest: Manifest): Actor {
    const cm = manifest[defId];
    const tex = (anim: string) =>
      (cm?.anims[anim]?.frames ?? []).map((f) => Assets.get(new URL(`/assets/${f}`, location.origin).href) as Texture);
    const idle = tex('idle');
    const sprite = new AnimatedSprite(idle.length > 0 ? idle : [Texture.WHITE]);
    sprite.anchor.set(0.5, 0.94);
    sprite.scale.set(scale);
    sprite.animationSpeed = (cm?.anims.idle?.fps ?? 2.5) / 60;
    sprite.loop = true;
    sprite.play();
    const root = new Container();
    root.x = x;
    root.y = y;
    root.zIndex = y;
    const shadow = new Graphics();
    shadow.ellipse(0, -2, 20, 6).fill({ color: 0x0a0a10, alpha: 0.28 });
    root.addChild(shadow, sprite);
    const actor: Actor = { root, sprite, baseScale: scale };
    // 记录动画表供走路切换
    (actor as Actor & { anims?: Record<string, { fps: number }> }).anims = cm?.anims;
    return actor;
  }

  private playAnim(a: Actor, name: 'idle' | 'walk'): void {
    const anims = (a as Actor & { anims?: Record<string, { frames: string[]; fps: number }> }).anims;
    const def = anims?.[name];
    if (!def) return;
    const frames = def.frames.map((f) => Assets.get(new URL(`/assets/${f}`, location.origin).href) as Texture);
    if (frames.length === 0 || a.sprite.textures === frames) return;
    a.sprite.textures = frames;
    a.sprite.animationSpeed = def.fps / 60;
    a.sprite.loop = true;
    a.sprite.gotoAndPlay(0);
  }

  private onTap(e: PointerEvent): void {
    if (!this.inputEnabled || this.engaged) return;
    const canvas = this.app.canvas;
    const rect = canvas.getBoundingClientRect();
    const sx = ((e.clientX - rect.left) / rect.width) * VIEW_W;
    const sy = ((e.clientY - rect.top) / rect.height) * VIEW_H;
    const wx = sx + this.camX;
    const wy = sy + this.camY;

    // 点在路牌/怪物/NPC 附近时吸附走到目标点（点路牌=走进出口）
    for (const ex of this.map.exits) {
      if (Math.hypot(ex.x - wx, ex.y - wy) < 110) {
        this.targetX = ex.x;
        this.targetY = ex.y;
        return;
      }
    }
    if (this.npc && Math.hypot(this.npc.root.x - wx, this.npc.root.y - wy) < 90) {
      this.targetX = this.npc.root.x;
      this.targetY = this.npc.root.y;
      return;
    }
    for (const [, m] of this.monsters) {
      if (Math.hypot(m.root.x - wx, m.root.y - wy) < 90) {
        this.targetX = m.root.x;
        this.targetY = m.root.y;
        return;
      }
    }
    this.targetX = Math.max(WALK_BOUNDS.minX, Math.min(WALK_BOUNDS.maxX, wx));
    this.targetY = Math.max(WALK_BOUNDS.minY, Math.min(WALK_BOUNDS.maxY, wy));
  }

  private tick(dtMs: number): void {
    if (this.destroyed) return;
    const dt = dtMs / 1000;
    this.elapsed += dtMs;

    // —— 玩家移动 ——
    const px = this.player.root.x;
    const py = this.player.root.y;
    const dx = this.targetX - px;
    const dy = this.targetY - py;
    const dist = Math.hypot(dx, dy);
    if (dist > 4) {
      const step = Math.min(dist, WALK_SPEED * dt);
      this.player.root.x += (dx / dist) * step;
      this.player.root.y += (dy / dist) * step;
      this.playAnim(this.player, 'walk');
      if (Math.abs(dx) > 2) this.player.sprite.scale.x = Math.abs(this.player.baseScale) * (dx < 0 ? -1 : 1);
    } else {
      this.playAnim(this.player, 'idle');
      this.player.sprite.scale.x = Math.abs(this.player.sprite.scale.x);
    }
    this.player.root.zIndex = this.player.root.y;

    // —— 怪物游荡 ——
    for (const [, m] of this.monsters) {
      if (m.homeX === undefined || m.homeY === undefined) continue;
      if (m.targetX === undefined && this.elapsed > (m.waitUntil ?? 0)) {
        m.targetX = m.homeX + (Math.random() - 0.5) * 180;
        m.targetY = Math.max(WALK_BOUNDS.minY, Math.min(WALK_BOUNDS.maxY, m.homeY + (Math.random() - 0.5) * 100));
      }
      if (m.targetX !== undefined && m.targetY !== undefined) {
        const mdx = m.targetX - m.root.x;
        const mdy = m.targetY - m.root.y;
        const md = Math.hypot(mdx, mdy);
        if (md < 4) {
          m.targetX = undefined;
          m.waitUntil = this.elapsed + 800 + Math.random() * 2200;
        } else {
          const step = Math.min(md, MONSTER_SPEED * dt);
          m.root.x += (mdx / md) * step;
          m.root.y += (mdy / md) * step;
          if (Math.abs(mdx) > 2) m.sprite.scale.x = Math.abs(m.baseScale) * (mdx < 0 ? -1 : 1);
        }
      }
      m.root.zIndex = m.root.y;
    }
    this.world.sortableChildren = true;

    // —— 摄像机跟随（钳制在地图内） ——
    this.camX = Math.max(0, Math.min(this.map.w - VIEW_W, this.player.root.x - VIEW_W / 2));
    this.camY = Math.max(0, Math.min(this.map.h - VIEW_H, this.player.root.y - VIEW_H / 2));
    this.world.x = -this.camX;
    this.world.y = -this.camY;

    if (this.engaged) return;

    // —— 触发检测 ——
    const pr = this.player.root;
    for (const [key, m] of this.monsters) {
      if (Math.hypot(m.root.x - pr.x, m.root.y - pr.y) < 75) {
        this.engaged = true;
        this.inputEnabled = false;
        const groupKey = key.split(':').slice(0, 2).join(':');
        const spawn = this.map.spawns[Number(key.split(':')[1])];
        this.hooks.onEncounter(spawn.group, groupKey);
        return;
      }
    }
    if (this.npc && !this.npcPrompted && Math.hypot(this.npc.root.x - pr.x, this.npc.root.y - pr.y) < 80) {
      this.npcPrompted = true;
      this.targetX = pr.x;
      this.targetY = pr.y;
      this.hooks.onNpc();
    } else if (this.npc && this.npcPrompted && Math.hypot(this.npc.root.x - pr.x, this.npc.root.y - pr.y) > 120) {
      this.npcPrompted = false;
    }
    for (const ex of this.map.exits) {
      if (Math.hypot(ex.x - pr.x, ex.y - pr.y) < ex.r) {
        this.engaged = true;
        this.inputEnabled = false;
        this.hooks.onExit(ex);
        return;
      }
    }
  }

  syncState(gs: GameState): void {
    this.gs = gs;
  }

  /** 玩家当前地图坐标（战斗衔接、切图、存档用） */
  getPlayerPos(): { x: number; y: number } {
    return { x: this.player.root.x, y: this.player.root.y };
  }

  /** 调试：内部状态（DEV 构建的 window 句柄用） */
  debugInfo(): { player: { x: number; y: number }; cam: { x: number; y: number }; target: { x: number; y: number }; engaged: boolean } {
    return {
      player: { x: this.player.root.x, y: this.player.root.y },
      cam: { x: this.camX, y: this.camY },
      target: { x: this.targetX, y: this.targetY },
      engaged: this.engaged,
    };
  }

  /** 调试：直接设定移动目标（等价于点击该地图坐标） */
  debugMoveTo(x: number, y: number): void {
    if (this.engaged) return;
    this.targetX = Math.max(WALK_BOUNDS.minX, Math.min(WALK_BOUNDS.maxX, x));
    this.targetY = Math.max(WALK_BOUNDS.minY, Math.min(WALK_BOUNDS.maxY, y));
  }

  destroy(): void {
    this.destroyed = true;
    this.app.destroy({ removeView: true }, { children: true });
  }
}
