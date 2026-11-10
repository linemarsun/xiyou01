#!/usr/bin/env node
/**
 * 等距树木贴图生成器（零外部依赖，纯 Node + zlib）。
 *
 * 背景：tree_pine.png 是成套「国风赛璐璐」模块图，但 leaf / dead 两种树
 * 一直缺图，渲染层退回到「一根棍 + 三个扁椭圆」的程序化占位，画面很难看。
 * 本脚本沿用松树的暗描边 / 灰绿分层 / 顶光棱配色，补出两张同风格真实 PNG，
 * 渲染层会自动命中 `isoModuleCandidates('tree', variant)`，无需改布局数据。
 *
 * 用法：npm run trees   （或 node tools/gen-tree-art.mjs）
 * 产物：public/assets/art/iso/tree_leaf.png、tree_dead.png
 * 幂等：固定随机种子，重复运行字节一致；路径相对脚本位置，可在任意工作区运行。
 */
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../public/assets/art/iso');
const S = 3; // 3× 超采样，降采样后自带抗锯齿

// ---- 与 tree_pine.png 一致的低饱和灰绿 / 深褐描边色板 ----
const C = {
  ink: [32, 29, 25],
  barkDark: [58, 46, 36],
  bark: [92, 73, 54],
  barkLight: [130, 105, 78],
  barkDead: [104, 92, 78],
  barkDeadLight: [148, 136, 116],
  leafDark: [30, 54, 42],
  leafMid: [52, 84, 58],
  leafLit: [86, 116, 78],
  leafRim: [132, 158, 106],
  leafHole: [20, 38, 30],
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
  /** 椭圆弧（角度为屏幕坐标弧度：0=右，PI/2=下，PI=左，1.5PI=上） */
  arc(cx, cy, rx, ry, a0, a1, width, col) {
    for (let y = Math.floor(cy - ry - width); y <= Math.ceil(cy + ry + width); y++) {
      for (let x = Math.floor(cx - rx - width); x <= Math.ceil(cx + rx + width); x++) {
        const dx = (x - cx) / rx, dy = (y - cy) / ry;
        const d = Math.sqrt(dx * dx + dy * dy);
        const inner = 1 - width / Math.min(rx, ry);
        if (d < inner || d > 1) continue;
        let ang = Math.atan2(dy, dx);
        if (ang < 0) ang += Math.PI * 2;
        let s = a0, e = a1;
        while (s < 0) { s += Math.PI * 2; e += Math.PI * 2; }
        if (ang + Math.PI * 2 < s) ang += Math.PI * 2;
        if (ang >= s && ang <= e) this.blend(x, y, col);
      }
    }
  }
  line(x0, y0, x1, y1, width, col) {
    const minX = Math.floor(Math.min(x0, x1) - width), maxX = Math.ceil(Math.max(x0, x1) + width);
    const minY = Math.floor(Math.min(y0, y1) - width), maxY = Math.ceil(Math.max(y0, y1) + width);
    const vx = x1 - x0, vy = y1 - y0, len2 = vx * vx + vy * vy || 1;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const t = Math.max(0, Math.min(1, ((x - x0) * vx + (y - y0) * vy) / len2));
        const dx = x - (x0 + t * vx), dy = y - (y0 + t * vy);
        if (dx * dx + dy * dy <= (width / 2) ** 2) this.blend(x, y, col);
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
  /** 降采样到 1×，返回直线 RGBA；按预乘 alpha 平均，边缘自然过渡 */
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

/** 外描边：把不透明轮廓膨胀 radius 像素，在透明区铺深色，再把树叠回去 */
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
  // 把原图（含半透边缘）合成到描边层之上
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

// ---- 阔叶树：三层扇贝状叶团（暗底 / 中层 / 受光顶层）+ 带纹理树干 ----
function drawLeaf(seed = 7) {
  const W = 96, H = 196;
  const c = new Canvas(W, H), R = rng(seed);
  const cx = W / 2, base = H - 4;

  // 树干：下宽上窄，分叉在冠下露出；左侧受光棱 + 根部外撇
  c.polygon([
    [cx - 9, base], [cx + 9, base], [cx + 4.5, 96], [cx - 4.5, 96],
  ].map(([x, y]) => [x * S, y * S]), C.bark);
  c.polygon([
    [cx - 9, base], [cx - 3, base], [cx - 2, 96], [cx - 4.5, 96],
  ].map(([x, y]) => [x * S, y * S]), C.barkDark);
  c.line((cx - 3) * S, 122 * S, (cx - 25) * S, 92 * S, 6.5 * S, C.bark);
  c.line((cx + 3) * S, 116 * S, (cx + 24) * S, 88 * S, 6.5 * S, C.bark);
  c.line((cx - 5) * S, (base - 3) * S, (cx - 4) * S, 132 * S, 2.4 * S, C.barkLight);
  c.line((cx - 5) * S, (base - 1) * S, (cx - 13) * S, base * S, 4.5 * S, C.barkDark);
  c.line((cx + 5) * S, (base - 1) * S, (cx + 13) * S, base * S, 4.5 * S, C.barkDark);

  // 冠底暗影，保证叶团之间不露透明缝
  c.ellipse(cx * S, 82 * S, 39 * S, 45 * S, C.leafDark);

  // 叶团在椭圆冠形内散布（越靠上越亮），先统一铺暗底再统一叠亮面，
  // 暗底只留在团与团的缝隙里，不会读成一圈圈同心圆。
  const blobs = [];
  for (let i = 0; i < 34; i++) {
    const ang = R() * Math.PI * 2, rr = Math.sqrt(R());
    blobs.push({
      x: cx + Math.cos(ang) * 37 * rr,
      y: 76 + Math.sin(ang) * 42 * rr - 4,
      r: 10.5 + R() * 7.5,
      t: R(),
    });
  }
  blobs.sort((a, b) => a.y - b.y);
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * Math.max(0, Math.min(1, t))));
  for (const b of blobs) c.ellipse(b.x * S, b.y * S, (b.r + 1.8) * S, (b.r + 1.8) * 0.9 * S, C.leafDark);
  for (const b of blobs) {
    const lit = 0.52 + (76 - b.y) / 95 + (b.t - 0.5) * 0.26;
    const col = lit < 0.5 ? mix(C.leafDark, C.leafMid, lit * 2) : mix(C.leafMid, C.leafLit, (lit - 0.5) * 2);
    b.col = col;
    c.ellipse(b.x * S, b.y * S, b.r * S, b.r * 0.9 * S, col);
  }
  for (const b of blobs) {
    if (b.t < 0.3) continue;
    const hi = mix(b.col, C.leafRim, 0.55);
    c.ellipse((b.x - b.r * 0.24) * S, (b.y - b.r * 0.3) * S,
      b.r * 0.46 * S, b.r * 0.3 * S, hi, 0.9);
    c.arc(b.x * S, b.y * S, b.r * 0.9 * S, b.r * 0.8 * S,
      Math.PI * 1.18, Math.PI * 1.56, 1.5 * S, hi);
  }
  // 少量叶隙暗洞 + 细碎叶点，打散整块的塑料感
  for (let i = 0; i < 9; i++) {
    const x = 18 + R() * 60, y = 46 + R() * 68;
    c.ellipse(x * S, y * S, (1.8 + R() * 1.6) * S, (1.4 + R() * 1.2) * S, C.leafHole, 0.7);
  }
  for (let i = 0; i < 16; i++) {
    const x = 20 + R() * 56, y = 38 + R() * 64;
    c.ellipse(x * S, y * S, 1.7 * S, 1.2 * S, C.leafRim, 0.55);
  }
  return { w: W, h: H, rgba: addOutline(c.downsample(), W, H, 2, C.ink) };
}

