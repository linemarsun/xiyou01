/** 撤除穿云关⇄渑池县直连（走廊经汜水关） */
import { readFileSync, writeFileSync } from 'node:fs';
const EOL = '\r\n';
function delLine(p, line) {
  let s = readFileSync(p, 'utf8');
  const an = line.replace(/\n/g, EOL);
  if (!s.includes(an)) { console.log('[SKIP 已删]', line.slice(0, 64)); return; }
  s = s.replace(an + EOL, '');
  writeFileSync(p, s);
  console.log('ok 已删:', String(p).split('/').pop(), '←', line.slice(0, 60));
}
const WS = new URL('../src/core/world.ts', import.meta.url);
const GEN = new URL('./gen-iso-maps.mjs', import.meta.url);
delLine(WS, `isoExit('chuanyunguan', 44, 1, 'mianchi', 44, 1, '渑池县'),`);
delLine(WS, `isoExit('mianchi', 44, 1, 'chuanyunguan', 44, 102, '穿云关'),`);
delLine(GEN, `        { gx: 44, gy: 1, to: 'mianchi', toGx: 44, toGy: 1, label: '渑池县' },`);
