# -*- coding: utf-8 -*-
"""12 个可复用构件。所有尺寸常数=最终像素，内部乘 K 超采样。"""
import numpy as np

from kit import C, K, co, lerp, Sprite


def bilerp(a, b, c, d, s, t):
    x0 = a[0] + (b[0] - a[0]) * s
    y0 = a[1] + (b[1] - a[1]) * s
    x1 = d[0] + (c[0] - d[0]) * s
    y1 = d[1] + (c[1] - d[1]) * s
    return (x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)


def blob(S, cx, cy, hw, hh, c_top, c_bot, lobes=7, amp=.10, out=2.4, n=60):
    pts = []
    for i in range(n):
        th = 2 * np.pi * i / n
        r = 1 + amp * np.cos(lobes * th)
        pts.append((cx + hw * r * np.cos(th) * K, cy + hh * r * np.sin(th) * K))
    S.grad_poly(pts, c_top, c_bot, out=out)
    return pts


# ============================================================ 1-2 地面
def _ground(S, base, dark, light, joint, speck, ruts=False):
    pts = [S.p(0, 0), S.p(1, 0), S.p(1, 1), S.p(0, 1)]
    S.grad_poly(pts, light, dark, out=0)
    cx, cy = S.p(.5, .5, 0)
    # 两级明暗：左上受光、右下压暗（硬边）
    S.d.polygon([S.p(0, 0), S.p(1, 0), (cx, cy)], fill=co(light, 1.03) + (255,))
    S.d.polygon([S.p(1, 1), S.p(0, 1), (cx, cy)], fill=co(dark, .95) + (255,))
    S.d.polygon([S.p(0, 0), S.p(0, 1), (cx, cy)], fill=co(base, 1.01) + (255,))
    S.d.polygon([S.p(1, 0), S.p(1, 1), (cx, cy)], fill=co(base, .98) + (255,))
    # 板缝（严格贴住 64x32 边界，可无缝平铺）
    S.d.line([S.p(0, 0), S.p(1, 0), S.p(1, 1), S.p(0, 1), S.p(0, 0)],
             fill=joint + (255,), width=int(1.8 * K), joint='curve')
    if ruts:
        for off in (-5, 6):
            a, b = S.p(.12, .5, 0), S.p(.88, .5, 0)
            S.d.line([(a[0], a[1] + off * K), (b[0], b[1] + off * K)],
                     fill=joint + (95,), width=int(3 * K))
    for (u, v, rx, ry, al) in speck:
        c = S.p(u, v, 0)
        S.d.ellipse([c[0] - rx * K, c[1] - ry * K, c[0] + rx * K, c[1] + ry * K],
                    fill=co(joint, 1.1) + (al,))


def ground_stone(S):
    _ground(S, C['stone'], C['stone_d'], co(C['stone'], 1.14), C['joint'],
            [(.34, .40, 4.5, 2.2, 70), (.66, .62, 3.4, 1.8, 60), (.22, .68, 2.6, 1.4, 55),
             (.72, .26, 3.0, 1.6, 55)])


def ground_dirt(S):
    _ground(S, C['dirt'], C['dirt_d'], co(C['dirt'], 1.10), C['dirt_j'],
            [(.40, .36, 5.0, 2.0, 90), (.58, .70, 4.0, 1.7, 80), (.24, .58, 3.2, 1.4, 70),
             (.76, .46, 2.8, 1.3, 65)], ruts=True)


