"""AI sprite aligner for the isometric art pipeline.

Takes an AI-generated sprite (opaque checkerboard background), removes the
background by flood-filling near-neutral light pixels from the image edges,
then places the subject into the official sprite canvas so that:

  * canvas size and anchor_px stay EXACTLY the same as the target .json
  * the subject occupies the same bounding box as the official procedural art

Only RGBA bytes change; no *.json / no ISO_ANCHOR_OFFSET needs touching.

Usage:
  python ai_align.py SRC.png --json public/assets/art/iso/palace_hall.json \
      --out public/assets/art/iso/palace_hall.png [--compare OUT.png]
"""
from __future__ import annotations

import argparse
import json
import os
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


def edge_matte(im: Image.Image, light: int = 198, neutral: int = 28) -> np.ndarray:
    """True = background. Flood fill from the borders over near-white neutral pixels."""
    rgb = np.asarray(im.convert("RGB")).astype(np.int16)
    mx, mn = rgb.max(2), rgb.min(2)
    bg = (mn >= light) & ((mx - mn) <= neutral)
    h, w = bg.shape
    seen = np.zeros((h, w), dtype=bool)
    q: deque[tuple[int, int]] = deque()
    for x in range(w):
        for y in (0, h - 1):
            if bg[y, x] and not seen[y, x]:
                seen[y, x] = True
                q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if bg[y, x] and not seen[y, x]:
                seen[y, x] = True
                q.append((y, x))
    while q:
        y, x = q.popleft()
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= ny < h and 0 <= nx < w and bg[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                q.append((ny, nx))
    return seen


def subject_rgba(src: Image.Image, bg: np.ndarray) -> tuple[Image.Image, tuple[int, int, int, int]]:
    rgb = np.asarray(src.convert("RGB"))
    a = np.where(bg, 0, 255).astype(np.uint8)
    # 1px erode removes the light halo left by the checkerboard along the outline.
    e = a.copy()
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        e = np.minimum(e, np.roll(a, (dy, dx), (0, 1)))
    rgba = np.dstack([rgb, e])
    ys, xs = np.where(e > 0)
    if not len(xs):
        raise RuntimeError("matting removed every pixel; lower --light or raise --neutral")
    box = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
    return Image.fromarray(rgba, "RGBA").crop(box), box


def align(
    src_path: Path, json_path: Path, out_path: Path, compare_path: Path | None,
    light: int, neutral: int,
) -> None:
    meta = json.loads(json_path.read_text(encoding="utf-8"))
    tw, th = meta["sprite_size"]
    ax, ay = meta["anchor_px"]

    official = Image.open(out_path).convert("RGBA") if out_path.exists() else None
    if official is not None and official.size != (tw, th):
        raise RuntimeError(f"official sprite is {official.size}, json says {(tw, th)}")
    ref_box = official.getchannel("A").getbbox() if official else (2, 2, tw - 2, th - 2)

    src = Image.open(src_path).convert("RGB")
    bg = edge_matte(src, light=light, neutral=neutral)
    subject, raw_box = subject_rgba(src, bg)

    bx0, by0, bx1, by1 = ref_box
    bw, bh = bx1 - bx0, by1 - by0
    scale = min(bw / subject.width, bh / subject.height)
    nw, nh = max(1, round(subject.width * scale)), max(1, round(subject.height * scale))
    subject = subject.resize((nw, nh), Image.LANCZOS)

    canvas = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    px = round((bx0 + bx1) / 2 - nw / 2)
    py = by1 - nh  # bottom of the subject matches the official sprite's bottom
    canvas.alpha_composite(subject, (px, py))

    out_path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out_path)

    print(json.dumps({
        "src": str(src_path), "src_size": list(src.size),
        "subject_raw_bbox": list(raw_box),
        "official_bbox": list(ref_box),
        "canvas": [tw, th], "anchor_px": [ax, ay],
        "placed_bbox": [px, py, px + nw, py + nh],
        "out": str(out_path),
    }, ensure_ascii=False, indent=2))

    if compare_path and official is not None:
        W, H = tw * 2 + 60, th + 70
        sheet = Image.new("RGB", (W, H), (247, 244, 236))
        sheet.paste(official.convert("RGB"), (15, 55), official)
        sheet.paste(canvas.convert("RGB"), (tw + 45, 55), canvas)
        d = ImageDraw.Draw(sheet)
        font = None
        font_dir = Path(os.environ.get("WINDIR", "")) / "Fonts"
        for name in ("msyh.ttc", "simhei.ttf"):
            fp = font_dir / name
            if fp.exists():
                font = ImageFont.truetype(str(fp), 22)
                break
        d.text((15, 18), "Before: procedural", fill=(40, 38, 34), font=font)
        d.text((tw + 45, 18), "After: AI sample (aligned)", fill=(40, 38, 34), font=font)
        compare_path.parent.mkdir(parents=True, exist_ok=True)
        sheet.save(compare_path)
        print("compare:", compare_path)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("src", type=Path)
    ap.add_argument("--json", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--compare", type=Path)
    ap.add_argument("--light", type=int, default=198)
    ap.add_argument("--neutral", type=int, default=28)
    a = ap.parse_args()
    align(a.src, a.json, a.out, a.compare, a.light, a.neutral)


if __name__ == "__main__":
    main()
