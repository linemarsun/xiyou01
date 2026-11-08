# -*- coding: utf-8 -*-
"""店铺门脸 v2：用「体量 + 色调」区分的四类店铺。

标高标准（沿用既有体系，只让绝对值随楼层变化）：
    檐口 z = 墙身高 wall_h（檐口永远落在墙顶，外挑 OVER≈4.3px 压住墙顶）
    脊 z   = 檐口 + RISE(40)
    anchor = 足迹前底顶点 p(umax, vmax)
轮廓差异：
    酒楼   5×4  墙高 242（两层、屋面整体高邻居一截）
    武器铺 6×3  墙高 172（最宽、最矮扁）
    药店   4×4  墙高 156（中宽、最亮）
    当铺   3×4  墙高 138（最窄、最低、最暗）
"""
import json
import math
import os

from PIL import Image, ImageDraw, ImageFont

import housebuild as HB
import post as POST

OX, OY = HB.OX, HB.OY
MOD, PRE = HB.MOD, HB.PRE
ROOT = HB.ROOT

W, D, H = 4, 4, 170
RISE = 40
OVER = 0.15
SPEC = {
    'tavern':   {'w': 5, 'd': 4, 'h': 242},
    'weapon':   {'w': 6, 'd': 3, 'h': 172},
    'pharmacy': {'w': 4, 'd': 4, 'h': 156},
    'pawnshop': {'w': 3, 'd': 4, 'h': 138},
}
U0, V0 = 1.0, 1.0

CREAM = (240, 233, 214)
CREAM_L = (249, 245, 234)
BEIGE = (228, 210, 180)
WOOD = (150, 78, 48)
WOOD_L = (186, 138, 96)
RED = (150, 52, 44)
RED_L = (196, 96, 74)
RED_D = (92, 34, 28)
GOLD = (186, 139, 48)
GOLD_L = (226, 190, 112)
INK = (38, 34, 32)
INK_R = (74, 42, 36)
IRON = (86, 84, 80)
IRON_D = (52, 51, 50)
IRON_L = (150, 156, 160)

FACADE = {'lit': (18, 26, 34, 30), 'side': (10, 14, 20)}
END = (34, 29, 26)
ROOF_T = {'ridge': 0.00, 'high': 0.40, 'mid': 0.75, 'low': 1.00}
ROOF_C = [(26, 40, 52), (50, 76, 96), (86, 118, 138), (134, 164, 180)]
BACK_C = [(24, 34, 44), (44, 64, 80), (72, 96, 112), (104, 128, 142)]


def S(u, v, z=0):
    return (OX + (u - v) * 32.0, OY + (u + v) * 16.0 - z)


def eu(n=1.0):
    return (32.0 * n, 16.0 * n)


def ev(n=1.0):
    return (-32.0 * n, 16.0 * n)


def ez(h=0.0):
    return (0.0, -h)


def droop(n, rise):
    """沿 +v 走 n 格同时下降 rise px 的屏幕向量。"""
    return (-32.0 * n, 16.0 * n + rise)


def quad(d, o, u, v, fill):
    p0 = (o[0], o[1])
    p1 = (o[0] + u[0], o[1] + u[1])
    p2 = (o[0] + u[0] + v[0], o[1] + u[1] + v[1])
    p3 = (o[0] + v[0], o[1] + v[1])
    d.polygon([p0, p1, p2, p3], fill=fill)
    return [p0, p1, p2, p3]


def mix(a, b, t):
    return tuple(int(round(a[i] * (1 - t) + b[i] * t)) for i in range(3))


def sc(p0, p1, t):
    return (p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t)


def grad(d, o, u, v, c0, c1, steps=10):
    """沿 v 方向分条渐变填一个平行四边形。"""
    for i in range(steps):
        t0, t1 = i / steps, (i + 1) / steps
        a0 = (o[0] + v[0] * t0, o[1] + v[1] * t0)
        a1 = (o[0] + u[0] + v[0] * t0, o[1] + u[1] + v[1] * t0)
        b0 = (o[0] + v[0] * t1, o[1] + v[1] * t1)
        b1 = (o[0] + u[0] + v[0] * t1, o[1] + u[1] + v[1] * t1)
        d.polygon([a0, a1, b1, b0], fill=mix(c0, c1, (t0 + t1) / 2.0))


def ramp(c, t):
    stops = ROOF_C
    t = min(max(t, 0.0), 1.0) * (len(stops) - 1)
    i = int(t)
    return mix(stops[i], stops[min(i + 1, len(stops) - 1)], t - i)


def roof_slope(d, o, u, v, lit):
    """一片坡：面 + 瓦垄（沿坡向下） + 檐口板与瓦当。o = 脊边左端。"""
    if lit:
        grad(d, o, u, v, ROOF_C[1], ROOF_C[3], 12)
    else:
        grad(d, o, u, v, BACK_C[0], BACK_C[1], 12)
    # 瓦垄：沿坡方向（v 方向），8px 一道
    n = max(4, int(round(UVAL(u) / 8.0)))
    for i in range(1, n):
        t = i / n
        a = (o[0] + u[0] * t, o[1] + u[1] * t)
        b = (a[0] + v[0], a[1] + v[1])
        col = (84, 110, 128, 255) if lit else (33, 47, 59, 255)
        d.line([a, b], fill=col, width=2 if lit else 1)
        d.line([(a[0] + 1, a[1]), (b[0] + 1, b[1])],
               fill=(112, 140, 158, 160) if lit else (30, 42, 54, 120), width=1)
    d.line([o, (o[0] + u[0], o[1] + u[1])], fill=(18, 26, 34, 210), width=2)
    e0 = (o[0] + v[0], o[1] + v[1])
    e1 = (e0[0] + u[0], e0[1] + u[1])
    if lit:
        # 檐口板（竖直下挂 7px）→ 檐口真正压住墙顶
        quad(d, e0, u, ez(7), (58, 74, 88, 255))
        d.line([(e0[0], e0[1] + 7), (e1[0], e1[1] + 7)], fill=(22, 30, 40, 255), width=2)
        d.line([e0, e1], fill=(158, 180, 192, 255), width=2)
        nch = max(5, int(round(UVAL(u) / 10.0)))
        for i in range(nch):
            t = (i + 0.5) / nch
            b0 = (e0[0] + u[0] * t, e0[1] + u[1] * t + 2)
            r = 5.0
            d.ellipse([b0[0] - r, b0[1] - r, b0[0] + r, b0[1] + r],
                      fill=(126, 152, 168, 255), outline=(20, 28, 36, 255), width=2)
            d.arc([b0[0] - r * .7, b0[1] - r * .9, b0[0] + r * .5, b0[1] + r * .3],
                  200, 340, fill=(206, 220, 228, 255), width=1)
    else:
        d.line([e0, e1], fill=(14, 21, 28, 255), width=2)