# ============================================================ 3 瓦坡
def roof_slope(S):
    w, h = 4, 2
    R = 46                              # 脊到檐的高差
    R0, R1 = S.p(0, 0, R), S.p(w, 0, R)
    E0, E1 = S.p(0, h, 0), S.p(w, h, 0)
    f = [R0, R1, E1, E0]
    S.grad_poly(f, co(C['tile_l'], .98), co(C['tile'], .92))
    # 两级：靠脊暗带 + 檐口亮带（硬边）
    S.d.polygon(S.sub(f, 0, .30), fill=co(C['tile_d'], .99) + (255,))
    S.d.polygon(S.sub(f, .30, .34), fill=co(C['tile_d'], 1.10) + (255,))
    S.d.polygon(S.sub(f, .83, 1.0), fill=co(C['tile_l'], 1.04) + (255,))
    # 瓦垄（顺坡）：暗沟 + 亮垄背
    for s in np.arange(.03, .999, .052):
        a = bilerp(R0, R1, E1, E0, s, .03)
        b = bilerp(R0, R1, E1, E0, s, .985)
        S.line(a, b, co(C['tile_d'], .88), 1.5)
        S.line((a[0] + 2.4 * K, a[1]), (b[0] + 2.4 * K, b[1]), co(C['tile_l'], 1.02), 1.1)
    # 瓦行（稀）
    for t in (.52, .76):
        S.line(bilerp(R0, R1, E1, E0, .01, t), bilerp(R0, R1, E1, E0, .99, t),
               co(C['tile_d'], .92), 1.2)
    S._outline(f, 2.6)
    # 坡面厚度：檐口唇 + 两侧戗边
    lip = 6
    S.fill_poly([E0, E1, (E1[0], E1[1] + lip * K), (E0[0], E0[1] + lip * K)],
                co(C['tile_dd'], 1.0), out=2.0)
    S.fill_poly([S.p(0, 0, R), E0, (E0[0], E0[1] + lip * K),
                 (S.p(0, 0, R)[0], S.p(0, 0, R)[1] + lip * K)],
                co(C['tile_d'], .94), out=2.0)
    S.fill_poly([S.p(w, 0, R), E1, (E1[0], E1[1] + lip * K),
                 (S.p(w, 0, R)[0], S.p(w, 0, R)[1] + lip * K)],
                co(C['tile_d'], .84), out=2.0)
    # 檐口瓦当
    for s in np.arange(.03, 1.0, .055):
        c = bilerp(R0, R1, E1, E0, s, .955)
        S.dot(c, 1.9, co(C['tile_l'], .96), out=0)


# ============================================================ 4 屋脊
def _beast(S, x, y, dirn, scale=1.0):
    p = [(x, y), (x + dirn * 7 * K * scale, y - 2 * K * scale),
         (x + dirn * 11 * K * scale, y - 12 * K * scale),
         (x + dirn * 6 * K * scale, y - 16 * K * scale),
         (x + dirn * 3.5 * K * scale, y - 8 * K * scale)]
    S.fill_poly(p, co(C['ridge'], 1.12), out=1.8)


def roof_ridge(S):
    w = 4
    zt = 17
    v0, v1 = .28, .72
    # 正面（脊身）
    S.face([S.p(0, v1, zt), S.p(w, v1, zt), S.p(w, v1, 0), S.p(0, v1, 0)],
           co(C['ridge'], 1.14), co(C['ridge'], .9),
           bands=[(.56, .74, co(C['gold'], .92))])
    # 顶面
    S.quad_z(0, w, v0, v1, zt, co(C['ridge'], 1.06), out=2.2)
    # 赭金收边（脊顶压线 + 两端金箍）
    S.line(S.p(0, v1, zt + .8), S.p(w, v1, zt + .8), C['gold'], 2.0)
    S.line(S.p(0, v1, zt - 6), S.p(w, v1, zt - 6), co(C['gold_d'], .96), 1.2)
    S.line(S.p(0, v1, zt - 9.5), S.p(w, v1, zt - 9.5), co(C['gold'], .8), 1.0)
    for uu in (.10, w - .10):
        S.face([S.p(uu - .045, v1, zt + 1), S.p(uu + .045, v1, zt + 1),
                S.p(uu + .045, v1, -1), S.p(uu - .045, v1, -1)],
               co(C['gold'], 1.0), co(C['gold_d'], 1.0), out=1.6)
    # 脊兽
    for uu, dirn in ((0, -1), (w, 1)):
        x, y = S.p(uu, v1, zt)
        _beast(S, x, y, dirn)


