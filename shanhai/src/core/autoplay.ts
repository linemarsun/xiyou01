/**
 * 挂机决策（纯逻辑层，禁止 import DOM）：根据存档与地图，给出下一步动作。
 * UI 层只负责执行动作（走到某点 / 交付任务 / 停止），决策全部可回归测试。
 *
 * 优先级：丹药耗尽 → 任务接取/交付 → 当前图最近的未清怪组 → 跨图巡游 → 停止。
 */
import {
  QUESTS, WORLD_MAPS, questReady,
  type GameState, type MapExit,
} from './world';
import { clampToBounds, nearestTarget, type Point } from './path';

/** 挂机巡游的地图顺序（用于当前图清空后挑选下一个有怪的地图） */
export const AUTO_ROUTE: readonly string[] = ['taoyuan', 'wild_heifeng', 'wild_luanzang', 'wild_shanxiao'];

export type AutoAction =
  | { kind: 'fight'; spawnIndex: number; target: Point }
  | { kind: 'travel'; to: string; exit: MapExit; target: Point }
  | { kind: 'quest'; target: Point }
  | { kind: 'stop'; reason: string };

/** 在地图出口图上做 BFS，返回通往目标地图的「第一跳」出口（可跨多张图） */
export function routeExit(fromId: string, goalId: string): MapExit | undefined {
  if (fromId === goalId) return undefined;
  type Step = { id: string; first: MapExit };
  const queue: Step[] = [];
  const seen = new Set<string>([fromId]);
  for (const e of WORLD_MAPS[fromId]?.exits ?? []) {
    seen.add(e.to);
    queue.push({ id: e.to, first: e });
  }
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur.id === goalId) return cur.first;
    for (const e of WORLD_MAPS[cur.id]?.exits ?? []) {
      if (seen.has(e.to)) continue;
      seen.add(e.to);
      queue.push({ id: e.to, first: cur.first });
    }
  }
  return undefined;
}

export function nextAutoAction(gs: GameState, playerPos?: Point): AutoAction {
  const map = WORLD_MAPS[gs.mapId] ?? WORLD_MAPS.taoyuan;
  const player = clampToBounds(playerPos ?? { x: gs.px, y: gs.py }, map.bounds);

  // 1. 补给边界：当前没有商店系统，丹药耗尽即停（不自动购买）
  if (gs.inv.heal <= 0 && gs.inv.mana <= 0) {
    return { kind: 'stop', reason: '丹药耗尽，请手动补给' };
  }

  // 2. 未接任务 / 任务可交付 → 回云京找玄鹤长老
  const needQuest = gs.questStep === 0 || questReady(gs);
  if (needQuest) {
    if (map.id === 'taoyuan') {
      const npc = map.npc ?? { x: 920, y: 560 };
      return { kind: 'quest', target: clampToBounds(npc, map.bounds) };
    }
    const exit = routeExit(map.id, 'taoyuan');
    if (exit) return { kind: 'travel', to: exit.to, exit, target: { x: exit.x, y: exit.y } };
  }

  // 3. 当前地图还有未清怪组 → 打离玩家最近的一组
  const alive = map.spawns
    .map((spawn, index) => ({ spawn, index }))
    .filter((o) => !gs.killedGroups[`${map.id}:${o.index}`]);
  if (alive.length > 0) {
    const pick = alive[nearestTarget(player, alive.map((o) => ({ x: o.spawn.x, y: o.spawn.y })))];
    return {
      kind: 'fight',
      spawnIndex: pick.index,
      target: clampToBounds({ x: pick.spawn.x, y: pick.spawn.y }, map.bounds),
    };
  }

  // 4. 当前图清空 → 按巡游顺序找下一张有怪的图，BFS 取第一跳出口
  const allDone = gs.questStep > QUESTS.length;
  if (allDone) return { kind: 'stop', reason: '任务链已完成，挂机结束' };
  const start = Math.max(0, AUTO_ROUTE.indexOf(map.id));
  for (let step = 1; step <= AUTO_ROUTE.length; step++) {
    const goal = AUTO_ROUTE[(start + step) % AUTO_ROUTE.length];
    const target = WORLD_MAPS[goal];
    if (!target || target.spawns.length === 0) continue;
    const exit = routeExit(map.id, goal);
    if (exit) return { kind: 'travel', to: exit.to, exit, target: { x: exit.x, y: exit.y } };
  }
  return { kind: 'stop', reason: '没有可挑战的怪物组' };
}
