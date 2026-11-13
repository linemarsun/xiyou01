# -*- coding: utf-8 -*-
"""绿幕抠底 → 去光晕 → 缩放到足迹尺寸 → 补外描边 → 锚点裁切 → PNG/JSON。"""
import json
from paths import ROOT, MODULES, PREVIEW, GEN, CHAR, ISO_OUT, HERE, FONT_DIR, ensure
import os
import sys

import numpy as np
from PIL import Image, ImageFilter, ImageEnhance

GEN = os.path.join(ROOT, 'assets_src', 'preview', 'gen')
OUT_DIR = os.path.join(ROOT, 'assets_src', 'modules')
OUT_COL = (34, 29, 26)
PAD = 2

# name: (生成文件, 足迹, 朝向, 世界高, 目标成图尺寸 (按足迹足迹投影+高度推算), 缩放模式)
SPEC = {
    'wall_wood':  ('wall_wood',  (2, 1), 'SW', 155, (96, 203), 'stretch'),
    'gate_arch':  ('gate_arch_4', (3, 3), 'SW', 212, (196, 213), 'stretch'),
    'tree_pine':  ('tree_pine_3', (1, 1), 'SW', 186, (72, 202), 'stretch'),
    'roof_slope': ('roof_slope', (4, 2), 'SW', 46, (198, 122), 'stretch'),
}
BOTTOM_OFF = {'tree_pine': 16}     # 树干立在地块中心，锚点在菱形前顶点（低 16px）
TILEABLE = {'roof_slope': True}    # 坡面沿屋脊方向可拼接
OUTLINE = 2.5


def key_green(im):
    rgb = np.asarray(im.convert('RGB')).astype(np.int16)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    ex = g - np.maximum(r, b)
    a = np.clip((70 - ex) / 45.0, 0, 1)
    # 高亮纯绿一律压掉（含绿幕压缩噪点）
    pure = (g > 150) & (ex > 55)
    a[pure] = 0
    # 去绿边（despill）
    lim = np.maximum(r, b) + 9
    g2 = np.minimum(g, lim)
    rgb = np.stack([r, g2, b], axis=-1).clip(0, 255).astype(np.uint8)
    alpha = (a * 255).astype(np.uint8)
    return Image.fromarray(np.dstack([rgb, alpha]), 'RGBA')