def UVAL(u):
    return math.hypot(u[0], u[1])


def ridge(d, p0, p1, z):
    """正脊：一条沿 u 的三棱柱，顶面受光、前脸背光、脊顶压金线。"""
    a = (OX + (p0[0] - p0[1]) * 32.0, OY + (p0[0] + p0[1]) * 16.0 - z)
    b = (OX + (p1[0] - p1[1]) * 32.0, OY + (p1[0] + p1[1]) * 16.0 - z)
    top, mid, bot = 7, -1, 9
    d.polygon([(a[0], a[1] - top), (b[0], b[1] - top), (b[0], b[1] - mid), (a[0], a[1] - mid)],
              fill=(148, 172, 188, 255))
    d.polygon([(a[0], a[1] - mid), (b[0], b[1] - mid), (b[0], b[1] + bot), (a[0], a[1] + bot)],
              fill=(38, 60, 78, 255))
    d.line([(a[0], a[1] - top), (b[0], b[1] - top)], fill=(228, 188, 108, 255), width=2)
    d.line([(a[0], a[1] - mid), (b[0], b[1] - mid)], fill=(186, 139, 48, 255), width=2)
    d.line([(a[0], a[1] + bot), (b[0], b[1] + bot)], fill=(18, 26, 34, 210), width=2)
    for px, sgn in ((a, -1), (b, 1)):
        ex = px[0] + 8 * sgn
        d.polygon([(px[0], px[1] - top), (ex, px[1] - top - 2),
                   (ex, px[1] + bot + 1), (px[0], px[1] + bot)], fill=(46, 72, 90, 255))


def gable(d, uu, v0, v1, eave, top, color, front, inset=None):
    """端面山墙：沿用民居那套「粉墙三角 + 内收山花 + 外侧博风板」赛璐璐做法。"""
    def q(v, z):
        return (OX + (uu - v) * 32.0, OY + (uu + v) * 16.0 - z)
    a = q(v0, eave)
    b = q(v1, eave)
    c = q((v0 + v1) / 2.0, top)
    d.polygon([a, b, c], fill=color)
    # 竖向明暗：同色系，下暗上略亮（山墙自己也有体积，而不是一块平色）
    NB = 6
    for k in range(NB):
        t0, t1 = k / float(NB), (k + 1) / float(NB)
        dxa, dya = c[0] - a[0], c[1] - a[1]
        dxb, dyb = c[0] - b[0], c[1] - b[1]
        p0 = (a[0] + dxa * t0, a[1] + dya * t0)
        p1 = (b[0] + dxb * t0, b[1] + dyb * t0)
        p2 = (b[0] + dxb * t1, b[1] + dyb * t1)
        p3 = (a[0] + dxa * t1, a[1] + dya * t1)
        col = mix(color, (18, 15, 13), 0.14 - 0.11 * t0)
        d.polygon([p0, p1, p2, p3], fill=col)
    # 内收山花（朱红），外圈留一道粉墙边 —— 和民居山墙同一种画法
    def ins(p, k):
        return (p[0] + (c[0] - p[0]) * k, p[1] + (c[1] - p[1]) * k)
    if inset:
        d.polygon([ins(a, 0.13), ins(b, 0.13), ins(c, 0.20)], fill=inset)
    # 墙顶压边（梁枋）
    d.polygon([a, b, (b[0], b[1] + 7), (a[0], a[1] + 7)], fill=mix(color, (18, 15, 13), 0.42))
    d.polygon([a, b, (b[0], b[1] + 2.4), (a[0], a[1] + 2.4)], fill=mix(color, (255, 255, 255), 0.10))
    # 外侧博风板（深木 + 一道亮边），压在坡面端头外侧
    for P0 in (a, b):
        dx, dy = c[0] - P0[0], c[1] - P0[1]
        ln = math.hypot(dx, dy) or 1.0
        nx, ny = -dy / ln, dx / ln
        mid = ((P0[0] + c[0]) / 2.0, (P0[1] + c[1]) / 2.0)
        if (nx * (a[0] + b[0] - 2 * mid[0]) + ny * (a[1] + b[1] - 2 * mid[1])) > 0:
            nx, ny = -nx, -ny                       # 取朝外法向
        w = 4.5
        d.polygon([P0, c, (c[0] + nx * w, c[1] + ny * w),
                   (P0[0] + nx * w, P0[1] + ny * w)], fill=(58, 46, 40))
        d.line([(P0[0] + nx * w, P0[1] + ny * w), (c[0] + nx * w, c[1] + ny * w)],
               fill=GOLD, width=1)
    # 悬鱼
    d.polygon([(c[0], c[1] + 5), (c[0] + 5, c[1] + 11), (c[0], c[1] + 18),
               (c[0] - 5, c[1] + 11)], fill=GOLD)
# ---------------------------------------------------------------- 门脸平面（宽 w*32 × 高 h）
WALLC = {'tavern': BEIGE, 'weapon': IRON, 'pharmacy': CREAM_L, 'pawnshop': INK_R}
# 侧脸主色 / 侧脸梁柱（山墙跟着侧脸走，保证同色系）
SIDEC = {'tavern': RED, 'weapon': IRON, 'pharmacy': CREAM_L, 'pawnshop': INK_R}
SIDEF = {'tavern': RED, 'weapon': None, 'pharmacy': RED, 'pawnshop': RED_D}
# 山墙底（粉墙） / 山花（内收那一块，取墙身同族色）
GCOL = {'tavern': (236, 229, 212), 'weapon': (226, 222, 210),
        'pharmacy': (246, 242, 232), 'pawnshop': (104, 66, 58)}
GINS = {'tavern': RED, 'weapon': IRON_D, 'pharmacy': RED, 'pawnshop': (64, 34, 29)}


