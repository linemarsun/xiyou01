# -*- coding: utf-8 -*-
"""宫城素材族（参考国风都城构图：金顶大殿 + 汉白玉台基 + 红墙宫城 + 白塔）。

    palace_hall       6×6 主殿：三层汉白玉台基（烘焙进贴图，前出三阶踏道）
                      + 朱红殿身 + 金色三重檐（腰檐 + 两坡顶），正脊 ~500。
    palace_hall_s     4×4 配殿：单层红身 + 金色两坡顶 + 一层台基。
    palace_gate       4×2 宫门：红墙 + 券门隧洞（亮色）+ 门楼金顶，券洞贯通。
    palace_corner     2×2 角楼：红墙墩台 + 攒尖金顶。
    palace_wall_u6    6×2 宫墙直段（u 向）：朱红墙身 + 黄瓦墙帽。
    palace_wall_v6    2×6 宫墙直段（v 向）。
    pagoda            3×3 白塔：汉白玉塔身五层挑檐 + 攒尖金顶，总高 ~700（全城制高点）。
    ground_marble     1×1 汉白玉广场地面砖（128×64 = 2×2 菱形格）。

复用 citybuild 全部原语；金色屋面为本地实现（_gold_slope/_gold_ridge，
shopbuild 的 ROOF_C 是靛青瓦，瓦垄色是硬编码的青灰，不能直接换调色板）。
"""
import math
import os

import citybuild as cb
from citybuild import Image, ImageDraw, poly, mix

OUT = r'D:\workspace\game\xiyou01\shanhai\public\assets\art\iso'
cb.MOD = OUT

# ---- 调色 ----
MARBLE = (224, 218, 202)
MARBLE_L = (242, 238, 227)
MARBLE_D = (183, 175, 157)
MARBLE_E = (150, 142, 126)
RED_P = (172, 58, 44)                 # 宫墙红（比城门朱红略亮）
RED_P_D = (106, 34, 26)
RED_P_L = (210, 106, 80)
CAP_GOLD = (198, 152, 62)             # 黄瓦墙帽
CAP_GOLD_D = (150, 110, 38)
# 金色屋面：受光四档 / 背光四档（对应 shopbuild.ROOF_C / BACK_C 的四档明度）
GOLD_ROOF_LIT = [(168, 116, 28), (204, 152, 48), (230, 190, 92), (246, 220, 142)]
GOLD_ROOF_BACK = [(118, 78, 18), (146, 100, 28), (176, 126, 44), (200, 154, 66)]


def _canvas(w, h, ox, oy):
    cb.CW, cb.CH, cb.OX, cb.OY = w, h, ox, oy
    cb.SB.OX, cb.SB.OY = ox, oy


# ---------------------------------------------------------------- 金色屋面

def _gold_slope(d, o, u, v, lit):
    """一片金瓦坡：面 + 瓦垄 + 檐口板（画法同 shopbuild.roof_slope，配色换金）。"""
    C = GOLD_ROOF_LIT if lit else GOLD_ROOF_BACK
    cb.SB.grad(d, o, u, v, C[1], C[3], 12)
    n = max(4, int(round(math.hypot(u[0], u[1]) / 8.0)))
    for i in range(1, n):
        t = i / n
        a = (o[0] + u[0] * t, o[1] + u[1] * t)
        b = (a[0] + v[0], a[1] + v[1])
        col = (232, 190, 96, 255) if lit else (120, 84, 24, 255)
        d.line([a, b], fill=col, width=2 if lit else 1)
        d.line([(a[0] + 1, a[1]), (b[0] + 1, b[1])],
               fill=(248, 224, 152, 160) if lit else (96, 66, 18, 120), width=1)
    d.line([o, (o[0] + u[0], o[1] + u[1])], fill=(96, 62, 14, 210), width=2)
    e0 = (o[0] + v[0], o[1] + v[1])
    e1 = (e0[0] + u[0], e0[1] + u[1])
    if lit:
        cb.SB.quad(d, e0, u, cb.ez(7), (140, 96, 24, 255))
        d.line([(e0[0], e0[1] + 7), (e1[0], e1[1] + 7)], fill=(84, 56, 12, 255), width=2)


