/**
 * 四门衔接诊断 v5（最终版）：
 * 地面块按渲染器调色板真实上色 + 结构精灵按 z 序混合，
 * 合成图 = 游戏实际观感（缺色板的地基色兜底），
 * 并沿八条衔接面采样报告无覆盖孔洞。
 * 用法：node tools/_diag_junctions.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const ISO = fileURLToPath(new URL('../public/assets/art/iso/', import.meta.url));

const OFF = {
  city_wall_u6: { ax: 64, ay: -5 },
  city_wall_u2: { ax: 0, ay: -5 },
  city_wall_v6: { ax: -64, ay: -5 },
  city_wall_v2: { ax: 0, ay: -5 },
  city_wall_corner: { ax: 0, ay: -6 },
  city_gate_tower: { ax: 15.5, ay: -5 },
  city_gate_wide: { ax: 112, ay: -6 },
  city_gate_wide_v: { ax: -112, ay: -6 },
};
const SIZE = {
  city_wall_u6: [6, 2], city_wall_u2: [2, 2], city_wall_v6: [2, 6], city_wall_v2: [2, 2],
  city_wall_corner: [2, 2], city_gate_tower: [4, 3], city_gate_wide: [10, 3], city_gate_wide_v: [3, 10],
};
const isStruct = (t) => !!SIZE[t];
const isGroundName = (t) => t.startsWith('ground_');
const GROUND_PALETTE = {
  ground_grass: [0x6f, 0xa8, 0x4c],
  ground_stone: [0x8d, 0x85, 0x74],
  ground_dirt: [0x9c, 0x7c, 0x50],
  ground_water: [0x3a, 0x8c, 0xc0],
  ground_marble: [0xd8, 0xd2, 0xc2],
};

const sprites = {};
for (const n of Object.keys(SIZE)) sprites[n] = PNG.sync.read(readFileSync(ISO + n + '.png'));

const layout = JSON.parse(readFileSync(ISO + 'taoyuan.json', 'utf8'));
const g = layout.grid;

function fvOf(it, w, h) {
  return {
    x: g.ox + (it.gx + w - 1 - (it.gy + h - 1)) * 32,
    y: g.oy + (it.gx + w - 1 + it.gy + h - 1) * 16 + 16,
  };
}
function place(it) {
  const p = sprites[it.type], off = OFF[it.type];
  const [w, h] = SIZE[it.type];
  const fv = fvOf(it, w, h);
  const stretch = (it.type === 'city_gate_tower' || it.type === 'city_gate_wide') ? (p.width + 2) / p.width : 1;
  return { it, x: fv.x - off.ax - p.width * stretch / 2, y: fv.y - off.ay - p.height, fv, spr: p };
}
function pointInPoly(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/** 地面：复刻渲染器 —— 2×2 块多数投票定类型，按优先级顺序真实上色 */
function paintGround(comp, items) {
  const groundCells = new Map();
  for (const it of items) {
    if (!isGroundName(it.type)) continue;
    const w = it.w ?? 1, h = it.h ?? 1;
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
      groundCells.set(`${it.gx + dx},${it.gy + dy}`, it.type);
    }
  }
  const priority = { ground_grass: 0, ground_dirt: 1, ground_water: 2, ground_stone: 3, ground_marble: 3 };
  const blocks = new Map();
  for (const [k, type] of groundCells) {
    const [gx, gy] = k.split(',').map(Number);
    const bk = `${Math.floor(gx / 2) * 2},${Math.floor(gy / 2) * 2}`;
    const tally = blocks.get(bk) ?? new Map();
    tally.set(type, (tally.get(type) ?? 0) + 1);
    blocks.set(bk, tally);
  }
  const best = new Map();
  for (const [bk, tally] of blocks) {
    let bt = null, bs = -1;
    for (const [t, n] of tally) {
      const s = n * 10 + (priority[t] ?? 0);
      if (s > bs) { bs = s; bt = t; }
    }
    best.set(bk, bt);
  }
  const ordered = [...best.entries()].sort((a, b) => (priority[a[1]] ?? 0) - (priority[b[1]] ?? 0));
  const { png, cover, W, H } = comp;
  for (const [bk, type] of ordered) {
    const [bx, by] = bk.split(',').map(Number);
    const fv = fvOf({ gx: bx, gy: by }, 2, 2);
    const dx = Math.round(fv.x - comp.x0), dy = Math.round(fv.y - comp.y0);
    const corners = [[0, -64], [64, -32], [0, 0], [-64, -32]].map(([px, py]) => [dx + px, dy + py]);
    const col = GROUND_PALETTE[type] ?? [0x4a, 0x44, 0x50];
    const minX = Math.min(...corners.map((c) => c[0])), maxX = Math.max(...corners.map((c) => c[0]));
    const minY = Math.min(...corners.map((c) => c[1])), maxY = Math.max(...corners.map((c) => c[1]));
    for (let yy = minY; yy <= maxY; yy++) for (let xx = minX; xx <= maxX; xx++) {
      if (pointInPoly(xx + 0.5, yy + 0.5, corners) && xx >= 0 && yy >= 0 && xx < W && yy < H) {
        const di = (yy * W + xx) * 4;
        png.data[di] = col[0]; png.data[di + 1] = col[1]; png.data[di + 2] = col[2]; png.data[di + 3] = 255;
        cover[yy * W + xx] = -1;
      }
    }
  }
}
/** 构建窗口：地面上色 + 结构精灵按 z 序混合 */
function buildWindow(items) {
  const structs = items.filter((it) => isStruct(it.type)).map((it) => place(it));
  const x0 = Math.min(...structs.map((p) => p.x)) - 80;
  const y0 = Math.min(...structs.map((p) => p.y)) - 80;
  const CW = Math.ceil(Math.max(...structs.map((p) => p.x + p.spr.width)) + 80 - x0);
  const CH = Math.ceil(Math.max(...structs.map((p) => p.y + p.spr.height)) + 80 - y0);
  const out = new PNG({ width: CW, height: CH });
  for (let i = 0; i < CW * CH; i++) { out.data[i * 4] = 255; out.data[i * 4 + 1] = 0; out.data[i * 4 + 2] = 255; out.data[i * 4 + 3] = 255; }
  const cover = new Uint8Array(CW * CH);
  const comp = { png: out, cover, W: CW, H: CH, x0, y0, placed: structs };
  paintGround(comp, items);
  structs.sort((a, b) => a.fv.y - b.fv.y);
  structs.forEach((p, idx) => {
    const dx = Math.round(p.x - x0), dy = Math.round(p.y - y0);
    for (let yy = 0; yy < p.spr.height; yy++) for (let xx = 0; xx < p.spr.width; xx++) {
      const a = p.spr.data[(yy * p.spr.width + xx) * 4 + 3] / 255;
      if (a <= 0) continue;
      const cx = dx + xx, cy = dy + yy;
      if (cx < 0 || cy < 0 || cx >= CW || cy >= CH) continue;
      const si = (yy * p.spr.width + xx) * 4, di = (cy * CW + cx) * 4;
      for (let k = 0; k < 3; k++) out.data[di + k] = Math.round(p.spr.data[si + k] * a + out.data[di + k] * (1 - a));
      out.data[di + 3] = 255;
      cover[cy * CW + cx] = idx + 1;
    }
  });
  return comp;
}
/** 衔接面扫描 */
function scanJunction(comp, axis, plane, span, label) {
  const { cover, W, H, x0, y0 } = comp;
  const holes = [];
  for (let t = span[0]; t <= span[1]; t += 0.125) {
    for (let z = 0; z <= 240; z += 2) {
      const sx = Math.round(g.ox + (axis === 'x' ? plane - t : t - plane) * 32) - Math.round(x0);
      const sy = Math.round(g.oy + (plane + t) * 16 - z) - Math.round(y0);
      if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
      if (!cover[sy * W + sx]) holes.push({ t: +t.toFixed(3), z, sx, sy });
    }
  }
  if (holes.length === 0) { console.log(`[OK]   ${label}: 衔接带无可见孔洞`); return holes; }
  const cells = new Map();
  for (const h of holes) {
    const wx = h.sx + x0, wy = h.sy + y0;
    const u = (wx - g.ox) / (g.tileW / 2), v = (wy - g.oy) / (g.tileH / 2);
    const gx = Math.round((u + v) / 2), gy = Math.round((v - u) / 2);
    const k = `${gx},${gy}`;
    cells.set(k, (cells.get(k) ?? 0) + 1);
  }
  const zs = [...new Set(holes.map((h) => h.z))];
  console.log(`[HOLE] ${label}: ${holes.length} 点无覆盖！z=[${zs.join(',')}] 孔洞格子: ${[...cells.entries()].map(([k, c]) => `${k}(${c})`).join(' ')}`);
  return holes;
}

