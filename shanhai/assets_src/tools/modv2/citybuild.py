# -*- coding: utf-8 -*-
"""城市结构件 · 第一批：城墙直段（u/v 两向 + 2 格补段）+ 城墙转角角台 + 城门楼。

标高体系（z 单位 = 屏幕像素，与既有 4×4 屋身同一套）：
    民居 wall_h=170 / eave=170 / ridge=210
    城墙 墙身顶(马道) z=200，垛口顶 z=224
    角台 台体顶 z=200（与直段共线），女墙顶 z=232（比垛口高 8，四角加强，四面女墙→朝向无关）
    城门楼 城台顶 z=238（台面女墙 256）/ 下层檐 300 / 上层檐 366 / 上层脊 406
足迹：直段 6×2 与 2×2（v 向为 2×6 / 2×2），角台 2×2，城门楼 4×3（跨墙 2 格 + 内伸 1 格）
锚点：一律 = 足迹前底顶点 p(umax, vmax)，与 4×4 屋身同一约定
"""
import json
import math
import os

from PIL import Image, ImageDraw, ImageFilter, ImageFont

import post as POST
import shopbuild as SB

ROOT = r'D:\workspace\dahuayou_web'
MOD = os.path.join(ROOT, 'assets_v2', 'modules')
PRE = os.path.join(ROOT, 'assets_v2', 'preview')
CHAR = os.path.join(ROOT, 'assets_v2', 'sprites', 'xiake', 'idle_0.png')

CW, CH = 560, 580
OX, OY = 280, 350
U0, V0 = 2.0, 2.0

# ---------------------------------------------------------------- 标高
BASE = 34              # 条石基座
WALL_TOP = 200         # 墙身顶 = 马道面（比民居檐口 170 高 30，低于脊 210）
MER = 24               # 垛口高
PARA_H = WALL_TOP + MER          # 224
COR_TOP = WALL_TOP     # 角台台体顶与直段共线（压顶石带不错缝）
COR_PARA = COR_TOP + 32          # 232：女墙比直段垛口高 8，强化转角
THICK = 0.40           # 垛口/女墙厚（格）
BL = 0.12              # 长度方向出血（格，≈3.8px）：描边/内缩吃掉后，裁回名义范围时边缘仍是全实色
MW = 0.66              # 垛口宽（格），周期 1 格 → 任意整数长度都能无缝拼接
TH_W = 2               # 墙厚 2 格（≈71px），与 4×4 民居（143px 面宽）同一量级

GATE_W, GATE_D = 4, 3
GP_TOP = 238           # 城台（墩台）顶
GP_PARAPET = GP_TOP + 18         # 台面女墙
G1_EAVE, G1_RISE = 300, 32       # 城楼下檐（腰檐）
G1_TOP = G1_EAVE + G1_RISE
G2_EAVE, G2_RISE = 366, 40       # 城楼上檐
G2_RIDGE = G2_EAVE + G2_RISE     # 406

FONT = r'C:\Windows\Fonts\msyh%s.ttc'

# ---------------------------------------------------------------- 色板（全部由既有色板混出）
CREAM = (240, 233, 214)
CREAM_L = (249, 245, 234)
BEIGE = (228, 210, 180)
WOOD = (150, 78, 48)
RED = (150, 52, 44)
RED_L = (196, 96, 74)
RED_D = (92, 34, 28)
GOLD = (186, 139, 48)
GOLD_L = (226, 190, 112)
INK = (38, 34, 32)
IRON = (86, 84, 80)
IRON_D = (52, 51, 50)
IRON_L = (150, 156, 160)
DARK = (18, 16, 14)


def mix(a, b, t):
    return tuple(int(round(a[i] * (1 - t) + b[i] * t)) for i in range(3))


WALL_C = mix(BEIGE, IRON, 0.26)             # 夯土/砖墙：暖灰
WALL_S = mix(WALL_C, DARK, 0.24)            # 背光侧脸
PARA_C = mix(WALL_C, IRON, 0.14)
PARA_S = mix(WALL_S, IRON, 0.12)
STONE = mix(IRON_L, CREAM, 0.34)            # 条石
STONE_S = mix(STONE, DARK, 0.20)
STONE_T = mix(STONE, CREAM, 0.22)
WALK_C = mix(STONE, BEIGE, 0.30)            # 马道面
WALK_S = mix(WALK_C, DARK, 0.16)
GATE_C = mix(WALL_C, BEIGE, 0.22)           # 城台砖：比城墙略亮一档
GATE_S = mix(GATE_C, DARK, 0.22)
GATE_T = mix(GATE_C, CREAM, 0.14)


def font(sz, bold=False):
    return ImageFont.truetype(FONT % ('bd' if bold else ''), sz)


def S(u, v, z=0.0):
    return (OX + (u - v) * 32.0, OY + (u + v) * 16.0 - z)


def eu(n=1.0):
    return (32.0 * n, 16.0 * n)


def ev(n=1.0):
    return (-32.0 * n, 16.0 * n)


def ez(h=0.0):
    return (0.0, -h)


def quad(d, o, u, v, fill):
    p0 = (o[0], o[1])
    p1 = (o[0] + u[0], o[1] + u[1])
    p2 = (o[0] + u[0] + v[0], o[1] + u[1] + v[1])
    p3 = (o[0] + v[0], o[1] + v[1])
    d.polygon([p0, p1, p2, p3], fill=fill)
    return [p0, p1, p2, p3]


def poly(d, pts, fill):
    d.polygon(pts, fill=fill)


def iso_box(d, u0, u1, v0, v1, z0, z1, cf, cs, ct, edge=True):
    """2:1 等距长方体：先画受光前脸(v=v1)、背光侧脸(u=u1)，再压顶面。"""
    quad(d, S(u0, v1, z0), eu(u1 - u0), ez(z1 - z0), cf)
    quad(d, S(u1, v0, z0), ev(v1 - v0), ez(z1 - z0), cs)
    quad(d, S(u0, v0, z1), eu(u1 - u0), ev(v1 - v0), ct)
    if edge:
        d.line([S(u0, v1, z1), S(u1, v1, z1)], fill=mix(cf, DARK, 0.55), width=2)
        d.line([S(u1, v1, z0), S(u1, v1, z1)], fill=mix(cf, DARK, 0.62), width=2)
        d.line([S(u0, v0, z1), S(u1, v0, z1)], fill=mix(ct, DARK, 0.42), width=1)
        d.line([S(u1, v0, z1), S(u1, v1, z1)], fill=mix(ct, DARK, 0.42), width=1)


def brick_v(d, u0, u1, v, z0, z1, col, ch=9.0, cw=0.62, seed=0):
    """v=常数 立面的砖缝：水平砖行 + 错缝竖缝。
    竖缝落在绝对格栅上（锚在 U0），因此任意长度切段后拼接，砖缝相位不变。"""
    dark = mix(col, DARK, 0.42)
    light = mix(col, CREAM, 0.26)
    k = 0
    z = z0 + ch
    while z < z1:
        d.line([S(u0, v, z), S(u1, v, z)], fill=dark, width=1)
        d.line([S(u0, v, z + 1.2), S(u1, v, z + 1.2)], fill=light, width=1)
        off = (cw / 2.0) if (k + seed) % 2 else 0.0
        m = int(math.floor((u0 - off - U0) / cw)) + 1
        u = U0 + m * cw + off
        while u < u1:
            d.line([S(u, v, z), S(u, v, z + ch)], fill=dark, width=1)
            u += cw
        k += 1
        z += ch


def brick_u(d, u, v0, v1, z0, z1, col, ch=9.0, cw=0.62, seed=0):
    dark = mix(col, DARK, 0.46)
    light = mix(col, CREAM, 0.14)
    k = 0
    z = z0 + ch
    while z < z1:
        d.line([S(u, v0, z), S(u, v1, z)], fill=dark, width=1)
        d.line([S(u, v0, z + 1.2), S(u, v1, z + 1.2)], fill=light, width=1)
        off = (cw / 2.0) if (k + seed) % 2 else 0.0
        m = int(math.floor((v0 - off - V0) / cw)) + 1
        v = V0 + m * cw + off
        while v < v1:
            d.line([S(u, v, z), S(u, v, z + ch)], fill=dark, width=1)
            v += cw
        k += 1
        z += ch


def vgrad(d, u0, u1, v, z0, z1, c_bot, c_top, steps=14):
    """v=常数 立面的竖向明暗：从下到上分条，墙根压重、墙顶提亮。"""
    dz = (z1 - z0) / float(steps)
    for i in range(steps):
        quad(d, S(u0, v, z0 + dz * i), eu(u1 - u0), ez(dz),
             mix(c_bot, c_top, (i + 0.5) / steps))


def ugrad(d, u, v0, v1, z0, z1, c_bot, c_top, steps=14):
    """u=常数 侧脸的竖向明暗。"""
    dz = (z1 - z0) / float(steps)
    for i in range(steps):
        quad(d, S(u, v0, z0 + dz * i), ev(v1 - v0), ez(dz),
             mix(c_bot, c_top, (i + 0.5) / steps))


