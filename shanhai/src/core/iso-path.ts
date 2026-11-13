/**
 * 等距构件地图的网格寻路（纯逻辑层，不依赖 DOM / Pixi）。
 *
 * 背景：等距城图有城墙、房屋、水面等真实障碍，而 core/path.ts 的 planPath
 * 只有「单段直线 + 边界钳制」——点击城门路牌时角色会卡在墙前，永远走不到出口。
 * 这里在碰撞层上做 A*（8 向 + 拐角检查），再用视线检测把折线平滑成少量 waypoint，
 * 渲染器仍只消费 waypoints，横版区段地图继续走原来的 planPath。
 */
import {
  cellAt, cellToWorld, isoWalkable, keyOf,
  type IsoCollision, type IsoGrid,
} from './iso';
import { clampToBounds, type Point, type WalkBounds } from './path';

export interface IsoPathPlan {
  /** 依次要走到的点（不含起点）；未找到路径时为空 */
  waypoints: Point[];
  found: boolean;
  /** A* 展开的格数（诊断用） */
  explored: number;
  /** 原始格路径长度（格） */
  cells: number;
  /** 起点或终点被吸附到附近可走格 */
  snapped: boolean;
}

interface Cell { gx: number; gy: number }

/** 8 向：4 正交 + 4 对角（对角需检查拐角，避免穿墙角） */
const DIRS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

/** 二叉最小堆（避免 128×128 网格下线性取最小值退化） */
class MinHeap {
  private a: Array<{ k: string; f: number }> = [];
  get size(): number { return this.a.length; }
  push(k: string, f: number): void {
    const a = this.a;
    a.push({ k, f });
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): { k: string; f: number } | undefined {
    const a = this.a;
    if (a.length === 0) return undefined;
    const top = a[0];
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let s = i;
        if (l < a.length && a[l].f < a[s].f) s = l;
        if (r < a.length && a[r].f < a[s].f) s = r;
        if (s === i) break;
        [a[s], a[i]] = [a[i], a[s]];
        i = s;
      }
    }
    return top;
  }
}

/** 格是否可走（ground 且未被构件占用） */
function walkableCell(col: IsoCollision, g: IsoGrid, gx: number, gy: number): boolean {
  if (gx < 0 || gy < 0 || gx >= g.cols || gy >= g.rows) return false;
  const k = keyOf(gx, gy);
  return col.ground.has(k) && !col.blocked.has(k);
}

/** 就近找一个可走格（旧存档落在屋顶/水面里、点击点压在构件上时兜底） */
export function nearestWalkableCell(
  col: IsoCollision, g: IsoGrid, gx: number, gy: number, radius = 12,
): Cell | null {
  if (walkableCell(col, g, gx, gy)) return { gx, gy };
  for (let ring = 1; ring <= radius; ring++) {
    let best: Cell | null = null;
    let bestD = Infinity;
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const nx = gx + dx, ny = gy + dy;
        if (!walkableCell(col, g, nx, ny)) continue;
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = { gx: nx, gy: ny }; }
      }
    }
    if (best) return best;
  }
  return null;
}

/** 世界坐标 → 最近可走格中心（舆图点击落点用） */
export function nearestWalkablePoint(col: IsoCollision, g: IsoGrid, p: Point): Point | null {
  const c = cellAt(g, p.x, p.y);
  const near = nearestWalkableCell(col, g, c.gx, c.gy);
  return near ? cellToWorld(g, near.gx, near.gy) : null;
}

/** 线段是否全程可走（按格宽 1/4 采样，末端单独判定） */
export function isoLineClear(col: IsoCollision, g: IsoGrid, a: Point, b: Point): boolean {
  const step = Math.max(4, Math.min(g.tileW, g.tileH) / 4);
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const n = Math.max(1, Math.ceil(len / step));
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    if (!isoWalkable(col, g, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)) return false;
  }
  return true;
}

/** 视线平滑：把逐格折线压成尽量少的直线段，走起来不会一格一格抖 */
function smooth(col: IsoCollision, g: IsoGrid, pts: Point[], look = 24): Point[] {
  if (pts.length <= 2) return pts.slice(1);
  const out: Point[] = [];
  let i = 0;
  while (i < pts.length - 1) {
    let j = Math.min(pts.length - 1, i + look);
    while (j > i + 1 && !isoLineClear(col, g, pts[i], pts[j])) j--;
    out.push(pts[j]);
    i = j;
  }
  return out;
}

