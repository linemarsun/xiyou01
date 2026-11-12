# -*- coding: utf-8 -*-
"""预览：四向构件格 + 城门新旧对比（带 25px 刻度尺）。"""
import json
from paths import ROOT, MODULES, PREVIEW, GEN, CHAR, ISO_OUT, HERE, FONT_DIR, ensure
import os

from PIL import Image, ImageDraw, ImageFont

MOD = os.path.join(ROOT, 'assets_src', 'modules')
PRE = os.path.join(ROOT, 'assets_src', 'preview')
CHAR = os.path.join(ROOT, 'assets_src', 'sprites', 'xiake', 'idle_0.png')
OUT_GRID = os.path.join(PRE, 'modules_four_facing.png')
OUT_GATE = os.path.join(PRE, 'gate_arch_compare.png')
BG = (38, 45, 53)
CHAR_H = 84


def font(sz):
    return ImageFont.truetype(FONT_DIR + '/msyh.ttc', sz)


F = font(14)
FS = font(12)
FB = font(18)


def diamond(w, h):
    """相对前底顶点的足迹菱形：右顶点由 h 决定，左顶点由 w 决定。"""
    return [(0, 0), (h * 32, -h * 16), ((h - w) * 32, -(w + h) * 16), (-w * 32, -w * 16)]


def load_char():
    ch = Image.open(CHAR).convert('RGBA')
    bb = ch.getbbox()
    f = CHAR_H / (bb[3] - bb[1])
    ch = ch.resize((int(ch.width * f), int(ch.height * f)), Image.LANCZOS)
    return ch, (bb[0] + bb[2]) / 2 * f, bb[3] * f


def checker(w, h, sq=8):
    im = Image.new('RGBA', (w, h), (33, 37, 43, 255))
    d = ImageDraw.Draw(im)
    for y in range(0, h, sq):
        for x in range(0, w, sq):
            if (x // sq + y // sq) % 2 == 0:
                d.rectangle([x, y, x + sq - 1, y + sq - 1], fill=(45, 50, 58, 255))
    return im


def grid():
    rows = ['wall_wood', 'wall_plaster', 'roof_slope', 'roof_ridge']
    cols = ['sw', 'se', 'ne', 'nw']
    cell_w, cell_h, head = 300, 300, 78
    W = cell_w * len(cols) + 150
    H = head + cell_h * len(rows) + 20
    canvas = checker(W, H)
    d = ImageDraw.Draw(canvas)
    d.text((36, 22), '四向构件：每件 _sw / _se / _ne / _nw', font=FB, fill=(228, 236, 242))
    d.text((36, 50), '虚线=足迹菱形（按 facing 换算宽深）  ·  金点=锚点(0.5,1.0)  ·  背向(ne/nw) 压暗 7% 并后退半格深',
           font=FS, fill=(150, 166, 176))
    for i, name in enumerate(rows):
        y0 = head + i * cell_h
        d.line([(30, y0), (W - 30, y0)], fill=(72, 84, 96), width=1)
        d.text((36, y0 + 8), name, font=F, fill=(226, 200, 150))
        for j, fc in enumerate(cols):
            fname = '%s_%s' % (name, fc)
            png = os.path.join(MOD, fname + '.png')
            if not os.path.exists(png):
                continue
            im = Image.open(png).convert('RGBA')
            meta = json.load(open(os.path.join(MOD, fname + '.json'), encoding='utf-8'))
            cx = 150 + j * cell_w
            base = y0 + cell_h - 56
            canvas.alpha_composite(im, (cx - im.width // 2, base - im.height + 2))
            ax, ay = cx, base
            poly = [(ax + x, ay + y) for (x, y) in diamond(*meta['footprint'])]
            d.line(poly + [poly[0]], fill=(120, 165, 195, 120), width=1)
            d.ellipse([ax - 2, ay - 2, ax + 2, ay + 2], fill=(235, 195, 100, 240))
            d.text((cx - 26, y0 + 8), fc.upper(), font=F, fill=(120, 205, 170))
            d.text((cx - 52, base + 6), '%s  %dx%d' % (meta['facing'], im.width, im.height),
                   font=FS, fill=(150, 166, 176))
    canvas.convert('RGB').save(OUT_GRID, quality=95)
    print('saved', OUT_GRID, canvas.size)


def gate_cmp(old, new_path, label_old, label_new):
    new = Image.open(new_path).convert('RGBA')
    meta = json.load(open(new_path.replace('.png', '.json'), encoding='utf-8'))
    ch, chx, chy = load_char()
    pad, top = 40, 96
    colw = 360
    H = 560
    W = pad * 2 + colw * 2 + 190
    canvas = checker(W, H)
    d = ImageDraw.Draw(canvas)
    d.text((pad, 24), '城门 gate_arch：压扁版 vs 新版（拱洞 130px / 屋顶自然坡度）', font=FB, fill=(228, 236, 242))
    d.text((pad, 52), '同一条基线、同一像素比例；左侧带 25px 刻度尺；最右为 84px xiake', font=FS, fill=(150, 166, 176))
    base = top + 420
    for k, (im, label) in enumerate([(old, label_old), (new, label_new)]):
        cx = pad + k * colw + 170
        d.line([(pad, base), (W - pad, base)], fill=(120, 140, 155), width=1)
        canvas.alpha_composite(im, (cx - im.width // 2, base - im.height + 2))
        d.text((cx - 80, top - 26), label, font=F, fill=(205, 205, 205))
        if k == 1:
            d.ellipse([cx - 2, base - 2, cx + 2, base + 2], fill=(235, 195, 100, 240))
    # 刻度尺
    ax = pad + 60
    for v in range(0, 251, 25):
        y = base - v
        d.line([(ax - 8, y), (ax + 6, y)], fill=(150, 170, 185), width=1)
        d.text((ax + 10, y - 7), str(v), font=FS, fill=(150, 170, 185))
    d.line([(ax, base), (ax, base - 250)], fill=(150, 170, 185), width=1)
    cx = W - 100
    canvas.alpha_composite(ch, (int(cx - chx), int(base - chy)))
    d.text((cx - 24, base + 8), 'xiake 84px', font=FS, fill=(150, 170, 185))
    d.text((pad, H - 44),
           '新版实测：总高 %dpx (%.2fx) · 拱洞 ~130px (1.55x) · 檐口 ~162px · 屋脊 ~%dpx'
           % (meta['sprite_h_px'], meta['ratio_to_char'], meta['sprite_h_px'] - 16),
           font=F, fill=(232, 190, 120))
    canvas.convert('RGB').save(OUT_GATE, quality=95)
    print('saved', OUT_GATE, canvas.size)


def build_old_gate():
    """用旧参数（split .52 / q .42）复现压扁版。"""
    import post as P
    im = Image.open(os.path.join(P.GEN, 'gate_arch_4.jpg')).convert('RGB')
    im = P.key_green(im)
    im.putalpha(P.largest_component(im.split()[3]))
    im = im.crop(im.getbbox())
    im = P.warp_above(im, split=0.52, q=0.42)
    im = im.resize((190, 207), Image.LANCZOS)
    return P.add_outline(im, erode=2.0)


if __name__ == '__main__':
    import sys
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    grid()
    gate_cmp(build_old_gate(), os.path.join(MOD, 'gate_arch.png'), '旧版（屋顶压扁 q=0.42）',
             '新版（拱洞 130px / 自然屋面）')