def thick_corner(d, u1, v0, v1, z0, z1, cf, cs, bw=0.045):
    """转角厚度：前脸外缘一道亮棱 + 侧脸内侧一道暗倒角，让两面读成有厚度的体块。"""
    quad(d, S(u1, v1 - bw, z0), ev(bw), ez(z1 - z0), mix(cs, DARK, 0.50))
    d.line([S(u1, v1, z0), S(u1, v1, z1)], fill=mix(cf, CREAM, 0.48), width=2)


def merlons(d, axis, a0, a1, c0, c1, z0, hgt, wh=None, inner=False):
    """垛口：周期 1 格、宽 MW，两端各留 (1-MW)/2 → 任意整数长度无缝、与邻段同相位。
    inner=True：这一排朝观众的那面是"内侧"，压暗 → 缺口读成掏进去的槽。"""
    n = max(1, int(math.floor(a1 - a0 + 1e-6)))
    pad = (1.0 - (wh or MW)) / 2.0
    w = wh or MW
    cf = mix(PARA_C, DARK, 0.24) if inner else PARA_C
    cs = mix(PARA_S, DARK, 0.24) if inner else PARA_S
    for k in range(n):
        a = a0 + k + pad
        b = a + w
        if axis == 'u':
            iso_box(d, a, b, c0, c1, z0, z0 + hgt, cf, cs, mix(cf, CREAM, 0.30))
        else:
            iso_box(d, c0, c1, a, b, z0, z0 + hgt, cf, cs, mix(cf, CREAM, 0.30))


# ---------------------------------------------------------------- 直段
def build_wall(n, axis, th=2):
    """直段：条石基座 + 砖墙身 + 马道 + 两侧垛口。厚度 2 格（≈71px），长度方向严格按格对齐、无出挑。"""
    cv = Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
    d = ImageDraw.Draw(cv)
    L = 0.05                                   # 基座只在「进深」方向出挑，长度方向不出挑
    if axis == 'u':
        u0, u1, v0, v1 = U0, U0 + n, V0, V0 + th
        b = (u0 - BL, u1 + BL, v0 - L, v1 + L)
        # 长度方向出血范围（垛口网格仍按名义 u0/u1 排，出血段不产生半个垛口）
        eu0, eu1, ev0, ev1 = u0 - BL, u1 + BL, v0, v1
    else:
        u0, u1, v0, v1 = U0, U0 + th, V0, V0 + n
        b = (u0 - L, u1 + L, v0 - BL, v1 + BL)
        eu0, eu1, ev0, ev1 = u0, u1, v0 - BL, v1 + BL
    # 基座
    iso_box(d, b[0], b[1], b[2], b[3], 0, BASE, STONE, STONE_S, STONE_T)
    if axis == 'u':
        brick_v(d, b[0], b[1], b[3], 0, BASE, STONE, ch=11.0, cw=0.92)
        brick_u(d, b[1], b[2], b[3], 0, BASE, STONE_S, ch=11.0, cw=0.92)
    else:
        brick_v(d, b[0], b[1], b[3], 0, BASE, STONE, ch=11.0, cw=0.92, seed=1)
        brick_u(d, b[1], b[2], b[3], 0, BASE, STONE_S, ch=11.0, cw=0.92, seed=1)
    d.line([S(b[0], b[3], BASE), S(b[1], b[3], BASE)], fill=mix(STONE, DARK, 0.5), width=2)
    # 墙身
    iso_box(d, eu0, eu1, ev0, ev1, BASE, WALL_TOP, WALL_C, WALL_S, WALK_C)
    # 竖向明暗 + 墙根压重：让墙面有体积，不再是平贴砖纹
    vgrad(d, eu0, eu1, ev1, BASE, WALL_TOP - 8,
          mix(WALL_C, DARK, 0.34), mix(WALL_C, CREAM, 0.20))
    ugrad(d, eu1, ev0, ev1, BASE, WALL_TOP - 8,
          mix(WALL_S, DARK, 0.38), mix(WALL_S, CREAM, 0.08))
    if axis == 'u':
        brick_v(d, eu0, eu1, ev1, BASE + 3, WALL_TOP - 8, WALL_C)
        brick_u(d, eu1, ev0, ev1, BASE + 3, WALL_TOP - 8, WALL_S, seed=1)
    else:
        brick_v(d, eu0, eu1, ev1, BASE + 3, WALL_TOP - 8, WALL_C, seed=2)
        brick_u(d, eu1, ev0, ev1, BASE + 3, WALL_TOP - 8, WALL_S, seed=3)
    # 注：直段的 u=u1 面在拼接后是「接缝」，不是外棱 —— 这里不画转角亮棱/暗倒角，
    # 否则每段端头都会在接缝处留一道亮（或暗）竖线。转角厚度由 city_wall_corner 承担。
    d.line([S(eu0, ev1, BASE), S(eu1, ev1, BASE)], fill=(30, 27, 24), width=3)
    # 墙顶压顶石带（最后 8px 浅石色，把砖墙收口）
    for zz0, zz1 in ((WALL_TOP - 8, WALL_TOP),):
        if axis == 'u':
            quad(d, S(eu0, ev1, zz0), eu(eu1 - eu0), ez(zz1 - zz0), STONE_T)
            quad(d, S(eu1, ev0, zz0), ev(ev1 - ev0), ez(zz1 - zz0), mix(STONE_T, DARK, 0.18))
            d.line([S(eu0, ev1, zz1), S(eu1, ev1, zz1)], fill=mix(STONE, DARK, 0.55), width=2)
        else:
            quad(d, S(eu0, ev1, zz0), eu(eu1 - eu0), ez(zz1 - zz0), STONE_T)
            quad(d, S(eu1, ev0, zz0), ev(ev1 - ev0), ez(zz1 - zz0), mix(STONE_T, DARK, 0.18))
            d.line([S(eu0, ev1, zz1), S(eu1, ev1, zz1)], fill=mix(STONE, DARK, 0.55), width=2)
    # 马道面（两道垛口之间的一条走道，比压顶亮一档）
    if axis == 'u':
        quad(d, S(eu0, v0 + THICK, WALL_TOP), eu(eu1 - eu0), ev(th - 2 * THICK),
             mix(WALK_C, CREAM, 0.30))
        d.line([S(eu0, v1 - THICK, WALL_TOP), S(eu1, v1 - THICK, WALL_TOP)],
               fill=mix(STONE, DARK, 0.55), width=2)
        d.line([S(eu0, v0 + THICK, WALL_TOP), S(eu1, v0 + THICK, WALL_TOP)],
               fill=mix(STONE, DARK, 0.35), width=1)
    else:
        quad(d, S(u0 + THICK, ev0, WALL_TOP), eu(th - 2 * THICK), ev(ev1 - ev0),
             mix(WALK_C, CREAM, 0.14))
        d.line([S(u1 - THICK, ev0, WALL_TOP), S(u1 - THICK, ev1, WALL_TOP)],
               fill=mix(STONE, DARK, 0.55), width=2)
        d.line([S(u0 + THICK, ev0, WALL_TOP), S(u0 + THICK, ev1, WALL_TOP)],
               fill=mix(STONE, DARK, 0.35), width=1)
    # 垛口：先远排后近排
    a0, a1 = (u0, u1) if axis == 'u' else (v0, v1)
    if axis == 'u':
        merlons(d, 'u', a0, a1, v0, v0 + THICK, WALL_TOP, MER, inner=True)
        merlons(d, 'u', a0, a1, v1 - THICK, v1, WALL_TOP, MER)
    else:
        merlons(d, 'v', a0, a1, u0, u0 + THICK, WALL_TOP, MER, inner=True)
        merlons(d, 'v', a0, a1, u1 - THICK, u1, WALL_TOP, MER)
    return POST.add_outline(cv, px=2.4, erode=1.0)


