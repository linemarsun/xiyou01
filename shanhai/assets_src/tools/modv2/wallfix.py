# -*- coding: utf-8 -*-
"""墙板几何重建：从原始生成图直接归一到严格等距几何。

面状构件规格：
  面长 4 个等距格 = 128px（水平跨度），面高 170px，底边斜率 ±0.5（2:1 等距）。
  锚点 = 面底边的低端 = 足迹前底顶点（SW/NE 取 4×1，SE/NW 取 1×4）。

实现：三点仿射把 (底边低端, 底边高端, 顶端高端) 映射到严格 2:1 平行四边形的对应点，
      再补统一外描边、按锚点裁切。
"""
import json
from paths import ROOT, MODULES, PREVIEW, GEN, CHAR, ISO_OUT, HERE, FONT_DIR, ensure
import os

import numpy as np
from PIL import Image

import post as P

GEN = os.path.join(ROOT, 'assets_src', 'preview', 'gen')
MOD = os.path.join(ROOT, 'assets_src', 'modules')
FACE_LEN = 128          # 4 格
WALL_H = 170            # 面高
PAD = 4

# 面在画布中的三个基准点（画布尺寸 CW×CH）
CW = FACE_LEN + PAD * 2                    # 136
CH = WALL_H + FACE_LEN // 2 + PAD * 2       # 170 + 64 + 8 = 242
T_BASE_LO = (CW - PAD, CH - PAD)                    # 底边低端 = 锚点
T_BASE_HI = (PAD, CH - PAD - FACE_LEN // 2)         # 底边高端
T_TOP_HI = (PAD, PAD)                               # 与底边高端同列的顶端


def edges(im, thr=10):
    a = np.array(im)[..., 3] > thr
    cols = np.where(a.any(axis=0))[0]
    tops, bots = [], []
    for x in cols:
        c = np.nonzero(a[:, x])[0]
        tops.append(int(c.min()))
        bots.append(int(c.max()))
    cols = np.arange(cols.min(), cols.max() + 1)
    kb = np.polyfit(cols, bots, 1)
    kt = np.polyfit(cols, tops, 1)
    return cols.min(), cols.max(), kb, kt


def warp_to_face(im):
    """三点仿射：源底边低端/高端/顶端高端 -> 目标严格 2:1 面。"""
    x_lo, x_hi, kb, kt = edges(im)
    s_bl = (float(x_hi), kb[0] * x_hi + kb[1])            # 底边低端（斜率正 -> x 大端最低）
    s_bh = (float(x_lo), kb[0] * x_lo + kb[1])            # 底边高端
    s_th = (float(x_lo), kt[0] * x_lo + kt[1])            # 顶端高端
    src = np.array([[s_bl[0], s_bh[0], s_th[0]],
                    [s_bl[1], s_bh[1], s_th[1]],
                    [1, 1, 1]], np.float64)
    dst = np.array([[T_BASE_LO[0], T_BASE_HI[0], T_TOP_HI[0]],
                    [T_BASE_LO[1], T_BASE_HI[1], T_TOP_HI[1]],
                    [1, 1, 1]], np.float64)
    m = dst @ np.linalg.inv(src)                          # 源坐标 -> 目标坐标
    inv = np.linalg.inv(m)
    coeff = (inv[0, 0], inv[0, 1], inv[0, 2],
             inv[1, 0], inv[1, 1], inv[1, 2])
    return im.transform((CW, CH), Image.AFFINE, coeff, resample=Image.BICUBIC)


def build(raw_name):
    raw = Image.open(os.path.join(GEN, raw_name + '.jpg')).convert('RGB')
    im = P.key_green(raw)
    im.putalpha(P.largest_component(im.split()[3]))
    im = im.crop(im.getbbox())
    art = warp_to_face(im)
    art = P.add_outline(art, erode=1.6)
    return art


def mirror(art):
    return art.transpose(Image.FLIP_LEFT_RIGHT)


def shrink_light(art, k):
    arr = np.array(art).astype(np.float32)
    arr[..., :3] = np.clip(arr[..., :3] * k, 0, 255)
    return Image.fromarray(arr.astype(np.uint8), 'RGBA')


def emit(base_name, facing, art, src_name, op):
    ax = T_BASE_LO[0] if facing in ('SW', 'NE') else T_BASE_HI[0]
    ay = T_BASE_LO[1]
    half = int(max(ax, art.width - ax)) + 2
    H = ay + 2
    cv = Image.new('RGBA', (half * 2, H), (0, 0, 0, 0))
    cv.alpha_composite(art, (int(half - ax), 2))
    bb = cv.getbbox()
    name = '%s_%s' % (base_name, facing.lower())
    cv.save(os.path.join(MOD, name + '.png'))
    fp = [4, 1] if facing in ('SW', 'NE') else [1, 4]
    cell = [4, 1] if facing in ('SW', 'NE') else [1, 4]
    meta = {
        'name': base_name, 'facing': facing, 'footprint': fp, 'height_px': WALL_H,
        'anchor': [0.5, 1.0], 'anchor_cell': cell,
        'anchor_px': [int(half), int(ay) + 2],
        'anchor_note': '面状构件：锚点 = 面底边低端 = 足迹前底顶点；面长 4 格/面高 170/底边斜率 2:1',
        'tile': [64, 32], 'tileable': False,
        'sprite_size': [cv.width, cv.height],
        'sprite_h_px': int(bb[3] - bb[1]),
        'ratio_to_char': round((bb[3] - bb[1]) / 84, 2),
        'margins_px': [int(bb[0]), int(bb[1]), int(cv.width - bb[2]), int(cv.height - bb[3])],
        'source': 'text_to_image 单件墙板，三点仿射归一（面长 4 格 / 面高 170 / 底边 2:1）',
        'outline_px': P.OUTLINE, 'mirror_derived': src_name is not None,
        'derive_op': op, 'derived_from': src_name,
    }
    with open(os.path.join(MOD, name + '.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
    print('%-18s %dx%d h=%d fp=%s' % (name, cv.width, cv.height, meta['sprite_h_px'], fp))
    return cv


def main():
    base = build('wall_wood')
    emit('wall_wood', 'SW', base, None, None)
    emit('wall_wood', 'SE', mirror(base), 'wall_wood_sw', 'mirror_h')
    emit('wall_wood', 'NE', shrink_light(mirror(base), 0.94), 'wall_wood_sw', 'mirror_h+brightness')
    emit('wall_wood', 'NW', shrink_light(base, 0.94), 'wall_wood_sw', 'brightness')


if __name__ == '__main__':
    main()
