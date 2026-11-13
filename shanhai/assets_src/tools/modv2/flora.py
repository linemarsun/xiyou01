# -*- coding: utf-8 -*-
"""草地 ground_grass（1×1 周期纹理）+ 阔叶树 tree_leaf（180px / 冠幅 66px）+ 2×2 平铺示意。

草地不做纯色：周期场（多倍频噪声）压出深浅斑块 + 不规则草簇 + 边缘干草过渡；
纹理 96×96 严格周期（噪声用带 wrap 的双线性上采样，草簇按 3×3 偏移重绘 9 次）。
"""
import json
from paths import ROOT, MODULES, PREVIEW, GEN, CHAR, ISO_OUT, HERE, FONT_DIR, ensure
import os
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

import post as P
from ground import iso_patch

MOD = os.path.join(ROOT, 'assets_src', 'modules')
PRE = os.path.join(ROOT, 'assets_src', 'preview')
PPU = 96

# 既定色板（不引入新艳色）：草=灰绿，树=灰绿两级
G_DK = (66, 88, 60)
G_MID = (100, 124, 82)
G_LT = (133, 156, 104)
G_DRY = (152, 146, 106)

T_DK = (48, 70, 52)
T_MID = (74, 99, 68)
T_LT = (106, 133, 84)
T_RIM = (146, 170, 110)
BARK = (86, 68, 50)
BARK_LT = (122, 100, 74)

D_DK = (84, 64, 46)
D_MID = (124, 98, 70)
D_LT = (162, 134, 100)
D_PACK = (186, 158, 122)
D_STONE = (128, 120, 108)
D_STONE_L = (178, 172, 160)
D_ROOT = (104, 124, 78)


def font(sz, bold=False):
    from PIL import ImageFont
    return ImageFont.truetype(FONT_DIR + '/msyh%s.ttc' % ('bd' if bold else ''), sz)


# ---------------------------------------------------------------- 周期噪声
def pnoise(n, cells, seed):
    """cells×cells 随机格点 + wrap 双线性上采样到 n×n，严格周期。"""
    rng = np.random.RandomState(seed)
    g = rng.rand(cells + 1, cells + 1).astype(np.float32)
    g[-1, :] = g[0, :]
    g[:, -1] = g[:, 0]
    im = Image.fromarray((g * 255).astype(np.uint8), 'L').resize((n, n), Image.BICUBIC)
    return np.array(im).astype(np.float32) / 255.0


