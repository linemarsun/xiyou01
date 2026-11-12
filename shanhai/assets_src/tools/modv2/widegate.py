# -*- coding: utf-8 -*-
"""宽城门楼：与主街同宽（10 格），券洞贯通 ~7.2 格，正脊 406 高于城墙垛口 224。

两个朝向：
    city_gate_wide    u 向（沿 gx 铺开），足迹 10×3，券洞开在 v1 立面 —— 北门。
    city_gate_wide_v  v 向（沿 gy 铺开），足迹 3×10，券洞开在 u1 立面 —— 西/东门。

复用 citybuild.py 的全部原语（iso_box / brick / arch_open / plaque / skirting / merlons /
roof_slope / ridge / add_outline / bake），拱洞内壁用新版 arch_open（砖砌内壁 + 远口
透光 + 地面光池，不再是黑洞）。城台顶 238 / 楼正脊 406，高于城墙垛口 224。
"""
import math
from paths import ROOT, MODULES, PREVIEW, GEN, CHAR, ISO_OUT, HERE, FONT_DIR, ensure
import os

import citybuild as cb
from citybuild import Image, ImageDraw, poly, mix

# 输出直接落到本仓库（覆盖 citybuild.ROOT 指向的旧工作区）
OUT = ISO_OUT
cb.MOD = OUT
# 大画幅 + 原点平移：10 格宽足迹 + 406 正脊，原 560×580 画布放不下
# 注意：gable/roof_slope/ridge 用 shopbuild 自己的 OX/OY，必须同步修改，否则屋脊端头会飞出
cb.CW, cb.CH = 1100, 880
cb.OX, cb.OY = 550, 560
cb.SB.OX, cb.SB.OY = 550, 560

GW, GD = 10, 3          # u 向宽城门足迹：与南北主街同宽
ARCH_HALF = 3.6         # 券洞半宽（格）：净宽 7.2 格
SPRING = 92             # 券脚标高
BAYS = 14               # 楼身开间数（跨 9.4 格，保持柱距与 4×3 楼相近）
OV = 0.16               # 檀口出挑


def _frame(u0, u1, v0, v1, front_axis):
    """城台 + 条石基座 + 压顶石带 + 台面（两朝向通用，front_axis='v'|'u'）。"""
    d = None  # 占位，见 build 函数
    raise RuntimeError('internal')


def _podium(d, bu0, bu1, v0, v1, front_axis):
    B = cb.BL
    # 1 条石基座（与城台齐平，券门贯通到地面）
    cb.iso_box(d, bu0, bu1, v0, v1, 0, 30, cb.STONE, cb.STONE_S, cb.STONE_T)
    cb.brick_v(d, bu0, bu1, v1, 0, 30, cb.STONE, ch=11.0, cw=0.92, seed=5)
    cb.brick_u(d, bu1, v0, v1, 0, 30, cb.STONE_S, ch=11.0, cw=0.92, seed=5)
    # 2 城台（墩台）
    cb.iso_box(d, bu0, bu1, v0, v1, 30, cb.GP_TOP, cb.GATE_C, cb.GATE_S, cb.GATE_T)
    cb.brick_v(d, bu0, bu1, v1, 36, cb.GP_TOP - 12, cb.GATE_C, ch=10.0, cw=0.54)
    cb.brick_u(d, bu1, v0, v1, 36, cb.GP_TOP - 12, cb.GATE_S, ch=10.0, cw=0.54, seed=1)
    # 3 压顶石带 + 台面
    cb.quad(d, cb.S(bu0, v1, cb.GP_TOP - 9), cb.eu(bu1 - bu0), cb.ez(9), cb.STONE_T)
    cb.quad(d, cb.S(bu1, v0, cb.GP_TOP - 9), cb.ev(v1 - v0), cb.ez(9), cb.mix(cb.STONE_T, cb.DARK, 0.18))
    d.line([cb.S(bu0, v1, cb.GP_TOP), cb.S(bu1, v1, cb.GP_TOP)], fill=cb.mix(cb.STONE, cb.DARK, 0.55), width=2)
    cb.quad(d, cb.S(bu0 + 0.24, v0 + 0.24, cb.GP_TOP), cb.eu(bu1 - bu0 - 0.48), cb.ev(v1 - v0 - 0.48),
            cb.mix(cb.GATE_T, cb.CREAM, 0.18))


