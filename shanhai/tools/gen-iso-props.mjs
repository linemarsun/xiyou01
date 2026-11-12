#!/usr/bin/env node
/**
 * 等距场景构件贴图生成器（零外部依赖，纯 Node + zlib）。
 *
 * 背景：五图的 rock / bridge / stele / well / incense / crate / hall 一直缺图，
 * 渲染层退回到 world-renderer.ts 里的程序化几何占位（尤其是玲珑洞天 805 块晶石），
 * 与 gate_arch / house_4x4_* 那套「国风赛璐璐」真实贴图明显不搭。
 *
 * 本脚本沿用 gen-tree-art.mjs 的超采样画布与 PNG 编码，按同一套
 * 「深墨描边 + 等距四向明暗分面 + 低饱和石/木/瓦色」补齐全部缺图构件：
 *   rock.png / rock_moss.png / rock_dark.png / rock_crystal.png
 *   bridge.png / bridge_dark.png   stele.png   well.png
 *   incense.png   crate.png   hall.png   hall_stone.png
 *
 * 命名严格贴合 core/art.ts 的 isoModuleCandidates(type, variant) 候选链，
 * 因此渲染层无需改动即可命中；剩余工作只有「避免大片复制感」的确定性色差。
 *
 * 用法：npm run props   （或 node tools/gen-iso-props.mjs）
 * 幂等：固定随机种子，重复运行字节一致；路径相对脚本位置，可在任意工作区运行。
 */
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../public/assets/art/iso');
const S = 3; // 3× 超采样，降采样后自带抗锯齿

// ---- 色板：对齐 gate_arch.png / house_4x4_sw.png / lantern_post.png ----
const C = {
  ink: [30, 27, 25],
  inkSoft: [56, 50, 47],
  shadow: [46, 42, 40],
  stoneT: [180, 174, 161], stoneL: [142, 136, 125], stoneR: [104, 99, 93],
  stoneEdge: [70, 65, 61], stoneHi: [206, 200, 187],
  mossA: [62, 88, 56], mossB: [96, 126, 72], mossC: [138, 166, 98],
  darkT: [122, 115, 132], darkL: [88, 82, 100], darkR: [58, 54, 70],
  crack: [38, 35, 46], soul: [132, 200, 182],
  crysT: [188, 230, 240], crysL: [96, 154, 182], crysR: [52, 98, 132],
  crysHi: [232, 248, 252], crysCore: [38, 78, 108],
  woodT: [160, 120, 76], woodL: [122, 88, 54], woodR: [86, 61, 40],
  woodDark: [56, 40, 29], woodHi: [190, 152, 102],
  bronzeT: [158, 132, 78], bronzeL: [116, 94, 54], bronzeR: [78, 62, 38],
  gold: [206, 166, 84], goldHi: [240, 210, 138],
  redL: [158, 70, 60], redR: [114, 48, 44], redHi: [192, 98, 80],
  roofT: [72, 92, 122], roofL: [52, 68, 96], roofR: [34, 46, 68],
  roofRim: [108, 130, 158], tileLine: [30, 40, 60],
  water: [46, 82, 100], waterHi: [112, 158, 174],
  smoke: [196, 196, 188],
};

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 超采样 RGBA 画布：直线 alpha 混合，最后按预乘 alpha 降采样 */
class Canvas {
  constructor(w, h) {
    this.w = w; this.h = h; this.W = w * S; this.H = h * S;
    this.px = new Uint8ClampedArray(this.W * this.H * 4);
  }
  blend(x, y, col, a = 1) {
    x = Math.round(x); y = Math.round(y);
    if (a <= 0 || x < 0 || y < 0 || x >= this.W || y >= this.H) return;
    const i = (y * this.W + x) * 4;
    const sa = Math.min(1, a), da = this.px[i + 3] / 255;
    const oa = sa + da * (1 - sa);
    if (oa <= 0) return;
    for (let k = 0; k < 3; k++) this.px[i + k] = (col[k] * sa + this.px[i + k] * da * (1 - sa)) / oa;
    this.px[i + 3] = oa * 255;
  }
  ellipse(cx, cy, rx, ry, col, a = 1) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / rx, dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.blend(x, y, col, a);
      }
    }
  }
  line(x0, y0, x1, y1, width, col, a = 1) {
    const minX = Math.floor(Math.min(x0, x1) - width), maxX = Math.ceil(Math.max(x0, x1) + width);
    const minY = Math.floor(Math.min(y0, y1) - width), maxY = Math.ceil(Math.max(y0, y1) + width);
    const vx = x1 - x0, vy = y1 - y0, len2 = vx * vx + vy * vy || 1;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const t = Math.max(0, Math.min(1, ((x - x0) * vx + (y - y0) * vy) / len2));
        const dx = x - (x0 + t * vx), dy = y - (y0 + t * vy);
        if (dx * dx + dy * dy <= (width / 2) ** 2) this.blend(x, y, col, a);
      }
    }
  }
  polygon(pts, col) {
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
      for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++) {
        let inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const [xi, yi] = pts[i], [xj, yj] = pts[j];
          if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-9) + xi) inside = !inside;
        }
        if (inside) this.blend(x, y, col);
      }
    }
  }
  downsample() {
    const out = new Uint8ClampedArray(this.w * this.h * 4);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        let r = 0, g = 0, b = 0, a = 0;
        for (let sy = 0; sy < S; sy++) {
          for (let sx = 0; sx < S; sx++) {
            const i = ((y * S + sy) * this.W + x * S + sx) * 4;
            const al = this.px[i + 3] / 255;
            r += this.px[i] * al; g += this.px[i + 1] * al; b += this.px[i + 2] * al; a += al;
          }
        }
        const o = (y * this.w + x) * 4, n = S * S;
        out[o] = a > 0 ? r / a : 0;
        out[o + 1] = a > 0 ? g / a : 0;
        out[o + 2] = a > 0 ? b / a : 0;
        out[o + 3] = (a / n) * 255;
      }
    }
    return out;
  }
}

