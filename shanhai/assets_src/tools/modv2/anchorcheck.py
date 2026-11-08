# -*- coding: utf-8 -*-
"""把每件 PNG 放到棋盘格上，叠加按锚点推算的足迹菱形，检查锚点是否落在足迹前底顶点。"""
import json
import os

from PIL import Image, ImageDraw

ROOT = r'D:\workspace\dahuayou_web'
MOD = os.path.join(ROOT, 'assets_v2', 'modules')
OUT = os.path.join(ROOT, 'assets_v2', 'preview', '_anchor_check.png')
PAD = 14
FONT = r'C:\Windows\Fonts\msyh.ttc'


def diamond(w, h):
    W, H = (w + h) * 32, (w + h) * 16
    return [(0, 0), (W / 2, -H / 2), (0, -H), (-W / 2, -H / 2)]


def main():
    names = ['wall_wood', 'gate_arch', 'tree_pine', 'roof_slope']
    tiles = []
    for n in names:
        im = Image.open(os.path.join(MOD, n + '.png')).convert('RGBA')
        d = json.load(open(os.path.join(MOD, n + '.json'), encoding='utf-8'))
        tiles.append((n, im, d))

    cw = max(t[1].width for t in tiles) + PAD * 2
    ch = max(t[1].height for t in tiles) + PAD * 2 + 26
    canvas = Image.new('RGBA', (cw * 2, ch * 2), (30, 34, 40, 255))
    dr = ImageDraw.Draw(canvas)

    # 棋盘格底
    sq = 10
    for y in range(0, canvas.height, sq):
        for x in range(0, canvas.width, sq):
            if (x // sq + y // sq) % 2 == 0:
                dr.rectangle([x, y, x + sq - 1, y + sq - 1], fill=(46, 51, 58, 255))

    for i, (n, im, d) in enumerate(tiles):
        ox = (i % 2) * cw + (cw - im.width) // 2
        oy = (i // 2) * ch + 24 + (ch - 26 - im.height) // 2
        canvas.alpha_composite(im, (ox, oy))
        ax, ay = ox + im.width / 2, oy + im.height - 2
        fp = d['footprint']
        pts = [(ax + px, ay + py) for px, py in diamond(*fp)]
        dr.polygon(pts, outline=(255, 205, 90, 255))
        dr.line([(ax, ay - 18), (ax, ay + 10)], fill=(255, 90, 90, 255), width=2)
        dr.line([(ax - 8, ay + 2), (ax + 8, ay + 2)], fill=(255, 90, 90, 255), width=2)
        dr.ellipse([ax - 3, ay - 3, ax + 3, ay + 3], fill=(255, 235, 150, 255))
        dr.text((ox + 4, (i // 2) * ch + 4), '%s  %dx%d  %s' % (n, im.width, im.height,
                                                               d.get('margins_px')), fill=(230, 235, 240, 255))

    canvas.convert('RGB').save(OUT)
    print('saved', OUT)


if __name__ == '__main__':
    main()