def _merlons_top(d, u0, u1, v0, v1):
    """台面女墙：先右后前（两朝向通用）。"""
    cb.merlons(d, 'v', v0 + 0.34, v1 - 0.34, u1 - cb.THICK, u1, cb.GP_TOP, 18, wh=0.72)
    cb.merlons(d, 'u', u0 + 0.34, u1 - 0.34, v1 - cb.THICK, v1, cb.GP_TOP, 18, wh=0.72)


# ---------------------------------------------------------------- u 向（北门）

def build_wide_gate_u():
    cv = Image.new('RGBA', (cb.CW, cb.CH), (0, 0, 0, 0))
    d = ImageDraw.Draw(cv)
    u0, u1, v0, v1 = cb.U0, cb.U0 + GW, cb.V0, cb.V0 + GD
    uc = (u0 + u1) / 2.0
    B = cb.BL
    bu0, bu1 = u0 - B, u1 + B
    _podium(d, bu0, bu1, v0, v1, 'v')
    # 4 宽券洞（贯通城台，落到地面；新版亮色隧洞）
    cb.arch_open(d, uc, v1, ARCH_HALF, SPRING, 0, depth=GD, axis='v')
    # 5 匾额（券顶上方居中）
    cb.plaque_iso(d, uc, v1, 1.6, 220, 234)
    _tower_u(d, u0, u1, v0, v1)
    _merlons_top(d, u0, u1, v0, v1)
    return cb.POST.add_outline(cv, px=2.4, erode=1.2)