def _gold_ridge(d, p0, p1, z):
    """金色正脊（画法同 shopbuild.ridge，配色换金 + 两端鸱吻）。"""
    a = (cb.OX + (p0[0] - p0[1]) * 32.0, cb.OY + (p0[0] + p0[1]) * 16.0 - z)
    b = (cb.OX + (p1[0] - p1[1]) * 32.0, cb.OY + (p1[0] + p1[1]) * 16.0 - z)
    top, mid, bot = 7, -1, 9
    d.polygon([(a[0], a[1] - top), (b[0], b[1] - top), (b[0], b[1] - mid), (a[0], a[1] - mid)],
              fill=(238, 200, 108, 255))
    d.polygon([(a[0], a[1] - mid), (b[0], b[1] - mid), (b[0], b[1] + bot), (a[0], a[1] + bot)],
              fill=(132, 90, 22, 255))
    d.line([(a[0], a[1] - top), (b[0], b[1] - top)], fill=(252, 236, 180, 255), width=2)
    d.line([(a[0], a[1] + bot), (b[0], b[1] + bot)], fill=(70, 46, 10, 210), width=2)
    for px, sgn in ((a, -1), (b, 1)):
        # 鸱吻：脊端向上翘的钩形饰
        d.polygon([(px[0], px[1] - top), (px[0] + 7 * sgn, px[1] - top - 9),
                   (px[0] + 9 * sgn, px[1] - top - 2), (px[0] + 6 * sgn, px[1] + bot + 1),
                   (px[0], px[1] + bot)], fill=(206, 156, 52, 255))


def _gold_pyramid(d, u0, u1, v0, v1, eave, apex, ov=0.14):
    """攒尖金顶（角楼/塔顶）：四片坡向最高点收拢 + 宝顶。"""
    a0, a1, b0, b1 = u0 - ov, u1 + ov, v0 - ov, v1 + ov
    c = cb.S((u0 + u1) / 2.0, (v0 + v1) / 2.0, apex)
    # 前坡（v1，受光）与右坡（u1，背光）覆盖可见两面；后两面被遮但补全几何
    for pts, lit in (
        ([cb.S(a0, b1, eave), cb.S(a1, b1, eave), c], True),    # 前坡
        ([cb.S(a1, b0, eave), cb.S(a1, b1, eave), c], False),   # 右坡
        ([cb.S(a0, b0, eave), cb.S(a1, b0, eave), c], False),   # 后坡
        ([cb.S(a0, b0, eave), cb.S(a0, b1, eave), c], True),    # 左坡
    ):
        C = GOLD_ROOF_LIT if lit else GOLD_ROOF_BACK
        d.polygon(pts, fill=mix(C[1], C[3], 0.4))
    # 瓦垄：从檐角向顶点
    for P in (cb.S(a0, b1, eave), cb.S(a1, b1, eave), cb.S(a1, b0, eave), cb.S(a0, b0, eave)):
        for k in range(1, 6):
            t = k / 6.0
            d.line([(P[0] + (c[0] - P[0]) * t, P[1] + (c[1] - P[1]) * t),
                    (P[0] + (c[0] - P[0]) * (t + 0.09), P[1] + (c[1] - P[1]) * (t + 0.09))],
                   fill=(120, 84, 24, 160), width=1)
    # 檐口
    for p0, p1 in ((cb.S(a0, b1, eave), cb.S(a1, b1, eave)), (cb.S(a1, b0, eave), cb.S(a1, b1, eave))):
        d.line([p0, p1], fill=(84, 56, 12, 255), width=2)
    # 宝顶：金杆 + 宝珠
    d.line([c, (c[0], c[1] - 26)], fill=cb.GOLD, width=4)
    d.ellipse([c[0] - 7, c[1] - 40, c[0] + 7, c[1] - 26], fill=cb.GOLD_L,
              outline=(96, 62, 14), width=2)



def _roof_cap(d, u0, u1, v0, v1, z, col=(58, 26, 20)):
    """墙顶压盖（shopbuild.roof 同款）：盖住殿身顶面，防止坡面下露出亮色顶。"""
    cb.quad(d, cb.S(u0 - 0.05, v0 - 0.05, z), cb.eu(u1 - u0 + 0.1),
            cb.ev(v1 - v0 + 0.1), col)


# ---------------------------------------------------------------- 通用件

def _marble_tier(d, u0, u1, v0, v1, z0, z1):
    """汉白玉台基一层：须弥座 + 砖缝。"""
    cb.iso_box(d, u0, u1, v0, v1, z0, z1, MARBLE, MARBLE_D, MARBLE_L)
    cb.brick_v(d, u0, u1, v1, z0 + 3, z1 - 2, MARBLE, ch=7.0, cw=0.9, seed=2)
    cb.brick_u(d, u1, v0, v1, z0 + 3, z1 - 2, MARBLE_D, ch=7.0, cw=0.9, seed=2)
    d.line([cb.S(u0, v1, z1), cb.S(u1, v1, z1)], fill=MARBLE_E, width=2)