/** 以「足迹前底顶点」为原点的逻辑画布：所有绘制坐标都相对锚点，y 向上为负 */
class Draw {
  constructor(w, h) {
    this.w = w; this.h = h; this.c = new Canvas(w, h);
    this.ax = w / 2; this.ay = h - 8; // 底部留 8px 余量，让构件「坐」进地面
  }
  pt(x, y) { return [(this.ax + x) * S, (this.ay + y) * S]; }
  poly(pts, col) { this.c.polygon(pts.map(([x, y]) => this.pt(x, y)), col); }
  line(x0, y0, x1, y1, w, col, a = 1) {
    const [a0, b0] = this.pt(x0, y0), [a1, b1] = this.pt(x1, y1);
    this.c.line(a0, b0, a1, b1, w * S, col, a);
  }
  stroke(pts, w, col, a = 1) {
    for (let i = 1; i < pts.length; i++) this.line(...pts[i - 1], ...pts[i], w, col, a);
  }
  ellipse(cx, cy, rx, ry, col, a = 1) {
    const [x, y] = this.pt(cx, cy);
    this.c.ellipse(x, y, rx * S, ry * S, col, a);
  }
  rgba() { return this.c.downsample(); }
}

/** 外描边：把不透明轮廓膨胀 radius 像素，在透明区铺深墨，再把原图叠回去 */
function addOutline(buf, w, h, radius, col) {
  const alpha = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? 0 : buf[(y * w + x) * 4 + 3];
  const out = new Uint8ClampedArray(buf);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (alpha(x, y) > 8) continue;
      let near = false;
      for (let dy = -radius; dy <= radius && !near; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx * dx + dy * dy > radius * radius) continue;
          if (alpha(x + dx, y + dy) > 170) { near = true; break; }
        }
      }
      if (!near) continue;
      const o = (y * w + x) * 4;
      out[o] = col[0]; out[o + 1] = col[1]; out[o + 2] = col[2]; out[o + 3] = 255;
    }
  }
  for (let i = 0; i < w * h; i++) {
    const o = i * 4, sa = buf[o + 3] / 255, da = out[o + 3] / 255;
    const oa = sa + da * (1 - sa);
    if (oa <= 0) continue;
    for (let k = 0; k < 3; k++) out[o + k] = (buf[o + k] * sa + out[o + k] * da * (1 - sa)) / oa;
    out[o + 3] = oa * 255;
  }
  return out;
}

