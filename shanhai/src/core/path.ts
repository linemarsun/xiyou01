/**
 * 寻路（纯逻辑层）：输出 waypoint 队列，供世界渲染器逐段行走。
 *
 * 当前策略：地图没有障碍物数据，因此路径 = 「目标钳制到可行走区」的单段直线。
 * 调用方只消费 `waypoints`，未来接入 A* 网格 / 障碍绕行时只需替换 planPath，
 * 渲染器与 UI 无需改动。
 */
export interface Point { x: number; y: number }
export interface WalkBounds { minX: number; maxX: number; minY: number; maxY: number }
export interface Rect { x: number; y: number; w: number; h: number }
export interface PathPlan {
  /** 依次要走到的点（不含起点） */
  waypoints: Point[];
  /** 目标是否越出可行走区而被裁剪 */
  clipped: boolean;
  /** 直线路径长度（像素） */
  length: number;
}

export function clampToBounds(p: Point, b: WalkBounds): Point {
  return {
    x: Math.max(b.minX, Math.min(b.maxX, p.x)),
    y: Math.max(b.minY, Math.min(b.maxY, p.y)),
  };
}

/** 规划从 from 到 to 的路径；目前为单段直线 + 边界钳制 */
export function planPath(from: Point, to: Point, bounds: WalkBounds): PathPlan {
  const target = clampToBounds(to, bounds);
  return {
    waypoints: [target],
    clipped: target.x !== to.x || target.y !== to.y,
    length: Math.hypot(target.x - from.x, target.y - from.y),
  };
}

/** 返回距离 from 最近的候选下标；空数组返回 -1 */
export function nearestTarget(from: Point, candidates: Point[]): number {
  let best = -1;
  let bestDist = Infinity;
  candidates.forEach((p, i) => {
    const d = Math.hypot(p.x - from.x, p.y - from.y);
    if (d < bestDist) { bestDist = d; best = i; }
  });
  return best;
}
