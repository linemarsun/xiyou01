/**
 * 世界地图渲染器（PixiJS）：大图卷动、点击走路、怪物游荡、NPC、出口路牌。
 * 只负责画面与输入；地图/任务/背包状态在 core/world.ts。
 */
import { Application, AnimatedSprite, Assets, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import type { GameState, MapExit, WorldMap } from '../core/world';
import { TILE_W, TILE_H, activePet, isWalkable } from '../core/world';
import {
  artUrl, foregroundImageUrl, foregroundJsonUrl, isoHouseCandidates, isoModuleCandidates, mapArtLegacyUrl, mapArtUrl, WORLD_TILE_ART,
} from '../core/art';
import {
  ISO_ANCHOR_OFFSET, ISO_TYPES, buildCollision, cellAt, cellRange, cellToWorld, expandLayout, findIsoPath, footprintPolygon,
  frontVertex, housePieces, isGroundType, isoLineWalkable, isoSize, isoWalkable, keyOf, nearestWalkableCell, simplifyIsoPath,
  type IsoCollision, type IsoItem, type IsoLayout,
} from '../core/iso';
import { planPath, type Point } from '../core/path';
import { CHAR_SCALE_TIER, WORLD_SCALE as SCALE } from './scale';

const VIEW_W = 1440;
const VIEW_H = 900;
const WALK_SPEED = 200; // px/s（大地图提速，减少跨区段跑动时间）
const MONSTER_SPEED = 34;

/**
 * 精灵缩放档位统一由 CHAR_SCALE_TIER（见 ./scale）派生：
 * 当前 1.00 档 = 实体约 112px，占 900 屏高约 12.4%。锚点仍是脚底 0.94。
 * 交互半径按同一比例同步（旧值按 0.75 档书写）。
 */
const CHAR_RANGE = CHAR_SCALE_TIER / 0.75;
/** 纵向偏移换算：旧数值按 48 帧书写，新帧 128 → ×(128/48)（只作用于 scale 绑定的偏移，绝对值不动） */
const OFF = 128 / 48;

interface AnimDef { frames: string[]; fps: number; loop: boolean }
type Manifest = Record<string, { frameSize: [number, number]; anims: Record<string, AnimDef> }> & {
  /** 旧契约字段，缺失时不能直接解引用（新 manifest 不再提供） */
  $scenes?: Record<string, string>;
  $worldTiles?: Record<string, string[]>;
};

interface ForegroundDef { seg: number; file: string; x: number; y: number; scale: number; occludes: boolean }
interface ForegroundRaw { file?: string; image?: string; src?: string; x: number; y: number; scale?: number; occludes?: boolean }
type ForegroundJson = ForegroundRaw[] | { objects?: ForegroundRaw[]; items?: ForegroundRaw[] };

interface Actor {
  root: Container;
  sprite: AnimatedSprite;
  baseScale: number;
  /** manifest 里的动画表（帧序/fps） */
  anims?: Record<string, AnimDef>;
  /** 已预取的帧纹理，按动画名缓存；切动画时直接复用，避免每帧重建数组 */
  frames?: Record<string, Texture[]>;
  /** 当前动画名；相同则不再重启动画（否则每帧 gotoAndPlay(0) 会冻在第 0 帧） */
  animName?: string;
  // 游荡参数（怪物）
  homeX?: number;
  homeY?: number;
  targetX?: number;
  targetY?: number;
  waitUntil?: number;
}

/** 等距可渲染单元：地面块或构件，锚点 = 足迹前底顶点，z = 该锚点世界 y */
interface IsoUnit {
  key: string;
  item: IsoItem;
  /** 贴图类型（房屋子构件与 item.type 不同：wall_wood / roof_slope / roof_ridge…） */
  type: string;
  variant?: string;
  facing?: string;
  /** 相对足迹前底顶点的像素偏移（组合房屋的子件用） */
  dx: number;
  dy: number;
  /** 组内绘制顺序（同 z 时按插入顺序，越小越先画） */
  order: number;
  x: number;
  y: number;
  z: number;
  ground: boolean;
  /** 近似精灵高度（px）与水平半宽（px），仅用于判断是否遮挡角色 */
  height: number;
  halfW: number;
}

export interface WorldHooks {
  onEncounter: (group: string[], groupKey: string) => void;
  onNpc: () => void;
  onTavern: () => void;
  onExit: (exit: MapExit) => void;
}

export class WorldRenderer {
  private app = new Application();
  private world = new Container();
  private tileLayer = new Container();
  /** 每张地图按区段索加载的 1440×900 原图（不足时循环复用最后一段） */
  private segmentTextures: Texture[] = [];
  private tileSprites = new Map<number, Sprite>();
  /** 等距构件地图：布局、碰撞、模块贴图（缺图走程序化占位） */
  private isoLayout?: IsoLayout;
  private isoCollision?: IsoCollision;
  private isoTextures = new Map<string, Texture>();
  private isoUnits = new Map<string, IsoUnit>();
  private isoCellUnits = new Map<string, string[]>();
  private isoVisible = new Map<string, Container>();
  /** 占位地面按类型合批（每种类型 1 个 Graphics，随视口重画，节点数由上千降到个位数） */
  private groundBatches: Graphics[] = [];
  private isoSynced = { x: -99999, y: -99999 };
  /** DEV 调试视口缩放（默认 1；俯瞰截图时临时缩小） */
  private viewScale = 1;
  /** 视口聚焦点（默认跟随玩家；俯瞰截图时固定到街区中心） */
  private viewFocus: { x: number; y: number } | null = null;
  /** 前景遮挡层：物件按底边 y 与角色一起参与排序，站到物件后面时被挡住 */
  private fgDefs: ForegroundDef[] = [];
  private fgSprites = new Map<string, Sprite>();
  private player!: Actor;
  private pet: Actor | null = null;
  private npc: Actor | null = null;
  private tavern: Actor | null = null;
  private monsters = new Map<string, Actor>();
  private targetX: number;
  private targetY: number;
  private camX = 0;
  private camY = 0;
  /** 剩余 waypoint；当前目标放在 targetX/targetY，走完一段再取下一段 */
  private path: Point[] = [];
  private engaged = false;
  private npcPrompted = false;
  private tavernPrompted = false;
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
    await this.app.init({
      width: VIEW_W,
      height: VIEW_H,
      backgroundAlpha: 0,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    });
    if (this.destroyed) return;
    this.app.canvas.style.width = '100%';
    this.app.canvas.style.height = 'auto';
    this.app.canvas.style.display = 'block';
    host.appendChild(this.app.canvas);

    const manifestUrl = new URL('/assets/manifest.json', location.origin).href;
    const manifest = (await (await fetch(manifestUrl)).json()) as Manifest;

    // 等距构件地图 → 布局合成；旧单屏地图 → 按 1440×900 区段横向拼接
    if (this.map.iso) await this.loadIso(this.map.iso.layout);
    if (!this.isoLayout) {
      // 布局缺失（或读取失败）时回退旧单屏区段渲染，保证其它地图仍可玩
      await this.loadMapArt();
      this.world.addChild(this.tileLayer);
    }
    this.centerCamera();
    if (this.isoLayout) this.syncIso(true);
    else this.syncTiles();

    // 需要的精灵帧：玩家职业 + 长老 + 各怪物 + 出战宠物
    const ids = new Set<string>([this.gs.classId, 'elder']);
    for (const s of this.map.spawns) s.group.forEach((id) => ids.add(id));
    const activePetId = activePet(this.gs)?.defId;
    if (activePetId) ids.add(activePetId);
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
      sign.zIndex = ex.y; // 与角色/构件同一套底边 y 排序
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
      this.npc = this.buildActor(this.map.npc.x, this.map.npc.y, 'elder', SCALE.npc, manifest);
      const tag = new Text({ text: this.map.npc.name, style: { fontFamily: 'Microsoft YaHei, sans-serif', fontSize: 13, fill: 0xffe9a8, stroke: { color: 0x1c1810, width: 3 } } });
      tag.anchor.set(0.5, 1);
      tag.y = -70 * OFF * SCALE.npc;
      this.npc.root.addChild(tag);
      this.world.addChild(this.npc.root);
    }

    // 酒馆（雇佣组队同伴）：复用 elder 精灵，仅位置与名牌不同
    if (this.map.tavern) {
      this.tavern = this.buildActor(this.map.tavern.x, this.map.tavern.y, 'elder', SCALE.tavern, manifest);
      const tag = new Text({ text: this.map.tavern.name, style: { fontFamily: 'Microsoft YaHei, sans-serif', fontSize: 13, fill: 0xffe9a8, stroke: { color: 0x1c1810, width: 3 } } });
      tag.anchor.set(0.5, 1);
      tag.y = -70 * OFF * SCALE.tavern;
      this.tavern.root.addChild(tag);
      this.world.addChild(this.tavern.root);
    }

    // 怪物
    this.map.spawns.forEach((spawn, i) => {
      const key = `${this.map.id}:${i}`;
      if (this.gs.killedGroups[key]) return;
      spawn.group.forEach((defId, j) => {
        const ox = (j - (spawn.group.length - 1) / 2) * 44;
        const a = this.buildActor(spawn.x + ox, spawn.y + (j % 2) * 14, defId, SCALE.monster, manifest);
        a.homeX = spawn.x + ox;
        a.homeY = spawn.y;
        this.monsters.set(`${key}:${j}`, a);
        this.world.addChild(a.root);
      });
    });

    // 玩家
    this.player = this.buildActor(this.gs.px, this.gs.py, this.gs.classId, SCALE.player, manifest);
    this.world.addChild(this.player.root);

    // 出战宠物跟随（世界里也展示，与战斗同一套 sprite）
    const pet = activePet(this.gs);
    if (pet) {
      this.pet = this.buildActor(
        this.gs.px - 84, this.gs.py + 18,
        pet.defId, SCALE.pet, manifest,
      );
      this.world.addChild(this.pet.root);
    }

    this.app.canvas.addEventListener('pointerdown', (e) => this.onTap(e));
    this.app.ticker.add(() => this.tick(this.app.ticker.deltaMS));
  }

  /**
   * 逐段加载 1440×900 原图。新契约 `art/maps/<region>_<n>.png`，
   * 依次探测 `_0.._15`，遇到缺号即停；全缺时回退旧单张命名 / 旧国风背景 / 占位底色。
   */
  private async loadMapArt(): Promise<void> {
    const scene = this.map.scene;
    const base = new URL(location.origin);
    for (let n = 0; n < 16; n++) {
      try {
        const tex = (await Assets.load(new URL(mapArtUrl(scene, n), base).href)) as Texture;
        if (!tex) break;
        this.segmentTextures.push(tex);
      } catch {
        break;
      }
    }
    if (this.segmentTextures.length === 0) {
      const legacy = WORLD_TILE_ART[scene];
      const candidates = [mapArtLegacyUrl(scene), ...(legacy ? [artUrl(legacy)] : [])];
      for (const rel of candidates) {
        try {
          this.segmentTextures.push((await Assets.load(new URL(rel, base).href)) as Texture);
          break;
        } catch { /* try next */ }
      }
    }
    if (this.segmentTextures.length === 0) {
      this.buildPlaceholder();
      return;
    }
    await this.loadForeground();
  }

  // ===== 等距构件地图：布局 → 世界坐标 → 视口裁剪 =====

  /** 读取 region 布局 JSON，按格建单元与碰撞；失败时回退旧单屏渲染 */
  private async loadIso(rel: string): Promise<void> {
    try {
      const res = await fetch(new URL(artUrl(rel), location.origin).href);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const layout = (await res.json()) as IsoLayout;
      if (!layout?.grid || !Array.isArray(layout.items)) throw new Error('布局结构不合法');
      // 沿街自动填房（rules.streetFill）在这里展开；手写条目优先级更高
      this.isoLayout = expandLayout(layout);
      this.isoCollision = buildCollision(this.isoLayout);
      this.buildIsoUnits();
      await this.loadIsoModules();
      if (this.destroyed) return;
      this.world.sortableChildren = true;
      // 旧存档可能停在构图范围外：就近吸附到可走格，避免开局卡死
      if (!this.canWalk(this.gs.px, this.gs.py)) {
        const p = this.nearestWalkable(this.gs.px, this.gs.py);
        this.gs.px = p.x;
        this.gs.py = p.y;
      }
    } catch {
      this.isoLayout = undefined;
      this.isoCollision = undefined;
    }
  }

  /** 预取模块 PNG（`art/iso/<type>[_<variant>][_<facing>].png`）；缺图保留程序化占位 */
  private async loadIsoModules(): Promise<void> {
    const keys = new Set<string>();
    for (const u of this.isoUnits.values()) keys.add(this.moduleKey(u.type, u.variant, u.facing));
    await Promise.all([...keys].map((k) => {
      const [type, variant, facing] = k.split('|');
      // 房屋走成套屋身图（含门脸变体）；其余构件：朝向 → sw → 无朝向旧图
      return this.loadIsoTexture(k, type === 'house'
        ? isoHouseCandidates(facing || undefined, variant || undefined)
        : isoModuleCandidates(type, variant || undefined, facing || undefined));
    }));

    // 房屋缺成套屋身时补取旧构件图（rules.roofLift 兜底路径才会用到）
    const missing = [...this.isoUnits.values()].filter(
      (u) => u.item.type === 'house' && !this.isoTextures.has(this.moduleKey(u.type, u.variant, u.facing)),
    );
    if (!missing.length) return;
    const pieceKeys = new Set<string>();
    for (const u of missing) {
      for (const p of housePieces(u.item, 0)) pieceKeys.add(this.moduleKey(p.type, undefined, p.facing));
    }
    await Promise.all([...pieceKeys].map((k) => {
      const [type, , facing] = k.split('|');
      return this.loadIsoTexture(k, isoModuleCandidates(type, undefined, facing || undefined));
    }));
  }

  /** 按候选顺序取第一张真图；Vite 的 SPA 回退会让缺图返回 200 的 index.html，必须校验 Content-Type */
  private async loadIsoTexture(key: string, candidates: string[]): Promise<void> {
    for (const cand of candidates) {
      const url = new URL(cand, location.origin).href;
      try {
        const res = await fetch(url, { method: 'HEAD' });
        const isImage = (res.headers.get('content-type') ?? '').startsWith('image/');
        if (!res.ok || !isImage) continue;
        const tex = (await Assets.load(url)) as Texture;
        if (this.destroyed) return;
        this.isoTextures.set(key, tex);
        return;
      } catch { /* 试下一张候选 */ }
    }
  }

  private moduleKey(type: string, variant?: string, facing?: string): string {
    return `${type}|${variant ?? ''}|${facing ?? ''}`;
  }

  /** 布局展开成可渲染单元：地面按 2×2 块铺，构件整条登记到足迹覆盖格 */
  private buildIsoUnits(): void {
    const layout = this.isoLayout;
    if (!layout) return;
    const g = layout.grid;
    this.isoUnits.clear();
    this.isoCellUnits.clear();

    const register = (u: IsoUnit): void => {
      this.isoUnits.set(u.key, u);
      const { w, h } = isoSize(u.item);
      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
          const k = keyOf(u.item.gx + dx, u.item.gy + dy);
          const arr = this.isoCellUnits.get(k);
          if (arr) arr.push(u.key);
          else this.isoCellUnits.set(k, [u.key]);
        }
      }
    };

    // 地面：真实贴图本身就是 2×2 格的菱形（128×64，可平铺），按 2×2 块铺贴，
    // 避免 1×1 拆分时整张图被重复贴 4 次。块类型取块内多数格；平票时街道压过草地。
    const groundCells = new Map<string, IsoItem>();
    for (const item of layout.items) {
      if (!isGroundType(item.type)) continue;
      const { w, h } = isoSize(item);
      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
          groundCells.set(keyOf(item.gx + dx, item.gy + dy), {
            type: item.type, variant: item.variant, gx: item.gx + dx, gy: item.gy + dy,
          });
        }
      }
    }
    const groundPriority: Record<string, number> = {
      ground_grass: 0, ground_dirt: 1, ground_water: 2, ground_stone: 3,
    };
    const blocks = new Map<string, IsoItem>();
    for (const cell of groundCells.values()) {
      const bx = Math.floor(cell.gx / 2) * 2;
      const by = Math.floor(cell.gy / 2) * 2;
      const tally = new Map<string, number>();
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const c = groundCells.get(keyOf(bx + dx, by + dy));
          if (c) tally.set(c.type, (tally.get(c.type) ?? 0) + 1);
        }
      }
      let best = cell.type;
      let bestScore = -1;
      for (const [t, n] of tally) {
        const score = n * 10 + (groundPriority[t] ?? 0);
        if (score > bestScore) { bestScore = score; best = t; }
      }
      blocks.set(keyOf(bx, by), { type: best, gx: bx, gy: by, w: 2, h: 2 });
    }
    // 草地先画、街道最后画：区块边缘多为奇数列/行，压过去更像真实街沿
    const ordered = [...blocks.entries()].sort(
      (a, b) => (groundPriority[a[1].type] ?? 0) - (groundPriority[b[1].type] ?? 0),
    );
    for (const [k, blk] of ordered) {
      const fv = frontVertex(g, blk);
      register({
        key: `g:${k}`, item: blk, type: blk.type, order: 0,
        dx: 0, dy: 0, x: fv.x, y: fv.y, z: -1000, ground: true, height: 0, halfW: 0,
      });
    }

    // 构件：整条占一个单元，锚点 = 足迹前底顶点，z = 锚点世界 y（与角色/宠物/NPC 同一套排序）
    // 房屋直接用美术成套屋身（1 张图 = 1 个节点，檐口/正脊标高已烘进图，不再抬升）。
    let index = 0;
    for (const item of layout.items) {
      if (isGroundType(item.type)) continue;
      const fv = frontVertex(g, item);
      const { w, h } = isoSize(item);
      register({
        key: `p:${index}`, item, type: item.type, variant: item.variant, facing: item.facing, order: 0,
        dx: 0, dy: 0, x: fv.x, y: fv.y, z: fv.y, ground: false,
        height: ISO_TYPES[item.type]?.height ?? 64,
        halfW: ((w + h) * g.tileW) / 4 + 32,
      });
      index++;
    }
  }

  /** 视口裁剪：只保留视口内（含 1 格余量）的地块与构件，随镜头移动增删 */
  private syncIso(force = false): void {
    const g = this.isoLayout?.grid;
    if (!g) return;
    if (!force && Math.abs(this.camX - this.isoSynced.x) < 12 && Math.abs(this.camY - this.isoSynced.y) < 12) return;
    this.isoSynced = { x: this.camX, y: this.camY };

    // 构件向上生长（最高约 120px），向外多留一段缓冲避免边缘瞬现
    const pad = 200;
    const vw = VIEW_W / this.viewScale;
    const vh = VIEW_H / this.viewScale;
    const box = cellRange(g, this.camX - pad, this.camY - pad, this.camX + vw + pad, this.camY + vh + pad);
    const c0 = Math.max(0, box.c0 - 1);
    const c1 = Math.min(g.cols - 1, box.c1 + 1);
    const r0 = Math.max(0, box.r0 - 1);
    const r1 = Math.min(g.rows - 1, box.r1 + 1);

    const needed = new Set<string>();
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const arr = this.isoCellUnits.get(keyOf(c, r));
        if (arr) for (const k of arr) needed.add(k);
      }
    }

    // 占位地面（缺贴图的地面类型）合批绘制：每类 1 个 Graphics，仍只画视口内的块
    this.rebuildGroundBatches(needed);

    const neededNodes = new Set<string>();
    for (const k of needed) {
      const unit = this.isoUnits.get(k);
      if (!unit || this.isBatchedGround(unit)) continue;
      neededNodes.add(k);
      if (this.isoVisible.has(k)) continue;
      const node = this.buildIsoVisual(unit);
      node.x = unit.x + unit.dx;
      node.y = unit.y + unit.dy;
      node.zIndex = unit.z;
      this.world.addChild(node);
      this.isoVisible.set(k, node);
    }
    for (const [k, node] of this.isoVisible) {
      if (!neededNodes.has(k)) { node.destroy({ children: true }); this.isoVisible.delete(k); }
    }
  }

  /** 缺贴图的地面单元走合批，不再逐个建节点 */
  private isBatchedGround(unit: IsoUnit): boolean {
    return unit.ground && !this.isoTextures.has(this.moduleKey(unit.type, unit.variant, unit.facing));
  }

  /** 按地面类型把视口内所有占位菱形画进同一张 Graphics（世界坐标，绘制在 -1000 层） */
  private rebuildGroundBatches(needed: Set<string>): void {
    for (const gfx of this.groundBatches) gfx.destroy();
    this.groundBatches = [];
    const g = this.isoLayout?.grid;
    if (!g) return;
    const palette: Record<string, number> = {
      ground_grass: 0x3c5a3c,
      ground_stone: 0x585461,
      ground_dirt: 0x695440,
      ground_water: 0x30586a,
    };
    const groups = new Map<string, number[][]>();
    for (const k of needed) {
      const unit = this.isoUnits.get(k);
      if (!unit || !this.isBatchedGround(unit)) continue;
      const poly = footprintPolygon(g, unit.item);
      const absolute: number[] = [];
      for (let i = 0; i < poly.length; i += 2) absolute.push(unit.x + poly[i], unit.y + poly[i + 1]);
      const arr = groups.get(unit.item.type);
      if (arr) arr.push(absolute);
      else groups.set(unit.item.type, [absolute]);
    }
    for (const [type, polys] of groups) {
      const gfx = new Graphics();
      for (const pts of polys) gfx.poly(pts).fill(palette[type] ?? 0x4a4450);
      gfx.zIndex = -1000;
      this.world.addChild(gfx);
      this.groundBatches.push(gfx);
    }
  }

  /**
   * 单个单元显示对象：模块 PNG 到位就直接贴（锚点 0.5,1.0，1:1 世界像素，不做缩放）。
   * 房屋是美术成套屋身，落地即贴合墙顶；缺图时才按旧构件逐件叠放兜底。
   */
  private buildIsoVisual(unit: IsoUnit): Container {
    const key = this.moduleKey(unit.type, unit.variant, unit.facing);
    const tex = this.isoTextures.get(key);
    if (tex) {
      // 城墙直段/角台已改为拼接版：长度方向两端不再描边（出血后裁回名义范围），
      // 相邻段直接贴合即可，无需再裁边或外扩压边。
      const sp = new Sprite(tex);
      sp.anchor.set(0.5, 1);
      // 非正方足迹（城墙 6×2 / 2×6、城门楼 4×3）的锚点在精灵内不在底边中点，按模块元数据回正
      const off = ISO_ANCHOR_OFFSET[unit.item.type];
      if (off) { sp.x = -off.ax; sp.y = -off.ay; }
      // 分坊瓦色/墙色：对整张精灵做乘法着色（不改原图）
      if (unit.item.tint !== undefined) sp.tint = unit.item.tint;
      // 城门楼与左右直墙衔接：图端头仍带一条深色描边，这里把精灵横向补 2px（左右各 1px）
      // 压住接缝。城墙直段本身不加裁边/外扩补丁。
      if (unit.item.type === 'city_gate_tower' && tex.width > 0) {
        sp.scale.x = (tex.width + 2) / tex.width;
      }
      return sp;
    }
    const node = unit.item.type === 'house'
      ? this.buildHouseFallback(unit)
      : unit.ground ? this.buildGroundPlaceholder(unit) : this.buildPropPlaceholder(unit);
    if (unit.item.tint !== undefined) node.tint = unit.item.tint;
    return node;
  }

  /**
   * 旧构件兜底：按美术合成位逐件叠放；布局 rules.roofLift 显式配置时才额外抬升
   * （默认 0 = 不抬，旧构件缺标高信息时才配 170 补缝）。
   */
  private buildHouseFallback(unit: IsoUnit): Container {
    const lift = this.isoLayout?.rules?.roofLift ?? 0;
    const c = new Container();
    let drawn = 0;
    for (const p of housePieces(unit.item, lift)) {
      const t = this.isoTextures.get(this.moduleKey(p.type, undefined, p.facing));
      if (!t) continue;
      const sp = new Sprite(t);
      sp.anchor.set(0.5, 1);
      sp.position.set(p.dx, p.dy);
      c.addChild(sp);
      drawn++;
    }
    return drawn ? c : this.buildPropPlaceholder(unit);
  }

  /** 地面占位：按足迹画完整菱形（2×2 块 = 128×64），无描边，相邻块严丝合缝不露底色 */
  private buildGroundPlaceholder(unit: IsoUnit): Container {
    const g = this.isoLayout!.grid;
    const palette: Record<string, number> = {
      ground_grass: 0x3c5a3c,
      ground_stone: 0x585461,
      ground_dirt: 0x695440,
      ground_water: 0x30586a,
    };
    const fill = palette[unit.item.type] ?? 0x4a4450;
    const gfx = new Graphics();
    gfx.poly(footprintPolygon(g, unit.item)).fill(fill);
    const c = new Container();
    c.addChild(gfx);
    return c;
  }

  /** 构件占位：足迹阴影 + 按类型画简易立面（模块 PNG 一落地即自动替换） */
  private buildPropPlaceholder(unit: IsoUnit): Container {
    const g = this.isoLayout!.grid;
    const base = footprintPolygon(g, unit.item);
    const H = ISO_TYPES[unit.item.type]?.height ?? 64;
    const c = new Container();
    const shadow = new Graphics();
    shadow.poly(base).fill({ color: 0x0a0a10, alpha: 0.22 });
    c.addChild(shadow);
    if (unit.item.type === 'tree') this.drawTree(c, H, unit.variant);
    else if (unit.item.type === 'stall') this.drawStall(c, base, H, unit.variant);
    else if (unit.item.type === 'well') this.drawWell(c, H);
    else if (unit.item.type === 'bridge') this.drawBridge(c, base);
    else if (unit.item.type === 'incense') this.drawIncense(c, H);
    else if (unit.item.type === 'rock') this.drawRock(c, H);
    else if (unit.item.type === 'city_wall' || unit.item.type === 'wall_corner') this.drawWall(c, base, H, unit.item);
    else if (unit.item.type === 'bell_tower') this.drawBellTower(c, base, H);
    else if (unit.item.type === 'crate') this.drawCrate(c, H);
    else if (unit.item.type === 'stele') this.drawStele(c, H);
    else if (unit.item.type === 'hall') this.drawHall(c, base, H);
    else {
      // 既无模块图、又无专画的类型：绝不生成任何可见体块（旧版这里的通用方盒
      // 就是"朱褐墙 + 朱红平顶、无瓦顶"裸体块的来源）。只留一块极淡落点标记，
      // 便于截图时定位缺图位置，正常游玩几乎看不见。
      shadow.alpha = 0.06;
      return c;
    }
    return c;
  }

  /** 水井占位：石砌井圈 + 井水 */
  private drawWell(c: Container, H: number): void {
    const gfx = new Graphics();
    gfx.rect(-22, -H, 44, H).fill(0x76727d).stroke({ width: 1, color: 0x1c1a20, alpha: 0.8 });
    gfx.ellipse(0, -H, 22, 9).fill(0x30586a).stroke({ width: 1, color: 0x1c1a20, alpha: 0.9 });
    gfx.ellipse(0, -H * 0.55, 26, 10).fill(0x8a8694).stroke({ width: 1, color: 0x1c1a20, alpha: 0.7 });
    c.addChild(gfx);
  }

  /** 石桥占位：石桥面 + 两侧栏板（桥面格可走，见 iso.buildCollision） */
  private drawBridge(c: Container, base: number[]): void {
    const [bx, by, rx, ry, fx, fy, lx, ly] = base;
    const gfx = new Graphics();
    // 桥面：足迹整体抬高 14px，模拟水面以上的一层石台
    gfx.poly([bx, by - 14, rx, ry - 14, fx, fy - 14, lx, ly - 14]).fill(0x8a8694)
      .stroke({ width: 1, color: 0x1c1a20, alpha: 0.8 });
    // 左右栏板（沿桥向的两条）
    gfx.poly([lx, ly - 14, fx, fy - 14, fx, fy - 44, lx, ly - 44]).fill(0x76727d)
      .stroke({ width: 1, color: 0x1c1a20, alpha: 0.7 });
    gfx.poly([rx, ry - 14, fx, fy - 14, fx, fy - 44, rx, ry - 44]).fill(0x5a5661)
      .stroke({ width: 1, color: 0x1c1a20, alpha: 0.7 });
    c.addChild(gfx);
  }

  /** 香炉占位：青铜鼎 + 顶烟 */
  private drawIncense(c: Container, H: number): void {
    const gfx = new Graphics();
    gfx.roundRect(-18, -H * 0.62, 36, H * 0.62, 6).fill(0x6a5a3a)
      .stroke({ width: 1, color: 0x2a2418, alpha: 0.85 });
    gfx.roundRect(-22, -H * 0.78, 44, 16, 5).fill(0x8a7444)
      .stroke({ width: 1, color: 0x2a2418, alpha: 0.85 });
    gfx.moveTo(-6, -H * 0.82).quadraticCurveTo(-14, -H * 1.02, 0, -H * 1.08)
      .quadraticCurveTo(14, -H * 1.12, 8, -H * 0.86).stroke({ width: 3, color: 0xb9b3a6, alpha: 0.55 });
    c.addChild(gfx);
  }

  /** 山石占位：灰色不规则叠石 */
  private drawRock(c: Container, H: number): void {
    const gfx = new Graphics();
    gfx.poly([-20, 0, -12, -H * 0.75, 2, -H, 16, -H * 0.62, 20, 0])
      .fill(0x7a7680).stroke({ width: 1, color: 0x1c1a20, alpha: 0.8 });
    gfx.poly([-8, -H * 0.3, -2, -H * 0.78, 10, -H * 0.42]).fill(0x928e99)
      .stroke({ width: 1, color: 0x1c1a20, alpha: 0.4 });
    c.addChild(gfx);
  }

  /**
   * 城墙占位：石砌墙身 + 沿四条顶边重复的垛口。
   * 直段可用 w/h 拉长（例如 8×2、103×2），转角用 wall_corner 并在顶上加一座角楼。
   */
  private drawWall(c: Container, base: number[], H: number, item: IsoItem): void {
    const [bx, by, rx, ry, , , lx, ly] = base;
    const gfx = new Graphics();
    const edge = 0x2b2822;
    gfx.poly([lx, ly, 0, 0, 0, -H, lx, ly - H]).fill(0x8b8579).stroke({ width: 1, color: edge, alpha: 0.8 });
    gfx.poly([rx, ry, 0, 0, 0, -H, rx, ry - H]).fill(0x6e685d).stroke({ width: 1, color: edge, alpha: 0.8 });
    gfx.poly([bx, by - H, rx, ry - H, 0, -H, lx, ly - H]).fill(0x9c968a).stroke({ width: 1, color: edge, alpha: 0.9 });

    // 垛口：沿顶面四条边按屏幕长度均分，短边也有 2 个，长长一段读出齿状轮廓
    const edges: Array<[number, number, number, number]> = [
      [bx, by, rx, ry], [rx, ry, 0, 0], [0, 0, lx, ly], [lx, ly, bx, by],
    ];
    for (const [x0, y0, x1, y1] of edges) {
      const len = Math.hypot(x1 - x0, y1 - y0);
      const n = Math.max(3, Math.round(len / 24));
      for (let i = 1; i < n; i++) {
        const t = i / n;
        const px = x0 + (x1 - x0) * t;
        const py = y0 + (y1 - y0) * t - H;
        gfx.rect(px - 3, py - 8, 6, 8).fill(0xa8a295).stroke({ width: 1, color: edge, alpha: 0.7 });
      }
    }

    if (item.type === 'wall_corner') {
      // 转角加一座方形角楼，俯瞰时四角有明确收口
      const th = H + 26;
      gfx.poly([lx * 0.55, ly * 0.55, 0, 0, 0, -th, lx * 0.55, ly * 0.55 - th]).fill(0x7d776c);
      gfx.poly([rx * 0.55, ry * 0.55, 0, 0, 0, -th, rx * 0.55, ry * 0.55 - th]).fill(0x635d54);
      gfx.poly([0, -th - 6, 30, -th + 8, 0, -th + 20, -30, -th + 8]).fill(0x4b6a7c).stroke({ width: 1, color: edge });
    }
    c.addChild(gfx);
  }

  /** 中心鼓楼占位：高台 + 三层重檐 + 攒尖顶（全城制高点，H≈300） */
  private drawBellTower(c: Container, base: number[], H: number): void {
    const gfx = new Graphics();
    const edge = 0x1c1a20;
    const [bx, by, rx, ry, , , lx, ly] = base;
    // 台基 0~0.30H；三层楼身逐层收分，三层重檐，宝顶为全城最高点（H≈460，高于城门楼 406）
    const baseH = H * 0.30;
    const sc = (k: number) => [bx * k, by * k, rx * k, ry * k, 0, 0, lx * k, ly * k];
    const wall = (b: number[], yBot: number, yTop: number, cL: number, cR: number, cT: number) => {
      const slx = b[6], sly = b[7], srx = b[2], sry = b[3], sbx = b[0], sby = b[1];
      gfx.poly([slx, sly + yBot, 0, yBot, 0, yTop, slx, sly + yTop]).fill(cL).stroke({ width: 1, color: edge, alpha: 0.85 });
      gfx.poly([0, yBot, srx, sry + yBot, srx, sry + yTop, 0, yTop]).fill(cR).stroke({ width: 1, color: edge, alpha: 0.85 });
      gfx.poly([sbx, sby + yTop, srx, sry + yTop, 0, yTop, slx, sly + yTop]).fill(cT).stroke({ width: 1, color: edge, alpha: 0.9 });
    };
    // 台基（砖石）+ 两道券门（券洞格在 buildCollision 里放行，可穿楼而过）
    wall(sc(1), 0, -baseH, 0x9a9186, 0x7d746a, 0x8f877c);
    for (const [ax, ay] of [[lx, ly], [rx, ry]] as Array<[number, number]>) {
      gfx.poly([ax * 0.3, ay * 0.3, ax * 0.62, ay * 0.62, ax * 0.62, ay * 0.62 - baseH * 0.8, ax * 0.3, ay * 0.3 - baseH * 0.8])
        .fill(0x2a211c).stroke({ width: 1, color: edge, alpha: 0.8 });
    }
    // 三层楼身（朱红墙 + 窗棂），逐层收分
    const tiers = [
      { k: 0.84, yb: 0, yt: -baseH - H * 0.20 },
      { k: 0.66, yb: -baseH - H * 0.20, yt: -baseH - H * 0.40 },
      { k: 0.48, yb: -baseH - H * 0.40, yt: -baseH - H * 0.54 },
    ];
    for (const t of tiers) {
      wall(sc(t.k), t.yb, t.yt, 0xb0442f, 0x8f3527, 0xa63d2f);
      for (const [ax, ay] of [[lx * t.k, ly * t.k], [rx * t.k, ry * t.k]] as Array<[number, number]>) {
        for (const u of [0.14, 0.44, 0.74]) {
          gfx.poly([ax * u, ay * u + t.yb + 10, ax * (u + 0.14), ay * (u + 0.14) + t.yb + 10,
            ax * (u + 0.14), ay * (u + 0.14) + t.yt + 10, ax * u, ay * u + t.yt + 10])
            .fill(0x30241b).stroke({ width: 1, color: edge, alpha: 0.7 });
        }
      }
    }
    // 三层重檐：逐层收小，最上层为攒尖顶
    const roof1 = -baseH - H * 0.20;
    const roof2 = -baseH - H * 0.40;
    const roof3 = -baseH - H * 0.54;
    this.drawHipRoof(gfx, sc(0.96), roof1, H * 0.12, 0x2a4152, 0x33495c, 0x44607a, 0x57708a);
    this.drawHipRoof(gfx, sc(0.78), roof2, H * 0.10, 0x2a4152, 0x33495c, 0x44607a, 0x57708a);
    this.drawHipRoof(gfx, sc(0.54), roof3, H * 0.12, 0x2a4152, 0x33495c, 0x44607a, 0x6a8399);
    // 宝顶：全城最高点
    gfx.rect(-5, roof3 - H * 0.12 - 26, 10, 26).fill(0xc69a3c).stroke({ width: 1, color: edge, alpha: 0.8 });
    c.addChild(gfx);
  }

  /** 货箱占位：木箱 + 绳箍 */
  private drawCrate(c: Container, H: number): void {
    const gfx = new Graphics();
    gfx.rect(-11, -H, 22, H).fill(0x8a6440).stroke({ width: 1, color: 0x3a2a20, alpha: 0.9 });
    gfx.rect(-11, -H * 0.6, 22, 4).fill(0x63432a);
    gfx.moveTo(-11, -H * 0.35).lineTo(11, -H * 0.35).stroke({ width: 2, color: 0xb8892f, alpha: 0.8 });
    c.addChild(gfx);
  }

  /** 石碑占位：碑座 + 碑身 + 碑首 */
  private drawStele(c: Container, H: number): void {
    const gfx = new Graphics();
    gfx.rect(-14, -10, 28, 10).fill(0x76727d).stroke({ width: 1, color: 0x1c1a20, alpha: 0.8 });
    gfx.rect(-10, -H, 20, H - 10).fill(0x9a96a0).stroke({ width: 1, color: 0x1c1a20, alpha: 0.8 });
    gfx.poly([-10, -H, 0, -H - 10, 10, -H]).fill(0x8a8694).stroke({ width: 1, color: 0x1c1a20, alpha: 0.8 });
    c.addChild(gfx);
  }

  /**
   * 四坡瓦顶：外挑檐口 + 上收屋脊。
   * 大殿 / 楼阁这类大体量占位若只有平顶会读成木箱，加一圈檐口与坡面后轮廓才成立。
   */
  private drawHipRoof(
    gfx: Graphics, base: number[], topY: number, rise: number,
    eaveColor: number, slopeL: number, slopeR: number, capColor: number,
  ): void {
    const [bx, by, rx, ry, , , lx, ly] = base;
    const cx = (bx + rx + lx) / 4;
    const cy = (by + ry + ly) / 4;
    const sc = (v: number, c: number, k: number, dy: number) => c + (v - c) * k + dy;
    const eB = [sc(bx, cx, 1.16, 0), sc(by, cy, 1.16, topY + 12)];
    const eR = [sc(rx, cx, 1.16, 0), sc(ry, cy, 1.16, topY + 12)];
    const eF = [sc(0, cx, 1.16, 0), sc(0, cy, 1.16, topY + 12)];
    const eL = [sc(lx, cx, 1.16, 0), sc(ly, cy, 1.16, topY + 12)];
    const tB = [sc(bx, cx, 0.32, 0), sc(by, cy, 0.32, topY - rise)];
    const tR = [sc(rx, cx, 0.32, 0), sc(ry, cy, 0.32, topY - rise)];
    const tF = [sc(0, cx, 0.32, 0), sc(0, cy, 0.32, topY - rise)];
    const tL = [sc(lx, cx, 0.32, 0), sc(ly, cy, 0.32, topY - rise)];
    const flat = (p: number[][]) => p.flat();
    const edge = 0x1c1a20;
    // 檐口（向下压暗一层，读作瓦当投影）
    gfx.poly(flat([eB, eR, eF, eL])).fill(eaveColor).stroke({ width: 1, color: edge, alpha: 0.85 });
    // 两个可见坡面（左前 / 右前）用不同明度，否则读成一块平瓦
    gfx.poly(flat([eL, eF, tF, tL])).fill(slopeL).stroke({ width: 1, color: edge, alpha: 0.75 });
    gfx.poly(flat([eF, eR, tR, tF])).fill(slopeR).stroke({ width: 1, color: edge, alpha: 0.75 });
    // 瓦垄：两坡各画两道与檐口平行的细线
    for (const f of [0.34, 0.66]) {
      for (const [a, b, c2, d] of [[eL, eF, tL, tF], [eF, eR, tF, tR]] as number[][][]) {
        gfx.moveTo(a[0] + (c2[0] - a[0]) * f, a[1] + (c2[1] - a[1]) * f)
          .lineTo(b[0] + (d[0] - b[0]) * f, b[1] + (d[1] - b[1]) * f)
          .stroke({ width: 1, color: 0x14141a, alpha: 0.28 });
      }
    }
    // 屋脊压顶
    gfx.poly(flat([tB, tR, tF, tL])).fill(capColor).stroke({ width: 1, color: edge, alpha: 0.9 });
    gfx.moveTo(tL[0], tL[1]).lineTo(tF[0], tF[1]).stroke({ width: 2, color: capColor, alpha: 0.9 });
  }

  /**
   * 墙面上的一块矩形（窗/门/腰线）：沿墙脚方向 a 取 [t0,t1]，由地面向上取 [s0,s1]。
   * 占位盒只有两块倾斜墙面，不加窗棂会读成木箱。
   */
  private wallPanel(
    gfx: Graphics, ax: number, ay: number, H: number,
    t0: number, t1: number, s0: number, s1: number, fill: number, edge: number,
  ): void {
    gfx.poly([
      ax * t0, ay * t0 - H * s1,
      ax * t1, ay * t1 - H * s1,
      ax * t1, ay * t1 - H * s0,
      ax * t0, ay * t0 - H * s0,
    ]).fill(fill).stroke({ width: 1, color: edge, alpha: 0.75 });
  }

  /**
   * 墙面上的一组窗洞：沿墙脚方向 a 依次排开，纵向取 [s0,s1]。
   * 占位盒只有两块倾斜墙面，不加窗棂会读成木箱。
   */
  private drawWallPanelSet(
    gfx: Graphics, ax: number, ay: number, H: number,
    spans: Array<[number, number]>, s0: number, s1: number, fill: number,
  ): void {
    for (const [t0, t1] of spans) this.wallPanel(gfx, ax, ay, H, t0, t1, s0, s1, fill, 0x1c1a20);
  }

  /** 大殿占位：左墙 + 右墙 + 顶面 + 石台基 + 重檐；唯一保留的挤出体占位 */
  private drawHall(c: Container, base: number[], H: number): void {
    const [bx, by, rx, ry, , , lx, ly] = base;
    const wallL = 0xcbb489;
    const wallR = 0x9a855f;
    const roof = 0x3d566b;
    const edge = 0x1c1a20;

    const gfx = new Graphics();
    // 左墙：足迹左角 → 前角，向上挤出面
    gfx.poly([lx, ly, 0, 0, 0, -H, lx, ly - H]).fill(wallL).stroke({ width: 1, color: edge, alpha: 0.7 });
    // 右墙
    gfx.poly([rx, ry, 0, 0, 0, -H, rx, ry - H]).fill(wallR).stroke({ width: 1, color: edge, alpha: 0.7 });
    // 顶面
    gfx.poly([bx, by - H, rx, ry - H, 0, -H, lx, ly - H]).fill(roof).stroke({ width: 1, color: edge, alpha: 0.8 });

    // 大殿：石台基 + 重檐四坡顶 + 左面门洞 + 右面长窗，避免大体量占位读成木箱
      const plinth = H * 0.12;
      gfx.poly([lx, ly, 0, 0, 0, -plinth, lx, ly - plinth]).fill(0x8d8994).stroke({ width: 1, color: edge, alpha: 0.6 });
      gfx.poly([rx, ry, 0, 0, 0, -plinth, rx, ry - plinth]).fill(0x6c6873).stroke({ width: 1, color: edge, alpha: 0.6 });
      // 重檐：下檐一圈腰檐，上檐再收
      this.drawHipRoof(gfx, base, -H, H * 0.2, 0x2a4152, 0x33495c, 0x44607a, 0x57708a);
      this.drawHipRoof(gfx, base, -H * 1.16, H * 0.2, 0x2a4152, 0x3a5268, 0x4c6a86, 0x60799a);
      this.drawWallPanelSet(gfx, rx, ry, H, [[0.14, 0.4], [0.56, 0.82]], 0.24, 0.6, 0x241d18);
      gfx.poly([lx * 0.62, ly * 0.62, 0, 0, 0, -H * 0.9, lx * 0.62, ly * 0.62 - H * 0.9])
        .fill(0x1b1a1f).stroke({ width: 1, color: edge, alpha: 0.6 });
    c.addChild(gfx);
  }

  /** 树占位：树干 + 分层树冠（pine 尖冠 / leaf 圆冠） */
  private drawTree(c: Container, H: number, variant?: string): void {
    const gfx = new Graphics();
    gfx.roundRect(-4, -H * 0.34, 8, H * 0.34, 3).fill(0x4a3324);
    if (variant === 'leaf') {
      gfx.ellipse(-12, -H * 0.52, 20, 18).fill(0x4a6a3c).stroke({ width: 1, color: 0x2b4227, alpha: 0.8 });
      gfx.ellipse(12, -H * 0.56, 20, 18).fill(0x3f5f35).stroke({ width: 1, color: 0x2b4227, alpha: 0.8 });
      gfx.ellipse(0, -H * 0.76, 22, 20).fill(0x50733f).stroke({ width: 1, color: 0x2b4227, alpha: 0.8 });
    } else {
      for (const [cy, r] of [[-H * 0.36, 26], [-H * 0.58, 22], [-H * 0.8, 16]] as Array<[number, number]>) {
        gfx.poly([-r, cy, r, cy, 0, cy - r * 1.25]).fill(0x35573c).stroke({ width: 1, color: 0x233a28, alpha: 0.85 });
      }
    }
    c.addChild(gfx);
  }

  /** 摊位占位：矮柜台 + 双色顶棚 */
  private drawStall(c: Container, base: number[], H: number, variant?: string): void {
    const [bx, by, rx, ry, , , lx, ly] = base;
    const gfx = new Graphics();
    gfx.poly([lx, ly, 0, 0, 0, -H * 0.6, lx, ly - H * 0.6]).fill(0x8a6440).stroke({ width: 1, color: 0x3a2a20, alpha: 0.7 });
    gfx.poly([rx, ry, 0, 0, 0, -H * 0.6, rx, ry - H * 0.6]).fill(0x63432a).stroke({ width: 1, color: 0x3a2a20, alpha: 0.7 });
    const roof = variant === 'fruit' ? 0xb8892f : 0xa63d2f;
    gfx.poly([bx, by - H, rx, ry - H, 0, -H, lx, ly - H]).fill(roof).stroke({ width: 1, color: 0x2a1c14, alpha: 0.85 });
    c.addChild(gfx);
  }

  /** 可走判定 = 地图 bounds/地平线（兜底）∩ 布局地面与构件足迹 */
  private canWalk(x: number, y: number): boolean {
    if (!isWalkable(this.map, x, y)) return false;
    const g = this.isoLayout?.grid;
    if (!g || !this.isoCollision) return true;
    return isoWalkable(this.isoCollision, g, x, y);
  }

  /** 就近代入可走格（旧存档落在构图范围外时用） */
  private nearestWalkable(x: number, y: number): { x: number; y: number } {
    const g = this.isoLayout?.grid;
    if (!g || !this.isoCollision) return { x, y };
    let best = { x, y };
    let bestD = Infinity;
    for (let gy = 0; gy < g.rows; gy++) {
      for (let gx = 0; gx < g.cols; gx++) {
        const w = cellToWorld(g, gx, gy);
        if (!isoWalkable(this.isoCollision, g, w.x, w.y)) continue;
        const d = (w.x - x) ** 2 + (w.y - y) ** 2;
        if (d < bestD) { bestD = d; best = w; }
      }
    }
    return best;
  }

  /** 视口宽高（世界坐标）；viewScale < 1 时可看到更大范围（DEV 俯瞰用） */
  private get viewW(): number { return VIEW_W / this.viewScale; }
  private get viewH(): number { return VIEW_H / this.viewScale; }

  /** 视口一开始就居中到玩家，避免首帧只加载 0,0 附近的块 */
  private centerCamera(): void {
    const vw = this.viewW;
    const vh = this.viewH;
    const fx = this.viewFocus?.x ?? this.gs.px;
    const fy = this.viewFocus?.y ?? this.gs.py;
    this.camX = Math.max(0, Math.min(Math.max(0, this.map.w - vw), fx - vw / 2));
    this.camY = Math.max(0, Math.min(Math.max(0, this.map.h - vh), fy - vh / 2));
    this.world.x = -this.camX * this.viewScale;
    this.world.y = -this.camY * this.viewScale;
  }

  /**
   * 逐段索引拼接：第 c 列取 `art/maps/<region>_<n>.png`（n 按已加载段数循环）。
   * 1440×900 原生图直接 1:1 贴上，不裁切、不放大、不镜像；缺图时退回占位底色。
   */
  private syncTiles(): void {
    const maxCol = Math.ceil(this.map.w / TILE_W) - 1;
    const c0 = Math.max(0, Math.floor(this.camX / TILE_W));
    const c1 = Math.min(maxCol, Math.floor((this.camX + VIEW_W) / TILE_W));
    const needed = new Set<number>();
    for (let c = c0; c <= c1; c++) {
      needed.add(c);
      let sprite = this.tileSprites.get(c);
      if (!sprite) {
        const tex = this.segmentTextures[c % this.segmentTextures.length];
        sprite = new Sprite(tex);
        // 新契约下 tex 就是 1440×900，scale 恒为 1；保留比例适配只为容错
        sprite.scale.set(TILE_W / tex.width, TILE_H / tex.height);
        sprite.x = c * TILE_W;
        sprite.y = 0;
        sprite.zIndex = -1000; // 永远压在最底层，不与角色/前景抢排序
        this.tileLayer.addChild(sprite);
        this.tileSprites.set(c, sprite);
      }
    }
    for (const [c, sprite] of this.tileSprites) {
      if (!needed.has(c)) { sprite.destroy(); this.tileSprites.delete(c); }
    }
    this.syncForeground(c0, c1);
  }

  /** 加载 `art/foreground/<region>_<n>.json` 物件清单（文件缺失时静默跳过） */
  private async loadForeground(): Promise<void> {
    const count = this.segmentTextures.length;
    if (count === 0) return;
    for (let n = 0; n < count; n++) {
      try {
        const res = await fetch(new URL(foregroundJsonUrl(this.map.scene, n), location.origin).href);
        if (!res.ok) continue;
        const data = (await res.json()) as ForegroundJson;
        const list = Array.isArray(data) ? data : (data.objects ?? data.items ?? []);
        for (const o of list) {
          const file = o.file ?? o.image ?? o.src;
          if (!file || typeof o.x !== 'number' || typeof o.y !== 'number') continue;
          this.fgDefs.push({ seg: n, file, x: o.x, y: o.y, scale: o.scale ?? 1, occludes: o.occludes !== false });
        }
      } catch { /* 该段没有前景层 */ }
    }
    const urls = [...new Set(this.fgDefs.map((d) => foregroundImageUrl(d.file)))];
    await Promise.all(urls.map(async (u) => { try { await Assets.load(u); } catch { /* 缺图忽略 */ } }));
  }

  /** 前景物件按底边 y 与角色同层排序：角色站在物件后面时会被遮挡，走到前面则挡住物件 */
  private syncForeground(c0: number, c1: number): void {
    if (this.fgDefs.length === 0) return;
    const count = Math.max(1, this.segmentTextures.length);
    const needed = new Set<string>();
    for (let c = c0; c <= c1; c++) {
      const seg = c % count;
      this.fgDefs.forEach((def, i) => {
        if (def.seg !== seg) return;
        const key = `${c}:${i}`;
        needed.add(key);
        let sp = this.fgSprites.get(key);
        if (!sp) {
          const tex = Assets.get(foregroundImageUrl(def.file)) as Texture | undefined;
          if (!tex) return;
          sp = new Sprite(tex);
          sp.anchor.set(0.5, 1); // 以底边为排序基准
          sp.scale.set(def.scale);
          sp.x = c * TILE_W + def.x;
          sp.y = def.y;
          // occludes:true → 与角色同层按底边 y 排序，角色在其后会被遮住；
          // occludes:false → 视作背景道具，永远压在角色下面（但高于地图）
          sp.zIndex = def.occludes ? def.y : -900;
          this.world.addChild(sp);
          this.fgSprites.set(key, sp);
        }
      });
    }
    for (const [k, sp] of this.fgSprites) {
      if (!needed.has(k)) { sp.destroy(); this.fgSprites.delete(k); }
    }
  }

  /** 地图素材未到位（如地府）：画一块占位背景，保证流程可走通 */
  private buildPlaceholder(): void {
    const c = new Container();
    c.zIndex = -1000;
    const g = new Graphics();
    g.rect(0, 0, TILE_W, TILE_H).fill(0x141019);
    g.rect(0, 600, TILE_W, 300).fill(0x231826);
    g.rect(0, 700, TILE_W, 54).fill({ color: 0x213040, alpha: 0.9 });
    g.rect(0, 866, TILE_W, 34).fill(0x2c2330);
    const t = new Text({
      text: `${this.map.name}\n（地图素材待补，流程占位）`,
      style: {
        fontFamily: 'Microsoft YaHei, sans-serif', fontSize: 22, align: 'center',
        fill: 0x9d8fa8, stroke: { color: 0x120e16, width: 3 }, lineHeight: 34,
      },
    });
    t.anchor.set(0.5);
    t.x = TILE_W / 2;
    t.y = 330;
    c.addChild(g, t);
    this.world.addChild(c);
  }

  private buildActor(x: number, y: number, defId: string, scale: number, manifest: Manifest): Actor {
    const cm = manifest[defId];
    const frames: Record<string, Texture[]> = {};
    if (cm) {
      for (const [name, def] of Object.entries(cm.anims)) {
        frames[name] = def.frames
          .map((f) => Assets.get(new URL(`/assets/${f}`, location.origin).href) as Texture | undefined)
          .filter((t): t is Texture => !!t);
      }
    }
    const idle = frames.idle ?? [];
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
    // 接触阴影随角色显示档位缩放（基准 0.75 档 = 30×9）
    const sh = scale / 0.75;
    const shadow = new Graphics();
    shadow.ellipse(0, -2, 30 * sh, 9 * sh).fill({ color: 0x0a0a10, alpha: 0.28 });
    root.addChild(shadow, sprite);
    const actor: Actor = {
      root, sprite, baseScale: scale, anims: cm?.anims, frames,
      animName: idle.length > 0 ? 'idle' : undefined,
    };
    return actor;
  }

  private playAnim(a: Actor, name: 'idle' | 'walk'): void {
    if (a.animName === name) return;
    const def = a.anims?.[name];
    const frames = a.frames?.[name];
    if (!def || !frames || frames.length === 0) return;
    a.sprite.textures = frames;
    a.sprite.animationSpeed = def.fps / 60;
    a.sprite.loop = true;
    a.sprite.gotoAndPlay(0);
    a.animName = name;
  }

  /**
   * 遮挡处理：角色走到高构件（房屋/树/城门/鼓楼）后侧时，把该构件平滑淡出，
   * 让走在街面上的人物不被屋顶或树冠完全盖住；离开后恢复不透明。
   */
  private updateOccluders(dt: number): void {
    const p = this.player?.root;
    if (!p) return;
    const step = Math.min(1, dt * 8);
    for (const [key, node] of this.isoVisible) {
      const unit = this.isoUnits.get(key);
      if (!unit || unit.ground) continue;
      const covered = unit.height > 120
        && p.y < unit.z && p.y > unit.z - unit.height
        && Math.abs(p.x - unit.x) < unit.halfW;
      const target = covered ? 0.4 : 1;
      if (Math.abs(node.alpha - target) < 0.01) node.alpha = target;
      else node.alpha += (target - node.alpha) * step;
    }
  }

  /**
   * 等距地图：格级 BFS 绕开建筑/水/树，沿街与券门通道前进，折线再拉直；
   * 旧单屏地图：仍用单段直线 + 边界钳制。
   */
  private setPathTo(x: number, y: number): void {
    const g = this.isoLayout?.grid;
    const col = this.isoCollision;
    if (g && col) {
      const rawFrom = cellAt(g, this.player.root.x, this.player.root.y);
      const rawTo = cellAt(g, x, y);
      // 起点若因贴边/旧存档落在障碍格里，先就近找一个可走格，保证仍能走出去
      const fromCell = nearestWalkableCell(col, g, rawFrom.gx, rawFrom.gy) ?? rawFrom;
      const toCell = nearestWalkableCell(col, g, rawTo.gx, rawTo.gy);
      if (toCell) {
        const cells = findIsoPath(col, g, fromCell, toCell);
        if (cells) {
          const pts: Point[] = simplifyIsoPath(col, g, cells)
            .map((c) => cellToWorld(g, c.gx, c.gy));
          const targetWalkable = isoWalkable(col, g, x, y);
          if (pts.length === 0) {
            // 目标与脚下同格：能走就直接走到点击的精确位置，点在障碍上则原地停下
            this.path = [];
            this.targetX = targetWalkable ? x : this.player.root.x;
            this.targetY = targetWalkable ? y : this.player.root.y;
            return;
          }
          // 点击点本身可走时，最后一个 waypoint 落到精确落点，避免总停在格中心
          const last = pts[pts.length - 1];
          if (targetWalkable && isoLineWalkable(col, g, last.x, last.y, x, y)) pts.push({ x, y });
          this.path = pts;
          const first = this.path.shift();
          if (first) { this.targetX = first.x; this.targetY = first.y; }
          return;
        }
      }
    }
    const plan = planPath(this.getPlayerPos(), { x, y }, this.map.bounds);
    this.path = plan.waypoints.slice();
    const first = this.path.shift();
    if (first) {
      this.targetX = first.x;
      this.targetY = first.y;
    }
  }

  /** 挂机系统与调试句柄共用的自动移动入口 */
  moveTo(x: number, y: number): void {
    if (this.engaged) return;
    this.setPathTo(x, y);
  }

  private onTap(e: PointerEvent): void {
    if (!this.inputEnabled || this.engaged) return;
    const canvas = this.app.canvas;
    const rect = canvas.getBoundingClientRect();
    const sx = ((e.clientX - rect.left) / rect.width) * VIEW_W;
    const sy = ((e.clientY - rect.top) / rect.height) * VIEW_H;
    const wx = sx / this.viewScale + this.camX;
    const wy = sy / this.viewScale + this.camY;

    // 点在路牌/怪物/NPC 附近时吸附走到目标点（点路牌=走进出口）
    for (const ex of this.map.exits) {
      if (Math.hypot(ex.x - wx, ex.y - wy) < 110 * CHAR_RANGE) { this.setPathTo(ex.x, ex.y); return; }
    }
    if (this.npc && Math.hypot(this.npc.root.x - wx, this.npc.root.y - wy) < 90 * CHAR_RANGE) {
      this.setPathTo(this.npc.root.x, this.npc.root.y); return;
    }
    if (this.tavern && Math.hypot(this.tavern.root.x - wx, this.tavern.root.y - wy) < 90 * CHAR_RANGE) {
      this.setPathTo(this.tavern.root.x, this.tavern.root.y); return;
    }
    for (const [, m] of this.monsters) {
      if (Math.hypot(m.root.x - wx, m.root.y - wy) < 90 * CHAR_RANGE) {
        this.setPathTo(m.root.x, m.root.y); return;
      }
    }
    this.setPathTo(wx, wy);
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
      const nx = px + (dx / dist) * step;
      const ny = py + (dy / dist) * step;
      // 分轴滑步：先 x 后 y，任一轴被建筑/地图边界挡住时仍可沿另一轴滑动
      let moved = false;
      if (this.canWalk(nx, py)) { this.player.root.x = nx; moved = true; }
      if (this.canWalk(this.player.root.x, ny)) { this.player.root.y = ny; moved = true; }
      if (!moved) {
        // 前方不可走：清空路径原地待命，避免对着墙持续抖动
        this.path = [];
        this.targetX = px;
        this.targetY = py;
        this.playAnim(this.player, 'idle');
      } else {
        this.playAnim(this.player, 'walk');
        if (Math.abs(dx) > 2) this.player.sprite.scale.x = Math.abs(this.player.baseScale) * (dx < 0 ? -1 : 1);
      }
    } else {
      this.playAnim(this.player, 'idle');
      this.player.sprite.scale.x = Math.abs(this.player.sprite.scale.x);
      const next = this.path.shift();
      if (next) { this.targetX = next.x; this.targetY = next.y; }
    }
    this.player.root.zIndex = this.player.root.y;

    // —— 宠物跟随 ——
    if (this.pet) {
      const p = this.pet;
      const tx = this.player.root.x - 84;
      const ty = this.player.root.y + 18;
      const pdx = tx - p.root.x;
      const pdy = ty - p.root.y;
      const pd = Math.hypot(pdx, pdy);
      if (pd > 6) {
        const step = Math.min(pd, 160 * dt);
        p.root.x += (pdx / pd) * step;
        p.root.y += (pdy / pd) * step;
        this.playAnim(p, 'walk');
        if (Math.abs(pdx) > 2) p.sprite.scale.x = Math.abs(p.baseScale) * (pdx < 0 ? -1 : 1);
      } else {
        this.playAnim(p, 'idle');
      }
      p.root.zIndex = p.root.y;
    }

    // —— 怪物游荡 ——
    for (const [, m] of this.monsters) {
      if (m.homeX === undefined || m.homeY === undefined) continue;
      if (m.targetX === undefined && this.elapsed > (m.waitUntil ?? 0)) {
        m.targetX = m.homeX + (Math.random() - 0.5) * 180;
        m.targetY = Math.max(this.map.bounds.minY, Math.min(this.map.bounds.maxY, m.homeY + (Math.random() - 0.5) * 100));
      }
      if (m.targetX !== undefined && m.targetY !== undefined) {
        const mdx = m.targetX - m.root.x;
        const mdy = m.targetY - m.root.y;
        const md = Math.hypot(mdx, mdy);
        if (md < 4) {
          m.targetX = undefined;
          m.waitUntil = this.elapsed + 800 + Math.random() * 2200;
          this.playAnim(m, 'idle');
        } else {
          const step = Math.min(md, MONSTER_SPEED * dt);
          m.root.x += (mdx / md) * step;
          m.root.y += (mdy / md) * step;
          this.playAnim(m, 'walk');
          if (Math.abs(mdx) > 2) m.sprite.scale.x = Math.abs(m.baseScale) * (mdx < 0 ? -1 : 1);
        }
      } else {
        this.playAnim(m, 'idle');
      }
      m.root.zIndex = m.root.y;
    }
    if (this.isoLayout) this.updateOccluders(dt);
    this.world.sortableChildren = true;

    // —— 摄像机跟随（钳制在地图内；俯瞰调试时锁定到 viewFocus） ——
    const vw = this.viewW;
    const vh = this.viewH;
    const fx = this.viewFocus?.x ?? this.player.root.x;
    const fy = this.viewFocus?.y ?? this.player.root.y;
    this.camX = Math.max(0, Math.min(Math.max(0, this.map.w - vw), fx - vw / 2));
    this.camY = Math.max(0, Math.min(Math.max(0, this.map.h - vh), fy - vh / 2));
    this.world.scale.set(this.viewScale);
    this.world.x = -this.camX * this.viewScale;
    this.world.y = -this.camY * this.viewScale;
    if (this.isoLayout) this.syncIso(); else this.syncTiles();

    if (this.engaged) return;

    // —— 触发检测 ——
    const pr = this.player.root;
    for (const [key, m] of this.monsters) {
      if (Math.hypot(m.root.x - pr.x, m.root.y - pr.y) < 75 * CHAR_RANGE) {
        this.engaged = true;
        this.inputEnabled = false;
        const groupKey = key.split(':').slice(0, 2).join(':');
        const spawn = this.map.spawns[Number(key.split(':')[1])];
        this.hooks.onEncounter(spawn.group, groupKey);
        return;
      }
    }
    if (this.npc && !this.npcPrompted && Math.hypot(this.npc.root.x - pr.x, this.npc.root.y - pr.y) < 80 * CHAR_RANGE) {
      this.npcPrompted = true;
      this.targetX = pr.x;
      this.targetY = pr.y;
      this.hooks.onNpc();
    } else if (this.npc && this.npcPrompted && Math.hypot(this.npc.root.x - pr.x, this.npc.root.y - pr.y) > 120 * CHAR_RANGE) {
      this.npcPrompted = false;
    }
    if (this.tavern && !this.tavernPrompted && Math.hypot(this.tavern.root.x - pr.x, this.tavern.root.y - pr.y) < 80 * CHAR_RANGE) {
      this.tavernPrompted = true;
      this.targetX = pr.x;
      this.targetY = pr.y;
      this.hooks.onTavern();
    } else if (this.tavern && this.tavernPrompted && Math.hypot(this.tavern.root.x - pr.x, this.tavern.root.y - pr.y) > 120 * CHAR_RANGE) {
      this.tavernPrompted = false;
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

  /** 挂机用：某怪组第一个精灵的当前位置（怪物会游荡，不能用出生点） */
  monsterPosFor(spawnIndex: number): Point | null {
    const prefix = `${this.map.id}:${spawnIndex}:`;
    for (const [key, actor] of this.monsters) {
      if (key.startsWith(prefix)) return { x: actor.root.x, y: actor.root.y };
    }
    return null;
  }

  syncState(gs: GameState): void {
    this.gs = gs;
  }

  /** 玩家当前地图坐标（战斗衔接、切图、存档用） */
  getPlayerPos(): { x: number; y: number } {
    return { x: this.player.root.x, y: this.player.root.y };
  }

  /** 调试：内部状态（DEV 构建的 window 句柄用） */
  debugInfo(): {
    player: { x: number; y: number }; cam: { x: number; y: number }; target: { x: number; y: number }; engaged: boolean;
    /** Pixi ticker 实时帧率（近 1s 平滑） */
    fps: number;
    map: { id: string; w: number; h: number; mode: 'iso' | 'segments'; bounds: { minX: number; maxX: number; minY: number; maxY: number } };
    iso: {
      cols: number; rows: number; tileW: number; tileH: number;
      groundCells: number; blockedCells: number; units: number; visible: number; visibleSprites: number; modules: number;
      playerCell: { gx: number; gy: number }; playerZ: number; walkable: boolean;
      playerAnim: { name: string; frame: number; frames: number; speed: number };
    } | null;
  } {
    const g = this.isoLayout?.grid;
    const col = this.isoCollision;
    return {
      player: { x: this.player.root.x, y: this.player.root.y },
      cam: { x: this.camX, y: this.camY },
      target: { x: this.targetX, y: this.targetY },
      engaged: this.engaged,
      fps: Math.round(this.app.ticker.FPS * 10) / 10,
      map: { id: this.map.id, w: this.map.w, h: this.map.h, mode: g ? 'iso' : 'segments', bounds: this.map.bounds },
      iso: g && col ? {
        cols: g.cols, rows: g.rows, tileW: g.tileW, tileH: g.tileH,
        groundCells: col.ground.size, blockedCells: col.blocked.size,
        units: this.isoUnits.size,
        visible: this.isoVisible.size,
        // 视口内真正挂到舞台上的显示对象：构件精灵 + 合批地面 Graphics + 角色/NPC/怪物
        visibleSprites: this.isoVisible.size + this.groundBatches.length
          + 1 + (this.pet ? 1 : 0) + (this.npc ? 1 : 0) + (this.tavern ? 1 : 0) + this.monsters.size,
        modules: this.isoTextures.size,
        playerCell: cellAt(g, this.player.root.x, this.player.root.y),
        playerZ: this.player.root.zIndex,
        walkable: this.canWalk(this.player.root.x, this.player.root.y),
        playerAnim: {
          name: this.player.animName ?? '',
          frame: this.player.sprite.currentFrame,
          frames: this.player.sprite.textures.length,
          speed: this.player.sprite.animationSpeed,
        },
      } : null,
    };
  }

  /** 调试：直接设定移动目标（等价于点击该地图坐标） */
  debugMoveTo(x: number, y: number): void {
    this.moveTo(x, y);
  }

  /** 调试：瞬移（边界验证用，绕过走路耗时） */
  debugTeleport(x: number, y: number): void {
    this.player.root.x = x;
    this.player.root.y = y;
    // 宠物一起落地，否则瞬移到远处后宠物要按 160px/s 慢慢追上来，截图里会缺席
    if (this.pet) {
      this.pet.root.x = x - 84;
      this.pet.root.y = y + 18;
    }
    this.targetX = x;
    this.targetY = y;
    this.path = [];
    this.centerCamera();
    if (this.isoLayout) this.syncIso(true); else this.syncTiles();
  }

  /** 调试：缩放/聚焦视口（俯瞰截图用；scale=1、不传坐标即恢复跟随玩家） */
  debugView(scale: number, x?: number, y?: number): void {
    this.viewScale = scale;
    this.viewFocus = (x === undefined || y === undefined) ? null : { x, y };
    this.world.scale.set(scale);
    this.centerCamera();
    if (this.isoLayout) this.syncIso(true); else this.syncTiles();
  }

  /**
   * 调试：连续走动 durationMs 毫秒并采样 Pixi ticker 帧率（默认沿主街 gx=16 直走）。
   * 返回平均值/最低/最高帧率，以及视口内平均精灵数。用于交付「走动 10 秒帧率」。
   */
  debugWalkFps(durationMs = 10000): Promise<{
    durationMs: number; avg: number; min: number; max: number; samples: number;
    visibleSprites: number; units: number;
    /** 采样到的玩家动画名与帧号（验证 walk 序列是否真的在推进） */
    animSamples: Array<{ name: string; frame: number }>;
    /** 走完后的实际落点与剩余 waypoint（验证没有被建筑半路卡住） */
    end: { x: number; y: number; gx: number; gy: number; pathRemaining: number };
  }> {
    const g = this.isoLayout?.grid;
    if (!g) return Promise.reject(new Error('非等距地图，无法走动测帧率'));
    // 沿南北主街西侧车道（x=59，避开中心鼓楼）由北向南直走，横穿四个坊
    const a = cellToWorld(g, 59, 8);
    const b = cellToWorld(g, 59, 118);
    this.debugTeleport(a.x, a.y);
    this.moveTo(b.x, b.y);
    const fps: number[] = [];
    const vis: number[] = [];
    const animSamples: Array<{ name: string; frame: number }> = [];
    const start = performance.now();
    return new Promise((resolve) => {
      const timer = window.setInterval(() => {
        fps.push(this.app.ticker.FPS);
        vis.push(this.isoVisible.size + this.groundBatches.length);
        animSamples.push({ name: this.player.animName ?? '', frame: this.player.sprite.currentFrame });
        if (performance.now() - start >= durationMs) {
          clearInterval(timer);
          const avg = fps.reduce((s, v) => s + v, 0) / Math.max(1, fps.length);
          resolve({
            durationMs,
            avg: Math.round(avg * 10) / 10,
            min: Math.round(Math.min(...fps) * 10) / 10,
            max: Math.round(Math.max(...fps) * 10) / 10,
            samples: fps.length,
            visibleSprites: Math.round(vis.reduce((s, v) => s + v, 0) / Math.max(1, vis.length)),
            units: this.isoUnits.size,
            animSamples,
            end: {
              x: Math.round(this.player.root.x), y: Math.round(this.player.root.y),
              ...cellAt(g, this.player.root.x, this.player.root.y),
              pathRemaining: this.path.length,
            },
          });
        }
      }, 250);
    });
  }

  destroy(): void {
    this.destroyed = true;
    this.app.destroy({ removeView: true }, { children: true });
  }
}
