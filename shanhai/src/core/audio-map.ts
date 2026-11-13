/**
 * 事件流 → 音效名映射（纯逻辑层，禁止 import DOM / Web Audio）。
 * 放在 core/ 是为了让回归脚本能断言映射，也便于联机时服务端下发同一套语义。
 */
import type { BattleEvent } from './types';

export type SfxName =
  | 'click' | 'attack' | 'cast' | 'hit' | 'heal' | 'status'
  | 'death' | 'catch' | 'item' | 'victory' | 'defeat';

export function sfxForEvent(ev: BattleEvent): SfxName | null {
  switch (ev.t) {
    case 'attack':
      return 'attack';
    case 'cast':
      return 'cast';
    case 'damage':
    case 'poisonTick':
      return 'hit';
    case 'heal':
      return 'heal';
    case 'statusHit':
    case 'statusResist':
    case 'statusEnd':
    case 'actSkip':
    case 'actOverride':
    case 'catchFail':
      return 'status';
    case 'death':
      return 'death';
    case 'catchSuccess':
      return 'catch';
    case 'itemUsed':
      return 'item';
    case 'defend':
      return 'click';
    case 'battleEnd':
      return ev.winner === 'ally' ? 'victory' : 'defeat';
    default:
      return null;
  }
}

/** 三档场景的 BGM 触发间隔（毫秒），供浏览器层使用 */
export const BGM_INTERVAL: Record<'setup' | 'world' | 'battle', number> = {
  setup: 620,
  world: 460,
  battle: 260,
};
