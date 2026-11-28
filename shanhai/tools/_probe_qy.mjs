/** 读 qianyuan 主题 exits 块 */
import { readFileSync } from 'node:fs';
const lines = readFileSync(new URL('./gen-iso-maps.mjs', import.meta.url), 'utf8').split('\n');
let inQ = false;
lines.forEach((l, i) => {
  if (l.includes("id: 'qianyuan'")) inQ = true;
  if (inQ && /exits: \[|to: '|\],\s*$|npc:/.test(l)) console.log(`${i + 1}: ${l.trim().slice(0, 90)}`);
  if (inQ && /id: '/.test(l) && i > 600 && !l.includes("'qianyuan'")) inQ = false;
});