# ---------------------------------------------------------------- 角台
def build_corner(th=2):
    """2×2 角台：四面连续女墙（不做垛口缺口）+ 近角隅石。四面同构 → 四个方位通用、无需朝向件。"""
    cv = Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
    d = ImageDraw.Draw(cv)
    u0, u1, v0, v1 = U0, U0 + th, V0, V0 + th
    L = 0.06
    iso_box(d, u0 - L, u1 + L, v0 - L, v1 + L, 0, BASE, STONE, STONE_S, STONE_T)
    brick_v(d, u0 - L, u1 + L, v1 + L, 0, BASE, STONE, ch=11.0, cw=0.92, seed=2)
    brick_u(d, u1 + L, v0 - L, v1 + L, 0, BASE, STONE_S, ch=11.0, cw=0.92, seed=2)
    CC = mix(WALL_C, CREAM, 0.12)
    CS = mix(WALL_S, CREAM, 0.05)
    # u 两端出血 BL 再裁回名义范围：否则 iso_box 在 u=u1 画的竖棱线、以及轮廓描边，
    # 都会正好落在接缝上（上段端头的黑线就是这么来的）
    iso_box(d, u0 - BL, u1 + BL, v0, v1, BASE, COR_TOP, CC, CS, WALK_C)
    vgrad(d, u0 - BL, u1 + BL, v1, BASE, COR_TOP - 8,
          mix(CC, DARK, 0.34), mix(CC, CREAM, 0.22))
    ugrad(d, u1 + BL, v0, v1, BASE, COR_TOP - 8,
          mix(CS, DARK, 0.38), mix(CS, CREAM, 0.10))
    brick_v(d, u0 - BL, u1 + BL, v1, BASE + 3, COR_TOP - 8, CC, seed=3)
    brick_u(d, u1 + BL, v0, v1, BASE + 3, COR_TOP - 8, CS, seed=4)
    # 不在 u=u1 做转角亮棱/暗倒角：角台的 u=u1 面通常直接接下一段直墙，
    # 倒角会变成一条贯穿上下的深色竖带（和接缝黑线同一类问题）。厚度由近角隅石承担。
    quad(d, S(u0 - BL, v1, COR_TOP - 8), eu(th + 2 * BL), ez(8), STONE_T)
    quad(d, S(u1 + BL, v0, COR_TOP - 8), ev(th), ez(8), mix(STONE_T, DARK, 0.18))
    # 女墙圈内的台面：抬到接近女墙顶（只留 8px 浅槽），才读成「实心墩台 + 一圈矮女墙」，
    # 而不是一个深口方盒；先铺地，再让四面女墙压上去
    P = THICK
    quad(d, S(u0 + P, v0 + P, COR_PARA - 8), eu(th - 2 * P), ev(th - 2 * P), mix(WALK_C, CREAM, 0.55))
    # 四面连续女墙（厚度 = 垛口厚）
    for (qu0, qu1, qv0, qv1, inn) in ((u0, u1, v0, v0 + P, True),        # 远（朝内）
                                      (u0, u0 + P, v0 + P, v1 - P, True),  # 左（朝内）
                                      (u1 - P, u1, v0 + P, v1 - P, False), # 右（朝外）
                                      (u0, u1, v1 - P, v1, False)):        # 近（朝外）
        cf = mix(PARA_C, DARK, 0.12) if inn else PARA_C
        cs = mix(PARA_S, DARK, 0.12) if inn else PARA_S
        q0x = qu0 - BL if qu0 <= u0 + 1e-6 else qu0      # 贴 u0 的带同样出血
        q1x = qu1 + BL if qu1 >= u1 - 1e-6 else qu1      # 顶到 u1 的带同样出血，避免接缝竖棱
        iso_box(d, q0x, q1x, qv0, qv1, COR_TOP, COR_PARA, cf, cs,
                mix(cf, CREAM, 0.36))
    # 台面分格线（读得出「这是一个转角墩台」而不是光柱）
    fc = mix(WALK_C, DARK, 0.34)
    zf = COR_PARA - 8
    for k in (1, 2, 3):
        f = k / 4.0
        du, dv = (th - 2 * P) * f, (th - 2 * P) * f
        d.line([S(u0 + P + du, v0 + P, zf), S(u0 + P + du, v1 - P, zf)],
               fill=fc, width=1)
        d.line([S(u0 + P, v0 + P + dv, zf), S(u1 - P, v0 + P + dv, zf)],
               fill=fc, width=1)
    # 近角隅石：两种石材交替，沿 (u1,v1) 立棱
    for k, z in enumerate(range(BASE + 2, COR_TOP - 10, 17)):
        col = STONE_T if k % 2 else mix(STONE, DARK, 0.10)
        quad(d, S(u1 - 0.34, v1, z), eu(0.34), ez(14), col)
        quad(d, S(u1, v1 - 0.34, z), ev(0.34), ez(14), mix(col, DARK, 0.22))
        d.line([S(u1, v1 - 0.34, z), S(u1, v1 - 0.34, z + 14)], fill=mix(col, DARK, 0.55), width=1)
    return POST.add_outline(cv, px=2.4, erode=1.0)


# ---------------------------------------------------------------- 城门楼
def droop(n, rise):
    """沿 +v 走 n 格同时下降 rise px 的屏幕向量。"""
    return (-32.0 * n, 16.0 * n + rise)


def _arch_pts(pt, ac, half, z_spring, z_floor):
    """券洞立面多边形：左底 → 右底 → 右券脚 → 半圆券顶 → 左券脚。"""
    arc = []
    for i in range(25):
        a = math.pi * i / 24.0
        arc.append(pt(ac + half * math.cos(a), z_spring + half * 33.0 * math.sin(a)))
    return [pt(ac - half, z_floor), pt(ac + half, z_floor)] + arc


def arch_open(d, ac, mf, half, z_spring, z_floor=0, depth=3, axis='v', brick=None):
    """券门隧洞（亮色版）：砖砌内壁 + 远口透光 + 地面光池 + 券石圈。

    axis='v'：洞开在 v=mf 立面（ac 为截面中心的世界 u 坐标），隧洞向 -v 退 depth 格
              —— u 向城门（北门宽城门楼 / 4×3 城门楼）。
    axis='u'：洞开在 u=mf 立面（ac 为截面中心的世界 v 坐标），隧洞向 -u 退 depth 格
              —— v 向城门（东西门宽城门楼）。
    隧洞内不再用黑色平涂：内壁用城墙砖色由近及远压暗，远口透出室外天光，
    地面画门前光池； darkest 仍是砖影 (74,63,52)，不再是 (26,22,20) 的黑洞。
    """
    brick = brick or GATE_C
    if axis == 'v':
        pt = lambda a, z: S(a, mf, z)                 # 洞口立面
        pf = lambda a, z: S(a, mf - depth, z)         # 远口（退 depth 格）
    else:
        pt = lambda a, z: S(mf, a, z)
        pf = lambda a, z: S(mf - depth, a, z)
    mouth = _arch_pts(pt, ac, half, z_spring, z_floor)
    far = _arch_pts(pf, ac, half, z_spring, z_floor)
    # 在独立图层上画洞内景象，再按洞口剪裁贴回
    layer = Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
    t = ImageDraw.Draw(layer)

    def lerp(p, q_, k):
        return (p[0] + (q_[0] - p[0]) * k, p[1] + (q_[1] - p[1]) * k)

    # 1 底色：券顶阴影带（最暗的砖影）
    poly(t, mouth, mix(brick, DARK, 0.52))
    # 2 远口透光：室外天光 + 远处地面
    poly(t, far, (236, 227, 203))
    poly(t, [pf(ac - half, z_floor), pf(ac + half, z_floor),
             pf(ac + half, z_floor + 20), pf(ac - half, z_floor + 20)], (207, 193, 165))
    t.line([pf(ac - half, z_floor + 20), pf(ac + half, z_floor + 20)],
           fill=(186, 172, 146), width=2)
    # 3 进深内壁（受光面）：从洞口券脚到远口券脚，分三段由亮到暗 + 砖缝
    a0, b0 = pt(ac - half, z_floor), pt(ac - half, z_spring)
    a1, b1 = pf(ac - half, z_floor), pf(ac - half, z_spring)
    slices = (mix(brick, CREAM, 0.10), mix(brick, DARK, 0.22), mix(brick, DARK, 0.42))
    for k in range(3):
        p, q_, r, s_ = lerp(a0, a1, k / 3), lerp(b0, b1, k / 3), lerp(b0, b1, (k + 1) / 3), lerp(a0, a1, (k + 1) / 3)
        poly(t, [p, q_, r, s_], slices[k])
    zk = z_floor + 12.0
    while zk < z_spring - 4:
        t.line([lerp(a0, a1, 0.06) if zk < z_floor + 14 else pt(ac - half, zk),
                lerp(a1, a0, 0.04) if zk < z_floor + 14 else pf(ac - half, zk)],
               fill=mix(brick, DARK, 0.5), width=1)
        zk += 12.0
    # 4 券顶以上内壁（拱肩）：洞口左弧与远口左弧之间
    haunch = mouth[2 + 12:] + far[2 + 12::-1]     # 左半弧（顶点→左券脚）
    poly(t, haunch, mix(brick, DARK, 0.34))
    # 5 洞内地面：石板 + 门前光池（近亮远暗）
    fl0, fl1 = pt(ac - half, z_floor), pt(ac + half, z_floor)
    fr0, fr1 = pf(ac - half, z_floor), pf(ac + half, z_floor)
    pool = (mix(mix(STONE, DARK, 0.30), (255, 243, 212), 0.42),
            mix(mix(STONE, DARK, 0.32), (255, 243, 212), 0.22),
            mix(STONE, DARK, 0.38))
    for k in range(3):
        poly(t, [lerp(fl0, fr0, k / 3), lerp(fl1, fr1, k / 3),
                 lerp(fl1, fr1, (k + 1) / 3), lerp(fl0, fr0, (k + 1) / 3)], pool[k])
    for s_ in (0.22, 0.5, 0.78):
        t.line([lerp(fl0, fr0, s_), lerp(fl1, fr1, s_)], fill=mix(STONE, DARK, 0.52), width=1)
    # 按洞口剪裁，把洞内景象贴回主画布
    mask = Image.new('L', (CW, CH), 0)
    ImageDraw.Draw(mask).polygon(mouth, fill=255)
    d._image.paste(layer, (0, 0), mask)
    # 6 券石圈：沿洞口券顶一圈浅色券石（画在主画布，不被洞口剪裁）
    for i in range(13):
        a0 = math.pi * i / 13.0
        a1 = math.pi * (i + 0.86) / 13.0
        b0 = pt(ac + half * math.cos(a0), z_spring + half * 33.0 * math.sin(a0))
        b1 = pt(ac + half * math.cos(a1), z_spring + half * 33.0 * math.sin(a1))
        c1 = pt(ac + (half + 0.13) * math.cos(a1), z_spring + (half + 0.13) * 33.0 * math.sin(a1))
        c0 = pt(ac + (half + 0.13) * math.cos(a0), z_spring + (half + 0.13) * 33.0 * math.sin(a0))
        tone = STONE_T if i % 2 == 0 else mix(STONE_T, STONE, 0.42)
        poly(d, [b0, b1, c1, c0], tone)
        d.line([b0, b1], fill=mix(tone, DARK, 0.50), width=1)
    # 7 直段两侧券肩
    for sx in (-1, 1):
        x0 = ac + sx * half
        x1 = ac + sx * (half + 0.13)
        poly(d, [pt(x0, z_floor), pt(x0, z_spring), pt(x1, z_spring), pt(x1, z_floor)],
             STONE_T if sx < 0 else mix(STONE_T, STONE, 0.42))
    # 8 门槛石
    poly(d, [pt(ac - half - 0.16, z_floor), pt(ac + half + 0.16, z_floor),
             pt(ac + half + 0.16, z_floor + 6), pt(ac - half - 0.16, z_floor + 6)], STONE_T)
    d.line([pt(ac - half - 0.16, z_floor + 6), pt(ac + half + 0.16, z_floor + 6)],
           fill=mix(STONE, DARK, 0.45), width=2)


