# -*- coding: utf-8 -*-
"""屋顶分解图：受光坡 / 背坡 / 脊条三格 + 叠合，每格叠足迹菱形与脊线。"""
import json
import os

from PIL import Image, ImageDraw, ImageFont

ROOT = r'D:\workspace\dahuayou_web'
MOD = os.path.join(ROOT, 'assets_v2', 'modules')
OUT = os.path.join(ROOT, 'assets_v2', 'preview', 'roof_exploded.png')

EAVE_Z, RIDGE_Z = 150, 170
CELL = (470, 300)


def font(sz, bold=False):
    return ImageFont.truetype(r'C:\Windows\Fonts\msyh%s.ttc' % ('bd' if bold else ''), sz)


def p(u, v):
    return (u - v) * 32.0, (u + v) * 16.0


def put(cv, ox, oy, name, u0, v0, z):
    path = os.path.join(MOD, name + '.png')
    im = Image.open(path).convert('RGBA')
    m = json.load(open(path.replace('.png', '.json'), encoding='utf-8'))
    w, h = m['footprint']
    ax, ay = p(u0 + w, v0 + h)
    cv.alpha_composite(im, (int(round(ox + ax - im.width / 2)),
                            int(round(oy + ay - z - (im.height - 2)))))


def diamond(d, ox, oy, u0, v0, w, h, z=0, color=(86, 214, 194), width=1):
    verts = [(u0 + w, v0 + h), (u0 + w, v0), (u0, v0), (u0, v0 + h)]
    xy = [(ox + p(*q)[0], oy + p(*q)[1] - z) for q in verts]
    d.line(xy + [xy[0]], fill=color, width=width)


def seam(d, ox, oy, u0, us, v, z=0, color=(235, 78, 60)):
    a = (ox + p(u0, v)[0], oy + p(u0, v)[1] - z)
    b = (ox + p(us, v)[0], oy + p(us, v)[1] - z)
    d.line([a, b], fill=color, width=2)


def cell(cv, box, title, sub, fn, u0=1, v0=1):
    x, y = box
    w, h = CELL
    d = ImageDraw.Draw(cv)
    d.rounded_rectangle([x, y, x + w - 1, y + h - 1], 8, fill=(38, 42, 48), outline=(58, 64, 72))
    d.text((x + 16, y + 12), title, font=font(17, True), fill=(236, 242, 248))
    d.text((x + 16, y + 34), sub, font=font(11), fill=(142, 158, 170))
    ox, oy = x + w * 0.48, y + h * 0.72
    fn(d, ox, oy)
    return ox, oy


def main():
    cv = Image.new('RGBA', (1000, 700), (26, 30, 36, 255))
    d = ImageDraw.Draw(cv)
    d.text((26, 16), '屋顶分解 · 4×2 坡 ×2 + 4×1 脊', font=font(20, True), fill=(238, 244, 250))
    d.text((26, 44), '等距 2:1，p(u,v)=((u-v)·32,(u+v)·16)；青线=足迹菱形，红线=两坡交界(脊线)',
           font=font(12), fill=(146, 162, 174))

    def c1(d, ox, oy):
        diamond(d, ox, oy, 1, 3, 4, 2, EAVE_Z, (86, 214, 194), 1)
        seam(d, ox, oy, 1, 5, 4, EAVE_Z)
        put(cv, ox, oy, 'roof_slope_sw', 1, 3, EAVE_Z)
        label(d, ox, oy, '① 受光坡 SW · 檐在近边 z=150')

    def c2(d, ox, oy):
        diamond(d, ox, oy, 1, 1, 4, 2, EAVE_Z, (86, 214, 194), 1)
        seam(d, ox, oy, 1, 5, 3, EAVE_Z)
        put(cv, ox, oy, 'roof_slope_ne', 1, 1, EAVE_Z)
        label(d, ox, oy, '② 背坡 NE · 檐在远边 z=150')

    def c3(d, ox, oy):
        diamond(d, ox, oy, 1, 2.5, 4, 1, RIDGE_Z, (86, 214, 194), 1)
        seam(d, ox, oy, 1, 5, 3, RIDGE_Z)
        put(cv, ox, oy, 'roof_ridge_sw', 1, 2.5, RIDGE_Z)
        label(d, ox, oy, '③ 压脊 SW · 4×1 菱形中线=脊线 z=170')

    def c4(d, ox, oy):
        diamond(d, ox, oy, 1, 1, 4, 4, EAVE_Z, (86, 214, 194), 1)
        seam(d, ox, oy, 1, 5, 3, EAVE_Z)
        put(cv, ox, oy, 'roof_slope_ne', 1, 1, EAVE_Z)     # 先画背坡
        put(cv, ox, oy, 'roof_slope_sw', 1, 3, EAVE_Z)     # 再压受光坡
        put(cv, ox, oy, 'roof_ridge_sw', 1, 2.5, RIDGE_Z)  # 最后压脊
        label(d, ox, oy, '叠合顺序 ②→①→③，脊正压交界')

    cell(cv, (20, 80), '① 受光坡 roof_slope_sw', '亮面瓦垄，檐口 8px：瓦头亮棱→檐板暗线→檐内反光', c1)
    cell(cv, (510, 80), '② 背坡 roof_slope_ne', '同纹理同檐口，亮度=受光坡 0.82，靛青环境光+檐内米白反光', c2)
    cell(cv, (20, 390), '③ 压脊 roof_ridge_sw', '4×1 压脊条，赭金脊线 + 两端上翘脊头', c3)
    cell(cv, (510, 390), '叠合 roof（只放屋顶）', '背坡在下、受光坡居中、压脊条收口', c4)

    cv.convert('RGB').save(OUT, quality=95)
    print('saved', OUT)


def label(d, ox, oy, text):
    d.rectangle([ox - 150, oy + 26, ox + 150, oy + 46], fill=(24, 28, 33))
    d.text((ox - 144, oy + 29), text, font=font(11), fill=(176, 192, 204))


if __name__ == '__main__':
    main()
