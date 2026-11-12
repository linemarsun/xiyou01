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
  polygon(pts, col, a = 1) {
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
      for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++) {
        let inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const [xi, yi] = pts[i], [xj, yj] = pts[j];
          if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-9) + xi) inside = !inside;
        }
        if (inside) this.blend(x, y, col, a);
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
  poly(pts, col, a = 1) { this.c.polygon(pts.map(([x, y]) => this.pt(x, y)), col, a); }
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
const mixCol = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const upPt = (p, h) => [p[0], p[1] - h];
const downPt = (p, h) => [p[0], p[1] + h];

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
  // 晶簇改由晶体自身分面，跳过基座的两条斜分面线（旧版会像黑裂缝穿过晶体）
  if (variant !== 'crystal') {
    d.stroke([Cp, M1, G], 1.5, C.inkSoft);
    d.stroke([D, M2, G], 1.4, C.inkSoft);
  }
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
    // 五根高低错落的棱柱晶体 + 基座碎晶：矮的先画、主晶后画，避免三根等高柱的复制感
    const shards = [
      { x: -22, base: -h * 0.56, w: 6, h: 28, lean: -4, tone: 0.1 },
      { x: -11, base: -h * 0.76, w: 10, h: 52, lean: -3, tone: 0.5 },
      { x: 2, base: -h * 0.92, w: 13, h: 78, lean: 2, tone: 1 },
      { x: 15, base: -h * 0.70, w: 9, h: 44, lean: 4, tone: 0.7 },
      { x: 25, base: -h * 0.50, w: 6, h: 25, lean: 5, tone: 0.25 },
    ];
    for (const s of [...shards].sort((a, b) => a.h - b.h)) {
      const bx = s.x, by = s.base, tip = [bx + s.lean, by - s.h];
      d.poly([[bx - s.w, by], [bx, by + 4], tip], mixCol(C.crysR, C.crysT, 0.12 * s.tone));
      d.poly([[bx, by + 4], [bx + s.w, by], tip], mixCol(C.crysL, C.crysHi, 0.18 * s.tone));
      d.poly([[bx - s.w * 0.35, by - 3], tip, [bx + s.w * 0.2, by - 5]], mixCol(C.crysT, C.crysHi, 0.35 * s.tone));
      d.stroke([[bx, by + 4], tip], 1.8, C.crysHi, 0.9);
      d.stroke([[bx - s.w, by], tip, [bx + s.w, by]], 1.4, C.crysCore);
      // 内棱线：把一根晶体再切成两个折射面
      d.line(bx + s.w * 0.5, by - 2, bx + s.lean * 0.45, by - s.h * 0.82, 1, C.crysHi, 0.55);
      d.ellipse(tip[0], tip[1] + 2, 2.4, 1.8, C.crysHi, 0.9);
    }
    // 基座前缘碎晶片 + 散落幽光，让晶簇「长在石头里」而不是插在地上
    d.ellipse(0, -3, 23, 5, C.crysL, 0.22);
    for (const [x, w] of [[-25, 5], [-16, 4], [12, 5], [24, 4]]) {
      d.poly([[x - w, -4], [x, -10], [x + w, -3]], mixCol(C.crysL, C.crysT, 0.35));
      d.stroke([[x - w, -4], [x, -10], [x + w, -3]], 1, C.crysCore);
    }
    for (let i = 0; i < 10; i++) {
      const x = -26 + R() * 52, y = -h * 0.24 - R() * 16;
      d.ellipse(x, y, 1.8, 1.2, C.crysHi, 0.6);
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
  base: {
    deckLo: [132, 124, 110], deckHi: [198, 190, 172], seam: [92, 84, 72],
    railL: [126, 118, 103], railR: [98, 92, 82], base: [56, 52, 48], cap: [196, 188, 168],
    shadow: [76, 70, 62], water: [32, 30, 38], arch: [206, 198, 178],
  },
  dark: {
    deckLo: [86, 82, 96], deckHi: [148, 142, 158], seam: [56, 52, 64],
    railL: [80, 75, 90], railR: [62, 58, 72], base: [40, 37, 46], cap: [148, 142, 156],
    shadow: [50, 46, 56], water: [24, 22, 32], arch: [158, 152, 168],
  },
};

