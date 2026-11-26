/**
 * 角色显示档位（唯一可调常量）。
 * 素材单帧 128×128、锚点 0.94，实体（内容 bbox）112px：
 * - 0.75 档 → 实体 84px，约为两层民居一层层高（~120px）的 70%，人物明显矮于楼层，
 *   符合「人小景大」的国风等距观感（参考手绘风整图里人物作为点缀的比例语义）。
 * - 1.00 档（旧值）→ 实体 112px 与一层层高几乎持平，人物比一层楼还高，观感失衡。
 * NPC / 酒馆 / 怪物 / 宠物按旧档位的相对体积派生，改 CHAR_SCALE_TIER 即整体同步缩放；
 * 交互半径 CHAR_RANGE = CHAR_SCALE_TIER / 0.75（旧档位书写基准）自动适配。
 */
export const CHAR_SCALE_TIER = 0.75;

/** 旧基准档 0.5625 时的相对体积比（只读派生系数，勿单独改） */
const REL = {
  npc: 0.59375 / 0.5625,
  tavern: 0.53125 / 0.5625,
  monster: 0.46875 / 0.5625,
  pet: 0.53125 / 0.5625,
} as const;

/** 世界场景各角色最终缩放 */
export const WORLD_SCALE = {
  player: CHAR_SCALE_TIER,
  npc: CHAR_SCALE_TIER * REL.npc,
  tavern: CHAR_SCALE_TIER * REL.tavern,
  monster: CHAR_SCALE_TIER * REL.monster,
  pet: CHAR_SCALE_TIER * REL.pet,
} as const;
