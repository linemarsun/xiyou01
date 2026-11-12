# -*- coding: utf-8 -*-
"""城市填充批：鼓楼/钟楼 + 大殿/衙署 + 小铺面 + 街市填充件。

全部沿用既有体系：
    2:1 等距，1 格 = 64×32；anchor = 足迹前底顶点 p(umax,vmax)；
    民居 檐 170 / 脊 210；城墙 马道 200 / 垛口 224；门楼 城台 238 / 脊 406。
新增标高：
    鼓楼/钟楼 5×5 台基 28 / 一层檐 228 / 二层檐 330 / 三层檐 412 / 屋面 448 / 宝顶尖 466
    大殿 8×8   台基 36 / 月台 22 / 檐 200 / 腰檐 236 / 上檐 288 / 正脊 328
    衙署 6×6   台基 28 / 月台 16 / 檐 176 / 腰檐 206 / 上檐 232 / 正脊 272
"""
import json
from paths import ROOT, MODULES, PREVIEW, GEN, CHAR, ISO_OUT, HERE, FONT_DIR, ensure
import math
import os

from PIL import Image, ImageDraw

import citybuild as CB
import post as POST
import shopbuild as SB

MOD = os.path.join(ROOT, 'assets_src', 'modules')
PRE = os.path.join(ROOT, 'assets_src', 'preview')
OUT = ensure(os.path.join(PREVIEW, 'shots'))

S = CB.S
eu, ev, ez = CB.eu, CB.ev, CB.ez
quad, iso_box, mix = CB.quad, CB.iso_box, CB.mix
brick_v, brick_u = CB.brick_v, CB.brick_u
vgrad, ugrad = CB.vgrad, CB.ugrad
merlons, arch_open, bracket_row = CB.merlons, CB.arch_open, CB.bracket_row
skirting, plaque_iso, droop = CB.skirting, CB.plaque_iso, CB.droop
DARK, CREAM, CREAM_L = CB.DARK, CB.CREAM, CB.CREAM_L
WOOD, RED, RED_L, RED_D = CB.WOOD, CB.RED, CB.RED_L, CB.RED_D
GOLD, GOLD_L, STONE, STONE_S, STONE_T = CB.GOLD, CB.GOLD_L, CB.STONE, CB.STONE_S, CB.STONE_T
IRON, IRON_D, IRON_L = CB.IRON, CB.IRON_D, CB.IRON_L
WALL_C, WALL_S = CB.WALL_C, CB.WALL_S
PARA_C, PARA_S = CB.PARA_C, CB.PARA_S
WALK_C = CB.WALK_C
BEIGE = CB.BEIGE

BRONZE = (104, 116, 84)          # 铜钟/香炉：灰绿铜，取 leaf+gold 的低饱和混色
BRONZE_L = (142, 154, 116)
BRONZE_D = (62, 72, 54)
TILE_C = SB.ROOF_C
BACK_C = SB.BACK_C


class Frame(object):
    """临时换原点：citybuild / shopbuild 的 S() 共用同一组 OX/OY。"""

    def __init__(self, ox, oy):
        self.ox, self.oy = ox, oy

    def __enter__(self):
        self.old = (CB.OX, CB.OY, SB.OX, SB.OY)
        CB.OX, CB.OY = self.ox, self.oy
        SB.OX, SB.OY = self.ox, self.oy
        return self

    def __exit__(self, *a):
        CB.OX, CB.OY, SB.OX, SB.OY = self.old


def canvas(w, h):
    cv = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    return cv, ImageDraw.Draw(cv)


def emit(cv, name, note, fp, extra=None, clip_x=None, outline=(2.4, 1.0)):
    if outline:
        cv = POST.add_outline(cv, px=outline[0], erode=outline[1])
    e = {'category': 'city_fill'}
    if extra:
        e.update(extra)
    return CB.bake(cv, name, note, fp, e, clip_x=clip_x)