# ============================================================ 5-6 墙面
def _wall(S, height, kind):
    H = height
    # 右侧面（u=2，背光）
    S.face([S.p(2, 0, H), S.p(2, 1, H), S.p(2, 1, 0), S.p(2, 0, 0)],
           co(C['wall'], .80) if kind == 'plaster' else co(C['verm_d'], .88),
           co(C['wall_ss'], .84) if kind == 'plaster' else co(C['verm_dd'], .92),
           out=2.4)
    # 正面（v=1，受光）
    main_top = co(C['wall'], 1.0) if kind == 'plaster' else co(C['wall'], 1.0)
    main_bot = co(C['wall_s'], .92)
    S.face([S.p(0, 1, H), S.p(2, 1, H), S.p(2, 1, 0), S.p(0, 1, 0)],
           main_top, main_bot, out=2.6,
           bands=[(.80, 1.0, co(C['wall_s'], .94))])

    if kind == 'wood':
        # 木格窗（两级：深底 + 朱红棂格）
        a, b, z0, z1 = .26, 1.74, 40, 112
        S.face([S.p(a, 1, z1), S.p(b, 1, z1), S.p(b, 1, z0), S.p(a, 1, z0)],
               co(C['dark'], 1.0), co(C['dark'], 1.18), out=2.4)
        for k in range(1, 7):
            u = a + k * (b - a) / 7
            S.line(S.p(u, 1, z0 + 2), S.p(u, 1, z1 - 2), co(C['verm'], 1.00), 1.4)
        for k in range(1, 5):
            z = z0 + k * (z1 - z0) / 5
            S.line(S.p(a + .02, 1, z), S.p(b - .02, 1, z), co(C['verm'], .92), 1.3)
        S.line(S.p(a, 1, z1), S.p(b, 1, z1), co(C['gold'], 1.0), 1.3)
        S.line(S.p(a, 1, z0), S.p(b, 1, z0), co(C['gold_d'], 1.0), 1.3)
        # 木裙板
        S.face([S.p(.26, 1, 30), S.p(1.74, 1, 30), S.p(1.74, 1, 12), S.p(.26, 1, 12)],
               co(C['wood'], 1.06), co(C['wood_d'], 1.0), out=1.8)
    else:
        # 粉墙：墙脚石基（两级）+ 石压顶腰线
        S.face([S.p(0, 1, 34), S.p(2, 1, 34), S.p(2, 1, 0), S.p(0, 1, 0)],
               co(C['stone'], 1.10), co(C['stone_d'], .94), out=2.4,
               bands=[(.62, 1.0, co(C['stone_d'], .94))])
        for u in np.arange(.22, 2, .22):
            S.line(S.p(u, 1, 3), S.p(u, 1, 31), co(C['stone_dd'], .92), 1.1)
        S.line(S.p(0, 1, 34), S.p(2, 1, 34), co(C['stone'], 1.24), 1.8)
        S.face([S.p(0, 1, 128), S.p(2, 1, 128), S.p(2, 1, 120), S.p(0, 1, 120)],
               co(C['stone'], .99), None, out=1.6)

    # 朱红角柱
    for (u0, u1) in ((0, .17), (1.83, 2.0)):
        S.face([S.p(u0, 1, H), S.p(u1, 1, H), S.p(u1, 1, 0), S.p(u0, 1, 0)],
               co(C['verm'], 1.06), co(C['verm_d'], .98), out=2.0)
    # 上额枋 + 赭金细线
    S.face([S.p(0, 1, H - 2), S.p(2, 1, H - 2), S.p(2, 1, H - 22), S.p(0, 1, H - 22)],
           co(C['verm'], 1.04), co(C['verm_d'], 1.02), out=2.2)
    S.line(S.p(0, 1, H - 22), S.p(2, 1, H - 22), C['gold'], 1.7)
    # 下槛
    S.face([S.p(0, 1, 9), S.p(2, 1, 9), S.p(2, 1, 0), S.p(0, 1, 0)],
           co(C['verm_d'], 1.0), co(C['verm_dd'], 1.0), out=2.0)
    # 墙顶薄顶面
    S.quad_z(0, 2, 0, 1, H, co(C['verm'], .74) if kind == 'wood' else co(C['stone'], .9),
             out=2.2)