def _steps(d, uc, vf, z_top, n=4, half=0.9, out=1.1):
    """正面踏道：n 级条石台阶，从台基顶 (vf, z_top) 落到地面前方 out 格。"""
    for k in range(n):
        zA = z_top * (n - k) / n
        zB = z_top * (n - k - 1) / n
        vA = vf + out * k / n
        vB = vf + out * (k + 1) / n
        poly(d, [cb.S(uc - half, vA, zA), cb.S(uc + half, vA, zA),
                 cb.S(uc + half, vA, zB + 1), cb.S(uc - half, vA, zB + 1)],
             MARBLE_L if k % 2 == 0 else MARBLE)
        poly(d, [cb.S(uc - half, vA, zB + 1), cb.S(uc + half, vA, zB + 1),
                 cb.S(uc + half, vB, zB + 1), cb.S(uc - half, vB, zB + 1)], MARBLE_D)
        d.line([cb.S(uc - half, vA, zA), cb.S(uc + half, vA, zA)], fill=MARBLE_E, width=1)


def _red_body(d, u0, u1, v0, v1, z0, z1, bays=6, lit_shift=0.0):
    """殿身：朱红墙体 + 立柱 + 直棂窗（前脸 v1）。"""
    face = mix(RED_P, (255, 255, 255), lit_shift)
    cb.iso_box(d, u0, u1, v0, v1, z0, z1, face, mix(RED_P_D, (255, 255, 255), lit_shift),
               mix(RED_P_L, (255, 255, 255), lit_shift))
    # 前脸立柱
    for i in range(bays + 1):
        uu = u0 + (u1 - u0) * i / bays
        w0 = 0.09
        poly(d, [cb.S(uu - w0, v1, z0), cb.S(uu + w0, v1, z0),
                 cb.S(uu + w0, v1, z1), cb.S(uu - w0, v1, z1)], mix(RED_P_D, (0, 0, 0), 0.12))
        d.line([cb.S(uu + w0, v1, z0), cb.S(uu + w0, v1, z1)], fill=RED_P_L, width=1)
    # 前脸槅扇窗（每开间一扇）
    for i in range(bays):
        a = u0 + (u1 - u0) * (i + 0.16) / bays
        b = u0 + (u1 - u0) * (i + 0.84) / bays
        za, zb = z0 + (z1 - z0) * 0.30, z1 - (z1 - z0) * 0.10
        poly(d, [cb.S(a, v1, za), cb.S(b, v1, za), cb.S(b, v1, zb), cb.S(a, v1, zb)],
             (247, 240, 221))
        d.line([cb.S(a, v1, za), cb.S(b, v1, za), cb.S(b, v1, zb), cb.S(a, v1, zb),
                cb.S(a, v1, za)], fill=cb.WOOD, width=2)
        for k in range(1, 5):
            uu = a + (b - a) * k / 5.0
            d.line([cb.S(uu, v1, za), cb.S(uu, v1, zb)],
                   fill=mix(cb.WOOD, cb.CREAM, 0.25), width=1)


def _railing(d, u0, u1, v0, v1, z):
    """台基望柱栏杆：沿前沿与右侧一排小白柱 + 望柱头。"""
    for uu in [u0 + i * 0.55 for i in range(int((u1 - u0) / 0.55) + 1)]:
        p0, p1 = cb.S(uu, v1 - 0.16, z), cb.S(uu, v1 - 0.16, z + 9)
        d.line([p0, p1], fill=MARBLE_L, width=3)
        d.ellipse([p1[0] - 2, p1[1] - 2, p1[0] + 2, p1[1] + 2], fill=MARBLE_L)
    d.line([cb.S(u0, v1 - 0.16, z + 5), cb.S(u1, v1 - 0.16, z + 5)], fill=MARBLE, width=2)
    for vv in [v0 + i * 0.55 for i in range(int((v1 - v0) / 0.55) + 1)]:
        p0, p1 = cb.S(u1 - 0.16, vv, z), cb.S(u1 - 0.16, vv, z + 9)
        d.line([p0, p1], fill=MARBLE, width=3)
    d.line([cb.S(u1 - 0.16, v0, z + 5), cb.S(u1 - 0.16, v1, z + 5)], fill=MARBLE_D, width=2)


# ---------------------------------------------------------------- 主殿 6×6

