# -*- coding: utf-8 -*-
"""等距构件绘制内核：地块 64x32（2:1），赛璐璐两级明暗 + 深色描边。

世界坐标 (u, v) 为格坐标，z 为离地像素高度，全部换算到最终像素：
    x = (u - v) * 32
    y = (u + v) * 16 - z
锚点 = 足迹前底顶点 (u=w, v=h)。所有绘制常数均为"最终像素"，
内部统一乘 K = SS 进入超采样画布。
"""
import numpy as np
from PIL import Image, ImageDraw

SS = 4
K = SS
TW, TH = 64, 32
HW, HH = TW // 2, TH // 2
PAD = 2                       # 四周透明余量（最终像素）
OUT = (34, 29, 26)

C = {
    'tile':    (47, 74, 92),
    'tile_d':  (30, 48, 62),
    'tile_dd': (19, 32, 43),
    'tile_l':  (76, 106, 125),
    'ridge':   (23, 36, 46),
    'verm':    (166, 61, 47),
    'verm_d':  (116, 39, 31),
    'verm_dd': (82, 27, 21),
    'verm_l':  (196, 94, 76),
    'gold':    (184, 137, 47),
    'gold_d':  (130, 92, 28),
    'gold_l':  (216, 172, 88),
    'wall':    (247, 240, 221),
    'wall_s':  (218, 207, 185),
    'wall_ss': (184, 173, 152),
    'stone':   (186, 180, 164),
    'stone_d': (147, 142, 128),
    'stone_dd': (108, 104, 94),
    'joint':   (94, 90, 82),
    'wood':    (118, 68, 52),
    'wood_d':  (88, 49, 37),
    'wood_l':  (148, 94, 72),
    'leaf':    (74, 104, 80),
    'leaf_d':  (48, 74, 56),
    'leaf_l':  (108, 138, 100),
    'lan':     (190, 74, 52),
    'lan_d':   (126, 44, 32),
    'dirt':    (184, 168, 140),
    'dirt_d':  (148, 134, 108),
    'dirt_j':  (116, 104, 84),
    'dark':    (52, 40, 34),
}


def co(col, k=1.0):
    return tuple(max(0, min(255, int(round(c * k)))) for c in col[:3])


def lerp(a, b, t):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