def wall_wood(S):
    _wall(S, 155, 'wood')


def wall_plaster(S):
    _wall(S, 155, 'plaster')


# ============================================================ 7 城门楼
def _ring_pts(S, uc, hu, spring, rz, v=3, n=30):
    pts = [S.p(uc - hu, v, spring)]
    for a in np.linspace(180, 0, n):
        th = np.deg2rad(a)
        pts.append(S.p(uc + hu * np.cos(th), v, spring + rz * np.sin(th)))
    pts.append(S.p(uc + hu, v, spring))
    return pts


def _arch_pts(S, uc, hu, spring, rz, v=3, n=30):
    pts = [S.p(uc - hu, v, 0), S.p(uc - hu, v, spring)]
    for a in np.linspace(180, 0, n):
        th = np.deg2rad(a)
        pts.append(S.p(uc + hu * np.cos(th), v, spring + rz * np.sin(th)))
    pts.append(S.p(uc + hu, v, 0))
    return pts


def gate_arch(S):
    w = h = 3
    HWALL, R = 168, 214
    SPRING, HU, RZ = 124, .78, 26      # 拱脚 124 + 拱高 26 = 净高 150
    # 右侧面（u=3，背光）+ 石基
    S.face([S.p(3, 0, HWALL), S.p(3, 3, HWALL), S.p(3, 3, 0), S.p(3, 0, 0)],
           co(C['wall'], .84), co(C['wall_s'], .80), out=2.6,
           bands=[(.74, 1.0, co(C['wall_ss'], .96))])
    S.face([S.p(3, 0, 40), S.p(3, 3, 40), S.p(3, 3, 0), S.p(3, 0, 0)],
           co(C['stone_d'], .96), co(C['stone_dd'], .96), out=2.4)
    for v in np.arange(.3, 3, .3):
        S.line(S.p(3, v, 3), S.p(3, v, 37), co(C['stone_dd'], .82), 1.1)
    # 正面：石基座 + 粉墙
    S.face([S.p(0, 3, 40), S.p(3, 3, 40), S.p(3, 3, 0), S.p(0, 3, 0)],
           co(C['stone'], 1.06), co(C['stone_d'], .94), out=2.6,
           bands=[(.58, 1.0, co(C['stone_d'], .95))])
    for u in np.arange(.25, 3, .25):
        S.line(S.p(u, 3, 3), S.p(u, 3, 38), co(C['stone_dd'], .85), 1.1)
    S.face([S.p(0, 3, HWALL), S.p(3, 3, HWALL), S.p(3, 3, 40), S.p(0, 3, 40)],
           co(C['wall'], 1.02), co(C['wall_s'], .94), out=2.6,
           bands=[(.80, 1.0, co(C['wall_s'], .96))])
    # 拱洞：先挖空 → 画石券圈 → 再挖内圈（中段全透明，人物可穿）
    S.erase(_arch_pts(S, 1.5, HU, SPRING, RZ))
    S.d.line(_ring_pts(S, 1.5, HU, SPRING, RZ), fill=co(C['stone_d'], 1.0) + (255,),
             width=int(6.5 * K), joint='curve')
    for uu in (1.5 - HU, 1.5 + HU):
        S.d.line([S.p(uu, 3, 0), S.p(uu, 3, SPRING)],
                 fill=co(C['stone_d'], 1.0) + (255,), width=int(6.5 * K))
    S.d.line(_ring_pts(S, 1.5, HU + .075, SPRING, RZ + 2), fill=co(C['stone_dd'], 1.0) + (255,),
             width=int(1.8 * K), joint='curve')
    S.erase(_arch_pts(S, 1.5, HU - .085, SPRING, RZ - 2))
    S.d.line(_ring_pts(S, 1.5, HU - .085, SPRING, RZ - 2),
             fill=co(C['stone_dd'], .86) + (255,), width=int(1.6 * K), joint='curve')
    for uu in (1.5 - HU + .085, 1.5 + HU - .085):
        S.d.line([S.p(uu, 3, 0), S.p(uu, 3, SPRING)],
                 fill=co(C['stone_dd'], .86) + (255,), width=int(1.6 * K))
    # 檐下额枋（拱顶之上）
    S.face([S.p(0, 3, HWALL - 1), S.p(3, 3, HWALL - 1), S.p(3, 3, HWALL - 15),
            S.p(0, 3, HWALL - 15)], co(C['verm'], 1.05), co(C['verm_d'], 1.0), out=2.2)
    S.line(S.p(0, 3, HWALL - 15), S.p(3, 3, HWALL - 15), C['gold'], 1.7)
    # 匾额（中缝处挖空会被挡住，贴在墙面上）
    S.face([S.p(1.16, 3, 158), S.p(1.84, 3, 158), S.p(1.84, 3, 140), S.p(1.16, 3, 140)],
           co(C['gold'], 1.0), co(C['gold_d'], 1.0), out=2.0)
    S.face([S.p(1.22, 3, 155), S.p(1.78, 3, 155), S.p(1.78, 3, 144), S.p(1.22, 3, 144)],
           co(C['dark'], 1.08), None, out=1.4)
    # 屋面
    u0, u1 = -.42, 3.42
    vr, ve = -.42, 3.42
    f = [S.p(u0, vr, R), S.p(u1, vr, R), S.p(u1, ve, HWALL), S.p(u0, ve, HWALL)]
    S.grad_poly(f, co(C['tile_l'], 1.0), co(C['tile'], .92))
    S.d.polygon(S.sub(f, 0, .26), fill=co(C['tile_d'], .99) + (255,))
    S.d.polygon(S.sub(f, .26, .30), fill=co(C['tile_d'], 1.12) + (255,))
    S.d.polygon(S.sub(f, .84, 1.0), fill=co(C['tile_l'], 1.05) + (255,))
    for s in np.arange(.02, 1.0, .034):
        a = bilerp(*f, s, .04)
        b = bilerp(*f, s, .98)
        S.line(a, b, co(C['tile_d'], .86), 1.4)
        S.line((a[0] + 2.2 * K, a[1]), (b[0] + 2.2 * K, b[1]), co(C['tile_l'], 1.0), 1.0)
    S._outline(f, 2.8)
    # 戗脊
    for uu in (u0, u1):
        S.line(S.p(uu, vr, R), S.p(uu, ve, HWALL), co(C['tile_dd'], 1.06), 3.0)
    # 檐口唇
    e0, e1 = S.p(u0, ve, HWALL), S.p(u1, ve, HWALL)
    S.fill_poly([e0, e1, (e1[0], e1[1] + 7 * K), (e0[0], e0[1] + 7 * K)],
                co(C['tile_dd'], 1.0), out=2.2)
    # 正脊
    zr = R + 9
    S.face([S.p(u0, vr + .20, zr), S.p(u1, vr + .20, zr), S.p(u1, vr + .20, R - 10),
            S.p(u0, vr + .20, R - 10)], co(C['ridge'], 1.16), co(C['ridge'], .9),
           bands=[(.56, .76, co(C['gold'], .9))])
    S.quad_z(u0, u1, vr - .20, vr + .20, zr, co(C['ridge'], 1.06), out=2.2)
    S.line(S.p(u0, vr + .20, zr + .8), S.p(u1, vr + .20, zr + .8), C['gold'], 2.0)
    for uu, dirn in ((u0, -1), (u1, 1)):
        x, y = S.p(uu, vr, zr)
        _beast(S, x, y, dirn, 1.5)