def face_tavern(w, h):
    """酒楼：两层，上层木格窗，腰檐 + 朱红立柱，下层开阔门面。"""
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, w, h], fill=BEIGE)
    d.rectangle([0, 0, w, 12], fill=RED)
    d.line([(0, 12), (w, 12)], fill=RED_D, width=2)
    for x in (0, w - 13):
        d.rectangle([x, 0, x + 12, h], fill=RED)
        d.line([(x + 2, 0), (x + 2, h)], fill=RED_L, width=1)
        d.line([(x + 8, 0), (x + 8, h)], fill=RED_D, width=1)
    for x0 in (26, 90):
        d.rectangle([x0, 20, x0 + 44, 92], fill=(247, 240, 221), outline=WOOD, width=4)
        for i in range(1, 4):
            d.line([x0 + i * 11, 20, x0 + i * 11, 92], fill=(104, 70, 48), width=2)
        for i in range(1, 4):
            d.line([x0, 20 + i * 18, x0 + 44, 20 + i * 18], fill=(104, 70, 48), width=2)
        d.rectangle([x0 - 2, 20, x0 + 46, 92], outline=(58, 38, 30), width=2)
    # 腰檐（厚朱红带 + 米白压边）
    d.rectangle([0, 118, w, 132], fill=RED)
    d.line([(0, 118), (w, 118)], fill=RED_L, width=2)
    d.line([(0, 132), (w, 132)], fill=(214, 206, 190), width=3)
    for x in range(6, w - 6, 14):                       # 檐下挂落
        d.pieslice([x, 132, x + 12, 144], 180, 360, fill=RED_D)
    plaque(d, 40, 146, 120, 174, (52, 36, 28))
    # 下层：三间敞开铺面
    d.rectangle([14, 180, w - 14, 220], fill=(28, 24, 22))
    d.rectangle([18, 184, w - 18, 216], fill=(56, 40, 30))
    for i in range(3):
        x0 = 24 + i * (w - 60) / 3
        d.rectangle([x0, 188, x0 + (w - 60) / 3 - 6, 200], fill=(150, 104, 64))
        d.rectangle([x0, 202, x0 + (w - 60) / 3 - 6, 210], fill=(120, 80, 52))
    d.rectangle([14, 214, w - 14, 222], fill=(168, 120, 76))
    d.rectangle([0, h - 22, w, h], fill=WOOD)
    d.line([(0, h - 22), (w, h - 22)], fill=WOOD_L, width=3)
    return im


def face_pharmacy(w, h):
    """药店：整面米白（比邻居亮一档），朱红梁枋，药柜格 + 开敞柜台。"""
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, w, h], fill=CREAM_L)
    d.rectangle([0, 0, w, 9], fill=RED)
    d.line([(0, 9), (w, 9)], fill=GOLD, width=2)
    for x in (0, w - 9):
        d.rectangle([x, 0, x + 9, h], fill=RED)
        d.line([(x + 2, 0), (x + 2, h)], fill=RED_L, width=1)
    plaque(d, 32, 14, w - 32, 34, (46, 34, 26))
    d.rectangle([14, 40, w - 14, 104], fill=(214, 200, 176), outline=WOOD, width=3)
    for r in range(3):
        for c in range(6):
            x0, y0 = 17 + c * (w - 34) / 6, 43 + r * 20
            d.rectangle([x0, y0, x0 + (w - 34) / 6 - 3, y0 + 18],
                        fill=(230, 218, 194), outline=(122, 86, 56), width=1)
            d.line([(x0 + 6, y0 + 9), (x0 + 9, y0 + 9)], fill=GOLD, width=2)
    d.rectangle([6, 104, w - 6, 112], fill=(170, 128, 82))
    d.line([(6, 104), (w - 6, 104)], fill=(214, 176, 118), width=2)
    d.rectangle([6, 112, w - 6, 128], fill=(140, 104, 68))
    for x in range(12, w - 6, 16):
        d.line([(x, 112), (x, 128)], fill=(118, 86, 56), width=2)
    d.rectangle([0, 128, w, h], fill=WOOD)
    d.line([(0, 128), (w, 128)], fill=WOOD_L, width=3)
    return im


