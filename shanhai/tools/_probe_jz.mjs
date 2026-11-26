/** 探测 jizhou/luanzang 布局：落点可走性与出口锚点 */
import { readFileSync } from 'node:fs';
import { buildCollision } from '../src/core/iso.ts';
const keyOf = (gx, gy) => `${gx},${gy}`;
const load = (id) => JSON.parse(readFileSync(new URL(`../public/assets/art/iso/${id}.json`, import.meta.url), 'utf8'));
for (const id of ['jizhou', 'wild_luanzang']) {
  const raw = load(id);
  const col = buildCollision(raw);
  const exits = raw.anchors.exits.map((e) => `${e.gx},${e.gy}→${e.to}(${e.toGx},${e.toGy}) ${e.label}`);
  console.log(`[${id}] exits:`, exits.join(' | '));
  if (id === 'jizhou') {
    for (const [gx, gy] of [[86, 52], [85, 52], [84, 52]]) {
      const k = keyOf(gx, gy);
      console.log(`  (${gx},${gy}) ground=${col.ground.has(k)} blocked=${col.blocked.has(k)}`);
    }
  }
}