def plaque_iso(d, uc, vf, halfw, z0, z1, dark=(40, 30, 24)):
    """立面素匾（不写字，文字由引擎叠加）：深底 + 金框。"""
    poly(d, [S(uc - halfw, vf, z0), S(uc + halfw, vf, z0),
             S(uc + halfw, vf, z1), S(uc - halfw, vf, z1)], dark)
    pts = [S(uc - halfw, vf, z0), S(uc + halfw, vf, z0),
           S(uc + halfw, vf, z1), S(uc - halfw, vf, z1), S(uc - halfw, vf, z0)]
    d.line(pts, fill=GOLD, width=3)
    d.line([S(uc - halfw + 0.04, vf, z1 - 3), S(uc + halfw - 0.04, vf, z1 - 3)],
           fill=GOLD_L, width=1)


def bracket_row(d, ua, ub, vf, z0, h, n=None, front=True):
    """檐下斗拱：一排小方块（交替金/米白），下方压一道额枋。"""
    n = n or max(4, int(round((ub - ua) / 0.24)))
    span = (ub - ua)
    for i in range(n):
        a = ua + span * i / n + 0.02
        b = ua + span * (i + 1) / n - 0.02
        col = GOLD_L if i % 2 == 0 else CREAM_L
        poly(d, [S(a, vf, z0), S(b, vf, z0), S(b, vf, z0 + h), S(a, vf, z0 + h)], col)
        d.line([S(a, vf, z0), S(a, vf, z0 + h)], fill=mix(col, DARK, 0.42), width=1)
        d.line([S(a, vf, z0 + h), S(b, vf, z0 + h)], fill=mix(col, DARK, 0.34), width=1)


def skirting(d, e0, e1, t0, t1, c_top, c_bot, lit=True, tiles=None):
    """腰檐/披檐：檐口边 e0-e1（宽）、上沿 t0-t1（窄）之间的梯形瓦坡。
    梯形的收窄正是重檐「下檐向上收进、上檐墙身再起」的读法。"""
    tiles = tiles or max(6, int(round(abs(e1[0] - e0[0]) / 7.0)))
    steps = 8
    for k in range(steps):
        a0, a1 = k / steps, (k + 1) / steps
        p0 = (e0[0] + (t0[0] - e0[0]) * a0, e0[1] + (t0[1] - e0[1]) * a0)
        p1 = (e1[0] + (t1[0] - e1[0]) * a0, e1[1] + (t1[1] - e1[1]) * a0)
        q1 = (e1[0] + (t1[0] - e1[0]) * a1, e1[1] + (t1[1] - e1[1]) * a1)
        q0 = (e0[0] + (t0[0] - e0[0]) * a1, e0[1] + (t0[1] - e0[1]) * a1)
        tone = mix(c_bot, c_top, a1)
        poly(d, [p0, p1, q1, q0], tone)
    # 瓦垄
    for i in range(tiles + 1):
        a = i / tiles
        p = (e0[0] + (e1[0] - e0[0]) * a, e0[1] + (e1[1] - e0[1]) * a)
        q = (t0[0] + (t1[0] - t0[0]) * a, t0[1] + (t1[1] - t0[1]) * a)
        d.line([p, q], fill=mix(c_top, DARK, 0.30), width=1)
        d.line([(p[0] + 2, p[1] - 1), (q[0] + 2, q[1] - 1)], fill=mix(c_top, CREAM, 0.24), width=1)
    # 檐口板 + 瓦当
    d.line([e0, e1], fill=mix(c_bot, DARK, 0.40), width=2)
    poly(d, [e0, e1, (e1[0], e1[1] + 6), (e0[0], e0[1] + 6)], mix(c_bot, DARK, 0.28))
    for i in range(tiles):
        a = (i + 0.5) / tiles
        px = e0[0] + (e1[0] - e0[0]) * a
        py = e0[1] + (e1[1] - e0[1]) * a + 3
        d.ellipse([px - 3, py - 3, px + 3, py + 3], fill=mix(c_top, CREAM, 0.34),
                  outline=mix(c_top, DARK, 0.44))


