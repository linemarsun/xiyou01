# -*- coding: utf-8 -*-
"""交付图：① 4×4 房屋四向对照（84px 角色） ② 墙身+双坡+正脊+山墙 叠合与分解（标檐口 z=170）。"""
import json
from paths import ROOT, MODULES, PREVIEW, GEN, CHAR, ISO_OUT, HERE, FONT_DIR, ensure
import os

from PIL import Image, ImageDraw, ImageFont

MOD = os.path.join(ROOT, 'assets_src', 'modules')
PRE = os.path.join(ROOT, 'assets_src', 'preview')
CHAR = os.path.join(ROOT, 'assets_src', 'sprites', 'xiake', 'idle_0.png')

WALL_H = 170
EAVE_Z = 170
RIDGE_Z = 210
CHAR_H = 84

INK = (30, 27, 24)
PAPER = (244, 240, 231)
MUT = (122, 114, 103)
CYAN = (16, 140, 160)
RED = (176, 58, 44)

# 各子件锚点相对「足迹前底顶点」的屏幕偏移（由 S() 反算，非手工估）
REL = {'house_4x4_sw': (0, 0), 'house_4x4_se': (0, 0), 'house_4x4_ne': (0, 0),
       'house_4x4_nw': (0, 0),
       'wall_wood_sw': (0, 0), 'wall_wood_se': (0, 0),
       'roof_slope_sw': (0, 0), 'roof_slope_ne': (128, -64),
       'roof_gable_se': (0, 0), 'roof_ridge_sw': (48, -24)}


def font(sz, bold=False):
    return ImageFont.truetype(FONT_DIR + '/msyh%s.ttc' % ('bd' if bold else ''), sz)


def p(u, v):
    return (u - v) * 32.0, (u + v) * 16.0


def load(name):
    path = os.path.join(MOD, name + '.png')
    meta = json.load(open(path.replace('.png', '.json'), encoding='utf-8'))
    return Image.open(path).convert('RGBA'), meta


def pt(dst, name, ax, ay, z=0, dxy=(0, 0)):
    """把 name 的锚点摆到屏幕 (ax, ay)，z 抬高；dxy 为额外像素偏移。"""
    im, meta = load(name)
    r = REL.get(name, (0, 0))
    apx = meta['anchor_px']
    px = int(round(ax + r[0] - apx[0] + dxy[0]))
    py = int(round(ay + r[1] - z - apx[1] + dxy[1]))
    dst.alpha_composite(im, (px, py))
    return px, py


def diamond(dst, ax, ay, fill=None, color=(90, 110, 80, 120), w=2):
    d = ImageDraw.Draw(dst)
    pts = [(ax + p(u, v)[0], ay + p(u, v)[1] - 160) for (u, v) in ((1, 1), (5, 1), (5, 5), (1, 5))]
    if fill:
        d.polygon(pts, fill=fill)
    d.line(pts + [pts[0]], fill=color, width=w)
    return pts