def build_hall():
    _canvas(1100, 980, 550, 620)
    cv = Image.new('RGBA', (cb.CW, cb.CH), (0, 0, 0, 0))
    d = ImageDraw.Draw(cv)
    u0, v0 = cb.U0, cb.V0
    u1, v1 = u0 + 6, v0 + 6
    uc = (u0 + u1) / 2.0
    # 三层汉白玉台基（外扩逐层收）：0-26 / 26-50 / 50-74
    _marble_tier(d, u0 - 0.85, u1 + 0.85, v0 - 0.85, v1 + 0.85, 0, 26)
    _marble_tier(d, u0 - 0.45, u1 + 0.45, v0 - 0.45, v1 + 0.45, 26, 50)
    _marble_tier(d, u0, u1, v0, v1, 50, 74)
    _railing(d, u0 - 0.45, u1 + 0.45, v0 - 0.45, v1 + 0.45, 50)
    _steps(d, uc, v1 + 0.85, 74, n=5, half=1.05, out=1.5)
    # 殿身下层（红墙金旗窗）74-262
    b1u0, b1u1, b1v0, b1v1 = u0 + 0.22, u1 - 0.22, v0 + 0.22, v1 - 0.22
    _red_body(d, b1u0, b1u1, b1v0, b1v1, 74, 262, bays=8)
    # 额枋金线 + 斗拱
    poly(d, [cb.S(b1u0, b1v1, 262), cb.S(b1u1, b1v1, 262), cb.S(b1u1, b1v1, 252),
             cb.S(b1u0, b1v1, 252)], RED_P_D)
    d.line([cb.S(b1u0, b1v1, 262), cb.S(b1u1, b1v1, 262)], fill=cb.GOLD, width=2)
    cb.bracket_row(d, b1u0 + 0.02, b1u1 - 0.02, b1v1, 252, 12, n=18)
    # 殿身上层（收进）300-386
    b2u0, b2u1, b2v0, b2v1 = u0 + 0.75, u1 - 0.75, v0 + 0.75, v1 - 0.75
    # 下层顶面压盖（腰檐内侧的顶面环带不许露出）
    _roof_cap(d, b1u0, b1u1, b1v0, b1v1, 262)
    # 腰檐（金）：前坡 + 右坡；上边收到上层殿身（b2）檐口，形成真正的向内上斜坡
    ov = 0.18
    cb.skirting(d, cb.S(b1u0 - ov, b1v1 + ov, 268), cb.S(b1u1 + ov, b1v1 + ov, 268),
                cb.S(b2u0 - 0.02, b2v1 + 0.02, 300), cb.S(b2u1 + 0.02, b2v1 + 0.02, 300),
                GOLD_ROOF_LIT[3], GOLD_ROOF_LIT[1])
    cb.skirting(d, cb.S(b1u1 + ov, b1v0 - ov, 268), cb.S(b1u1 + ov, b1v1 + ov, 268),
                cb.S(b2u1 + 0.02, b2v0 - 0.02, 300), cb.S(b2u1 + 0.02, b2v1 + 0.02, 300),
                GOLD_ROOF_BACK[1], GOLD_ROOF_BACK[0])
    _red_body(d, b2u0, b2u1, b2v0, b2v1, 300, 386, bays=6)
    poly(d, [cb.S(b2u0, b2v1, 386), cb.S(b2u1, b2v1, 386), cb.S(b2u1, b2v1, 377),
             cb.S(b2u0, b2v1, 377)], RED_P_D)
    d.line([cb.S(b2u0, b2v1, 386), cb.S(b2u1, b2v1, 386)], fill=cb.GOLD, width=2)
    cb.bracket_row(d, b2u0 + 0.02, b2u1 - 0.02, b2v1, 377, 11, n=14)
    # 顶部两坡金顶：正脊沿 u，用 shopbuild.droop（(-32n,16n+rise)，沿 ±v 下坡）；
    # 坡 far-edge 统一落到檐口线下 OVH px（挑檐），前坡 rise 需再扣 32*nf（+v 本身下降 16nf、
    # 且屏幕 y 还含 z 的 16nf 投影，见 shopbuild.roof 同款推导）。
    rv = (b2v0 + b2v1) / 2.0
    nf = (b2v1 + ov) - rv
    nb = rv - (b2v0 - ov)
    RIDGE = 496
    EAVE2 = 386
    OVH = 8
    RB = (RIDGE - EAVE2) + OVH
    RF = RB                     # 前坡远边 z = RIDGE - RF（Δz=Δv*16-Δy 推导，与背坡同深）
    _roof_cap(d, b2u0, b2u1, b2v0, b2v1, EAVE2)
    o = cb.S(b2u0 - ov, rv, RIDGE)
    uvec = cb.eu(b2u1 - b2u0 + 2 * ov)
    cb.SB.gable(d, b2u0 - ov, b2v0 - ov, b2v1 + ov, EAVE2, RIDGE, RED_P, False)   # 远端山墙
    _gold_slope(d, o, uvec, cb.SB.droop(-nb, RB), False)                          # 背坡
    _gold_slope(d, o, uvec, cb.SB.droop(nf, RF), True)                            # 受光前坡
    cb.SB.gable(d, b2u1 + ov, b2v0 - ov, b2v1 + ov, EAVE2, RIDGE, RED_P, True)    # 近端山墙
    _gold_ridge(d, (b2u0 - ov - 0.10, rv), (b2u1 + ov + 0.10, rv), RIDGE + 2)
    _gold_ridge(d, (b2u0 - ov - 0.10, rv), (b2u1 + ov + 0.10, rv), RIDGE + 2)
    return cb.POST.add_outline(cv, px=2.4, erode=1.2)


