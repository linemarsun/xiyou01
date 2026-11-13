import sys
import os
import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, r"D:\workspace\dahuayou_web\tools\modv2")
import post as P

GEN = r"D:\workspace\dahuayou_web\assets_v2\preview\gen"
src = Image.open(os.path.join(GEN, 'roof_slope.jpg')).convert('RGB')
print('size', src.size)
key = P.key_green(src)
a = np.array(key)
ys, xs = np.nonzero(a[..., 3] > 40)
bb = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
print('content bbox', bb, 'w', bb[2] - bb[0], 'h', bb[3] - bb[1])

# 网格叠加，便于读角点
s = 0.5
ov = key.resize((int(key.width * s), int(key.height * s)), Image.LANCZOS)
d = ImageDraw.Draw(ov)
for x in range(0, ov.width, int(200 * s)):
    d.line([(x, 0), (x, ov.height)], fill=(255, 0, 0, 200), width=1)
    d.text((x + 2, 2), str(int(x / s)), fill=(255, 255, 0, 255))
for y in range(0, ov.height, int(200 * s)):
    d.line([(0, y), (ov.width, y)], fill=(255, 0, 0, 200), width=1)
    d.text((2, y + 1), str(int(y / s)), fill=(255, 255, 0, 255))
bg = Image.new('RGB', ov.size, (30, 34, 40))
bg.paste(ov, (0, 0), ov)
bg.save(r"D:\workspace\dahuayou_web\assets_v2\preview\_src_grid.png")
print('grid saved')
