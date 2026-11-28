import { readFileSync, writeFileSync } from 'node:fs';
const p = new URL('../src/core/world.ts', import.meta.url);
let s = readFileSync(p, 'utf8');
const EOL = s.includes('\r\n') ? '\r\n' : '\n';
const re = /exits: \[\r?\n(?:\s*isoExit\('zhaoge'[^\n]*\r?\n)+\s*\],/;
const m = s.match(re);
if (!m) { console.log('未找到 zhaoge exits 块'); process.exit(1); }
const block = [
  'exits: [',
  "      isoExit('zhaoge', 48, 1, 'nvwagong', 44, 86, '女娲宫'),",
  "      isoExit('zhaoge', 20, 1, 'jizhou', 86, 52, '冀州'),",
  "      isoExit('zhaoge', 94, 48, 'difu', 1, 40, '朝歌 · 鹿台'),",
  "      isoExit('zhaoge', 94, 70, 'zhaixinglou', 1, 48, '摘星楼'),",
  "      isoExit('zhaoge', 1, 30, 'mianchi', 102, 48, '渑池县'),",
  '    ],',
].join(EOL);
s = s.replace(m[0], block);
writeFileSync(p, s);
console.log('zhaoge 出口已按罗盘序重排');
