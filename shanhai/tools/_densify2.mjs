/** 织网补齐：生成器残留 + world.ts 全量配对 */
import { readFileSync, writeFileSync } from 'node:fs';
const EOL = '\r\n';
function rep(p, a, b, optional = false) {
  let s = readFileSync(p, 'utf8');
  const an = a.replace(/\n/g, EOL), bn = b.replace(/\n/g, EOL);
  if (!s.includes(an)) {
    if (optional) { console.log('[SKIP 已应用]', a.slice(0, 52).replace(/\n/g, '⏎')); return; }
    console.log('[MISS]', String(p).split('/').pop(), a.slice(0, 64).replace(/\n/g, '⏎'));
    return;
  }
  s = s.split(an).join(bn);
  writeFileSync(p, s);
  console.log('ok:', String(p).split('/').pop(), '←', a.slice(0, 44).replace(/\n/g, '⏎'));
}
const GEN = new URL('./gen-iso-maps.mjs', import.meta.url);
const WS = new URL('../src/core/world.ts', import.meta.url);

// ---- 生成器补齐 ----
// difu：东口新增女娲宫（先看实际西口标签变体，两种都试）
rep(GEN, `        { gx: 1, gy: 40, to: 'zhaoge', toGx: 1, toGy: 30, label: '渑池县' },`,
  `        { gx: 1, gy: 40, to: 'zhaoge', toGx: 1, toGy: 30, label: '渑池县' },
        { gx: 78, gy: 48, to: 'nvwagong', toGx: 86, toGy: 44, label: '女娲宫' },`, true);
// difu 东支路
rep(GEN, `      // 西支路：黄泉道西出，通往朝歌城`,
  `      // 西支路：黄泉道西出，通往朝歌城；东支路：横河北岸东出，通女娲宫`, true);
rep(GEN, `      line([[40, 48], [1, 40]], 5, 'ground_stone');`,
  `      line([[40, 48], [1, 40]], 5, 'ground_stone');
      line([[40, 48], [78, 48]], 5, 'ground_stone');`, true);
// fengmingshan：北口新增穿云岭
rep(GEN, `        { gx: 78, gy: 40, to: 'xidacamp', toGx: 1, toGy: 44, label: '西岐大营' },`,
  `        { gx: 78, gy: 40, to: 'xidacamp', toGx: 1, toGy: 44, label: '西岐大营' },
        { gx: 40, gy: 1, to: 'wild_heifeng', toGx: 1, toGy: 62, label: '穿云岭古道' },`, true);
rep(GEN, `      // 南口 → 山道 → 凤鸣台`,
  `      // 南口 → 山道 → 凤鸣台；北支路：凤鸣台北上，通穿云岭`, true);
rep(GEN, `      line([[40, 78], [40, 52]], 5, 'ground_dirt');`,
  `      line([[40, 78], [40, 52]], 5, 'ground_dirt');
      line([[40, 52], [40, 1]], 4, 'ground_dirt');`, true);
// qianyuan：南口梅山 + 北口金鳌岛
rep(GEN, `        { gx: 1, gy: 36, to: 'chentangguan', toGx: 1, toGy: 36, label: '陈塘关' },`,
  `        { gx: 1, gy: 36, to: 'chentangguan', toGx: 1, toGy: 36, label: '陈塘关' },
        { gx: 46, gy: 70, to: 'meishan', toGx: 40, toGy: 1, label: '梅山' },
        { gx: 46, gy: 1, to: 'jinaodao', toGx: 1, toGy: 44, label: '金鳌岛碧游宫' },`, true);
rep(GEN, `      // 西口 → 之字山道 → 山腰洞前广场 → 金光洞大殿`,
  `      // 西口 → 之字山道 → 山腰洞前广场 → 金光洞大殿；南支路：通梅山；北支路：海路通金鳌岛`, true);
rep(GEN, `      line([[1, 36], [28, 36], [46, 24], [46, 40]], 6, 'ground_stone');`,
  `      line([[1, 36], [28, 36], [46, 24], [46, 40]], 6, 'ground_stone');
      line([[46, 52], [46, 70]], 4, 'ground_stone');
      line([[46, 24], [46, 1]], 4, 'ground_stone');`, true);
