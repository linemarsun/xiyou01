/** 三十图织网：16 条新边（生成器主题侧，全部复用/新铺路边） */
import { readFileSync, writeFileSync } from 'node:fs';
const p = new URL('./gen-iso-maps.mjs', import.meta.url);
let s = readFileSync(p, 'utf8');
const EOL = s.includes('\r\n') ? '\r\n' : '\n';
const L = (t) => t.replace(/\n/g, EOL);
let n = 0;
function rep(a, b) {
  const an = L(a), bn = L(b);
  if (!s.includes(an)) { console.log('[MISS]', a.slice(0, 76).replace(/\n/g, '⏎')); return; }
  s = s.split(an).join(bn);
  n++;
}

// E1 燕山 ⇄ 终南山（恢复旧链）
rep(`        { gx: 44, gy: 102, to: 'panxi', toGx: 44, toGy: 94, label: '磻溪' },`,
  `        { gx: 44, gy: 102, to: 'panxi', toGx: 44, toGy: 94, label: '磻溪' },
        { gx: 1, gy: 52, to: 'yanshan', toGx: 40, toGy: 1, label: '燕山' },`);
rep(`      // 西口 → 栈道 → 山腰平台\n      line([[78, 44], [40, 44], [40, 20]], 5, 'ground_dirt');\n      line([[40, 44], [1, 44]], 5, 'ground_dirt');`,
  `      // 西口 → 栈道 → 山腰平台；北支路：山腰北上天门，通终南山\n      line([[78, 44], [40, 44], [40, 20]], 5, 'ground_dirt');\n      line([[40, 44], [1, 44]], 5, 'ground_dirt');\n      line([[40, 20], [40, 1]], 4, 'ground_dirt');`);

// E2 绝龙岭 ⇄ 黄泉鬼渡（阴间线）
rep(`        { gx: 118, gy: 52, to: 'sishuiguan', toGx: 48, toGy: 1, label: '汜水关' },`,
  `        { gx: 118, gy: 52, to: 'sishuiguan', toGx: 48, toGy: 1, label: '汜水关' },
        { gx: 60, gy: 1, to: 'wild_luanzang', toGx: 11, toGy: 1, label: '黄泉鬼渡' },`);
rep(`      // 东口 → 岭脊干道 → 深谷场坪（太师结阵处）\n      line([[118, 52], [76, 52]], 6, 'ground_dirt');`,
  `      // 东口 → 岭脊干道 → 深谷场坪（太师结阵处）；北支路：岭脊北上黄泉古道\n      line([[118, 52], [76, 52]], 6, 'ground_dirt');\n      line([[76, 52], [60, 1]], 5, 'ground_dirt');`);

// E2b 黄泉鬼渡：北口新增通绝龙岭
rep(`      exits: [
        { gx: 73, gy: 126, to: 'difu', toGx: 40, toGy: 1, label: '朝歌 · 鹿台' },
      ],`,
  `      exits: [
        { gx: 73, gy: 126, to: 'difu', toGx: 40, toGy: 1, label: '朝歌 · 鹿台' },
        { gx: 11, gy: 1, to: 'juelongling', toGx: 60, toGy: 1, label: '绝龙岭' },
      ],`);

// E10 黄泉鬼渡 ⇄ 骷髅山（阴间线，西堤西出/洞厅南口，双端路边已有）
rep(`        { gx: 11, gy: 1, to: 'juelongling', toGx: 60, toGy: 1, label: '绝龙岭' },`,
  `        { gx: 11, gy: 1, to: 'juelongling', toGx: 60, toGy: 1, label: '绝龙岭' },
        { gx: 1, gy: 64, to: 'wild_shanxiao', toGx: 52, toGy: 102, label: '骷髅山白骨洞' },`);
rep(`      // 西支路：西堤西出，通往冀州\n      line([[37, 64], [1, 64]], 5, 'ground_stone');`,
  `      // 西支路：西堤西出，通往骷髅山（原冀州官道旧址）\n      line([[37, 64], [1, 64]], 5, 'ground_stone');`);
