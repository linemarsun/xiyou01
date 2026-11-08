/**
 * 角色显示档位（唯一可调常量）。
 * 素材单帧 128×128、锚点 0.94：0.75 档单帧 96px，实体约 84px，占 900 屏高约 9.3%。
 * NPC / 酒馆 / 怪物 / 宠物按旧档位的相对体积派生，改 CHAR_SCALE_TIER 即整体同步放大。
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
