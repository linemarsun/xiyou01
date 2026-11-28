/**
 * 舆图（地图查看）面板：叠在世界界面上的只读俯瞰 + 导航。
 *
 * - 当前图俯瞰：等距图按碰撞层画地形菱形格（草地/山径/石台/水面/建筑），
 *   横版图按区段画可行走带；标出玩家、NPC、酒肆、怪组、出口路牌与当前寻路目标。
 * - 点击俯瞰图 → 就近吸附到可走格并自动寻路（复用等距 A*）。
 * - 「本境通路」按钮 → 寻路到对应出口路牌；「四境全图」节点 → 寻路到土行孙身旁后遁地直达。
 * - 纯 Canvas + CSS 绘制，不依赖任何图片素材；面板每 250ms 刷新位置。
 */
import { WORLD_MAPS, type MapExit, type WorldMap } from '../core/world';
import type { IsoCollision, IsoGrid, IsoLayout } from '../core/iso';
import { cellToWorld, isGroundType } from '../core/iso';
import { nearestWalkablePoint } from '../core/iso-path';
import { clampToBounds, type Point } from '../core/path';
import { h } from './dom';

export interface MapPanelHooks {
  getPlayer: () => Point;
  getTarget: () => Point;
  getMonsters: () => Point[];
  /** 等距布局与碰撞层；横版图返回 null */
  getOverview: () => { layout: IsoLayout; collision: IsoCollision } | null;
  /** 请求渲染器走到某世界坐标 */
  goto: (p: Point) => void;
  /** 舆图点图跳转：寻路到本图土行孙身旁后遁地直达目标图 */
  teleportVia: (mapId: string) => void;
  toast: (text: string) => void;
}

const CANVAS_W = 720;
const CANVAS_H = 360;

interface Terrain { grid: IsoGrid; types: Uint8Array; blocked: Set<string> }

const GROUND_COLOR: Record<string, string> = {
  ground_grass: '#4b6b48',
  ground_dirt: '#8a6a45',
  ground_stone: '#8d8878',
  ground_water: '#2f4a5c',
  ground_snow: '#c9d5d4',
};

import { computeGraphPos } from '../core/map-layout';

export class MapPanel {
  readonly el: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private coordEl: HTMLElement;
  private exitsEl: HTMLElement;
  private graphEl: HTMLElement;
  private timer: number | null = null;
  /** 世界坐标 → 画布像素的换算参数（draw 时更新，点击时复用） */
  private scale = 1;
  private ox = 0;
  private oy = 0;
  /** 地形分类缓存（每个布局只算一次） */
  private terrain: Terrain | null = null;
  private terrainKey = '';