def build_gate():
    cv = Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
    d = ImageDraw.Draw(cv)
    u0, u1, v0, v1 = U0, U0 + GATE_W, V0, V0 + GATE_D
    uc = (u0 + u1) / 2.0
    ov = 0.16
    # 长度方向（u）出血——与直段同一手法：
    # 城台/基座/压顶在 u 两端各画到 ±BL，bake 时再裁回名义范围，
    # 于是 iso_box 的端头竖棱线、以及 add_outline 在端面画的描边，都被裁掉，
    # 与左右直墙拼接处只剩「同色面到同色面」，不再出现深色竖边。
    B = BL
    bu0, bu1 = u0 - B, u1 + B
    # 1 条石基座（与城台齐平，便于券门贯通到地面）
    iso_box(d, bu0, bu1, v0, v1, 0, 30, STONE, STONE_S, STONE_T)
    brick_v(d, bu0, bu1, v1, 0, 30, STONE, ch=11.0, cw=0.92, seed=5)
    brick_u(d, bu1, v0, v1, 0, 30, STONE_S, ch=11.0, cw=0.92, seed=5)
    # 2 城台（墩台）
    iso_box(d, bu0, bu1, v0, v1, 30, GP_TOP, GATE_C, GATE_S, GATE_T)
    brick_v(d, bu0, bu1, v1, 36, GP_TOP - 12, GATE_C, ch=10.0, cw=0.54)
    brick_u(d, bu1, v0, v1, 36, GP_TOP - 12, GATE_S, ch=10.0, cw=0.54, seed=1)
    # 3 压顶石带 + 台面（先铺台面，再让楼身压上去）
    quad(d, S(bu0, v1, GP_TOP - 9), eu(GATE_W + 2 * B), ez(9), STONE_T)
    quad(d, S(bu1, v0, GP_TOP - 9), ev(GATE_D), ez(9), mix(STONE_T, DARK, 0.18))
    d.line([S(bu0, v1, GP_TOP), S(bu1, v1, GP_TOP)], fill=mix(STONE, DARK, 0.55), width=2)
    quad(d, S(u0 + 0.24, v0 + 0.24, GP_TOP), eu(GATE_W - 0.48), ev(GATE_D - 0.48),
         mix(GATE_T, CREAM, 0.18))
    # 4 券门（贯通城台，落到地面）
    arch_open(d, uc, v1, 1.05, 78, 0)
    # 5 匾额（券门正上方）
    plaque_iso(d, uc, v1, 0.64, 122, 152)
    # 6 城楼下层（腰檐以下）
    lu0, lu1, lv0, lv1 = u0 + 0.30, u1 - 0.30, v0 + 0.55, v1 - 0.65
    ltop = G1_EAVE - 14
    iso_box(d, lu0, lu1, lv0, lv1, GP_TOP, ltop, CREAM, mix(CREAM, DARK, 0.22),
            mix(CREAM, CREAM_L, 0.5))
    # 前脸：朱红立柱 + 直棂窗
    bays = 6
    for i in range(bays + 1):
        uu = lu0 + (lu1 - lu0) * i / bays
        w0 = 0.09
        poly(d, [S(uu - w0, lv1, GP_TOP), S(uu + w0, lv1, GP_TOP),
                 S(uu + w0, lv1, ltop), S(uu - w0, lv1, ltop)], RED)
        d.line([S(uu + w0, lv1, GP_TOP), S(uu + w0, lv1, ltop)], fill=RED_D, width=2)
        d.line([S(uu - w0, lv1, GP_TOP), S(uu - w0, lv1, ltop)], fill=RED_L, width=1)
    for i in range(bays):
        a = lu0 + (lu1 - lu0) * (i + 0.14) / bays
        b = lu0 + (lu1 - lu0) * (i + 0.86) / bays
        z0_, z1_ = GP_TOP + 20, ltop - 26
        poly(d, [S(a, lv1, z0_), S(b, lv1, z0_), S(b, lv1, z1_), S(a, lv1, z1_)],
             (247, 240, 221))
        d.line([S(a, lv1, z0_), S(b, lv1, z0_), S(b, lv1, z1_), S(a, lv1, z1_),
                S(a, lv1, z0_)], fill=WOOD, width=2)
        for k in range(1, 5):
            uu = a + (b - a) * k / 5.0
            d.line([S(uu, lv1, z0_), S(uu, lv1, z1_)], fill=mix(WOOD, CREAM, 0.25), width=1)
    # 侧脸（背光）：立柱同样压暗
    for i in range(bays + 1):
        vv_ = lv0 + (lv1 - lv0) * i / bays
        poly(d, [S(lu1, vv_ - 0.09, GP_TOP), S(lu1, vv_ + 0.09, GP_TOP),
                 S(lu1, vv_ + 0.09, ltop), S(lu1, vv_ - 0.09, ltop)],
             mix(RED, DARK, 0.26))
    # 7 额枋 + 斗拱（下层）
    poly(d, [S(lu0, lv1, ltop), S(lu1, lv1, ltop),
             S(lu1, lv1, G1_EAVE - 5), S(lu0, lv1, G1_EAVE - 5)], RED)
    d.line([S(lu0, lv1, ltop), S(lu1, lv1, ltop)], fill=GOLD, width=1)
    bracket_row(d, lu0 + 0.02, lu1 - 0.02, lv1, G1_EAVE - 5, 5)
    # 8 下檐腰檐（重檐第一层）：梯形收分，前坡 + 右侧坡
    uu0, uu1, uv0, uv1 = u0 + 0.72, u1 - 0.72, v0 + 0.92, v1 - 0.92
    skirting(d, S(lu0 - ov, lv1 + ov, G1_EAVE), S(lu1 + ov, lv1 + ov, G1_EAVE),
             S(uu0 - 0.02, uv1, G1_TOP), S(uu1 + 0.02, uv1, G1_TOP), SB.ROOF_C[3], SB.ROOF_C[1])
    skirting(d, S(lu1 + ov, lv0 - ov, G1_EAVE), S(lu1 + ov, lv1 + ov, G1_EAVE),
             S(uu1, uv0 - 0.02, G1_TOP), S(uu1, uv1 + 0.02, G1_TOP), SB.BACK_C[1], SB.BACK_C[0])
    # 9 城楼上层
    iso_box(d, uu0, uu1, uv0, uv1, G1_TOP, G2_EAVE - 12, CREAM, mix(CREAM, DARK, 0.24),
            mix(CREAM, CREAM_L, 0.5))
    for i in range(4):
        uu = uu0 + (uu1 - uu0) * i / 3.0
        poly(d, [S(uu - 0.08, uv1, G1_TOP), S(uu + 0.08, uv1, G1_TOP),
                 S(uu + 0.08, uv1, G2_EAVE - 12), S(uu - 0.08, uv1, G2_EAVE - 12)], RED)
    for i in range(3):
        a = uu0 + (uu1 - uu0) * (i + 0.28) / 3.0
        b = uu0 + (uu1 - uu0) * (i + 0.72) / 3.0
        poly(d, [S(a, uv1, G1_TOP + 9), S(b, uv1, G1_TOP + 9),
                 S(b, uv1, G2_EAVE - 28), S(a, uv1, G2_EAVE - 28)], (247, 240, 221))
        d.line([S(a, uv1, G1_TOP + 9), S(b, uv1, G1_TOP + 9),
                S(b, uv1, G2_EAVE - 28), S(a, uv1, G2_EAVE - 28), S(a, uv1, G1_TOP + 9)],
               fill=WOOD, width=2)
    poly(d, [S(uu0, uv1, G2_EAVE - 12), S(uu1, uv1, G2_EAVE - 12),
             S(uu1, uv1, G2_EAVE - 4), S(uu0, uv1, G2_EAVE - 4)], RED)
    d.line([S(uu0, uv1, G2_EAVE - 12), S(uu1, uv1, G2_EAVE - 12)], fill=GOLD, width=1)
    bracket_row(d, uu0 + 0.02, uu1 - 0.02, uv1, G2_EAVE - 4, 4, n=9)
    # 10 上层屋顶（两坡 + 两端山墙 + 正脊）
    rv = (uv0 + uv1) / 2.0
    nf = (uv1 + ov) - rv
    nb = rv - (uv0 - ov)
    o = S(uu0 - ov, rv, G2_RIDGE)
    uvec = eu(uu1 - uu0 + 2 * ov)
    SB.roof_slope(d, o, uvec, droop(-nb, G2_RISE), False)
    SB.gable(d, uu1 + ov, uv0 - ov, uv1 + ov, G2_EAVE, G2_RIDGE, CREAM, True)
    SB.gable(d, uu0 - ov, uv0 - ov, uv1 + ov, G2_EAVE, G2_RIDGE, CREAM, False)
    SB.roof_slope(d, o, uvec, droop(nf, G2_RISE), True)
    SB.ridge(d, (uu0 - ov - 0.12, rv), (uu1 + ov + 0.12, rv), G2_RIDGE + 2)
    # 11 台面女墙：先右后前（前排在最前，压住楼身底部）
    merlons(d, 'v', v0 + 0.34, v1 - 0.34, u1 - THICK, u1, GP_TOP, 18, wh=0.72)
    merlons(d, 'u', u0 + 0.34, u1 - 0.34, v1 - THICK, v1, GP_TOP, 18, wh=0.72)
    return POST.add_outline(cv, px=2.4, erode=1.2)


def droop_R(n, rise):
    """沿 +u 外挑 n 格并下降 rise px（右向腰檐用）。"""
    return (32.0 * n, 16.0 * n + rise)


# ---------------------------------------------------------------- 预览板
CHAR_PATH = os.path.join(ROOT, 'assets_v2', 'sprites', 'xiake', 'idle_0.png')
_CACHE = {}


def mod(name):
    if name not in _CACHE:
        p = os.path.join(MOD, name)
        _CACHE[name] = (Image.open(p + '.png').convert('RGBA'),
                        json.load(open(p + '.json', encoding='utf-8')))
    return _CACHE[name]


def char_img(hgt, path=None):
    im = Image.open(path or CHAR_PATH).convert('RGBA')
    k = float(hgt) / im.height
    return im.resize((max(1, int(round(im.width * k))), hgt), Image.LANCZOS)


class Board(object):
    """世界坐标画板：place(name,u0,v0) 按足迹前底顶点对齐；绘制顺序由调用方显式控制。"""

    def __init__(self, w, h, ox, oy, sc=1.0, bg=(0, 0, 0, 0)):
        self.im = Image.new('RGBA', (w, h), bg)
        self.ox, self.oy, self.sc = ox, oy, sc

    def P(self, u, v, z=0.0):
        return (self.ox + (u - v) * 32.0 * self.sc,
                self.oy + (u + v) * 16.0 * self.sc - z * self.sc)

    def place(self, name, u0, v0):
        spr, meta = mod(name)
        w = meta.get('footprint_w') or meta.get('footprint', [1, 1])[0]
        h = meta.get('footprint_h') or meta.get('footprint', [1, 1])[1]
        ap = meta.get('anchor_px')
        if ap:
            ax, ay = ap
        else:                                   # 旧道具只有 anchor 比例：按精灵尺寸折算
            kx, ky = meta.get('anchor') or [0.5, 1.0]
            ax, ay = spr.width * kx, spr.height * ky
        px, py = self.P(u0 + w, v0 + h)
        if self.sc != 1.0:
            spr = spr.resize((max(1, int(round(spr.width * self.sc))),
                              max(1, int(round(spr.height * self.sc)))), Image.LANCZOS)
            ax, ay = ax * self.sc, ay * self.sc
        pos = (int(round(px - ax)), int(round(py - ay)))
        self.im.alpha_composite(spr, pos)

    def contact_shadow(self, u0, v0, w, d, alpha=138, blur=5.0, grow=0.10):
        """接地投影：沿足迹菱形外扩一圈、略往背光侧推一点，再高斯羽化 —— 短、偏冷、边缘软。"""
        g = grow
        pts = [self.P(u0 + w + g, v0 + d + g), self.P(u0 - g, v0 + d + g),
               self.P(u0 - g - 0.04, v0 - g - 0.04), self.P(u0 + w + g, v0 - g - 0.04)]
        xs, ys = [p[0] for p in pts], [p[1] for p in pts]
        x0 = max(0, int(min(xs)) - 14)
        y0 = max(0, int(min(ys)) - 14)
        x1 = min(self.im.width, int(max(xs)) + 14)
        y1 = min(self.im.height, int(max(ys)) + 14)
        if x1 - x0 < 3 or y1 - y0 < 3:
            return
        lay = Image.new('RGBA', (x1 - x0, y1 - y0), (0, 0, 0, 0))
        ImageDraw.Draw(lay).polygon([(p[0] - x0, p[1] - y0) for p in pts],
                                    fill=(72, 80, 100, alpha))
        self.im.alpha_composite(lay.filter(ImageFilter.GaussianBlur(blur)), (x0, y0))

    def person(self, u, v, hgt=84, dx=0):
        ch = char_img(int(round(hgt * self.sc)))
        px, py = self.P(u, v)
        pos = (int(round(px - ch.width / 2.0 + dx)), int(round(py - ch.height)))
        self.im.alpha_composite(ch, pos)

    def diamond(self, u0, v0, w, d, fill=(219, 211, 195, 255), edge=(170, 162, 146, 255),
                width=2):
        pts = [self.P(u0 + w, v0 + d), self.P(u0, v0 + d), self.P(u0, v0), self.P(u0 + w, v0)]
        ImageDraw.Draw(self.im).polygon(pts, fill=fill)
        ImageDraw.Draw(self.im).line(pts + [pts[0]], fill=edge, width=width)

    def crop(self):
        bb = self.im.getbbox()
        return self.im.crop(bb)


