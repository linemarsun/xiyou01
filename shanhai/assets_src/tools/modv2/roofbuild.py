# -*- coding: utf-8 -*-
"""屋顶：严格 2:1 等距，全部按足迹坐标解析生成，杜绝手工偏移。

统一坐标系（屋顶本地格坐标，原点 = 房子 (u,v)=(1,1)，即屏幕 p(1,1)=(0,32)）：
    S(u,v,z) = ((u-v)*32, (u+v)*16 + 32 - z)
屋顶足迹 u∈[0,4], v∈[0,4]，正脊线在 v=2：
    受光坡 SW：v∈[2,4]，檐边=近边 v=4+OVER（z=EAVE_Z），脊边 v=2（z=RIDGE_Z）
    背坡   NE：v∈[0,2]，檐边=远边 v=-OVER（z=EAVE_Z），脊边 v=2（z=RIDGE_Z）
    正脊   ：4×1 条，中心线 v=2，压在两坡交界
    山墙   ：u=4 端面，底边=墙顶 z=EAVE_Z，脊尖 z=RIDGE_Z，两侧博风板收头
锚点 anchor_cell 一律取足迹前底顶点；anchor_px 由 S() 直接算出，制图与摆位同一套数。
"""
import json
from paths import ROOT, MODULES, PREVIEW, GEN, CHAR, ISO_OUT, HERE, FONT_DIR, ensure
import os

import numpy as np
from PIL import Image, ImageDraw

import post as P

OUT_DIR = os.path.join(ROOT, 'assets_src', 'modules')

EAVE_Z = 170
RISE = 40                    # 脊比檐高：背坡可见带宽 ≈ 28.6*2.15-0.894*RISE ≈ 26px
RIDGE_Z = EAVE_Z + RISE      # 210（规格 200~230）
OVER = 0.15                  # 出檐 0.15 格 ≈ 4.3px（垂直檐线），压住墙顶并外挑
NCH = 10                     # 瓦垄数（沿檐口）
NCOURSE = 5                  # 瓦行数（沿坡长）
CREAM = np.array([247, 240, 221], np.float32)
BOX = (-165, -205, 330, 235)   # 统一作画窗口（绝对屏幕坐标 x0,y0,w,h）


def S(u, v, z=0.0):
    return ((u - v) * 32.0, (u + v) * 16.0 + 32.0 - z)


def A(u, v, z=0.0):
    """S() 结果换算到作画窗口内的像素坐标（crop_emit 用）。"""
    sx, sy = S(u, v, z)
    return (sx - BOX[0], sy - BOX[1])


def plane_frame(front):
    """返回 (O, UU, VV)：O=檐边左端(屏幕)，UU=沿檐口(沿 u 4 格)，VV=由檐边到脊边。"""
    ev = 4.0 + OVER if front else -OVER
    O = S(0.0, ev, EAVE_Z)
    UU = (128.0, 64.0)
    T = S(0.0, 2.0, RIDGE_Z)
    VV = (T[0] - O[0], T[1] - O[1])
    return O, UU, VV


def tile_tex(w=256, h=168):
    """(a,b) 空间瓦面明度场：筒瓦凸脊 + 板瓦凹槽 + 瓦头叠压。"""
    rng = np.random.RandomState(11)
    a = np.arange(w) / w
    b = np.arange(h) / h
    A, B = np.meshgrid(a, b)
    t = A * NCH
    ch = np.floor(t).astype(int)
    p = t - ch
    jit = rng.rand(NCH) * 0.14 - 0.07
    v = np.full((h, w), 0.46, np.float32)
    v[p < 0.05] = 0.16
    cap = (p >= 0.26) & (p < 0.84)
    u = np.clip((p - 0.26) / 0.58, 0, 1)
    v = np.where(cap, np.clip(1.00 - 1.55 * np.abs(u - 0.38), 0.20, 1.0), v)
    v = v + jit[ch]
    r = (B * NCOURSE) % 1.0
    v = np.where(r < 0.040, np.minimum(v + 0.42, 1.0), v)
    v = np.where((r >= 0.040) & (r < 0.085), v * 0.52, v)
    return np.clip(v, 0, 1).astype(np.float32)


STOPS = [(0.00, (26, 40, 52)), (0.40, (50, 76, 96)),
         (0.75, (86, 118, 138)), (1.00, (134, 164, 180))]


