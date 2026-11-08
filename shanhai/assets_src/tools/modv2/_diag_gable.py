# -*- coding: utf-8 -*-
"""诊断：墙身 + 山墙（无坡面），确认山墙是否贴在端墙墙顶。"""
import json
import os

from PIL import Image, ImageDraw

ROOT = r'D:\workspace\dahuayou_web'
MOD = os.path.join(ROOT, 'assets_v2', 'modules')
OX, OY = 440, 290


def p(u, v):
    return (u - v) * 32.0, (u + v) * 16.0


def put(cv, d, name, u0, v0, z=0):
    im = Image.open(os.path.join(MOD, name + '.png')).convert('RGBA')
    meta = json.load(open(os.path.join(MOD, name + '.json'), encoding='utf-8'))
    w, h = meta['footprint']
    ax, ay = p(u0 + w, v0 + h)
    br = meta.get('margins_px', [0, 0, 0, 0])[3]
    px = int(round(OX + ax - im.width / 2))
    py = int(round(OY + ay - z - (im.height - br)))
    cv.alpha_composite(im, (px, py))
    d.rectangle([OX + ax - 3, OY + ay - z - 1, OX + ax + 3, OY + ay - z + 1], fill=(255, 0, 255, 255))


def main():
    cv = Image.new('RGBA', (940, 700), (120, 158, 112, 255))
    d = ImageDraw.Draw(cv)
    put(cv, d, 'wall_wood_se', 4, 1)
    put(cv, d, 'wall_wood_sw', 1, 4)
    # 端墙墙顶线（u=5，v 1..5，z=170）用青色描出
    for i in range(33):
        t = i / 32.0
        u, v = 5, 1 + 4 * t
        x, y = p(u, v)
        d.ellipse([OX + x - 1.5, OY + y - 170 - 1.5, OX + x + 1.5, OY + y - 170 + 1.5], fill=(86, 214, 194, 255))
    put(cv, d, 'roof_gable_se', 4, 1, 170)
    cv.convert('RGB').save(os.path.join(ROOT, 'assets_v2', 'preview', '_diag_gable.png'))
    print('ok')


if __name__ == '__main__':
    main()
