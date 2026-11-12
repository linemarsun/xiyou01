# -*- coding: utf-8 -*-
"""足迹对齐诊断：画菱形 + 构件，检查坡/脊是否压在交界线上。"""
import json
from paths import ROOT, MODULES, PREVIEW, GEN, CHAR, ISO_OUT, HERE, FONT_DIR, ensure
import os

from PIL import Image, ImageDraw, ImageFont

MOD = os.path.join(ROOT, 'assets_src', 'modules')
OUT = os.path.join(ROOT, 'assets_src', 'preview', '_footprint_check.png')


def p(u, v):
    return (u - v) * 32.0, (u + v) * 16.0


def main():
    ox, oy, z0 = 480, 400, 0
    cv = Image.new('RGBA', (960, 620), (28, 32, 38, 255))
    d = ImageDraw.Draw(cv)
    for u in range(11):
        for v in range(11):
            x, y = p(u, v)
            poly = [(ox + x, oy + y), (ox + x + 32, oy + y + 16),
                    (ox + x, oy + y + 32), (ox + x - 32, oy + y + 16)]
            d.polygon(poly, fill=(72, 80, 86) if (u + v) % 2 == 0 else (64, 72, 78))
            d.line(poly + [poly[0]], fill=(50, 58, 64), width=1)

    def diamond(u0, v0, w, h, color, label=''):
        pts = []
        for (du, dv) in [(w, h), (0, h), (-w, h * 0), (0, 0)]:
            pass
        # 四顶点：前底(0,0) / 右(h,-h) / 左(-w,-w) / 顶(h-w,-w-h) —— 以足迹坐标换算
        P = [(u0 + w, v0 + h), (u0 + w - 0, v0 + h - h), (u0, v0 + h), (u0 + w, v0)]
        verts = [(u0 + w, v0 + h), (u0 + w - 0, v0 + h - h), (u0, v0), (u0 + w, v0)]
        # 直接用 4 个足迹角：(u0+w,v0+h) (u0+w,v0) (u0,v0) (u0,v0+h)
        verts = [(u0 + w, v0 + h), (u0 + w, v0), (u0, v0), (u0, v0 + h)]
        xy = [(ox + p(*vv)[0], oy + p(*vv)[1]) for vv in verts]
        d.line(xy + [xy[0]], fill=color, width=2)
        if label:
            cx = sum(q[0] for q in xy) / 4
            cy = sum(q[1] for q in xy) / 4
            d.text((cx - 24, cy - 6), label, font=ImageFont.truetype(FONT_DIR + '/msyh.ttc', 12), fill=color)

    def put(name, u0, v0):
        path = os.path.join(MOD, name + '.png')
        im = Image.open(path).convert('RGBA')
        m = json.load(open(path.replace('.png', '.json'), encoding='utf-8'))
        w, h = m['footprint']
        ax, ay = p(u0 + w, v0 + h)
        cv.alpha_composite(im, (int(round(ox + ax - im.width / 2)),
                                int(round(oy + ay - m['height_px'] - (im.height - 2)))))
        diamond(u0, v0, w, h, (90, 220, 200), '%s@%d,%d z=%d' % (name, u0, v0, m['height_px']))

    # 只画屋顶三件，先看几何
    put('roof_slope_sw', 1, 3)
    put('roof_slope_ne', 1, 1)
    put('roof_ridge_sw', 1, 2)
    # 交界线 v=3（u 1..5）
    d.line([(ox + p(1, 3)[0], oy + p(1, 3)[1]), (ox + p(5, 3)[0], oy + p(5, 3)[1])],
           fill=(255, 60, 60), width=2)
    cv.convert('RGB').save(OUT, quality=95)
    print('saved', OUT)


if __name__ == '__main__':
    main()