# ---------------------------------------------------------------- 配殿 4×4

def build_hall_s():
    _canvas(800, 760, 400, 470)
    cv = Image.new('RGBA', (cb.CW, cb.CH), (0, 0, 0, 0))
    d = ImageDraw.Draw(cv)
    u0, v0 = cb.U0, cb.V0
    u1, v1 = u0 + 4, v0 + 4
    uc = (u0 + u1) / 2.0
    _marble_tier(d, u0 - 0.45, u1 + 0.45, v0 - 0.45, v1 + 0.45, 0, 24)
    _marble_tier(d, u0, u1, v0, v1, 24, 44)
    _railing(d, u0 - 0.45, u1 + 0.45, v0 - 0.45, v1 + 0.45, 24)
    _steps(d, uc, v1 + 0.45, 44, n=3, half=0.75, out=0.9)
    _red_body(d, u0 + 0.20, u1 - 0.20, v0 + 0.20, v1 - 0.20, 44, 210, bays=5)
    poly(d, [cb.S(u0 + 0.2, v1 - 0.2, 210), cb.S(u1 - 0.2, v1 - 0.2, 210),
             cb.S(u1 - 0.2, v1 - 0.2, 201), cb.S(u0 + 0.2, v1 - 0.2, 201)], RED_P_D)
    cb.bracket_row(d, u0 + 0.22, u1 - 0.22, v1 - 0.2, 201, 10, n=12)
    ov = 0.16
    rv = (v0 + v1) / 2.0
    nf = (v1 - 0.2 + ov) - rv
    nb = rv - (v0 + 0.2 - ov)
    RIDGE = 316
    EAVE2 = 210
    OVH = 8
    RB = (RIDGE - EAVE2) + OVH
    RF = RB                     # 前坡远边 z = RIDGE - RF（Δz=Δv*16-Δy 推导，与背坡同深）
    _roof_cap(d, u0 + 0.2, u1 - 0.2, v0 + 0.2, v1 - 0.2, EAVE2)
    o = cb.S(u0 + 0.2 - ov, rv, RIDGE)
    uvec = cb.eu(u1 - u0 - 0.4 + 2 * ov)
    cb.SB.gable(d, u0 + 0.2 - ov, v0 + 0.2 - ov, v1 - 0.2 + ov, EAVE2, RIDGE, RED_P, False)
    _gold_slope(d, o, uvec, cb.SB.droop(-nb, RB), False)
    _gold_slope(d, o, uvec, cb.SB.droop(nf, RF), True)
    cb.SB.gable(d, u1 - 0.2 + ov, v0 + 0.2 - ov, v1 - 0.2 + ov, EAVE2, RIDGE, RED_P, True)
    _gold_ridge(d, (u0 + 0.2 - ov - 0.08, rv), (u1 - 0.2 + ov + 0.08, rv), RIDGE + 2)
    return cb.POST.add_outline(cv, px=2.2, erode=1.1)


# ---------------------------------------------------------------- 宫门 4×2

GATE_HALF = 0.92
GATE_SPRING = 62


