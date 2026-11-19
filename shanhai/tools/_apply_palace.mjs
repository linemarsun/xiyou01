/**
 * 宫城推倒重做：
 * 1. 宫城西移避开南北主街（旧东墙压街 x59-65，主街被切剩 3 格）；
 * 2. 新 enclosure X∈[46,58) × Y∈[70,88)：角楼塔 4 座 + 宫墙 2 厚环 + 南向宫门居中；
 * 3. 庭院退距：主殿居中、配殿西北角、汉白玉地面重铺；
 * 4. 白塔迁至湖东岸（园林坊点景）。
 */
import { readFileSync, writeFileSync } from 'node:fs';

const path = new URL('../public/assets/art/iso/taoyuan.json', import.meta.url);
const j = JSON.parse(readFileSync(path, 'utf8'));

// 1. 清空旧宫城件 + 新足迹内的一切非地面物件
const isOldPalace = (it) => it.type.startsWith('palace_') || it.type === 'pagoda' ||
  (it.type === 'ground_marble');
const inRegion = (it) => {
  const w = it.w ?? 1, h = it.h ?? 1;
  return it.gx < 58 && it.gx + w > 44 && it.gy < 89 && it.gy + h > 69;
};
const removed = [];
j.items = j.items.filter((it) => {
  if (isOldPalace(it)) { removed.push(`${it.type}(${it.gx},${it.gy})`); return false; }
  if (inRegion(it) && !it.type.startsWith('ground_')) {
    removed.push(`${it.type}(${it.gx},${it.gy})`);
    return false;
  }
  return true;
});

// 2. 新宫城（X∈[46,58) × Y∈[70,88)，墙厚 2，角楼塔坐四角）
const add = [
  // 四角角楼塔
  { type: 'palace_corner', gx: 46, gy: 70, w: 2, h: 2 },
  { type: 'palace_corner', gx: 56, gy: 70, w: 2, h: 2 },
  { type: 'palace_corner', gx: 46, gy: 86, w: 2, h: 2 },
  { type: 'palace_corner', gx: 56, gy: 86, w: 2, h: 2 },
  // 北墙 y70-71
  { type: 'palace_wall_u6', gx: 48, gy: 70, w: 6, h: 2 },
  { type: 'palace_wall_u2', gx: 54, gy: 70, w: 2, h: 2 },
  // 南墙 y86-87：宫门居中
  { type: 'palace_wall_u2', gx: 48, gy: 86, w: 2, h: 2 },
  { type: 'palace_gate', gx: 50, gy: 86, w: 4, h: 2 },
  { type: 'palace_wall_u2', gx: 54, gy: 86, w: 2, h: 2 },
  // 西墙 x46-47
  { type: 'palace_wall_v6', gx: 46, gy: 72, w: 2, h: 6 },
  { type: 'palace_wall_v6', gx: 46, gy: 78, w: 2, h: 6 },
  { type: 'palace_wall_v2', gx: 46, gy: 84, w: 2, h: 2 },
  // 东墙 x56-57
  { type: 'palace_wall_v6', gx: 56, gy: 72, w: 2, h: 6 },
  { type: 'palace_wall_v6', gx: 56, gy: 78, w: 2, h: 6 },
  { type: 'palace_wall_v2', gx: 56, gy: 84, w: 2, h: 2 },
  // 庭院（退距重排）
  { type: 'palace_hall', gx: 49, gy: 76, w: 6, h: 6 },
  { type: 'palace_hall_s', gx: 52, gy: 73, w: 4, h: 4 },
  { type: 'ground_marble', gx: 48, gy: 72, w: 8, h: 14 },
  // 白塔 → 湖东岸点景
  { type: 'pagoda', gx: 117, gy: 96, w: 3, h: 3 },
];
j.items.push(...add);

writeFileSync(path, JSON.stringify(j, null, 2) + '\n');
console.log(`移除 ${removed.length}：${removed.slice(0, 6).join(' ')}...`);
console.log(`新增 ${add.length} 项，总条目 ${j.items.length}`);
