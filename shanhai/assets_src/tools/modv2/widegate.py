# -*- coding: utf-8 -*-
"""宽城门楼 city_gate_wide：足迹 10×3（与南北主街 x59..68 同宽），券洞贯通 ~7.2 格。

复用 citybuild.py 的全部原语（iso_box / brick / arch_open / plaque / skirting / merlons /
roof_slope / ridge / add_outline / bake），仅把跨度与券洞参数放大：
    城台顶 238 / 台面女墙 256 / 下檐 300 / 上檐 366 / 正脊 406 —— 与 4×3 城门楼同一标高体系，
    高于城墙垛口 224（正脊 406 ≈ 城墙视觉高的 1.8 倍），满足「城门要比城墙高大」。
券洞：半宽 3.6 格（净宽 7.2 格 ≈ 主街 10 格减两侧墩柱），券脚 z=92，券顶 z≈211 < 城台顶 238。
"""
import os

import citybuild as cb

# 输出直接落到本仓库（覆盖 citybuild.ROOT 指向的旧工作区）
OUT = r'D:\workspace\game\xiyou01\shanhai\public\assets\art\iso'
cb.MOD = OUT
# 大画幅 + 原点平移：10 格宽足迹 + 406 正脊，原 560×580 画布放不下
# 注意：gable/roof_slope/ridge 用 shopbuild 自己的 OX/OY，必须同步修改，否则屋脊端头会飞出
cb.CW, cb.CH = 1100, 880
cb.OX, cb.OY = 550, 560
cb.SB.OX, cb.SB.OY = 550, 560

GW, GD = 10, 3          # 宽城门足迹：与主街同宽
ARCH_HALF = 3.6         # 券洞半宽（格）：净宽 7.2 格
SPRING = 92             # 券脚标高
BAYS = 14               # 楼身开间数（跨 9.4 格，保持柱距与 4×3 楼相近）


def build_wide_gate():
    cv = cb.Image.new('RGBA', (cb.CW, cb.CH), (0, 0, 0, 0))
    d = cb.ImageDraw.Draw(cv)
    u0, u1, v0, v1 = cb.U0, cb.U0 + GW, cb.V0, cb.V0 + GD
    uc = (u0 + u1) / 2.0
    ov = 0.16
    B = cb.BL
    bu0, bu1 = u0 - B, u1 + B

    # 1 条石基座（与城台齐平，券门贯通到地面）
    cb.iso_box(d, bu0, bu1, v0, v1, 0, 30, cb.STONE, cb.STONE_S, cb.STONE_T)
    cb.brick_v(d, bu0, bu1, v1, 0, 30, cb.STONE, ch=11.0, cw=0.92, seed=5)
    cb.brick_u(d, bu1, v0, v1, 0, 30, cb.STONE_S, ch=11.0, cw=0.92, seed=5)
    # 2 城台（墩台）
    cb.iso_box(d, bu0, bu1, v0, v1, 30, cb.GP_TOP, cb.GATE_C, cb.GATE_S, cb.GATE_T)
    cb.brick_v(d, bu0, bu1, v1, 36, cb.GP_TOP - 12, cb.GATE_C, ch=10.0, cw=0.54)
    cb.brick_u(d, bu1, v0, v1, 36, cb.GP_TOP - 12, cb.GATE_S, ch=10.0, cw=0.54, seed=1)
    # 3 压顶石带 + 台面
    cb.quad(d, cb.S(bu0, v1, cb.GP_TOP - 9), cb.eu(GW + 2 * B), cb.ez(9), cb.STONE_T)
    cb.quad(d, cb.S(bu1, v0, cb.GP_TOP - 9), cb.ev(GD), cb.ez(9), cb.mix(cb.STONE_T, cb.DARK, 0.18))
    d.line([cb.S(bu0, v1, cb.GP_TOP), cb.S(bu1, v1, cb.GP_TOP)], fill=cb.mix(cb.STONE, cb.DARK, 0.55), width=2)
    cb.quad(d, cb.S(u0 + 0.24, v0 + 0.24, cb.GP_TOP), cb.eu(GW - 0.48), cb.ev(GD - 0.48),
            cb.mix(cb.GATE_T, cb.CREAM, 0.18))
    # 4 宽券洞（贯通城台，落到地面）
    cb.arch_open(d, uc, v1, ARCH_HALF, SPRING, 0)
    # 5 匾额（券顶上方居中）
    cb.plaque_iso(d, uc, v1, 1.6, 220, 234)
    # 6 城楼下层（腰檐以下）
    lu0, lu1, lv0, lv1 = u0 + 0.30, u1 - 0.30, v0 + 0.55, v1 - 0.65
    ltop = cb.G1_EAVE - 14
    cb.iso_box(d, lu0, lu1, lv0, lv1, cb.GP_TOP, ltop, cb.CREAM, cb.mix(cb.CREAM, cb.DARK, 0.22),
               cb.mix(cb.CREAM, cb.CREAM_L, 0.5))
    # 前脸：朱红立柱 + 直棂窗
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
                cb.S(a, lv1, z0_)] if False else
               [cb.S(a, lv1, z0_), cb.S(b, lv1, z0_), cb.S(b, lv1, z1_), cb.S(a, lv1, z1_),
                cb.S(a, lv1, z0_)], fill=cb.WOOD, width=2)
        for k in range(1, 5):
            uu = a + (b - a) * k / 5.0
            d.line([cb.S(uu, lv1, z0_), cb.S(uu, lv1, z1_)], fill=cb.mix(cb.WOOD, cb.CREAM, 0.25), width=1)
    # 侧脸（背光）：立柱同样压暗
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
    # 前脸立柱 + 直棂窗（上层，开间同下层）
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
    # 10 上檐 + 两坡顶 + 正脊（与 4×3 城门楼同一 droop 体系）
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
    # 11 台面女墙：先右后前
    cb.merlons(d, 'v', v0 + 0.34, v1 - 0.34, u1 - cb.THICK, u1, cb.GP_TOP, 18, wh=0.72)
    cb.merlons(d, 'u', u0 + 0.34, u1 - 0.34, v1 - cb.THICK, v1, cb.GP_TOP, 18, wh=0.72)
    return cb.POST.add_outline(cv, px=2.4, erode=1.2)


if __name__ == '__main__':
    cb.bake(
        build_wide_gate(), 'city_gate_wide',
        '宽城门楼 10×3：条石基座 0-30 + 城台 30-238 + 宽券洞（贯通，半宽 3.6 格、券脚 z=92、券顶 z≈211）'
        '+ 匾额 + 城楼下层 238-300（腰檐）+ 上层 332-366 + 两坡顶 366-406 + 台面女墙；'
        '足迹与南北主街同宽（10 格），正脊 406 高于城墙垛口 224',
        [GW, GD],
        {'tileable': False,
         'arch': {'half_width_cells': ARCH_HALF, 'spring_z': SPRING, 'top_z': SPRING + ARCH_HALF * 33,
                  'passable': True, 'clear_width_px': int(ARCH_HALF * 2 * 32), 'clear_height_px': SPRING},
         'elevation': {'podium_top_z': cb.GP_TOP, 'eave_z': cb.G1_EAVE, 'ridge_z': cb.G2_RIDGE},
         'note': '与 city_gate_tower 同一标高体系；跨度 10 格对齐主街 x59..68'},
        clip_x=(cb.OX + (cb.U0 - (cb.V0 + GD)) * 32.0, cb.OX + (cb.U0 + GW - cb.V0) * 32.0))
