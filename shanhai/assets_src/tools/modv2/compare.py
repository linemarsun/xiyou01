# -*- coding: utf-8 -*-
"""打样对比图：左=旧版程序化，右=新版生成+后处理，同一条基线，84px 角色参照。"""
import json
from paths import ROOT, MODULES, PREVIEW, GEN, CHAR, ISO_OUT, HERE, FONT_DIR, ensure
import os

from PIL import Image, ImageDraw, ImageFont

MOD = os.path.join(ROOT, 'assets_src', 'modules')
OLD = os.path.join(ROOT, 'assets_src', 'preview', '_v1')
CHAR = os.path.join(ROOT, 'assets_src', 'sprites', 'xiake', 'idle_0.png')
OUT = os.path.join(ROOT, 'assets_src', 'preview', 'modules_compare.png')

ROWS = [('wall_wood', 'wall_wood 2x1'), ('gate_arch', 'gate_arch 3x3'),
        ('tree_pine', 'tree_pine 1x1'), ('roof_slope', 'roof_slope 4x2')]
BG = (38, 45, 53)
LINE = (126, 145, 158)
TXT = (226, 234, 240)
DIM = (150, 166, 176)
CHAR_H = 84

def font(size):
    for p in (FONT_DIR + '/msyh.ttc', FONT_DIR + '/simhei.ttf'):
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()

F = font(15)
FS = font(13)
FB = font(19)


def load_char():
    ch = Image.open(CHAR).convert('RGBA')
    bb = ch.getbbox()
    f = CHAR_H / (bb[3] - bb[1])
    ch = ch.resize((int(ch.width * f), int(ch.height * f)), Image.LANCZOS)
    return ch, (bb[0] + bb[2]) / 2 * f, bb[3] * f


def footprint_poly(w, h):
    """足迹菱形（前底顶点为原点）的屏幕顶点，用于标注锚点与占地。"""
    pts = [(0, 0), (w * 32, -w * 16), ((w - h) * 32, -(w + h) * 16), (-h * 32, -h * 16)]
    return [(x, y) for (x, y) in pts]


def main():
    meta_new = {n: json.load(open(os.path.join(MOD, n + '.json'), encoding='utf-8')) for n, _ in ROWS}
    items = []
    for name, _ in ROWS:
        old = Image.open(os.path.join(OLD, name + '.png')).convert('RGBA')
        new = Image.open(os.path.join(MOD, name + '.png')).convert('RGBA')
        items.append((name, old, new, meta_new[name]))

    ch, chx, chy = load_char()
    W = 930
    pad = 34
    col_old = pad + 150
    col_new = col_old + 300
    col_ch = col_new + 320
    head = 92
    rows_h = [max(o.height, n.height, CHAR_H) + 66 for (_, o, n, _) in items]
    H = head + sum(rows_h) + 40
    canvas = Image.new('RGBA', (W, H), BG + (255,))
    d = ImageDraw.Draw(canvas)

    d.text((pad, 26), '构件打样对比：旧版（程序化绘制） vs 新版（单件生成 + 绿幕抠像后处理）',
           font=FB, fill=TXT)
    d.text((pad, 56), '同一像素比例、同一基线；最右为 84px 的 xiake 角色（sprites/xiake/idle_0）',
           font=FS, fill=DIM)

    y = head
    for idx, (name, old, new, meta) in enumerate(items):
        rh = rows_h[idx]
        base = y + rh - 30
        d.line([(pad, base), (W - pad, base)], fill=LINE, width=1)
        d.line([(pad, base + 6), (W - pad, base + 6)], fill=(LINE[0], LINE[1], LINE[2], 60), width=1)
        # 列标
        d.text((col_old, y + 8), '旧版', font=F, fill=(214, 150, 140))
        d.text((col_new, y + 8), '新版（生成+后处理）', font=F, fill=(150, 205, 170))
        d.text((col_ch, y + 8), '角色参照', font=F, fill=DIM)
        # 旧
        ox = col_old + 140 - old.width // 2
        canvas.alpha_composite(old, (int(ox), int(base - old.height)))
        # 新（锚点距底 2px）
        nx = col_new + 150 - new.width // 2
        canvas.alpha_composite(new, (int(nx), int(base - new.height + 2)))
        # 足迹菱形 + 锚点
        ax = col_new + 150
        ay = base - 2
        fp = meta['footprint']
        poly = [(ax + x, ay + y) for (x, y) in footprint_poly(fp[0], fp[1])]
        d.line(poly + [poly[0]], fill=(120, 160, 186, 130), width=1)
        d.ellipse([ax - 2, ay - 2, ax + 2, ay + 2], fill=(232, 190, 96, 235))
        # 角色
        cx = col_ch + 60 - chx
        canvas.alpha_composite(ch, (int(cx), int(base - chy)))

        old_h = old.getbbox()[3] - old.getbbox()[1]
        info = '%s  ·  旧 %dpx (%.2fx)  ·  新 %dpx (%.2fx)' % (
            name, old_h, old_h / CHAR_H, meta['sprite_h_px'], meta['ratio_to_char'])
        d.text((pad + 2, y + 30), info, font=FS, fill=DIM)
        if name == 'gate_arch':
            d.text((pad + 2, y + 47),
                   '拱洞净高 ~150px (1.79x)  ·  檐口 ~162px  ·  屋脊 ~205px', font=FS,
                   fill=(232, 190, 120))
        y += rh

    canvas.convert('RGB').save(OUT, quality=95)
    print('saved', OUT, canvas.size)


if __name__ == '__main__':
    main()
