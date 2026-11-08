# -*- coding: utf-8 -*-
"""四向派生管线：生成单件母版(SW) -> 抠像/描边 -> 派生出 SE/NE/NW -> 按足迹锚切 -> PNG+JSON。

朝向规则（等距 2:1，锚点=足迹前底顶点，anchor 0.5/1.0）：
  SW  母版，足迹 [w,h]，内容水平偏移 -(w-h)*16
  SE  水平镜像（几何精确，左右光照互换），足迹 [h,w]，偏移 +(w-h)*16
  NE  背面：屋顶类用上下翻转（背坡屋檐朝上），墙体类用水平镜像；上移 h*16，压暗 0.93
  NW  背面：NE 的水平镜像，足迹 [h,w]，上移 w*16，压暗 0.93
说明：SW/SE 互为镜像即可，NE/NW 是"半格深"的背向近似；如需背面完全独立的画法须重新生成。
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageEnhance

import post as P

ROOT = r'D:\workspace\dahuayou_web'
GEN = os.path.join(ROOT, 'assets_v2', 'preview', 'gen')
OUT_DIR = os.path.join(ROOT, 'assets_v2', 'modules')
PAD = 2

# 每件：(生成图, 足迹[w,h], 世界高, 目标内容尺寸, 是否四向, 背向处理, 描边内缩, warp)
CONF = {
    'wall_wood':    ('wall_wood',       (2, 1), 150, (94, 150), 4, 'mirror', 2.0, None),
    'wall_plaster': ('wall_plaster_2',  (2, 1), 150, (94, 150), 4, 'mirror', 2.0, None),
    'roof_slope':   ('roof_slope',      (4, 2),  46, (192,  80), 4, 'flipV', 2.0, None),
    'roof_back':    ('roof_back2',      (4, 2),  46, (192,  80), 4, 'flipV', 2.0, None),
    'roof_ridge':   ('roof_ridge_3',    (4, 1),  22, (156,  44), 4, 'flipV', 2.0, None),
    'gate_arch':    ('gate_arch_6',     (3, 3), 222, (190, 222), 1, 'mirror', 2.0, (0.45, 0.60)),
}
FACES = ['sw', 'se', 'ne', 'nw']


def master(name):
    src, fp, wh, target, nf, far, erode, warp = CONF[name]
    im = Image.open(os.path.join(GEN, src + '.jpg')).convert('RGB')
    im = P.key_green(im)
    im.putalpha(P.largest_component(im.split()[3]))
    im = im.crop(im.getbbox())
    if warp:
        im = P.warp_above(im, split=warp[0], q=warp[1])
    im = im.resize(target, Image.LANCZOS)
    im = P.add_outline(im, erode=erode)
    return im


def place(art, facing, fp, far):
    """把 art 放进只按足迹锚点裁切的画布。返回 (canvas, margin tuple)。"""
    w, h = fp if facing in ('sw', 'ne') else (fp[1], fp[0])
    cw, ch = art.size
    center = (h - w) * 16                        # 内容中心 = 足迹菱形中心（相对前底顶点，恒偏左）
    bottom_off = 0
    half = int(max(abs(center - cw / 2.0), abs(center + cw / 2.0))) + PAD
    W = half * 2
    H = ch + bottom_off + PAD * 2
    canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    canvas.alpha_composite(art, (int(round(half + center - cw / 2.0)), H - PAD - bottom_off - ch))
    return canvas


def translate(art, dx, dy):
    """在画布两侧补等宽留白并平移内容，使 bbox 中心随之平移 (dx,dy)。"""
    W = art.width + 2 * abs(dx)
    H = art.height + 2 * abs(dy)
    c = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    c.alpha_composite(art, (abs(dx) + dx, abs(dy) + dy))
    return c


def emit_face(name, base_name, art, facing, fp, wh, op, derived_from, multi, nudge=(0, 0)):
    fw, fh = fp if facing in ('sw', 'ne') else (fp[1], fp[0])
    if nudge != (0, 0):
        art = translate(art, nudge[0], nudge[1])
    canvas = place(art, facing, fp, 'none')
    arr = np.array(canvas)
    arr[..., 3][arr[..., 3] < 8] = 0
    out = Image.fromarray(arr, 'RGBA')

    fname = '%s_%s' % (base_name, facing) if multi else base_name
    out.save(os.path.join(OUT_DIR, fname + '.png'))

    bb = out.getbbox()
    meta = {
        'name': base_name,
        'facing': facing.upper(),
        'footprint': [fw, fh],
        'height_px': wh,
        'anchor': [0.5, 1.0],
        'tile': [64, 32],
        'tileable': base_name in ('roof_slope', 'roof_ridge'),
        'sprite_size': [out.width, out.height],
        'sprite_h_px': int(bb[3] - bb[1]),
        'ratio_to_char': round((bb[3] - bb[1]) / 84, 2),
        'margins_px': [int(bb[0]), int(bb[1]), int(out.width - bb[2]), int(out.height - bb[3])],
        'source': 'text_to_image (green screen #00FF00) + chroma key/despill + scale + outline',
        'outline_px': P.OUTLINE,
        'mirror_derived': derived_from is not None,
        'derive_op': op,
        'derived_from': derived_from,
    }
    with open(os.path.join(OUT_DIR, fname + '.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
    print('%-16s %dx%d  h=%d  %.2fx  margins=%s' % (
        fname, out.width, out.height, meta['sprite_h_px'], meta['ratio_to_char'],
        meta['margins_px']))


def shade_to(art, ref, ratio):
    """按可见像素平均亮度把背光面压到 ref 的 ratio 倍，保持靛青色相不发灰。"""
    a = np.array(art).astype(np.float32)
    m = a[..., 3] > 8
    lum = lambda x: (x[..., 0][x[..., 3] > 8].mean() * 0.299
                     + x[..., 1][x[..., 3] > 8].mean() * 0.587
                     + x[..., 2][x[..., 3] > 8].mean() * 0.114)
    src_lum, ref_lum = lum(a), lum(np.array(ref).astype(np.float32))
    k = (ref_lum * ratio) / max(src_lum, 1e-6)
    a[..., :3] *= k
    a[..., :3] = np.clip(a[..., :3] + np.array([0, 2, 12], np.float32)[None, None, :], 0, 255)
    return Image.fromarray(a.astype(np.uint8), 'RGBA')


def emit(name, base_art, fp, wh, far):
    if name == 'roof_slope':
        front = base_art
        back = shade_to(master('roof_back'), front, 0.82)
        emit_face(name, name, front, 'sw', fp, wh, 'source', None, True)
        emit_face(name, name, front.transpose(Image.FLIP_LEFT_RIGHT), 'se', fp, wh, 'mirror_h', 'sw', True)
        back_dx, back_dy = -64, 0                     # 水平共线校正；垂直差 23px 由引擎放置高度吸收
        emit_face(name, name, back, 'ne', fp, wh, 'source', None, True, (back_dx, back_dy))
        emit_face(name, name, back.transpose(Image.FLIP_LEFT_RIGHT), 'nw', fp, wh, 'mirror_h', 'ne', True,
                  (-back_dx, back_dy))
        return

    multi = CONF[name][4] == 4
    faces = FACES if multi else ['sw']
    for facing in faces:
        art, op, src = base_art, 'source', None
        if facing == 'se':
            art, op, src = art.transpose(Image.FLIP_LEFT_RIGHT), 'mirror_h', 'sw'
        elif facing == 'ne':
            art, op, src = art.transpose(Image.FLIP_LEFT_RIGHT), 'mirror_h', 'sw'
        elif facing == 'nw':
            art, op, src = art.transpose(Image.FLIP_LEFT_RIGHT).transpose(Image.FLIP_LEFT_RIGHT), 'mirror_h', 'ne'
        if facing in ('ne', 'nw'):
            art = ImageEnhance.Brightness(art).enhance(0.93)
        emit_face(name, name, art, facing, fp, wh, op, src, multi)


def main(names):
    for n in names:
        art = master(n)
        if n == 'roof_ridge':        # 母版脊线方向与 SW 屋面相反，先水平镜像一次
            art = art.transpose(Image.FLIP_LEFT_RIGHT)
        emit(n, art, CONF[n][1], CONF[n][2], CONF[n][5])


if __name__ == '__main__':
    main(sys.argv[1:] or ['wall_wood', 'wall_plaster', 'roof_slope', 'roof_ridge', 'gate_arch'])