def ramp(v):
    xs = [s[0] for s in STOPS]
    out = np.zeros(v.shape + (3,), np.float32)
    for c in range(3):
        out[..., c] = np.interp(v, xs, [s[1][c] for s in STOPS])
    return out


def bil2(tex, sx, sy):
    h, w = tex.shape
    x0 = np.clip(np.floor(sx).astype(np.int32), 0, w - 1)
    y0 = np.clip(np.floor(sy).astype(np.int32), 0, h - 1)
    fx = sx - x0
    fy = sy - y0
    x1 = np.clip(x0 + 1, 0, w - 1)
    y1 = np.clip(y0 + 1, 0, h - 1)
    t = tex[y0, x0] * (1 - fx) + tex[y0, x1] * fx
    b = tex[y1, x0] * (1 - fx) + tex[y1, x1] * fx
    return t * (1 - fy) + b * fy


def make_plane(front, ref=None):
    O, UU, VV = plane_frame(front)
    W, H = BOX[2], BOX[3]
    ys, xs = np.mgrid[0:H, 0:W]
    px = (xs + BOX[0]).astype(np.float32)
    py = (ys + BOX[1]).astype(np.float32)
    rx, ry = px - O[0], py - O[1]
    det = UU[0] * VV[1] - UU[1] * VV[0]
    a = (rx * VV[1] - ry * VV[0]) / det
    b = (ry * UU[0] - rx * UU[1]) / det
    inside = (a >= -1e-4) & (a <= 1 + 1e-4) & (b >= 0) & (b <= 1)

    tex = TILE
    vv = bil2(tex, np.clip(a, 0, 1) * (tex.shape[1] - 1), np.clip(b, 0, 1) * (tex.shape[0] - 1))
    rgb = ramp(np.clip(vv, 0, 1))

    rgba = np.zeros((H, W, 4), np.float32)
    rgba[..., :3] = rgb
    rgba[..., 3] = np.where(inside, 255, 0)

    # 檐口剖面：用屏幕空间到檐线的垂距，保证两坡檐口厚度一致
    ul = (UU[0] ** 2 + UU[1] ** 2) ** 0.5
    ux, uy = UU[0] / ul, UU[1] / ul
    eave_d = np.abs(rx * uy - ry * ux)

    def band(mask, color, mix):
        m = inside & mask
        c = np.array(color, np.float32)
        rgba[..., :3][m] = rgba[..., :3][m] * (1 - mix) + c * mix

    band(eave_d < 2.3, (14, 21, 28), 0.70 if front else 0.42)    # 檐板暗线（背坡檐口弱化）
    band((eave_d >= 2.3) & (eave_d < 4.6), (188, 204, 212), 0.32 if front else 0.14)
    band(b > 0.982, (24, 38, 50), 0.45)                          # 贴脊极薄落影

    art = Image.fromarray(np.clip(rgba, 0, 255).astype(np.uint8), 'RGBA')
    surf = None
    if front:
        art = draw_tile_ends(art, O, UU)
        core = inside & (b >= 0.22) & (b <= 0.90) & (a >= 0.12) & (a <= 0.88)
        arr = np.array(art).astype(np.float32)
        m = core & (arr[..., 3] > 8)
        surf = float((arr[..., :3][m] @ np.array([.299, .587, .114], np.float32)).mean())
    else:
        art = relight_back(art, b, inside)
        if ref:
            core = inside & (b >= 0.22) & (b <= 0.90) & (a >= 0.12) & (a <= 0.88)
            arr = np.array(art).astype(np.float32)
            m = core & (arr[..., 3] > 8)
            surf = float((arr[..., :3][m] @ np.array([.299, .587, .114], np.float32)).mean())
            arr[..., :3] *= ref / max(surf, 1e-6)
            art = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), 'RGBA')
            surf = ref
    return art, surf