# ============================================================ 8 台阶
def stairs(S):
    n, dz = 3, 10
    for k in range(n):
        zt = 30 - k * dz
        u0, u1 = k, k + 1
        S.face([S.p(u1, 0, zt - dz), S.p(u1, 1, zt - dz), S.p(u1, 1, zt - dz - dz + 0),
                S.p(u1, 0, zt - dz)][:3] + [S.p(u1, 1, zt - dz)],
               co(C['stone_d'], .96), None, out=0)   # 占位，下面重画
        # 踏步踏面
        S.quad_z(u0, u1, 0, 1, zt, co(C['stone'], 1.14), out=2.2)
        # 踏步立面（v=1 侧）
        S.face([S.p(u0, 1, zt), S.p(u1, 1, zt), S.p(u1, 1, zt - dz), S.p(u0, 1, zt - dz)],
               co(C['stone_d'], 1.0), co(C['stone_dd'], .98), out=2.2,
               bands=[(.55, 1.0, co(C['stone_dd'], .97))])
        # 右端面（u=1 阶梯侧，窄）
        S.face([S.p(u1, 0, zt), S.p(u1, 1, zt), S.p(u1, 1, zt - dz), S.p(u1, 0, zt - dz)],
               co(C['stone_d'], .9), co(C['stone_dd'], .94), out=2.0)
        # 沿口亮线
        S.line(S.p(u0, 1, zt), S.p(u1, 1, zt), co(C['stone'], 1.26), 1.6)


