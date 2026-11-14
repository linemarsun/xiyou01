#!/usr/bin/env python3
"""地面块纹理生成：128×64 菱形（2×2 格）贴图，按整体分格平铺。

渲染契约（world-renderer buildIsoUnits）：
- 地面按 2×2 格成块，sprite 锚点 (0.5,1) 落在足迹前底顶点 →
  菱形底顶点必须精确落在画布底部中央 (64,64)，画布恰好 128×64。
- 布局 JSON 仍是整片 ground_grass 大条目；渲染层自动切块。
- 变体：草 a/b/c、石板 a/b（渲染层按格坐标哈希分发），其余单图。
- 缺图时渲染层自动回退纯色菱形批（本脚本产出后即走贴图）。

用法：python assets_src/tools/modv2/gen_ground.py [--out 公共目录]
"""
from __future__ import annotations

import argparse
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

W, H = 128, 64
TOP, RIGHT, BOT, LEFT = (64, 0), (128, 32), (64, 64), (0, 32)


def bilinear(u: float, v: float) -> tuple[float, float]:
    """菱形四角双线性插值：u,v ∈ [0,1]，u 沿 TOP→RIGHT→BOT 方向，v 沿 TOP→LEFT→BOT。"""
    x = (TOP[0] * (1 - u) * (1 - v) + RIGHT[0] * u * (1 - v)
         + BOT[0] * u * v + LEFT[0] * (1 - u) * v)
    y = (TOP[1] * (1 - u) * (1 - v) + RIGHT[1] * u * (1 - v)
         + BOT[1] * u * v + LEFT[1] * (1 - u) * v)
    return x, y


def slab_polygon(u0: float, u1: float, v0: float, v1: float, steps: int = 6) -> list[tuple[float, float]]:
    """双线性小块的四角（沿边细分以贴合菱形直边）。"""
    pts: list[tuple[float, float]] = []
    for i in range(steps + 1):
        pts.append(bilinear(u0 + (u1 - u0) * i / steps, v0))
    for i in range(steps + 1):
        pts.append(bilinear(u1, v0 + (v1 - v0) * i / steps))
    for i in range(steps + 1):
        pts.append(bilinear(u1 - (u1 - u0) * i / steps, v1))
    for i in range(steps + 1):
        pts.append(bilinear(u0, v1 - (v1 - v0) * i / steps))
    return pts


def diamond_mask() -> Image.Image:
    m = Image.new('L', (W, H), 0)
    ImageDraw.Draw(m).polygon([TOP, RIGHT, BOT, LEFT], fill=255)
    return m


def inside_points(inset: int = 3) -> list[tuple[int, int]]:
    """菱形内（含 inset 收边）的所有像素点，供撒草叶/斑点用。"""
    m = np.array(diamond_mask(), dtype=np.uint8)
    m2 = m.copy()
    for dy in range(-inset, inset + 1):
        for dx in range(-inset, inset + 1):
            if abs(dx) + abs(dy) <= inset:
                m2[max(0, dy):H + min(0, dy), max(0, dx):W + min(0, dx)] &= m[max(0, -dy):H - max(0, dy), max(0, -dx):W - max(0, dx)]
    ys, xs = np.where(m2 > 0)
    return list(zip(xs.tolist(), ys.tolist()))


def rim(draw: ImageDraw.ImageDraw, color: tuple[int, int, int, int]) -> None:
    """1px 分格描边（贴菱形边内侧），让整图呈现清晰的等距分格。"""
    draw.line([TOP, RIGHT, BOT, LEFT, TOP], fill=color, width=1)


def make_grass(seed: int) -> Image.Image:
    rng = np.random.default_rng(seed)
    # 底色场：基准绿 + 低频起伏 + 细噪声（工笔草地：明亮鲜绿为主）
    base = np.array([111, 168, 76], dtype=float)
    yy, xx = np.mgrid[0:H, 0:W]
    low = (np.sin(xx / 17.0 + seed) * np.cos(yy / 11.0 - seed * 0.7)) * 5
    field = base + low[..., None] + rng.normal(0, 5, (H, W, 1))
    img = np.zeros((H, W, 4), dtype=np.uint8)
    img[..., :3] = np.clip(field, 0, 255).astype(np.uint8)
    img[..., 3] = np.where(np.array(diamond_mask(), dtype=np.uint8) > 0, 255, 0).astype(np.uint8)
    im = Image.fromarray(img, 'RGBA')
    d = ImageDraw.Draw(im)
    # 草叶：短小笔画，深浅三色（墨绿/亮绿/黄绿），按参考图鲜草质感
    pts = inside_points(2)
    palette = [(88, 141, 60), (134, 192, 94), (156, 196, 94), (99, 155, 66)]
    for _ in range(240):
        x, y = pts[rng.integers(len(pts))]
        ang = rng.uniform(0, math.tau)
        ln = rng.uniform(2, 4.5)
        c = palette[rng.integers(len(palette))]
        d.line([(x, y), (x + math.cos(ang) * ln, y + math.sin(ang) * ln * 0.6)],
               fill=c + (200,), width=1)
    rim(d, (78, 128, 52, 90))
    return im


