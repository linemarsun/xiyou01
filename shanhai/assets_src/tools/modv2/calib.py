# -*- coding: utf-8 -*-
"""背坡 z 偏移标定：固定受光坡，扫背坡/脊条的垂直偏移，挑接缝最齐的一档。"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

MOD = r'D:\workspace\dahuayou_web\assets_v2\modules'
OUT = r'D:\workspace\dahuayou_web\assets_v2\preview\_roof_calib.png'


def p(u, v):
    return (u - v) * 32.0, (u + v) * 16.0


def font(sz):
    return ImageFont.truetype(r'C:\Windows\Fonts\msyh.ttc', sz)


def load(name):
    im = Image.open(os.path.join(MOD, name + '.png')).convert('RGBA')
    return im, json.load(open(os.path.join(MOD, name + '.json'), encoding='utf-8'))


def put(cv, name, u0, v0, z, ox, oy):
    im, m = load(name)
    w, h = m['footprint']
    ax, ay = p(u0 + w, v0 + h)
    cv.alpha_composite(im, (int(round(ox + ax - im.width / 2)),
                            int(round(oy + ay - z - (im.height - 2)))))


def cell(dy, dx=0):
    cv = Image.new('RGBA', (300, 230), (34, 40, 47, 255))
    ox, oy = 150, 200
    put(cv, 'roof_slope_ne', 1, 1, 196 + dy, ox + dx, oy)
    put(cv, 'roof_slope_sw', 1, 3, 150, ox, oy)
    put(cv, 'roof_ridge_sw', 1, 2, 196 + dy, ox + dx, oy)
    d = ImageDraw.Draw(cv)
    a, b = p(1, 3), p(5, 3)
    d.line([(ox + a[0], oy + a[1] - 196), (ox + b[0], oy + b[1] - 196)], fill=(255, 80, 70), width=1)
    d.text((8, 6), 'dy=%+d dx=%+d' % (dy, dx), font=font(13), fill=(240, 210, 140))
    return cv


def main():
    dys = [-32, -24, -16, -8, 0, 8, 16, 24, 32]
    cellw, cellh = 300, 230
    cols = 3
    sheet = Image.new('RGB', (cellw * cols, cellh * 3), (20, 22, 26))
    for i, dy in enumerate(dys):
        im = cell(dy, dx=-64).convert('RGB')
        sheet.paste(im, ((i % cols) * cellw, (i // cols) * cellh))
    sheet.save(OUT, quality=95)
    print('saved', OUT)


if __name__ == '__main__':
    main()
