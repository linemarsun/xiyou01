/** fengmingshan 北口 + difu 两口锚点补齐 */
import { readFileSync, writeFileSync } from 'node:fs';
const EOL = '\r\n';
function rep(p, a, b, optional = false) {
  let s = readFileSync(p, 'utf8');
  const an = a.replace(/\n/g, EOL), bn = b.replace(/\n/g, EOL);
  if (!s.includes(an)) {
    if (optional) { console.log('[SKIP]', a.slice(0, 48)); return; }
    console.log('[MISS]', String(p).split('/').pop(), a.slice(0, 64).replace(/\n/g, '⏎'));
    return;
  }
  s = s.split(an).join(bn);
  writeFileSync(p, s);
  console.log('ok:', String(p).split('/').pop(), '←', a.slice(0, 44).replace(/\n/g, '⏎'));
}
const WS = new URL('../src/core/world.ts', import.meta.url);
const GEN = new URL('./gen-iso-maps.mjs', import.meta.url);

// 1) fengmingshan world：+北口穿云岭
rep(WS, `isoExit('fengmingshan', 78, 40, 'xidacamp', 1, 44, '西岐大营'),`,
  `isoExit('fengmingshan', 78, 40, 'xidacamp', 1, 44, '西岐大营'),
isoExit('fengmingshan', 40, 1, 'wild_heifeng', 1, 62, '穿云岭古道'),`);

// 2) difu 主题：+东口女娲宫 / 渑池（同位双牌）
rep(GEN, `        { gx: 1, gy: 40, to: 'zhaoge', toGx: 1, toGy: 30, label: '渑池县' },`,
  `        { gx: 1, gy: 40, to: 'zhaoge', toGx: 1, toGy: 30, label: '渑池县' },
        { gx: 78, gy: 48, to: 'nvwagong', toGx: 86, toGy: 44, label: '女娲宫' },
        { gx: 78, gy: 48, to: 'mianchi', toGx: 70, toGy: 1, label: '渑池县' },`);