function octile(gx: number, gy: number, tx: number, ty: number): number {
  const dx = Math.abs(gx - tx), dy = Math.abs(gy - ty);
  return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy);
}

/**
 * 规划等距地图上 from → to 的路径。
 * - 起点/终点落在不可走格时自动吸附到最近可走格
 * - 对角移动要求两个正交邻格都可走（不切墙角）
 * - 找不到路时返回 found:false, waypoints:[]，调用方可回退单段直线
 */
export function planIsoPath(
  col: IsoCollision, g: IsoGrid, from: Point, to: Point, bounds?: WalkBounds,
): IsoPathPlan {
  const target = bounds ? clampToBounds(to, bounds) : to;
  const sc = cellAt(g, from.x, from.y);
  const tc = cellAt(g, target.x, target.y);
  const start = nearestWalkableCell(col, g, sc.gx, sc.gy);
  const goal = nearestWalkableCell(col, g, tc.gx, tc.gy);
  const snapped = !walkableCell(col, g, sc.gx, sc.gy) || !walkableCell(col, g, tc.gx, tc.gy);
  if (!start || !goal) return { waypoints: [], found: false, explored: 0, cells: 0, snapped };

  // 同格且直线可走：直接给目标点
  if (start.gx === goal.gx && start.gy === goal.gy) {
    return {
      waypoints: isoLineClear(col, g, from, target) ? [target] : [cellToWorld(g, goal.gx, goal.gy)],
      found: true, explored: 1, cells: 1, snapped,
    };
  }

  const startK = keyOf(start.gx, start.gy);
  const goalK = keyOf(goal.gx, goal.gy);
  const gScore = new Map<string, number>([[startK, 0]]);
  const cameFrom = new Map<string, string>();
  const cellsByKey = new Map<string, Cell>([[startK, start]]);
  const heap = new MinHeap();
  heap.push(startK, octile(start.gx, start.gy, goal.gx, goal.gy));
  const closed = new Set<string>();
  let explored = 0;
  const maxExpand = Math.min(30000, g.cols * g.rows);

  while (heap.size > 0 && explored < maxExpand) {
    const cur = heap.pop()!;
    if (closed.has(cur.k)) continue;
    closed.add(cur.k);
    explored++;
    if (cur.k === goalK) break;
    const c = cellsByKey.get(cur.k)!;
    const base = gScore.get(cur.k)!;
    for (const [dx, dy, cost] of DIRS) {
      const nx = c.gx + dx, ny = c.gy + dy;
      const nk = keyOf(nx, ny);
      if (closed.has(nk) || !walkableCell(col, g, nx, ny)) continue;
      if (dx !== 0 && dy !== 0) {
        // 不切墙角：两个正交邻格必须都可走
        if (!walkableCell(col, g, c.gx + dx, c.gy) || !walkableCell(col, g, c.gx, c.gy + dy)) continue;
      }
      const tentative = base + cost;
      if (tentative >= (gScore.get(nk) ?? Infinity)) continue;
      gScore.set(nk, tentative);
      cameFrom.set(nk, cur.k);
      cellsByKey.set(nk, { gx: nx, gy: ny });
      heap.push(nk, tentative + octile(nx, ny, goal.gx, goal.gy));
    }
  }

  if (!closed.has(goalK)) return { waypoints: [], found: false, explored, cells: 0, snapped };

  const chain: Cell[] = [];
  let k: string | undefined = goalK;
  while (k) {
    chain.push(cellsByKey.get(k)!);
    k = cameFrom.get(k);
  }
  chain.reverse();

  const pts: Point[] = [from, ...chain.map((c) => cellToWorld(g, c.gx, c.gy))];
  // 终点若本身可走，用精确坐标（能走进出口触发圈），否则用可走格中心
  if (isoWalkable(col, g, target.x, target.y)) pts[pts.length - 1] = target;
  const waypoints = smooth(col, g, pts).filter(
    (p) => Math.hypot(p.x - from.x, p.y - from.y) > 1,
  );
  return { waypoints, found: waypoints.length > 0, explored, cells: chain.length, snapped };
}