rep(`      exits: [
        { gx: 1, gy: 52, to: 'wild_heifeng', toGx: 126, toGy: 62, label: '穿云岭古道' },
        { gx: 102, gy: 52, to: 'meishan', toGx: 1, toGy: 44, label: '梅山' },
      ],`,
  `      exits: [
        { gx: 1, gy: 52, to: 'wild_heifeng', toGx: 126, toGy: 62, label: '穿云岭古道' },
        { gx: 102, gy: 52, to: 'meishan', toGx: 1, toGy: 44, label: '梅山' },
        { gx: 52, gy: 102, to: 'wild_luanzang', toGx: 1, toGy: 64, label: '黄泉鬼渡' },
      ],`);

// E3 女娲宫 ⇄ 朝歌·鹿台（朝歌城内互连，双端路边已有/新铺）
rep(`      exits: [
        { gx: 44, gy: 86, to: 'zhaoge', toGx: 48, toGy: 1, label: '朝歌城' },
      ],`,
  `      exits: [
        { gx: 44, gy: 86, to: 'zhaoge', toGx: 48, toGy: 1, label: '朝歌城' },
        { gx: 86, gy: 44, to: 'difu', toGx: 78, toGy: 48, label: '朝歌 · 鹿台' },
      ],`);
rep(`        { gx: 1, gy: 40, to: 'zhaoge', toGx: 1, toGy: 30, label: '渑池县' },`,
  `        { gx: 1, gy: 40, to: 'zhaoge', toGx: 1, toGy: 30, label: '渑池县' },
        { gx: 78, gy: 48, to: 'nvwagong', toGx: 86, toGy: 44, label: '女娲宫' },`);
rep(`      // 西支路：黄泉道西出，通往朝歌城\n      line([[40, 48], [1, 40]], 5, 'ground_stone');`,
  `      // 西支路：黄泉道西出，通往朝歌城；东支路：横河北岸东出，通女娲宫\n      line([[40, 48], [1, 40]], 5, 'ground_stone');\n      line([[40, 48], [78, 48]], 5, 'ground_stone');`);

// E4 穿云岭 ⇄ 凤鸣山（岐山连山，双端路边已有/新铺）
rep(`        { gx: 64, gy: 94, to: 'wild_kunlun', toGx: 60, toGy: 1, label: '昆仑山道' },`,
  `        { gx: 64, gy: 94, to: 'wild_kunlun', toGx: 60, toGy: 1, label: '昆仑山道' },
        { gx: 1, gy: 62, to: 'fengmingshan', toGx: 40, toGy: 1, label: '凤鸣山' },`);
rep(`      // 四座指路牌坊分立四个山口，牌坊中列可穿行\n      for (const [gx, gy] of [[36, 6], [7, 68], [118, 68], [60, 88]]) placeNear('paifang', gx, gy, 3, 3);`,
  `      // 四座指路牌坊分立四个山口，牌坊中列可穿行\n      for (const [gx, gy] of [[36, 6], [7, 68], [118, 68], [60, 88]]) placeNear('paifang', gx, gy, 3, 3);\n      // 西支路复辟：西堤古道通凤鸣山（岐山连脉）\n      // （西行旧路 [[62,64],[22,64],[1,62]] 已在主干中，无需新铺）`);
rep(`      exits: [
        { gx: 40, gy: 78, to: 'panxi', toGx: 44, toGy: 94, label: '磻溪' },
        { gx: 78, gy: 40, to: 'xidacamp', toGx: 1, toGy: 44, label: '西岐大营' },
      ],`,
  `      exits: [
        { gx: 40, gy: 78, to: 'panxi', toGx: 44, toGy: 94, label: '磻溪' },
        { gx: 78, gy: 40, to: 'xidacamp', toGx: 1, toGy: 44, label: '西岐大营' },
        { gx: 40, gy: 1, to: 'wild_heifeng', toGx: 1, toGy: 62, label: '穿云岭古道' },
      ],`);
rep(`      // 南口 → 山道 → 凤鸣台\n      line([[40, 78], [40, 52]], 5, 'ground_dirt');`,
  `      // 南口 → 山道 → 凤鸣台；北支路：凤鸣台北上，通穿云岭\n      line([[40, 78], [40, 52]], 5, 'ground_dirt');\n      line([[40, 52], [40, 1]], 4, 'ground_dirt');`);