def face_weapon(w, h):
    """武器铺：整面铁灰，深色横板挂兵器（一把大刀 + 一面四象分色圆盾），厚门板；不设朱红大柱。"""
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, w, h], fill=IRON)
    d.rectangle([0, 0, w, 8], fill=IRON_D)
    for x in (0, w - 8):
        d.rectangle([x, 0, x + 8, h], fill=IRON_D)
    # 深色木板兵器墙（横板拼缝）
    d.rectangle([10, 11, w - 10, 88], fill=(58, 43, 32), outline=(30, 23, 18), width=3)
    for y in range(26, 88, 15):
        d.line([(12, y), (w - 12, y)], fill=(46, 34, 25), width=2)
        d.line([(12, y - 1), (w - 12, y - 1)], fill=(80, 60, 44), width=1)
    d.line([(11, 12), (w - 11, 12)], fill=(98, 72, 46), width=2)
    d.line([(11, 87), (w - 11, 87)], fill=(30, 23, 18), width=3)
    plaque(d, 26, 14, 150, 36, (198, 186, 162))
    # 墙上兵器：一把大刀（清楚的月牙弧刃） + 一面四象分色圆盾（都放在左中段，避开右段兵器架）
    blade_g(d, 34, 40, 48)
    shield(d, 86, 56, 20)
    # 朱红只作窄饰（兵器墙下沿压边）
    d.rectangle([10, 88, w - 10, 91], fill=RED_D)
    # 两扇厚门板（提亮 + 铁箍 + 门环）
    dw = int(w * 0.42)
    for x0 in (10, w - 10 - dw):
        d.rectangle([x0, 96, x0 + dw, 166], fill=(118, 86, 58),
                    outline=(64, 44, 30), width=3)
        for k in range(1, 3):
            xx = x0 + dw * k / 3.0
            d.line([(xx, 98), (xx, 164)], fill=(92, 66, 44), width=2)
        for yy in (108, 148):
            d.rectangle([x0 + 4, yy, x0 + dw - 4, yy + 9], fill=IRON, outline=IRON_D, width=1)
            d.line([(x0 + 6, yy + 2), (x0 + dw - 6, yy + 2)], fill=IRON_L, width=1)
        rx = x0 + dw * 0.5
        d.ellipse([rx - 8, 122, rx + 8, 138], outline=(74, 74, 72), width=3)
        d.ellipse([rx - 4, 126, rx + 4, 134], outline=GOLD, width=2)
    d.rectangle([w // 2 - 4, 96, w // 2 + 4, 166], fill=(40, 30, 24))
    d.rectangle([0, 166, w, h], fill=(46, 42, 38))
    d.line([(0, 166), (w, 166)], fill=(28, 26, 24), width=2)
    return im


def blade_g(d, x, ytop, hgt):
    """挂墙大刀：月牙弧刃在上（刃口一道亮线），长柄在下带红缨，远看也能读出弧线。"""
    yb = ytop + hgt * 0.60                      # 刃底 / 刀镡
    # 长柄 + 红缨
    d.line([(x, yb), (x, ytop + hgt)], fill=(112, 76, 44), width=6)
    d.line([(x - 1, yb + 3), (x - 1, ytop + hgt - 3)], fill=(172, 128, 80), width=2)
    d.line([(x - 7, yb + hgt * 0.11), (x + 7, yb + hgt * 0.11)], fill=(176, 58, 44), width=4)
    for s in (-3, 0, 3):
        d.line([(x + s, yb + hgt * 0.155), (x + s, yb + hgt * 0.25)], fill=(200, 70, 52), width=2)
    d.polygon([(x - 9, yb - 3), (x + 9, yb - 3), (x + 7, yb + 4), (x - 7, yb + 4)],
              fill=GOLD, outline=(120, 84, 34))          # 刀镡
    # 月牙弧刃：左背厚、右刃薄（外弧在左上，刃口沿右上）
    pts = [(x + 2, yb - 2),
           (x - 6, yb - hgt * 0.15),
           (x - 9, yb - hgt * 0.38),
           (x - 3, yb - hgt * 0.57),
           (x + 7, yb - hgt * 0.615),
           (x + 13, yb - hgt * 0.575),
           (x + 6, yb - hgt * 0.43),
           (x + 4, yb - hgt * 0.23),
           (x + 5, yb - 2)]
    d.polygon(pts, fill=(194, 203, 210), outline=(84, 92, 100), width=2)
    d.line([(x + 7, yb - hgt * 0.615), (x + 13, yb - hgt * 0.575)], fill=(250, 252, 254), width=2)
    d.line([(x + 13, yb - hgt * 0.575), (x + 6, yb - hgt * 0.43)], fill=(240, 247, 251), width=2)
    d.line([(x + 6, yb - hgt * 0.43), (x + 4, yb - hgt * 0.23), (x + 5, yb - 2)],
           fill=(156, 164, 170), width=2)
    d.line([(x - 6, yb - hgt * 0.15), (x - 9, yb - hgt * 0.38)], fill=(110, 118, 124), width=2)


def shield(d, cx, cy, r):
    """圆盾：铁圈 + 四象分色（左上朱红 / 右下暗红 / 另两象浅钢）+ 金心 + 铁钉。"""
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=IRON_D)
    d.ellipse([cx - r + 4, cy - r + 4, cx + r - 4, cy + r - 4], fill=(158, 164, 168))
    d.pieslice([cx - r + 4, cy - r + 4, cx + r - 4, cy + r - 4], 180, 270, fill=RED)
    d.pieslice([cx - r + 4, cy - r + 4, cx + r - 4, cy + r - 4], 0, 90, fill=RED_D)
    d.arc([cx - r + 2, cy - r + 2, cx + r - 2, cy + r - 2], 184, 266, fill=(206, 214, 220), width=2)
    d.line([(cx - r + 4, cy), (cx + r - 4, cy)], fill=INK, width=4)
    d.line([(cx, cy - r + 4), (cx, cy + r - 4)], fill=INK, width=4)
    d.ellipse([cx - 8, cy - 8, cx + 8, cy + 8], fill=GOLD, outline=(118, 82, 32), width=2)
    d.arc([cx - 5, cy - 5, cx - 1, cy - 1], 180, 270, fill=(236, 210, 150), width=1)
    for i in range(12):
        a = math.radians(i * 30 + 15)
        px_, py_ = cx + (r - 6) * math.cos(a), cy + (r - 6) * math.sin(a)
        d.ellipse([px_ - 2, py_ - 2, px_ + 2, py_ + 2], fill=(52, 54, 56))


def face_pawnshop(w, h):
    """当铺：窄面宽、檐口低，暗红偏墨，厚门板 + 小栅窗 + 高位素匾。"""
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, w, h], fill=INK_R)
    d.rectangle([0, 0, w, 10], fill=INK)
    for x in (0, w - 7):
        d.rectangle([x, 0, x + 7, h], fill=INK)
    plaque(d, 12, 14, w - 12, 36, (206, 196, 174))
    # 小栅窗（厚框 + 竖栅）
    d.rectangle([10, 44, 37, 70], fill=INK, outline=(160, 66, 52), width=2)
    for i in range(4):
        d.line([(13 + i * 6, 46), (13 + i * 6, 68)], fill=(104, 84, 74), width=2)
    d.line([(11, 45), (36, 45)], fill=(66, 50, 44), width=1)
    # 厚门板（窄）
    d.rectangle([42, 44, w - 12, 100], fill=(52, 32, 28), outline=(26, 19, 17), width=3)
    for k in range(1, 4):
        xx = 42 + (w - 54) * k / 4
        d.line([(xx, 46), (xx, 98)], fill=(38, 25, 22), width=2)
    for yy in (56, 86):
        d.rectangle([44, yy, w - 14, yy + 7], fill=(92, 40, 34))
    d.ellipse([w - 30, 66, w - 20, 76], outline=GOLD, width=2)
    # 高柜台（厚重，压在最前）
    d.rectangle([4, 100, w - 4, 126], fill=(66, 40, 34), outline=(28, 19, 17), width=3)
    d.rectangle([2, 98, w - 2, 106], fill=(110, 42, 36))
    d.line([(2, 98), (w - 2, 98)], fill=(160, 74, 58), width=2)
    for x in range(10, w - 6, 12):
        d.line([(x, 108), (x, 126)], fill=(48, 30, 26), width=2)
    d.rectangle([0, h - 10, w, h], fill=INK)
    return im


FACE = {'tavern': face_tavern, 'weapon': face_weapon,
        'pharmacy': face_pharmacy, 'pawnshop': face_pawnshop}


# ---------------------------------------------------------------- 门前物件（2:1 投影）
def lantern(d, x, y, r=9, cord=12):
    d.line([(x, y - cord), (x, y)], fill=(70, 46, 34), width=2)
    d.polygon([(x - 3, y), (x + 3, y), (x + 2, y + 4), (x - 2, y + 4)], fill=GOLD)
    d.ellipse([x - r, y + 3, x + r, y + 3 + 2 * r - 2], fill=(182, 66, 48))
    d.arc([x - r, y + 3, x + r, y + 3 + 2 * r - 2], 200, 340, fill=(226, 148, 96), width=2)
    d.line([(x - r * 0.4, y + 6), (x - r * 0.4, y + 2 * r)], fill=(120, 40, 32), width=1)
    d.line([(x + r * 0.4, y + 6), (x + r * 0.4, y + 2 * r)], fill=(120, 40, 32), width=1)
    d.polygon([(x - 3, y + 2 * r + 1), (x + 3, y + 2 * r + 1),
               (x + 2, y + 2 * r + 5), (x - 2, y + 2 * r + 5)], fill=GOLD)
    for i in (-1, 0, 1):
        d.line([(x + i * 2, y + 2 * r + 5), (x + i * 2, y + 2 * r + 11)], fill=(176, 52, 42), width=1)


def plaque(d, x0, y0, x1, y1, dark=(44, 32, 26)):
    """素面匾底板（不写字，文字由引擎叠加）。浅底自动换深框，深底配金框。"""
    light = sum(dark[:3]) > 330
    frame = (56, 44, 34) if light else GOLD
    inner = (120, 104, 78) if light else (120, 90, 44, 180)
    sheen = (232, 226, 210) if light else (146, 112, 58, 120)
    d.rectangle([x0, y0, x1, y1], fill=dark, outline=frame, width=3)
    d.rectangle([x0 + 3, y0 + 3, x1 - 3, y1 - 3], outline=inner, width=1)
    d.line([(x0 + 5, y0 + 5), (x1 - 5, y0 + 5)], fill=sheen, width=1)


