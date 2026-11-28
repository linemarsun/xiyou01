/** yanshan 主题出口去重（按 gx,gy,to 唯一化） */
import { readFileSync, writeFileSync } from 'node:fs';
const p = new URL('./gen-iso-maps.mjs', import.meta.url);
let s = readFileSync(p, 'utf8');
const EOL = s.includes('\r\n') ? '\r\n' : '\n';
const lines = s.split(EOL);
// 定位 yanshan exits 块
let start = -1, end = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("id: 'yanshan'")) {
    for (let j = i; j < lines.length; j++) {
      if (lines[j].trim() === 'exits: [') { start = j; continue; }
      if (start >= 0 && lines[j].trim() === '],') { end = j; break; }
    }
    break;
  }
}
if (start < 0 || end < 0) { console.log('未定位到 yanshan exits'); process.exit(1); }
const block = lines.slice(start + 1, end);
const seen = new Set();
const kept = [];
for (const l of block) {
  const key = l.trim();
  if (seen.has(key)) { console.log('去重移除:', key.slice(0, 80)); continue; }
  seen.add(key);
  kept.push(l);
}
lines.splice(start + 1, block.length, ...kept);
writeFileSync(p, lines.join(EOL));
console.log(`yanshan exits 去重完成：${block.length} → ${kept.length}`);