// ---- PNG 编码（RGBA8，逐行 filter 0） ----
const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return t;
})();
function crc32(buf) { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePNG(w, h, rgba) {
  const stride = w * 4, raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- 等距几何：足迹四顶点相对「前底顶点」，与 core/iso.ts frontVertex 一致 ----
function isoFp(w, h) {
  return {
    T: [(h - w) * 32, -(w + h) * 16],
    R: [h * 32, -h * 16],
    F: [0, 0],
    L: [-w * 32, -w * 16],
  };
}
const centerOf = (fp) => [(fp.T[0] + fp.F[0]) / 2, (fp.T[1] + fp.F[1]) / 2];
const liftFp = (fp, dy) => Object.fromEntries(Object.entries(fp).map(([k, p]) => [k, [p[0], p[1] + dy]]));
const scaleFp = (fp, s) => {
  const c = centerOf(fp);
  return Object.fromEntries(Object.entries(fp).map(([k, p]) => [k, [c[0] + (p[0] - c[0]) * s, c[1] + (p[1] - c[1]) * s]]));
};
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** 等距立方体：左前立面（亮）/ 右前立面（暗）/ 顶面（最亮） */
function isoBox(d, fp, height, pal, lift = 0) {
  const f = liftFp(fp, -lift), t = liftFp(f, -height);
  d.poly([f.L, f.F, t.F, t.L], pal.l);
  d.poly([f.F, f.R, t.R, t.F], pal.r);
  d.poly([t.T, t.R, t.F, t.L], pal.t);
  d.stroke([f.L, f.F, f.R], 1.8, C.ink);
  d.stroke([t.L, t.F, t.R], 1.4, C.inkSoft);
  d.line(f.F[0], f.F[1], t.F[0], t.F[1], 1.6, C.ink);
  return t;
}

// ============================ 山石 ============================
const ROCK_PAL = {
  base: { l: C.stoneL, r: C.stoneR, t: C.stoneT, edge: C.stoneEdge },
  moss: { l: [112, 120, 100], r: [78, 86, 74], t: [148, 156, 128], edge: [52, 62, 48] },
  dark: { l: C.darkL, r: C.darkR, t: C.darkT, edge: C.crack },
  crystal: { l: C.crysL, r: C.crysR, t: C.crysT, edge: C.crysCore },
};

function drawRock(variant, seed) {
  const tall = variant === 'crystal';
  const W = 112, H = tall ? 146 : 130;
  const d = new Draw(W, H), R = rng(seed), p = ROCK_PAL[variant];
  const fp = isoFp(1, 1), h = tall ? 54 : 66;
  // 落影：沿足迹铺一层比地面略暗的菱形，让石头「落地」
  d.poly([fp.T, fp.R, fp.F, fp.L], C.shadow);

  // 陡立的山石：左上受光、右下背光、顶部一块斜亮面，底部两三块碎石收脚
  const A = [-28, -11], B = [-24, -h * 0.72], Cp = [-9, -h], D = [8, -h * 0.94];
  const E = [25, -h * 0.6], Fp = [29, -12], G = [12, -2], Hp = [-13, -3];
  const M1 = [-3, -h * 0.5], M2 = [2, -h * 0.45];
  d.poly([A, B, Cp, D, E, Fp, G, Hp], p.l);          // 整体底色
  d.poly([A, B, Cp, M1, Hp], p.l);                   // 左受光面
  d.poly([D, E, Fp, G, M2], p.r);                    // 右背光面
  d.poly([B, Cp, D, M2, M1], p.t);                   // 顶面
  d.poly([M1, M2, G, Hp], p.r);                      // 正面下段压暗，拉出体积
  d.stroke([Cp, M1, G], 1.5, C.inkSoft);
  d.stroke([D, M2, G], 1.4, C.inkSoft);
  d.stroke([B, Cp, D, E, Fp], 1.6, C.ink);
  d.stroke([A, Hp, G, Fp], 1.4, C.ink);
  // 底部碎石，避免「一块石头直接插进地面」
  d.poly([[-30, -8], [-22, -16], [-15, -9], [-20, -2]], p.r);
  d.poly([[18, -4], [27, -11], [31, -5], [24, -1]], p.l);
  d.stroke([[-30, -8], [-22, -16], [-15, -9]], 1.2, C.inkSoft);
  d.stroke([[18, -4], [27, -11], [31, -5]], 1.2, C.inkSoft);

  if (variant === 'moss') {
    // 顶面成片青苔 + 石缝里钻出的草叶
    for (let i = 0; i < 16; i++) {
      const x = -21 + R() * 42, y = -h * 0.92 + R() * h * 0.34;
      d.ellipse(x, y, 4.5 + R() * 4.5, 2.8 + R() * 2.4, i % 3 ? C.mossA : C.mossB, 0.92);
    }
    for (let i = 0; i < 9; i++) {
      const x = -22 + R() * 44, y = -h * 0.7 + R() * 10;
      const tipx = x + (R() - 0.5) * 9, tipy = y - 11 - R() * 9;
      d.line(x, y, tipx, tipy, 2.3, i % 2 ? C.mossB : C.mossC);
      d.ellipse(tipx - 1.5, tipy + 2, 2.2, 3.4, C.mossC, 0.9);
    }
    d.stroke([[M1[0] - 9, M1[1] + 5], [M1[0] + 1, M1[1] + 13]], 1.2, C.stoneEdge);
  } else if (variant === 'dark') {
    // 冷紫灰裂纹 + 幽光点，和青崖山道的暖苔石拉开距离
    d.stroke([[-16, -h * 0.82], [-9, -h * 0.58], [-13, -h * 0.34], [-5, -10]], 2, C.crack);
    d.stroke([[14, -h * 0.8], [8, -h * 0.52], [15, -h * 0.24], [10, -8]], 1.7, C.crack);
    d.stroke([[-10, -h * 0.44], [2, -h * 0.38]], 1.2, C.crack);
    d.ellipse(7, -h * 0.66, 3.4, 2.4, C.soul, 0.85);
    d.ellipse(-13, -h * 0.42, 2.2, 1.7, C.soul, 0.6);
    d.ellipse(17, -h * 0.3, 1.8, 1.4, C.soul, 0.5);
  } else if (variant === 'crystal') {
    // 石基座上长出三根棱柱晶体：暗面 / 亮面 / 高光棱 / 白尖
    const shards = [
      { x: -15, base: -h * 0.72, w: 9, h: 44, lean: -5 },
      { x: 1, base: -h * 0.88, w: 12, h: 72, lean: 3 },
      { x: 17, base: -h * 0.6, w: 8, h: 38, lean: 6 },
    ];
    for (const s of shards) {
      const bx = s.x, by = s.base, tip = [bx + s.lean, by - s.h];
      d.poly([[bx - s.w, by], [bx, by + 4], tip], C.crysR);
      d.poly([[bx, by + 4], [bx + s.w, by], tip], C.crysL);
      d.poly([[bx - s.w * 0.35, by - 3], tip, [bx + s.w * 0.2, by - 5]], C.crysT);
      d.stroke([[bx, by + 4], tip], 1.8, C.crysHi);
      d.stroke([[bx - s.w, by], tip, [bx + s.w, by]], 1.4, C.crysCore);
      d.ellipse(tip[0], tip[1] + 2, 2.4, 1.8, C.crysHi, 0.9);
    }
    for (let i = 0; i < 8; i++) {
      const x = -24 + R() * 48, y = -h * 0.3 - R() * 18;
      d.ellipse(x, y, 1.8, 1.2, C.crysHi, 0.65);
    }
  } else {
    // 云京素石：几道层理线
    d.stroke([[-17, -h * 0.56], [-2, -h * 0.5], [13, -h * 0.56]], 1.2, C.stoneEdge);
    d.stroke([[-11, -h * 0.3], [4, -h * 0.26], [18, -h * 0.32]], 1.1, C.stoneEdge);
  }
  return { w: W, h: H, rgba: addOutline(d.rgba(), W, H, 2, C.ink) };
}

// ============================ 石桥 ============================
const BRIDGE_PAL = {
  base: { deck: [164, 156, 138], railL: [126, 118, 103], railR: [98, 92, 82], base: [56, 52, 48], seam: [92, 84, 72], cap: [196, 188, 168] },
  dark: { deck: [110, 104, 118], railL: [80, 75, 90], railR: [62, 58, 72], base: [40, 37, 46], seam: [56, 52, 64], cap: [148, 142, 156] },
};

function drawBridge(variant) {
  const W = 344, H = 214;
  const d = new Draw(W, H), p = BRIDGE_PAL[variant], fp = isoFp(3, 5);
  // 桥板厚度只画在两条可见前缘，四边暗框会把桥面读成「下沉凹槽」
  const deck = liftFp(fp, -16);
  d.poly([deck.F, deck.R, [deck.R[0], deck.R[1] + 8], [deck.F[0], deck.F[1] + 8]], p.base);
  d.poly([deck.F, deck.L, [deck.L[0], deck.L[1] + 8], [deck.F[0], deck.F[1] + 8]], p.base);
  const rh = 25;
  const up = (pt) => [pt[0], pt[1] - rh];
  // 桥栏只沿两条长边：后左 L→T 仅 8px 压边，前右 F→R 全高，两端完全敞开
  const upBack = (pt) => [pt[0], pt[1] - rh * 0.32];
  d.poly([deck.L, deck.T, upBack(deck.T), upBack(deck.L)], p.railL);
  d.stroke([upBack(deck.L), upBack(deck.T)], 1.2, C.inkSoft);
  // 桥墩分缝（桥板前右长边下方）
  for (let i = 1; i < 4; i++) {
    const q = lerp(deck.F, deck.R, i / 4);
    d.line(q[0], q[1] + 8, q[0], q[1] + 14, 1.4, C.inkSoft);
  }
  d.poly([deck.T, deck.R, deck.F, deck.L], p.deck);
  // 双向石板缝，把整块斜板读成一排石板
  for (let i = 1; i < 6; i++) {
    const t = i / 6;
    d.line(...lerp(deck.T, deck.R, t), ...lerp(deck.L, deck.F, t), 1.1, p.seam);
    d.line(...lerp(deck.T, deck.L, t), ...lerp(deck.R, deck.F, t), 1.1, p.seam);
  }
  d.stroke([deck.T, deck.R, deck.F, deck.L, deck.T], 1.8, C.ink);
  d.poly([deck.F, deck.R, up(deck.R), up(deck.F)], p.railR);
  d.stroke([deck.F, deck.R], 1.6, C.ink);
  d.stroke([up(deck.F), up(deck.R)], 1.5, C.ink);
  // 两条长边的栏板分缝与浅浮雕线
  for (let i = 1; i < 6; i++) {
    const t = i / 6;
    d.line(...lerp(deck.L, deck.T, t), ...lerp(upBack(deck.L), upBack(deck.T), t), 1, p.seam);
    d.line(...lerp(deck.F, deck.R, t), ...lerp(up(deck.F), up(deck.R), t), 1, p.seam);
  }
  d.line(...lerp(up(deck.F), deck.F, 0.42), ...lerp(up(deck.R), deck.R, 0.42), 1.1, p.seam);
  // 望柱只立在前右栏板两端；后侧与桥头不立柱，避免读成围栏石台
  for (const [k, pt] of [['F', deck.F], ['R', deck.R]]) {
    const x = pt[0], y = up(pt)[1];
    d.poly([[x - 4, y], [x + 4, y], [x + 4, y - 13], [x - 4, y - 13]], p.cap);
    d.stroke([[x - 4, y], [x - 4, y - 13], [x + 4, y - 13], [x + 4, y]], 1.3, C.ink);
    d.poly([[x - 6, y - 13], [x + 6, y - 13], [x + 4, y - 18], [x - 4, y - 18]], p.cap);
    if (k === 'F' || k === 'R') d.ellipse(x, y - 21, 3, 2.4, C.gold, 0.95);
  }
  return { w: W, h: H, rgba: addOutline(d.rgba(), W, H, 2, C.ink) };
}

// ============================ 石碑 ============================
function drawStele() {
  const W = 148, H = 158;
  const d = new Draw(W, H), fp = isoFp(1, 2);
  // 双层石座
  isoBox(d, fp, 9, { t: C.stoneT, l: C.stoneL, r: C.stoneR });
  const inner = scaleFp(fp, 0.82);
  isoBox(d, inner, 8, { t: C.stoneHi, l: C.stoneL, r: C.stoneR }, 9);
  // 碑身：正面（朝左下）+ 右侧面 + 云纹额首
  const c = centerOf(fp), bx = c[0], by = -18;
  const top = by - 92;
  d.poly([[bx - 17, by], [bx + 17, by], [bx + 17, top + 10], [bx - 17, top + 10]], C.stoneT);
  d.poly([[bx + 17, by], [bx + 25, by - 5], [bx + 25, top + 5], [bx + 17, top + 10]], C.stoneR);
  d.poly([[bx - 21, top + 10], [bx - 17, top + 2], [bx - 9, top - 5], [bx + 9, top - 5],
    [bx + 17, top + 2], [bx + 25, top + 4], [bx + 25, top + 12], [bx - 21, top + 12]], C.stoneHi);
  d.stroke([[bx - 21, top + 10], [bx - 17, top + 2], [bx - 9, top - 5], [bx + 9, top - 5], [bx + 17, top + 2]], 1.5, C.ink);
  d.stroke([[bx - 17, by], [bx - 17, top + 10], [bx + 17, top + 10], [bx + 17, by]], 1.4, C.ink);
  // 碑框与阴刻竖文
  d.stroke([[bx - 11, by - 7], [bx - 11, top + 18], [bx + 11, top + 18], [bx + 11, by - 7]], 1.2, C.stoneEdge);
  for (let i = 0; i < 3; i++) {
    const x = bx - 6 + i * 6;
    for (let j = 0; j < 5; j++) d.line(x - 2, top + 26 + j * 12, x + 2, top + 26 + j * 12, 1.5, C.stoneEdge);
  }
  // 额首卷云纹
  d.stroke([[bx - 13, top + 8], [bx - 6, top + 2], [bx, top + 6], [bx + 6, top + 2], [bx + 13, top + 8]], 1.3, C.stoneEdge);
  d.ellipse(bx + 1, top + 3, 4, 2.6, C.gold, 0.8);
  return { w: W, h: H, rgba: addOutline(d.rgba(), W, H, 2, C.ink) };
}

// ============================ 水井 ============================
function drawWell() {
  const W = 116, H = 132;
  const d = new Draw(W, H), fp = isoFp(1, 1);
  isoBox(d, fp, 15, { t: C.stoneHi, l: C.stoneL, r: C.stoneR });
  // 井圈：外环石砌 + 内圈井水
  const cy = -31;
  d.ellipse(0, cy, 23, 11, C.stoneT);
  d.ellipse(0, cy + 1, 17, 7.5, C.water);
  d.ellipse(-5, cy - 1, 6, 2, C.waterHi, 0.75);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    d.line(Math.cos(a) * 20, cy + Math.sin(a) * 9, Math.cos(a) * 23, cy + Math.sin(a) * 10.5, 1.1, C.stoneEdge);
  }
  // 木架：两柱 + 横梁 + 辘轳 + 吊绳 + 木桶
  for (const x of [-22, 22]) {
    d.poly([[x - 3, -18], [x + 3, -18], [x + 3, -82], [x - 3, -82]], C.woodL);
    d.poly([[x + 1, -18], [x + 3, -18], [x + 3, -82], [x + 1, -82]], C.woodR);
  }
  d.poly([[-29, -82], [29, -82], [29, -76], [-29, -76]], C.woodT);
  d.stroke([[-29, -82], [29, -82], [29, -76], [-29, -76], [-29, -82]], 1.4, C.ink);
  d.ellipse(0, -79, 8, 5, C.woodHi);
  d.line(0, -79, 0, -50, 1.6, C.woodDark);
  d.poly([[-8, -50], [8, -50], [6, -38], [-6, -38]], C.woodL);
  d.poly([[0, -50], [8, -50], [6, -38], [0, -38]], C.woodR);
  d.stroke([[-8, -50], [8, -50], [6, -38], [-6, -38], [-8, -50]], 1.3, C.ink);
  return { w: W, h: H, rgba: addOutline(d.rgba(), W, H, 2, C.ink) };
}

// ============================ 青铜香炉 ============================
function drawIncense() {
  const W = 116, H = 150;
  const d = new Draw(W, H), fp = isoFp(1, 1);
  isoBox(d, scaleFp(fp, 0.78), 8, { t: C.stoneHi, l: C.stoneL, r: C.stoneR });
  // 三足
  for (const [x, y] of [[-15, -18], [15, -18], [0, -10]]) {
    d.poly([[x - 3, y], [x + 3, y], [x + 2, y - 17], [x - 2, y - 17]], C.bronzeR);
  }
  // 鼎腹：椭圆轮廓 + 亮暗分面 + 口沿
  d.ellipse(0, -44, 26, 22, C.bronzeL);
  d.poly([[0, -66], [26, -44], [26, -30], [0, -22], [-26, -30], [-26, -44]], C.bronzeL);
  d.poly([[0, -66], [26, -44], [26, -30], [0, -22]], C.bronzeR);
  d.ellipse(0, -62, 26, 10, C.bronzeT);
  d.ellipse(0, -62, 20, 6.5, C.bronzeR);
  d.ellipse(-7, -65, 6, 2, C.goldHi, 0.55);
  // 双耳
  for (const s of [-1, 1]) {
    d.poly([[s * 24, -58], [s * 32, -58], [s * 32, -46], [s * 27, -46]], C.bronzeT);
    d.stroke([[s * 24, -58], [s * 32, -58], [s * 32, -46]], 1.4, C.ink);
  }
  // 金纹腰带与饕餮点缀
  d.stroke([[-24, -40], [0, -34], [24, -40]], 2.2, C.gold);
  for (let i = -2; i <= 2; i++) d.ellipse(i * 8, -39 + Math.abs(i) * 1.2, 2.2, 1.5, C.goldHi, 0.85);
  // 三缕香烟：S 形上升的半透明烟团，越往上越淡，避免读成硬折线
  for (const [sx, bend] of [[-9, -1], [0, 1], [9, -1]]) {
    for (let k = 0; k < 5; k++) {
      const t = k / 4;
      const x = sx + bend * Math.sin(t * Math.PI * 1.6) * 7;
      const y = -68 - k * 11;
      d.ellipse(x, y, 3.2 + k * 1.1, 2.3 + k * 0.8, C.smoke, 0.3 - k * 0.045);
    }
  }
  return { w: W, h: H, rgba: addOutline(d.rgba(), W, H, 2, C.ink) };
}

// ============================ 木箱 ============================
function drawCrate() {
  const W = 108, H = 100;
  const d = new Draw(W, H), fp = isoFp(1, 1);
  const t = isoBox(d, fp, 38, { t: C.woodT, l: C.woodL, r: C.woodR });
  // 侧面横向板缝
  for (const k of [0.34, 0.68]) {
    d.line(...lerp([fp.L[0], fp.L[1] - 38 * k], [fp.F[0], fp.F[1] - 38 * k], 0),
      ...lerp([fp.L[0], fp.L[1] - 38 * k], [fp.F[0], fp.F[1] - 38 * k], 1), 1.1, C.woodDark);
    d.line(...lerp([fp.F[0], fp.F[1] - 38 * k], [fp.R[0], fp.R[1] - 38 * k], 0),
      ...lerp([fp.F[0], fp.F[1] - 38 * k], [fp.R[0], fp.R[1] - 38 * k], 1), 1.1, C.woodDark);
  }
  // 顶面十字捆绳 + 木板纹
  d.line(...lerp(t.T, t.R, 0.5), ...lerp(t.L, t.F, 0.5), 1.4, C.woodHi);
  d.line(...lerp(t.T, t.L, 0.5), ...lerp(t.R, t.F, 0.5), 1.4, C.gold);
  // 四角铁包边
  for (const [k, pt] of [['L', fp.L], ['F', fp.F], ['R', fp.R]]) {
    const x = pt[0], y = pt[1];
    d.poly([[x - 3, y], [x + 3, y], [x + 3, y - 9], [x - 3, y - 9]], C.stoneR);
    d.poly([[x - 3, y - 29], [x + 3, y - 29], [x + 3, y - 38], [x - 3, y - 38]], C.stoneR);
  }
  return { w: W, h: H, rgba: addOutline(d.rgba(), W, H, 2, C.ink) };
}

// ============================ 大殿（6×6） ============================
const HALL_PAL = {
  hall: {
    base: { t: C.stoneHi, l: C.stoneL, r: C.stoneR },
    wallL: [190, 176, 148], wallR: [150, 136, 114],
    pillar: C.redL, pillarHi: C.redHi, door: [64, 50, 44],
    roofBack: [40, 54, 78], roofL: C.roofL, roofR: C.roofR, roofT: C.roofT,
    ridge: C.gold, rim: C.roofRim,
  },
  hall_stone: {
    base: { t: [198, 194, 184], l: [156, 152, 144], r: [116, 112, 106] },
    wallL: [206, 202, 192], wallR: [160, 156, 148],
    pillar: [122, 116, 108], pillarHi: [160, 154, 144], door: [58, 54, 50],
    roofBack: [50, 60, 70], roofL: [66, 78, 90], roofR: [42, 52, 62], roofT: [88, 102, 116],
    ridge: [176, 158, 112], rim: [124, 138, 150],
  },
};

/** 庑殿顶：四坡瓦面 + 瓦垄 + 正脊 + 檐口瓦当 */
function hipRoof(d, fp, lift, height, p) {
  const E = liftFp(scaleFp(fp, 1.16), -lift);
  const c = centerOf(E);
  const dir = [E.R[0] - E.T[0], E.R[1] - E.T[1]];
  const len = Math.hypot(...dir), u = [dir[0] / len, dir[1] / len];
  const half = len * 0.2;
  const J1 = [c[0] - u[0] * half, c[1] - u[1] * half - height];
  const J2 = [c[0] + u[0] * half, c[1] + u[1] * half - height];
  // 背面两坡先画，前面两坡后画盖住
  d.poly([E.T, E.L, J1], p.roofBack);
  d.poly([E.R, E.T, J2, J1], p.roofL);
  d.poly([E.L, E.F, J2, J1], p.roofL);
  d.poly([E.F, E.R, J2], p.roofR);
  // 瓦垄：前左坡与前右坡各 6 条，沿坡向收拢到正脊（淡一点，避免读成放射线）
  for (let i = 1; i < 7; i++) {
    const t = i / 7;
    d.line(...lerp(J1, J2, t), ...lerp(E.L, E.F, t), 1.1, C.tileLine, 0.78);
    d.line(...lerp(J1, J2, t), ...lerp(E.F, E.R, t), 1.1, C.tileLine, 0.78);
  }
  // 檐口：深色压边 + 一圈瓦当
  d.stroke([E.L, E.F, E.R], 3.2, C.ink);
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    for (const [a, b] of [[E.L, E.F], [E.F, E.R]]) {
      const q = lerp(a, b, t);
      d.ellipse(q[0], q[1] + 1, 2.6, 2, p.rim, 0.9);
    }
  }
  // 正脊与脊饰
  d.line(J1[0], J1[1], J2[0], J2[1], 4.2, C.ink);
  d.line(J1[0], J1[1] - 1, J2[0], J2[1] - 1, 2.4, p.ridge);
  for (const j of [J1, J2]) {
    d.poly([[j[0] - 4, j[1]], [j[0] + 4, j[1]], [j[0] + 2, j[1] - 9], [j[0] - 2, j[1] - 9]], p.ridge);
  }
  d.stroke([E.T, E.R, E.F, E.L, E.T], 1.6, C.inkSoft);
}

