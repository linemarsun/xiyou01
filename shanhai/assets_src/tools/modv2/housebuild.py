# -*- coding: utf-8 -*-
"""4×4 完整屋身（四向）——墙身 + 受光坡 + 背坡 + 正脊 + 两端山墙，成套烘焙成一件。
标高体系（与子件完全一致，引擎直接落地，不需要抬高补缝）：
    wall_h = 170（墙板面高）   eave_z = 170（檐口正好落墙顶）
    ridge_z = 210（正脊）      出檐 = 4.3px（沿坡外法向外挑）
    anchor = 足迹前底顶点 p(5,5)
"""
import json
import os

from PIL import Image, ImageDraw, ImageFont

ROOT = r'D:\workspace\dahuayou_web'
MOD = os.path.join(ROOT, 'assets_v2', 'modules')
PRE = os.path.join(ROOT, 'assets_v2', 'preview')
CHAR = os.path.join(ROOT, 'assets_v2', 'sprites', 'xiake', 'idle_0.png')
CHAR_H = 84

WALL_H = 170
EAVE_Z = 170
RIDGE_Z = 210
CW, CH = 560, 580
OX, OY = 280, 350
SIZE = (273, 327)      # 四个朝向统一的精灵尺寸
APX = (137, 325)       # 统一锚点像素（= 4×4 足迹前底顶点）


def font(sz, bold=False):
    return ImageFont.truetype(r'C:\Windows\Fonts\msyh%s.ttc' % ('bd' if bold else ''), sz)


def p(u, v):
    return (u - v) * 32.0, (u + v) * 16.0


def load(name):
    path = os.path.join(MOD, name + '.png')
    meta = json.load(open(path.replace('.png', '.json'), encoding='utf-8'))
    return Image.open(path).convert('RGBA'), meta


def place(canvas, name, u0, v0, z=0, dxy=(0, 0)):
    im, meta = load(name)
    cell = meta.get('anchor_cell', list(meta['footprint']))
    ax, ay = p(u0 + cell[0], v0 + cell[1])
    apx = meta['anchor_px']
    px = int(round(OX + ax - apx[0] + dxy[0]))
    py = int(round(OY + ay - z - apx[1] + dxy[1]))
    canvas.alpha_composite(im, (px, py))
    return px, py


# ---------------------------------------------------------------- 门脸变体
def face_to_screen(canvas, flat, wall_u0=1, wall_v=5):
    """把 128×170 的平面门脸按 2:1 剪切贴到 v=5 墙面（x = 左端基点）。"""
    bx, by = OX + p(wall_u0, wall_v)[0], OY + p(wall_u0, wall_v)[1]
    # output(x,y) -> input( s=x-bx , yimg=170-(by+(x-bx)/2-y) )
    coeffs = (1, 0, -bx, -0.5, 1, 170 - by + bx / 2.0)
    big = flat.transform(canvas.size, Image.AFFINE, coeffs, Image.BICUBIC)
    canvas.alpha_composite(big)


