# -*- coding: utf-8 -*-
"""街角拼装验证：4×4 房子（受光坡 + 背坡 + 单条正脊 + 端面山墙）+ 城门 + 松树 + 84px 角色。
图上标注：正脊线、山墙面、两坡足迹菱形。"""
import json
from paths import ROOT, MODULES, PREVIEW, GEN, CHAR, ISO_OUT, HERE, FONT_DIR, ensure
import os

from PIL import Image, ImageDraw, ImageFont

MOD = os.path.join(ROOT, 'assets_src', 'modules')
OUT = os.path.join(ROOT, 'assets_src', 'preview', 'modules_corner_test.png')
CHAR = os.path.join(ROOT, 'assets_src', 'sprites', 'xiake', 'idle_0.png')
CHAR_H = 84
CW, CH = 940, 700
OX, OY = 440, 300
EAVE_Z = 170
RIDGE_Z = 210


def font(sz, bold=False):
    return ImageFont.truetype(FONT_DIR + '/msyh%s.ttc' % ('bd' if bold else ''), sz)


def p(u, v):
    return (u - v) * 32.0, (u + v) * 16.0


def load(name):
    path = os.path.join(MOD, name + '.png')
    return Image.open(path).convert('RGBA'), json.load(open(path.replace('.png', '.json'), encoding='utf-8'))


def main():
    canvas = Image.new('RGBA', (CW, CH), (120, 158, 112, 255))
    g = Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
    d = ImageDraw.Draw(g)

    def put(name, u0, v0, z=0, dx=0, dy=0):
        im, meta = load(name)
        cell = meta.get('anchor_cell', [meta['footprint'][0], meta['footprint'][1]])
        ax, ay = p(u0 + cell[0], v0 + cell[1])
        apx = meta.get('anchor_px', [im.width / 2, im.height])
        px = int(round(OX + ax - apx[0])) + dx
        py = int(round(OY + ay - z - apx[1])) + dy
        canvas.alpha_composite(im, (px, py))
        return px, py

    for i in range(6):
        for j in range(6):
            put('ground_stone', 2 * i, 2 * j)
    for (u, v) in ((6, 6), (2, 8), (4, 0), (8, 4)):
        put('ground_dirt', u, v)

    # 墙身：两面（u=5 面 / v=5 面），锚点同为 p(5,5)
    put('wall_wood_se', 4, 1)
    put('wall_wood_sw', 1, 4)

    # 檐口投影：墙顶下方一道渐变暗影（在墙面内侧，z 由 170 往下）
    sh = Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
    ds = ImageDraw.Draw(sh)
    for i in range(11):
        band = [(OX + x, OY + y - (EAVE_Z - i)) for (x, y) in (p(1, 5), p(5, 5))]
        ds.line(band, fill=(8, 14, 20, int(66 * (1 - i / 10.0) ** 1.4)), width=2)
    for i in range(8):
        band = [(OX + x, OY + y - (EAVE_Z - i)) for (x, y) in (p(5, 1), p(5, 5))]
        ds.line(band, fill=(8, 14, 20, int(40 * (1 - i / 7.0) ** 1.4)), width=2)
    canvas.alpha_composite(sh)

    # 屋面：全部按同一足迹原点 (1,1) 摆，z 由构件元数据决定
    put('roof_slope_ne', 1, 1, EAVE_Z)     # 背坡（先）
    put('roof_gable_se', 4, 1, EAVE_Z)     # 山墙（补端头）
    put('roof_slope_sw', 1, 3, EAVE_Z)     # 受光坡
    put('roof_ridge_sw', 1, 2.5, RIDGE_Z)  # 单条正脊压交界

    put('gate_arch', 6, 1)
    put('tree_pine', 10, 2)

    ch = Image.open(CHAR).convert('RGBA')
    bb = ch.getbbox()
    f = CHAR_H / (bb[3] - bb[1])
    ch = ch.resize((int(ch.width * f), int(ch.height * f)), Image.LANCZOS)
    cx, cy = p(6.0, 8.0)
    canvas.alpha_composite(ch, (int(OX + cx - (bb[0] + bb[2]) / 2 * f), int(OY + cy - bb[3] * f)))

    # ---------- 标注 ----------
    # 两坡足迹菱形（受光坡 v3..5 / 背坡 v1..3）
    def dia(u0, v0, u1, v1, z, color):
        pts = [(OX + p(u, v)[0], OY + p(u, v)[1] - z) for (u, v) in
               ((u1, v1), (u1, v0), (u0, v0), (u0, v1))]
        d.line(pts + [pts[0]], fill=color, width=1)

    dia(1, 3, 5, 5, 0, (120, 214, 194, 120))
    dia(1, 1, 5, 3, 0, (120, 190, 240, 120))

    # 正脊线（唯一一条，压在 v=3 交界）
    a = (OX + p(1, 3)[0], OY + p(1, 3)[1] - RIDGE_Z)
    b = (OX + p(5, 3)[0], OY + p(5, 3)[1] - RIDGE_Z)
    d.line([a, b], fill=(255, 78, 60, 255), width=2)
    for i in range(0, 24, 2):
        t0, t1 = i / 24.0, (i + 1) / 24.0
        d.line([(a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0),
                (a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1)], fill=(255, 210, 90, 255))
    mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
    d.line([(mid[0], mid[1] - 46), (mid[0], mid[1] - 6)], fill=(255, 78, 60, 255), width=2)
    d.text((mid[0] - 44, mid[1] - 68), '正脊线 u1..5 v=3 z=210（唯一一条）',
           font=font(12, True), fill=(255, 130, 100))

    # 山墙面：u=5 端三角
    tri = [(OX + p(5, 5)[0], OY + p(5, 5)[1] - EAVE_Z),
           (OX + p(5, 1)[0], OY + p(5, 1)[1] - EAVE_Z),
           (OX + p(5, 3)[0], OY + p(5, 3)[1] - RIDGE_Z)]
    d.line(tri + [tri[0]], fill=(86, 214, 194, 255), width=2)
    d.text((tri[1][0] + 6, tri[1][1] - 18), '山墙面 SE（贴端墙、与坡面收头齐平）',
           font=font(12, True), fill=(130, 240, 220))

    canvas.alpha_composite(g)
    d = ImageDraw.Draw(canvas)
    d.text((26, 18), '构件拼装验证 · 街角', font=font(19, True), fill=(238, 245, 250))
    d.text((26, 46), '4×4 房：4×2 受光坡(SW, 檐 z=170) + 4×2 背坡(NE, 0.845 亮度) + 4×1 正脊(z=210) + 端面山墙',
           font=font(11), fill=(150, 168, 178))
    d.text((26, 64), '墙板面高 170 / 面长 4 格 / 底边 2:1；檐口压住墙顶并外挑 4.3px；同一 84px 角色',
           font=font(11), fill=(150, 168, 178))
    canvas.convert('RGB').save(OUT, quality=95)
    print('saved', OUT, canvas.size)


if __name__ == '__main__':
    main()
