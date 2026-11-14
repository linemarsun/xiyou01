# -*- coding: utf-8 -*-
"""离线等距渲染器：按 taoyuan.json 真实布局 + assets_src/modules 贴图，
忠实复现游戏渲染（画家序 = 足迹前底顶点 y 升序；锚点 = anchor_px 对足迹前底顶点）。

用法：
  python tools/render_iso.py palace          # 渲染宫城区域 (x38..90, y38..90)
  python tools/render_iso.py full            # 渲染全城缩略
输出：shanhai/_restyle_samples/iso_render_<name>.png
"""
import json
import os
import sys

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..'))
MOD = os.path.join(ROOT, 'assets_src', 'modules')
MOD2 = os.path.join(ROOT, 'public', 'assets', 'art', 'iso')  # 运行时资产（gate_keep/house 等）
OUT_DIR = os.path.join(ROOT, '_restyle_samples')
LAYOUT = os.path.join(ROOT, 'public', 'assets', 'art', 'iso', 'taoyuan.json')

# 地面色（近似 AI 块贴图均色，仅作离线预览用）
GROUND_COLORS = {
    'ground_grass': (116, 152, 84),
    'ground_stone': (176, 170, 158),
    'ground_dirt': (156, 124, 80),
    'ground_water': (94, 128, 152),
    'ground_marble': (224, 222, 214),
}

_cache = {}


def mod(name):
    if name not in _cache:
        p = None
        if os.path.exists(os.path.join(MOD, name + '.png')):
            p = os.path.join(MOD, name)
        elif os.path.exists(os.path.join(MOD2, name + '.png')):
            p = os.path.join(MOD2, name)
        if p is None:
            raise FileNotFoundError(name)
        jp = p + '.json'
        meta = json.load(open(jp, encoding='utf-8')) if os.path.exists(jp) else {}
        _cache[name] = (Image.open(p + '.png').convert('RGBA'), meta)
    return _cache[name]


class Board(object):
    def __init__(self, w, h, ox, oy, tile_w=64, tile_h=32):
        self.im = Image.new('RGBA', (w, h), (24, 26, 22, 255))
        self.ox, self.oy = ox, oy
        self.tw, self.th = tile_w, tile_h

    def P(self, u, v):
        return (self.ox + (u - v) * self.tw / 2.0,
                self.oy + (u + v) * self.th / 2.0)

    def ground_diamond(self, u0, v0, w, h, color):
        d = ImageDraw.Draw(self.im)
        pts = [self.P(u0 + w, v0 + h), self.P(u0, v0 + h),
               self.P(u0, v0), self.P(u0 + w, v0)]
        d.polygon(pts, fill=color + (255,))

    def place(self, name, u0, v0, w=None, h=None):
        """与游戏一致：锚点 anchor_px 落在足迹前底顶点 P(u0+w-1, v0+h-1) 的菱形下顶点"""
        spr, meta = mod(name)
        mw = meta.get('footprint_w') or (meta.get('footprint') or [w or 1, h or 1])[0]
        mh = meta.get('footprint_h') or (meta.get('footprint') or [w or 1, h or 1])[1]
        # 游戏里 anchor(0.5,1) 落 frontVertex = 前底格菱形中心 y + tileH/2
        fx, fy = self.P(u0 + mw - 1, v0 + mh - 1)
        fy += self.th / 2.0
        ap = meta.get('anchor_px')
        if ap:
            ax, ay = ap
        else:
            kx, ky = meta.get('anchor') or [0.5, 1.0]
            ax, ay = spr.width * kx, spr.height * ky
        pos = (int(round(fx - ax)), int(round(fy - ay)))
        self.im.alpha_composite(spr, pos)


def render(region=None, out_name='iso_render'):
    layout = json.load(open(LAYOUT, encoding='utf-8'))
    g = layout['grid']
    items = layout['items']

    grounds = [i for i in items if i['type'].startswith('ground_')]
    props = [i for i in items if not i['type'].startswith('ground_')]

    if region:
        x0, y0, x1, y1 = region
    else:
        x0, y0, x1, y1 = 0, g['rows'], g['cols'], 0  # full

    # 计算画布：区域菱形范围
    corners = [(x0, y0), (x1, y0), (x0, y1), (x1, y1)]
    xs = [(cx - cy) * g['tileW'] / 2 for cx, cy in corners]
    ys = [(cx + cy) * g['tileH'] / 2 for cx, cy in corners]
    pad = 900  # 高构件出挑余量
    min_x, max_x = min(xs) - pad, max(xs) + pad
    min_y, max_y = min(ys) - pad, max(ys) + pad
    W, H = int(max_x - min_x), int(max_y - min_y)
    ox, oy = -min_x, -min_y
    b = Board(W, H, ox, oy, g['tileW'], g['tileH'])

    # 地面：按 (gx+gy) 升序铺（与渲染层一致）
    for it in sorted(grounds, key=lambda i: (i['gx'] + i['gy'], i['gx'])):
        col = GROUND_COLORS.get(it['type'], (100, 100, 100))
        b.ground_diamond(it['gx'], it['gy'], it.get('w', 1), it.get('h', 1), col)

    # 构件：画家序 = 足迹前底顶点 y = gx+gy 升序
    def sort_key(it):
        w = it.get('w') or 1
        h = it.get('h') or 1
        return ((it['gx'] + w - 1) + (it['gy'] + h - 1), it['gx'], it['gy'])

    skipped = []
    for it in sorted(props, key=sort_key):
        t = it['type']
        name = t
        if it.get('variant'):
            name = f"{t}_{it['variant']}"
        f = it.get('facing')
        cand = [f"{name}_{f}", name] if f else [name]
        if t == 'house':
            hf = f or 'sw'
            cand = ([f"house_4x4_{hf}_{it.get('variant')}"] if it.get('variant') else []) + [f"house_4x4_{hf}"]
        found = None
        for c in cand:
            if os.path.exists(os.path.join(MOD, c + '.png')) or os.path.exists(os.path.join(MOD2, c + '.png')):
                found = c
                break
        if not found:
            skipped.append(t)
            continue
        mw = it.get('w')
        mh = it.get('h')
        b.place(found, it['gx'], it['gy'], mw, mh)
    if skipped:
        print('缺图跳过:', sorted(set(skipped)))

    im = b.im
    # 调试：叠加红色足迹线框，验证贴图与足迹的对齐
    if os.environ.get('ISO_DEBUG_FP'):
        d = ImageDraw.Draw(im)
        for it in sorted(props, key=sort_key):
            w = it.get('w') or 1
            h = it.get('h') or 1
            pts = [b.P(it['gx'] + w, it['gy'] + h), b.P(it['gx'], it['gy'] + h),
                   b.P(it['gx'], it['gy']), b.P(it['gx'] + w, it['gy'])]
            d.polygon(pts, outline=(255, 0, 0, 255))
    if region:
        # 裁回内容区
        im = im.crop(im.getbbox())
    out = os.path.join(OUT_DIR, f'{out_name}.png')
    im.save(out)
    print('saved', out, im.size)


if __name__ == '__main__':
    what = sys.argv[1] if len(sys.argv) > 1 else 'palace'
    if what == 'palace':
        render(region=(38, 38, 90, 90), out_name='iso_render_palace')
    elif what == 'full':
        render(region=None, out_name='iso_render_full')
    else:
        x0, y0, x1, y1 = map(int, what.split(','))
        render(region=(x0, y0, x1, y1), out_name=f'iso_render_{what.replace(",", "_")}')