def slab(d, u0, u1, vb, dv, z0, z1, top, side):
    """从 v=vb 墙面外挑 dv 格、z0..z1 的一块板（挑台 / 腰檐 / 柜台）。
    正面必须从 z1 向下落到 z0（屏内 y 增大），否则会画到墙面上方去。"""
    quad(d, S(u0, vb, z1), eu(u1 - u0), ev(dv), top)
    quad(d, S(u0, vb + dv, z1), eu(u1 - u0), ez(z0 - z1), side)
    d.line([S(u0, vb + dv, z0), S(u1, vb + dv, z0)], fill=(20, 16, 14, 225), width=3)
    d.line([S(u0, vb, z1), S(u1, vb, z1)], fill=(255, 255, 255, 55), width=1)


def rail(d, u0, u1, vp, z, hgt, col, dark):
    n = max(2, int(round((u1 - u0) * 3)))
    for k in range(n + 1):
        u = u0 + (u1 - u0) * k / n
        a = S(u, vp, z)
        d.line([a, (a[0], a[1] - hgt)], fill=col, width=2)
    d.line([S(u0, vp, z + hgt), S(u1, vp, z + hgt)], fill=col, width=4)
    d.line([S(u0, vp, z + hgt), S(u1, vp, z + hgt)], fill=dark, width=1)
    d.line([S(u0, vp, z + hgt * 0.55), S(u1, vp, z + hgt * 0.55)], fill=dark, width=2)


def props_tavern(d, umin, umax, vb, h):
    """两层：挑台外挑更深 + 栏杆 + 外挑腰檐 + 檐下双灯 + 酒旗杆。"""
    u0, u1 = umin + 0.12, umax - 0.12
    z = 120
    slab(d, u0, u1, vb, 0.44, z - 8, z, (206, 176, 132), (144, 106, 74))     # 挑台台板
    slab(d, u0 - 0.08, u1 + 0.08, vb, 0.62, z - 17, z - 8, (162, 70, 50), (104, 46, 34))
    rail(d, u0, u1, vb + 0.44, z, 22, RED, RED_D)                            # 栏杆
    for u in (u0 + 0.55, u1 - 0.55):                                        # 檐下双灯
        lx, ly = S(u, vb + 0.62, z - 22)
        lantern(d, lx, ly, 11, 10)
    bx, by = S(u0 + 0.55, vb + 1.10, 0)                                      # 酒帘杆（立于门前左首外侧）
    d.line([(bx, by), (bx, by - 208)], fill=(96, 62, 42), width=5)
    d.line([(bx + 1, by - 208), (bx + 1, by - 8)], fill=(150, 104, 70), width=1)
    d.line([(bx - 3, by - 208), (bx + 35, by - 208)], fill=(96, 62, 42), width=4)  # 横担
    d.polygon([(bx + 3, by - 202), (bx + 34, by - 202), (bx + 34, by - 108),
               (bx + 3, by - 108)], fill=(178, 62, 48))
    d.polygon([(bx + 3, by - 202), (bx + 12, by - 202), (bx + 12, by - 108),
               (bx + 3, by - 108)], fill=(200, 88, 68))                     # 受光布面
    d.line([(bx + 34, by - 202), (bx + 34, by - 108)], fill=(104, 32, 26), width=3)
    d.line([(bx + 3, by - 202), (bx + 34, by - 202)], fill=(232, 152, 100), width=2)
    d.line([(bx + 3, by - 108), (bx + 34, by - 108)], fill=(96, 30, 24), width=3)
    for yy in (-172, -146):
        d.line([(bx + 8, by + yy), (bx + 30, by + yy)], fill=(208, 122, 96), width=2)


def props_pharmacy(d, umin, umax, vb, h):
    """葫芦幌子（檐下挑杆）+ 柜台外挑一道。"""
    hx, hy = S(umin + 0.52, vb, 132)
    d.line([(hx, hy), (hx - 22, hy + 9)], fill=(104, 70, 46), width=4)
    gx, gy = hx - 20, hy + 10
    d.line([(gx, gy), (gx, gy + 13)], fill=(70, 50, 34), width=2)
    d.ellipse([gx - 7, gy + 11, gx + 7, gy + 30], fill=(214, 166, 80), outline=(126, 82, 34), width=2)
    d.ellipse([gx - 12, gy + 33, gx + 12, gy + 68], fill=(214, 166, 80), outline=(126, 82, 34), width=2)
    d.arc([gx - 10, gy + 35, gx + 10, gy + 68], 196, 330, fill=(238, 202, 128), width=2)
    d.line([(gx - 4, gy + 31), (gx + 4, gy + 31)], fill=(126, 82, 34), width=2)
    slab(d, umin + 0.06, umax - 0.06, vb, 0.24, 40, 48, (200, 158, 104), (140, 100, 66))


def props_weapon(d, umin, umax, vb, h):
    """兵器架（4 杆：粗枪杆 + 收细枪头 + 红缨）+ 门前立盾。架放在右段，让左段门板与墙面兵器露出来。"""
    u0, u1 = umin + 3.85, umax - 0.28
    vp = vb + 0.55
    HH = 86
    a, b = S(u0, vp, 0), S(u1, vp, 0)
    d.line([(a[0], a[1]), (a[0], a[1] - HH)], fill=(96, 62, 40), width=6)
    d.line([(b[0], b[1]), (b[0], b[1] - HH)], fill=(96, 62, 40), width=6)
    d.line([(a[0], a[1] - HH), (b[0], b[1] - HH)], fill=(120, 80, 52), width=7)
    d.line([(a[0], a[1] - HH - 3), (b[0], b[1] - HH - 3)], fill=(158, 116, 76), width=1)
    d.line([(a[0], a[1] - 30), (b[0], b[1] - 30)], fill=(104, 70, 46), width=5)
    d.line([(a[0] - 4, a[1] + 1), (b[0] + 4, b[1] + 1)], fill=(72, 54, 40), width=4)  # 架底落脚线
    n = 4
    for k in range(n):
        t = (k + 0.5) / n
        sx = a[0] + (b[0] - a[0]) * t
        sy = a[1] + (b[1] - a[1]) * t
        bar = sy - HH
        d.line([(sx, sy - 6), (sx, bar + 4)], fill=(142, 104, 66), width=7)    # 加粗枪杆
        d.line([(sx - 3, sy - 7), (sx - 3, bar + 4)], fill=(182, 144, 100), width=2)
        d.line([(sx + 3, sy - 7), (sx + 3, bar + 4)], fill=(106, 74, 44), width=1)
        d.polygon([(sx - 5, bar + 4), (sx + 5, bar + 4), (sx, bar - 26)],
                  fill=(210, 217, 224), outline=(84, 92, 100), width=1)        # 枪头
        d.line([(sx - 1, bar + 2), (sx - 1, bar - 22)], fill=(250, 252, 254), width=1)
        d.line([(sx - 6, bar + 6), (sx + 6, bar + 6)], fill=(176, 52, 42), width=4)  # 红缨
        for s in (-3, 0, 3):
            d.line([(sx + s, bar + 9), (sx + s, bar + 19)], fill=(202, 68, 52), width=2)
    sx2, sy2 = S(umin + 0.42, vb + 1.00, 0)                                   # 立盾（竖向分色）
    d.polygon([(sx2 - 20, sy2 - 6), (sx2 + 20, sy2 - 6),
               (sx2 + 16, sy2 - 56), (sx2 - 16, sy2 - 56)], fill=IRON_D)       # 铁边
    d.polygon([(sx2 - 16, sy2 - 10), (sx2 + 16, sy2 - 10),
               (sx2 + 13, sy2 - 52), (sx2 - 13, sy2 - 52)], fill=(158, 165, 170))  # 浅钢半面
    d.polygon([(sx2 - 16, sy2 - 10), (sx2, sy2 - 10),
               (sx2, sy2 - 52), (sx2 - 13, sy2 - 52)], fill=RED)               # 朱红半面
    d.line([(sx2, sy2 - 9), (sx2, sy2 - 53)], fill=INK, width=3)
    d.line([(sx2 - 14, sy2 - 31), (sx2 + 14, sy2 - 31)], fill=INK, width=3)
    d.ellipse([sx2 - 7, sy2 - 38, sx2 + 7, sy2 - 24], fill=GOLD, outline=(120, 84, 34), width=2)
    d.line([(sx2 - 18, sy2 - 8), (sx2 - 18, sy2 - 54)], fill=(198, 205, 210), width=2)