def prop(fn):
    """1~3 格小件：统一画板与原点。"""
    def wrap(*a, **kw):
        with Frame(190, 250):
            cv, d = canvas(360, 420)
            fn(d, *a, **kw)
            return cv
    return wrap


# ================================================================ 鼓楼 / 钟楼
TOWER_FP = 5
T_BASE = 28
T_E1, T_E2, T_E3 = 228, 330, 412
T_TOP, T_RIDGE = 448, 466
T_RISE = 36


def build_tower(variant='bell'):
    """5×5 三层楼：台基 + 三层楼身 + 两道腰檐 + 两坡顶 + 宝顶。
    底层券门贯通（可穿行），券脚 92 / 顶 140。"""
    accent = RED if variant == 'drum' else BRONZE
    acc_l = RED_L if variant == 'drum' else BRONZE_L
    acc_d = RED_D if variant == 'drum' else BRONZE_D
    with Frame(390, 560):
        cv, d = canvas(780, 880)
        u0, u1, v0, v1 = 2.0, 7.0, 2.0, 7.0
        uc, vc = 4.5, 4.5
        # 1 台基（满足迹，条石）+ 台面
        iso_box(d, u0 + 0.05, u1 - 0.05, v0 + 0.05, v1 - 0.05, 0, T_BASE,
                STONE, STONE_S, STONE_T)
        brick_v(d, u0 + 0.05, u1 - 0.05, v1 - 0.05, 0, T_BASE, STONE, ch=11.0, cw=0.86)
        brick_u(d, u1 - 0.05, v0 + 0.05, v1 - 0.05, 0, T_BASE, STONE_S, ch=11.0, cw=0.86)
        # 台面：四边压边石 + 中间浅色台面，塔身再压上去
        quad(d, S(u0 + 0.05, v1 - 0.05, T_BASE - 6), eu(4.9), ez(6), STONE_T)
        quad(d, S(u1 - 0.05, v0 + 0.05, T_BASE - 6), ev(4.9), ez(6), mix(STONE_T, DARK, 0.18))
        quad(d, S(u0 + 0.42, v0 + 0.42, T_BASE), eu(4.16), ev(4.16), mix(WALK_C, CREAM, 0.34))
        # 2 一层楼身（四角朱柱 + 券门）
        lu0, lu1, lv0, lv1 = u0 + 0.55, u1 - 0.55, v0 + 0.55, v1 - 0.55
        iso_box(d, lu0, lu1, lv0, lv1, T_BASE, T_E1, CREAM, mix(CREAM, DARK, 0.20),
                mix(CREAM, CREAM_L, 0.5))
        # 前脸柱列（5 间）
        bays = 5
        for i in range(bays + 1):
            uu = lu0 + (lu1 - lu0) * i / bays
            poly_col(d, uu, 0.11, lv1, T_BASE, T_E1 - 12, RED, RED_D, RED_L)
        # 侧脸柱列（背光，同族压暗一档）
        for i in range(bays + 1):
            vv = lv0 + (lv1 - lv0) * i / bays
            quad(d, S(lu1, vv - 0.095, T_BASE), ev(0.19), ez(T_E1 - 12 - T_BASE),
                 mix(RED, DARK, 0.34))
        # 券门（贯通到底面）+ 券石圈
        arch_open(d, uc, lv1, 0.96, 92, 0)
        # 券门两侧的抱鼓石
        for su in (uc - 1.28, uc + 1.28):
            iso_box(d, su - 0.16, su + 0.16, lv1 - 0.24, lv1 - 0.02, 0, 20,
                    STONE_T, STONE_S, mix(STONE_T, CREAM, 0.2))
        # 券门上方匾额
        plaque_iso(d, uc, lv1, 0.80, 158, 190, accent_d)
        # 3 一层额枋 + 斗拱 + 腰檐
        quad(d, S(lu0, lv1, T_E1 - 12), eu(lu1 - lu0), ez(12), accent)
        d.line([S(lu0, lv1, T_E1 - 12), S(lu1, lv1, T_E1 - 12)], fill=GOLD, width=1)
        bracket_row(d, lu0 + 0.02, lu1 - 0.02, lv1, T_E1 - 12, 6, n=13)
        e0u, e1u, e0v, e1v = u0 + 0.20, u1 - 0.20, v0 + 0.20, v1 - 0.20
        skirting(d, S(e0u, e1v, T_E1), S(e1u, e1v, T_E1),
                 S(lu0 + 0.10, lv1 - 0.10, T_E1 + 18), S(lu1 - 0.10, lv1 - 0.10, T_E1 + 18),
                 TILE_C[3], TILE_C[1])
        skirting(d, S(e1u, e0v, T_E1), S(e1u, e1v, T_E1),
                 S(lu1 - 0.10, lv0 + 0.10, T_E1 + 18), S(lu1 - 0.10, lv1 - 0.10, T_E1 + 18),
                 BACK_C[1], BACK_C[0])
        # 4 二层楼身（收进 1 格）
        m2 = 1.08
        qu0, qu1, qv0, qv1 = u0 + m2, u1 - m2, v0 + m2, v1 - m2
        iso_box(d, qu0, qu1, qv0, qv1, T_E1 + 18, T_E2, CREAM, mix(CREAM, DARK, 0.22),
                mix(CREAM, CREAM_L, 0.5))
        # 直棂窗（三间，朱框）
        for i in range(3):
            a = qu0 + (qu1 - qu0) * (i + 0.16) / 3.0
            b = qu0 + (qu1 - qu0) * (i + 0.84) / 3.0
            z0_, z1_ = T_E1 + 40, T_E2 - 22
            quad(d, S(a, qv1, z0_), eu(b - a), ez(z1_ - z0_), (247, 240, 221))
            d.line([S(a, qv1, z0_), S(b, qv1, z0_), S(b, qv1, z1_), S(a, qv1, z1_),
                    S(a, qv1, z0_)], fill=WOOD, width=3)
            for k in range(1, 5):
                uu = a + (b - a) * k / 5.0
                d.line([S(uu, qv1, z0_), S(uu, qv1, z1_)], fill=mix(WOOD, CREAM, 0.22), width=1)
        for i in range(4):
            uu = qu0 + (qu1 - qu0) * i / 3.0
            poly_col(d, uu, 0.09, qv1, T_E1 + 18, T_E2 - 12, accent, acc_d, acc_l)
        quad(d, S(qu0, qv1, T_E2 - 12), eu(qu1 - qu0), ez(12), accent)
        bracket_row(d, qu0 + 0.02, qu1 - 0.02, qv1, T_E2 - 12, 5, n=11)
        # 二层腰檐
        skirting(d, S(qu0 - 0.10, qv1 + 0.10, T_E2), S(qu1 + 0.10, qv1 + 0.10, T_E2),
                 S(qu0 + 0.16, qv1 - 0.22, T_E2 + 16), S(qu1 - 0.16, qv1 - 0.22, T_E2 + 16),
                 TILE_C[3], TILE_C[1])
        skirting(d, S(qu1 + 0.10, qv0 - 0.10, T_E2), S(qu1 + 0.10, qv1 + 0.10, T_E2),
                 S(qu1 - 0.16, qv0 + 0.16, T_E2 + 16), S(qu1 - 0.16, qv1 - 0.22, T_E2 + 16),
                 BACK_C[1], BACK_C[0])
        # 5 三层楼身（再收）
        m3 = 1.62
        ru0, ru1, rv0, rv1 = u0 + m3, u1 - m3, v0 + m3, v1 - m3
        iso_box(d, ru0, ru1, rv0, rv1, T_E2 + 16, T_E3, CREAM, mix(CREAM, DARK, 0.24),
                mix(CREAM, CREAM_L, 0.5))
        for i in range(2):
            a = ru0 + (ru1 - ru0) * (i + 0.20) / 2.0
            b = ru0 + (ru1 - ru0) * (i + 0.80) / 2.0
            z0_, z1_ = T_E2 + 34, T_E3 - 18
            quad(d, S(a, rv1, z0_), eu(b - a), ez(z1_ - z0_), (247, 240, 221))
            d.line([S(a, rv1, z0_), S(b, rv1, z0_), S(b, rv1, z1_), S(a, rv1, z1_),
                    S(a, rv1, z0_)], fill=WOOD, width=2)
            for k in range(1, 4):
                uu = a + (b - a) * k / 4.0
                d.line([S(uu, rv1, z0_), S(uu, rv1, z1_)], fill=mix(WOOD, CREAM, 0.22), width=1)
        for i in range(3):
            uu = ru0 + (ru1 - ru0) * i / 2.0
            poly_col(d, uu, 0.075, rv1, T_E2 + 16, T_E3 - 10, accent, acc_d, acc_l)
        quad(d, S(ru0, rv1, T_E3 - 10), eu(ru1 - ru0), ez(10), accent)
        bracket_row(d, ru0 + 0.02, ru1 - 0.02, rv1, T_E3 - 10, 4, n=9)
        # 6 顶层两坡顶 + 山墙 + 正脊
        rv = (rv0 + rv1) / 2.0
        ov = 0.26
        nf, nb = (rv1 + ov) - rv, rv - (rv0 - ov)
        o = S(ru0 - ov, rv, T_TOP)
        uvec = eu(ru1 - ru0 + 2 * ov)
        SB.roof_slope(d, o, uvec, droop(-nb, T_RISE), False)
        SB.gable(d, ru1 + ov, rv0 - ov, rv1 + ov, T_E3, T_TOP, CREAM, True, accent_d)
        SB.gable(d, ru0 - ov, rv0 - ov, rv1 + ov, T_E3, T_TOP, CREAM, False, accent_d)
        SB.roof_slope(d, o, uvec, droop(nf, T_RISE), True)
        SB.ridge(d, (ru0 - ov - 0.10, rv), (ru1 + ov + 0.10, rv), T_TOP + 2)
        # 7 宝顶（全城最高点）：须弥座 + 金球 + 尖
        bx = S(uc, rv, T_TOP + 4)
        base_pts = [(bx[0] - 11, bx[1]), (bx[0] + 11, bx[1]),
                    (bx[0] + 8, bx[1] - 9), (bx[0] - 8, bx[1] - 9)]
        d.polygon(base_pts, fill=mix(GOLD, DARK, 0.35), outline=DARK, width=2)
        d.ellipse([bx[0] - 9, bx[1] - 26, bx[0] + 9, bx[1] - 8], fill=GOLD,
                  outline=mix(GOLD, DARK, 0.55), width=2)
        d.arc([bx[0] - 7, bx[1] - 25, bx[0] + 5, bx[1] - 15], 190, 310, fill=GOLD_L, width=2)
        d.line([(bx[0], bx[1] - 26), (bx[0], bx[1] - 38)], fill=GOLD_L, width=3)
        d.ellipse([bx[0] - 4, bx[1] - 43, bx[0] + 4, bx[1] - 35], fill=GOLD_L,
                  outline=mix(GOLD, DARK, 0.5))
        # 8 钟 / 鼓：两种变体的识别物
        if variant == 'bell':
            # 铜钟挂在二层檐下（前脸正中）
            cx_, cy_ = S(uc, qv1 + 0.30, T_E2 - 14)
            d.line([(cx_, cy_ - 6), (cx_, cy_ + 18)], fill=mix(BRONZE_D, DARK, 0.3), width=3)
            d.polygon([(cx_ - 5, cy_ + 18), (cx_ + 5, cy_ + 18),
                       (cx_ + 13, cy_ + 48), (cx_ - 13, cy_ + 48)], fill=BRONZE)
            d.polygon([(cx_ - 13, cy_ + 48), (cx_ + 13, cy_ + 48),
                       (cx_ + 15, cy_ + 56), (cx_ - 15, cy_ + 56)], fill=BRONZE_D)
            d.line([(cx_ - 4, cy_ + 20), (cx_ - 10, cy_ + 46)], fill=BRONZE_L, width=2)
            for k in (-6, 0, 6):
                d.line([(cx_ + k, cy_ + 30), (cx_ + k, cy_ + 46)], fill=BRONZE_D, width=1)
        else:
            # 大鼓立在台面上，券门右侧
            dx_, dy_ = S(u1 - 1.30, v1 - 1.05, 0)
            d.ellipse([dx_ - 20, dy_ - 44, dx_ + 20, dy_ - 4], fill=(148, 56, 44),
                      outline=RED_D, width=3)
            d.ellipse([dx_ - 13, dy_ - 38, dx_ + 13, dy_ - 10], fill=(186, 108, 70))
            for k in range(8):
                a = math.pi * (k + 0.5) / 8
                d.ellipse([dx_ + 13 * math.cos(a) - 2, dy_ - 24 + 13 * math.sin(a) - 2,
                           dx_ + 13 * math.cos(a) + 2, dy_ - 24 + 13 * math.sin(a) + 2],
                          fill=GOLD)
            d.line([(dx_ - 20, dy_ - 24), (dx_ - 26, dy_ - 6)], fill=WOOD, width=4)
            d.line([(dx_ + 20, dy_ - 24), (dx_ + 26, dy_ - 6)], fill=WOOD, width=4)
        return cv