/**
 * 拱形石桥：沿长轴分 12 段按 sin 曲线抬高桥面，两条长边随拱起伏；
 * 近侧桥身开两孔券洞，栏板改「半透镂空 + 上下横枋 + 五根望柱」，两端短边敞开并带引桥踏步。
 * 旧版是一整块平板 + 一堵实心栏墙，等距俯视下会被读成「斜置的围栏石台」。
 */
function drawBridge(variant) {
  const W = 344, H = 226;
  const d = new Draw(W, H), p = BRIDGE_PAL[variant], fp = isoFp(3, 5);
  const LIFT = -20, AMP = 18, BASE = 30, N = 12;
  // 长轴：L→T / F→R；两端短边 L→F 与 T→R 是上下桥的敞口
  const A = (t) => lerp(fp.L, fp.T, t);
  const B = (t) => lerp(fp.F, fp.R, t);
  const P = (pt, t) => [pt[0], pt[1] + LIFT - AMP * Math.sin(Math.PI * t)];
  const edgeA = [], edgeB = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    edgeA.push(P(A(t), t)); edgeB.push(P(B(t), t));
  }

  // 桥下阴影（贴地菱形，拱洞里透出来的就是它）
  d.poly([fp.T, fp.R, fp.F, fp.L].map((q) => [q[0], q[1] + 4]), mixCol(p.shadow, C.ink, 0.2));

  // 近侧桥身：随拱起伏的整条厚石带
  for (let i = 0; i < N; i++) {
    const t0 = i / N, t1 = (i + 1) / N;
    const q0 = edgeB[i], q1 = edgeB[i + 1];
    const lit = Math.sin(Math.PI * (t0 + t1) / 2);
    d.poly([q0, q1, downPt(q1, BASE), downPt(q0, BASE)], mixCol(p.base, p.seam, 0.16 * lit));
  }
  d.stroke(edgeB.map((q) => downPt(q, BASE)), 1.4, C.ink);

  // 两孔券洞：洞顶按半正弦抬起，桥板留 8px 厚度不凿穿
  const archHole = (t0, t1) => {
    const arc = [], foot = [];
    for (let k = 0; k <= 18; k++) {
      const u = k / 18, t = t0 + (t1 - t0) * u;
      const q = P(B(t), t);
      arc.push([q[0], q[1] + BASE - 2 - 22 * Math.sin(Math.PI * u)]);
      foot.push([q[0], q[1] + BASE]);
    }
    d.poly([...arc, ...foot.reverse()], p.water);
    d.stroke(arc, 3.2, C.ink);            // 深墨券口
    d.stroke(arc, 1.8, p.arch);           // 券石亮边把「洞」从桥身上凿出来
    const m = P(B((t0 + t1) / 2), (t0 + t1) / 2);
    d.line(m[0] - 11, m[1] + BASE - 7, m[0] + 11, m[1] + BASE - 7, 1, p.arch, 0.22);
  };
  archHole(0.16, 0.40);
  archHole(0.60, 0.84);
  // 桥墩分缝落在两洞之间与两端
  for (const t of [0.08, 0.5, 0.92]) {
    const q = P(B(t), t);
    d.line(q[0], q[1] + 4, q[0], q[1] + BASE, 1.3, C.inkSoft);
  }

  // 桥面：由远及近逐段铺石板，中段受光更亮，拱起的体积靠明暗读出
  for (let i = N - 1; i >= 0; i--) {
    const t0 = i / N, t1 = (i + 1) / N;
    const a0 = edgeA[i], b0 = edgeB[i], b1 = edgeB[i + 1], a1 = edgeA[i + 1];
    const lit = 0.18 + 0.72 * Math.sin(Math.PI * (t0 + t1) / 2);
    d.poly([a0, b0, b1, a1], mixCol(p.deckLo, p.deckHi, lit));
    d.line(...a1, ...b1, 1.2, p.seam);
  }
  const mid = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    mid.push(P(lerp(A(t), B(t), 0.5), t));
  }
  d.stroke(mid, 1, p.seam, 0.45);
  d.stroke(edgeA, 1.8, C.ink);
  d.stroke(edgeB, 1.8, C.ink);
  d.line(...edgeA[0], ...edgeB[0], 1.7, C.ink);
  d.line(...edgeA[N], ...edgeB[N], 1.7, C.ink);

  // 两端只补 9px 桥板断面 + 一条浅色桥头石：盖住透明白缝，又不把敞口封成挡墙
  for (const k of [0, N]) {
    const a = edgeA[k], b = edgeB[k], th = 9;
    d.poly([a, b, downPt(b, th), downPt(a, th)], mixCol(p.base, p.cap, 0.22));
    d.stroke([a, downPt(a, th), downPt(b, th), b], 1.2, C.ink);
    d.line(...a, ...b, 3, p.cap, 0.9);
    d.line(...a, ...b, 1.1, C.ink, 0.6);
  }

  // 远侧栏板只留 7px 压边；近侧栏板半透镂空 + 上下横枋，不再是一堵实心墙
  for (let i = 0; i < N; i++) {
    const a0 = edgeA[i], a1 = edgeA[i + 1], b0 = edgeB[i], b1 = edgeB[i + 1];
    d.poly([a0, a1, upPt(a1, 7), upPt(a0, 7)], p.railL, 0.85);
    d.poly([b0, b1, upPt(b1, 20), upPt(b0, 20)], p.railR, 0.34);
  }
  const railA = edgeA.map((q) => upPt(q, 7));
  const railB = edgeB.map((q) => upPt(q, 20));
  d.stroke(railA, 1.5, C.inkSoft);
  d.stroke(edgeB, 3.4, C.ink);
  d.stroke(edgeB, 2, p.base);
  d.stroke(railB, 4.2, C.ink);
  d.stroke(railB, 2.6, p.cap);
  for (let i = 1; i < 6; i++) {
    const t = i / 6, a = P(A(t), t), b = P(B(t), t);
    d.line(a[0], a[1], a[0], a[1] - 7, 1, p.seam);
    d.line(b[0], b[1], b[0], b[1] - 20, 1, p.seam, 0.7);
  }
  // 望柱沿近侧栏板等距排布，柱头带小宝顶；两端柱不封桥口
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    const q = P(B(t), t), x = q[0], y = q[1];
    d.poly([[x - 3.5, y + 2], [x + 3.5, y + 2], [x + 3.5, y - 24], [x - 3.5, y - 24]], p.cap);
    d.stroke([[x - 3.5, y + 2], [x - 3.5, y - 24], [x + 3.5, y - 24], [x + 3.5, y + 2]], 1.3, C.ink);
    d.poly([[x - 5.5, y - 24], [x + 5.5, y - 24], [x + 4, y - 29], [x - 4, y - 29]], p.cap);
    d.stroke([[x - 5.5, y - 24], [x + 5.5, y - 24]], 1.2, C.ink);
    d.ellipse(x, y - 31, 2.3, 2, C.gold, 0.9);
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