def props_pawnshop(d, umin, umax, vb, h):
    """高柜台顶端外挑一道（厚重）+ 檐下小灯 + 门前一级石阶（实体，不是两根浮线）。"""
    slab(d, umin + 0.05, umax - 0.05, vb, 0.26, 30, 40, (126, 58, 48), (74, 36, 30))
    lx, ly = S(umax - 0.10, vb + 0.24, 108)
    lantern(d, lx, ly, 7, 8)
    slab(d, umin + 0.08, umax - 0.08, vb + 0.36, 0.20, 0, 7,
         (156, 148, 134), (100, 92, 82))


PROP = {'tavern': props_tavern, 'weapon': props_weapon,
        'pharmacy': props_pharmacy, 'pawnshop': props_pawnshop}
NAME = {'tavern': '酒楼', 'pharmacy': '药店', 'weapon': '武器铺', 'pawnshop': '当铺'}
NOTE = {'tavern': '两层 · 挑台更深 + 栏杆 + 双挂灯 · 5×4 · 墙高 242',
        'pharmacy': '米白墙 + 朱红梁枋 · 药柜格 + 葫芦幌 · 4×4 · 墙高 156',
        'weapon': '铁灰墙 · 木板兵器墙 + 加粗枪杆 + 立盾 · 6×3 · 墙高 172',
        'pawnshop': '暗红偏墨 · 窄面宽 + 高柜台 + 小栅窗 · 3×4 · 墙高 138'}

RUN_ORDER = ['tavern', 'weapon', 'pharmacy', 'pawnshop']


def run():
    for key in RUN_ORDER:
        cv = build(key)
        sp = SPEC[key]
        bake(cv, 'shop_%s_sw' % key,
             '%s：%d×%d 足迹，墙高/檐口 z=%d，脊 z=%d，匾额留空'
             % (NAME[key], sp['w'], sp['d'], sp['h'], sp['h'] + RISE), key)


def char_img(hgt, path=None):
    im = Image.open(path or os.path.join(ROOT, 'assets_v2', 'sprites', 'xiake', 'idle_0.png'))
    im = im.convert('RGBA')
    k = float(hgt) / im.height
    return im.resize((max(1, int(round(im.width * k))), hgt), Image.LANCZOS)


def load_shop(key):
    p = os.path.join(MOD, 'shop_%s_sw' % key)
    return (Image.open(p + '.png').convert('RGBA'),
            json.load(open(p + '.json', encoding='utf-8')))


def foot(d, ax, ay, w, dd, sc=1.0, fill=(219, 211, 195)):
    pts = [(ax, ay)]
    for vx, vy in ((-32 * w, 16 * w), (-32 * (w + dd), 16 * (w + dd)), (-32 * dd, 16 * dd)):
        pts.append((ax + vx * sc, ay + vy * sc))
    d.polygon(pts, fill=fill)
    d.line(pts + [pts[0]], fill=(172, 164, 148), width=2)


def sheet_near():
    """同机位并排对照，84px 角色参照。"""
    CW, CH, TOP, FOOT = 480, 500, 96, 64
    im = Image.new('RGBA', (CW * 4, TOP + CH + FOOT), (244, 242, 234, 255))
    d = ImageDraw.Draw(im)
    f1 = ImageFont.truetype(r'C:\Windows\Fonts\msyhbd.ttc', 25)
    f2 = ImageFont.truetype(r'C:\Windows\Fonts\msyh.ttc', 13)
    f3 = ImageFont.truetype(r'C:\Windows\Fonts\msyhbd.ttc', 18)
    d.text((28, 18), '店铺四类 · 体量 / 面宽 / 墙色 三项分家（同一机位，84px 角色）', font=f1,
           fill=(30, 27, 24))
    d.text((30, 54), '檐口一律压墙顶，脊 = 檐口 + 40；道具只是加分项，不承担辨识。',
           font=f2, fill=(122, 114, 103))
    d.rectangle([0, TOP + CH, CW * 4, TOP + CH + FOOT], fill=(232, 228, 217))
    d.line([(0, TOP + CH), (CW * 4, TOP + CH)], fill=(188, 181, 167), width=2)
    ch = char_img(84)
    ay = TOP + CH - 46
    for i, key in enumerate(RUN_ORDER):
        x0 = i * CW
        sp = SPEC[key]
        spr, meta = load_shop(key)
        apx = meta['anchor_px']
        # 按「足迹 + 出挑道具」的并集居中：同机位、又不压到隔壁格
        le = max(apx[0], 32 * (sp['w'] + sp['d']))
        re = spr.width - apx[0]
        ax = x0 + int(round((CW - (le + re)) / 2.0 + le))
        d.line([(x0, TOP - 6), (x0, TOP + CH)], fill=(222, 216, 206), width=1)
        foot(d, ax, ay, sp['w'], sp['d'])
        im.alpha_composite(spr, (int(ax - apx[0]), int(ay - apx[1])))
        # 角色站在门脸左前方（四类共用同一 u/v 偏移 → 同一机位，不遮门脸）
        fx = ax - 32 * (sp['w'] + 0.30)
        fy = ay + 16 * (2.70 - sp['w'])
        im.alpha_composite(ch, (int(fx - ch.width / 2), int(fy - ch.height)))
        d.text((x0 + 20, TOP + CH + 8), NAME[key], font=f3, fill=(30, 27, 24))
        d.text((x0 + 20, TOP + CH + 34),
               '%d×%d 足迹 · 墙高 %d · 檐口 %d · 脊 %d'
               % (sp['w'], sp['d'], sp['h'], sp['h'], sp['h'] + RISE),
               font=f2, fill=(128, 120, 108))
        d.text((x0 + 200, TOP + CH + 34), NOTE[key].split(' · ')[0], font=f2,
               fill=(110, 102, 92))
    out = os.path.join(PRE, 'shop_4kinds.png')
    im.convert('RGB').save(out)
    print('->', out, im.size)


