/** 读 difu 主题 exits 实际文本 */
import { readFileSync } from 'node:fs';
const lines = readFileSync(new URL('./gen-iso-maps.mjs', import.meta.url), 'utf8').split('\n');
let inDifu = false;
lines.forEach((l, i) => {
  if (l.includes("id: 'difu'")) inDifu = true;
  if (inDifu && /exits: \[|gx: \d+, gy: \d+, to:|\],\s*$|id: '/.test(l)) {
    console.log(`${i + 1}: ${l.trim().slice(0, 90)}`);
    if (inDifu && /id: '/.test(l) && i > 250 && !l.includes("'difu'")) inDifu = false;
  }
});
