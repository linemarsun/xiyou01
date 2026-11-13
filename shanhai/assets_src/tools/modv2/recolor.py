"""Reference-style recolour pass for existing isometric PNGs.

Only RGB bytes are rewritten; alpha, canvas size and every *.json (anchor_px /
sprite_size) are left untouched, so ISO_ANCHOR_OFFSET stays valid.

Groups:
  * vermilion  : warm-grey brick -> vermilion (gate_arch / city gate arch)
  * degrey     : indigo-blue roof tiles -> deep grey (houses / roofs / pagoda eaves)
  * stone      : blue-grey flagstones -> warm light grey
  * gold       : slightly brighten golden palace roof tiles

Usage:
  python recolor.py            # dry run, prints changed-pixel ratios
  python recolor.py --apply    # write back in place
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image

ISO = Path(__file__).resolve().parents[3] / "public" / "assets" / "art" / "iso"

VERMILION = ["gate_arch.png"]
DEGREY_PREFIXES = ("house_4x4_", "roof_slope_", "roof_ridge_", "roof_gable_",
                   "wall_wood_", "pagoda.png", "city_gate_tower.png",
                   "city_gate_wide")
STONE = ["ground_stone.png"]
GOLD_PREFIXES = ("palace_",)
SKIP = {"palace_hall.png"}  # AI sample: already reference-coloured


def group_of(name: str) -> str | None:
    if name in SKIP or not name.endswith(".png"):
        return None
    if name in VERMILION:
        return "vermilion"
    if name in STONE:
        return "stone"
    if name.startswith(DEGREY_PREFIXES):
        return "degrey"
    if name.startswith(GOLD_PREFIXES):
        return "gold"
    return None


def recolor(arr: np.ndarray, group: str) -> tuple[np.ndarray, float]:
    rgb = arr[..., :3].astype(np.float32)
    mx, mn = rgb.max(2), rgb.min(2)
    sat = (mx - mn) / np.maximum(mx, 1.0)
    lum = 0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]
    out = rgb.copy()
    changed = np.zeros(rgb.shape[:2], dtype=bool)

    blue = (rgb[..., 2] > rgb[..., 0] * 1.05) & (rgb[..., 2] > rgb[..., 1] * 1.02) & (sat > 0.10)
    warm = (rgb[..., 0] >= rgb[..., 1]) & (rgb[..., 1] >= rgb[..., 2]) & (sat > 0.07)

    if group == "degrey":
        w = np.clip((sat - 0.10) / 0.20, 0, 1)[..., None] * blue[..., None]
        tgt = np.stack([lum * 0.93, lum * 0.96, lum * 1.02], axis=-1)
        out = rgb * (1 - w) + tgt * w
        changed = blue & (sat > 0.10)
    elif group == "stone":
        w = np.clip((sat - 0.08) / 0.20, 0, 1)[..., None] * blue[..., None]
        tgt = np.stack([lum * 1.16, lum * 1.09, lum * 0.94], axis=-1)
        out = rgb * (1 - w) + tgt * w
        changed = blue & (sat > 0.08)
    elif group == "vermilion":
        # 城门楼屋顶的靛青瓦先去蓝（券洞里的亮色天光不满足 blue 判据，不受影响）
        w0 = np.clip((sat - 0.10) / 0.20, 0, 1)[..., None] * blue[..., None]
        tgt0 = np.stack([lum * 0.93, lum * 0.96, lum * 1.02], axis=-1)
        rgb = rgb * (1 - w0) + tgt0 * w0
        # 再把暖灰砖面染成朱红，保留逐砖明度抖动形成的层次
        mx2, mn2 = rgb.max(2), rgb.min(2)
        sat2 = (mx2 - mn2) / np.maximum(mx2, 1.0)
        lum2 = 0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]
        warm2 = (rgb[..., 0] >= rgb[..., 1]) & (rgb[..., 1] >= rgb[..., 2]) & (sat2 > 0.07)
        w = np.clip((sat2 - 0.07) / 0.18, 0, 1)[..., None] * warm2[..., None]
        t = (lum2 / 255.0)[..., None]
        tgt = np.concatenate([104 + 128 * t, 30 + 76 * t, 24 + 58 * t], axis=-1)
        out = rgb * (1 - w) + tgt * w
        changed = (blue & (sat > 0.10)) | (warm & (sat > 0.07))
    elif group == "gold":
        gold = warm & (rgb[..., 0] > 135) & (rgb[..., 1] > 85) & (rgb[..., 2] < 140) & (sat > 0.32)
        w = (gold * 0.55)[..., None]
        tgt = np.stack([np.minimum(255, rgb[..., 0] * 1.09),
                        np.minimum(255, rgb[..., 1] * 1.10),
                        rgb[..., 2] * 0.94], axis=-1)
        out = rgb * (1 - w) + tgt * w
        changed = gold

    result = arr.copy()
    result[..., :3] = np.clip(out, 0, 255).astype(np.uint8)
    return result, float(changed.mean())


def main() -> None:
    apply = "--apply" in sys.argv[1:]
    only = None
    if "--only" in sys.argv[1:]:
        only = sys.argv[sys.argv.index("--only") + 1]
    rows = []
    for p in sorted(ISO.glob("*.png")):
        if only and p.name != only:
            continue
        g = group_of(p.name)
        if not g:
            continue
        im = Image.open(p).convert("RGBA")
        arr = np.asarray(im)
        out, ratio = recolor(arr, g)
        if apply:
            Image.fromarray(out, "RGBA").save(p)
        rows.append(f"{p.name:34s} {g:9s} {str(im.size):12s} changed={ratio * 100:5.1f}%")
    print("\n".join(rows))
    print(("apply: written in place" if apply else "dry-run (add --apply to write)") +
          f"  files={len(rows)}")


if __name__ == "__main__":
    main()