// 玉虚宫（主题为对象格式）：东口新增峨眉罗浮洞
rep(GEN, `      exits: [
        { gx: 1, gy: 44, to: 'wild_kunlun', toGx: 118, toGy: 44, label: '昆仑山道' },
      ],
      npc: { gx: 48, gy: 44, name: '云中子' },`.replace('云中子', '元始天尊'),
  `      exits: [
        { gx: 1, gy: 44, to: 'wild_kunlun', toGx: 118, toGy: 44, label: '昆仑山道' },
        { gx: 70, gy: 44, to: 'emeishan', toGx: 1, toGy: 52, label: '峨眉山罗浮洞' },
      ],
      npc: { gx: 48, gy: 44, name: '元始天尊' },`, true);
rep(GEN, `      // 西口 → 三重阶陛 → 宫前广场 → 大殿`,
  `      // 西口 → 三重阶陛 → 宫前广场 → 大殿；东支路：宫墙东出，通峨眉罗浮洞`, true);
rep(GEN, `      line([[1, 44], [20, 44]], 6, 'ground_stone');`,
  `      line([[1, 44], [20, 44]], 6, 'ground_stone');
      line([[36, 44], [70, 44]], 5, 'ground_stone');`, true);

// ---- world.ts 配对（isoExit 形态） ----
// taoyuan 不变（已有四门）
// 穿云岭：+西口凤鸣山
rep(WS, `isoExit('wild_heifeng', 126, 62, 'wild_shanxiao', 1, 52, '梅山'),`,
  `isoExit('wild_heifeng', 126, 62, 'wild_shanxiao', 1, 52, '梅山'),
isoExit('wild_heifeng', 1, 62, 'fengmingshan', 40, 1, '凤鸣山'),`);
// 黄泉鬼渡：+北口绝龙岭、+西口骷髅山
rep(WS, `isoExit('wild_luanzang', 73, 126, 'difu', 40, 1, '朝歌 · 鹿台'),`,
  `isoExit('wild_luanzang', 73, 126, 'difu', 40, 1, '朝歌 · 鹿台'),
isoExit('wild_luanzang', 11, 1, 'juelongling', 60, 1, '绝龙岭'),
isoExit('wild_luanzang', 1, 64, 'wild_shanxiao', 52, 102, '骷髅山白骨洞'),`);
// 骷髅山：+南口黄泉鬼渡
rep(WS, `isoExit('wild_shanxiao', 102, 52, 'meishan', 1, 44, '梅山'),`,
  `isoExit('wild_shanxiao', 102, 52, 'meishan', 1, 44, '梅山'),
isoExit('wild_shanxiao', 52, 102, 'wild_luanzang', 1, 64, '黄泉鬼渡'),`);
// 女娲宫：+东口鹿台
rep(WS, `isoExit('nvwagong', 44, 86, 'zhaoge', 48, 1, '朝歌城'),`,
  `isoExit('nvwagong', 44, 86, 'zhaoge', 48, 1, '朝歌城'),
isoExit('nvwagong', 86, 44, 'difu', 78, 48, '朝歌 · 鹿台'),`);
// 鹿台：+东口女娲宫、+东口渑池
rep(WS, `isoExit('difu', 1, 40, 'zhaoge', 94, 48, '朝歌城'),`,
  `isoExit('difu', 1, 40, 'zhaoge', 94, 48, '朝歌城'),
isoExit('difu', 78, 48, 'nvwagong', 86, 44, '女娲宫'),
isoExit('difu', 78, 48, 'mianchi', 70, 1, '渑池县'),`);
// 摘星楼：+东口陈塘关（西口已是陈塘关？——西口原为女娲宫已改陈塘关，此条为幂等保护）
// 汜水关：+北口绝龙岭（原绝龙岭西口改指北口）
rep(WS, `isoExit('sishuiguan', 1, 44, 'chuanyunguan', 86, 52, '穿云关'),`,
  `isoExit('sishuiguan', 1, 44, 'chuanyunguan', 86, 52, '穿云关'),
isoExit('sishuiguan', 48, 1, 'juelongling', 118, 52, '绝龙岭'),`);
// 绝龙岭：+北口黄泉鬼渡
rep(WS, `isoExit('juelongling', 118, 52, 'sishuiguan', 48, 1, '汜水关'),`,
  `isoExit('juelongling', 118, 52, 'sishuiguan', 48, 1, '汜水关'),
isoExit('juelongling', 60, 1, 'wild_luanzang', 11, 1, '黄泉鬼渡'),`);
// 燕山：+东口界牌关、+北口终南山
rep(WS, `exits: [isoExit('yanshan', 1, 44, 'jizhou', 1, 52, '冀州')],`,
  `exits: [
    isoExit('yanshan', 1, 44, 'jizhou', 1, 52, '冀州'),
    isoExit('yanshan', 78, 44, 'jiepaiguan', 1, 44, '界牌关'),
    isoExit('yanshan', 40, 1, 'zhongnanshan', 44, 102, '终南山'),
  ],`);
