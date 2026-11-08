import json, os
from PIL import Image

MOD = r"D:\workspace\dahuayou_web\assets_v2\modules"


def p(u, v):
    return (u - v) * 32.0, (u + v) * 16.0


ox, oy = 430, 268


def put(cv, name, u0, v0, z=0):
    im = Image.open(os.path.join(MOD, name + '.png')).convert('RGBA')
    m = json.load(open(os.path.join(MOD, name + '.json'), encoding='utf-8'))
    w, h = m['footprint']
    ax, ay = p(u0 + w, v0 + h)
    cv.alpha_composite(im, (int(round(ox + ax - im.width / 2)),
                            int(round(oy + ay - z - (im.height - 2)))))


cv = Image.new('RGBA', (860, 400), (30, 34, 40, 255))
put(cv, 'roof_slope_ne', 1, 1, 150)
put(cv, 'roof_slope_sw', 1, 3, 150)
put(cv, 'roof_ridge_sw', 1, 2, 190)
cv.save(r"D:\workspace\dahuayou_web\assets_v2\preview\_layer_roof.png")

cv2 = Image.new('RGBA', (860, 400), (30, 34, 40, 255))
put(cv2, 'wall_wood_sw', 1, 4)
put(cv2, 'wall_wood_sw', 3, 4)
put(cv2, 'wall_wood_se', 4, 1)
put(cv2, 'wall_wood_se', 4, 3)
cv2.save(r"D:\workspace\dahuayou_web\assets_v2\preview\_layer_wall.png")
print('ok')
