# -*- coding: utf-8 -*-
"""数值核对：把三件屋顶按足迹放到画布，输出各自的像素包围盒与交界线位置。"""
import json
import os

import numpy as np
from PIL import Image

ROOT = r'D:\workspace\dahuayou_web'
MOD = os.path.join(ROOT, 'assets_v2', 'modules')


def p(u, v):
    return (u - v) * 32.0, (u + v) * 16.0


def place(name, u0, v0, z):
    im = Image.open(os.path.join(MOD, name + '.png')).convert('RGBA')
    m = json.load(open(os.path.join(MOD, name + '.json'), encoding='utf-8'))
    w, h = m['footprint']
    ax, ay = p(u0 + w, v0 + h)
    return im, int(round(ax - im.width / 2)), int(round(ay - z - (im.height - 2))), m


for name, u0, v0, z in [('roof_slope_sw', 1, 3, 150), ('roof_slope_ne', 1, 1, 172),
                        ('roof_ridge_sw', 1, 2, 172)]:
    im, dx, dy, m = place(name, u0, v0, z)
    a = np.array(im)
    al = a[..., 3] > 30
    ys, xs = np.nonzero(al)
    # 世界坐标（以足迹前底顶点为原点）
    ax_w, ay_w = p(u0 + m['footprint'][0], v0 + m['footprint'][1])
    x_rel = xs + dx - ax_w  # 相对锚点的 x
    y_rel = ys + dy - ay_w  # 相对锚点的 y（含 -z）
    print('%-16s sprite %dx%d  bbox x[%d..%d] y[%d..%d] 锚点偏移(%d,%d)'
          % (name, im.width, im.height, x_rel.min(), x_rel.max(), y_rel.min(), y_rel.max(), dx, dy))