// E5 云梦泽 ⇄ 磻溪（泽西 ↔ 溪东）
rep(`      exits: [
        { gx: 50, gy: 1, to: 'taoyuan', toGx: 62, toGy: 126, label: '西岐城' },
      ],`,
  `      exits: [
        { gx: 50, gy: 1, to: 'taoyuan', toGx: 62, toGy: 126, label: '西岐城' },
        { gx: 1, gy: 44, to: 'panxi', toGx: 1, toGy: 40, label: '磻溪' },
      ],`);
rep(`      // 西支路：西岸小径向西，通往渭水磻溪\n      line([[26, 44], [1, 44]], 5, 'ground_dirt');`,
  `      // 西支路：西岸小径向西，通往磻溪（磻溪东口对开）\n      line([[26, 44], [1, 44]], 5, 'ground_dirt');`);
rep(`      // 东口 → 溪畔小径 → 钓台坪；北支路：钓台北上，通凤鸣山；南支路：跨溪南渡，通终南山\n      line([[86, 44], [56, 40], [40, 52]], 5, 'ground_dirt');\n      line([[56, 40], [44, 1]], 5, 'ground_dirt');\n      line([[40, 52], [44, 94]], 5, 'ground_dirt');`,
  `      // 东口 → 溪畔小径 → 钓台坪；北支路：通凤鸣山；南支路：通终南山；西支路：泽畔西行，通云梦泽\n      line([[86, 44], [56, 40], [40, 52]], 5, 'ground_dirt');\n      line([[56, 40], [44, 1]], 5, 'ground_dirt');\n      line([[40, 52], [44, 94]], 5, 'ground_dirt');\n      line([[56, 40], [1, 40]], 5, 'ground_dirt');`);
rep(`        { gx: 86, gy: 44, to: 'taoyuan', toGx: 1, toGy: 64, label: '西岐城' },`,
  `        { gx: 86, gy: 44, to: 'taoyuan', toGx: 1, toGy: 64, label: '西岐城' },
        { gx: 1, gy: 40, to: 'wild_yunmeng', toGx: 1, toGy: 44, label: '云梦泽' },`);

// E7 峨眉罗浮洞 ⇄ 金鳌岛（截教线）
rep(`        { gx: 70, gy: 52, to: 'wild_kunlun', toGx: 1, toGy: 44, label: '昆仑山道' },`,
  `        { gx: 70, gy: 52, to: 'wild_kunlun', toGx: 1, toGy: 44, label: '昆仑山道' },
        { gx: 1, gy: 52, to: 'jinaodao', toGx: 1, toGy: 44, label: '金鳌岛碧游宫' },`);
rep(`      // 东口 → 山道 → 洞前广场\n      line([[70, 52], [40, 52]], 5, 'ground_dirt');`,
  `      // 东口 → 山道 → 洞前广场；西支路：洞府西出，海路通金鳌岛\n      line([[70, 52], [40, 52]], 5, 'ground_dirt');\n      line([[40, 52], [1, 52]], 5, 'ground_dirt');`);
rep(`        { gx: 52, gy: 1, to: 'chentangguan', toGx: 44, toGy: 70, label: '陈塘关' },`,
  `        { gx: 52, gy: 1, to: 'chentangguan', toGx: 44, toGy: 70, label: '陈塘关' },
        { gx: 1, gy: 44, to: 'emeishan', toGx: 1, toGy: 52, label: '峨眉山罗浮洞' },`);
rep(`      line([[52, 44], [80, 56], [78, 74]], 5, 'ground_dirt');\n      // 东支路：宫前广场东出，通往三仙岛海路\n      line([[80, 56], [102, 44]], 5, 'ground_dirt');`,
  `      line([[52, 44], [80, 56], [78, 74]], 5, 'ground_dirt');\n      // 东支路：宫前广场东出，通往三仙岛海路；西支路：环岛西行，通峨眉罗浮洞\n      line([[80, 56], [102, 44]], 5, 'ground_dirt');\n      line([[24, 52], [1, 44]], 5, 'ground_dirt');`);