// 终南山：北口已是磻溪 ✓；+西口燕山
rep(WS, `exits: [isoExit('zhongnanshan', 44, 102, 'panxi', 44, 94, '磻溪')],`,
  `exits: [
    isoExit('zhongnanshan', 44, 102, 'panxi', 44, 94, '磻溪'),
    isoExit('zhongnanshan', 1, 52, 'yanshan', 40, 1, '燕山'),
  ],`);
// 乾元山：+南口梅山、+北口金鳌岛
rep(WS, `isoExit('qianyuan', 1, 36, 'chentangguan', 86, 36, '陈塘关'),`,
  `isoExit('qianyuan', 1, 36, 'chentangguan', 86, 36, '陈塘关'),
isoExit('qianyuan', 46, 70, 'meishan', 40, 1, '梅山'),
isoExit('qianyuan', 46, 1, 'jinaodao', 1, 44, '金鳌岛碧游宫'),`);
// 梅山：+北口乾元山
rep(WS, `isoExit('meishan', 1, 44, 'wild_shanxiao', 102, 52, '骷髅山白骨洞'),`,
  `isoExit('meishan', 1, 44, 'wild_shanxiao', 102, 52, '骷髅山白骨洞'),
isoExit('meishan', 40, 1, 'qianyuan', 46, 70, '乾元山金光洞'),`);
// 金鳌岛：+西口峨眉罗浮洞
rep(WS, `isoExit('jinaodao', 102, 44, 'sanxiandao', 1, 36, '三仙岛'),`,
  `isoExit('jinaodao', 102, 44, 'sanxiandao', 1, 36, '三仙岛'),
isoExit('jinaodao', 1, 44, 'emeishan', 1, 52, '峨眉山罗浮洞'),`);
// 峨眉罗浮洞：+西口金鳌岛
rep(WS, `isoExit('emeishan', 70, 52, 'wild_kunlun', 1, 44, '昆仑山道'),`,
  `isoExit('emeishan', 70, 52, 'wild_kunlun', 1, 44, '昆仑山道'),
isoExit('emeishan', 1, 52, 'jinaodao', 1, 44, '金鳌岛碧游宫'),`);
// 云梦泽：+西口磻溪
rep(WS, `exits: [isoExit('wild_yunmeng', 50, 1, 'taoyuan', 62, 126, '西岐城')],`,
  `exits: [
    isoExit('wild_yunmeng', 50, 1, 'taoyuan', 62, 126, '西岐城'),
    isoExit('wild_yunmeng', 1, 44, 'panxi', 1, 40, '磻溪'),
  ],`);
// 磻溪：+西口云梦泽
rep(WS, `isoExit('panxi', 44, 94, 'zhongnanshan', 44, 102, '终南山'),`,
  `isoExit('panxi', 44, 94, 'zhongnanshan', 44, 102, '终南山'),
isoExit('panxi', 1, 40, 'wild_yunmeng', 1, 44, '云梦泽'),`);
// 界牌关：+西口燕山（world 侧此前已删，恢复）
rep(WS, `isoExit('jiepaiguan', 44, 1, 'lintongguan', 40, 98, '临潼关'),`,
  `isoExit('jiepaiguan', 44, 1, 'lintongguan', 40, 98, '临潼关'),
isoExit('jiepaiguan', 1, 44, 'yanshan', 78, 44, '燕山'),`);
// 穿云关：+北口渑池
rep(WS, `isoExit('chuanyunguan', 86, 52, 'sishuiguan', 1, 44, '汜水关'),`,
  `isoExit('chuanyunguan', 86, 52, 'sishuiguan', 1, 44, '汜水关'),
isoExit('chuanyunguan', 44, 1, 'mianchi', 44, 1, '渑池县'),`);
// 渑池县：+北口穿云关
rep(WS, `isoExit('mianchi', 102, 48, 'zhaoge', 1, 30, '朝歌城'),`,
  `isoExit('mianchi', 102, 48, 'zhaoge', 1, 30, '朝歌城'),
isoExit('mianchi', 44, 1, 'chuanyunguan', 44, 102, '穿云关'),
isoExit('mianchi', 70, 1, 'difu', 78, 48, '朝歌 · 鹿台'),`);
writeFileSync(WS, s);
