/**
 * 舆图放射布局（纯逻辑，禁止 import DOM）：回归直接测。
 * 以朝歌（帝都）为中心的同心环放射布局——按出口拓扑从中心 BFS 分层，
 * 环半径随层数递增；角度按子树叶子数瓜分，保证不重叠。
 * 新增地图无需手工登记坐标——只要 exits 拓扑连通，就会自动出现在舆图上。
 */
import { WORLD_MAPS } from './world';

export function computeGraphPos(): Record<string, { x: number; y: number }> {
  const ids = Object.keys(WORLD_MAPS);
  const root = ids.includes('zhaoge') ? 'zhaoge' : ids[0];
  const depth = new Map<string, number>([[root, 0]]);
  const children = new Map<string, string[]>();
  const queue = [root];
  while (queue.length) {
    const id = queue.shift()!;
    for (const e of WORLD_MAPS[id]?.exits ?? []) {
      if (!WORLD_MAPS[e.to] || depth.has(e.to)) continue;
      depth.set(e.to, depth.get(id)! + 1);
      const ch = children.get(id) ?? [];
      ch.push(e.to);
      children.set(id, ch);
      queue.push(e.to);
    }
  }
  // 兜底：极少数未连通的图挂到根节点（回归保证全图 BFS 可达，一般走不到这）
  for (const id of ids) {
    if (depth.has(id)) continue;
    depth.set(id, 1);
    (children.get(root) ?? children.set(root, []).get(root)!).push(id);
  }
  // 叶子计数 → 角度区间分配（子树按叶子比例瓜分圆周，父节点居中）
  const leaves = new Map<string, number>();
  const countLeaves = (id: string): number => {
    const ch = children.get(id) ?? [];
    if (!ch.length) { leaves.set(id, 1); return 1; }
    const n = ch.reduce((s, c) => s + countLeaves(c), 0);
    leaves.set(id, n);
    return n;
  };
  countLeaves(root);
  const A_LEAF = (Math.PI * 2) / leaves.get(root)!;
  const spanA = new Map<string, [number, number]>();
  const assignA = (id: string, a0: number): number => {
    const ch = children.get(id) ?? [];
    if (!ch.length) {
      spanA.set(id, [a0, a0 + A_LEAF]);
      return a0 + A_LEAF;
    }
    let cur = a0;
    for (const c of ch) cur = assignA(c, cur);
    spanA.set(id, [a0, cur]);
    return cur;
  };
  assignA(root, 0);
  // 环半径逐层递增（外环间距渐缩），深链不再压扁到同一环
  const RADII = [140, 250, 350, 435, 505, 565, 615];
  const X_SCALE = 1.32;
  const angle = new Map<string, number>();
  for (const id of depth.keys()) {
    if (id === root) continue;
    const [a0, a1] = spanA.get(id)!;
    angle.set(id, (a0 + a1) / 2);
  }
  const pos: Record<string, { x: number; y: number }> = {
    [root]: { x: 0, y: 0 },
  };
  for (const id of angle.keys()) {
    const a = angle.get(id)! - Math.PI / 2;
    const d = depth.get(id)!;
    const r = RADII[Math.min(d, RADII.length) - 1];
    pos[id] = { x: Math.cos(a) * r * X_SCALE, y: Math.sin(a) * r };
  }
  // 全局松弛：成对推开重叠的节点框（140×38，与 buildGraph 一致），沿重叠较小的轴分离
  const RW = 140, RH = 38;
  const ids2 = Object.keys(pos);
  for (let iter = 0; iter < 40; iter++) {
    let moved = false;
    for (let i = 0; i < ids2.length; i++) {
      for (let j = i + 1; j < ids2.length; j++) {
        const a = pos[ids2[i]], b = pos[ids2[j]];
        const ox = RW - Math.abs(a.x - b.x);
        const oy = RH - Math.abs(a.y - b.y);
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        if (ox <= oy) {
          const s = a.x === b.x ? (ids2[i] < ids2[j] ? 1 : -1) : Math.sign(a.x - b.x);
          a.x += (s * ox) / 2;
          b.x -= (s * ox) / 2;
        } else {
          const s = a.y === b.y ? (ids2[i] < ids2[j] ? 1 : -1) : Math.sign(a.y - b.y);
          a.y += (s * oy) / 2;
          b.y -= (s * oy) / 2;
        }
      }
    }
    if (!moved) break;
  }
  return pos;
}