# ---------------------------------------------------------------- 预览：并排对照
PANELS = [
    ('city_wall_u6', '直段 · u 向', 6, 2, (2.60, 2.55),
     [(200, '马道 200'), (224, '垛口 224'), (34, '石基 34')]),
    ('city_wall_v6', '直段 · v 向', 2, 6, (2.70, 3.00),
     [(200, '马道 200'), (224, '垛口 224')]),
    ('city_wall_corner', '角台 · 2×2（四方位通用）', 2, 2, (1.55, 2.42),
     [(200, '台顶 200'), (232, '女墙 232')]),
    ('city_gate_tower', '城门楼 · 4×3', 4, 3, (0.35, 3.55),
     [(238, '城台 238'), (300, '下檐 300'), (366, '上檐 366'), (406, '正脊 406')]),
]
CAPS = [
    ['条石基座 / 砖墙身 / 压顶石带 / 马道 / 两侧垛口', '厚 2 格；长度方向零出挑，垛口周期 1 格'],
    ['同一构件旋转 90°：受光面换成长侧面', '与 u 向直段在角台处 1:1 对齐，无需补缝'],
    ['四面连续女墙 + 四角互锁 + 近棱隅石', '压顶与直段共线（不错缝），女墙比垛口高 8px'],
    ['城台 30-238（券门贯通）/ 台面女墙 / 下层腰檐', '上层 332-366 + 两坡顶 366-406（全城最高）'],
]


def seam_check():
    """6+2+2+6 = 16 格直段 + 尽头角台 + 转角后接 v 向 6+2，在接缝立面上采样 alpha。"""
    b = Board(1800, 900, ox=520, oy=520, sc=1.0)
    for u0, n in ((0, 6), (6, 2), (8, 2), (10, 6)):
        b.place('city_wall_u%d' % n, u0, 0)
    b.place('city_wall_corner', 16, 0)
    b.place('city_wall_v6', 16, -6)
    b.place('city_wall_v2', 16, -8)
    px = b.im.load()
    holes = total = 0
    probes = [('u', 6, 0.2, 1.8), ('u', 8, 0.2, 1.8), ('u', 10, 0.2, 1.8),
              ('u', 16, 0.2, 1.0), ('v', 18, -5.8, -0.2)]
    for axis, U, V0, V1 in probes:
        for k in range(24):
            v = V0 + (V1 - V0) * k / 23.0
            for dd in (-0.35, 0.0, 0.35):
                a = U + dd if axis == 'u' else U
                vv = v if axis == 'u' else v
                if axis == 'v':
                    x, y = b.P(a, vv + dd, 120)
                else:
                    x, y = b.P(a, vv, 120)
                total += 1
                xi, yi = int(x), int(y)
                if not (0 <= xi < b.im.width and 0 <= yi < b.im.height) or px[xi, yi][3] < 200:
                    holes += 1
    return holes, total


def sheet_compare():
    holes, total = seam_check()
    W, H = 1680, 1300
    im = Image.new('RGBA', (W, H), (245, 242, 233, 255))
    d = ImageDraw.Draw(im)
    f0, f1, f2, f3 = font(30, True), font(14), font(12), font(18, True)
    d.text((34, 20), '城墙系统 · 直段 / 角台 / 城门楼（第一批）', font=f0, fill=(32, 29, 26))
    d.text((36, 62), '2:1 等距 · 64×32 格 · 锚点＝足迹前底顶点 p(umax,vmax) · 与 4×4 屋身同一套标高与落地规则',
           font=f1, fill=(120, 112, 100))

    b = Board(W, H, ox=0, oy=0, sc=1.0)
    b.im = im                                # 直接画在整张对照图上
    PW, AY, TOP = 405, 668, 108
    for i, (name, title, w, hh, chpos, ticks) in enumerate(PANELS):
        x0 = 22 + i * 412
        spr, meta = mod(name)
        apx = meta['anchor_px']
        # 足迹菱形左右跨 [ax-32w, ax+32h]；精灵左右跨 [ax-apx, ax+(sw-apx)]，取并集居中
        le = max(apx[0], 32 * w)
        re = max(spr.width - apx[0], 32 * hh)
        ax = x0 + int(round((PW - (le + re)) / 2.0 + le))
        d.line([(x0 + PW - 3, TOP - 4), (x0 + PW - 3, AY + 96)], fill=(224, 218, 207), width=1)
        b.ox, b.oy = ax - (w - hh) * 32.0, AY - (w + hh) * 16.0
        b.diamond(0, 0, w, hh)
        b.place(name, 0, 0)
        b.person(chpos[0], chpos[1], 84)
        # 标高引线（贴精灵左缘）
        tx = b.P(0, hh)[0] - 8
        for z, lab in ticks:
            yy = b.P(0, hh, z)[1]
            d.line([(tx - 14, yy), (tx + 1, yy)], fill=(160, 150, 136), width=1)
            d.ellipse([tx - 2, yy - 2, tx + 2, yy + 2], fill=(120, 110, 98))
            d.text((tx - 17, yy), lab, font=f2, fill=(108, 100, 90), anchor='rm')
        d.text((x0 + 18, TOP), title, font=f3, fill=(30, 27, 24))
        d.text((x0 + 18, TOP + 26), '%s · %d×%d · 精灵 %d×%d'
               % (name, w, hh, meta['sprite_size'][0], meta['sprite_size'][1]),
               font=f2, fill=(126, 118, 106))
        for k, line in enumerate(CAPS[i]):
            d.text((x0 + 18, AY + 84 + k * 18), line, font=f2, fill=(96, 88, 78))

    # —— 拼接自检（直段 6+2+2+6 = 16 格 + 角台 + v 向 6+2）
    d.rectangle([0, 800, W, H], fill=(232, 228, 217))
    d.line([(0, 800), (W, 800)], fill=(193, 186, 172), width=2)
    d.text((34, 812), '拼接自检 · 直段接缝 + 转角（0.62×）', font=f3, fill=(30, 27, 24))
    b2 = Board(W, H, ox=230, oy=1010, sc=0.62)
    b2.im = im
    for u0, n in ((0, 6), (6, 2), (8, 2), (10, 6)):
        b2.place('city_wall_u%d' % n, u0, 0)
    b2.place('city_wall_corner', 16, 0)
    b2.place('city_wall_v6', 16, -6)
    b2.place('city_wall_v2', 16, -8)
    b2.person(3.4, 3.3, 84)
    for U in (6, 8, 10):
        d.line([b2.P(U, 2, 0), b2.P(U, 2, 150)], fill=(196, 70, 58), width=2)
    d.text((34, 1228), '红线 = 直段接缝（6+2、2+2、2+6）', font=f2, fill=(196, 70, 58))
    d.text((34, 1248), '3 处直段接缝 + 1 处转角接缝：立面采样 %d 点，alpha<200 的像素 = %d'
           % (total, holes), font=f2, fill=(96, 88, 78))
    d.text((34, 1268), '锚点步距 Δx=32n / Δy=16n 恒为整数 → 端点零误差；垛口两端各留 0.17 格 → 接缝处缺口宽 = 一个正常缺口',
           font=f2, fill=(96, 88, 78))

    # —— 闭环自检
    ring = [('city_wall_corner', 0, 0), ('city_wall_corner', 20, 0),
            ('city_wall_u6', 2, 0), ('city_wall_u6', 8, 0), ('city_wall_u6', 14, 0),
            ('city_wall_v6', 0, 2), ('city_wall_v2', 0, 8), ('city_wall_v2', 0, 10),
            ('city_wall_v6', 20, 2), ('city_wall_v2', 20, 8), ('city_wall_v2', 20, 10),
            ('city_wall_u6', 2, 12), ('city_wall_u6', 12, 12), ('city_wall_u2', 18, 12)]
    b3 = Board(W, H, ox=1080, oy=940, sc=0.42)
    b3.im = im
    b3.diamond(0, 0, 22, 14, fill=(216, 209, 189, 255), edge=(178, 170, 152, 255))
    for name, u0, v0 in ring:
        b3.place(name, u0, v0)
    b3.place('city_gate_tower', 8, 11)
    for name, u0, v0 in (('city_wall_corner', 0, 12), ('city_wall_corner', 20, 12)):
        b3.place(name, u0, v0)
    b3.person(10.0, 14.7, 84)
    d.text((880, 812), '闭环自检 · 22×14 城圈（0.42×）', font=f3, fill=(30, 27, 24))
    d.text((880, 1210), '远 18 + 近 18（6+门楼 4+8）+ 侧 10+10 = 56 格，4 角台闭合',
           font=f2, fill=(96, 88, 78))
    d.text((880, 1230), '门楼 4×3：跨墙 2 格、向内 1 格；券门洞口与墙段缺口 1:1 对准', font=f2,
           fill=(96, 88, 78))
    d.text((880, 1250), '人 84px（0.42× → 35px）：用于读城圈尺度', font=f2, fill=(96, 88, 78))

    out = os.path.join(PRE, 'city_wall_compare.png')
    im.convert('RGB').save(out)
    print('->', out, im.size, 'seams holes=%d/%d' % (holes, total))
    return im


