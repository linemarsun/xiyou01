/** 云京全量布局提取：分区/建筑/街道/装饰 清单与密度统计 */
import { readFileSync } from 'node:fs';
const layout = JSON.parse(readFileSync(new URL('../public/assets/art/iso/taoyuan.json', import.meta.url), 'utf8'));
const cnt = {};
for (const it of layout.items) cnt[it.type] = (cnt[it.type] ?? 0) + 1;
console.log('=== 构件类型统计 ===');
for (const [t, n] of Object.entries(cnt).sort((a, b) => b[1] - a[1])) console.log(`${String(n).padStart(4)}  ${t}`);

// 四坊划分（以鼓楼 62,62 为中心，主街 x59-68 / y59-68）
const QUAD = (gx, gy) => {
  if (gx <= 58 && gy <= 58) return '西北坊';
  if (gx >= 69 && gy <= 58) return '东北坊';
  if (gx <= 58 && gy >= 69) return '西南坊';
  if (gx >= 69 && gy >= 69) return '东南坊';
  return '主街带';
};
console.log('\n=== 建筑分布（按坊） ===');
const byQuad = {};
for (const it of layout.items) {
  if (!/house|hall|tavern|shop|palace|pagoda|bell|yamen|hotel|bank/.test(it.type)) continue;
  const w = it.w ?? 1, h = it.h ?? 1;
  const q = QUAD(it.gx + w / 2 - 0.5, it.gy + h / 2 - 0.5);
  (byQuad[q] ??= []).push(`${it.type}(${it.gx},${it.gy},${w}x${h})`);
}
for (const [q, list] of Object.entries(byQuad).sort()) {
  console.log(`${q}: ${list.length} 座`);
  console.log('   ' + list.join('  '));
}
console.log('\n=== 石板街道条带 ===');
for (const it of layout.items) {
  if (it.type !== 'ground_stone') continue;
  console.log(`stone (${it.gx},${it.gy}) ${it.w ?? 1}x${it.h ?? 1}`);
}
console.log('\n=== 水面/土路 ===');
for (const it of layout.items) {
  if (it.type === 'ground_water' || it.type === 'ground_dirt') console.log(`${it.type} (${it.gx},${it.gy}) ${it.w ?? 1}x${it.h ?? 1}`);
}
console.log('\n=== 装饰统计 ===');
const deco = {};
for (const it of layout.items) {
  if (/tree|rock|lantern|fence|well|flag/.test(it.type)) deco[it.type] = (deco[it.type] ?? 0) + 1;
}
for (const [t, n] of Object.entries(deco).sort((a, b) => b[1] - a[1])) console.log(`${String(n).padStart(4)}  ${t}`);
