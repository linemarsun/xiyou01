/**
 * 角色显示档位（唯一可调常量）。
 * 素材单帧 128×128、锚点 0.94，实体（内容 bbox）112px：
 * - 1.00 档 → 实体 112px，占 900 屏高 12.4%，与 4×4 民居侧影 322px 的比为 2.87:1（大话西游式 2:1 等距观感区间 2.5~3.0）。
 * - 0.75 档（旧值）→ 实体 84px，与民居侧影的比 3.85:1，建筑显得过高、人物偏小。
 * NPC / 酒馆 / 怪物 / 宠物按旧档位的相对体积派生，改 CHAR_SCALE_TIER 即整体同步缩放。
 */
export const CHAR_SCALE_TIER = 1.0;

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