class Sprite:
    def __init__(self, w, h, hint=240):
        self.w, self.h = w, h
        aw = int((2 * (w + h) * HW + 200) * K)
        ah = int((hint + (w + h) * HH + 400) * K)
        self.img = Image.new('RGBA', (aw, ah), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.img)
        self.ax = aw // 2
        self.ay = ah - 300 * K

    def p(self, u, v, z=0.0):
        x = self.ax + ((u - v) - (self.w - self.h)) * HW * K
        y = self.ay + ((u + v) - (self.w + self.h)) * HH * K - z * K
        return (x, y)

    # ------------------------------------------------------------ 基础
    def _outline(self, pts, out, oc=OUT):
        if out:
            c = tuple(oc) + (255,) if len(oc) == 3 else oc
            self.d.line(list(pts) + [pts[0]], fill=c,
                        width=max(2, int(round(out * K))), joint='curve')

    def fill_poly(self, pts, col, out=0, oc=OUT):
        self.d.polygon(pts, fill=tuple(col) + (255,) if len(col) == 3 else col)
        self._outline(pts, out, oc)
        return pts

    def grad_poly(self, pts, c_top, c_bot, out=2.2, oc=OUT):
        xs = [q[0] for q in pts]
        ys = [q[1] for q in pts]
        x0, y0 = int(min(xs)), int(min(ys))
        x1, y1 = int(np.ceil(max(xs))) + 1, int(np.ceil(max(ys))) + 1
        w, hh = max(1, x1 - x0), max(1, y1 - y0)
        arr = np.zeros((hh, w, 4), dtype=np.uint8)
        t = np.linspace(0, 1, hh)[:, None]
        for i in range(3):
            arr[..., i] = (c_top[i] * (1 - t) + c_bot[i] * t).astype(np.uint8)
        arr[..., 3] = 255
        g = Image.fromarray(arr, 'RGBA')
        m = Image.new('L', (w, hh), 0)
        ImageDraw.Draw(m).polygon([(q[0] - x0, q[1] - y0) for q in pts], fill=255)
        self.img.paste(g, (x0, y0), m)
        self._outline(pts, out, oc)
        return pts

    @staticmethod
    def sub(pts, t0, t1):
        a, b, c, d = pts
        return [lerp(a, d, t0), lerp(b, c, t0), lerp(b, c, t1), lerp(a, d, t1)]

    def face(self, pts, c_top, c_bot=None, out=2.2, bands=None):
        if c_bot is None:
            self.fill_poly(pts, c_top, out=0)
        else:
            self.grad_poly(pts, c_top, c_bot, out=0)
        for t0, t1, col in (bands or []):
            self.d.polygon(self.sub(pts, t0, t1),
                           fill=tuple(col) + (255,) if len(col) == 3 else col)
        self._outline(pts, out)
        return pts

    def quad_z(self, u0, u1, v0, v1, z, col, out=2.2):
        return self.fill_poly([self.p(u0, v0, z), self.p(u1, v0, z),
                               self.p(u1, v1, z), self.p(u0, v1, z)], col, out=out)

    def line(self, a, b, col, w=1.4, alpha=255):
        self.d.line([a, b], fill=tuple(col) + (alpha,),
                    width=max(1, int(round(w * K))))

    def dot(self, c, r, col, out=0, oc=OUT):
        r = r * K
        box = [c[0] - r, c[1] - r, c[0] + r, c[1] + r]
        self.d.ellipse(box, fill=tuple(col) + (255,),
                       outline=(tuple(oc) + (255,)) if out else None,
                       width=max(1, int(round(out * K))))

    def oval(self, cx, cy, rx, ry, col, out=0, oc=OUT):
        box = [cx - rx * K, cy - ry * K, cx + rx * K, cy + ry * K]
        self.d.ellipse(box, fill=tuple(col) + (255,),
                       outline=(tuple(oc) + (255,)) if out else None,
                       width=max(1, int(round(out * K))))

    def box(self, u0, u1, v0, v1, z0, z1, c_top, c_left, c_right, out=2.2,
            bands_left=None, bands_right=None):
        """等距盒：右面(u1) → 左面(v1) → 顶面。c_left/c_right 为 (上色, 下色)。"""
        self.face([self.p(u1, v0, z1), self.p(u1, v1, z1),
                   self.p(u1, v1, z0), self.p(u1, v0, z0)],
                  c_right[0], c_right[1], out=out, bands=bands_right)
        self.face([self.p(u0, v1, z1), self.p(u1, v1, z1),
                   self.p(u1, v1, z0), self.p(u0, v1, z0)],
                  c_left[0], c_left[1], out=out, bands=bands_left)
        self.face([self.p(u0, v0, z1), self.p(u1, v0, z1),
                   self.p(u1, v1, z1), self.p(u0, v1, z1)],
                  c_top[0], c_top[1] if len(c_top) > 1 else None, out=out)

    def erase(self, pts):
        m = Image.new('L', self.img.size, 0)
        ImageDraw.Draw(m).polygon(pts, fill=255)
        arr = np.array(self.img)
        arr[..., 3] = np.where(np.array(m) > 100, 0, arr[..., 3])
        self.img = Image.fromarray(arr, 'RGBA')
        self.d = ImageDraw.Draw(self.img)

    # ------------------------------------------------------------ 收尾
    def finish(self):
        bb = self.img.getbbox()
        if bb is None:
            raise RuntimeError('empty sprite')
        L, R = self.ax - bb[0], bb[2] - self.ax
        half = int(max(L, R)) + PAD * K
        W = 2 * half
        top = self.ay - bb[1]
        bot = max(0, bb[3] - self.ay)
        H = int(top) + int(bot) + 2 * PAD * K
        crop = self.img.crop((self.ax - half, self.ay - top - PAD * K,
                              self.ax + half, self.ay - top - PAD * K + H))
        out = crop.resize((W // K, H // K), Image.LANCZOS)
        arr = np.array(out)
        a = arr[..., 3]
        a[a < 8] = 0
        return Image.fromarray(arr, 'RGBA')
