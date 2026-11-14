#!/usr/bin/env python3
"""AI 源贴图 → 等距地面块纹理（128×64 菱形，2×2 格）。

流水线：裁水印边 → roll-blend 无缝化 → 取 512×256 窗口 4× 下采样 →
菱形蒙版 + 1px 分格描边 → 保存 ground_*.png。
变体取自同图不同窗口（部分水平镜像/180° 旋转），渲染层按格坐标哈希分发。

源图（generated-images/）：
- grass Seamless_tileable_top_down_tex_2026-11-14T03-38-36.png（工笔风，城门风格锚）
- stone Seamless_tileable_top_down_gro_2026-11-14T03-29-02.png
- water Seamless_tileable_top_down_gro_2026-11-14T03-29-15.png
- dirt  Seamless_tileable_top_down_gro_2026-11-14T03-29-31.png
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

SRC = Path(__file__).resolve().parents[4] / 'generated-images'
OUT = Path(__file__).resolve().parents[3] / 'public' / 'assets' / 'art' / 'iso'

W, H = 128, 64
WIN_W, WIN_H = 512, 256          # 4× 下采样窗口，无纵横比失真
FILES = {
    'grass': 'Seamless_tileable_top_down_tex_2026-11-14T03-38-36.png',
    'stone': 'Seamless_tileable_top_down_gro_2026-11-14T03-29-02.png',
    'water': 'Seamless_tileable_top_down_gro_2026-11-14T03-29-15.png',
    'dirt': 'Seamless_tileable_top_down_gro_2026-11-14T03-29-31.png',
}
RIMS = {
    'grass': (78, 128, 52, 90),
    'stone': (86, 92, 98, 110),      # 青灰描边（石板去黄后统一冷调）
    'dirt': (122, 95, 60, 100),
    'water': (40, 105, 155, 120),
    'marble': (170, 168, 160, 110),
}

# 变体 → (类型, 窗口 x, y, 水平镜像, 180° 旋转)
VARIANTS = {
    'ground_grass_a.png': ('grass', 30, 30, False, False),
    'ground_grass_b.png': ('grass', 400, 60, True, False),
    'ground_grass_c.png': ('grass', 60, 420, False, False),
    'ground_grass_d.png': ('grass', 400, 620, True, True),
    'ground_stone_a.png': ('stone', 60, 200, False, False),
    'ground_stone_b.png': ('stone', 300, 500, True, True),
    'ground_dirt_a.png': ('dirt', 100, 150, False, False),
    'ground_dirt_b.png': ('dirt', 420, 380, False, True),
    'ground_water_a.png': ('water', 200, 100, False, False),
    'ground_water_b.png': ('water', 440, 620, True, False),
    'ground_marble.png': ('stone', 430, 60, False, False),   # 调色衍生
}


def load_seamless(kind: str) -> np.ndarray:
    """裁水印边 + roll-blend 无缝化，返回 RGB float 数组。"""
    im = Image.open(SRC / FILES[kind]).convert('RGB')
    a = np.asarray(im).astype(np.float32)
    a = a[:-70, :-70]                      # 去右下水印带
    h, w = a.shape[:2]
    s = np.roll(np.roll(a, h // 2, axis=0), w // 2, axis=1)
    yy, xx = np.mgrid[0:h, 0:w]
    dx = np.abs((xx - w / 2) / (w / 2))
    dy = np.abs((yy - h / 2) / (h / 2))
    ramp = lambda t: np.clip((t - 0.5) / 0.5, 0, 1)
    m = 1.0 - np.maximum(ramp(dx), ramp(dy))
    m = (m * m * (3 - 2 * m))[..., None]   # smoothstep，中心用原图、边缘用滚位图
    return s * (1 - m) + a * m


def diamond_mask() -> Image.Image:
    m = Image.new('L', (W, H), 0)
    from PIL import ImageDraw
    ImageDraw.Draw(m).polygon([(64, 0), (128, 32), (64, 64), (0, 32)], fill=255)
    return m


def recolor(px: np.ndarray, mode: str) -> np.ndarray:
    """地面统一色调：石板去黄 → 青灰（与汉白玉/青瓦建筑同调），水微降饱和。"""
    lum = (px @ np.array([0.299, 0.587, 0.114], dtype=np.float32))[..., None]
    if mode == 'stone_cool':     # 保 30% 原纹理色 + 70% 灰度，再轻微向青偏移
        px = px * 0.30 + lum * 0.70
        px = px * np.array([0.95, 1.0, 1.04], dtype=np.float32) * 1.06
    elif mode == 'water_soft':   # 降饱和 15%，避免小水面过艳
        px = px * 0.85 + lum * 0.15
    return px


def bake(seam: dict[str, np.ndarray], kind: str, x: int, y: int, flip: bool, rot180: bool,
         marble: bool = False) -> Image.Image:
    win = seam[kind][y:y + WIN_H, x:x + WIN_W]
    assert win.shape[0] == WIN_H and win.shape[1] == WIN_W, win.shape
    im = Image.fromarray(np.clip(win, 0, 255).astype(np.uint8), 'RGB')
    if rot180:
        im = im.rotate(180)
    if flip:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    px = np.asarray(im.resize((W, H), Image.LANCZOS)).astype(np.float32)
    if kind == 'stone':
        px = recolor(px, 'stone_cool')
    elif kind == 'water':
        px = recolor(px, 'water_soft')
    if marble:  # 汉白玉：石板向素白调色（保留淡缝），与青灰石板同冷调
        base = np.array([224.0, 222.0, 214.0])
        px = px * 0.45 + base * 0.55
    out = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    rgb = Image.fromarray(np.clip(px, 0, 255).astype(np.uint8), 'RGB').convert('RGBA')
    rgb.putalpha(diamond_mask())
    out.alpha_composite(rgb)
    from PIL import ImageDraw
    ImageDraw.Draw(out).line([(64, 0), (128, 32), (64, 64), (0, 32), (64, 0)], fill=RIMS[kind], width=1)
    return out


def main() -> None:
    seam = {k: load_seamless(k) for k in FILES}
    for name, (kind, x, y, flip, rot) in VARIANTS.items():
        im = bake(seam, kind, x, y, flip, rot, marble=(kind == 'stone' and name == 'ground_marble.png'))
        im.save(OUT / name)
        print(name, im.size)


if __name__ == '__main__':
    main()