  constructor(private map: WorldMap, private hooks: MapPanelHooks) {
    this.canvas = h('canvas', { class: 'map-canvas', width: CANVAS_W, height: CANVAS_H });
    this.ctx = this.canvas.getContext('2d');
    this.coordEl = h('span', { class: 'map-coord' }, '');
    this.exitsEl = h('div', { class: 'map-exits' });
    this.graphEl = h('div', { class: 'map-graph' });

    this.el = h('div', { class: 'dialogue map-panel', style: 'display:none' },
      h('div', { class: 'map-head' },
        h('div', { class: 'dname' }, `🗺 四境舆图 · ${map.name}`),
        this.coordEl,
      ),
      this.canvas,
      h('div', { class: 'map-legend' },
        h('span', {}, '🟥 你'),
        h('span', {}, '🟩 出口路牌'),
        h('span', {}, '🟨 长老 / 酒肆'),
        h('span', {}, '🟦 土行孙（传送）'),
        h('span', {}, '⬤ 妖物'),
        h('span', { class: 'map-hint' }, '点击舆图自动寻路 · 蓝为水面 · 深色为建筑'),
      ),
      h('div', { class: 'map-section-title' }, '本境通路'),
      this.exitsEl,
      h('div', { class: 'map-section-title' }, '四境全图（以朝歌帝都为中心 · 点节点由土行孙遁地直达）'),
      this.graphEl,
      h('div', { style: 'text-align:right;margin-top:8px' },
        h('button', { class: 'btn small', onclick: () => this.hide() }, '关闭'),
      ),
    );

    this.buildExits();
    this.buildGraph();
    this.canvas.addEventListener('click', (e) => this.onCanvasClick(e));
    document.addEventListener('keydown', this.onKeyDown);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && this.isOpen) this.hide();
  };

  /** 同一目标地图可能有多个重复路牌（横版每 2 区段一组），只留离玩家最近的一个 */
  private uniqueExits(): MapExit[] {
    const player = this.hooks.getPlayer();
    const best = new Map<string, MapExit>();
    for (const e of this.map.exits) {
      const prev = best.get(e.to);
      if (!prev || Math.hypot(e.x - player.x, e.y - player.y) < Math.hypot(prev.x - player.x, prev.y - player.y)) {
        best.set(e.to, e);
      }
    }
    return [...best.values()];
  }

  private buildExits(): void {
    this.exitsEl.innerHTML = '';
    const list = this.uniqueExits();
    if (list.length === 0) {
      this.exitsEl.append(h('span', { class: 'map-hint' }, '此地没有通往别处的路牌'));
      return;
    }
    for (const e of list) {
      const target = WORLD_MAPS[e.to];
      this.exitsEl.append(h('button', {
        class: 'btn small',
        title: `路牌位置 (${e.x}, ${e.y})`,
        onclick: () => {
          this.hooks.goto({ x: e.x, y: e.y });
          this.hooks.toast(`寻路前往「${e.label}」路牌`);
          this.hide();
        },
      }, `前往 ${target?.name ?? e.label} →`));
    }
  }

  private buildGraph(): void {
    const pos = computeGraphPos();
    const xs = Object.values(pos).map((p) => p.x);
    const ys = Object.values(pos).map((p) => p.y);
    const pad = 70;
    const minX = Math.min(...xs) - pad;
    const minY = Math.min(...ys) - pad;
    const w = Math.max(...xs) + pad - minX;
    const hh = Math.max(...ys) + pad - minY;
    const ids = Object.keys(pos);
    // —— 去重边（与旧逻辑一致） ——
    const edges: Array<{ a: string; b: string }> = [];
    const drawn = new Set<string>();
    for (const m of Object.values(WORLD_MAPS)) {
      for (const e of m.exits) {
        if (!pos[e.to] || !WORLD_MAPS[e.to]) continue;
        const k = [m.id, e.to].sort().join('|');
        if (drawn.has(k)) continue;
        drawn.add(k);
        edges.push({ a: m.id, b: e.to });
      }
    }
    // —— 几何工具：线段相交 / 节点框（140×38）命中 ——
    type Pt = { x: number; y: number };
    const segInt = (u1: Pt, u2: Pt, v1: Pt, v2: Pt): boolean => {
      const d = (u2.x - u1.x) * (v2.y - v1.y) - (u2.y - u1.y) * (v2.x - v1.x);
      if (d === 0) return false;
      const t = ((v1.x - u1.x) * (v2.y - v1.y) - (v1.y - u1.y) * (v2.x - v1.x)) / d;
      const u = ((v1.x - u1.x) * (u2.y - u1.y) - (v1.y - u1.y) * (u2.x - u1.x)) / d;
      return t > 0.001 && t < 0.999 && u > 0.001 && u < 0.999;
    };
    const segHitsBox = (p1: Pt, p2: Pt, cx: number, cy: number): boolean => {
      const minx = cx - 70, maxx = cx + 70, miny = cy - 19, maxy = cy + 19;
      if (p1.x >= minx && p1.x <= maxx && p1.y >= miny && p1.y <= maxy) return true;
      if (p2.x >= minx && p2.x <= maxx && p2.y >= miny && p2.y <= maxy) return true;
      const c1 = { x: minx, y: miny }, c2 = { x: maxx, y: miny };
      const c3 = { x: maxx, y: maxy }, c4 = { x: minx, y: maxy };
      return segInt(p1, p2, c1, c2) || segInt(p1, p2, c2, c3) || segInt(p1, p2, c3, c4) || segInt(p1, p2, c4, c1);
    };
    /** 折线与其他边直连段的交叉数 / 与无关节点框的命中数（端点双方的框不算） */
    const scorePoly = (poly: Pt[], ea: string, eb: string): { cross: number; box: number } => {
      let cross = 0, box = 0;
      for (let i = 0; i < poly.length - 1; i++) {
        const p1 = poly[i], p2 = poly[i + 1];
        for (const o of edges) {
          if ((o.a === ea && o.b === eb) || (o.a === eb && o.b === ea)) continue;
          if (o.a === ea || o.b === ea || o.a === eb || o.b === eb) continue;
          if (segInt(p1, p2, pos[o.a], pos[o.b])) cross++;
        }
        for (const id of ids) {
          if (id === ea || id === eb) continue;
          if (segHitsBox(p1, p2, pos[id].x, pos[id].y)) box++;
        }
      }
      return { cross, box };
    };
    /** 二次贝塞尔采样折线 */
    const bezier = (a: Pt, ctrl: Pt, b: Pt): Pt[] => {
      const pts: Pt[] = [];
      for (let i = 0; i <= 36; i++) {
        const t = i / 36, mt = 1 - t;
        pts.push({
          x: mt * mt * a.x + 2 * mt * t * ctrl.x + t * t * b.x,
          y: mt * mt * a.y + 2 * mt * t * ctrl.y + t * t * b.y,
        });
      }
      return pts;
    };
    // —— 先统计每条直连边的交叉 / 穿框，再对重灾区尝试绕行候选（直连 / ±150 / ±260） ——
    const base = edges.map(({ a, b }) => scorePoly([pos[a], pos[b]], a, b));
    const links: string[] = [];
    edges.forEach(({ a, b }, idx) => {
      const pa = pos[a], pb = pos[b];
      const { cross, box } = base[idx];
      let best = { score: 3 * box + cross, ctrl: null as Pt | null };
      if (box >= 1 || cross >= 3) {
        const dx = pb.x - pa.x, dy = pb.y - pa.y;
        const len = Math.hypot(dx, dy) || 1;
        const px = -dy / len, py = dx / len;
        const mid = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
        for (const K of [150, 260, 500]) {
          for (const s of [1, -1]) {
            const ctrl = { x: mid.x + px * s * K, y: mid.y + py * s * K };
            const r = scorePoly(bezier(pa, ctrl, pb), a, b);
            const sc = 3 * r.box + r.cross + K / 520;
            if (sc < best.score) best = { score: sc, ctrl };
          }
        }
      }
      if (best.ctrl) {
        links.push(`<path d="M ${pa.x} ${pa.y} Q ${best.ctrl.x} ${best.ctrl.y} ${pb.x} ${pb.y}" fill="none" stroke="#c8ab6a" stroke-width="2" stroke-dasharray="5 4" opacity="0.8"/>`);
      } else {
        links.push(`<line x1="${pa.x}" y1="${pa.y}" x2="${pb.x}" y2="${pb.y}" stroke="#c8ab6a" stroke-width="2" stroke-dasharray="5 4" opacity="0.8"/>`);
      }
    });
    const nodes = Object.values(WORLD_MAPS).map((m) => {
      const p = pos[m.id];
      if (!p) return '';
      const cur = m.id === this.map.id;
      const center = m.id === 'zhaoge';
      const fill = cur ? '#a63d2f' : center ? '#7a5426' : '#2f4a5c';
      const label = center ? `👑 ${m.name}` : m.name;
      return `<g data-map-id="${m.id}" style="cursor:pointer">
        <rect x="${p.x - 70}" y="${p.y - 19}" width="140" height="38" rx="8" fill="${fill}" stroke="#f0d9a0" stroke-width="${cur ? 3 : center ? 2 : 1.2}"/>
        <text x="${p.x}" y="${p.y + 6}" text-anchor="middle" font-size="17" fill="#f7f0dd" font-family="Microsoft YaHei, sans-serif">${label}</text>
        ${cur ? `<text x="${p.x}" y="${p.y + 33}" text-anchor="middle" font-size="13" fill="#a63d2f" font-family="Microsoft YaHei, sans-serif">● 当前所在地</text>` : ''}
      </g>`;
    }).join('');
    this.graphEl.innerHTML = `<svg viewBox="${minX} ${minY} ${w} ${hh}" style="width:100%;height:auto;max-height:560px;display:block" role="img" aria-label="四境全图">${links.join('')}${nodes}</svg>`;
    this.graphEl.querySelectorAll<SVGGElement>('[data-map-id]').forEach((g) => {
      g.addEventListener('click', () => {
        const id = g.getAttribute('data-map-id')!;
        if (id === this.map.id) { this.hooks.toast(`你正在「${this.map.name}」`); return; }
        this.hooks.teleportVia(id);
        this.hide();
      });
    });
  }

  /** 把布局的地面矩形压成逐格类型表（后写的覆盖先写的），只算一次 */
  private buildTerrain(layout: IsoLayout, collision: IsoCollision): void {
    const g = layout.grid;
    const key = `${layout.items.length}:${g.cols}x${g.rows}:${collision.blocked.size}`;
    if (this.terrain && this.terrainKey === key) return;
    const codes: Record<string, number> = {
      ground_grass: 1, ground_dirt: 2, ground_stone: 3, ground_water: 4, ground_snow: 5,
    };
    const types = new Uint8Array(g.cols * g.rows);
    for (const item of layout.items) {
      if (!isGroundType(item.type)) continue;
      const code = codes[item.type] ?? 1;
      const w = item.w ?? 1, hgt = item.h ?? 1;
      for (let dy = 0; dy < hgt; dy++) {
        for (let dx = 0; dx < w; dx++) {
          const gx = item.gx + dx, gy = item.gy + dy;
          if (gx < 0 || gy < 0 || gx >= g.cols || gy >= g.rows) continue;
          types[gy * g.cols + gx] = code;
        }
      }
    }
    this.terrain = { grid: g, types, blocked: collision.blocked };
    this.terrainKey = key;
  }

  private worldToCanvas(p: Point): Point {
    return { x: p.x * this.scale + this.ox, y: p.y * this.scale + this.oy };
  }

  private diamond(ctx: CanvasRenderingContext2D, x: number, y: number, g: IsoGrid): void {
    const hw = (g.tileW / 2) * this.scale, hh = (g.tileH / 2) * this.scale;
    ctx.moveTo(x, y - hh);
    ctx.lineTo(x + hw, y);
    ctx.lineTo(x, y + hh);
    ctx.lineTo(x - hw, y);
    ctx.closePath();
  }

  private drawIso(ctx: CanvasRenderingContext2D, t: Terrain): void {
    const { grid: g, types, blocked } = t;
    const colors = ['', GROUND_COLOR.ground_grass, GROUND_COLOR.ground_dirt,
      GROUND_COLOR.ground_stone, GROUND_COLOR.ground_water, GROUND_COLOR.ground_snow];
    // 一次遍历按地形分桶，避免每种颜色都重扫整张网格
    const buckets: Point[][] = colors.map(() => []);
    const hx = (g.tileW / 2) * this.scale, hy = (g.tileH / 2) * this.scale;
    for (let gy = 0; gy < g.rows; gy++) {
      for (let gx = 0; gx < g.cols; gx++) {
        const code = types[gy * g.cols + gx];
        if (!code) continue;
        buckets[code].push({
          x: (g.ox + (gx - gy) * (g.tileW / 2)) * this.scale + this.ox,
          y: (g.oy + (gx + gy) * (g.tileH / 2)) * this.scale + this.oy,
        });
      }
    }
    for (let code = 1; code < colors.length; code++) {
      if (buckets[code].length === 0) continue;
      ctx.beginPath();
      for (const p of buckets[code]) {
        ctx.moveTo(p.x, p.y - hy);
        ctx.lineTo(p.x + hx, p.y);
        ctx.lineTo(p.x, p.y + hy);
        ctx.lineTo(p.x - hx, p.y);
        ctx.closePath();
      }
      ctx.fillStyle = colors[code];
      ctx.fill();
    }
    // 建筑/城墙/树木等占用格：叠一层深色，让街巷结构一眼可辨
    ctx.beginPath();
    for (const k of blocked) {
      const [gx, gy] = k.split(',').map(Number);
      if (gx < 0 || gy < 0 || gx >= g.cols || gy >= g.rows) continue;
      const w = cellToWorld(g, gx, gy);
      const p = this.worldToCanvas(w);
      this.diamond(ctx, p.x, p.y, g);
    }
    ctx.fillStyle = 'rgba(26,22,18,0.72)';
    ctx.fill();
    // 可走但被水面占用的格用蓝色点提示（水面已在地形层着色，这里只描边）
    ctx.strokeStyle = 'rgba(247,240,221,0.06)';
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }

  private drawSegments(ctx: CanvasRenderingContext2D): void {
    const b = this.map.bounds;
    const p0 = this.worldToCanvas({ x: b.minX, y: b.minY });
    const p1 = this.worldToCanvas({ x: b.maxX, y: b.maxY });
    ctx.fillStyle = '#5b7248';
    ctx.fillRect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y);
    ctx.strokeStyle = 'rgba(247,240,221,0.25)';
    ctx.lineWidth = 1;
    const segW = 1440 * this.scale;
    for (let x = this.ox + segW; x < this.ox + this.map.w * this.scale; x += segW) {
      ctx.beginPath();
      ctx.moveTo(x, p0.y);
      ctx.lineTo(x, p1.y);
      ctx.stroke();
    }
    ctx.strokeStyle = '#c8ab6a';
    ctx.strokeRect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y);
  }

  private marker(ctx: CanvasRenderingContext2D, p: Point, color: string, radius: number, label?: string): void {
    const s = this.worldToCanvas(p);
    if (s.x < -20 || s.y < -20 || s.x > CANVAS_W + 20 || s.y > CANVAS_H + 20) return;
    ctx.beginPath();
    ctx.arc(s.x, s.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#1c1810';
    ctx.stroke();
    if (label) {
      ctx.font = '12px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#1c1810';
      ctx.strokeText(label, s.x, s.y - radius - 6);
      ctx.fillStyle = '#f7f0dd';
      ctx.fillText(label, s.x, s.y - radius - 6);
    }
  }

  private draw(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = '#1b2320';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    this.scale = Math.min((CANVAS_W - 16) / this.map.w, (CANVAS_H - 16) / this.map.h);
    this.ox = (CANVAS_W - this.map.w * this.scale) / 2;
    this.oy = (CANVAS_H - this.map.h * this.scale) / 2;

    const overview = this.hooks.getOverview();
    if (overview) {
      this.buildTerrain(overview.layout, overview.collision);
      if (this.terrain) this.drawIso(ctx, this.terrain);
    } else {
      this.drawSegments(ctx);
    }

    const player = this.hooks.getPlayer();
    this.coordEl.textContent = `当前 (${Math.round(player.x)}, ${Math.round(player.y)}) · ${overview ? '等距舆图' : '横版长卷'}`;

    for (const e of this.uniqueExits()) {
      const s = this.worldToCanvas({ x: e.x, y: e.y });
      ctx.beginPath();
      ctx.moveTo(s.x, s.y - 7);
      ctx.lineTo(s.x + 7, s.y);
      ctx.lineTo(s.x, s.y + 7);
      ctx.lineTo(s.x - 7, s.y);
      ctx.closePath();
      ctx.fillStyle = '#4f9e63';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#10241a';
      ctx.stroke();
      ctx.font = '12px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#1c1810';
      ctx.strokeText(e.label, s.x, s.y - 12);
      ctx.fillStyle = '#dff3d8';
      ctx.fillText(e.label, s.x, s.y - 12);
    }
    if (this.map.npc) this.marker(ctx, this.map.npc, '#e8c56a', 5, this.map.npc.name);
    if (this.map.tavern) this.marker(ctx, this.map.tavern, '#e8c56a', 5, this.map.tavern.name);
    if (this.map.teleporter) this.marker(ctx, this.map.teleporter, '#4f9ee0', 5, this.map.teleporter.name);
    for (const m of this.hooks.getMonsters()) this.marker(ctx, m, '#c0453a', 3.5);

    const target = this.hooks.getTarget();
    if (Math.hypot(target.x - player.x, target.y - player.y) > 24) {
      const s = this.worldToCanvas(target);
      ctx.beginPath();
      ctx.arc(s.x, s.y, 7, 0, Math.PI * 2);
      ctx.strokeStyle = '#e8c56a';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // 玩家：脉冲外环 + 实心点，位置每 250ms 刷新
    const s = this.worldToCanvas(player);
    const pulse = 9 + Math.sin(Date.now() / 260) * 2.5;
    ctx.beginPath();
    ctx.arc(s.x, s.y, pulse, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(247,240,221,0.7)';
    ctx.lineWidth = 2;
    ctx.stroke();
    this.marker(ctx, player, '#d8423a', 5.5, '你');
  }

  private onCanvasClick(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const cx = ((e.clientX - rect.left) / rect.width) * CANVAS_W;
    const cy = ((e.clientY - rect.top) / rect.height) * CANVAS_H;
    const world = clampToBounds(
      { x: (cx - this.ox) / this.scale, y: (cy - this.oy) / this.scale },
      this.map.bounds,
    );
    const overview = this.hooks.getOverview();
    let target = world;
    if (overview) {
      const snapped = nearestWalkablePoint(overview.collision, overview.layout.grid, world);
      if (!snapped) { this.hooks.toast('附近没有可通行的地面'); return; }
      target = snapped;
    }
    this.hooks.goto(target);
    this.hooks.toast(`寻路至 (${Math.round(target.x)}, ${Math.round(target.y)})`);
  }

  show(): void {
    this.buildExits();
    this.el.style.display = '';
    this.draw();
    if (this.timer === null) {
      this.timer = window.setInterval(() => {
        // 切图 / 战斗返回会重建 DOM：面板已脱离文档时自动停表，避免泄漏
        if (!this.el.isConnected) { this.hide(); return; }
        this.draw();
      }, 250);
    }
  }

  hide(): void {
    if (this.timer !== null) { window.clearInterval(this.timer); this.timer = null; }
    this.el.style.display = 'none';
  }

  get isOpen(): boolean { return this.el.style.display !== 'none'; }

  dispose(): void {
    this.hide();
    document.removeEventListener('keydown', this.onKeyDown);
    this.el.remove();
  }
}