# ============================================================ 9 栏杆
def fence(S):
    ztop = 44
    vr = .5
    for z in (17, 32):
        S.face([S.p(0, vr, z + 6), S.p(2, vr, z + 6), S.p(2, vr, z), S.p(0, vr, z)],
               co(C['wood'], 1.08), co(C['wood_d'], 1.0), out=2.0)
        S.line(S.p(0, vr, z + 5), S.p(2, vr, z + 5), co(C['wood_l'], 1.0), 1.2)
    for u in (.13, 1.0, 1.87):
        c0, c1 = S.p(u, vr, 0), S.p(u, vr, ztop)
        half = 3.4 * K
        S.d.polygon([(c0[0] - half, c0[1]), (c0[0] + half, c0[1]),
                     (c1[0] + half, c1[1]), (c1[0] - half, c1[1])],
                    fill=co(C['wood'], 1.04) + (255,), outline=tuple(C['dark']) + (255,),
                    width=int(2.0 * K))
        # 受光左侧亮边
        S.d.line([(c0[0] - half * .55, c0[1] - 2 * K), (c1[0] - half * .55, c1[1] + 2 * K)],
                 fill=co(C['wood_l'], 1.0) + (150,), width=int(1.3 * K))
        S.oval(c1[0], c1[1] - 1 * K, 3.4, 2.2, co(C['wood_l'], 1.02), out=1.6)


# ============================================================ 10 松树
def tree_pine(S):
    S.box(.42, .58, .44, .62, 0, 70,
          (co(C['wood'], .9),),
          (co(C['wood'], 1.0), co(C['wood_d'], 1.0)),
          (co(C['wood_d'], .92), co(C['wood_d'], .98)))
    tiers = [(58, 46, 26, .74), (96, 39, 24, .82), (132, 30, 21, .90), (162, 20, 16, .98)]
    for (z, hw, hh, lit) in tiers:
        c = S.p(.5, .5, z)
        blob(S, c[0], c[1], hw, hh, co(C['leaf_l'], lit), co(C['leaf'], 1.0))
        # 底部暗块（两级明暗的硬边）
        c2 = S.p(.5, .5, z - hh * .5)
        blob(S, c2[0], c2[1] + 2 * K, hw * .62, hh * .40,
             co(C['leaf_d'], 1.0), co(C['leaf_d'], .92), out=1.6, n=30)
    top = S.p(.5, .5, 176)
    S.fill_poly([(top[0], top[1] - 8 * K), (top[0] + 8 * K, top[1] + 7 * K),
                 (top[0] - 8 * K, top[1] + 7 * K)], co(C['leaf_l'], 1.02), out=2.0)