// E9 界牌关 ⇄ 燕山（恢复旧链，双端路边已有）
rep(`        { gx: 44, gy: 78, to: 'xidacamp', toGx: 48, toGy: 1, label: '西岐大营' },\n        { gx: 44, gy: 1, to: 'lintongguan', toGx: 40, toGy: 98, label: '临潼关' },\n      ],`,
  `        { gx: 44, gy: 78, to: 'xidacamp', toGx: 48, toGy: 1, label: '西岐大营' },\n        { gx: 44, gy: 1, to: 'lintongguan', toGx: 40, toGy: 98, label: '临潼关' },\n        { gx: 1, gy: 44, to: 'yanshan', toGx: 78, toGy: 44, label: '燕山' },\n      ],`, true);
rep(`        { gx: 1, gy: 44, to: 'jizhou', toGx: 1, toGy: 52, label: '冀州' },\n      ],`,
  `        { gx: 1, gy: 44, to: 'jizhou', toGx: 1, toGy: 52, label: '冀州' },\n        { gx: 78, gy: 44, to: 'jiepaiguan', toGx: 1, toGy: 44, label: '界牌关' },\n      ],`);

// E11 乾元山 ⇄ 梅山（东境互连）
rep(`        { gx: 1, gy: 36, to: 'chentangguan', toGx: 1, toGy: 36, label: '陈塘关' },\n      ],\n      npc: { gx: 46, gy: 34, name: '太乙真人' },`,
  `        { gx: 1, gy: 36, to: 'chentangguan', toGx: 1, toGy: 36, label: '陈塘关' },\n        { gx: 46, gy: 70, to: 'meishan', toGx: 40, toGy: 1, label: '梅山' },\n      ],\n      npc: { gx: 46, gy: 34, name: '太乙真人' },`);
rep(`      // 西口 → 之字山道 → 山腰洞前广场 → 金光洞大殿\n      line([[1, 36], [28, 36], [46, 24], [46, 40]], 6, 'ground_stone');`,
  `      // 西口 → 之字山道 → 山腰洞前广场 → 金光洞大殿；南支路：洞府南下山道，通梅山\n      line([[1, 36], [28, 36], [46, 24], [46, 40]], 6, 'ground_stone');\n      line([[46, 52], [46, 70]], 4, 'ground_stone');`);
rep(`        { gx: 1, gy: 44, to: 'wild_shanxiao', toGx: 102, toGy: 52, label: '骷髅山白骨洞' },\n      ],`,
  `        { gx: 1, gy: 44, to: 'wild_shanxiao', toGx: 102, toGy: 52, label: '骷髅山白骨洞' },\n        { gx: 40, gy: 1, to: 'qianyuan', toGx: 46, toGy: 70, label: '乾元山金光洞' },\n      ],`);
rep(`      // 西口 → 山寨主道 → 寨心场坪（袁洪称尊处）\n      line([[1, 44], [40, 44]], 6, 'ground_dirt');`,
  `      // 西口 → 山寨主道 → 寨心场坪（袁洪称尊处）；北支路：寨北小径，通乾元山\n      line([[1, 44], [40, 44]], 6, 'ground_dirt');\n      line([[40, 44], [40, 1]], 4, 'ground_dirt');`);

// E12 乾元山 ⇄ 金鳌岛（东海两据点）
rep(`        { gx: 46, gy: 70, to: 'meishan', toGx: 40, toGy: 1, label: '梅山' },\n      ],`,
  `        { gx: 46, gy: 70, to: 'meishan', toGx: 40, toGy: 1, label: '梅山' },\n        { gx: 46, gy: 1, to: 'jinaodao', toGx: 1, toGy: 44, label: '金鳌岛碧游宫' },\n      ],`);
rep(`      // 西口 → 之字山道 → 山腰洞前广场 → 金光洞大殿；南支路：洞府南下山道，通梅山\n      line([[1, 36], [28, 36], [46, 24], [46, 40]], 6, 'ground_stone');\n      line([[46, 52], [46, 70]], 4, 'ground_stone');`,
  `      // 西口 → 之字山道 → 山腰洞前广场 → 金光洞大殿；南支路：通梅山；北支路：山巅北望，海路通金鳌岛\n      line([[1, 36], [28, 36], [46, 24], [46, 40]], 6, 'ground_stone');\n      line([[46, 52], [46, 70]], 4, 'ground_stone');\n      line([[46, 24], [46, 1]], 4, 'ground_stone');`);