console.log('==== 四门衔接扫描 v5（地面真实上色版，合成图 = 游戏观感） ====');
const wallGate = layout.items.filter((it) => isStruct(it.type) || isGroundName(it.type));
const grassBase = layout.items.find((it) => it.type === 'ground_grass' && (it.w ?? 0) >= 64);

{
  const comp = buildWindow([grassBase, ...wallGate.filter((it) => it.gy >= 3 && it.gy <= 10 && it.gx >= 41 && it.gx <= 87)]);
  writeFileSync(fileURLToPath(new URL('_diag_north.png', import.meta.url)), PNG.sync.write(comp.png));
  scanJunction(comp, 'x', 59, [5, 8], '北门·西侧 (X=59)');
  scanJunction(comp, 'x', 69, [5, 8], '北门·东侧 (X=69)');
}
{
  const comp = buildWindow([grassBase, ...wallGate.filter((it) => it.gx >= 3 && it.gx <= 10 && it.gy >= 42 && it.gy <= 87)]);
  writeFileSync(fileURLToPath(new URL('_diag_west.png', import.meta.url)), PNG.sync.write(comp.png));
  scanJunction(comp, 'y', 59, [5, 8], '西门·上侧 (Y=59)');
  scanJunction(comp, 'y', 69, [5, 8], '西门·下侧 (Y=69)');
}
{
  const comp = buildWindow([grassBase, ...wallGate.filter((it) => it.gx >= 118 && it.gx <= 125 && it.gy >= 42 && it.gy <= 87)]);
  writeFileSync(fileURLToPath(new URL('_diag_east.png', import.meta.url)), PNG.sync.write(comp.png));
  scanJunction(comp, 'y', 59, [120, 123], '东门·上侧 (Y=59)');
  scanJunction(comp, 'y', 69, [120, 123], '东门·下侧 (Y=69)');
}
{
  const comp = buildWindow([grassBase, ...wallGate.filter((it) => it.gy >= 118 && it.gy <= 125 && it.gx >= 44 && it.gx <= 90)]);
  writeFileSync(fileURLToPath(new URL('_diag_south.png', import.meta.url)), PNG.sync.write(comp.png));
  scanJunction(comp, 'x', 59, [120, 123], '南门·西侧 (X=59)');
  scanJunction(comp, 'x', 69, [120, 123], '南门·东侧 (X=69)');
}

// ===== 额外：dump 西门北侧缺口区域覆盖图 =====
import { PNG as P2 } from 'pngjs';
{
  const comp = buildWindow([grassBase, ...wallGate.filter((it) => it.gx >= 3 && it.gx <= 10 && it.gy >= 42 && it.gy <= 87)]);
  const { cover, W, x0, y0 } = comp;
  console.log('缺口区域覆盖图 (世界 x[2380..2560] y[800..1120], 每8px采样, #=结构 O=草地 .=空洞):');
  for (let wy = 800; wy <= 1120; wy += 10) {
    let row = '';
    for (let wx = 2380; wx <= 2560; wx += 6) {
      const sx = Math.round(wx - x0), sy = Math.round(wy - y0);
      const c = cover[sy * W + sx];
      row += c > 0 ? '#' : c === -1 ? 'O' : '.';
    }
    console.log(String(wy).padStart(4), row);
  }
}