def build_gate():
    _canvas(700, 620, 350, 380)
    cv = Image.new('RGBA', (cb.CW, cb.CH), (0, 0, 0, 0))
    d = ImageDraw.Draw(cv)
    u0, v0 = cb.U0, cb.V0
    u1, v1 = u0 + 4, v0 + 2
    uc = (u0 + u1) / 2.0
    # 条石基座 + 红墙墩台 0-150
    cb.iso_box(d, u0, u1, v0, v1, 0, 24, cb.STONE, cb.STONE_S, cb.STONE_T)
    cb.iso_box(d, u0, u1, v0, v1, 24, 150, RED_P, RED_P_D, RED_P_L)
    cb.brick_v(d, u0, u1, v1, 30, 140, RED_P, ch=9.0, cw=0.56)
    cb.brick_u(d, u1, v0, v1, 30, 140, RED_P_D, ch=9.0, cw=0.56, seed=1)
    # 券门隧洞（亮色，贯通 2 格）
    cb.arch_open(d, uc, v1, GATE_HALF, GATE_SPRING, 24, depth=2, axis='v', brick=RED_P)
    # 匾额
    cb.plaque_iso(d, uc, v1, 1.05, 106, 126)
    # 黄瓦墙帽 150-160（先满铺顶面再压亮带）
    _roof_cap(d, u0, u1, v0, v1, 150, CAP_GOLD_D)
    cb.quad(d, cb.S(u0, v1, 150), cb.eu(u1 - u0), cb.ez(10), CAP_GOLD)
    cb.quad(d, cb.S(u1, v0, 150), cb.ev(v1 - v0), cb.ez(10), CAP_GOLD_D)
    d.line([cb.S(u0, v1, 160), cb.S(u1, v1, 160)], fill=(252, 232, 160), width=2)
    # 门楼 160-236：红柱 + 金两坡顶
    lu0, lu1, lv0, lv1 = u0 + 0.35, u1 - 0.35, v0 + 0.45, v1 - 0.35
    _red_body(d, lu0, lu1, lv0, lv1, 160, 236, bays=4)
    cb.bracket_row(d, lu0 + 0.02, lu1 - 0.02, lv1, 236, 10, n=10)
    ov = 0.16
    rv = (lv0 + lv1) / 2.0
    nf = (lv1 + ov) - rv
    nb = rv - (lv0 - ov)
    RIDGE = 322
    EAVE2 = 246
    OVH = 8
    RB = (RIDGE - EAVE2) + OVH
    RF = RB                     # 前坡远边 z = RIDGE - RF（Δz=Δv*16-Δy 推导，与背坡同深）
    _roof_cap(d, lu0, lu1, lv0, lv1, 236)
    o = cb.S(lu0 - ov, rv, RIDGE)
    uvec = cb.eu(lu1 - lu0 + 2 * ov)
    cb.SB.gable(d, lu0 - ov, lv0 - ov, lv1 + ov, EAVE2, RIDGE, RED_P, False)
    _gold_slope(d, o, uvec, cb.SB.droop(-nb, RB), False)
    _gold_slope(d, o, uvec, cb.SB.droop(nf, RF), True)
    cb.SB.gable(d, lu1 + ov, lv0 - ov, lv1 + ov, EAVE2, RIDGE, RED_P, True)
    _gold_ridge(d, (lu0 - ov - 0.08, rv), (lu1 + ov + 0.08, rv), RIDGE + 2)
    return cb.POST.add_outline(cv, px=2.2, erode=1.1)


# ---------------------------------------------------------------- 角楼 2×2

def build_corner():
    _canvas(500, 640, 250, 420)
    cv = Image.new('RGBA', (cb.CW, cb.CH), (0, 0, 0, 0))
    d = ImageDraw.Draw(cv)
    u0, v0 = cb.U0, cb.V0
    u1, v1 = u0 + 2, v0 + 2
    # 墩台（红墙）0-150 + 黄帽
    cb.iso_box(d, u0, u1, v0, v1, 0, 24, cb.STONE, cb.STONE_S, cb.STONE_T)
    cb.iso_box(d, u0, u1, v0, v1, 24, 150, RED_P, RED_P_D, RED_P_L)
    cb.brick_v(d, u0, u1, v1, 30, 140, RED_P, ch=9.0, cw=0.56)
    cb.brick_u(d, u1, v0, v1, 30, 140, RED_P_D, ch=9.0, cw=0.56, seed=1)
    _roof_cap(d, u0, u1, v0, v1, 150, CAP_GOLD_D)
    cb.quad(d, cb.S(u0, v1, 150), cb.eu(u1 - u0), cb.ez(10), CAP_GOLD)
    cb.quad(d, cb.S(u1, v0, 150), cb.ev(v1 - v0), cb.ez(10), CAP_GOLD_D)
    # 楼身 160-268
    lu0, lu1, lv0, lv1 = u0 + 0.28, u1 - 0.28, v0 + 0.28, v1 - 0.28
    _red_body(d, lu0, lu1, lv0, lv1, 160, 268, bays=2)
    # 攒尖金顶 268-336 + 宝顶
    _gold_pyramid(d, lu0, lu1, lv0, lv1, 276, 340)
    return cb.POST.add_outline(cv, px=2.2, erode=1.1)


# ---------------------------------------------------------------- 宫墙 6×2 / 2×6

def _wall(u0, u1, v0, v1):
    cv = Image.new('RGBA', (cb.CW, cb.CH), (0, 0, 0, 0))
    d = ImageDraw.Draw(cv)
    cb.iso_box(d, u0, u1, v0, v1, 0, 16, cb.STONE, cb.STONE_S, cb.STONE_T)
    cb.iso_box(d, u0, u1, v0, v1, 16, 138, RED_P, RED_P_D, RED_P_L)
    cb.brick_v(d, u0, u1, v1, 22, 130, RED_P, ch=9.0, cw=0.56)
    cb.brick_u(d, u1, v0, v1, 22, 130, RED_P_D, ch=9.0, cw=0.56, seed=1)
    # 黄瓦墙帽 + 内侧压顶
    cb.quad(d, cb.S(u0, v1, 138), cb.eu(u1 - u0), cb.ez(12), CAP_GOLD)
    cb.quad(d, cb.S(u1, v0, 138), cb.ev(v1 - v0), cb.ez(12), CAP_GOLD_D)
    d.line([cb.S(u0, v1, 150), cb.S(u1, v1, 150)], fill=(252, 232, 160), width=2)
    d.line([cb.S(u1, v0, 150), cb.S(u1, v1, 150)], fill=(150, 110, 38), width=2)
    return cb.POST.add_outline(cv, px=2.2, erode=1.1)