// E13 玉虚宫 ⇄ 峨眉罗浮洞（昆仑两洞府直连）
rep(`      exits: [isoExit('yuxugong', 1, 44, 'wild_kunlun', 118, 44, '昆仑山道')],`,
  `      exits: [
        isoExit('yuxugong', 1, 44, 'wild_kunlun', 118, 44, '昆仑山道'),
        isoExit('yuxugong', 70, 44, 'emeishan', 1, 52, '峨眉山罗浮洞'),
      ],`);
rep(`      // 西口 → 三重阶陛 → 宫前广场 → 大殿\n      line([[1, 44], [20, 44]], 6, 'ground_stone');`,
  `      // 西口 → 三重阶陛 → 宫前广场 → 大殿；东支路：宫墙东出，通峨眉罗浮洞\n      line([[1, 44], [20, 44]], 6, 'ground_stone');\n      line([[36, 44], [70, 44]], 5, 'ground_stone');`);

// E14 渑池县 ⇄ 朝歌·鹿台（黄河北渡，双端路边已有/新铺）
rep(`        { gx: 1, gy: 44, to: 'sishuiguan', toGx: 94, toGy: 44, label: '汜水关' },\n        { gx: 102, gy: 48, to: 'zhaoge', toGx: 1, toGy: 30, label: '朝歌城' },\n      ],`,
  `        { gx: 1, gy: 44, to: 'sishuiguan', toGx: 94, toGy: 44, label: '汜水关' },\n        { gx: 102, gy: 48, to: 'zhaoge', toGx: 1, toGy: 30, label: '朝歌城' },\n        { gx: 70, gy: 1, to: 'difu', toGx: 78, toGy: 48, label: '朝歌 · 鹿台' },\n      ],`);
rep(`      // 纵贯官道：南口 → 县城广场 → 北口；东官道：县城东出，直通朝歌城\n      line([[44, 94], [44, 1]], 6, 'ground_stone');\n      line([[44, 48], [102, 48]], 5, 'ground_stone');`,
  `      // 纵贯官道：南口 → 县城广场 → 北口；东官道：东出直通朝歌城；北支路：县北渡河北上，通朝歌·鹿台\n      line([[44, 94], [44, 1]], 6, 'ground_stone');\n      line([[44, 48], [102, 48]], 5, 'ground_stone');\n      line([[70, 48], [70, 1]], 5, 'ground_stone');`);
rep(`        { gx: 78, gy: 48, to: 'nvwagong', toGx: 86, toGy: 44, label: '女娲宫' },`,
  `        { gx: 78, gy: 48, to: 'nvwagong', toGx: 86, toGy: 44, label: '女娲宫' },\n        { gx: 78, gy: 48, to: 'mianchi', toGx: 70, toGy: 1, label: '渑池县' },`, true);

// E23 穿云关 ⇄ 渑池县（北南相邻直连，双端路边已有）
rep(`        { gx: 86, gy: 52, to: 'sishuiguan', toGx: 1, toGy: 44, label: '汜水关' },\n      ],`,
  `        { gx: 86, gy: 52, to: 'sishuiguan', toGx: 1, toGy: 44, label: '汜水关' },\n        { gx: 44, gy: 1, to: 'mianchi', toGx: 44, toGy: 1, label: '渑池县' },\n      ],`, true);
rep(`        { gx: 102, gy: 48, to: 'zhaoge', toGx: 1, toGy: 30, label: '朝歌城' },\n        { gx: 70, gy: 1, to: 'difu', toGx: 78, toGy: 48, label: '朝歌 · 鹿台' },\n      ],`,
  `        { gx: 102, gy: 48, to: 'zhaoge', toGx: 1, toGy: 30, label: '朝歌城' },\n        { gx: 70, gy: 1, to: 'difu', toGx: 78, toGy: 48, label: '朝歌 · 鹿台' },\n        { gx: 44, gy: 1, to: 'chuanyunguan', toGx: 44, toGy: 102, label: '穿云关' },\n      ],`, true);

writeFileSync(p, s);
console.log(`完成 ${n} 处修改`);