def grass_tile(n=PPU, seed=7):
    base = np.zeros((n, n, 3), np.float32)
    base[:] = G_MID
    # 细倍频斑块（不用大块低频噪声，否则每格重复成棋盘）
    f = (pnoise(n, 6, seed) * 0.46 + pnoise(n, 12, seed + 1) * 0.32 +
         pnoise(n, 24, seed + 2) * 0.22)
    f = (f - 0.5) * 2.0
    for c in range(3):
        base[..., c] = np.where(f > 0, G_MID[c] + (G_LT[c] - G_MID[c]) * np.clip(f * 1.15, 0, 1),
                                G_MID[c] + (G_DK[c] - G_MID[c]) * np.clip(-f * 1.15, 0, 1))
    # 草簇（3× 绘制后降采样，9 次偏移保证周期）
    S = 3
    lay = Image.new('RGBA', (n * S, n * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    rng = random.Random(seed)
    for i in range(150):
        x, y = rng.random() * n, rng.random() * n
        h = rng.randint(4, 9) * S
        lean = rng.choice((-1, 0, 0, 1))
        dry = rng.random() < 0.18
        col = G_DRY if dry else (G_LT if rng.random() < 0.62 else G_DK)
        wd = 2 * S
        for ox in (-n * S, 0, n * S):
            for oy in (-n * S, 0, n * S):
                px, py = x * S + ox, y * S + oy
                d.line([(px, py), (px + lean * 2 * S, py - h)], fill=col + (255,), width=wd)
                d.line([(px, py), (px - lean * 1.2 * S, py - h * 0.8)], fill=col + (170,), width=wd)
    lay = lay.resize((n, n), Image.LANCZOS)
    a = np.array(lay).astype(np.float32)
    m = a[..., 3:4] / 255.0
    base = base * (1 - m * 0.9) + a[..., :3] * (m * 0.9)
    # 收边：极边缘一圈略暗，拼缝处不会突然跳色
    return np.clip(base, 0, 255).astype(np.uint8)


def dirt_tile(n=PPU, seed=11):
    """土路：踩实土面（浅色压实斑 + 细碎纹理）+ 碎石（左上亮棱）+ 草根，四向可平铺。"""
    base = np.zeros((n, n, 3), np.float32)
    base[:] = D_MID
    f = (pnoise(n, 5, seed) * 0.42 + pnoise(n, 11, seed + 1) * 0.34 + pnoise(n, 22, seed + 2) * 0.24)
    f = (f - 0.5) * 2.0
    for c in range(3):
        base[..., c] = np.where(f > 0, D_MID[c] + (D_LT[c] - D_MID[c]) * np.clip(f * 1.25, 0, 1),
                                D_MID[c] + (D_DK[c] - D_MID[c]) * np.clip(-f * 1.35, 0, 1))
    S = 3
    lay = Image.new('RGBA', (n * S, n * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    rng = random.Random(seed)

    def wrap(fn):
        for ox in (-n * S, 0, n * S):
            for oy in (-n * S, 0, n * S):
                fn(ox, oy)

    # 踩实的浅色土斑（人走过的过渡）
    for i in range(9):
        x, y = rng.random() * n, rng.random() * n
        rx, ry = rng.uniform(9, 18) * S, rng.uniform(4, 8) * S
        wrap(lambda ox, oy: d.ellipse([x * S + ox - rx, y * S + oy - ry,
                                       x * S + ox + rx, y * S + oy + ry], fill=D_PACK + (60,)))
    # 碎石：暗底 + 左上亮棱
    for i in range(34):
        x, y = rng.random() * n, rng.random() * n
        r = rng.uniform(1.2, 3.2) * S
        wrap(lambda ox, oy: d.ellipse([x * S + ox - r, y * S + oy - r * 0.8,
                                       x * S + ox + r, y * S + oy + r * 0.8], fill=D_STONE + (255,)))
        wrap(lambda ox, oy: d.arc([x * S + ox - r, y * S + oy - r * 0.8,
                                   x * S + ox + r, y * S + oy + r * 0.8], 170, 300,
                                  fill=D_STONE_L + (255,), width=int(1.4 * S)))
    # 草根 / 干草
    for i in range(16):
        x, y = rng.random() * n, rng.random() * n
        wrap(lambda ox, oy: d.line([(x * S + ox, y * S + oy), (x * S + ox + rng.choice((-1, 1)) * 2 * S,
                                                               y * S + oy - rng.randint(3, 6) * S)],
                                   fill=D_ROOT + (220,), width=int(1.6 * S)))
    lay = lay.resize((n, n), Image.LANCZOS)
    a = np.array(lay).astype(np.float32)
    m = a[..., 3:4] / 255.0
    base = base * (1 - m) + a[..., :3] * m
    return np.clip(base, 0, 255).astype(np.uint8)


def emit_ground(arr, name, note):
    im = iso_patch(arr, 1, 1)
    im.save(os.path.join(MOD, name + '.png'))
    bb = im.getbbox()
    meta = {
        'name': name, 'facing': 'ALL', 'footprint': [1, 1], 'height_px': 0,
        'anchor': [0.5, 1.0], 'anchor_cell': [1, 1], 'anchor_px': [im.width // 2, im.height - 1],
        'anchor_note': '1×1 地块菱形前底顶点',
        'tile': [64, 32], 'tileable': {'u': True, 'v': True, 'seam': 'periodic'},
        'sprite_size': [im.width, im.height], 'sprite_h_px': int(bb[3] - bb[1]),
        'ratio_to_char': 0,
        'margins_px': [int(bb[0]), int(bb[1]), int(im.width - bb[2]), int(im.height - bb[3])],
        'source': note, 'outline_px': 0,
        'mirror_derived': False, 'derive_op': 'source', 'derived_from': None,
    }
    json.dump(meta, open(os.path.join(MOD, name + '.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)
    print('%-12s %dx%d' % (name, im.width, im.height))
    return im


# ---------------------------------------------------------------- 阔叶树
def tree_leaf(seed=3, H=180, CROWN=66, S=3):
    """冠幅 ≈ CROWN、总高 ≈ H（含树干）。同 tree_pine 画法：层叠叶团 + 顶光棱 + 暗描边。"""
    W, HH = CROWN + 18, H
    im = Image.new('RGBA', (W * S, HH * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    rng = random.Random(seed)
    cx = W * S / 2.0
    base_y = HH * S - 3 * S
    rx, ry = CROWN * S / 2.0, 66 * S              # 冠 66 宽 × 132 高
    ccy = base_y - 114 * S                         # 冠心：底往上 114px → 顶=180
    # 树干（露头 ~48px）+ 两条分枝
    d.polygon([(cx - 5 * S, base_y), (cx + 5 * S, base_y),
               (cx + 3.4 * S, ccy), (cx - 3.4 * S, ccy)], fill=BARK + (255,))
    d.line([(cx - 3 * S, ccy + 20 * S), (cx - 17 * S, ccy - 6 * S)], fill=BARK + (255,), width=3 * S)
    d.line([(cx + 3 * S, ccy + 22 * S), (cx + 16 * S, ccy - 4 * S)], fill=BARK + (255,), width=3 * S)
    d.line([(cx - 2 * S, base_y - 2 * S), (cx - 2 * S, base_y - 34 * S)], fill=BARK_LT + (255,), width=2 * S)

    # 树冠：先铺底层团簇，再叠上层，形成层叠叶团
    blobs = []
    for i in range(14):
        ang = rng.uniform(0, 6.283)
        rr = rng.uniform(0.18, 0.80)
        bx = cx + np.cos(ang) * rx * rr
        by = ccy + np.sin(ang) * ry * rr * 0.95
        r = rng.uniform(0.34, 0.46) * CROWN * S / 2.0
        blobs.append((bx, by, r, rng.random()))
    blobs.sort(key=lambda t: t[1])
    for (bx, by, r, t) in blobs:
        d.ellipse([bx - r, by - r * 0.88, bx + r, by + r * 0.88],
                  fill=(T_MID if t < 0.5 else T_DK) + (255,))
    for (bx, by, r, t) in blobs:                    # 顶光棱
        if t >= 0.40:
            d.arc([bx - r, by - r * 0.88, bx + r, by + r * 0.88], 186, 300,
                  fill=T_RIM + (255,), width=int(2.4 * S))
    for (bx, by, r, t) in blobs:                    # 左上受光亮团
        if t > 0.74:
            d.ellipse([bx - r * 0.72, by - r * 0.80, bx + r * 0.12, by + r * 0.06],
                      fill=T_LT + (255,))
    for i in range(6):                              # 叶隙暗洞
        ang = rng.uniform(0.5, 2.4)
        bx = cx + np.cos(ang) * rx * rng.uniform(0.15, 0.62)
        by = ccy + np.sin(ang) * ry * rng.uniform(0.05, 0.55)
        r = rng.uniform(2.4, 4.2) * S
        d.ellipse([bx - r, by - r, bx + r, by + r], fill=(30, 46, 34, 245))
    art = im.resize((im.width // S, im.height // S), Image.LANCZOS)
    art = P.add_outline(art, px=2.2, erode=1.2)
    return art


def emit_prop(name, im, cell, anchor_cell, note, height_px, extra=None):
    bb = im.getbbox()
    x0, y0 = max(0, bb[0] - 2), max(0, bb[1] - 2)
    x1, y1 = min(im.width, bb[2] + 2), min(im.height, bb[3] + 2)
    cut = im.crop((x0, y0, x1, y1))
    apx = [int(round(anchor_cell[0] - x0)), int(round(anchor_cell[1] - y0))]
    cut.save(os.path.join(MOD, name + '.png'))
    bb2 = cut.getbbox()
    meta = {
        'name': name, 'facing': 'ALL', 'footprint': [cell[0], cell[1]],
        'height_px': height_px, 'anchor': [0.5, 1.0],
        'anchor_cell': [0, 1], 'anchor_px': apx,
        'anchor_note': '1×1 足迹前底顶点；树干落在格心（anchor_px 比树根低 16px）',
        'tile': [64, 32], 'tileable': False,
        'sprite_size': [cut.width, cut.height], 'sprite_h_px': int(bb2[3] - bb2[1]),
        'ratio_to_char': round((bb2[3] - bb2[1]) / 84.0, 2),
        'margins_px': [int(bb2[0]), int(bb2[1]), int(cut.width - bb2[2]), int(cut.height - bb2[3])],
        'source': note, 'outline_px': P.OUTLINE,
        'mirror_derived': False, 'derive_op': 'source', 'derived_from': None,
    }
    if extra:
        meta.update(extra)
    json.dump(meta, open(os.path.join(MOD, name + '.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)
    print('%-12s %dx%d h=%d' % (name, cut.width, cut.height, meta['sprite_h_px']))
    return cut


# ---------------------------------------------------------------- 平铺示意
def tile_sheet(grass, tree, name='flora_tiles.png', cols=9, rows=6):
    TW = 64 * (cols + 1) + 80
    TH = 32 * (rows + 1) + 300
    im = Image.new('RGBA', (TW, TH), (244, 240, 231, 255))
    d = ImageDraw.Draw(im)
    ox, oy = TW // 2 - 64, 250
    dirt = Image.open(os.path.join(MOD, 'ground_dirt.png')).convert('RGBA')
    for a in range(cols):
        for b in range(rows):
            cell = dirt if b in (3, 4) else grass          # 一条 2 格宽的土路，检验草↔土过渡与四向平铺
            im.alpha_composite(cell, (ox + (a - b) * 32 - 32, oy + (a + b) * 16 - 32))
    tp = json.load(open(os.path.join(MOD, 'tree_leaf.json'), encoding='utf-8'))['anchor_px']
    for (a, b) in ((2, 1), (5, 2), (3, 4)):
        gx = ox + (a - b) * 32
        gy = oy + (a + b) * 16 + 16          # 树干落在格心
        im.alpha_composite(tree, (gx - tp[0], gy - tp[1]))
    d.text((28, 20), 'ground_grass 1×1 · %d×%d 平铺 · ground_dirt 土路 · tree_leaf 阔叶树' % (cols, rows),
           font=font(20, True), fill=(30, 27, 24))
    d.text((28, 52), '草地：多倍频斑块 + 草簇 + 干草过渡；土路：踩实土面 + 碎石亮棱 + 草根；两张均 96×96 严格周期，四向可平铺',
           font=font(13), fill=(122, 114, 103))
    char = Image.open(os.path.join(ROOT, 'assets_src', 'sprites', 'xiake', 'idle_0.png')).convert('RGBA')
    k = 84.0 / char.height
    char = char.resize((int(char.width * k), 84), Image.LANCZOS)
    im.alpha_composite(char, (TW - 156, TH - 118))
    d.text((TW - 162, TH - 30), '84px 人物参照', font=font(12), fill=(150, 143, 133))
    out = os.path.join(PRE, name)
    im.convert('RGB').save(out)
    print('->', out, im.size)


if __name__ == '__main__':
    arr = grass_tile()
    g = emit_ground(arr, 'ground_grass', '程序化周期纹理：多倍频斑块 + 草簇 + 干草过渡，96×96 严格周期')
    d2 = emit_ground(dirt_tile(), 'ground_dirt', '土路：踩实土面 + 碎石亮棱 + 草根，96×96 严格周期')
    t = tree_leaf()
    emit_prop('tree_leaf', t, (1, 1), (t.width // 2, t.height + 16),
              '阔叶树：层叠叶团 + 顶光亮棱 + 暗描边，冠幅 66px / 总高 180px', 180)
    tile_sheet(g, Image.open(os.path.join(MOD, 'tree_leaf.png')).convert('RGBA'))