// ---- 枯木：扭曲主干 + 多级分叉，无冠，冷灰褐 ----
function drawDead(seed = 19) {
  const W = 84, H = 178;
  const c = new Canvas(W, H), R = rng(seed);
  const cx = W / 2, base = H - 4;
  // 主干用三段折线，略向左倾
  const trunk = [[cx + 2, base], [cx - 1, base - 40], [cx - 5, base - 78], [cx - 3, base - 112]];
  for (let i = 0; i < trunk.length - 1; i++) {
    const [x0, y0] = trunk[i], [x1, y1] = trunk[i + 1];
    const wd = (13 - i * 2.6) * S;
    c.line(x0 * S, y0 * S, x1 * S, y1 * S, wd, C.barkDead);
    c.line((x0 - 2.4) * S, y0 * S, (x1 - 2.4) * S, y1 * S, wd * 0.28, C.barkDeadLight);
  }
  // 主枝 + 次级细枝
  const limbs = [
    [cx - 4, base - 74, cx - 27, base - 104, 7],
    [cx - 3, base - 96, cx + 20, base - 126, 6],
    [cx - 1, base - 52, cx + 24, base - 74, 6],
    [cx - 5, base - 108, cx - 17, base - 140, 4.5],
    [cx + 2, base - 40, cx + 14, base - 58, 4],
  ];
  for (const [x0, y0, x1, y1, wd] of limbs) {
    c.line(x0 * S, y0 * S, x1 * S, y1 * S, wd * S, C.barkDead);
    // 每根枝再分两杈
    for (let k = 0; k < 2; k++) {
      const tx = x1 + (x1 - x0) * (0.22 + R() * 0.22) + (k ? 1 : -1) * (5 + R() * 7);
      const ty = y1 - (10 + R() * 16);
      c.line(x1 * S, y1 * S, tx * S, ty * S, Math.max(1.8, wd * 0.48) * S, C.barkDead);
      c.line(tx * S, ty * S, (tx + (tx - x1) * 0.4) * S, (ty - 7 - R() * 8) * S,
        Math.max(1.2, wd * 0.24) * S, C.barkDead);
    }
  }
  // 断枝茬口
  for (const [x, y] of [[cx - 27, base - 104], [cx + 20, base - 126]]) {
    c.ellipse(x * S, y * S, 3.2 * S, 2.4 * S, C.barkDeadLight, 0.9);
  }
  // 根部外撇
  c.line((cx + 2) * S, (base - 1) * S, (cx - 10) * S, base * S, 4 * S, C.barkDead);
  c.line((cx + 2) * S, (base - 1) * S, (cx + 12) * S, base * S, 4 * S, C.barkDead);
  return { w: W, h: H, rgba: addOutline(c.downsample(), W, H, 2, C.ink) };
}

for (const [name, make] of [['tree_leaf', drawLeaf], ['tree_dead', drawDead]]) {
  const { w, h, rgba } = make();
  const file = resolve(OUT, `${name}.png`);
  writeFileSync(file, encodePNG(w, h, rgba));
  console.log(`${name}.png  ${w}×${h}  ${(encodePNG(w, h, rgba).length / 1024).toFixed(1)} KB`);
}
console.log(`输出目录: ${OUT}`);
