#!/usr/bin/env python3
"""AI 工笔宫城件 → 官方 sprite 画布（足迹基准缩放版）。

与 ai_align.py 的区别：宫城件是高瘦塔类，AI 原图长宽比与旧程序化 sprite
差异大，不能用官方 bbox 双向适配（会压扁）。这里以**底部基座宽度 = 足迹
菱形宽度**为唯一缩放基准，随后按缩放结果重建画布，并同步更新 *.json 的
sprite_size / anchor_px / sprite_h_px / margins_px。

anchor 约定不变：足迹前底顶点 p(umax,vmax)，即基座最低点。
锚点 x 取基座底行像素的中心（两面墙的交点）。

用法（不动游戏资产，输出到打样目录）：
  python palace_align.py SRC.png --json public/assets/art/iso/palace_corner.json \
      --out _restyle_samples/palace_corner_aligned.png [--footprint 128]
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

from ai_align import edge_matte, subject_rgba

MARGIN = 2  # 四周留白，与旧 sprite 一致


def measure(subject: Image.Image) -> tuple[int, int, float]:
    """返回 (基座宽, 基座最低点 x within subject, 主体高)。"""
    a = np.asarray(subject)
    mask = a[:, :, 3] > 128
    ys, xs = np.where(mask)
    y0, y1 = int(ys.min()), int(ys.max())
    base = mask[y1 - max(1, (y1 - y0) // 20): y1 + 1]  # 底部 ~5% 行
    bxs = np.where(base.any(0))[0]
    base_w = int(bxs.max() - bxs.min() + 1)
    bottom_row = np.where(mask[y1])[0]
    vx = float(bottom_row.mean())
    return base_w, vx, float(y1 - y0 + 1)


def run(src: Path, json_path: Path, out_path: Path, footprint: int | None,
        apply: bool = False, target_h: int | None = None) -> None:
    meta = json.loads(json_path.read_text(encoding="utf-8"))
    fp_cells = meta["footprint_w"] * 64  # 菱形宽 = 长边格数 × 64
    fp = footprint if footprint else fp_cells

    src_im = Image.open(src).convert("RGB")
    bg = edge_matte(src_im)
    subject, _ = subject_rgba(src_im, bg)

    base_w, vx, subj_h = measure(subject)
    # 缩放基准：--height 优先（按主体总高锚定，打样确认值）；否则按足迹基座宽
    scale = (target_h / subj_h) if target_h else (fp / base_w)
    nw, nh = round(subject.width * scale), round(subj_h * scale)
    subject = subject.resize((nw, nh), Image.LANCZOS)
    base_w, vx = base_w * scale, vx * scale

    # 底顶点固定在画布水平中央 → 两侧屋檐出挑对称
    W = nw + MARGIN * 2 + int(abs(nw / 2 - vx))  # 若底顶点偏离主体中心则加宽
    H = nh + MARGIN * 2
    px = MARGIN + round((W - MARGIN * 2) / 2 - vx)
    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    canvas.alpha_composite(subject, (px, MARGIN))
    anchor_px = [round(W / 2), H - MARGIN]

    out_path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out_path)

    # 打样默认不动 json；--apply 才同步元数据（避免打样期 json/贴图不一致）
    patch = {
        "sprite_size": [W, H],
        "anchor_px": anchor_px,
        "sprite_h_px": nh,
        "margins_px": [MARGIN, MARGIN, MARGIN, MARGIN],
    }
    if apply:
        meta.update(patch)
        meta["source"] = meta.get("source", "") + "（AI 工笔重绘，palace_align 足迹缩放）"
        json_path.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")

    print(json.dumps({
        "src": str(src), "base_raw": base_w / scale, "scale": round(scale, 4),
        "subject_scaled": [nw, nh], "canvas": [W, H], "anchor_px": anchor_px,
        "iso_offset": {"ax": anchor_px[0] - W / 2, "ay": anchor_px[1] - H},
        "json_patch": patch, "json_applied": bool(apply),
        "json": str(json_path), "out": str(out_path),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("src", type=Path)
    ap.add_argument("--json", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--footprint", type=int, default=None, help="覆盖足迹菱形宽(px)")
    ap.add_argument("--height", type=int, default=None, help="按主体总高锚定缩放(px)")
    ap.add_argument("--apply", action="store_true", help="同时更新 json 元数据")
    a = ap.parse_args()
    run(a.src, a.json, a.out, a.footprint, a.apply, a.height)
