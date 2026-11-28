/** routeExit 断言更新 */
import { readFileSync, writeFileSync } from 'node:fs';
const p = new URL('./regression.mjs', import.meta.url);
let s = readFileSync(p, 'utf8');
const a = `黄泉鬼渡→骷髅山需先经朝歌·鹿台`;
const b = `黄泉鬼渡西通骷髅山`;
if (s.includes(a)) { s = s.split(a).join(b); console.log('消息已更新'); }
const c = `eq(multi?.to, 'difu',`;
const d = `eq(multi?.to, 'wild_shanxiao',`;
if (s.includes(c)) { s = s.split(c).join(d); console.log('首跳期望已更新'); }
writeFileSync(p, s);