def _tower_u(d, u0, u1, v0, v1):
    """城楼（两层 + 腰檐 + 两坡顶），券洞开在 v1 立面时适用。"""
    ov = OV
    lu0, lu1, lv0, lv1 = u0 + 0.30, u1 - 0.30, v0 + 0.55, v1 - 0.65
    ltop = cb.G1_EAVE - 14
    cb.iso_box(d, lu0, lu1, lv0, lv1, cb.GP_TOP, ltop, cb.CREAM, cb.mix(cb.CREAM, cb.DARK, 0.22),
               cb.mix(cb.CREAM, cb.CREAM_L, 0.5))
    # 前脸（v1）：朱红立柱 + 直棂窗
    for i in range(BAYS + 1):
        uu = lu0 + (lu1 - lu0) * i / BAYS
        w0 = 0.09
        cb.poly(d, [cb.S(uu - w0, lv1, cb.GP_TOP), cb.S(uu + w0, lv1, cb.GP_TOP),
                    cb.S(uu + w0, lv1, ltop), cb.S(uu - w0, lv1, ltop)], cb.RED)
        d.line([cb.S(uu + w0, lv1, cb.GP_TOP), cb.S(uu + w0, lv1, ltop)], fill=cb.RED_D, width=2)
        d.line([cb.S(uu - w0, lv1, cb.GP_TOP), cb.S(uu - w0, lv1, ltop)], fill=cb.RED_L, width=1)
    for i in range(BAYS):
        a = lu0 + (lu1 - lu0) * (i + 0.14) / BAYS
        b = lu0 + (lu1 - lu0) * (i + 0.86) / BAYS
        z0_, z1_ = cb.GP_TOP + 20, ltop - 26
        cb.poly(d, [cb.S(a, lv1, z0_), cb.S(b, lv1, z0_), cb.S(b, lv1, z1_), cb.S(a, lv1, z1_)],
                (247, 240, 221))
        d.line([cb.S(a, lv1, z0_), cb.S(b, lv1, z0_), cb.S(b, lv1, z1_), cb.S(a, lv1, z1_),
                cb.S(a, lv1, z0_)], fill=cb.WOOD, width=2)
        for k in range(1, 5):
            uu = a + (b - a) * k / 5.0
            d.line([cb.S(uu, lv1, z0_), cb.S(uu, lv1, z1_)], fill=cb.mix(cb.WOOD, cb.CREAM, 0.25), width=1)
    # 侧脸（u1，背光）：立柱压暗
    for i in range(BAYS + 1):
        vv_ = lv0 + (lv1 - lv0) * i / BAYS
        cb.poly(d, [cb.S(lu1, vv_ - 0.09, cb.GP_TOP), cb.S(lu1, vv_ + 0.09, cb.GP_TOP),
                    cb.S(lu1, vv_ + 0.09, ltop), cb.S(lu1, vv_ - 0.09, ltop)],
                cb.mix(cb.RED, cb.DARK, 0.26))
    # 7 额枋 + 斗拱（下层）
    cb.poly(d, [cb.S(lu0, lv1, ltop), cb.S(lu1, lv1, ltop),
                cb.S(lu1, lv1, cb.G1_EAVE - 5), cb.S(lu0, lv1, cb.G1_EAVE - 5)], cb.RED)
    d.line([cb.S(lu0, lv1, ltop), cb.S(lu1, lv1, ltop)], fill=cb.GOLD, width=1)
    cb.bracket_row(d, lu0 + 0.02, lu1 - 0.02, lv1, cb.G1_EAVE - 5, 14)
    # 8 下檐腰檐（重檐第一层）
    uu0, uu1, uv0, uv1 = u0 + 0.72, u1 - 0.72, v0 + 0.92, v1 - 0.92
    cb.skirting(d, cb.S(lu0 - ov, lv1 + ov, cb.G1_EAVE), cb.S(lu1 + ov, lv1 + ov, cb.G1_EAVE),
                cb.S(uu0 - 0.02, uv1, cb.G1_TOP), cb.S(uu1 + 0.02, uv1, cb.G1_TOP),
                cb.SB.ROOF_C[3], cb.SB.ROOF_C[1])
    cb.skirting(d, cb.S(lu1 + ov, lv0 - ov, cb.G1_EAVE), cb.S(lu1 + ov, lv1 + ov, cb.G1_EAVE),
                cb.S(uu1, uv0 - 0.02, cb.G1_TOP), cb.S(uu1, uv1 + 0.02, cb.G1_TOP),
                cb.SB.BACK_C[1], cb.SB.BACK_C[0])
    # 9 城楼上层
    cb.iso_box(d, uu0, uu1, uv0, uv1, cb.G1_TOP, cb.G2_EAVE - 12, cb.CREAM,
               cb.mix(cb.CREAM, cb.DARK, 0.24), cb.mix(cb.CREAM, cb.CREAM_L, 0.5))
    for i in range(BAYS + 1):
        uu = uu0 + (uu1 - uu0) * i / BAYS
        w0 = 0.09
        cb.poly(d, [cb.S(uu - w0, uv1, cb.G1_TOP), cb.S(uu + w0, uv1, cb.G1_TOP),
                    cb.S(uu + w0, uv1, cb.G2_EAVE - 12), cb.S(uu - w0, uv1, cb.G2_EAVE - 12)], cb.RED)
        d.line([cb.S(uu + w0, uv1, cb.G1_TOP), cb.S(uu + w0, uv1, cb.G2_EAVE - 12)],
               fill=cb.RED_D, width=2)
    for i in range(BAYS):
        a = uu0 + (uu1 - uu0) * (i + 0.14) / BAYS
        b = uu0 + (uu1 - uu0) * (i + 0.86) / BAYS
        z0_, z1_ = cb.G1_TOP + 18, cb.G2_EAVE - 34
        cb.poly(d, [cb.S(a, uv1, z0_), cb.S(b, uv1, z0_), cb.S(b, uv1, z1_), cb.S(a, uv1, z1_)],
                (247, 240, 221))
        for k in range(1, 4):
            uu = a + (b - a) * k / 4.0
            d.line([cb.S(uu, uv1, z0_), cb.S(uu, uv1, z1_)],
                   fill=cb.mix(cb.WOOD, cb.CREAM, 0.25), width=1)
    # 10 上檐 + 两坡顶 + 正脊（正脊沿 u）
    def droop(n, rise):
        return (32.0 * n, 16.0 * n + rise)

    rv = (uv0 + uv1) / 2.0
    nf = (uv1 + ov) - rv
    nb = rv - (uv0 - ov)
    o = cb.S(uu0 - ov, rv, cb.G2_RIDGE)
    uvec = cb.eu(uu1 - uu0 + 2 * ov)
    cb.SB.roof_slope(d, o, uvec, droop(-nb, cb.G2_RISE), False)
    cb.SB.gable(d, uu1 + ov, uv0 - ov, uv1 + ov, cb.G2_EAVE, cb.G2_RIDGE, cb.CREAM, True)
    cb.SB.gable(d, uu0 - ov, uv0 - ov, uv1 + ov, cb.G2_EAVE, cb.G2_RIDGE, cb.CREAM, False)
    cb.SB.roof_slope(d, o, uvec, droop(nf, cb.G2_RISE), True)
    cb.SB.ridge(d, (uu0 - ov - 0.12, rv), (uu1 + ov + 0.12, rv), cb.G2_RIDGE + 2)