def sheet_far():
    """远景辨识度验证：整体缩到 50%，角色 40px。"""
    sc = 0.5
    hs = 40
    gap = 26
    sprites = {k: load_shop(k) for k in RUN_ORDER}
    items = []
    for key in RUN_ORDER:
        sp = SPEC[key]
        spr, meta = sprites[key]
        apx = meta['anchor_px']
        le = max(apx[0] * sc, 32 * (sp['w'] + sp['d']) * sc)
        re = spr.width * sc - apx[0] * sc
        items.append((key, sp, spr, apx, le, re))
    total = int(sum(it[4] + it[5] for it in items) + gap * (len(items) - 1) + 92)
    base = 292
    im = Image.new('RGBA', (total, base + 70), (244, 242, 234, 255))
    d = ImageDraw.Draw(im)
    f1 = ImageFont.truetype(r'C:\Windows\Fonts\msyhbd.ttc', 18)
    f2 = ImageFont.truetype(r'C:\Windows\Fonts\msyh.ttc', 13)
    f3 = ImageFont.truetype(r'C:\Windows\Fonts\msyhbd.ttc', 16)
    d.text((26, 10), '远景辨识度验证（50% 缩放 · 角色 40px）— 远看能否分出四家', font=f1,
           fill=(30, 27, 24))
    d.rectangle([0, base + 2, total, base + 70], fill=(232, 228, 217))
    d.line([(0, base + 2), (total, base + 2)], fill=(188, 181, 167), width=2)
    ch = char_img(hs)
    x = 48
    for key, sp, spr, apx, le, re in items:
        ax = int(round(x + le))
        ay = base
        foot(d, ax, ay, sp['w'], sp['d'], sc, fill=(212, 205, 188))
        spr2 = spr.resize((max(1, int(round(spr.width * sc))),
                           max(1, int(round(spr.height * sc)))), Image.LANCZOS)
        im.alpha_composite(spr2, (int(ax - apx[0] * sc), int(ay - apx[1] * sc)))
        fx = ax - 32 * (sp['w'] + 0.30) * sc
        fy = ay + 16 * (2.70 - sp['w']) * sc
        im.alpha_composite(ch, (int(fx - ch.width / 2), int(fy - ch.height)))
        cx = int(round(ax - (le + re) / 2.0))
        d.text((cx - 22, base + 10), NAME[key], font=f3, fill=(58, 52, 46))
        d.text((cx - 26, base + 36),
               '%d×%d / 墙高 %d' % (sp['w'], sp['d'], sp['h']), font=f2, fill=(140, 133, 122))
        x += le + re + gap
    out = os.path.join(PRE, 'shop_4kinds_far.png')
    im.convert('RGB').save(out)
    print('->', out, im.size)