def dash(d, a, b, col, w=2, seg=6, gap=6):
    L = ((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2) ** 0.5
    n = max(1, int(L / (seg + gap)))
    for i in range(n + 1):
        t0 = min(1.0, i * (seg + gap) / L)
        t1 = min(1.0, (i * (seg + gap) + seg) / L)
        d.line([(a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0),
                (a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1)], fill=col, width=w)


def eave_lines(d, ax, ay):
    """檐口 z=170 标高线 = 墙顶两条边（v=5 面 / u=5 面）。"""
    v5 = ((ax + p(1, 5)[0], ay + p(1, 5)[1] - 160 - EAVE_Z),
          (ax + p(5, 5)[0], ay + p(5, 5)[1] - 160 - EAVE_Z))
    u5 = ((ax + p(5, 5)[0], ay + p(5, 5)[1] - 160 - EAVE_Z),
          (ax + p(5, 1)[0], ay + p(5, 1)[1] - 160 - EAVE_Z))
    for a, b in (v5, u5):
        dash(d, a, b, CYAN)


def char_img():
    im = Image.open(CHAR).convert('RGBA')
    k = CHAR_H / float(im.height)
    return im.resize((max(1, int(im.width * k)), CHAR_H), Image.LANCZOS)


CHAR_IM = char_img()


def house(dst, ax, ay):
    """按叠合顺序画整屋：墙身 → 远山墙 → 背坡 → 近山墙 → 受光坡 → 正脊。"""
    pt(dst, 'wall_wood_sw', ax, ay, 0)
    pt(dst, 'wall_wood_se', ax, ay, 0)
    pt(dst, 'roof_gable_se', ax, ay, EAVE_Z, dxy=(-128, -64))
    pt(dst, 'roof_slope_ne', ax, ay, EAVE_Z)
    pt(dst, 'roof_gable_se', ax, ay, EAVE_Z)
    pt(dst, 'roof_slope_sw', ax, ay, EAVE_Z)
    pt(dst, 'roof_ridge_sw', ax, ay, RIDGE_Z)


# ------------------------------------------------------------------ ① 四向对照
FACINGS = [('house_4x4_sw', 'SW 向 · 前脸（S 墙 + E 墙）'),
           ('house_4x4_se', 'SE 向 · 水平镜像派生'),
           ('house_4x4_ne', 'NE 向 · 背光墙面'),
           ('house_4x4_nw', 'NW 向 · 水平镜像派生')]

CW, CH = 400, 440
TOP = 112


def sheet_four():
    im = Image.new('RGBA', (CW * 2, TOP + CH * 2), PAPER + (255,))
    d = ImageDraw.Draw(im)
    d.text((36, 24), '4×4 完整屋身 · 四向对照', font=font(25, True), fill=INK)
    d.text((36, 64), '统一标高：墙身 170px = 檐口 z=170；坡面下檐压墙顶并外出檐 4.3px；正脊 z=210（一条）',
           font=font(14), fill=MUT)
    for i, (name, cap) in enumerate(FACINGS):
        x0, y0 = (i % 2) * CW, TOP + (i // 2) * CH
        ax, ay = x0 + 196, y0 + 342
        d.rectangle([x0 + 6, y0 + 6, x0 + CW - 6, y0 + CH - 6], outline=(208, 201, 189, 255), width=1)
        diamond(im, ax, ay, fill=(216, 208, 191, 255), color=(170, 162, 146, 220))
        for k in range(1, 4):
            d.line([(ax + p(1 + k, 5)[0], ay + p(1 + k, 5)[1] - 160),
                    (ax + p(5, 1 + k)[0], ay + p(5, 1 + k)[1] - 160)],
                   fill=(188, 180, 162, 130), width=1)
            d.line([(ax + p(1 + k, 1)[0], ay + p(1 + k, 1)[1] - 160),
                    (ax + p(5, 1 + k)[0], ay + p(5, 1 + k)[1] - 160)],
                   fill=(188, 180, 162, 130), width=1)
        eave_lines(d, ax, ay)
        house(im, ax, ay)
        eave_lines(d, ax, ay)
        im.alpha_composite(CHAR_IM, (int(ax + 148), int(ay - 4 - CHAR_H)))
        d.text((x0 + 22, y0 + CH - 70), cap, font=font(15, True), fill=INK)
        d.text((x0 + 22, y0 + CH - 48), '足迹 4×4 · 檐口 z=170 · 脊 z=210', font=font(12), fill=MUT)
        d.text((x0 + 22, y0 + CH - 28), '84px 人物 · 青色虚线 = 檐口标高线', font=font(12), fill=(152, 145, 134))
    out = os.path.join(PRE, 'house_4facings.png')
    im.convert('RGB').save(out)
    print('->', out, im.size)


# ------------------------------------------------- ② 叠合（左）+ 分解（右，五层）
LAYERS = [
    ('1  墙身', '两片墙板，z 0→170，墙顶即檐口', '4×4 · z 0→170', 'wall'),
    ('2  背坡 NE', '靛青瓦，亮度 0.845，自带檐内反光', '4×2 · z 170→210', 'back'),
    ('3  受光坡 SW', '瓦垄 + 瓦当 + 檐板，压住墙顶外挑 4.3px', '4×2 · z 170→210', 'front'),
    ('4  正脊', '4×1 一条，压在 v=3 两坡交界', '4×1 · z 210', 'ridge'),
    ('5  山墙 ×2', '封两坡端头，底边与檐口齐平', '1×4 ×2 · z 170→210', 'gable'),
]
KW, KH = 250, 300


def panel_explode():
    W, H = 470 + KW * len(LAYERS), 586
    im = Image.new('RGBA', (W, H), PAPER + (255,))
    d = ImageDraw.Draw(im)
    d.text((32, 20), '4×4 屋身 · 叠合与分解（檐口 z=170 统一标高）', font=font(23, True), fill=INK)

    ax, ay = 246, 408
    diamond(im, ax, ay, fill=(216, 208, 191, 255), color=(170, 162, 146, 220))
    house(im, ax, ay)
    eave_lines(d, ax, ay)
    r0 = (ax + p(1, 3)[0], ay + p(1, 3)[1] - 160 - RIDGE_Z)
    r1 = (ax + p(5, 3)[0], ay + p(5, 3)[1] - 160 - RIDGE_Z)
    d.line([r0, r1], fill=RED, width=2)
    d.text((r1[0] + 4, r1[1] + 4), '正脊 z=210', font=font(12, True), fill=RED)
    d.text((18, ay - 160 - EAVE_Z - 6), '檐口 z=170', font=font(13, True), fill=CYAN)
    d.text((18, ay - 160 - EAVE_Z + 13), '= 墙身 170px', font=font(12), fill=CYAN)
    d.text((28, H - 40), '叠合顺序：墙身 → 背坡 → 受光坡 → 正脊 → 山墙（2 件）· 全部锚定足迹前底顶点 p(5,5)',
           font=font(12), fill=MUT)

    for i, (cap, note, fp, kind) in enumerate(LAYERS):
        x0 = 470 + i * KW
        d.line([(x0, 88), (x0, H - 58)], fill=(211, 203, 191, 255), width=1)
        bx, by = x0 + KW // 2 - 4, 400
        diamond(im, bx, by, fill=(238, 232, 219, 255), color=(200, 192, 176, 230))
        if kind == 'wall':
            pt(im, 'wall_wood_sw', bx, by, 0)
            pt(im, 'wall_wood_se', bx, by, 0)
        elif kind == 'back':
            pt(im, 'roof_slope_ne', bx, by, 0)
        elif kind == 'front':
            pt(im, 'roof_slope_sw', bx, by, 0)
        elif kind == 'ridge':
            pt(im, 'roof_ridge_sw', bx, by, 0)
        else:
            pt(im, 'roof_gable_se', bx, by, 0, dxy=(-164, -82))
            pt(im, 'roof_gable_se', bx, by, 0, dxy=(10, 0))
        d.text((x0 + 16, 100), cap, font=font(16, True), fill=INK)
        d.text((x0 + 16, 126), note, font=font(11), fill=MUT)
        d.text((x0 + 16, H - 92), '足迹 ' + fp, font=font(11), fill=MUT)
        if i < 4:
            d.line([(x0 + KW - 6, 100), (x0 + KW - 6, 120)], fill=(206, 198, 186), width=2)
            d.polygon([(x0 + KW - 10, 118), (x0 + KW - 2, 118), (x0 + KW - 6, 126)], fill=(206, 198, 186))
    out = os.path.join(PRE, 'house_explode.png')
    im.convert('RGB').save(out)
    print('->', out, im.size)


def zoom():
    im = Image.open(os.path.join(MOD, 'house_4x4_sw.png')).convert('RGBA')
    bg = Image.new('RGBA', im.size, (244, 240, 231, 255))
    bg.alpha_composite(im)
    bg = bg.resize((im.width * 2, im.height * 2), Image.NEAREST)
    bg.convert('RGB').save(os.path.join(PRE, '_zoom_house.png'))


if __name__ == '__main__':
    sheet_four()
    panel_explode()
    zoom()