def flat_face(style):
    """128×170，y=0 顶部（z=170），y=170 墙脚。"""
    im = Image.new('RGBA', (128, 170), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if style == 'lattice':
        # 木格窗：大扇方格窗 + 侧门
        d.rectangle([26, 34, 92, 96], fill=(247, 240, 221, 255), outline=(83, 52, 38, 255), width=4)
        for i in range(1, 6):
            d.line([26 + i * 13.2, 34, 26 + i * 13.2, 96], fill=(96, 62, 44, 255), width=2)
            d.line([26, 34 + i * 12.4, 92, 34 + i * 12.4], fill=(96, 62, 44, 255), width=2)
        d.rectangle([26, 34, 92, 96], outline=(58, 38, 30, 255), width=3)
        d.rectangle([8, 104, 44, 168], fill=(150, 52, 44, 255), outline=(70, 30, 24, 255), width=3)
        d.rectangle([26, 104, 26, 168], fill=(88, 34, 28, 255), width=2)
        for yy in range(112, 164, 11):
            d.ellipse([15, yy, 19, yy + 4], fill=(196, 150, 66, 255))
            d.ellipse([33, yy, 37, yy + 4], fill=(196, 150, 66, 255))
    elif style == 'carved':
        # 雕花窗：拱顶 + 菱形棂 + 中心雕花
        d.rectangle([24, 30, 94, 100], fill=(242, 230, 205, 255), outline=(70, 46, 34, 255), width=4)
        d.pieslice([24, 18, 94, 76], 180, 360, fill=(242, 230, 205, 255),
                   outline=(70, 46, 34, 255), width=4)
        for i in range(3):
            x0 = 30 + i * 22
            d.polygon([(x0, 96), (x0 + 11, 76), (x0 + 22, 96), (x0 + 11, 34)],
                      outline=(110, 72, 48, 255))
        d.polygon([(59, 66), (72, 54), (85, 66), (72, 78)], fill=(176, 66, 48, 255),
                  outline=(70, 40, 30, 255))
        d.rectangle([24, 96, 94, 100], fill=(96, 60, 42, 255))
        d.rectangle([6, 110, 40, 168], fill=(146, 50, 42, 255), outline=(66, 28, 22, 255), width=3)
    elif style == 'shop':
        # 商铺：檐下挂落 + 匾额 + 柜台货架
        for i in range(12):
            x = 4 + i * 10.4
            d.line([x, 12, x, 30], fill=(120, 74, 44, 255), width=3)
            d.line([x, 24, x + 10.4, 24], fill=(120, 74, 44, 255), width=2)
            d.ellipse([x - 2, 30, x + 4, 40], fill=(176, 66, 48, 255))
        d.rectangle([34, 44, 94, 66], fill=(58, 40, 30, 255), outline=(186, 139, 48, 255), width=3)
        d.rectangle([38, 48, 90, 62], fill=(70, 50, 36, 255))
        for i in range(6):
            d.line([42 + i * 8, 49, 42 + i * 8, 61], fill=(214, 176, 100, 255), width=2)
        d.rectangle([16, 78, 112, 152], fill=(28, 22, 20, 255))
        d.rectangle([20, 82, 108, 146], fill=(46, 34, 28, 255))
        for yy in (96, 118, 140):
            d.line([20, yy, 108, yy], fill=(120, 84, 52, 255), width=4)
        for i in range(9):
            d.ellipse([24 + i * 9, 104, 30 + i * 9, 112], fill=(180, 120, 60, 255))
        d.rectangle([0, 156, 128, 170], fill=(92, 60, 40, 255))
        d.rectangle([0, 156, 128, 160], fill=(148, 100, 62, 255))
    else:
        # plain：基础屋身的素门脸（木格窗 + 单扇板门），供 se 前脸与无门朝向使用
        d.rectangle([22, 26, 106, 96], fill=(247, 240, 221, 255), outline=(83, 52, 38, 255), width=4)
        for i in range(1, 6):
            d.line([22 + i * 14, 26, 22 + i * 14, 96], fill=(96, 62, 44, 255), width=2)
            d.line([22, 26 + i * 14, 106, 26 + i * 14], fill=(96, 62, 44, 255), width=2)
        d.rectangle([22, 26, 106, 96], outline=(58, 38, 30, 255), width=3)
        d.rectangle([12, 104, 62, 168], fill=(160, 58, 46, 255), outline=(70, 30, 24, 255), width=3)
        d.rectangle([37, 104, 37, 168], fill=(88, 34, 28, 255), width=2)
        for yy in (124, 144):
            d.ellipse([18, yy, 26, yy + 8], fill=(196, 150, 66, 255))
            d.ellipse([48, yy, 56, yy + 8], fill=(196, 150, 66, 255))
    return im


def face_to_screen_R(canvas, flat, u_wall=5):
    """128×170 平面门脸贴到 u=5 墙面（镜头右墙）。该面沿 v 向朝左下延伸，
    基点在面底边低端 p(5,5)；x→+X 时墙脚线上抬（行号递减，斜率 +0.5）。"""
    bx, by = OX + p(u_wall, u_wall)[0], OY + p(u_wall, u_wall)[1]
    coeffs = (1, 0, -bx, 0.5, 1, 170 - by - bx / 2.0)
    big = flat.transform(canvas.size, Image.AFFINE, coeffs, Image.BICUBIC)
    canvas.alpha_composite(big)


def compose(face=None, ridge='u', style=None):
    """face: 'left'=门脸在 v=5 墙（镜头左）；'right'=门脸在 u=5 墙（镜头右）；None=门脸在背面不画。
    ridge: 'u'=正脊沿 u（两端山墙在 u=1/u=5）；'v'=正脊沿 v（两端山墙在 v=1/v=5）。
    墙板恒为 wall_wood_sw(v=5 面，朝 SW 受光) + wall_wood_se(u=5 面, SE)，锚点同为 p(5,5)。"""
    canvas = Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
    place(canvas, 'wall_wood_sw', 1, 4, 0)
    place(canvas, 'wall_wood_se', 4, 1, 0)
    if face == 'left':
        face_to_screen(canvas, flat_face(style or 'plain'), wall_v=5)
    elif face == 'right':
        face_to_screen_R(canvas, flat_face(style or 'plain'), u_wall=5)

    # 檐口投影（墙顶内侧向下 11px）
    sh = Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
    ds = ImageDraw.Draw(sh)
    for i in range(11):
        ds.line([(OX + p(1, 5)[0], OY + p(1, 5)[1] - (EAVE_Z - i)),
                 (OX + p(5, 5)[0], OY + p(5, 5)[1] - (EAVE_Z - i))],
                fill=(8, 14, 20, int(70 * (1 - i / 10.0) ** 1.3)), width=2)
    for i in range(8):
        ds.line([(OX + p(5, 1)[0], OY + p(5, 1)[1] - (EAVE_Z - i)),
                 (OX + p(5, 5)[0], OY + p(5, 5)[1] - (EAVE_Z - i))],
                fill=(8, 14, 20, int(44 * (1 - i / 7.0) ** 1.3)), width=2)
    canvas.alpha_composite(sh)

    if ridge == 'u':
        # 正脊沿 u：远端山墙平移到 u=1 端面 → 背坡 → 近端山墙 u=5 → 受光坡 → 正脊
        place(canvas, 'roof_gable_se', 4, 1, EAVE_Z, dxy=(-128, -64))
        place(canvas, 'roof_slope_ne', 1, 1, EAVE_Z)
        place(canvas, 'roof_gable_se', 4, 1, EAVE_Z)
        place(canvas, 'roof_slope_sw', 1, 3, EAVE_Z)
        place(canvas, 'roof_ridge_sw', 1, 2.5, RIDGE_Z)
    else:
        # 正脊沿 v：同一套四件各转 90°（镜像派生件），远山墙平移到 v=1 端面
        place(canvas, 'roof_gable_sw', 5, 1, EAVE_Z, dxy=(128, -64))
        place(canvas, 'roof_slope_nw', 1, 1, EAVE_Z)
        place(canvas, 'roof_gable_sw', 5, 1, EAVE_Z)
        place(canvas, 'roof_slope_se', 3, 1, EAVE_Z)
        place(canvas, 'roof_ridge_se', 2.5, 1, RIDGE_Z)
    return canvas


def bake(canvas, name, note, extra=None, facing='SW', face=None, ridge='u'):
    bb = canvas.getbbox()
    anchor_screen = (OX + p(5, 5)[0], OY + p(5, 5)[1])
    # 固定窗口裁切：四个朝向共用同一锚点坐标 (137,325)，尺寸恒 273×327，
    # 保证同足迹换朝向后落地位置完全不跳。
    x0 = int(round(anchor_screen[0] - APX[0]))
    y0 = int(round(anchor_screen[1] - APX[1]))
    cut = canvas.crop((x0, y0, x0 + SIZE[0], y0 + SIZE[1]))
    apx = [APX[0], APX[1]]
    cut.save(os.path.join(MOD, name + '.png'))
    out = (bb[0] < x0 or bb[1] < y0 or bb[2] > x0 + SIZE[0] or bb[3] > y0 + SIZE[1])
    if out:
        print('   ! %s 超出固定窗口：content=%s window=%s' % (name, bb, (x0, y0, x0 + SIZE[0], y0 + SIZE[1])))
    bbx = cut.getbbox()
    if ridge == 'u':
        parts = ['wall_wood_sw', 'wall_wood_se', 'roof_slope_ne', 'roof_slope_sw',
                 'roof_ridge_sw', 'roof_gable_se', 'roof_gable_se@u=1(平移 -128,-64)']
        stack = ['wall', 'far_gable(u=1)', 'back_slope(NE)', 'near_gable(u=5)',
                 'lit_slope(SW)', 'ridge(u)']
        end_faces = {'u=1': 'far_gable_se@平移', 'u=5': 'near_gable_se'}
    else:
        parts = ['wall_wood_sw', 'wall_wood_se', 'roof_slope_nw', 'roof_slope_se',
                 'roof_ridge_se', 'roof_gable_sw', 'roof_gable_sw@v=1(平移 128,-64)']
        stack = ['wall', 'far_gable(v=1)', 'back_slope(NW)', 'near_gable(v=5)',
                 'lit_slope(SE)', 'ridge(v)']
        end_faces = {'v=1': 'far_gable_sw@平移', 'v=5': 'near_gable_sw'}
    if face:
        parts.append('face_plain@%s' % ('v=5' if face == 'left' else 'u=5'))
    meta = {
        'name': name, 'facing': facing, 'footprint': [4, 4], 'footprint_w': 4, 'footprint_h': 4,
        'elevation': {'wall_h': WALL_H, 'eave_z': EAVE_Z, 'ridge_z': RIDGE_Z,
                      'overhang_px': 4.3},
        'height_px': RIDGE_Z, 'anchor': [0.5, 1.0],
        'anchor_cell': [4, 4], 'anchor_px': apx,
        'anchor_note': '足迹前底顶点 p(5,5)；屋檐与墙顶同标高（eave_z=wall_h=170），落地即对齐',
        'tile': [64, 32], 'tileable': False,
        'sprite_size': [cut.width, cut.height],
        'sprite_h_px': int(bbx[3] - bbx[1]),
        'ratio_to_char': round((bbx[3] - bbx[1]) / 84, 2),
        'margins_px': [int(bbx[0]), int(bbx[1]), int(cut.width - bbx[2]), int(cut.height - bbx[3])],
        'parts': parts,
        'stack_order': stack,
        'ridge_axis': ridge,
        'ridge_line': 'u∈[1,5] v=3 z=210' if ridge == 'u' else 'v∈[1,5] u=3 z=210',
        'front_face': ('v=5 墙（门前朝 SW，镜头可见）' if face == 'left' else
                       'u=5 墙（门前朝 SE，镜头可见）' if face == 'right' else
                       '背面（门在远侧墙，镜头不可见；两面均为背墙/侧墙）'),
        'end_faces': end_faces,
        'closure_note': '两端山墙底边贴 z=170、脊尖 z=210，与两坡端头齐平；'
                        '背坡独立成图并压住远侧檐口，u/v 方向端面均由山墙封死，不靠水平镜像',
        'source': note, 'outline_px': 2.5,
        'mirror_derived': False, 'derive_op': 'compose', 'derived_from': None,
    }
    if extra:
        meta.update(extra)
    with open(os.path.join(MOD, name + '.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
    print('%-26s %dx%d h=%d anchor=%s' % (name, cut.width, cut.height, meta['sprite_h_px'], apx))
    return cut


def main():
    FACINGS = (('sw', 'SW', 'left',  'u'),
               ('se', 'SE', 'right', 'v'),
               ('ne', 'NE', None,    'u'),
               ('nw', 'NW', None,    'v'))
    MIRROR_PARTS = {
        'roof_slope_se': 'mirror_h(roof_slope_sw)',
        'roof_slope_nw': 'mirror_h(roof_slope_ne)',
        'roof_ridge_se': 'mirror_h(roof_ridge_sw)',
        'roof_gable_sw': 'mirror_h(roof_gable_se)',
        'wall_wood_se': 'mirror_h(wall_wood_sw)',
    }
    BRIGHT = ('镜像件均无 brightness_shift（原样镜像）；四朝向共用同一套墙面亮度，'
              '明暗差只由受光坡/背坡两件承担，太阳方位不随房屋朝向改变')
    for key, fac, face, ridge in FACINGS:
        h = compose(face=face, ridge=ridge)
        extra = {'derive_op': 'compose(real_geometry)',
                 'brightness_note': BRIGHT}
        if ridge == 'v':
            extra.update({'derive_op': 'compose(real_geometry) + mirror_parts',
                          'mirror_parts': {k: v for k, v in MIRROR_PARTS.items()
                                           if k in ('roof_slope_se', 'roof_slope_nw',
                                                    'roof_ridge_se', 'roof_gable_sw')},
                          'derive_note': '体块按真实几何重算（脊沿 v、两端山墙落在 v=1/v=5、'
                                         '右墙门脸贴 u=5），只复用既有 mirror_h 屋面件，'
                                         '不是把整张 sw 精灵水平翻转；锚点/尺寸与 sw 用时同一窗口'})
        else:
            extra['mirror_parts'] = {'wall_wood_se': MIRROR_PARTS['wall_wood_se']}
        if face is None:
            extra['front_face_hidden'] = True
        bake(h, 'house_4x4_' + key,
             '4×4 整屋：墙身 sw+se + 两端山墙 + 背坡 + 受光坡 + 单条正脊，按朝向重算',
             facing=fac, face=face, ridge=ridge, extra=extra)

    # 门脸三变体：sw/se 有可见前脸，按朝向各出一套；ne/nw 前脸在背面 → 回退基础屋身
    for key, fac, face, ridge in FACINGS:
        for st in ('lattice', 'carved', 'shop'):
            nm = 'house_4x4_%s_%s' % (key, st)
            if face:
                h = compose(face=face, ridge=ridge, style=st)
                bake(h, nm, '整屋 + 门脸变体(%s)，前脸贴 %s 墙' % (st, 'v=5' if face == 'left' else 'u=5'),
                     facing=fac, face=face, ridge=ridge,
                     extra={'variant': st, 'fallback': False,
                            'derive_op': 'compose(real_geometry)'})
            else:
                h = compose(face=None, ridge=ridge)
                bake(h, nm, '朝向 %s 的门脸在背面（镜头不可见），此件回退为基础屋身' % fac,
                     facing=fac, face=None, ridge=ridge,
                     extra={'variant': st, 'fallback': True,
                            'fallback_parts': 'house_4x4_' + key,
                            'fallback_reason': '前脸墙在远侧（门朝 %s），镜头看不到门脸，变体无视觉差异' % fac,
                            'derive_op': 'compose(base_body)'})


# ------------------------------------------------ 十字街角 · 四机位闭合验证图
# 6 栋 2×3 排布，四种朝向前后左右两两相邻，任意两朝向都至少相邻一次：
#   u 向相邻：NE-NW / SW-SE / NW-NE        v 向相邻：NE-SW / NW-SE / SW-NW / SE-NE
HOUSES = [(4, 0, 'NE'), (8, 0, 'NW'),
          (4, 4, 'SW'), (8, 4, 'SE'),
          (4, 8, 'NW'), (8, 8, 'NE')]
ROT = {'SE': 'SW', 'SW': 'NW', 'NW': 'NE', 'NE': 'SE'}   # 世界转 90° 后的朝向标签
CU, CV = 8.0, 6.0                                        # 排布中心（旋转中心）
SW_, SH_ = 726, 610                                      # 单机位画布
OXS, OYS = 300, 173                                      # 单机位 p 原点（顶部留 36px 标题带）
PAPER = (245, 241, 232)
PAD = (163, 180, 148)
INK = (34, 30, 26)
MUT = (120, 112, 101)


def rot_uv(u0, v0, k):
    for _ in range(k):
        u0, v0 = CU - (v0 + 4 - CV), CV + (u0 - CU)
    return u0, v0


def holes(img):
    """统计 sprite 内部（不连到画布边界的）透明像素数 = 露底孔洞。"""
    a = img.getchannel('A').point(lambda v: 0 if v < 8 else 255)
    m = a.copy()
    try:
        ImageDraw.floodfill(m, (0, 0), 128)
    except Exception:
        return -1
    return int(m.histogram()[0])


def pair_seam(layer, pa, pb):
    """两栋相邻房屋沿共享墙面的转角处采样，返回 (相邻方向, 最小不透明度)。
    共享面是竖直平面 u=k（沿 v 展开）或 v=k（沿 u 展开），墙身 z∈[20,160] 必须被两侧精灵盖住。"""
    (ua, va, fa), (ub, vb, fb) = pa, pb
    plane, fixed = None, None
    if abs((ua + 4) - ub) < 0.01:
        plane, fixed, lo, hi = 'u', ub, max(va, vb), min(va + 4, vb + 4)
    elif abs((ub + 4) - ua) < 0.01:
        plane, fixed, lo, hi = 'u', ua, max(va, vb), min(va + 4, vb + 4)
    elif abs((va + 4) - vb) < 0.01:
        plane, fixed, lo, hi = 'v', vb, max(ua, ub), min(ua + 4, ub + 4)
    elif abs((vb + 4) - va) < 0.01:
        plane, fixed, lo, hi = 'v', va, max(ua, ub), min(ua + 4, ub + 4)
    if not plane:
        return None, 255
    px = layer.load()
    amin = 255
    for i in range(25):
        t = lo + 0.25 + (hi - lo - 0.5) * i / 24.0
        u, v = (fixed, t) if plane == 'u' else (t, fixed)
        for z in range(20, 162, 4):
            x = int(round(OXS + (u - v) * 32))
            y = int(round(OYS + (u + v) * 16 - z))
            if 0 <= x < SW_ and 0 <= y < SH_:
                amin = min(amin, px[x, y][3])
    return plane, amin


def sheet_corner():
    from PIL import ImageFont
    f_h = ImageFont.truetype(r'C:\Windows\Fonts\msyhbd.ttc', 22)
    f_t = ImageFont.truetype(r'C:\Windows\Fonts\msyh.ttc', 13)
    f_s = ImageFont.truetype(r'C:\Windows\Fonts\msyh.ttc', 11)
    ch = Image.open(CHAR).convert('RGBA')
    bb = ch.getbbox()
    k = CHAR_H / float(bb[3] - bb[1])
    ch = ch.resize((int(ch.width * k), CHAR_H), Image.LANCZOS)

    shots, reports = [], []
    for shot in range(4):
        layer = Image.new('RGBA', (SW_, SH_), (0, 0, 0, 0))
        placed = []
        for (u0, v0, fac) in HOUSES:
            uu, vv = rot_uv(u0, v0, shot)
            ff = fac
            for _ in range(shot):
                ff = ROT[ff]
            placed.append((uu, vv, ff))
        placed.sort(key=lambda t: (t[0] + t[1]))          # 画家算法：远（u+v 小）先画
        for (uu, vv, ff) in placed:
            im, meta = load('house_4x4_' + ff.lower())
            cell = meta.get('anchor_cell', [4, 4])
            ax, ay = p(uu + cell[0], vv + cell[1])
            apx = meta['anchor_px']
            layer.alpha_composite(im, (int(round(OXS + ax - apx[0])),
                                       int(round(OYS + ay - apx[1]))))

        hc = holes(layer)
        seams = []
        for i in range(len(placed)):
            for j2 in range(i + 1, len(placed)):
                pl, amin = pair_seam(layer, placed[i], placed[j2])
                if pl:
                    seams.append((placed[i][2] + '-' + placed[j2][2], pl, amin))
        reports.append((shot, hc, placed, seams))

        # 落地 + 足迹色块（外扩 0.34 格，边线露出出檐外）+ 人物（人物不进孔洞统计）
        im_out = Image.new('RGBA', (SW_, SH_), PAPER + (255,))
        d = ImageDraw.Draw(im_out)
        m = 0.34                                            # 足迹色块外扩，露在出檐之外
        for (uu, vv, ff) in placed:
            quad = [OIS(OXS, OYS, uu - m, vv - m), OIS(OXS, OYS, uu + 4 + m, vv - m),
                    OIS(OXS, OYS, uu + 4 + m, vv + 4 + m), OIS(OXS, OYS, uu - m, vv + 4 + m)]
            d.polygon(quad, fill=PAD + (255,))
        im_out.alpha_composite(layer)
        # 人物固定站在各机位画布左下空白处（只作 84px 尺度参照，不参与闭合判断）
        cx, cy = 116, SH_ - 34
        d.ellipse([cx - 15, cy - 5, cx + 15, cy + 5], fill=(228, 222, 209, 255))
        im_out.alpha_composite(ch, (int(cx - (bb[0] + bb[2]) / 2 * k), int(cy - bb[3] * k)))
        d.line([(cx, cy + 7), (cx, cy + 15)], fill=MUT + (255,), width=1)
        d.text((cx + 20, cy - 40), '84px', font=f_s, fill=MUT)
        for (uu, vv, ff) in placed:
            tx, ty = OIS(OXS, OYS, uu + 4, vv + 4)
            d.text((tx - 10, ty + 6), ff, font=ImageFont.truetype(r'C:\Windows\Fonts\msyhbd.ttc', 12),
                   fill=INK)
        d.text((14, 10), '机位 %d｜世界转 %d°｜孔洞 %d｜转角最低不透明度 %d'
               % (shot + 1, shot * 90, hc, min(s[2] for s in seams) if seams else 255),
               font=f_t, fill=INK)
        shots.append(im_out)

    cols, rows = 2, 2
    W, H = cols * SW_, 78 + rows * SH_
    board = Image.new('RGBA', (W, H), PAPER + (255,))
    d = ImageDraw.Draw(board)
    d.text((22, 14), '4×4 整屋 · 十字街角闭合验证（四机位）', font=f_h, fill=INK)
    d.text((22, 46), '机位 1 已覆盖全部 6 组相邻：SW-SE · SW-NE · SW-NW · SE-NE · SE-NW · NE-NW；其余三机位为同一体块的世界旋转视角',
           font=f_t, fill=MUT)
    for i, im in enumerate(shots):
        board.alpha_composite(im, ((i % cols) * SW_, 78 + (i // cols) * SH_))
        d.line([((i % cols) * SW_, 78 + (i // cols) * SH_),
                ((i % cols) * SW_, 78 + (i // cols + 1) * SH_)], fill=(214, 206, 193, 255), width=1)
        d.line([((i % cols) * SW_, 78 + (i // cols) * SH_),
                ((i % cols + 1) * SW_, 78 + (i // cols) * SH_)], fill=(214, 206, 193, 255), width=1)
    d.text((22, H - 16), '每格 84px 人物为尺度参照；色块 = 4×4 足迹；朝向标签按门所朝方向标注（NE/NW 的门在背面，镜头只见到背墙/侧墙）',
           font=f_s, fill=MUT)
    out = os.path.join(PRE, 'house_corner_4cam.png')
    board.convert('RGB').save(out)
    print('->', out, board.size)
    for shot, hc, placed, seams in reports:
        print('   shot %d holes=%d  相邻 %d 组，转角最低不透明度 %d  %s'
              % (shot + 1, hc, len(seams), min(s[2] for s in seams) if seams else 255,
                 ' '.join('%s@%g,%g' % (f, u, v) for u, v, f in placed)))
        print('        ' + '  '.join('%s(%s)=%d' % (p, ax, am) for p, ax, am in sorted(seams)))
    # 单件自检
    chk = []
    for n in ('sw', 'se', 'ne', 'nw'):
        im = Image.open(os.path.join(MOD, 'house_4x4_%s.png' % n))
        chk.append('%s=%d' % (n, holes(im)))
    print('   单件孔洞：' + ' '.join(chk))


def OIS(ox, oy, u, v):
    return (ox + (u - v) * 32.0, oy + (u + v) * 16.0)


if __name__ == '__main__':
    main()
    sheet_corner()