def make_stone(seed: int) -> Image.Image:
    rng = np.random.default_rng(seed)
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    mask = diamond_mask()
    # 4×4 石板：每块暖灰底 ±亮度，细墨线勾缝（工笔石板街）
    nu, nv = 4, 4
    us = [rng.uniform(0.06, 0.94) for _ in range(nu - 1)]
    vs = [rng.uniform(0.06, 0.94) for _ in range(nv - 1)]
    u_edges = [0.0] + sorted(us) + [1.0]
    v_edges = [0.0] + sorted(vs) + [1.0]
    base = np.array([141, 133, 116], dtype=float)
    for iu in range(nu):
        for iv in range(nv):
            poly = slab_polygon(u_edges[iu], u_edges[iu + 1], v_edges[iv], v_edges[iv + 1])
            f = 1.0 + rng.uniform(-0.06, 0.06)
            c = tuple(int(min(255, max(0, ch * f))) for ch in base)
            overlay = Image.new('RGBA', (W, H), (0, 0, 0, 0))
            ImageDraw.Draw(overlay).polygon(poly, fill=c + (255,))
            img.alpha_composite(Image.composite(overlay, Image.new('RGBA', (W, H), (0, 0, 0, 0)), mask))
    d = ImageDraw.Draw(img)
    for e in u_edges[1:-1]:
        d.line([bilinear(e, 0), bilinear(e, 1)], fill=(111, 103, 90, 210), width=1)
    for e in v_edges[1:-1]:
        d.line([bilinear(0, e), bilinear(1, e)], fill=(111, 103, 90, 210), width=1)
    # 细颗粒
    pts = inside_points(2)
    for _ in range(160):
        x, y = pts[rng.integers(len(pts))]
        g = rng.integers(-10, 11)
        d.point((x, y), fill=(int(base[0] + g), int(base[1] + g), int(base[2] + g), 255))
    rim(d, (96, 89, 76, 110))
    return img


def make_dirt() -> Image.Image:
    rng = np.random.default_rng(11)
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.polygon([TOP, RIGHT, BOT, LEFT], fill=(156, 124, 80, 255))
    pts = inside_points(2)
    # 土粒与碎石
    for _ in range(320):
        x, y = pts[rng.integers(len(pts))]
        c = [(140, 109, 68), (178, 148, 106), (124, 96, 60)][rng.integers(3)]
        d.point((x, y), fill=c + (255,))
    for _ in range(14):
        x, y = pts[rng.integers(len(pts))]
        r = rng.uniform(1, 2.2)
        d.ellipse([(x - r, y - r * 0.7), (x + r, y + r * 0.7)],
                  fill=(168, 149, 120, 255), outline=(116, 92, 58, 255))
    rim(d, (122, 95, 60, 100))
    return img


def make_water() -> Image.Image:
    rng = np.random.default_rng(23)
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.polygon([TOP, RIGHT, BOT, LEFT], fill=(58, 140, 192, 255))
    pts = inside_points(3)
    # 涟漪：沿菱形一个方向的短亮/暗弧线
    for _ in range(46):
        x, y = pts[rng.integers(len(pts))]
        ln = rng.uniform(4, 11)
        dx, dy = math.cos(math.pi / 6) * ln, math.sin(math.pi / 6) * ln * 0.5
        c = (94, 168, 216, 220) if rng.random() < 0.6 else (47, 119, 166, 220)
        d.line([(x - dx / 2, y - dy / 2), (x + dx / 2, y + dy / 2)], fill=c, width=1)
    rim(d, (40, 105, 155, 120))
    return img


def make_marble() -> Image.Image:
    rng = np.random.default_rng(37)
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    mask = diamond_mask()
    base = np.array([216, 210, 194], dtype=float)
    for (u0, u1, v0, v1) in [(0, 0.5, 0, 0.5), (0.5, 1.0, 0, 0.5), (0, 0.5, 0.5, 1.0), (0.5, 1.0, 0.5, 1.0)]:
        poly = slab_polygon(u0, u1, v0, v1)
        f = 1.0 + rng.uniform(-0.03, 0.03)
        c = tuple(int(min(255, max(0, ch * f))) for ch in base)
        overlay = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(overlay).polygon(poly, fill=c + (255,))
        img.alpha_composite(Image.composite(overlay, Image.new('RGBA', (W, H), (0, 0, 0, 0)), mask))
    d = ImageDraw.Draw(img)
    for e in (0.5,):
        d.line([bilinear(e, 0), bilinear(e, 1)], fill=(181, 173, 154, 220), width=1)
        d.line([bilinear(0, e), bilinear(1, e)], fill=(181, 173, 154, 220), width=1)
    rim(d, (166, 158, 138, 110))
    return img


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=str(Path(__file__).resolve().parents[3] / 'public' / 'assets' / 'art' / 'iso'))
    args = ap.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    plan = {
        'ground_grass_a.png': make_grass(101),
        'ground_grass_b.png': make_grass(202),
        'ground_grass_c.png': make_grass(303),
        'ground_stone_a.png': make_stone(11),
        'ground_stone_b.png': make_stone(22),
        'ground_dirt.png': make_dirt(),
        'ground_water.png': make_water(),
        'ground_marble.png': make_marble(),
    }
    for name, im in plan.items():
        im.save(out / name)
        print(name, im.size)


if __name__ == '__main__':
    main()