def draw_tile_ends(art, O, UU):
    """檐口一排瓦当（圆盘），只在受光坡：背坡檐口朝外，看不到正面。"""
    S4 = 4
    layer = Image.new('RGBA', (art.width * S4, art.height * S4), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    ox, oy = -BOX[0], -BOX[1]
    r = 3.9
    for i in range(NCH):
        t = (i + 0.5) / NCH
        x = O[0] + UU[0] * t
        y = O[1] + UU[1] * t
        cx, cy = (x + ox) * S4, (y + oy + 1.2) * S4
        d.ellipse([cx - r * S4, cy - r * S4, cx + r * S4, cy + r * S4], fill=(132, 158, 174, 255))
        d.ellipse([cx - r * S4, cy - r * S4, cx + r * S4, cy + r * S4],
                  outline=(20, 28, 36, 255), width=int(1.4 * S4))
        d.arc([cx - r * S4 * 0.75, cy - r * S4 * 0.95, cx + r * S4 * 0.55, cy + r * S4 * 0.35],
              200, 340, fill=(206, 220, 228, 255), width=int(1.1 * S4))
    layer = layer.resize(art.size, Image.LANCZOS)
    out = Image.new('RGBA', art.size, (0, 0, 0, 0))
    out.alpha_composite(art)
    out.alpha_composite(layer)
    return out


def relight_back(art, b, inside):
    """背坡独立成图：靛青环境光 + 脊侧略亮渐变 + 檐内米白反光（不做单一亮度乘法）。"""
    arr = np.array(art).astype(np.float32)
    al = arr[..., 3] > 8
    bb = np.clip(b, 0, 1)[..., None]
    arr[..., :3] *= (0.86 + 0.08 * bb)
    arr[..., :3] = arr[..., :3] * 0.88 + np.array([40, 66, 88], np.float32)[None, None, :] * 0.12
    m = (bb[..., 0] < 0.13) & al
    t = np.clip(1 - bb[..., 0] / 0.13, 0, 1)[..., None] * 0.24
    arr[..., :3] = np.where(m[..., None], arr[..., :3] * (1 - t) + CREAM * t, arr[..., :3])
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), 'RGBA')


