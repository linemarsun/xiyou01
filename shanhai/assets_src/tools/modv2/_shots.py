# -*- coding: utf-8 -*-
"""出交付图：单栋近景（当铺 / 酒楼）、城墙近景（含转角）。混合街区实景由 citybuild.sheet_street 出。"""
import os

from PIL import Image, ImageDraw, ImageFont

import citybuild as CB

OUT = r'D:\onenote\OneDrive\Documents\Trae-CN\temp_20261108_02'
BG = (226, 219, 199, 255)
F_T = ImageFont.truetype('C:/Windows/Fonts/msyhbd.ttc', 34)
F_S = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 19)


def shot(items, sc, title, sub, ground=(220, 213, 195, 255), char=None,
         gw=None, gd=None, pad=34):
    b = CB.Board(2600, 2200, ox=900, oy=1100, sc=sc)
    # 平台
    u0 = min(t[1] for t in items) - 0.5
    v0 = min(t[2] for t in items) - 0.5
    u1 = max(t[1] + CB._fp(t[0])[0] for t in items) + 0.5
    v1 = max(t[2] + CB._fp(t[0])[1] for t in items) + 0.5
    b.diamond(u0, v0, u1 - u0, v1 - v0, fill=ground, edge=(203, 195, 178, 255), width=2)
    for nm, uu, vv in items:
        fw, fh = CB._fp(nm)
        b.contact_shadow(uu, vv, fw, fh, alpha=138, blur=5.0 * sc)
        b.place(nm, uu, vv)
    if char:
        b.person(char[0], char[1], 84)
    bb = b.im.getbbox()
    x0, y0 = max(0, bb[0] - pad), max(0, bb[1] - pad)
    x1, y1 = min(b.im.width, bb[2] + pad), min(b.im.height, bb[3] + pad)
    cut = b.im.crop((x0, y0, x1, y1))
    W = max(cut.width + 96, 780)
    H = cut.height + 44 + 108
    cv = Image.new('RGBA', (W, H), BG)
    cv.alpha_composite(cut, ((W - cut.width) // 2, 96))
    d = ImageDraw.Draw(cv)
    d.text((40, 26), title, font=F_T, fill=(32, 28, 24))
    d.text((40, 72), sub, font=F_S, fill=(104, 96, 86))
    d.line([(40, 88), (W - 40, 88)], fill=(206, 198, 182), width=2)
    return cv


def main():
    pairs = [
        ('pawn_closeup', [('shop_pawnshop_sw', 0, 0)], 2.6,
         '当铺 · 3×4 · 单栋近景',
         '山墙补齐：粉墙三角 + 朱红山花 + 外侧博风板 + 悬鱼；侧脸补同族梁柱，不再出现灰米色裸墙',
         (0.6, 3.3)),
        ('tavern_closeup', [('shop_tavern_sw', 0, 0)], 2.2,
         '酒楼 · 5×4 · 单栋近景',
         '近端山墙压在两坡之后才画 → 屋面不再缺一块；侧脸朱红梁柱与正脸同族，只压暗一档',
         (1.2, 5.2)),
    ]
    for name, items, sc, t, s, ch in pairs:
        im = shot(items, sc, t, s, char=ch)
        p = os.path.join(OUT, name + '.png')
        im.convert('RGB').save(p)
        print('->', p, im.size)

    wall = [('city_wall_u2', 0, 0), ('city_wall_u6', 2, 0),
            ('city_wall_corner', 8, 0), ('city_wall_v6', 10, -6), ('city_wall_v2', 10, -8)]
    im = shot(wall, 1.75, '城墙 · 直段 + 转角 · 近景',
              '砖面竖向明暗（上亮下暗）+ 墙根压重 + 转角亮棱与暗倒角 + 垛口内侧压暗；长度方向仍零出挑，接缝 0 缝',
              char=(6.4, 1.2), gw=(214, 207, 190, 255))
    p = os.path.join(OUT, 'wall_closeup.png')
    im.convert('RGB').save(p)
    print('->', p, im.size)


if __name__ == '__main__':
    main()