def largest_component(alpha, thr=110):
    """去掉零散残留（水印、压缩噪点）。在 1/4 分辨率上做连通域。"""
    w, h = alpha.size
    sw, sh = max(1, w // 4), max(1, h // 4)
    small = (np.asarray(alpha.resize((sw, sh), Image.NEAREST)) > thr)
    lab = np.zeros((sh, sw), np.int32)
    cur = 0
    best, best_n = 0, 0
    for y in range(sh):
        for x in range(sw):
            if small[y, x] and lab[y, x] == 0:
                cur += 1
                stack = [(y, x)]
                lab[y, x] = cur
                n = 0
                while stack:
                    cy, cx = stack.pop()
                    n += 1
                    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        ny, nx = cy + dy, cx + dx
                        if 0 <= ny < sh and 0 <= nx < sw and small[ny, nx] and lab[ny, nx] == 0:
                            lab[ny, nx] = cur
                            stack.append((ny, nx))
                if n > best_n:
                    best, best_n = cur, n
    keep = Image.fromarray(((lab == best) * 255).astype(np.uint8), 'L')
    keep = keep.resize((w, h), Image.BILINEAR)
    arr = np.array(alpha)
    arr[keep.point(lambda v: 255 if v > 110 else 0) == 0] = 0
    return Image.fromarray(arr, 'L')


def add_outline(rgba, px=OUTLINE, erode=2.0):
    """先内缩切掉生成图自带的浅色贴纸边，再由内缩轮廓外扩出统一深色描边。"""
    s = 4
    big = rgba.resize((rgba.width * s, rgba.height * s), Image.NEAREST)
    a = big.split()[3]
    a = a.filter(ImageFilter.MinFilter(2 * int(erode * s) + 1))
    a = a.filter(ImageFilter.GaussianBlur(s * 0.6))
    r = int(round((px + erode) * s))
    dil = a.filter(ImageFilter.MaxFilter(r * 2 + 1))
    layer = Image.new('RGBA', big.size, OUT_COL + (255,))
    layer.putalpha(dil)
    art = big.copy()
    art.putalpha(a)
    out = Image.new('RGBA', big.size, (0, 0, 0, 0))
    out.alpha_composite(layer)
    out.alpha_composite(art)
    out = out.resize((rgba.width, rgba.height), Image.LANCZOS)
    return out.filter(ImageFilter.UnsharpMask(radius=1.4, percent=55, threshold=2))


def warp_above(im, split=0.52, q=0.566):
    """压缩拱顶以上区域（屋面+斗拱带），把高度预算让给拱洞，保证人物可通行。"""
    w, h = im.size
    cut = int(h * split)
    top = im.crop((0, 0, w, cut)).resize((w, max(1, int(cut * q))), Image.LANCZOS)
    bot = im.crop((0, cut, w, h))
    out = Image.new('RGBA', (w, top.height + bot.height), (0, 0, 0, 0))
    out.alpha_composite(top, (0, 0))
    out.alpha_composite(bot, (0, top.height))
    return out


def process(name):
    src, fp, facing, wh, target, mode = SPEC[name]
    raw = Image.open(os.path.join(GEN, src + '.jpg')).convert('RGB')
    im = key_green(raw)
    a = im.split()[3]
    im.putalpha(largest_component(a))
    bb = im.getbbox()
    im = im.crop(bb)
    sw, sh = im.size
    if name == 'gate_arch':
        im = warp_above(im, split=0.52, q=0.42)
        sw, sh = im.size
    tw, th = target
    art_w = max(1, tw - int(OUTLINE * 2))
    art_h = max(1, th - int(OUTLINE * 2))
    if mode == 'stretch':
        new_w, new_h = art_w, art_h
    else:                                   # 等比按高度
        new_h = art_h
        new_w = int(round(sw * art_h / sh))
    im = im.resize((new_w, new_h), Image.LANCZOS)
    if name == 'tree_pine':
        # 压掉生成图的近白高光，收成两级平涂的亮部
        arr = np.array(im).astype(np.float32)
        lut = np.where(np.arange(256) > 190,
                       190 + (np.arange(256) - 190) * 0.30, np.arange(256) * 1.02)
        arr[..., :3] = np.clip(lut[arr[..., :3].astype(np.int32)], 0, 255)
        im = Image.fromarray(arr.astype(np.uint8), 'RGBA')
        im = ImageEnhance.Color(im).enhance(1.20)
        im = ImageEnhance.Contrast(im).enhance(1.06)
    im = add_outline(im, erode=1.2 if name == 'tree_pine' else 2.0)

    bb = im.getbbox()
    # 锚点 = 足迹菱形前底顶点：成图内容宽已按 (w+h)*32 对齐，故由 bbox 水平中心
    # 再按 w-h 的菱形偏移推出前底顶点（w=h 时即 bbox 中心）。
    ax = float((bb[0] + bb[2]) / 2.0) + (fp[0] - fp[1]) * 16
    im = im.crop(bb)
    ax -= bb[0]
    cw, chh = im.size
    half = int(max(ax, cw - ax)) + PAD
    off = BOTTOM_OFF.get(name, 0)
    W, H = half * 2, chh + off + PAD * 2
    canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    canvas.alpha_composite(im, (int(round(half - ax)), PAD))

    arr = np.array(canvas)
    arr[..., 3][arr[..., 3] < 8] = 0
    out = Image.fromarray(arr, 'RGBA')
    out.save(os.path.join(OUT_DIR, name + '.png'))

    bbx = out.getbbox()
    meta = {
        'name': name,
        'footprint': [fp[0], fp[1]],
        'height_px': wh,
        'anchor': [0.5, 1.0],
        'tile': [64, 32],
        'tileable': TILEABLE.get(name, False),
        'facing': facing,
        'sprite_size': [out.width, out.height],
        'sprite_h_px': int(bbx[3] - bbx[1]),
        'ratio_to_char': round((bbx[3] - bbx[1]) / 84, 2),
        'margins_px': [int(bbx[0]), int(bbx[1]), int(out.width - bbx[2]),
                       int(out.height - bbx[3])],
        'source': 'text_to_image (green screen #00FF00) + chroma key/despill + scale + outline',
        'outline_px': OUTLINE,
    }
    with open(os.path.join(OUT_DIR, name + '.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
    print('%-13s src=%dx%d aspect=%.3f  -> %dx%d  squeeze=%.2f  h=%d  %.2fx  margins=%s'
          % (name, sw, sh, sw / sh, out.width, out.height,
             (art_w / art_h) / (sw / sh), meta['sprite_h_px'], meta['ratio_to_char'],
             meta['margins_px']))
    return out


if __name__ == '__main__':
    os.makedirs(OUT_DIR, exist_ok=True)
    for n in (sys.argv[1:] or ['wall_wood', 'gate_arch', 'tree_pine', 'roof_slope']):
        process(n)
