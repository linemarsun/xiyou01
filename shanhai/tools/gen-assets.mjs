/**
 * 像素资产生成器：程序化生成全套风格统一的 Q 版精灵帧与场景图。
 *
 * 输出（public/assets/）：
 *   sprites/<id>/<anim>_<i>.png   48x48 单帧（idle/attack/cast）
 *   scenes/<encounter>.png        960x520 斜透视战斗场景
 *   manifest.json                 动画清单（fps/帧序），渲染器按清单加载
 *
 * 运行：node tools/gen-assets.mjs
 * 想换手绘/下载素材：按清单里的文件名逐张替换 PNG 即可，无需改代码。
 */
import { PNG } from 'pngjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'public', 'assets');

// ============ 基础工具 ============

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hex(c) {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}

function shade(c, f) {
  const [r, g, b] = hex(c);
  const cl = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `#${[cl(r), cl(g), cl(b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

class Px {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.data = Buffer.alloc(w * h * 4, 0);
  }
  set(x, y, c) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    const [r, g, b, a] = hex(c);
    this.data[i] = r; this.data[i + 1] = g; this.data[i + 2] = b; this.data[i + 3] = a;
  }
  blend(x, y, c, alpha) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    const [r, g, b] = hex(c);
    const da = this.data[i + 3] / 255;
    const na = alpha + da * (1 - alpha);
    if (na <= 0) return;
    this.data[i] = Math.round((r * alpha + this.data[i] * da * (1 - alpha)) / na);
    this.data[i + 1] = Math.round((g * alpha + this.data[i + 1] * da * (1 - alpha)) / na);
    this.data[i + 2] = Math.round((b * alpha + this.data[i + 2] * da * (1 - alpha)) / na);
    this.data[i + 3] = Math.round(na * 255);
  }
  rect(x, y, w, h, c) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }
  hline(x, y, w, c) { this.rect(x, y, w, 1, c); }
  vline(x, y, h, c) { this.rect(x, y, 1, h, c); }
  line(x0, y0, x1, y1, c, w = 1) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= steps; i++) {
      const x = x0 + ((x1 - x0) * i) / steps;
      const y = y0 + ((y1 - y0) * i) / steps;
      this.rect(Math.round(x), Math.round(y), w, w, c);
    }
  }
  /** 实心椭圆（可带描边色，描边在外圈 1px） */
  ellipse(cx, cy, rx, ry, c, outline) {
    if (outline) this.ellipse(cx, cy, rx + 1, ry + 1, outline);
    for (let dy = -Math.ceil(ry); dy <= Math.ceil(ry); dy++) {
      const dx = rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / (ry * ry)));
      this.hline(Math.round(cx - dx), Math.round(cy + dy), Math.round(dx * 2) + 1, c);
    }
  }
  /** 三角形（顶点在上） */
  tri(x, yTop, halfW, h, c) {
    for (let j = 0; j < h; j++) {
      const w = Math.max(1, Math.round((halfW * 2 * (j + 1)) / h));
      this.hline(Math.round(x - w / 2), yTop + j, w, c);
    }
  }
  save(file) {
    const png = new PNG({ width: this.w, height: this.h });
    this.data.copy(png.data);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, PNG.sync.write(png));
  }
}

// ============ 角色绘制模板 ============
// 画布 48x48，脚底基线 y≈45，身体中轴 x=24。
// pose: { bob: 上下起伏, lean: 前倾位移, armUp: 施法抬手 0/1, swing: 攻击帧 0..3, glow: 施法光球 }

function drawChibi(g, sp, pose) {
  const P = sp.pal;
  const lean = pose.lean ?? 0;
  const cx = 24 + lean;
  const bob = pose.bob ?? 0;
  const bulk = sp.features.bulky ? 2 : 0;

  // —— 腿脚（不受 bob 影响，贴地；walk 帧双腿交替） ——
  const leg = pose.leg ?? 0;
  const lOff = leg === 1 ? -2 : leg === 2 ? 1 : 0;
  const rOff = leg === 2 ? 2 : leg === 1 ? -1 : 0;
  g.rect(cx - 5 + lOff, 39, 3, 6, P.cloth2);
  g.rect(cx + 2 + rOff, 39, 3, 6, P.cloth2);
  g.rect(cx - 6 + lOff, 44, 5, 2, P.outline);
  g.rect(cx + 1 + rOff, 44, 5, 2, P.outline);

  // —— 尾巴（画在身体后面） ——
  if (sp.features.tail) {
    const t = P.hair;
    g.rect(cx - 11, 37 + bob, 2, 3, t);
    g.rect(cx - 13, 32 + bob, 2, 5, t);
    g.rect(cx - 12, 27 + bob, 2, 5, t);
    g.rect(cx - 11, 25 + bob, 2, 3, P.accent);
  }

  // —— 身体 ——
  g.rect(cx - 7 - bulk, 28 + bob, 14 + bulk * 2, 11, P.cloth);
  g.rect(cx - 7 - bulk, 28 + bob, 1, 11, P.outline);
  g.rect(cx + 6 + bulk, 28 + bob, 1, 11, P.outline);
  g.hline(cx - 7 - bulk, 28 + bob, 14 + bulk * 2, P.outline);
  g.vline(cx, 29 + bob, 9, P.cloth2);
  g.hline(cx - 6 - bulk, 35 + bob, 12 + bulk * 2, P.accent);

  // 骷髅肋骨
  if (sp.features.bones) {
    for (let i = 0; i < 3; i++) g.hline(cx - 5, 30 + bob + i * 2, 10, P.outline);
  }

  // —— 手臂 ——
  if (pose.armUp) {
    g.rect(cx - 10 + bulk, 22 + bob, 3, 8, P.cloth);
    g.rect(cx + 7 + bulk, 22 + bob, 3, 8, P.cloth);
    g.rect(cx - 10 + bulk, 21 + bob, 3, 2, P.skin);
    g.rect(cx + 7 + bulk, 21 + bob, 3, 2, P.skin);
    if (pose.glow) {
      g.ellipse(cx, 19 + bob, 3, 3, P.accent);
      g.set(cx - 3, 19 + bob, '#ffffff'); g.set(cx + 3, 19 + bob, '#ffffff');
      g.set(cx, 16 + bob, '#ffffff'); g.set(cx, 22 + bob, '#ffffff');
    }
  } else {
    const armY = 29 + bob + (pose.swing === 1 ? -4 : 0);
    g.rect(cx - 10 + bulk, armY, 3, 8, P.cloth);
    g.rect(cx + 7 + bulk, armY, 3, 8, P.cloth);
    g.rect(cx - 10 + bulk, armY + 7, 3, 2, P.skin);
    g.rect(cx + 7 + bulk, armY + 7, 3, 2, P.skin);
  }

  // —— 头 ——
  const hy = 19 + bob;
  g.ellipse(cx, hy, 10, 9, P.skin, P.outline);
  // 五官
  if (sp.features.sockets) {
    g.rect(cx - 5, hy - 1, 3, 3, P.outline);
    g.rect(cx + 2, hy - 1, 3, 3, P.outline);
  } else {
    g.rect(cx - 5, hy, 1, 2, P.outline);
    g.rect(cx + 4, hy, 1, 2, P.outline);
  }
  g.set(cx, hy + 4, P.outline);

  // 头部特征
  const F = sp.features;
  if (F.hairTop) {
    for (let j = 0; j < 5; j++) {
      const w = Math.round(18 * (1 - j / 7));
      g.hline(cx - w / 2, hy - 9 + j, w, P.hair);
    }
    g.rect(cx - 2, hy - 13, 4, 3, P.hair); // 发髻
  }
  if (F.band) g.hline(cx - 9, hy - 4, 18, P.accent);
  if (F.hat) { // 斗笠/道冠
    g.tri(cx, hy - 15, 10, 9, P.hat);
    g.ellipse(cx, hy - 6, 11, 3, P.hat, P.outline);
    g.hline(cx - 6, hy - 8, 12, P.accent);
  }
  if (F.horns) {
    g.tri(cx - 8, hy - 13, 2, 6, P.horn);
    g.tri(cx + 6, hy - 13, 2, 6, P.horn);
  }
  if (F.foxEars) {
    g.tri(cx - 8, hy - 14, 3, 7, P.hair);
    g.tri(cx + 5, hy - 14, 3, 7, P.hair);
    g.set(cx - 7, hy - 10, '#e88ba0'); g.set(cx + 6, hy - 10, '#e88ba0');
  }
  if (F.hood) {
    g.ellipse(cx, hy - 1, 11, 10, P.cloth, P.outline);
    g.ellipse(cx, hy + 1, 7, 6, P.skin);
    g.rect(cx - 6, hy - 5, 12, 3, P.cloth2);
  }
  if (F.monkeyFace) {
    g.ellipse(cx, hy + 1, 7, 6, P.muzzle);
    g.rect(cx - 5, hy - 2, 10, 2, P.hair);
  }
  if (F.crown) {
    for (let i = 0; i < 3; i++) g.tri(cx - 6 + i * 5, hy - 13, 2, 5, P.accent);
    g.hline(cx - 7, hy - 9, 14, P.accent);
  }
  if (F.muzzleChin) g.ellipse(cx, hy + 5, 4, 2, P.muzzle);

  // —— 武器 ——
  drawWeapon(g, sp, cx, pose);
}

function drawWeapon(g, sp, cx, pose) {
  const W = sp.features.weapon;
  if (!W) return;
  const P = sp.pal;
  const wx = cx + 10;

  if (W === 'sword') {
    const tops = [[-3, 14], [0, 15], [5, 12], [0, 15]];
    const [dx, ty] = tops[pose.swing ?? 0];
    g.line(wx, 36, wx + dx, ty, '#c8ccd4', 2);
    g.hline(wx - 2, 36, 6, P.accent);
    g.rect(wx - 1, 37, 2, 4, '#6a4a2a');
    if (pose.swing === 2) { g.line(wx + 5, 12, wx + 8, 20, '#ffffff'); g.line(wx + 6, 11, wx + 9, 19, '#ffffff'); }
  } else if (W === 'staff') {
    g.vline(wx, 12, 32, '#7a5a34');
    const orbY = pose.armUp ? 14 : 12;
    g.ellipse(wx, orbY, 3, 3, P.accent, P.outline);
    if (pose.glow) {
      g.set(wx - 4, orbY, '#ffffff'); g.set(wx + 4, orbY, '#ffffff');
      g.set(wx, orbY - 4, '#ffffff'); g.set(wx, orbY + 4, '#ffffff');
    }
  } else if (W === 'hammer') {
    const heads = [[-3, 14], [0, 12], [5, 16], [0, 13]];
    const [dx, ty] = heads[pose.swing ?? 0];
    g.line(wx, 42, wx + dx, ty + 6, '#7a5a34', 2);
    g.rect(wx + dx - 3, ty, 8, 7, '#9aa0aa');
    g.rect(wx + dx - 3, ty, 8, 7, '#9aa0aa');
    g.rect(wx + dx - 3, ty, 1, 7, P.outline); g.rect(wx + dx + 4, ty, 1, 7, P.outline);
    g.hline(wx + dx - 3, ty, 8, P.outline); g.hline(wx + dx - 3, ty + 6, 8, P.outline);
  } else if (W === 'bell') {
    g.vline(wx, 12, 32, '#6a5a4a');
    g.ellipse(wx, 16, 3, 3, P.accent, P.outline);
    g.set(wx, 20, P.accent);
  }
}

function drawBeast(g, sp, pose) {
  const P = sp.pal;
  const bob = pose.bob ?? 0;
  const lean = pose.swing === 2 ? 2 : pose.swing === 1 ? -1 : 0;
  const dy = pose.swing === 2 ? 2 : 0;

  // 腿
  g.rect(9, 40, 4, 5, shade(P.fur, 0.8));
  g.rect(35, 40, 4, 5, shade(P.fur, 0.8));
  g.rect(14, 41, 4, 4, P.fur);
  g.rect(30, 41, 4, 4, P.fur);
  g.hline(9, 45, 30, P.outline);

  // 尾巴
  if (sp.features.bushyTail) {
    g.rect(38, 30 + bob, 3, 6, P.fur);
    g.rect(39, 26 + bob, 3, 6, P.fur);
    g.rect(39, 24 + bob, 2, 3, P.belly);
  }

  // 身体
  g.ellipse(24 + lean, 33 + bob, 13, 9, P.fur, P.outline);
  g.ellipse(24 + lean, 37 + bob, 8, 4, P.belly);

  // 背甲（岩甲兽）
  if (sp.features.plates) {
    g.rect(17 + lean, 26 + bob, 5, 4, P.plates);
    g.rect(24 + lean, 25 + bob, 6, 4, P.plates);
    g.rect(31 + lean, 27 + bob, 4, 4, P.plates);
    g.rect(17 + lean, 26 + bob, 5, 1, P.outline);
    g.rect(24 + lean, 25 + bob, 6, 1, P.outline);
    g.rect(31 + lean, 27 + bob, 4, 1, P.outline);
  }

  // 头
  const hy = 21 + bob + dy;
  g.ellipse(24 + lean, hy, 9, 8, P.fur, P.outline);
  g.ellipse(24 + lean, hy + 4, 4, 3, P.muzzle);
  g.rect(23 + lean, hy + 3, 2, 1, P.outline);
  if (sp.features.tusks) {
    g.rect(19 + lean, hy + 5, 1, 3, '#f0ead8');
    g.rect(28 + lean, hy + 5, 1, 3, '#f0ead8');
  }
  // 耳
  g.tri(16 + lean, hy - 12, 3, 6, P.fur);
  g.tri(29 + lean, hy - 12, 3, 6, P.fur);
  g.set(16 + lean, hy - 8, '#c88'); g.set(31 + lean, hy - 8, '#c88');
  // 眼
  g.rect(19 + lean, hy - 1, 2, 2, P.outline);
  g.rect(27 + lean, hy - 1, 2, 2, P.outline);
}

function drawBird(g, sp, pose) {
  const P = sp.pal;
  const bob = pose.bob ?? 0;
  const wingUp = pose.swing === 1 || pose.swing === 2 || pose.armUp;

  // 尾羽
  g.line(24, 36, 18, 44, P.feather, 2);
  g.line(24, 36, 24, 45, P.feather, 2);
  g.line(24, 36, 30, 44, P.feather, 2);
  // 爪
  g.vline(21, 39, 5, P.beak);
  g.vline(27, 39, 5, P.beak);
  // 身体
  g.ellipse(24, 30 + bob, 8, 9, P.feather, P.outline);
  g.ellipse(24, 33 + bob, 5, 6, P.chest);
  // 头
  g.ellipse(24, 17 + bob, 6, 6, P.feather, P.outline);
  g.rect(21, 16 + bob, 2, 2, P.outline);
  g.rect(26, 16 + bob, 2, 2, P.outline);
  g.tri(22, 21 + bob, 4, 4, P.beak); // 喙
  // 翅膀
  if (wingUp) {
    g.line(16, 30 + bob, 7, 14 + bob, P.feather, 4);
    g.line(32, 30 + bob, 41, 14 + bob, P.feather, 4);
  } else {
    g.rect(15, 26 + bob, 4, 10, P.feather);
    g.rect(29, 26 + bob, 4, 10, P.feather);
  }
}

function drawSpider(g, sp, pose) {
  const P = sp.pal;
  const bob = pose.bob ?? 0;
  const raised = pose.swing === 2;
  // 腿（每侧 4 条，两段式）
  for (let s = -1; s <= 1; s += 2) {
    for (let i = 0; i < 4; i++) {
      const ax = 24 + s * 7;
      const ay = 32 + bob;
      const kneeX = 24 + s * (13 + i);
      const kneeY = 24 + bob - i * 2 + (raised && i === 0 ? -8 : 0);
      const footX = 24 + s * (17 + i * 2);
      const footY = 44 - i * 3 + (raised && i === 0 ? -12 : 0);
      g.line(ax, ay, kneeX, kneeY, P.leg, 1);
      g.line(kneeX, kneeY, footX, footY, P.leg, 1);
    }
  }
  // 腹部
  g.ellipse(24, 36 + bob, 9, 8, P.body, P.outline);
  g.rect(22, 34 + bob, 2, 3, P.mark);
  g.rect(25, 35 + bob, 2, 3, P.mark);
  // 头胸
  g.ellipse(24, 26 + bob, 5, 4, P.body, P.outline);
  g.set(22, 25 + bob, P.eyes); g.set(26, 25 + bob, P.eyes);
  g.set(23, 27 + bob, P.eyes); g.set(25, 27 + bob, P.eyes);
  g.set(24, 23 + bob, P.eyes);
}

// ============ 角色定义 ============

const CHARS = {
  xiake: {
    kind: 'chibi',
    pal: { skin: '#ffd9a8', hair: '#33261e', cloth: '#3d6b6d', cloth2: '#2c4d4f', accent: '#c93a2e', outline: '#20272a' },
    features: { hairTop: true, band: true, weapon: 'sword' },
  },
  lingguan: {
    kind: 'chibi',
    pal: { skin: '#ffe3c0', hair: '#2a2233', cloth: '#5b4a8a', cloth2: '#43356a', accent: '#7fd8e8', outline: '#241d33', hat: '#3a3050' },
    features: { hat: true, weapon: 'staff' },
  },
  moshi: {
    kind: 'chibi',
    pal: { skin: '#d97b5f', hair: '#3a2020', cloth: '#7a3030', cloth2: '#5c2424', accent: '#e8b84a', outline: '#2a1a14', horn: '#4a2a20' },
    features: { bulky: true, horns: true, weapon: 'hammer' },
  },
  wuzhu: {
    kind: 'chibi',
    pal: { skin: '#e8d8c8', hair: '#333', cloth: '#3a2f4a', cloth2: '#2c2438', accent: '#d8b84a', outline: '#1c1826' },
    features: { hood: true, weapon: 'bell' },
  },
  linghu: {
    kind: 'chibi',
    pal: { skin: '#f0a858', hair: '#c87830', cloth: '#e8944a', cloth2: '#c87830', accent: '#ffffff', outline: '#4a3018', muzzle: '#fdf3e0' },
    features: { foxEars: true, tail: true, muzzleChin: true },
  },
  yanjia: {
    kind: 'beast',
    pal: { fur: '#8a7a66', belly: '#b0a48c', muzzle: '#9a8a74', plates: '#66707a', outline: '#2e2a24' },
    features: { plates: true, tusks: true },
  },
  leisun: {
    kind: 'bird',
    pal: { feather: '#5a6a8a', chest: '#c8d4e8', beak: '#e8b84a', outline: '#232a3a' },
    features: {},
  },
  yelang: {
    kind: 'beast',
    pal: { fur: '#7a8290', belly: '#a8aeb8', muzzle: '#8a92a0', outline: '#2a2e36' },
    features: { bushyTail: true },
  },
  heixiong: {
    kind: 'beast',
    pal: { fur: '#4a3828', belly: '#6a5438', muzzle: '#8a6a4a', outline: '#1e160e' },
    features: { bushyTail: false },
  },
  kulou: {
    kind: 'chibi',
    pal: { skin: '#e8e0cc', hair: '#e8e0cc', cloth: '#e8e0cc', cloth2: '#c8bca0', accent: '#555a60', outline: '#3a3630' },
    features: { sockets: true, bones: true },
  },
  zhizhu: {
    kind: 'spider',
    pal: { body: '#3a2a3a', leg: '#2c2030', mark: '#c0392b', eyes: '#e84a3a', outline: '#171019' },
    features: {},
  },
  shanxiao: {
    kind: 'chibi',
    pal: { skin: '#e8b088', hair: '#8a5a3a', cloth: '#8a5a3a', cloth2: '#6a4428', accent: '#e8b088', outline: '#33221a', muzzle: '#f0d0b0' },
    features: { monkeyFace: true, tail: true, muzzleChin: true },
  },
  shanxiaowang: {
    kind: 'chibi',
    pal: { skin: '#e0a878', hair: '#6a4428', cloth: '#6a4428', cloth2: '#50341e', accent: '#e8b84a', outline: '#241812', muzzle: '#e8c8a0' },
    features: { monkeyFace: true, tail: true, crown: true, bulky: true, muzzleChin: true },
  },
  elder: {
    kind: 'chibi',
    pal: { skin: '#f0d8b8', hair: '#b8b4ac', cloth: '#5f4d3a', cloth2: '#4a3c2e', accent: '#8a2f2a', outline: '#2a221a' },
    features: { hairTop: true },
  },
};

// 动作帧：pose 参数表
const ANIMS = {
  idle: [
    { bob: 0 },
    { bob: 1 },
  ],
  walk: [
    { bob: 0, leg: 1 },
    { bob: 1, leg: 0 },
    { bob: 0, leg: 2 },
    { bob: 1, leg: 0 },
  ],
  attack: [
    { bob: 0, swing: 1 },
    { bob: 0, swing: 2 },
    { bob: 0, swing: 3 },
    { bob: 1, swing: 0 },
  ],
  cast: [
    { bob: 0, armUp: 1 },
    { bob: 0, armUp: 1, glow: true },
    { bob: 1, armUp: 1 },
  ],
};

function generateSprites() {
  const manifest = {};
  for (const [id, sp] of Object.entries(CHARS)) {
    manifest[id] = { frameSize: [48, 48], anims: {} };
    const humanoid = sp.kind === 'chibi';
    for (const [anim, poses] of Object.entries(ANIMS)) {
      const frames = [];
      let fps = anim === 'idle' ? 2.5 : anim === 'walk' ? 9 : anim === 'attack' ? 12 : 8;
      const loop = anim === 'idle' || anim === 'walk';
      if (humanoid) {
        poses.forEach((pose, i) => {
          const g = new Px(48, 48);
          drawChibi(g, sp, pose);
          g.save(path.join(OUT, 'sprites', id, `${anim}_${i}.png`));
          frames.push(`sprites/${id}/${anim}_${i}.png`);
        });
      } else {
        // 非人形：walk 复用 idle 帧，cast 复用 attack 帧
        const src = anim === 'walk' ? 'idle' : anim === 'cast' ? 'attack' : anim;
        ANIMS[src].forEach((pose, i) => {
          const g = new Px(48, 48);
          if (sp.kind === 'beast') drawBeast(g, sp, pose);
          else if (sp.kind === 'bird') drawBird(g, sp, { ...pose, swing: src === 'cast' ? 2 : pose.swing, armUp: src === 'cast' });
          else if (sp.kind === 'spider') drawSpider(g, sp, { ...pose, swing: src === 'cast' ? 2 : pose.swing, armUp: src === 'cast' });
          g.save(path.join(OUT, 'sprites', id, `${src}_${i}.png`));
          frames.push(`sprites/${id}/${src}_${i}.png`);
        });
        if (anim === 'walk') fps = 4;
        if (anim === 'cast') fps = 10;
      }
      manifest[id].anims[anim] = { frames, fps, loop };
    }
  }
  return manifest;
}

// ============ 场景绘制 ============

const SCENES = {
  heifengling: {
    seed: 101,
    sky: ['#2e3f54', '#3d5570', '#54718c', '#7491a8'],
    moon: '#d8e4ec',
    ridges: ['#243244', '#2c4036', '#37503f'],
    ground: '#4d5f3e',
    groundAlt: '#465838',
    clearing: '#5a6c48',
    details: ['pines', 'stones'],
  },
  luanzanggang: {
    seed: 202,
    sky: ['#1f1a2e', '#2c2440', '#3f3358', '#584a70'],
    moon: '#e8e4d8',
    ridges: ['#241d33', '#2e2642', '#3a3050'],
    ground: '#4a4442',
    groundAlt: '#423c3a',
    clearing: '#554e4c',
    details: ['tombs', 'deadTrees', 'fog'],
  },
  shanxiao: {
    seed: 303,
    sky: ['#7fb2c9', '#a5cbd8', '#cfe6df'],
    sun: '#f5e9c8',
    ridges: ['#3f6b52', '#4f7f5c', '#628f66'],
    ground: '#5d8a4a',
    groundAlt: '#548040',
    clearing: '#6a9656',
    details: ['peak', 'bamboo', 'flowers'],
  },
};

const HORIZON = 300;
const SCENE_W = 960;
const SCENE_H = 520;

function drawScene(id) {
  const S = SCENES[id];
  const rand = rng(S.seed);
  const g = new Px(SCENE_W, SCENE_H);

  // 天空渐变带
  const skyEnd = HORIZON;
  const bands = S.sky.length;
  for (let y = 0; y < skyEnd; y++) {
    const t = y / skyEnd * bands;
    const i = Math.min(bands - 1, Math.floor(t));
    g.hline(0, y, SCENE_W, S.sky[i]);
  }

  // 日月
  if (S.moon) {
    g.ellipse(780, 90, 26, 26, S.moon);
    g.ellipse(772, 84, 5, 5, shade(S.moon, 0.92));
    g.ellipse(788, 96, 4, 4, shade(S.moon, 0.92));
  }
  if (S.sun) {
    g.ellipse(180, 100, 30, 30, S.sun);
    g.ellipse(180, 100, 36, 36, shade(S.sun, 1.1));
  }

  // 云
  for (let i = 0; i < 4; i++) {
    const cx = rand() * SCENE_W;
    const cy = 40 + rand() * 100;
    const cw = 40 + rand() * 60;
    const cc = shade(S.sky[S.sky.length - 1], 1.12);
    g.ellipse(cx, cy, cw / 2, 8, cc);
    g.ellipse(cx - cw / 4, cy - 5, cw / 4, 6, cc);
    g.ellipse(cx + cw / 5, cy - 3, cw / 3, 5, cc);
  }

  // 远山剪影（3 层）
  S.ridges.forEach((color, li) => {
    const baseY = HORIZON - 10 - li * 36;
    let x = 0;
    let y = baseY - 20 - li * 10;
    while (x < SCENE_W) {
      const step = 60 + rand() * 90;
      const ny = baseY - (10 + rand() * (50 - li * 12));
      g.tri(x + step / 2, ny, step / 2, baseY - ny + 14, color);
      x += step * (0.7 + rand() * 0.5);
    }
    g.rect(0, baseY, SCENE_W, HORIZON - baseY + 10, color);
  });

  // 场景细节
  if (S.details.includes('pines')) {
    for (let i = 0; i < 9; i++) {
      const x = 20 + rand() * (SCENE_W - 60);
      const y = HORIZON - 24 - rand() * 30;
      const h = 30 + rand() * 26;
      g.rect(x, y, 3, h / 3, '#2a2018');
      for (let j = 0; j < 4; j++) g.tri(x + 1, y - h * 0.2 - j * h * 0.2, 10 - j * 2, h * 0.28, shade('#2f4a30', 1 + j * 0.06));
    }
  }
  if (S.details.includes('peak')) {
    g.tri(700, HORIZON - 210, 190, 230, '#557a5c');
    g.tri(700, HORIZON - 210, 90, 96, '#e8f0ee'); // 雪顶
    g.tri(560, HORIZON - 130, 130, 150, '#4a6e50');
  }
  if (S.details.includes('tombs')) {
    for (let i = 0; i < 7; i++) {
      const x = 40 + rand() * (SCENE_W - 100);
      const y = HORIZON + 10 + rand() * 60;
      const w = 12 + rand() * 8;
      const h = 14 + rand() * 10;
      g.rect(x, y, w, h, '#7a7a72');
      g.rect(x, y, w, 2, '#8a8a82');
      g.rect(x - 1, y + h, w + 2, 2, '#5a5a54');
      g.vline(x + w / 2, y + 3, h - 6, '#5a5a54');
    }
  }
  if (S.details.includes('deadTrees')) {
    for (const tx of [120, 830]) {
      const ty = HORIZON - 20;
      g.rect(tx, ty - 70, 5, 70, '#332a26');
      for (let b = 0; b < 5; b++) {
        const by = ty - 20 - b * 12;
        g.line(tx + 2, by, tx + 2 + (b % 2 ? 26 : -26), by - 12, '#332a26');
      }
    }
  }
  if (S.details.includes('bamboo')) {
    for (let i = 0; i < 12; i++) {
      const x = 30 + rand() * (SCENE_W - 60);
      const y = HORIZON - 10 - rand() * 30;
      const h = 40 + rand() * 50;
      g.vline(x, y - h, h, '#4a7a3c');
      for (let j = 0; j < 4; j++) g.line(x, y - h + j * h / 4, x + (j % 2 ? 8 : -8), y - h + j * h / 4 - 5, '#4a7a3c');
    }
  }
  if (S.details.includes('fog')) {
    for (let y = HORIZON - 34; y < HORIZON + 4; y++) {
      for (let x = 0; x < SCENE_W; x += 2) g.blend(x, y, '#9a90b8', 0.14);
    }
  }

  // 地面
  g.rect(0, HORIZON, SCENE_W, SCENE_H - HORIZON, S.ground);
  for (let y = HORIZON; y < SCENE_H; y += 18) {
    if (((y - HORIZON) / 18) % 2 === 0) g.rect(0, y, SCENE_W, 18, S.groundAlt);
  }
  // 地平线暗线
  g.hline(0, HORIZON, SCENE_W, shade(S.ground, 0.8));

  // 草石点缀
  for (let i = 0; i < 160; i++) {
    const x = rand() * SCENE_W;
    const y = HORIZON + 8 + rand() * (SCENE_H - HORIZON - 16);
    const r = rand();
    if (r < 0.75) {
      g.vline(x, y - 2, 3, shade(S.ground, 0.82));
      g.vline(x + 1, y - 1, 2, shade(S.ground, 0.75));
    } else {
      g.rect(x, y, 2, 2, shade(S.ground, 1.25));
    }
  }
  if (S.details.includes('flowers')) {
    for (let i = 0; i < 40; i++) {
      g.set(rand() * SCENE_W, HORIZON + 20 + rand() * 180, rand() < 0.5 ? '#d8788a' : '#e8c84a');
    }
  }

  // 站位空地：左右两块低透明度提亮（我方左侧 x≈240，敌方右侧 x≈730）
  for (let i = 0; i < 3200; i++) {
    const a = rand() * Math.PI * 2;
    const rr = Math.sqrt(rand());
    g.blend(245 + Math.cos(a) * 100 * rr, 370 + Math.sin(a) * 128 * rr, shade(S.ground, 1.16), 0.085);
    g.blend(730 + Math.cos(a) * 108 * rr, 375 + Math.sin(a) * 140 * rr, shade(S.ground, 1.16), 0.085);
  }

  // 四角压暗
  for (let y = 0; y < SCENE_H; y++) {
    for (let x = 0; x < SCENE_W; x++) {
      const ex = Math.min(x, SCENE_W - x) / 120;
      const ey = Math.min(y, SCENE_H - y) / 120;
      const d = Math.min(1, Math.min(ex, ey));
      const a = (1 - d) * 0.42;
      if (a > 0.01) g.blend(x, y, '#1a140e', a);
    }
  }

  g.save(path.join(OUT, 'scenes', `${id}.png`));
}

// ============ 世界大图（1440x900，摄像机卷动） ============

const WW = 1440;
const WH = 900;
const WHORIZON = 430;

function drawHouse(g, x, y, s) {
  g.rect(x, y - 62 * s, 116 * s, 62 * s, '#9a7a52');
  g.rect(x - 10 * s, y - 66 * s, 136 * s, 7 * s, '#4a3020');
  g.tri(x + 58 * s, y - 118 * s, 74 * s, 52 * s, '#5a3a2a');
  g.rect(x + 48 * s, y - 30 * s, 24 * s, 30 * s, '#3a2618');
  g.rect(x + 14 * s, y - 46 * s, 20 * s, 18 * s, '#e8c84a');
  g.rect(x + 84 * s, y - 46 * s, 20 * s, 18 * s, '#e8c84a');
  g.hline(x + 14 * s, y - 38 * s, 20 * s, '#8a6a2a');
  g.hline(x + 84 * s, y - 38 * s, 20 * s, '#8a6a2a');
}

function drawWell(g, x, y) {
  g.ellipse(x, y, 26, 13, '#8a8a82', '#4a4a44');
  g.ellipse(x, y - 3, 15, 7, '#2e2e2a');
  g.rect(x - 24, y - 54, 4, 42, '#6a4a30');
  g.rect(x + 20, y - 54, 4, 42, '#6a4a30');
  g.tri(x, y - 72, 32, 20, '#5a3a2a');
}

function drawFence(g, x0, x1, y) {
  for (let x = x0; x <= x1; x += 44) g.rect(x, y - 24, 5, 24, '#7a5a38');
  g.hline(x0, y - 20, x1 - x0, '#7a5a38');
  g.hline(x0, y - 10, x1 - x0, '#7a5a38');
}

function drawLantern(g, x, y) {
  g.rect(x, y - 40, 4, 40, '#4a3020');
  g.rect(x - 7, y - 58, 18, 20, '#c0392b');
  g.ellipse(x + 2, y - 48, 4, 4, '#ffd24a');
  g.rect(x - 8, y - 60, 20, 3, '#4a3020');
}

const WORLD_SCENES = {
  taoyuan: {
    seed: 401,
    sky: ['#8fc3d8', '#a8d2dc', '#cfe6df'],
    sun: '#f5e9c8',
    ridges: ['#4a7a5c', '#5a8a66', '#6d9a72'],
    ground: '#6a9450',
    groundAlt: '#608948',
    details: ['houses', 'flowers'],
  },
  wild_heifeng: {
    seed: 402,
    sky: ['#2e3f54', '#3d5570', '#54718c'],
    moon: '#d8e4ec',
    ridges: ['#243244', '#2c4036', '#37503f'],
    ground: '#4d5f3e',
    groundAlt: '#465838',
    details: ['pines', 'stones'],
  },
  wild_luanzang: {
    seed: 403,
    sky: ['#1f1a2e', '#2c2440', '#3f3358'],
    moon: '#e8e4d8',
    ridges: ['#241d33', '#2e2642', '#3a3050'],
    ground: '#4a4442',
    groundAlt: '#423c3a',
    details: ['tombs', 'deadTrees', 'fog'],
  },
  wild_shanxiao: {
    seed: 404,
    sky: ['#7fb2c9', '#a5cbd8', '#cfe6df'],
    sun: '#f5e9c8',
    ridges: ['#3f6b52', '#4f7f5c', '#628f66'],
    ground: '#5d8a4a',
    groundAlt: '#548040',
    details: ['peak', 'bamboo', 'flowers'],
  },
};

function drawWorldScene(id) {
  const S = WORLD_SCENES[id];
  const rand = rng(S.seed);
  const g = new Px(WW, WH);

  for (let y = 0; y < WHORIZON; y++) {
    const t = (y / WHORIZON) * S.sky.length;
    g.hline(0, y, WW, S.sky[Math.min(S.sky.length - 1, Math.floor(t))]);
  }
  if (S.moon) g.ellipse(1120, 110, 34, 34, S.moon);
  if (S.sun) g.ellipse(300, 120, 40, 40, S.sun);
  for (let i = 0; i < 7; i++) {
    const cx = rand() * WW;
    const cy = 40 + rand() * 160;
    const cw = 60 + rand() * 90;
    const cc = shade(S.sky[S.sky.length - 1], 1.1);
    g.ellipse(cx, cy, cw / 2, 11, cc);
    g.ellipse(cx - cw / 4, cy - 7, cw / 4, 8, cc);
  }

  S.ridges.forEach((color, li) => {
    const baseY = WHORIZON - 14 - li * 40;
    let x = -40;
    while (x < WW) {
      const step = 90 + rand() * 140;
      const ny = baseY - (20 + rand() * (70 - li * 14));
      g.tri(x + step / 2, ny, step / 2, baseY - ny + 20, color);
      x += step * (0.7 + rand() * 0.5);
    }
    g.rect(0, baseY, WW, WHORIZON - baseY + 16, color);
  });

  g.rect(0, WHORIZON, WW, WH - WHORIZON, S.ground);
  for (let y = WHORIZON; y < WH; y += 24) {
    if (((y - WHORIZON) / 24) % 2 === 0) g.rect(0, y, WW, 24, S.groundAlt);
  }
  g.hline(0, WHORIZON, WW, shade(S.ground, 0.8));

  // 城镇建筑与摆设
  if (S.details.includes('houses')) {
    drawHouse(g, 120, 400, 1.25);
    drawHouse(g, 1050, 380, 1.15);
    drawHouse(g, 580, 330, 0.95);
    drawWell(g, 860, 340);
    drawFence(g, 60, 480, 470);
    drawFence(g, 980, 1380, 460);
    drawLantern(g, 620, 560);
    drawLantern(g, 1020, 600);
  }
  if (S.details.includes('pines')) {
    for (let i = 0; i < 14; i++) {
      const x = 30 + rand() * (WW - 80);
      const y = WHORIZON + 10 + rand() * 60;
      const h = 46 + rand() * 40;
      g.rect(x, y, 4, h / 3, '#2a2018');
      for (let j = 0; j < 4; j++) g.tri(x + 2, y - h * 0.18 - j * h * 0.22, 14 - j * 3, h * 0.3, shade('#2f4a30', 1 + j * 0.06));
    }
  }
  if (S.details.includes('stones')) {
    for (let i = 0; i < 26; i++) {
      const x = rand() * WW;
      const y = WHORIZON + 30 + rand() * (WH - WHORIZON - 60);
      const w = 6 + rand() * 14;
      g.ellipse(x, y, w, w * 0.55, shade(S.ground, 1.3), shade(S.ground, 0.75));
    }
  }
  if (S.details.includes('tombs')) {
    for (let i = 0; i < 12; i++) {
      const x = 60 + rand() * (WW - 140);
      const y = WHORIZON + 40 + rand() * (WH - WHORIZON - 120);
      const w = 14 + rand() * 10;
      const h = 18 + rand() * 12;
      g.rect(x, y, w, h, '#7a7a72');
      g.rect(x - 1, y + h, w + 2, 2, '#5a5a54');
      g.vline(x + w / 2, y + 4, h - 8, '#5a5a54');
    }
  }
  if (S.details.includes('deadTrees')) {
    for (const tx of [180, 700, 1240]) {
      const ty = WHORIZON + 60;
      g.rect(tx, ty - 90, 6, 90, '#332a26');
      for (let b = 0; b < 5; b++) {
        const by = ty - 24 - b * 15;
        g.line(tx + 3, by, tx + 3 + (b % 2 ? 34 : -34), by - 16, '#332a26');
      }
    }
  }
  if (S.details.includes('peak')) {
    g.tri(1060, WHORIZON - 260, 260, 300, '#557a5c');
    g.tri(1060, WHORIZON - 260, 120, 130, '#e8f0ee');
    g.tri(860, WHORIZON - 160, 180, 200, '#4a6e50');
  }
  if (S.details.includes('bamboo')) {
    for (let i = 0; i < 26; i++) {
      const x = rand() * WW;
      const y = WHORIZON + 10 + rand() * 80;
      const h = 60 + rand() * 70;
      g.vline(x, y - h, h, '#4a7a3c');
      for (let j = 0; j < 4; j++) g.line(x, y - h + (j * h) / 4, x + (j % 2 ? 10 : -10), y - h + (j * h) / 4 - 7, '#4a7a3c');
    }
  }
  if (S.details.includes('fog')) {
    for (let y = WHORIZON - 40; y < WHORIZON + 8; y++) {
      for (let x = 0; x < WW; x += 2) g.blend(x, y, '#9a90b8', 0.14);
    }
  }

  // 草石花点缀
  for (let i = 0; i < 420; i++) {
    const x = rand() * WW;
    const y = WHORIZON + 12 + rand() * (WH - WHORIZON - 24);
    const r = rand();
    if (r < 0.72) {
      g.vline(x, y - 2, 3, shade(S.ground, 0.82));
      g.vline(x + 1, y - 1, 2, shade(S.ground, 0.75));
    } else if (r < 0.94) {
      g.rect(x, y, 2, 2, shade(S.ground, 1.25));
    } else if (S.details.includes('flowers')) {
      g.set(x, y, rand() < 0.5 ? '#d8788a' : '#e8c84a');
      g.set(x + 1, y, '#ffffff');
    }
  }

  for (let y = 0; y < WH; y++) {
    for (let x = 0; x < WW; x++) {
      const ex = Math.min(x, WW - x) / 150;
      const ey = Math.min(y, WH - y) / 150;
      const d = Math.min(1, Math.min(ex, ey));
      const a = (1 - d) * 0.4;
      if (a > 0.01) g.blend(x, y, '#1a140e', a);
    }
  }

  g.save(path.join(OUT, 'scenes', `world_${id}.png`));
}

// ============ 主流程 ============

fs.rmSync(OUT, { recursive: true, force: true });
const manifest = generateSprites();
manifest.$scenes = {
  default: 'scenes/heifengling.png',
  ...Object.fromEntries(Object.keys(SCENES).map((k) => [k, `scenes/${k}.png`])),
  ...Object.fromEntries(Object.keys(WORLD_SCENES).map((k) => [k, `scenes/world_${k}.png`])),
};
for (const id of Object.keys(SCENES)) drawScene(id);
for (const id of Object.keys(WORLD_SCENES)) drawWorldScene(id);
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));

const files = (function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
  );
})(OUT);
console.log(`生成完毕：${files.length} 个文件 → public/assets/`);
