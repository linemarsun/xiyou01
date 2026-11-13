# -*- coding: utf-8 -*-
"""生成 assets_v2/modules 下的 12 件构件 + 拼装示意图。"""
import json
from paths import ROOT, MODULES, PREVIEW, GEN, CHAR, ISO_OUT, HERE, FONT_DIR, ensure
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from kit import Sprite, C, co  # noqa: E402
import parts  # noqa: E402

OUT_DIR = os.path.join(ROOT, 'assets_src', 'modules')
MOCK = os.path.join(ROOT, 'assets_src', 'preview', 'modules_street_corner.png')
CHAR = os.path.join(ROOT, 'assets_src', 'sprites', 'xiake', 'idle_0.png')
CHAR_H = 84

# 每件的世界高度（离地像素，用于 JSON 与比例汇报）
WORLD_H = {
    'ground_stone': 0, 'ground_dirt': 0,
    'roof_slope': 48, 'roof_ridge': 43,
    'wall_wood': 155, 'wall_plaster': 155,
    'gate_arch': 223, 'stairs': 30, 'fence': 44,
    'tree_pine': 186, 'stall': 108, 'lantern_post': 150,
}


def build_one(name, fn, fp, facing, tileable, hint):
    S = Sprite(fp[0], fp[1], hint)
    fn(S)
    img, (T, B) = S.finish()
    path = os.path.join(OUT_DIR, name + '.png')
    img.save(path)
    bb = img.getbbox()
    sw, sh = img.size
    meta = {
        'name': name,
        'footprint': [fp[0], fp[1]],
        'height_px': WORLD_H[name],
        'anchor': [0.5, 1.0],
        'tile': [64, 32],
        'tileable': bool(tileable),
        'facing': facing,
        'sprite_size': [sw, sh],
        'sprite_h_px': int(bb[3] - bb[1]),
        'ratio_to_char': round((bb[3] - bb[1]) / CHAR_H, 2),
        'margins_px': [int(bb[0]), int(bb[1]), int(sw - bb[2]), int(sh - bb[3])],
    }
    with open(os.path.join(OUT_DIR, name + '.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
    return img, meta


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    out = {}
    rows = []
    for (name, fn, fp, facing, tileable, hint) in parts.PARTS:
        img, meta = build_one(name, fn, fp, facing, tileable, hint)
        out[name] = img
        rows.append(meta)
        print('%-14s %sx%s  bbox=%s  margins=%s' % (name, meta['sprite_size'][0],
                                                    meta['sprite_size'][1],
                                                    meta['sprite_h_px'], meta['margins_px']))
    build_mock(out)
    print('mock saved:', MOCK)
    with open(os.path.join(OUT_DIR, '_report.json'), 'w', encoding='utf-8') as f:
        json.dump(rows, f, ensure_ascii=False, indent=1)


# ------------------------------------------------------------------ 拼装示意
def build_mock(mods):
    W, H = 1180, 760
    OX, OY = 470, 640
    canvas = Image.new('RGBA', (W, H), (24, 27, 30, 255))
    d = ImageDraw.Draw(canvas)

    def corner(i, j, z=0):
        return (OX + (i - j) * 32, OY + (i + j) * 16 - z)

    # 地面：石板广场 + 土路街道
    ground_items = []
    for j in range(-3, 4):
        for i in range(-3, 9):
            street = (j in (0, 1))
            nm = 'ground_dirt' if street else 'ground_stone'
            g = mods[nm]
            x, y = corner(i + 1, j + 1)
            canvas.alpha_composite(g, (int(x - g.width / 2), int(y - (g.height - 2)))
                                   if False else (int(x - g.width // 2), int(y - g.height + 2)))
            ground_items.append((i, j))
    # 网格参考线（很淡，帮助看拼装关系）
    for i in range(-3, 10):
        a = corner(i, -3)
        b = corner(i, 4)
        d.line([a, b], fill=(255, 255, 255, 16), width=1)
    for j in range(-3, 5):
        a = corner(-3, j)
        b = corner(9, j)
        d.line([a, b], fill=(255, 255, 255, 16), width=1)

    items = []

    def add(name, a, b, z=0):
        items.append((b, a, name, a, b, z))

    # 两栋房：墙身 2×1 + 4×2 坡面 + 正脊
    add('wall_wood', 3, 0)
    add('wall_plaster', 5, 0)
    add('roof_slope', 5, 0, 155)
    add('roof_ridge', 5, -1, 203)
    add('wall_plaster', 8, 0)
    add('wall_wood', 10, 0)
    add('roof_slope', 10, 0, 155)
    add('roof_ridge', 10, -1, 203)
    add('stairs', 4, 1)
    add('fence', 4, 3)
    add('stall', 5, 3)
    add('tree_pine', 8, 3, 0)
    add('lantern_post', 2, 2)

    items.sort(key=lambda it: (it[0], it[1]))
    for (_, _, name, a, b, z) in items:
        g = mods[name]
        x, y = corner(a, b, z)
        canvas.alpha_composite(g, (int(x - g.width // 2), int(y - g.height + 2)))

    # 角色（84px 高，脚踩格心）
    ch = Image.open(CHAR).convert('RGBA')
    bb = ch.getbbox()
    f = CHAR_H / (bb[3] - bb[1])
    cw, chh = int(ch.width * f), int(ch.height * f)
    ch = ch.resize((cw, chh), Image.LANCZOS)
    bx = (bb[0] + bb[2]) / 2 * f
    by = bb[3] * f
    cx, cy = corner(2.5, 0.5)
    canvas.alpha_composite(ch, (int(cx - bx), int(cy - by)))

    # 底部标注：地块 64×32 / 角色 84px
    d.line([(30, H - 46), (30 + 64, H - 46)], fill=(230, 220, 190, 180), width=2)
    d.text((30, H - 42), 'tile 64x32  |  char 84px  |  anchor 0.5,1.0', fill=(220, 210, 186, 200))
    canvas.convert('RGB').save(MOCK)


if __name__ == '__main__':
    main()