def build_wall_u6():
    _canvas(700, 640, 350, 400)
    return _wall(cb.U0, cb.U0 + 6, cb.V0, cb.V0 + 2)


def build_wall_v6():
    _canvas(700, 640, 350, 400)
    return _wall(cb.U0, cb.U0 + 2, cb.V0, cb.V0 + 6)


def build_wall_u2():
    _canvas(400, 500, 200, 300)
    return _wall(cb.U0, cb.U0 + 2, cb.V0, cb.V0 + 2)


def build_wall_v2():
    _canvas(400, 500, 200, 300)
    return _wall(cb.U0, cb.U0 + 2, cb.V0, cb.V0 + 2)


# ---------------------------------------------------------------- 白塔 3×3

def build_pagoda():
    _canvas(700, 1000, 350, 780)
    cv = Image.new('RGBA', (cb.CW, cb.CH), (0, 0, 0, 0))
    d = ImageDraw.Draw(cv)
    u0, v0 = cb.U0, cb.V0
    u1, v1 = u0 + 3, v0 + 3
    # 须弥座 0-30
    _marble_tier(d, u0 - 0.5, u1 + 0.5, v0 - 0.5, v1 + 0.5, 0, 30)
    # 塔身五层：逐层收分，白石刻塔身 + 挑檐（青瓦）+ 塔窗
    z = 30.0
    inset0 = 0.18
    TIERS = 5
    for t in range(TIERS):
        ins = inset0 + 0.20 * t
        bu0, bu1, bv0, bv1 = u0 + ins, u1 - ins, v0 + ins, v1 - ins
        bh = 86 if t < 4 else 74
        # 塔身（汉白玉）
        cb.iso_box(d, bu0, bu1, bv0, bv1, z, z + bh, MARBLE_L, MARBLE_D, (250, 247, 240))
        cb.brick_v(d, bu0, bu1, bv1, z + 6, z + bh - 4, MARBLE, ch=8.0, cw=0.94, seed=t)
        cb.brick_u(d, bu1, bv0, bv1, z + 6, z + bh - 4, MARBLE_D, ch=8.0, cw=0.94, seed=t)
        # 塔窗（前脸拱形小窗）+ 侧窗
        wa, wb = (bu0 + bu1) / 2.0 - 0.22, (bu0 + bu1) / 2.0 + 0.22
        za, zb = z + bh * 0.34, z + bh * 0.72
        poly(d, [cb.S(wa, bv1, za), cb.S(wb, bv1, za), cb.S(wb, bv1, zb), cb.S(wa, bv1, zb)],
             (74, 66, 58))
        d.line([cb.S(wa, bv1, zb), cb.S(wb, bv1, zb)], fill=(48, 42, 36), width=2)
        poly(d, [cb.S(bu1, (bv0 + bv1) / 2.0 - 0.22, za), cb.S(bu1, (bv0 + bv1) / 2.0 + 0.22, za),
                 cb.S(bu1, (bv0 + bv1) / 2.0 + 0.22, zb), cb.S(bu1, (bv0 + bv1) / 2.0 - 0.22, zb)],
             (52, 46, 40))
        z += bh
        # 挑檐（青瓦，出挑远）+ 檐角
        ov = 0.42
        eu0, eu1, ev0, ev1 = bu0 - ov, bu1 + ov, bv0 - ov, bv1 + ov
        eh0, eh1, evh0, evh1 = bu0 - 0.10, bu1 + 0.10, bv0 - 0.10, bv1 + 0.10
        EB = z + 26
        cb.skirting(d, cb.S(eh0, ev1, z + 4), cb.S(eh1, ev1, z + 4),
                    cb.S(eu0, ev1, EB), cb.S(eu1, ev1, EB), cb.SB.ROOF_C[3], cb.SB.ROOF_C[1])
        cb.skirting(d, cb.S(eh1, evh0, z + 4), cb.S(eh1, evh1, z + 4),
                    cb.S(eu1, ev0, EB), cb.S(eu1, ev1, EB), cb.SB.BACK_C[1], cb.SB.BACK_C[0])
        # 檐角小翘
        for P in (cb.S(eu0, ev1, EB), cb.S(eu1, ev1, EB), cb.S(eu1, ev0, EB)):
            d.line([P, (P[0] - 6, P[1] - 8)], fill=(28, 40, 52), width=3)
        z = EB
    # 塔顶攒尖（金）+ 宝顶
    _gold_pyramid(d, u0 + 1.1, u1 - 1.1, v0 + 1.1, v1 - 1.1, z, z + 64)
    return cb.POST.add_outline(cv, px=2.4, erode=1.2)


