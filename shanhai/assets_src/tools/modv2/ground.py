# -*- coding: utf-8 -*-
"""地面构件：平面纹理 -> 镜像无缝 -> 2:1 等距反采样成菱形地块（四向可平铺）。"""
import json
from paths import ROOT, MODULES, PREVIEW, GEN, CHAR, ISO_OUT, HERE, FONT_DIR, ensure
import os

import numpy as np
from PIL import Image

# GEN 由 paths 提供（相对仓库根推导）
OUT = MODULES
PPU = 96          # 每格 96 像素（平面纹理分辨率）


def seamless_tile(path, size=PPU * 2):
    im = Image.open(path).convert('RGB')
    side = int(min(im.size) * 0.42)          # 放大裁切，让石板尺度接近一格
    im = im.crop(((im.width - side) // 2, (im.height - side) // 2,
                  (im.width + side) // 2, (im.height + side) // 2)).resize((size, size), Image.LANCZOS)
    a = np.array(im)
    h = size // 2
    top = np.concatenate([a[:h, :h], a[:h, :h][:, ::-1]], axis=1)
    bot = np.concatenate([a[h:, :h][::-1, :], a[h:, :h][::-1, :][:, ::-1]], axis=1)
    return np.concatenate([top, bot], axis=0)


def iso_patch(tile, w=2, h=2):
    """把平面纹理按 x=(du-dv)*32, y=(du+dv)*16 反采样成 [w,h] 足迹菱形。"""
    W, H = (w + h) * 32, (w + h) * 16
    ys, xs = np.mgrid[0:H, 0:W]
    x = xs - W // 2                 # 相对前底顶点
    y = ys - (H - 1)                # 底行=锚点
    du = x / 64.0 + y / 32.0        # [-w,0]
    dv = y / 32.0 - x / 64.0        # [-h,0]
    u = (du + w) * PPU
    v = (dv + h) * PPU
    p = tile.shape[0]
    u0, v0 = u.astype(int) % p, v.astype(int) % p
    u1, v1 = (u0 + 1) % p, (v0 + 1) % p
    fu, fv = u - np.floor(u), v - np.floor(v)
    fu, fv = fu[:, :, None], fv[:, :, None]
    c00, c10 = tile[v0, u0], tile[v0, u1]
    c01, c11 = tile[v1, u0], tile[v1, u1]
    rgb = ((c00 * (1 - fu) + c10 * fu) * (1 - fv) + (c01 * (1 - fu) + c11 * fu) * fv)
    inside = (u >= 0) & (u <= w * PPU) & (v >= 0) & (v <= h * PPU)
    a = (inside * 255).astype(np.uint8)
    out = np.dstack([rgb.astype(np.uint8), a])
    return Image.fromarray(out, 'RGBA')


def emit(name, src, w=2, h=2, note=''):
    tile = seamless_tile(src)
    im = iso_patch(tile, w, h)
    im.save(os.path.join(OUT, name + '.png'))
    bb = im.getbbox()
    meta = {
        'name': name,
        'facing': 'ALL',
        'footprint': [w, h],
        'height_px': 0,
        'anchor': [0.5, 1.0],
        'tile': [64, 32],
        'tileable': {'u': True, 'v': True, 'seam': 'mirror'},
        'sprite_size': [im.width, im.height],
        'sprite_h_px': int(bb[3] - bb[1]),
        'ratio_to_char': 0,
        'margins_px': [int(bb[0]), int(bb[1]), int(im.width - bb[2]), int(im.height - bb[3])],
        'source': 'text_to_image plan texture + mirror seamless + 2:1 isometric inverse map',
        'outline_px': 0,
        'mirror_derived': False,
        'derive_op': 'source',
        'derived_from': None,
        'note': note,
    }
    with open(os.path.join(OUT, name + '.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
    print('%-14s %dx%d  margins=%s' % (name, im.width, im.height, meta['margins_px']))


if __name__ == '__main__':
    emit('ground_stone', os.path.join(GEN, 'ground_stone_plan.jpg'), 2, 2,
         '长青石错缝 + 倒角亮棱 + 裂纹苔痕，四向平铺')
    emit('ground_dirt', os.path.join(GEN, 'ground_dirt_plan.jpg'), 2, 2,
         '夯实土 + 碎石干草 + 车辙，四向平铺')
    # 3x3 平铺接缝自检
    from PIL import ImageDraw
    sheet = Image.new('RGB', (900, 520), (26, 30, 34))
    for i, name in enumerate(('ground_stone', 'ground_dirt')):
        im = Image.open(os.path.join(OUT, name + '.png')).convert('RGBA')
        ox, oy = 20 + i * 450, 200
        for a in range(3):
            for b in range(3):
                ax = (a - b) * 64
                ay = (a + b) * 32
                sheet.paste(im, (ox + ax - 64 + 225, oy + ay - 64 + 60), im)
    ImageDraw.Draw(sheet).text((30, 24), '地面 2×2 平铺接缝自检（左：石板 / 右：土）', fill=(230, 236, 242))
    sheet.save(os.path.join(PREVIEW, 'ground_tiles.png'))
    print('saved ground_tiles.png')
