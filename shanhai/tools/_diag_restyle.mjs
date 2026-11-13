// 临时诊断：参考图风格重排后的云京碰撞 / 连通性 / 玩法点位自检
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};
const entry = [
  './src/core/world.ts', './src/core/art.ts', './src/core/iso.ts', './src/core/iso-path.ts',
].map((p, i) => `export * as m${i} from '${p}';`).join('\n');
const bundled = await build({
  stdin: { contents: entry, resolveDir: ROOT, loader: 'ts' },
  bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent',
});
const mod = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const [world, art, iso] = [mod.m0, mod.m1, mod.m2];

const raw = JSON.parse(readFileSync(path.join(ROOT, 'public/assets/art/iso/taoyuan.json'), 'utf8'));
const layout = iso.expandLayout(raw);
const col = iso.buildCollision(layout);
const walk = (gx, gy) => {
  const p = iso.cellToWorld(layout.grid, gx, gy);
  return iso.isoWalkable(col, layout.grid, p.x, p.y);
};
const count = (t) => layout.items.filter((i) => i.type === t).length;

const m = world.WORLD_MAPS.taoyuan;
const gs = world.newGame({ classId: 'xiake', petId: 'linghu', playerName: '诊断' });
const checks = [
  ['路牌 (62,3)', 62, 3], ['出生点 (16,32)', 16, 32],
  ['NPC (32,32)', 32, 32], ['酒肆 (32,20)', 32, 20],
  ['北门券洞 (62,5)', 62, 5], ['北门券洞 (62,6)', 62, 6], ['北门内侧 (62,8)', 62, 8],
  ['南门券洞 (62,121)', 62, 121], ['南门内侧 (62,118)', 62, 118],
  ['西门券洞 (6,62)', 6, 62], ['东门券洞 (121,62)', 121, 62],
  ['北环 (63,44)', 63, 44], ['南环 (63,82)', 63, 82],
  ['西环 (44,63)', 44, 63], ['东环 (82,63)', 82, 63],
  ['宫门券洞 (63,78)', 63, 78], ['宫内 (63,76)', 63, 76],
  ['宫内 (55,60)', 55, 60], ['棋盘巷 (31,16)', 31, 16],
  ['城外 (62,2)', 62, 2], ['城外 (100,2)', 100, 2],
];
console.log('=== 可走格 ===');
for (const [name, x, y] of checks) console.log(`${walk(x, y) ? 'OK ' : 'BAD'} ${name}  walk=${walk(x, y)}`);

console.log('\n=== 玩法点（世界坐标）===');
for (const [name, p] of [['出生点', { x: gs.px, y: gs.py }], ['NPC', m.npc], ['酒肆', m.tavern], ...m.exits.map((e) => [e.label, e])]) {
  console.log(`${iso.isoWalkable(col, layout.grid, p.x, p.y) ? 'OK ' : 'BAD'} ${name} (${p.x},${p.y})`);
}

console.log('\n=== A* 连通 ===');
const start = { gx: 16, gy: 32 };
const goal = { gx: 62, gy: 3 };
const p = iso.findIsoPath(col, layout.grid, start, goal);
console.log('(16,32) -> (62,3):', p ? `path ${p.length} cells` : 'NULL');
for (const [fx, fy, tx, ty, label] of [
  [62, 3, 62, 40, '北门→北环'], [62, 40, 44, 63, '北环→西环'],
  [44, 63, 63, 82, '西环→南环'], [63, 82, 62, 121, '南环→南门'],
  [16, 32, 63, 82, '起点→南环'],
]) {
  const q = iso.findIsoPath(col, layout.grid, { gx: fx, gy: fy }, { gx: tx, gy: ty });
  console.log(`${label}: ${q ? q.length + ' cells' : 'NULL'}`);
}

console.log('\n=== 统计 ===');
console.log(JSON.stringify({
  items: layout.items.length,
  house: count('house'), gate_arch: count('gate_arch'),
  city_wall_corner: count('city_wall_corner'), palace_corner: count('palace_corner'),
  palace_hall: count('palace_hall'), palace_hall_s: count('palace_hall_s'),
  palace_gate: count('palace_gate'), pagoda: count('pagoda'),
  bridge: count('bridge'), ground_water: count('ground_water'),
  ground_marble: count('ground_marble'), ground_stone: count('ground_stone'),
  ground_dirt: count('ground_dirt'), tree: count('tree'),
  bell_tower: count('bell_tower'), city_gate_wide: count('city_gate_wide'),
  city_gate_wide_v: count('city_gate_wide_v'), city_gate_tower: count('city_gate_tower'),
  paifang: count('paifang'), fence: count('fence'), hall: count('hall'),
  well: count('well'), incense: count('incense'), stele: count('stele'),
  stall: count('stall'), crate: count('crate'),
}, null, 2));

// 房屋与石街相邻数量（回归有一条断言要求 0）
const stone = new Set();
for (const it of layout.items) {
  if (it.type !== 'ground_stone') continue;
  const s = iso.isoSize(it);
  for (let dy = 0; dy < s.h; dy++) for (let dx = 0; dx < s.w; dx++) stone.add(`${it.gx + dx},${it.gy + dy}`);
}
let adjacent = 0, treeOnStone = 0;
for (const it of layout.items.filter((i) => i.type === 'house')) {
  const s = iso.isoSize(it);
  for (let dy = 0; dy < s.h; dy++) for (let dx = 0; dx < s.w; dx++) {
    const gx = it.gx + dx, gy = it.gy + dy;
    for (const [nx, ny] of [[gx - 1, gy], [gx + 1, gy], [gx, gy - 1], [gx, gy + 1]]) if (stone.has(`${nx},${ny}`)) adjacent++;
  }
}
for (const it of layout.items.filter((i) => i.type === 'tree')) {
  if (stone.has(`${it.gx},${it.gy}`)) treeOnStone++;
}
console.log('\nhouse 紧邻石街格数 =', adjacent, ' / tree 压石街 =', treeOnStone);