def bake(cv, name, note, fp, extra=None, clip_x=None):
    """裁 bbox + 2px，按足迹前底顶点换算 anchor_px，写 PNG + JSON。
    clip_x：长度方向裁回名义范围（去掉出血与端面描边）→ 拼接处不会出现黑竖线。"""
    bb = cv.getbbox()
    x0, y0 = max(0, bb[0] - 2), max(0, bb[1] - 2)
    x1, y1 = min(cv.width, bb[2] + 2), min(cv.height, bb[3] + 2)
    if clip_x:
        x0 = max(x0, int(round(clip_x[0])))
        x1 = min(x1, int(round(clip_x[1])))
    cut = cv.crop((x0, y0, x1, y1))
    ax, ay = S(U0 + fp[0], V0 + fp[1], 0)
    apx = [int(round(ax - x0)), int(round(ay - y0))]
    cut.save(os.path.join(MOD, name + '.png'))
    bbx = cut.getbbox()
    meta = {
        'name': name, 'facing': 'SW',
        'footprint': [fp[0], fp[1]], 'footprint_w': fp[0], 'footprint_h': fp[1],
        'anchor': [0.5, 1.0], 'anchor_cell': [fp[0], fp[1]], 'anchor_px': apx,
        'anchor_note': '足迹前底顶点 p(umax,vmax)；与 4×4 屋身同一约定，落地即对齐',
        'tile': [64, 32],
        'sprite_size': [cut.width, cut.height],
        'sprite_h_px': int(bbx[3] - bbx[1]),
        'ratio_to_char': round((bbx[3] - bbx[1]) / 84.0, 2),
        'margins_px': [int(bbx[0]), int(bbx[1]), int(cut.width - bbx[2]), int(cut.height - bbx[3])],
        'source': note, 'outline_px': 2.4,
        'outline_rule': '可见外沿描边；沿长度方向的两端面不描边，拼接后不与邻居墙体混色（仅留结构分缝）',
        'mirror_derived': False, 'derive_op': 'draw(real_geometry)', 'derived_from': None,
    }
    if extra:
        meta.update(extra)
    with open(os.path.join(MOD, name + '.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
    print('%-22s %3dx%-3d h=%3d fp=%dx%d anchor=%s'
          % (name, cut.width, cut.height, meta['sprite_h_px'], fp[0], fp[1], apx))
    return cut


def wall_clip_x(axis, n, th=TH_W):
    """长度方向的名义 x 范围（不含出血/端面描边）：直段的端面正好落在足迹菱形的左右极值。"""
    if axis == 'u':
        return (OX + (U0 - (V0 + th)) * 32.0, OX + (U0 + n - V0) * 32.0)
    return (OX + (U0 - (V0 + n)) * 32.0, OX + (U0 + th - V0) * 32.0)


def run_walls():
    for n, axis in ((6, 'u'), (2, 'u'), (6, 'v'), (2, 'v')):
        fp = [n, TH_W] if axis == 'u' else [TH_W, n]
        nm = 'city_wall_%s%d' % (axis, n)
        cv = build_wall(n, axis)
        bake(cv, nm,
             '城墙直段 %d×%d（%s 向，厚 2 格）：条石基座 z0-34 + 砖墙身 34-192 + 压顶石带 192-200'
             '（马道面）+ 两侧垛口 200-224；垛口周期 1 格，任意整数长度可拼接'
             % (fp[0], fp[1], 'u' if axis == 'u' else 'v'),
             fp, {'run_axis': axis, 'segment_cells': n, 'thickness_cells': TH_W,
                  'tileable': True, 'tile_period_cells': 1,
                  'elevation': {'base_z': BASE, 'wall_top_z': WALL_TOP,
                                'eave_z': WALL_TOP, 'parapet_z': PARA_H,
                                'ridge_z': PARA_H},
                  'elevation_note': '马道 z=200（比民居檐口 170 高 30、低于脊 210）；垛口顶 z=224（高出民居脊 14）',
                  'parts': ['stone_base', 'brick_body', 'coping', 'walkway', 'merlons_far', 'merlons_near'],
                  'stack_order': ['base', 'body', 'coping', 'walkway', 'merlon_far', 'merlon_near'],
                  'seams': {'planes': ['u' if axis == 'u' else 'v'],
                            'note': '长度方向两端按整格对齐、无出挑；垛口两端各留 0.17 格，接缝两侧合计 0.34 = 一个垛口缺口宽'}},
             clip_x=wall_clip_x(axis, n))
    bake(build_corner(), 'city_wall_corner',
         '城墙转角角台 2×2：台体顶 z=200（与直段共线）、四面连续女墙顶 z=232、近棱隅石交替石材；四面同构，四方位通用',
         [TH_W, TH_W], {'tileable': False, 'corner_for': ['city_wall_u*', 'city_wall_v*'],
                        'elevation': {'base_z': BASE, 'wall_top_z': COR_TOP, 'eave_z': COR_TOP,
                                      'parapet_z': COR_PARA, 'ridge_z': COR_PARA},
                        'elevation_note': '台体顶与直段同为 200（压顶石带连续，接缝处无台阶）；'
                                          '女墙 232 比直段垛口 224 高 8px：俯视把四角读成墩台',
                        'parts': ['stone_base', 'brick_body', 'coping', 'parapet_ring', 'corner_quoins'],
                        'stack_order': ['base', 'body', 'coping', 'parapet_far', 'parapet_left',
                                        'parapet_right', 'parapet_near', 'corner_stones', 'quoins'],
                        'orientation_free': True,
                        'orientation_note': '女墙四面闭合且四角对称，故不产出 ne/nw/se 朝向件；'
                                            '世界旋转后仅光照随引擎既有规则处理'},
         clip_x=(OX + (U0 - (V0 + TH_W)) * 32.0, OX + (U0 + TH_W - V0) * 32.0))


def run_gate():
    bake(build_gate(), 'city_gate_tower',
         '城门楼 4×3：条石基座 0-30 + 城台（墩台）30-238 + 券门洞（贯通，半宽 0.92 格、券脚 z=74、顶 z=104）+ '
         '台面女墙 238-256 + 城楼下层 238-300（重檐第一层腰檐）+ 城楼上层 332-366 + 上层两坡顶 366-406',
         [GATE_W, GATE_D],
         {'tileable': False, 'attach': {'axis': 'u', 'span_cells': GATE_W,
                                        'straddle_cells': [-1, 2],
                                        'note': '塔足迹跨墙：城台 1 格压在墙身上、2 格向城外挑出；'
                                                '摆位时塔 v 前后沿 = 墙体外沿 +2 格，两侧墙段直接贴塔基'},
          'elevation': {'base_z': 0, 'podium_top_z': GP_TOP, 'parapet_z': GP_PARAPET,
                        'eave_z': G1_EAVE, 'ridge_z': G2_RIDGE,
                        'eave2_z': G2_EAVE, 'ridge1_z': G1_TOP},
          'elevation_note': '城台顶 238（高出城墙垛口 14）；下层檐口 300 / 腰檐脊 332；上层檐口 366 / 正脊 406'
                            '（全城最高，约为民居脊 210 的 1.93 倍）',
          'arch': {'half_width_cells': 0.92, 'spring_z': 74, 'top_z': 104, 'passable': True,
                   'clear_width_px': 59, 'clear_height_px': 104},
          'parts': ['stone_base', 'podium', 'coping', 'arch', 'plaque', 'podium_parapet',
                    'lower_storey', 'lower_eave', 'upper_storey', 'upper_roof', 'ridge'],
          'stack_order': ['base', 'podium', 'coping', 'arch', 'plaque', 'lower_storey',
                          'lower_eave', 'upper_storey', 'upper_roof', 'parapet_side',
                          'parapet_front'],
          'end_faces': {'u=u0': 'bleed 0.12 → 裁回（端头不描边）',
                        'u=u1': 'bleed 0.12 → 裁回（端头不描边）'},
          'seams': {'planes': ['u'],
                    'note': '城台/基座/压顶沿 u 出血 0.12 格后裁回名义范围：与直墙拼接处无描边竖线，'
                            '只剩结构分缝；进深方向（v）仍保留完整轮廓'},
          'detail_tiers': 4},
         clip_x=(OX + (U0 - (V0 + GATE_D)) * 32.0, OX + (U0 + GATE_W - V0) * 32.0))


# ---------------------------------------------------------------- 预览：混合街区
def _fp(name):
    _, meta = mod(name)
    return (meta.get('footprint_w') or meta.get('footprint', [1, 1])[0],
            meta.get('footprint_h') or meta.get('footprint', [1, 1])[1])


def gate_end_stats():
    """门楼—直墙接缝的数值校验：沿接缝竖线扫描，统计「比左右邻居都暗」的像素最长连续段。"""
    b = Board(1400, 820, ox=380, oy=520, sc=1.0)
    seq = (('city_wall_u6', 0, 0), ('city_gate_tower', 6, -1), ('city_wall_u6', 10, 0))
    for nm, u0, v0 in seq:
        b.place(nm, u0, v0)
    px = b.im.load()
    best = 0
    for U in (6, 10):
        run = 0
        for y in range(int(b.P(0, 2, 224)[1]), int(b.P(0, 2, 0)[1])):
            xc = int(round(b.P(U, 2)[0]))
            cols = []
            for dx in (-5, -3, 0, 3, 5):
                xx = xc + dx
                if 0 <= xx < b.im.width and 0 <= y < b.im.height:
                    r, g, bl, a = px[xx, y]
                    cols.append(999 if a < 120 else (r + g + bl) / 3.0)
                else:
                    cols.append(999)
            c = cols[2]
            if c < 80 and c < cols[1] - 22 and c < cols[3] - 22:
                run += 1
                best = max(best, run)
            else:
                run = 0
    return best


def sheet_gate_ends():
    """「墙—门楼—墙」连续拼接验证图。"""
    sc = 1.9
    b = Board(2200, 1400, ox=1180, oy=1000, sc=sc)
    b.diamond(-1.0, -1.4, 13.0, 5.2, fill=(219, 211, 194), edge=(203, 195, 178), width=2)
    for nm, u0, v0 in (('city_wall_u6', 0, 0), ('city_gate_tower', 6, -1),
                       ('city_wall_u6', 10, 0)):
        b.contact_shadow(u0, v0, 6 if nm.endswith('u6') else 4,
                         2 if nm.endswith('u6') else 3, alpha=130, blur=5.0 * sc)
        b.place(nm, u0, v0)
    b.person(5.0, 3.0, 84)
    b.person(11.8, 3.2, 84, dx=2)
    bb = b.im.getbbox()
    cut = b.im.crop((max(0, bb[0] - 40), max(0, bb[1] - 40),
                     min(b.im.width, bb[2] + 40), min(b.im.height, bb[3] + 40)))
    W = max(cut.width + 96, 1100)
    H = cut.height + 96 + 126
    cv = Image.new('RGBA', (W, H), (226, 219, 199, 255))
    cv.alpha_composite(cut, ((W - cut.width) // 2, 96))
    d = ImageDraw.Draw(cv)
    run = gate_end_stats()
    d.text((44, 26), '南门楼端头 · 墙—门楼—墙 连续拼接（6 + 4 + 6 格）',
           font=font(30, True), fill=(32, 28, 24))
    d.text((44, 70), '门楼城台/基座/压顶沿长度方向出血 0.12 格后裁回名义范围：端头竖棱与描边一起被裁掉，'
                    '接缝只剩同色面与结构分缝；进深方向仍保留轮廓',
           font=font(19), fill=(104, 96, 86))
    d.line([(44, 88), (W - 44, 88)], fill=(206, 198, 182), width=2)
    d.text((44, H - 26), '接缝列扫描：深色竖线最长连续段 = %d px（判据：该列比左右各 3–5px 的邻居都暗 22+）'
           % run, font=font(16), fill=(96, 88, 78))
    out = os.path.join(PRE, 'city_gate_ends.png')
    cv.convert('RGB').save(out)
    print('->', out, cv.size, 'seam dark run=%d' % run)
    return cv


def sheet_run12():
    """12 格连续城墙拼接验证：6+2+2+2，四种接缝位置各至少一次；用来确认接缝处没有黑竖线。"""
    sc = 2.2
    b = Board(2400, 1500, ox=1500, oy=1080, sc=sc)
    b.diamond(-1.5, -1.0, 16.0, 8.0, fill=(219, 211, 194), edge=(203, 195, 178), width=2)
    for nm, u0, v0 in (('city_wall_u6', 0, 0), ('city_wall_u2', 6, 0),
                       ('city_wall_u2', 8, 0), ('city_wall_u2', 10, 0)):
        b.contact_shadow(u0, v0, 6 if nm.endswith('u6') else 2, 2, alpha=130, blur=5.0 * sc)
        b.place(nm, u0, v0)
    b.person(8.6, 2.2, 84)
    b.person(3.4, 2.4, 84, dx=-3)
    bb = b.im.getbbox()
    pad = 40
    cut = b.im.crop((max(0, bb[0] - pad), max(0, bb[1] - pad),
                     min(b.im.width, bb[2] + pad), min(b.im.height, bb[3] + pad)))
    W = max(cut.width + 96, 1000)
    H = cut.height + 96 + 108
    cv = Image.new('RGBA', (W, H), (226, 219, 199, 255))
    cv.alpha_composite(cut, ((W - cut.width) // 2, 96))
    d = ImageDraw.Draw(cv)
    d.text((44, 26), '城墙 · 12 格连续拼接（6 + 2 + 2 + 2）· 接缝处无黑竖线',
           font=font(30, True), fill=(32, 28, 24))
    d.text((44, 70), '长度方向两端不描边：出血 0.12 格后裁回名义范围，接缝只留 0.34 格结构缝（= 一个垛口缺口宽）',
           font=font(19), fill=(104, 96, 86))
    d.line([(44, 88), (W - 44, 88)], fill=(206, 198, 182), width=2)
    out = os.path.join(PRE, 'city_wall_run12.png')
    cv.convert('RGB').save(out)
    print('->', out, cv.size)
    return cv


def sheet_street():
    """城门外街实景：城墙在远端闭合，街道与建筑在近端，大小中三档同框。"""
    W, H, BX, BY = 1500, 1080, 560, 460
    im = Image.new('RGBA', (W, H), (226, 219, 199, 255))
    d = ImageDraw.Draw(im)
    b = Board(W, H, ox=BX, oy=BY, sc=1.0)
    b.im = im
    # 地面：夯土场铺底（1 格密铺，贴片是斑块型，需重叠才连续），再压 8 格宽石板街
    for u in range(-2, 20):
        for v in range(2, 20):
            b.place('ground_dirt', u, v)
    for u in range(6, 14, 2):
        for v in range(2, 16, 2):
            b.place('ground_stone', u, v)
    # 第一组：城墙（远端，先画）——两臂 6+2 夹门楼，两端角台收口
    for nm, u0, v0 in (('city_wall_corner', -2, 0), ('city_wall_u6', 0, 0),
                       ('city_wall_u2', 6, 0), ('city_gate_tower', 8, -1),
                       ('city_wall_u6', 12, 0), ('city_wall_u2', 18, 0),
                       ('city_wall_corner', 20, 0)):
        b.place(nm, u0, v0)
    # 第二组：街两侧建筑 + 道具，按足迹前底点 (u+w)+(v+h) 由远及近
    items = [('shop_tavern_sw', 1, 3), ('shop_pharmacy_sw', 1, 8),
             ('house_4x4_sw_lattice', 1, 12),
             ('shop_weapon_sw', 14, 3), ('shop_pawnshop_sw', 13, 8),
             ('house_4x4_ne', 13, 12),
             ('stall', 6, 9), ('fence', 4, 2), ('lantern_post', 5, 5),
             ('lantern_post', 13, 5), ('tree_pine', 0, 3), ('tree_leaf', 18, 3)]
    items.sort(key=lambda t: t[1] + _fp(t[0])[0] + t[2] + _fp(t[0])[1])
    for nm, u0, v0 in items:
        fw, fh = _fp(nm)
        b.contact_shadow(u0, v0, fw, fh)
        b.place(nm, u0, v0)
    # 84px 角色：门洞下 / 街心 / 街尾
    b.person(9.8, 4.2, 84)
    b.person(9.0, 9.6, 84)
    b.person(12.4, 11.6, 84)

    # 图例
    f0, f1, f2 = font(26, True), font(14), font(13)
    d.rectangle([24, 18, 742, 168], fill=(252, 250, 242, 235), outline=(206, 198, 182))
    d.text((40, 28), '混合街区 · 城门外街（大小中三档同框）', font=f0, fill=(34, 30, 26))
    d.text((40, 66), '大  城门楼 4×3 · 精灵 507px；两侧城墙 6×2 · 359px（远端闭合）',
           font=f1, fill=(92, 84, 74))
    d.text((40, 90), '中  酒楼 5×4 · 420px ／ 武器铺 6×3 · 364px ／ 药店 4×4 · 318px ／ 当铺 3×4 · 291px',
           font=f1, fill=(92, 84, 74))
    d.text((40, 114), '小  摊棚 2×2 · 178px ／ 灯柱 171px ／ 围栏 89px',
           font=f1, fill=(92, 84, 74))
    d.text((40, 138), '人  84px（xiake idle_0）＝ 1 格宽 —— 全图唯一尺度基准',
           font=f1, fill=(92, 84, 74))
    d.text((760, 1030), '锚点＝足迹前底顶点 p(umax,vmax)；墙 6+2 段直接贴门楼城台，两端角台收口',
           font=f2, fill=(120, 112, 100))

    out = os.path.join(PRE, 'city_mixed_street.png')
    im.convert('RGB').save(out)
    print('->', out, im.size)
    return im


if __name__ == '__main__':
    run_walls()
    run_gate()
    sheet_compare()
    sheet_run12()
    sheet_gate_ends()
    sheet_street()