def make_ridge():
    """4×1 正脊：4 个角点全由 S() 给出，菱形中线 = 两坡交界线。"""
    S4 = 4
    W, H = BOX[2], BOX[3]
    im = Image.new('RGBA', (W * S4, H * S4), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    ox, oy = -BOX[0], -BOX[1]

    P0 = S(0, 2, RIDGE_Z)
    P1 = S(4, 2, RIDGE_Z)
    dx, dy = P1[0] - P0[0], P1[1] - P0[1]
    ln = (dx * dx + dy * dy) ** 0.5
    ux, uy = dx / ln, dy / ln
    nx, ny = -uy, ux           # 屏幕下方为正

    TOP, MID, BOT = -5.5, 1.0, 8.5       # 顶面 / 棱线 / 前脸
    EARS = 7.0

    def poly(pts, fill):
        d.polygon([((x + ox) * S4, (y + oy) * S4) for (x, y) in pts], fill=fill)

    n = 48
    for i in range(n):
        t0, t1 = i / n, (i + 1) / n
        p0 = (P0[0] + dx * t0 + nx * TOP, P0[1] + dy * t0 + ny * TOP)
        p1 = (P0[0] + dx * t1 + nx * TOP, P0[1] + dy * t1 + ny * TOP)
        q0 = (P0[0] + dx * t0 + nx * MID, P0[1] + dy * t0 + ny * MID)
        q1 = (P0[0] + dx * t1 + nx * MID, P0[1] + dy * t1 + ny * MID)
        r0 = (P0[0] + dx * t0 + nx * BOT, P0[1] + dy * t0 + ny * BOT)
        r1 = (P0[0] + dx * t1 + nx * BOT, P0[1] + dy * t1 + ny * BOT)
        poly([p0, p1, q1, q0], (148, 172, 188, 255))       # 顶面（脊筒受光）
        poly([q0, q1, r1, r0], (38, 60, 78, 255))          # 前脸（背光）
        poly([p0, p1, (p1[0] + nx * 2.0, p1[1] + ny * 2.0),
              (p0[0] + nx * 2.0, p0[1] + ny * 2.0)], (186, 139, 48, 255))
    # 脊顶亮金 + 前脸下水线
    for off, col, wd in ((-6.2, (228, 188, 108, 255), 1.0),
                         (0.8, (186, 139, 48, 255), 1.2),
                         (8.2, (18, 26, 34, 190), 2.4)):
        d.line([((P0[0] + nx * off + ox) * S4, (P0[1] + ny * off + oy) * S4),
                ((P1[0] + nx * off + ox) * S4, (P1[1] + ny * off + oy) * S4)],
               fill=col, width=int(wd * S4))
    # 两端上翘脊头（略微伸出端面）
    for (px, py), sgn in ((P0, -1), (P1, 1)):
        ex = px + ux * EARS * sgn
        ey = py + uy * EARS * sgn
        poly([(px, py + BOT), (ex, ey + BOT - 3), (ex, ey + TOP - 5), (px, py + TOP - 5)],
             (46, 72, 90, 255))
        poly([(px, py + TOP - 5), (ex, ey + TOP - 5),
              (ex, ey + TOP - 2), (px, py + TOP - 2)], (186, 139, 48, 255))
    art = im.resize((W, H), Image.LANCZOS)
    return P.add_outline(art, erode=0.8), A(4, 2.5, RIDGE_Z)


def make_gable():
    """u=4 端面山墙：底边=墙顶 z=EAVE_Z（贴住墙顶），三角尖=正脊 z=RIDGE_Z，博风板收头。"""
    S4 = 4
    W, H = BOX[2], BOX[3]
    im = Image.new('RGBA', (W * S4, H * S4), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    ox, oy = -BOX[0], -BOX[1]

    def pt(x, y):
        return ((x + ox) * S4, (y + oy) * S4)

    def poly(pts, fill):
        d.polygon([pt(*q) for q in pts], fill=fill)

    Lo = S(4, 4, EAVE_Z)      # (0,-10) 墙顶低端
    Hi = S(4, 0, EAVE_Z)      # (128,-74) 墙顶高端
    Ap = S(4, 2, RIDGE_Z)     # (64,-100) 脊尖
    mx = (Lo[0] + Hi[0]) / 2.0
    my = (Lo[1] + Hi[1]) / 2.0

    poly([Lo, Hi, Ap], (238, 231, 212, 255))              # 山花底（粉墙）

    # 红山花：向内收一圈，外圈留粉墙边
    def inset(p, k):
        return (p[0] + (Ap[0] - p[0]) * k, p[1] + (Ap[1] - p[1]) * k)

    poly([inset(Lo, 0.20), inset(Hi, 0.20), inset(Ap, 0.28)], (154, 58, 45, 255))

    # 墙顶压边（梁枋）
    poly([Lo, Hi, (Hi[0], Hi[1] + 7), (Lo[0], Lo[1] + 7)], (142, 54, 44, 255))
    poly([Lo, Hi, (Hi[0], Hi[1] + 2.2), (Lo[0], Lo[1] + 2.2)], (196, 96, 74, 255))

    # 两侧博风板（压在坡面端头外侧）+ 内侧落影 + 赭金压边
    for (P0, P1) in ((Lo, Ap), (Hi, Ap)):
        dxx, dyy = P1[0] - P0[0], P1[1] - P0[1]
        ln = (dxx * dxx + dyy * dyy) ** 0.5
        nx2, ny2 = -dyy / ln, dxx / ln
        if ny2 < 0:
            nx2, ny2 = -nx2, -ny2
        nx2, ny2 = -nx2, -ny2                       # 取朝外法向
        poly([P0, P1, (P1[0] + nx2 * 4.5, P1[1] + ny2 * 4.5),
              (P0[0] + nx2 * 4.5, P0[1] + ny2 * 4.5)], (58, 46, 40, 255))
        d.line([pt(P1[0] + nx2 * 4.5, P1[1] + ny2 * 4.5),
                pt(P0[0] + nx2 * 4.5, P0[1] + ny2 * 4.5)],
               fill=(186, 139, 48, 255), width=int(1.4 * S4))
        for i in range(3):
            t = i / 2.0
            off = -1.0 - i * 1.6
            d.line([pt(P0[0] + nx2 * off, P0[1] + ny2 * off),
                    pt(P1[0] + nx2 * off, P1[1] + ny2 * off)],
                   fill=(0, 0, 0, int(70 * (1 - t * 0.55))), width=int(1.2 * S4))
    # 悬鱼
    poly([(Ap[0], Ap[1] + 5), (Ap[0] + 5, Ap[1] + 11), (Ap[0], Ap[1] + 18),
          (Ap[0] - 5, Ap[1] + 11)], (186, 139, 48, 255))
    art = im.resize((W, H), Image.LANCZOS)
    return P.add_outline(art, erode=2.0), A(4, 4, EAVE_Z)


def crop_emit(base, facing, art, anchor, fp, anchor_cell, src=None, op='source', note=''):
    bb = art.getbbox()
    x0 = max(0, min(bb[0] - 2, int(anchor[0]) - 2))
    y0 = max(0, min(bb[1] - 2, int(anchor[1]) - 2))
    x1 = min(art.width, max(bb[2] + 2, int(anchor[0]) + 3))
    y1 = min(art.height, max(bb[3] + 2, int(anchor[1]) + 3))
    cut = art.crop((x0, y0, x1, y1))
    apx = [int(round(anchor[0] - x0)), int(round(anchor[1] - y0))]
    name = '%s_%s' % (base, facing)
    cut.save(os.path.join(OUT_DIR, name + '.png'))
    bbx = cut.getbbox()
    meta = {
        'name': base, 'facing': facing.upper(), 'footprint': list(fp),
        'height_px': RIDGE_Z,
        'anchor': [0.5, 1.0],
        'anchor_cell': list(anchor_cell),
        'anchor_px': apx,
        'anchor_note': 'anchor_cell=足迹前底顶点（格）；anchor_px=sprite 内像素坐标',
        'tile': [64, 32], 'tileable': True,
        'sprite_size': [cut.width, cut.height],
        'sprite_h_px': int(bbx[3] - bbx[1]),
        'ratio_to_char': round((bbx[3] - bbx[1]) / 84, 2),
        'margins_px': [int(bbx[0]), int(bbx[1]), int(cut.width - bbx[2]),
                       int(cut.height - bbx[3])],
        'source': note or '程序化瓦垄(a,b 参数空间) + 2:1 等距反投影',
        'outline_px': P.OUTLINE,
        'mirror_derived': src is not None,
        'derive_op': op,
        'derived_from': src,
    }
    with open(os.path.join(OUT_DIR, name + '.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
    print('%-18s %dx%d h=%d anchor=%s cell=%s' %
          (name, cut.width, cut.height, meta['sprite_h_px'], apx, anchor_cell))
    return cut


def main():
    W = BOX[2]

    front, lf = make_plane(True)
    fa = P.add_outline(front, erode=0.7)
    sa = A(4, 4, EAVE_Z)
    crop_emit('roof_slope', 'sw', fa, sa, (4, 2), (4, 2),
              note='程序化瓦垄 + 2:1 反投影 + 瓦当；檐口 z=170，脊 z=228，出檐 0.15 格')

    back, lb = make_plane(False, ref=lf * 0.845)
    ba = P.add_outline(back, erode=0.7)
    na = A(4, 0, EAVE_Z)
    crop_emit('roof_slope', 'ne', ba, na, (4, 2), (4, 0),
              note='背坡独立成图：同瓦垄同檐口，靛青环境光 + 檐内米白反光，亮度=受光坡 0.845')

    # 镜像派生的另两个朝面（本场景不用，保持四向齐全）
    m = fa.transpose(Image.FLIP_LEFT_RIGHT)
    crop_emit('roof_slope', 'se', m, (W - 1 - sa[0], sa[1]), (4, 2), (2, 4),
              src='roof_slope_sw', op='mirror_h')
    m = ba.transpose(Image.FLIP_LEFT_RIGHT)
    crop_emit('roof_slope', 'nw', m, (W - 1 - na[0], na[1]), (4, 2), (0, 4),
              src='roof_slope_ne', op='mirror_h')

    ridge, ra = make_ridge()
    crop_emit('roof_ridge', 'sw', ridge, ra, (4, 1), (4, 1),
              note='4×1 正脊，菱形中线压在两坡交界 v=2，z=228')
    m = ridge.transpose(Image.FLIP_LEFT_RIGHT)
    crop_emit('roof_ridge', 'se', m, (W - 1 - ra[0], ra[1]), (4, 1), (1, 4),
              src='roof_ridge_sw', op='mirror_h')
    crop_emit('roof_ridge', 'ne', ridge, ra, (4, 1), (4, 1),
              note='正脊（NE 视角同源）')
    crop_emit('roof_ridge', 'nw', m, (W - 1 - ra[0], ra[1]), (4, 1), (1, 4),
              src='roof_ridge_ne', op='mirror_h')

    gable, ga = make_gable()
    crop_emit('roof_gable', 'se', gable, ga, (1, 4), (1, 4),
              note='山墙端面：底边贴墙顶 z=170，脊尖 z=228，两坡端头封口')
    mg = gable.transpose(Image.FLIP_LEFT_RIGHT)
    crop_emit('roof_gable', 'sw', mg, (W - 1 - ga[0], ga[1]), (1, 4), (0, 4),
              src='roof_gable_se', op='mirror_h')

    print('檐 z=%d 脊 z=%d RISE=%d 出檐≈4.3px  瓦面亮度 受光 %.1f / 背坡 %.1f -> %.3f'
          % (EAVE_Z, RIDGE_Z, RISE, lf, lb, lb / lf))


TILE = tile_tex()

if __name__ == '__main__':
    main()
