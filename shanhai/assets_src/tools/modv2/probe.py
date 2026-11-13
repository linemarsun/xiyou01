# -*- coding: utf-8 -*-
import json
from paths import ROOT, MODULES, PREVIEW, GEN, CHAR, ISO_OUT, HERE, FONT_DIR, ensure
import os

import numpy as np
from PIL import Image

MOD = MODULES


def p(u, v):
    return (u - v) * 32, (u + v) * 16


def mask(n, u0, v0, z, ox=430, oy=268):
    im = Image.open(os.path.join(MOD, n + '.png')).convert('RGBA')
    m = json.load(open(os.path.join(MOD, n + '.json'), encoding='utf-8'))
    w, h = m['footprint']
    ax, ay = p(u0 + w, v0 + h)
    c = Image.new('RGBA', (900, 700), (0, 0, 0, 0))
    c.alpha_composite(im, (int(round(ox + ax - im.width / 2)),
                           int(round(oy + ay - z - (im.height - 2)))))
    return np.array(c)[:, :, 3]


a = mask('roof_slope_ne', 1, 1, 196)
b = mask('roof_slope_sw', 1, 3, 150)
for nm, m in (('ne', a), ('sw', b)):
    ys, xs = np.where(m > 8)
    print(nm, 'y', ys.min(), ys.max(), 'x', xs.min(), xs.max())
print('overlap', int(((a > 8) & (b > 8)).sum()))

# 逐列求 ne 的下边界与 sw 的上边界差，取中位数即为需要的垂直偏移
diffs = []
for x in range(300, 500):
    ca = np.where(a[:, x] > 8)[0]
    cb = np.where(b[:, x] > 8)[0]
    if len(ca) and len(cb):
        diffs.append(ca.max() - cb.min())
diffs = np.array(diffs)
print('col boundary diff  median', int(np.median(diffs)), ' p25', int(np.percentile(diffs, 25)),
      ' p75', int(np.percentile(diffs, 75)))