# ---------------------------------------------------------------- v 向（西/东门）

def _gable_v(d, vv, u0, u1, eave, top, color, front, inset=None):
    """端面山墙（v 向版）：与 shopbuild.gable 同一套画法，u/v 互换。"""
    def q(u, z):
        return (cb.OX + (u - vv) * 32.0, cb.OY + (u + vv) * 16.0 - z)
    a = q(u0, eave)
    b = q(u1, eave)
    c = q((u0 + u1) / 2.0, top)
    d.polygon([a, b, c], fill=color)
    NB = 6
    for k in range(NB):
        t0, t1 = k / float(NB), (k + 1) / float(NB)
        dxa, dya = c[0] - a[0], c[1] - a[1]
        dxb, dyb = c[0] - b[0], c[1] - b[1]
        p0 = (a[0] + dxa * t0, a[1] + dya * t0)
        p1 = (b[0] + dxb * t0, b[1] + dyb * t0)
        p2 = (b[0] + dxb * t1, b[1] + dyb * t1)
        p3 = (a[0] + dxa * t1, a[1] + dya * t1)
        d.polygon([p0, p1, p2, p3], fill=mix(color, (18, 15, 13), 0.14 - 0.11 * t0))

    def ins(p, k):
        return (p[0] + (c[0] - p[0]) * k, p[1] + (c[1] - p[1]) * k)
    if inset:
        d.polygon([ins(a, 0.13), ins(b, 0.13), ins(c, 0.20)], fill=inset)
    d.polygon([a, b, (b[0], b[1] + 7), (a[0], a[1] + 7)], fill=mix(color, (18, 15, 13), 0.42))
    d.polygon([a, b, (b[0], b[1] + 2.4), (a[0], a[1] + 2.4)], fill=mix(color, (255, 255, 255), 0.10))
    for P0 in (a, b):
        dx, dy = c[0] - P0[0], c[1] - P0[1]
        ln = math.hypot(dx, dy) or 1.0
        nx, ny = -dy / ln, dx / ln
        mid = ((P0[0] + c[0]) / 2.0, (P0[1] + c[1]) / 2.0)
        if (nx * (a[0] + b[0] - 2 * mid[0]) + ny * (a[1] + b[1] - 2 * mid[1])) > 0:
            nx, ny = -nx, -ny
        w = 4.5
        d.polygon([P0, c, (c[0] + nx * w, c[1] + ny * w),
                   (P0[0] + nx * w, P0[1] + ny * w)], fill=(58, 46, 40))
        d.line([(P0[0] + nx * w, P0[1] + ny * w), (c[0] + nx * w, c[1] + ny * w)],
               fill=cb.GOLD, width=1)
    d.polygon([(c[0], c[1] + 5), (c[0] + 5, c[1] + 11), (c[0], c[1] + 18),
               (c[0] - 5, c[1] + 11)], fill=cb.GOLD)