def poly_col(d, uu, hw, vf, z0, z1, c, cd, cl):
    quad(d, S(uu - hw, vf, z0), eu(2 * hw), ez(z1 - z0), c)
    d.line([S(uu + hw, vf, z0), S(uu + hw, vf, z1)], fill=cd, width=2)
    d.line([S(uu - hw, vf, z0), S(uu - hw, vf, z1)], fill=cl, width=1)


def run_tower():
    for v in ('bell', 'drum'):
        with Frame(390, 560):
            cv = build_tower(v)
        nm = 'city_tower_%s' % v
        emit(cv, nm,
             ('鼓楼' if v == 'drum' else '钟楼') + ' 5×5 三层：台基 0-28 + 一层 28-228（券门贯通、可穿行）'
             '+ 腰檐一 228-246 + 二层 268-330 + 腰檐二 330-346 + 三层 362-412 + 两坡顶 412-448'
             '+ 宝顶 448-466（全城最高点）',
             [TOWER_FP, TOWER_FP],
             extra={'tileable': False, 'landmark': True,
                    'elevation': {'base_z': T_BASE, 'eave1_z': T_E1, 'eave2_z': T_E2,
                                  'eave3_z': T_E3, 'roof_z': T_TOP, 'finial_z': T_RIDGE},
                    'elevation_note': '宝顶尖 466：比门楼正脊 406 高 60，比民居脊 210 高 256（≈5.5 人高）',
                    'arch': {'half_width_cells': 0.96, 'spring_z': 92, 'top_z': 140,
                             'passable': True, 'clear_width_px': 61, 'clear_height_px': 140},
                    'parts': ['stone_base', 'plinth', 'storey1', 'arch', 'plaque',
                              'eave1', 'storey2', 'eave2', 'storey3', 'roof', 'finial',
                              'bell' if v == 'bell' else 'drum'],
                    'stack_order': ['base', 'plinth', 'storey1', 'arch', 'plaque', 'storey2',
                                    'eave1', 'storey3', 'eave2', 'roof', 'finial', 'prop'],
                    'variant': v}, outline=(2.6, 1.2))
    print('tower done')
