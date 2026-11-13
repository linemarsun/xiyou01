import json, os
import numpy as np
from PIL import Image

MOD = r"D:\workspace\dahuayou_web\assets_v2\modules"


def load(n):
    im = Image.open(os.path.join(MOD, n + '.png')).convert('RGBA')
    a = np.array(im)
    return im, a


def edges(name):
    im, a = load(name)
    al = a[..., 3] > 40
    H, W = al.shape
    top = np.full(W, -1, int)
    bot = np.full(W, -1, int)
    for x in range(W):
        ys = np.nonzero(al[:, x])[0]
        if len(ys):
            top[x] = ys[0]
            bot[x] = ys[-1]
    cols = np.nonzero(top >= 0)[0]
    print('---', name, im.size)
    # 取列范围两端与中点
    for frac in (0.08, 0.2, 0.35, 0.5, 0.65, 0.8, 0.92):
        x = int(cols[0] + (cols[-1] - cols[0]) * frac)
        print('  x=%4d top=%3d bot=%3d h=%3d' % (x, top[x], bot[x], bot[x] - top[x]))
    # 主色统计
    m = al.copy()
    px = a[m][:, :3].astype(float)
    print('  rgb mean', px.mean(0).round(1), 'lum', round(float(px.mean(0) @ [0.299, 0.587, 0.114]), 1))


for n in ['roof_slope_sw', 'roof_slope_ne', 'roof_ridge_sw']:
    edges(n)