def _plaque_u(d, vc, uf, halfw, z0, z1, dark=(40, 30, 24)):
    """立面素匾（u1 面版）。"""
    poly(d, [cb.S(uf, vc - halfw, z0), cb.S(uf, vc + halfw, z0),
             cb.S(uf, vc + halfw, z1), cb.S(uf, vc - halfw, z1)], dark)
    pts = [cb.S(uf, vc - halfw, z0), cb.S(uf, vc + halfw, z0),
           cb.S(uf, vc + halfw, z1), cb.S(uf, vc - halfw, z1), cb.S(uf, vc - halfw, z0)]
    d.line(pts, fill=cb.GOLD, width=3)
    d.line([cb.S(uf, vc - halfw + 0.04, z1 - 3), cb.S(uf, vc + halfw - 0.04, z1 - 3)],
           fill=cb.GOLD_L, width=1)


def _bracket_row_v(d, va, vb, uf, z0, h, n=None):
    """檐下斗拱（u1 面版）。"""
    n = n or max(4, int(round((vb - va) / 0.24)))
    span = (vb - va)
    for i in range(n):
        a = va + span * i / n + 0.02
        b = va + span * (i + 1) / n - 0.02
        col = cb.GOLD_L if i % 2 == 0 else cb.CREAM_L
        poly(d, [cb.S(uf, a, z0), cb.S(uf, b, z0), cb.S(uf, b, z0 + h), cb.S(uf, a, z0 + h)], col)


def build_wide_gate_v():
    """v 向宽城门（西/东门）：足迹 3×10，券洞开在 u1 立面，正脊沿 v。"""
    cv = Image.new('RGBA', (cb.CW, cb.CH), (0, 0, 0, 0))
    d = ImageDraw.Draw(cv)
    u0, u1, v0, v1 = cb.U0, cb.U0 + GD, cb.V0, cb.V0 + GW
    vc = (v0 + v1) / 2.0
    B = cb.BL
    bu0, bu1 = u0 - B, u1 + B
    _podium(d, bu0, bu1, v0, v1, 'u')
    # 宽券洞（开在 u1 立面，向 -u 退 3 格）
    cb.arch_open(d, vc, u1, ARCH_HALF, SPRING, 0, depth=GD, axis='u')
    _plaque_u(d, vc, u1, 1.6, 220, 234)
    _tower_v(d, u0, u1, v0, v1)
    _merlons_top(d, u0, u1, v0, v1)
    return cb.POST.add_outline(cv, px=2.4, erode=1.2)