/** 庑殿顶：四坡明暗分面 + 双线瓦垄/瓦缝 + 四条垂脊 + 檐板瓦当 + 正脊吻兽 */
function hipRoof(d, fp, lift, height, p) {
  const E = liftFp(scaleFp(fp, 1.16), -lift);
  const c = centerOf(E);
  const dir = [E.R[0] - E.T[0], E.R[1] - E.T[1]];
  const len = Math.hypot(...dir), u = [dir[0] / len, dir[1] / len];
  const half = len * 0.2;
  const J1 = [c[0] - u[0] * half, c[1] - u[1] * half - height];
  const J2 = [c[0] + u[0] * half, c[1] + u[1] * half - height];
  // 四坡拉开明暗：后左最暗、右上背光、左下受光、右下最亮侧的反面
  const lit = mixCol(p.roofL, p.roofT, 0.3);
  const dark = mixCol(p.roofR, C.ink, 0.12);
  d.poly([E.T, E.L, J1], p.roofBack);
  d.poly([E.R, E.T, J2, J1], p.roofR);
  d.poly([E.L, E.F, J2, J1], lit);
  d.poly([E.F, E.R, J2], dark);
  // 瓦垄：一阴一阳双线，沿坡向收拢到正脊；再补三道横向瓦片接缝
  // 旧版只有 1.1px 半透明单线，缩到游戏视口后几乎看不见，屋顶读成一块纯色板
  const TILES = 9;
  for (const [a, b] of [[E.T, E.R], [E.L, E.F], [E.F, E.R]]) {
    for (let i = 1; i < TILES; i++) {
      const t = i / TILES;
      const top = lerp(J1, J2, t), bot = lerp(a, b, t);
      d.line(...top, ...bot, 1.9, C.tileLine, 0.92);
      d.line(top[0] + 1.7, top[1], bot[0] + 1.7, bot[1], 1.1, p.rim, 0.55);
    }
    for (const k of [0.32, 0.6, 0.84]) {
      d.line(...lerp(J1, a, k), ...lerp(J2, b, k), 1, C.tileLine, 0.34);
    }
  }
  // 三条外缘垂脊把屋顶转折钉死；用淡瓦色而非金色高光，避免中央出现抢眼的 Y 形金线。
  // J2→E.F 落在屋面前坡正中，旧版画出来像一道裂缝，这里不画
  for (const [j, e] of [[J1, E.T], [J1, E.L], [J2, E.R]]) {
    d.line(...j, ...e, 3.2, C.ink);
    d.line(...j, ...e, 1.3, p.rim, 0.75);
  }
  // 檐板 + 瓦当：先压一条深色带，再点一圈亮瓦头
  d.poly([E.L, E.F, E.R, [E.R[0], E.R[1] + 5], [E.F[0], E.F[1] + 5], [E.L[0], E.L[1] + 5]], C.inkSoft);
  d.stroke([E.L, E.F, E.R], 2.6, C.ink);
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    for (const [a, b] of [[E.L, E.F], [E.F, E.R]]) {
      const q = lerp(a, b, t);
      d.ellipse(q[0], q[1] + 2.5, 3.2, 2.3, p.rim, 0.95);
    }
  }
  // 正脊：深墨压底 + 金色脊线 + 两端翘角吻兽
  d.line(J1[0], J1[1], J2[0], J2[1], 5.4, C.ink);
  d.line(J1[0], J1[1] - 1, J2[0], J2[1] - 1, 2.8, p.ridge);
  for (const [j, s] of [[J1, -1], [J2, 1]]) {
    d.poly([[j[0] - 4, j[1] + 1], [j[0] + 4, j[1] + 1], [j[0] + 2, j[1] - 10], [j[0] - 2, j[1] - 10]], p.ridge);
    d.line(j[0], j[1] - 9, j[0] + s * 7, j[1] - 15, 2.2, p.ridge);
    d.stroke([[j[0] - 4, j[1] + 1], [j[0] - 2, j[1] - 10], [j[0] + 2, j[1] - 10], [j[0] + 4, j[1] + 1]], 1.2, C.ink);
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
  // 殿前踏跺：贴着台基前缘的三级斜坡 + 两侧垂带石，不再是悬空的小白块
  d.poly([[-30, 0], [0, 0], [0, -28], [-30, -28]], C.stoneHi);
  d.poly([[0, 0], [30, 0], [30, -28], [0, -28]], C.stoneL);
  d.poly([[-34, 0], [-30, 0], [-30, -32], [-34, -32]], C.stoneT);
  d.poly([[30, 0], [34, 0], [34, -32], [30, -32]], C.stoneR);
  for (const dy of [-10, -19]) {
    d.line(-30, dy, 0, dy, 1.2, C.stoneEdge);
    d.line(0, dy, 30, dy, 1.2, C.stoneEdge);
  }
  d.stroke([[-34, 0], [-30, 0], [0, 0], [30, 0], [34, 0]], 1.6, C.ink);
  d.stroke([[-34, -32], [-30, -32]], 1.2, C.inkSoft);
  d.stroke([[30, -32], [34, -32]], 1.2, C.inkSoft);
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
