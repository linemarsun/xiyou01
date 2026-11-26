# -*- coding: utf-8 -*-
"""全城素材正面换向：SW（朝左下）→ SE（朝右下）。

用户决策（2026-11-13）：参考 palace_hall_compare.png 右侧 AI 样例的视角，
map_01 全部重建素材正面统一朝右下（SE）。

原理：
- 渲染层按文件名取图、无运行时翻转 → 翻转贴图本身即可换向；
- Image.transpose(FLIP_LEFT_RIGHT) 无损，不重采样；
- 水平镜像把「v 向线段」几何变成「u 向线段」，因此线段类贴图
  镜像后 u/v 文件互换，锚点 ax 取反后自动吻合（u6 ax=64 ↔ v6 ax=-64）；
- 近方足迹建筑原位镜像，ax 取反（镜像后 anchor_px.x' = W - x）。

跳过：bridge（轴向绑定 3×5）、city_gate_tower/wide/wide_v 与 bell_tower
（未在 map_01 上场）、house_4x4_*（已有四向贴图，逐向分配，无需换）、
hall/hall_stone（未上场）、wild_*/角色（不属于城 building）。

用法：python flip_facing.py [--dry]   # --dry 只打印计划
"""
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[3]  # .../shanhai
ISO = ROOT / "public" / "assets" / "art" / "iso"

# 原位镜像：正面 SW→SE，footprint 近方/对称，anchor ax 取反
MIRROR_IN_PLACE = [
    "gate_keep",        # 6×3 城台门楼（AI）ax 45→-45
    "palace_hall",      # 10×10 主殿（AI）ax 0
    "palace_hall_s",    # 4×4 配殿 ax 0
    "palace_gate",      # 4×2 宫门 ax 32→-32
    "palace_corner",    # 2×2 角楼 ax 0
    "pagoda",           # 3×3 白塔 ax -0.5→0.5
    "gate_arch",        # 3×3 拱门（paifang 复用）ax 0
]

# 镜像 + u/v 文件互换：线段类，(new_u, new_v) = (mirror(old_v), mirror(old_u))
MIRROR_SWAP_PAIRS = [
    ("city_wall_u2", "city_wall_v2"),
    ("city_wall_u6", "city_wall_v6"),
    ("palace_wall_u2", "palace_wall_v2"),
    ("palace_wall_u6", "palace_wall_v6"),
]

# 线段族内的角台/墩台：原位镜像（对称足迹，随同族换光照）
MIRROR_IN_PLACE += ["city_wall_corner"]


def mirror_png(name: str) -> None:
    p = ISO / f"{name}.png"
    img = Image.open(p)
    if img.mode not in ("RGBA", "LA"):
        img = img.convert("RGBA")
    img.transpose(Image.FLIP_LEFT_RIGHT).save(p)
    print(f"  mirrored {name}.png {img.size[0]}x{img.size[1]}")


def update_json(name: str) -> None:
    """同步模块元数据：anchor_px.x 取反、facing SW→SE。无 json 则跳过。"""
    p = ISO / f"{name}.json"
    if not p.exists():
        return
    data = json.loads(p.read_text(encoding="utf-8"))
    w = data.get("sprite_size", [0, 0])[0]
    ax_px = data.get("anchor_px")
    if ax_px and w:
        ax_px[0] = w - ax_px[0]
        data["anchor_px"] = ax_px
    if data.get("facing"):
        data["facing"] = "SE"
    data["mirror_derived"] = True
    data["derive_op"] = (data.get("derive_op") or "") + " + flip_facing_sw2se"
    p.write_text(json.dumps(data, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"  json updated {name}.json anchor_px={data.get('anchor_px')}")


def main() -> None:
    dry = "--dry" in sys.argv
    print("== 原位镜像（正面 SW→SE）==")
    for name in MIRROR_IN_PLACE:
        print(f"[{name}]")
        if not dry:
            mirror_png(name)
        update_json(name)
    print("== 镜像 + u/v 互换 ==")
    for u, v in MIRROR_SWAP_PAIRS:
        print(f"[{u} <-> {v}]")
        if dry:
            continue
        pu, pv = ISO / f"{u}.png", ISO / f"{v}.png"
        iu, iv = Image.open(pu).convert("RGBA"), Image.open(pv).convert("RGBA")
        iu.transpose(Image.FLIP_LEFT_RIGHT).save(pv)
        iv.transpose(Image.FLIP_LEFT_RIGHT).save(pu)
        print(f"  swapped {u}.png <-> {v}.png (both mirrored)")
        update_json(u)
        update_json(v)
    print("done")


if __name__ == "__main__":
    main()