def _tower_v(d, u0, u1, v0, v1):
    """城楼（券洞开在 u1 立面）：楼身沿 v 铺开，正脊沿 v。"""
    ov = OV
    # 楼身：进深方向（u）收得多，长度方向（v）收得少
    lu0, lu1, lv0, lv1 = u0 + 0.55, u1 - 0.65, v0 + 0.30, v1 - 0.30
    ltop = cb.G1_EAVE - 14
    cb.iso_box(d, lu0, lu1, lv0, lv1, cb.GP_TOP, ltop, cb.CREAM, cb.mix(cb.CREAM, cb.DARK, 0.22),
               cb.mix(cb.CREAM, cb.CREAM_L, 0.5))
    # 前脸（u1）：朱红立柱 + 直棂窗
    for i in range(BAYS + 1):
        vv = lv0 + (lv1 - lv0) * i / BAYS
        w0 = 0.09
        cb.poly(d, [cb.S(lu1, vv - w0, cb.GP_TOP), cb.S(lu1, vv + w0, cb.GP_TOP),
                    cb.S(lu1, vv + w0, ltop), cb.S(lu1, vv - w0, ltop)],
                cb.mix(cb.RED, cb.DARK, 0.10))
        d.line([cb.S(lu1, vv + w0, cb.GP_TOP), cb.S(lu1, vv + w0, ltop)],
               fill=cb.RED_D, width=2)
        d.line([cb.S(lu1, vv - w0, cb.GP_TOP), cb.S(lu1, vv - w0, ltop)],
               fill=cb.RED_L, width=1)
    for i in range(BAYS):
        a = lv0 + (lv1 - lv0) * (i + 0.14) / BAYS
        b = lv0 + (lv1 - lv0) * (i + 0.86) / BAYS
        z0_, z1_ = cb.GP_TOP + 20, ltop - 26
        cb.poly(d, [cb.S(lu1, a, z0_), cb.S(lu1, b, z0_), cb.S(lu1, b, z1_), cb.S(lu1, a, z1_)],
                (247, 240, 221))
        d.line([cb.S(lu1, a, z0_), cb.S(lu1, b, z0_), cb.S(lu1, b, z1_), cb.S(lu1, a, z1_),
                cb.S(lu1, a, z0_)], fill=cb.WOOD, width=2)
        for k in range(1, 5):
            vv = a + (b - a) * k / 5.0
            d.line([cb.S(lu1, vv, z0_), cb.S(lu1, vv, z1_)],
                   fill=cb.mix(cb.WOOD, cb.CREAM, 0.25), width=1)
    # 侧脸（v1 端面，背光）
    for i in range(BAYS + 1):
        uu_ = lu0 + (lu1 - lu0) * i / BAYS
        cb.poly(d, [cb.S(uu_ - 0.09, lv1, cb.GP_TOP), cb.S(uu_ + 0.09, lv1, cb.GP_TOP),
                    cb.S(uu_ + 0.09, lv1, ltop), cb.S(uu_ - 0.09, lv1, ltop)],
                cb.mix(cb.RED, cb.DARK, 0.26))
    # 7 额枋 + 斗拱（下层，前脸 u1）
    cb.poly(d, [cb.S(lu1, lv0, ltop), cb.S(lu1, lv1, ltop),
                cb.S(lu1, lv1, cb.G1_EAVE - 5), cb.S(lu1, lv0, cb.G1_EAVE - 5)],
            cb.mix(cb.RED, cb.DARK, 0.10))
    d.line([cb.S(lu1, lv0, ltop), cb.S(lu1, lv1, ltop)], fill=cb.GOLD, width=1)
    _bracket_row_v(d, lv0 + 0.02, lv1 - 0.02, lu1, cb.G1_EAVE - 5, 14)
    # 8 下檐腰檐：前脸坡（u1 侧）+ 端面坡（v1 侧）
    du0, du1, dv0, dv1 = u0 + 0.92, u1 - 0.72, v0 + 0.72, v1 - 0.72
    cb.skirting(d, cb.S(lu1 + ov, lv0 - ov, cb.G1_EAVE), cb.S(lu1 + ov, lv1 + ov, cb.G1_EAVE),
                cb.S(du1, dv0 - 0.02, cb.G1_TOP), cb.S(du1, dv1 + 0.02, cb.G1_TOP),
                cb.SB.ROOF_C[3], cb.SB.ROOF_C[1])
    cb.skirting(d, cb.S(lu0 - ov, lv1 + ov, cb.G1_EAVE), cb.S(lu1 + ov, lv1 + ov, cb.G1_EAVE),
                cb.S(du0 - 0.02, dv1, cb.G1_TOP), cb.S(du1 + 0.02, dv1, cb.G1_TOP),
                cb.SB.BACK_C[1], cb.SB.BACK_C[0])
    # 9 城楼上层
    cb.iso_box(d, du0, du1, dv0, dv1, cb.G1_TOP, cb.G2_EAVE - 12, cb.CREAM,
               cb.mix(cb.CREAM, cb.DARK, 0.24), cb.mix(cb.CREAM, cb.CREAM_L, 0.5))
    for i in range(BAYS + 1):
        vv = dv0 + (dv1 - dv0) * i / BAYS
        w0 = 0.09
        cb.poly(d, [cb.S(du1, vv - w0, cb.G1_TOP), cb.S(du1, vv + w0, cb.G1_TOP),
                    cb.S(du1, vv + w0, cb.G2_EAVE - 12), cb.S(du1, vv - w0, cb.G2_EAVE - 12)],
                cb.mix(cb.RED, cb.DARK, 0.10))
        d.line([cb.S(du1, vv + w0, cb.G1_TOP), cb.S(du1, vv + w0, cb.G2_EAVE - 12)],
               fill=cb.RED_D, width=2)
    for i in range(BAYS):
        a = dv0 + (dv1 - dv0) * (i + 0.14) / BAYS
        b = dv0 + (dv1 - dv0) * (i + 0.86) / BAYS
        z0_, z1_ = cb.G1_TOP + 18, cb.G2_EAVE - 34
        cb.poly(d, [cb.S(du1, a, z0_), cb.S(du1, b, z0_), cb.S(du1, b, z1_), cb.S(du1, a, z1_)],
                (247, 240, 221))
        for k in range(1, 4):
            vv = a + (b - a) * k / 4.0
            d.line([cb.S(du1, vv, z0_), cb.S(du1, vv, z1_)],
                   fill=cb.mix(cb.WOOD, cb.CREAM, 0.25), width=1)
    # 10 上檐 + 两坡顶 + 正脊（正脊沿 v；u 向坡由镜像 droop 完成）
    def droop_v(n, rise):
        return (-32.0 * n, 16.0 * n + rise)

    ru = (du0 + du1) / 2.0
    nf = (du1 + ov) - ru          # 前坡（u1 侧，受光）
    nb = ru - (du0 - ov)          # 后坡（u0 侧，背光）
    o = cb.S(ru, dv0 - ov, cb.G2_RIDGE)
    vvec = cb.ev(dv1 - dv0 + 2 * ov)
    cb.SB.roof_slope(d, o, vvec, droop_v(-nb, cb.G2_RISE), False)
    _gable_v(d, dv1 + ov, du0 - ov, du1 + ov, cb.G2_EAVE, cb.G2_RIDGE, cb.CREAM, True)
    _gable_v(d, dv0 - ov, du0 - ov, du1 + ov, cb.G2_EAVE, cb.G2_RIDGE, cb.CREAM, False)
    cb.SB.roof_slope(d, o, vvec, droop_v(nf, cb.G2_RISE), True)
    cb.SB.ridge(d, (ru, dv0 - ov - 0.12), (ru, dv1 + ov + 0.12), cb.G2_RIDGE + 2)


