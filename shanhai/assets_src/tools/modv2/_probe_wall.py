# -*- coding: utf-8 -*-
import sys
import os
from paths import ROOT, MODULES, PREVIEW, GEN, CHAR, ISO_OUT, HERE, FONT_DIR, ensure
sys.path.insert(0, HERE)
import numpy as np
import post as P
from PIL import Image

im = Image.open(os.path.join(GEN, 'wall_wood.jpg')).convert('RGB')
im = P.key_green(im)
im.putalpha(P.largest_component(im.split()[3]))
bb = im.getbbox()
im = im.crop(bb)
a = np.array(im)[..., 3] > 10
cols = np.where(a.any(axis=0))[0]
tops = []
bots = []
for x in cols:
    c = np.nonzero(a[:, x])[0]
    tops.append(int(c.min()))
    bots.append(int(c.max()))
tops = np.array(tops)
bots = np.array(bots)
print('bbox', im.size, 'cols', cols.min(), cols.max())
print('bot slope', np.polyfit(cols, bots, 1))
print('top slope', np.polyfit(cols, tops, 1))
print('faceH mean', float(np.mean(bots - tops)))
print('ratio', im.size[0] / im.size[1])