# ---------------------------------------------------------------- 汉白玉地面砖

def bake_ground_marble():
    im = Image.new('RGBA', (128, 64), (0, 0, 0, 0))
    t = ImageDraw.Draw(im)
    for row in range(2):
        for col in range(2):
            x0, y0 = col * 64, row * 32
            tone = mix(MARBLE, MARBLE_L, 0.55) if (row + col) % 2 == 0 else MARBLE
            t.polygon([(x0 + 32, y0), (x0 + 64, y0 + 16), (x0 + 32, y0 + 32), (x0, y0 + 16)],
                      fill=tone, outline=MARBLE_E)
            # 石板细缝与浅斑
            t.line([(x0 + 32, y0 + 6), (x0 + 58, y0 + 16)], fill=mix(tone, MARBLE_D, 0.5), width=1)
            t.line([(x0 + 6, y0 + 16), (x0 + 32, y0 + 26)], fill=mix(tone, MARBLE_L, 0.5), width=1)
    im.save(os.path.join(OUT, 'ground_marble.png'))
    print('ground_marble      128x64 (2x2 tiles)')
    return im


NOTE = '程序化宫城件：汉白玉台基/朱红墙体/金色屋面（_gold_slope 瓦垄 + _gold_ridge 鸱吻）'

if __name__ == '__main__':
    cb.bake(build_hall(), 'palace_hall',
            '宫城主殿 6×6：' + NOTE + '；三层台基 0-74，殿身 74-262/300-386，正脊 ~496',
            [6, 6], {'tileable': False,
                     'elevation': {'terrace_top_z': 74, 'lower_eave_z': 268,
                                   'upper_eave_z': 386, 'ridge_z': 496},
                     'note': '参考国风都城金顶大殿构图；台基与踏道烘焙进贴图'})
    cb.bake(build_hall_s(), 'palace_hall_s',
            '宫城配殿 4×4：' + NOTE + '；台基 0-44，殿身 44-210，正脊 ~316',
            [4, 4], {'tileable': False, 'elevation': {'terrace_top_z': 44, 'ridge_z': 316}})
    cb.bake(build_gate(), 'palace_gate',
            '宫门 4×2：红墙 24-150 + 亮色券洞（半宽 0.92、券脚 62+24）+ 黄瓦帽 + 门楼金顶脊 ~322',
            [4, 2], {'tileable': False,
                     'arch': {'half_width_cells': GATE_HALF, 'spring_z': GATE_SPRING + 24,
                              'top_z': GATE_SPRING + 24 + GATE_HALF * 33, 'passable': True,
                              'clear_width_px': int(GATE_HALF * 2 * 32), 'clear_height_px': GATE_SPRING},
                     'note': '券洞贯通 2 格进深（axis=v）'})
    cb.bake(build_corner(), 'palace_corner',
            '宫城角楼 2×2：红墙墩台 24-150 + 楼身 160-268 + 攒尖金顶 336 + 宝顶',
            [2, 2], {'tileable': False, 'elevation': {'ridge_z': 340}})
    cb.bake(build_wall_u6(), 'palace_wall_u6',
            '宫墙直段 u 向 6×2：条石 0-16 + 朱红墙身 16-138 + 黄瓦帽 138-150',
            [6, 2], {'tileable': True}, clip_x=cb.wall_clip_x('u', 6))
    cb.bake(build_wall_u2(), 'palace_wall_u2',
            '宫墙短段 u 向 2×2：' + NOTE,
            [2, 2], {'tileable': True}, clip_x=cb.wall_clip_x('u', 2))
    cb.bake(build_wall_v2(), 'palace_wall_v2',
            '宫墙短段 v 向 2×2：' + NOTE,
            [2, 2], {'tileable': True}, clip_x=cb.wall_clip_x('v', 2))
    cb.bake(build_wall_v6(), 'palace_wall_v6',
            '宫墙直段 v 向 2×6：条石 0-16 + 朱红墙身 16-138 + 黄瓦帽 138-150',
            [2, 6], {'tileable': True}, clip_x=cb.wall_clip_x('v', 6))
    cb.bake(build_pagoda(), 'pagoda',
            '白塔 3×3：须弥座 0-30 + 五层白石塔身（挑檐青瓦）+ 攒尖金顶 + 宝顶，总高 ~700',
            [3, 3], {'tileable': False, 'elevation': {'tier1_top': 116, 'top_z': 700},
                     'note': '全城制高点（参考图右上古塔）'})
    bake_ground_marble()