# ---------------------------------------------------------------- 墙身 / 屋面 / 组装
def wall_side(d, umax, vmin, vmax, h, col, frame=None):
    """u=umax 面（右侧背光脸）：竖板缝 + 檐下横枋 + 侧窗/铁箍。"""
    o = S(umax, vmin, 0)
    vv = ev(vmax - vmin)
    # 侧脸背光：米白墙收光最少（保住"亮一档"），其余按原有力度压暗
    shade = 0.18 if col == CREAM_L else (0.28 if col == BEIGE else 0.30)
    base = mix(col, (18, 16, 14), shade)
    quad(d, o, vv, ez(h), base)
    n = max(4, int(round((vmax - vmin) * 3)))
    for i in range(1, n):
        t = i / n
        q = (o[0] + vv[0] * t, o[1] + vv[1] * t)
        d.line([q, (q[0], q[1] - h)], fill=mix(base, (16, 13, 12), 0.4), width=1)
    d.line([(o[0], o[1] - h + 9), (o[0] + vv[0], o[1] + vv[1] - h + 9)],
           fill=mix(base, (12, 10, 9), 0.45), width=4)
    d.line([(o[0], o[1] - h + 30), (o[0] + vv[0], o[1] + vv[1] - h + 30)],
           fill=mix(base, (12, 10, 9), 0.28), width=2)
    quad(d, o, vv, ez(12), mix(base, (14, 11, 10), 0.55))
    d.line([o, (o[0] + vv[0], o[1] + vv[1])], fill=(16, 13, 12, 255), width=2)
    if col in (CREAM_L, BEIGE):
        # 侧窗（同一墙面上的平行四边形窗）
        w0, w1 = 0.28 * (vmax - vmin), 0.62 * (vmax - vmin)
        zb, zt = h - 92, h - 40
        a = S(umax, vmin + w0, zb)
        b = S(umax, vmin + w1, zb)
        c = S(umax, vmin + w1, zt)
        e = S(umax, vmin + w0, zt)
        d.polygon([a, b, c, e], fill=mix(col, (255, 255, 255), 0.10))
        d.line([a, b, c, e, a], fill=mix(col, (40, 30, 24), 0.55), width=3)
        for i in range(1, 3):
            t = i / 3.0
            p0 = (e[0] + (c[0] - e[0]) * t, e[1] + (c[1] - e[1]) * t)
            p1 = (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
            d.line([p0, p1], fill=mix(col, (60, 44, 34), 0.6), width=2)
    elif col == IRON:
        for zz in (h - 78, h - 34):
            d.line([(o[0], o[1] - zz), (o[0] + vv[0], o[1] + vv[1] - zz)],
                   fill=(58, 56, 52), width=4)
        d.line([(o[0] + vv[0] * 0.5, o[1] + vv[1] * 0.5 - h + 12),
                (o[0] + vv[0] * 0.5, o[1] + vv[1] * 0.5 - 12)], fill=(58, 56, 52), width=3)
    if frame:
        # 侧脸补同族梁柱：让侧墙和正脸是一套（不是一块裸色板）
        fr = mix(frame, (20, 16, 14), 0.30)
        fr_l = mix(frame, (255, 255, 255), 0.05)
        span = vmax - vmin
        for a0 in (vmin, vmax - 0.16 * span):
            quad(d, S(umax, a0, 0), ev(0.16 * span), ez(h), fr)
            d.line([S(umax, a0, 0), S(umax, a0, h)], fill=fr_l, width=2)
        quad(d, S(umax, vmin, h - 20), vv, ez(20), fr)           # 上额枋
        quad(d, S(umax, vmin, h - 20), vv, ez(3), fr_l)
        quad(d, S(umax, vmin, 0), vv, ez(15), mix(fr, (16, 13, 12), 0.35))  # 墙裙
        d.line([S(umax, vmin, 0), S(umax, vmax, 0)], fill=(16, 13, 12), width=2)


def wall_front(d, umin, umax, vmax, h, col):
    """v=vmax 面（左侧受光脸，门脸贴在这面）。"""
    o = S(umin, vmax, 0)
    uu = eu(umax - umin)
    quad(d, o, uu, ez(h), col)
    quad(d, o, uu, ez(11), mix(col, (18, 14, 12), 0.5))
    d.line([o, (o[0] + uu[0], o[1] + uu[1])], fill=(18, 14, 12, 255), width=2)


def face_to_screen(cv, flat, u0, v, h):
    """把平面门脸（w*32 × h）按 2:1 剪切贴到 v=vmax 墙面。"""
    bx, by = S(u0, v, 0)
    coeffs = (1, 0, -bx, -0.5, 1, h - by + bx / 2.0)
    cv.alpha_composite(flat.transform(cv.size, Image.AFFINE, coeffs, Image.BICUBIC))


def eave_shadow(d, umin, umax, vmax, h, peak=86):
    for i in range(13):
        z = h - i
        a = int(peak * (1 - i / 12.0) ** 1.3)
        d.line([S(umin, vmax, z), S(umax, vmax, z)], fill=(8, 14, 20, a), width=2)


def roof(d, umin, umax, vmin, vmax, eave, wall_col, gcol=None, gin=None):
    vm = (vmin + vmax) / 2.0
    rz = eave + RISE
    n = (vmax - vm) + OVER
    uvec = eu(umax - umin + 2 * OVER)
    # 墙顶压盖（防止檐口下露出亮色缝）
    quad(d, S(umin - 0.05, vmin - 0.05, eave), eu(umax - umin + 0.1),
         ev(vmax - vmin + 0.1), (46, 40, 34, 255))
    gc = gcol or wall_col
    # 1 远端山墙先画，被坡面压住：只露一小片端头
    gable(d, umin - OVER, vmin, vmax, eave, rz, mix(gc, (18, 15, 13), 0.30), False, gin)
    # 2 背坡（靛青、独立渐变、朝向远离视点）
    roof_slope(d, S(umin - OVER, vm, rz), uvec, droop(-n, RISE), False)
    # 3 受光坡（朝 +v，压住墙顶并外挑）
    roof_slope(d, S(umin - OVER, vm, rz), uvec, droop(n, RISE), True)
    # 4 近端山墙：必须在坡面之后画，否则被两坡完全盖住 → 屋面读成"缺一块"
    gable(d, umax + OVER, vmin, vmax, eave, rz, gc, True, gin)
    # 5 正脊：一条，压在两坡交线 v=vm 上
    ridge(d, (umin - OVER - 0.12, vm), (umax + OVER + 0.12, vm), rz + 2)


def build(key):
    sp = SPEC[key]
    w, dd, h = sp['w'], sp['d'], sp['h']
    umin, umax = U0, U0 + w
    vmin, vmax = V0, V0 + dd
    col = WALLC[key]
    side_col = SIDEC[key]
    cv = Image.new('RGBA', (HB.CW, HB.CH), (0, 0, 0, 0))
    d = ImageDraw.Draw(cv)
    wall_side(d, umax, vmin, vmax, h, col, SIDEF[key])
    wall_front(d, umin, umax, vmax, h, col)
    face_to_screen(cv, FACE[key](int(round(w * 32)), h), umin, vmax, h)
    eave_shadow(d, umin, umax, vmax, h)
    roof(d, umin, umax, vmin, vmax, h, side_col, GCOL[key], GINS[key])
    PROP[key](d, umin, umax, vmax, h)
    return POST.add_outline(cv, px=2.2, erode=1.2)


def bake(cv, name, note, key):
    sp = SPEC[key]
    bb = cv.getbbox()
    x0, y0 = max(0, bb[0] - 2), max(0, bb[1] - 2)
    x1, y1 = min(cv.width, bb[2] + 2), min(cv.height, bb[3] + 2)
    cut = cv.crop((x0, y0, x1, y1))
    ax, ay = S(U0 + sp['w'], V0 + sp['d'], 0)
    apx = [int(round(ax - x0)), int(round(ay - y0))]
    cut.save(os.path.join(MOD, name + '.png'))
    bbx = cut.getbbox()
    meta = {
        'name': name, 'facing': 'SW',
        'footprint': [sp['w'], sp['d']],
        'footprint_label': '%dx%d' % (sp['w'], sp['d']),
        'footprint_w': sp['w'], 'footprint_h': sp['d'],
        'footprint_note': '本类为该行业专属足迹：宽 %d 格 × 深 %d 格（与其它三类不同，用于远看分家）'
                          % (sp['w'], sp['d']),
        'elevation': {'wall_h': sp['h'], 'eave_z': sp['h'],
                      'ridge_z': sp['h'] + RISE, 'rise': RISE,
                      'overhang_px': round(OVER * 28.6, 1)},
        'height_px': sp['h'] + RISE,
        'anchor': [0.5, 1.0], 'anchor_cell': [sp['w'], sp['d']], 'anchor_px': apx,
        'anchor_note': '足迹前底顶点 p(umax,vmax)；檐口 z=wall_h，落地即对齐',
        'tile': [64, 32], 'tileable': False,
        'sprite_size': [cut.width, cut.height],
        'sprite_h_px': int(bbx[3] - bbx[1]),
        'ratio_to_char': round((bbx[3] - bbx[1]) / 84.0, 2),
        'parts': ['wall_front(v=vmax)', 'wall_side(u=umax)',
                  'roof_far_gable(u=umin)', 'roof_back_slope', 'roof_near_gable(u=umax)',
                  'roof_lit_slope', 'roof_ridge'],
        'stack_order': ['side_wall', 'front_wall', 'facade', 'eave_shadow',
                        'far_gable', 'back_slope', 'near_gable', 'lit_slope', 'ridge', 'props'],
        'source': note, 'outline_px': 2.2,
        'mirror_rule': 'se/nw 水平镜像（锚点不动）；ne 换背光墙色',
        'shop': key,
    }
    with open(os.path.join(MOD, name + '.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
    print('%-24s %3dx%-3d h=%3d fp=%dx%d anchor=%s'
          % (name, cut.width, cut.height, meta['sprite_h_px'],
             sp['w'], sp['d'], apx))
    return cut


if __name__ == '__main__':
    run()
    sheet_near()
    sheet_far()