# ---------------------------------------------------------------- 烘焙

NOTE_COMMON = ('条石基座 0-30 + 城台 30-238 + 宽券洞（贯通，半宽 3.6 格、券脚 z=92、券顶 z≈211，'
               '砖砌内壁 + 远口透光 + 地面光池）+ 匾额 + 城楼下层 238-300（腰檐）+ 上层 332-366 '
               '+ 两坡顶 366-406 + 台面女墙；正脊 406 高于城墙垛口 224')

if __name__ == '__main__':
    cb.bake(
        build_wide_gate_u(), 'city_gate_wide',
        '宽城门楼（u 向 · 北门）10×3：' + NOTE_COMMON + '；足迹与南北主街同宽',
        [GW, GD],
        {'tileable': False,
         'arch': {'half_width_cells': ARCH_HALF, 'spring_z': SPRING, 'top_z': SPRING + ARCH_HALF * 33,
                  'passable': True, 'clear_width_px': int(ARCH_HALF * 2 * 32), 'clear_height_px': SPRING},
         'elevation': {'podium_top_z': cb.GP_TOP, 'eave_z': cb.G1_EAVE, 'ridge_z': cb.G2_RIDGE},
         'note': '与 city_gate_tower 同一标高体系；跨度 10 格对齐主街 x59..68'},
        clip_x=(cb.OX + (cb.U0 - (cb.V0 + GD)) * 32.0, cb.OX + (cb.U0 + GW - cb.V0) * 32.0))
    cb.bake(
        build_wide_gate_v(), 'city_gate_wide_v',
        '宽城门楼（v 向 · 西/东门）3×10：' + NOTE_COMMON + '；券洞开在 u1 立面，足迹与东西主街同宽',
        [GD, GW],
        {'tileable': False,
         'arch': {'half_width_cells': ARCH_HALF, 'spring_z': SPRING, 'top_z': SPRING + ARCH_HALF * 33,
                  'passable': True, 'clear_width_px': int(ARCH_HALF * 2 * 32), 'clear_height_px': SPRING,
                  'axis': 'u'},
         'elevation': {'podium_top_z': cb.GP_TOP, 'eave_z': cb.G1_EAVE, 'ridge_z': cb.G2_RIDGE},
         'note': '镜像朝向件：券洞朝 SE（u1 面），西/东门共用（相机只见 SE 面）'},
        clip_x=(cb.OX + (cb.U0 - (cb.V0 + GW)) * 32.0, cb.OX + (cb.U0 + GD - cb.V0) * 32.0))