# ============================================================ 11 摊棚
def _mix(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


CLOTH = _mix(C['gold_l'], C['wall_s'], .42)        # 土黄布面
CLOTH_L = co(CLOTH, 1.06)
CLOTH_I = _mix(C['tile_l'], C['stone'], .16)      # 靛青挂边 / 幡


def stall(S):
    zc = 106
    # 四角立柱
    for (u, v) in ((.14, .14), (1.86, .14), (.14, 1.86), (1.86, 1.86)):
        S.box(u - .05, u + .05, v - .05, v + .05, 0, zc,
              (co(C['wood_l'], .94),),
              (co(C['wood'], 1.02), co(C['wood_d'], .98)),
              (co(C['wood_d'], .94), co(C['wood_d'], .92)))
    # 柜台
    S.box(.14, 1.86, 1.02, 1.80, 36, 52,
          (co(C['wood_l'], 1.08),),
          (co(C['wood'], 1.04), co(C['wood_d'], 1.0)),
          (co(C['wood_d'], .92), co(C['wood_d'], .96)))
    S.line(S.p(.14, 1.02, 44), S.p(1.86, 1.02, 44), co(C['gold'], .95), 1.4)
    # 货筐 + 果子
    for (u, c) in ((.50, C['lan']), (.98, C['gold_l']), (1.48, C['leaf_l'])):
        S.box(u - .12, u + .12, 1.20, 1.44, 52, 62,
              (co(C['wood_l'], 1.0),),
              (co(C['wood'], 1.0), co(C['wood_d'], 1.0)),
              (co(C['wood_d'], .9), co(C['wood_d'], .96)))
        pc = S.p(u, 1.32, 64)
        for dx in (-4.5, 0, 4.5):
            S.dot((pc[0] + dx * K, pc[1] + (1.5 if dx == 0 else 0) * K), 2.6, c, out=1.1)
    # 布棚：单坡素布（土黄），硬边两级明暗 + 靛青挂边与幡——不用条纹
    f = [S.p(-.14, -.14, zc + 7), S.p(2.14, -.14, zc + 7),
         S.p(2.14, 2.14, zc - 11), S.p(-.14, 2.14, zc - 11)]
    S.grad_poly(f, CLOTH_L, CLOTH, out=2.6)
    S.d.polygon(S.sub(f, 0, .28), fill=co(CLOTH, .84) + (255,))       # 靠脊暗带
    S.d.polygon(S.sub(f, .32, .74), fill=co(CLOTH, .97) + (255,))     # 中调
    S.d.polygon(S.sub(f, .76, 1), fill=co(CLOTH, 1.12) + (255,))      # 檐口亮带
    S._outline(f, 2.6)
    # 木架：脊杆 + 檐口横杆 + 两根斜撑（让棚读成"撑起来的"，不是一块布片）
    S.line(S.p(-.16, -.16, zc + 8), S.p(2.16, -.16, zc + 8), co(C['wood_d'], 1.0), 2.2)
    S.line(S.p(-.16, 2.16, zc - 12), S.p(2.16, 2.16, zc - 12), co(C['wood'], 1.02), 2.6)
    for u in (.16, 1.84):
        S.line(S.p(u, .16, 0), S.p(u, 2.10, zc - 12), co(C['wood'], .98), 2.0)
    # 前挂边：靛青布，下缘波浪
    e0, e1 = S.p(-.16, 2.16, zc - 12), S.p(2.16, 2.16, zc - 12)
    hgt, n = 12.5 * K, 8
    pts = [e0, e1]
    for k in range(n, 0, -1):
        t0, t1 = (k - 1) / n, k / n
        x0, x1 = e0[0] + (e1[0] - e0[0]) * t0, e0[0] + (e1[0] - e0[0]) * t1
        if k % 2:
            pts.append((x0, e0[1] + hgt)); pts.append((x1, e0[1] + hgt * .40))
        else:
            pts.append((x0, e0[1] + hgt * .40)); pts.append((x1, e0[1] + hgt))
    S.fill_poly(pts, co(CLOTH_I, 1.0), out=2.0)
    S.line((e0[0], e0[1] + 1.6 * K), (e1[0], e1[1] + 1.6 * K), co(CLOTH_I, .72), 1.8)
    # 布幡：挂在右前柱外侧（棚檐之外），蓝底金杆，不压在布面上
    bx, bz = 1.86, zc - 16
    b0 = S.p(bx, 2.34, bz)
    S.line((b0[0], b0[1] - 26 * K), (b0[0], b0[1]), co(C['gold_d'], 1.0), 1.8)
    S.fill_poly([(b0[0] - 4.5 * K, b0[1]), (b0[0] + 4.5 * K, b0[1]),
                 (b0[0] + 4.5 * K, b0[1] + 32 * K), (b0[0], b0[1] + 37 * K),
                 (b0[0] - 4.5 * K, b0[1] + 32 * K)], co(CLOTH_I, 1.06), out=1.8)
    S.line((b0[0] - 3.6 * K, b0[1] + 4 * K), (b0[0] + 3.6 * K, b0[1] + 4 * K),
           co(C['gold_l'], 1.0), 1.5)


# ============================================================ 12 灯杆
def lantern_post(S):
    S.box(.38, .62, .38, .62, 0, 14,
          (co(C['stone'], 1.12),),
          (co(C['stone'], 1.02), co(C['stone_d'], .96)),
          (co(C['stone_d'], .94), co(C['stone_dd'], .96)))
    S.box(.462, .538, .462, .538, 14, 148,
          (co(C['wood'], .92),),
          (co(C['wood'], 1.04), co(C['wood_d'], 1.0)),
          (co(C['wood_d'], .94), co(C['wood_d'], .98)))
    # 挑杆（伸向 +v）
    S.box(.44, .56, .44, .92, 140, 147,
          (co(C['wood'], .96),),
          (co(C['wood'], 1.02), co(C['wood_d'], 1.0)),
          (co(C['wood_d'], .92), co(C['wood_d'], .96)))
    # 灯笼（挂点在挑杆端）
    lc = S.p(.5, .88, 116)
    S.line(S.p(.5, .88, 140), (lc[0], lc[1] - 13 * K), co(C['gold_d'], 1.0), 1.2)
    rx, ry = 9.5 * K, 12 * K
    body = [(lc[0] - rx, lc[1] - ry), (lc[0] + rx, lc[1] - ry),
            (lc[0] + rx * .82, lc[1] + ry), (lc[0] - rx * .82, lc[1] + ry)]
    S.d.polygon(body, fill=co(C['lan'], 1.02) + (255,), outline=tuple(C['dark']) + (255,),
                width=int(2.2 * K))
    S.d.polygon([(lc[0] - rx * .75, lc[1] - ry * .92), (lc[0] - rx * .18, lc[1] - ry * .92),
                 (lc[0] - rx * .16, lc[1] + ry * .92), (lc[0] - rx * .62, lc[1] + ry * .92)],
                fill=co(C['lan_d'], 1.0) + (255,))
    for k in (-.42, .42):
        S.line((lc[0] + k * rx * 2, lc[1] - ry * .8), (lc[0] + k * rx * 2, lc[1] + ry * .8),
               co(C['lan_d'], .96), 1.2)
    for yy in (lc[1] - ry - 1 * K, lc[1] + ry + 1 * K):
        S.fill_poly([(lc[0] - rx * .6, yy - 2.2 * K), (lc[0] + rx * .6, yy - 2.2 * K),
                     (lc[0] + rx * .6, yy + 2.2 * K), (lc[0] - rx * .6, yy + 2.2 * K)],
                    co(C['gold'], 1.02), out=1.5)
    S.line((lc[0], lc[1] + ry + 3 * K), (lc[0], lc[1] + ry + 10 * K), co(C['gold_d'], 1.0), 1.6)


PARTS = [
    ('ground_stone', ground_stone, (1, 1), 'SW', True, 40),
    ('ground_dirt', ground_dirt, (1, 1), 'SW', True, 40),
    ('roof_slope', roof_slope, (4, 2), 'SW', False, 130),
    ('roof_ridge', roof_ridge, (4, 1), 'SW', False, 60),
    ('wall_wood', wall_wood, (2, 1), 'SW', False, 180),
    ('wall_plaster', wall_plaster, (2, 1), 'SW', False, 180),
    ('gate_arch', gate_arch, (3, 3), 'SW', False, 260),
    ('stairs', stairs, (3, 1), 'SW', False, 50),
    ('fence', fence, (2, 1), 'SW', False, 60),
    ('tree_pine', tree_pine, (1, 1), 'SW', False, 200),
    ('stall', stall, (2, 2), 'SW', False, 130),
    ('lantern_post', lantern_post, (1, 1), 'SW', False, 180),
]
