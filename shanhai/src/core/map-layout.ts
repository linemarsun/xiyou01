/**
 * 舆图布局（纯逻辑，禁止 import DOM）：回归直接测。
 * 以朝歌（帝都）为原点的手工罗盘基线布局——方位与世界观既定地理逐条对齐
 * （见 world.ts 各图注释与 v0.27.0 设计基线）：
 *   朝歌居中；五关走廊自西向东横贯两都（西岐城→西岐大营→界牌关→临潼关→穿云关→
 *   汜水关→渑池县→朝歌城）；女娲宫/冀州居北、北海在冀州正北、燕山—终南山为冀州西线；
 *   阴间（鹿台—黄泉鬼渡—绝龙岭—骷髅山—梅山）绕东；东海线（陈塘关—乾元山—金鳌岛—
 *   三仙岛）居东南；西岐屏藩（磻溪—凤鸣山—云梦泽）与昆仑仙道（穿云岭—昆仑山道—玉虚宫）居西北。
 * 未登记坐标的新地图自动挂在父图（BFS 树）周围扇形展开，无需手工登记即可入图。
 * 节点框（140×38）两两不叠由基线坐标直接保证，全局松弛只做兜底微调；朝歌钉在原点。
 */
import { WORLD_MAPS } from './world';

/** 手工罗盘基线（屏幕像素，y 向下）：西负东正、北负南正 */
const SEED_POS: Record<string, { x: number; y: number }> = {
  // 北线：女娲宫（朝歌北）→ 冀州（东北）→ 北海（冀州正北）；燕山—终南山（冀州西线）
  nvwagong: { x: 10, y: -160 },
  jizhou: { x: 190, y: -270 },
  beihai: { x: 350, y: -375 },
  yanshan: { x: -70, y: -285 },
  zhongnanshan: { x: -260, y: -330 },
  // 东线·阴间环：鹿台（朝歌东）→ 黄泉鬼渡 → 绝龙岭（东北）；骷髅山—梅山
  difu: { x: 190, y: -30 },
  wild_luanzang: { x: 340, y: -90 },
  juelongling: { x: 480, y: -260 },
  wild_shanxiao: { x: 465, y: -30 },
  meishan: { x: 630, y: -140 },
  // 东南·东海线：摘星楼（朝歌东南）→ 陈塘关 → 乾元山 / 金鳌岛 → 三仙岛；峨眉罗浮洞（昆仑—金鳌桥）
  zhaixinglou: { x: 150, y: 110 },
  chentangguan: { x: 300, y: 190 },
  qianyuan: { x: 450, y: 130 },
  jinaodao: { x: 430, y: 290 },
  sanxiandao: { x: 600, y: 240 },
  emeishan: { x: 170, y: 330 },
  // 西·五关走廊（自西向东）：西岐城 → 西岐大营 → 界牌关 → 临潼关 → 穿云关 → 汜水关 → 渑池县
  taoyuan: { x: -590, y: -60 },
  xidacamp: { x: -590, y: 30 },
  jiepaiguan: { x: -440, y: -60 },
  lintongguan: { x: -440, y: 30 },
  chuanyunguan: { x: -440, y: 120 },
  sishuiguan: { x: -290, y: 60 },
  mianchi: { x: -290, y: -30 },
  // 西北屏藩与昆仑仙道：磻溪—凤鸣山—云梦泽（西岐侧翼）；穿云岭—昆仑山道—玉虚宫（深山）
  panxi: { x: -790, y: -100 },
  fengmingshan: { x: -700, y: -240 },
  wild_yunmeng: { x: -800, y: 180 },
  wild_heifeng: { x: -410, y: -350 },
  wild_kunlun: { x: -280, y: -450 },
  yuxugong: { x: -120, y: -480 },
};

export function computeGraphPos(): Record<string, { x: number; y: number }> {
  const ids = Object.keys(WORLD_MAPS);
  const root = ids.includes('zhaoge') ? 'zhaoge' : ids[0];
  const pos: Record<string, { x: number; y: number }> = {
    [root]: { x: 0, y: 0 },
  };
  // BFS 树只服务于未登记图的兜底挂载（回归保证全图连通，登记图不走这条路）
  const depth = new Map<string, number>([[root, 0]]);
  const parent = new Map<string, string>();
  const children = new Map<string, string[]>();
  const queue = [root];
  while (queue.length) {
    const id = queue.shift()!;
    for (const e of WORLD_MAPS[id]?.exits ?? []) {
      if (!WORLD_MAPS[e.to] || depth.has(e.to)) continue;
      depth.set(e.to, depth.get(id)! + 1);
      parent.set(e.to, id);
      const ch = children.get(id) ?? [];
      ch.push(e.to);
      children.set(id, ch);
      queue.push(e.to);
    }
  }
  for (const id of ids) {
    if (id === root) continue;
    const seed = SEED_POS[id];
    if (seed) {
      pos[id] = { ...seed };
      continue;
    }
    // 兜底：围绕父图（无父则绕朝歌）按序扇形展开，半径逐环外推
    const p = pos[parent.get(id) ?? root] ?? pos[root];
    const k = (depth.get(id) ?? 1) % 6;
    const a = (k * Math.PI) / 3 + ids.indexOf(id) * 0.7;
    pos[id] = { x: p.x + Math.cos(a) * 190, y: p.y + Math.sin(a) * 190 };
  }
  // 全局松弛兜底：成对推开重叠的节点框（140×38，与 buildGraph 一致），沿重叠较小的轴分离；
  // 朝歌钉在原点（回归断言帝都居中）
  const ids2 = Object.keys(pos);
  for (let iter = 0; iter < 40; iter++) {
    let moved = false;
    for (let i = 0; i < ids2.length; i++) {
      for (let j = i + 1; j < ids2.length; j++) {
        const ai = ids2[i], bj = ids2[j];
        const a = pos[ai], b = pos[bj];
        const ox = 140 - Math.abs(a.x - b.x);
        const oy = 38 - Math.abs(a.y - b.y);
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        if (ox <= oy) {
          const s = a.x === b.x ? (ai < bj ? 1 : -1) : Math.sign(a.x - b.x);
          const w = ai === root ? 0 : bj === root ? 1 : 0.5;
          a.x += s * ox * w;
          b.x -= s * ox * (1 - w);
        } else {
          const s = a.y === b.y ? (ai < bj ? 1 : -1) : Math.sign(a.y - b.y);
          const w = ai === root ? 0 : bj === root ? 1 : 0.5;
          a.y += s * oy * w;
          b.y -= s * oy * (1 - w);
        }
      }
    }
    if (!moved) break;
  }
  return pos;
}