function drawHall(variant) {
  const W = 440, H = 590;
  const d = new Draw(W, H), p = HALL_PAL[variant], fp = isoFp(6, 6);
  // 两级汉白玉台基
  isoBox(d, fp, 16, p.base);
  isoBox(d, scaleFp(fp, 0.9), 12, p.base, 16);
  const platform = 28;
  // 殿前踏跺：贴着台基前缘的一条三级斜坡，而不是悬空的小方块
  d.poly([[-24, 0], [0, 0], [0, -28], [-24, -28]], C.stoneHi);
  d.poly([[0, 0], [24, 0], [24, -28], [0, -28]], C.stoneL);
  d.line(-24, -10, 0, -10, 1.2, C.stoneEdge);
  d.line(0, -10, 24, -10, 1.2, C.stoneEdge);
  d.line(-24, -19, 0, -19, 1.2, C.stoneEdge);
  d.line(0, -19, 24, -19, 1.2, C.stoneEdge);
  d.stroke([[-24, 0], [0, 0], [24, 0]], 1.6, C.ink);
  // 殿身
  const inner = scaleFp(fp, 0.74);
  isoBox(d, inner, 118, { t: p.wallL, l: p.wallL, r: p.wallR }, platform);
  // 柱列与格扇门（沿两条前缘等分）
  for (const [a, b] of [[inner.L, inner.F], [inner.F, inner.R]]) {
    for (let i = 0; i <= 4; i++) {
      const q = lerp(a, b, i / 4);
      const y0 = q[1] - platform, y1 = y0 - 118;
      d.line(q[0], y0, q[0], y1, 8, p.pillar);
      d.line(q[0] - 2, y0, q[0] - 2, y1, 2, p.pillarHi);
    }
    // 额枋
    d.line(a[0], a[1] - platform - 106, b[0], b[1] - platform - 106, 5, C.gold);
    // 中间两跨做格扇门
    const m = lerp(a, b, 0.5);
    d.poly([[m[0] - 16, m[1] - platform - 4], [m[0] + 16, m[1] - platform - 4],
      [m[0] + 16, m[1] - platform - 82], [m[0] - 16, m[1] - platform - 82]], p.door);
    for (let i = 1; i < 4; i++) d.line(m[0] - 16 + i * 8, m[1] - platform - 4, m[0] - 16 + i * 8, m[1] - platform - 82, 1.2, p.pillarHi);
  }
  // 檐下阴影带：把屋顶与柱列分开，避免屋瓦直接压在门楣上
  const eaveLine = liftFp(inner, -(platform + 118));
  d.stroke([eaveLine.L, eaveLine.F, eaveLine.R], 6, C.inkSoft);
  // 屋顶（檐口与殿身顶齐平）
  hipRoof(d, inner, platform + 118, 74, p);
  return { w: W, h: H, rgba: addOutline(d.rgba(), W, H, 2, C.ink) };
}

// ============================ 输出 ============================
const JOBS = [
  ['rock', () => drawRock('base', 31)],
  ['rock_moss', () => drawRock('moss', 47)],
  ['rock_dark', () => drawRock('dark', 59)],
  ['rock_crystal', () => drawRock('crystal', 71)],
  ['bridge', () => drawBridge('base')],
  ['bridge_dark', () => drawBridge('dark')],
  ['stele', drawStele],
  ['well', drawWell],
  ['incense', drawIncense],
  ['crate', drawCrate],
  ['hall', () => drawHall('hall')],
  ['hall_stone', () => drawHall('hall_stone')],
];

for (const [name, make] of JOBS) {
  const { w, h, rgba } = make();
  const buf = encodePNG(w, h, rgba);
  writeFileSync(resolve(OUT, `${name}.png`), buf);
  console.log(`${name}.png  ${w}×${h}  ${(buf.length / 1024).toFixed(1)} KB`);
}
console.log(`输出 ${JOBS.length} 张，目录: ${OUT}`);
