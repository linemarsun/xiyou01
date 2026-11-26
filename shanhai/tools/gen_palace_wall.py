"""
宫墙程序化生成 v7（2026-11-20 推倒重设计）：
 AI 画段拼接路线（v4 端头修复 → v5 剖面标准化 → v6 周期锁定搜索）已到极限：
 素材纹理周期(~13.9px)不整除 192px 面宽，拼接相位缝/色调梯度缝只能逼近无法归零；
 且墙高(132)与角楼墩台顶边(145)、宫门城台顶边(~130-140) 各差 5~15px。

 v7 = 程序化整段绘制，一切由构造保证：
 - 图案 f(u,d) 以 192 为周期（u = 面内流坐标），u6 脸 [0..192)、v6 脸 [64..256)
   均恰好覆盖一个完整周期 → u 墙接缝(列191→列0) 与 v 墙接缝(列255→列64)
   相位差恒等于 0，像素级连续；
 - 脊线 = 地面线 - 145，与角楼墩台顶边(≈147)对齐（宫墙顶=墩台顶，可上人行走）；
 - 结构带（d=脊下深度）：脊线描边 1 + 脊滚 3 + 筒瓦 15 + 瓦当 3 + 石绿釉线 4
   + 朱红墙身 105 + 台基 14 = 145；
 - 筒瓦 12px/张（192/16 整除）、台基石块 24px（192/8 整除），全部周期锁定；
 - 调色板从 v4 素材分带采样（金/朱红/石色/釉绿），与场景工笔风格延续；
 - 噪声全部基于 (u,d) 确定性哈希，u 已 mod 192 → 天然 192 周期，无接缝漂移；
 - v6 独立生成（非镜像）：几何按 v 墙走向（脊线向左上），图案相位 (c-64)。
"""
import json
import io
import subprocess
import numpy as np
from PIL import Image

ROOT = __file__.rsplit('\\tools', 1)[0]
MOD_PUBLIC = ROOT + '/public/assets/art/iso'
MOD_SRC = ROOT + '/assets_src/modules'
REPO = ROOT + '/..'

W, HCV = 256, 275
U6_ANCHOR = (192, 270)
V6_ANCHOR = (64, 270)
P = 192                 # 图案周期 = 脸长
TILE = 12               # 筒瓦宽
H_ART = 145             # 脊线到地面线（沿锚点线）
CAP = 22                # 瓦帽带（脊滚3+筒瓦15+瓦当3=22，含描边1）
RUST = 4                # 石绿釉线
BASE = 14               # 台基
D_BODY0 = CAP + RUST    # 26
D_BASE0 = H_ART - BASE  # 131


# ---------- 确定性哈希噪声 ----------
def h2i(i, j, seed):
    n = (i * 374761393 + j * 668265263 + seed * 2654435761) & 0xFFFFFFFF
    n ^= n >> 13
    n = (n * 1274126177) & 0xFFFFFFFF
    n ^= n >> 16
    return n


def h2(i, j, seed):
    return h2i(int(i) & 0xFFFFFFFF, int(j) & 0xFFFFFFFF, seed) / 4294967295.0


def vnoise(u, d, seed, cell=24.0, ucyc=8):
    """值噪声（双线性），u 方向按 ucyc 格周期回卷 → 192 周期"""
    gu, gd = u / cell, d / cell
    i0 = int(np.floor(gu)) % ucyc
    j0 = int(np.floor(gd))
    fu, fd = gu - np.floor(gu), gd - np.floor(gd)
    fu = fu * ucyc / (ucyc - 1) if fu * ucyc >= ucyc - 1 else fu * (ucyc / (ucyc - 1))
    fu = min(fu, 1.0)
    s = fu * fu * (3 - 2 * fu)
    t = fd * fd * (3 - 2 * fd)
    v00 = h2(i0, j0, seed); v10 = h2((i0 + 1) % ucyc, j0, seed)
    v01 = h2(i0, j0 + 1, seed); v11 = h2((i0 + 1) % ucyc, j0 + 1, seed)
    return (v00 * (1 - s) + v10 * s) * (1 - t) + (v01 * (1 - s) + v11 * s) * t


# ---------- 调色板：从 v4 素材分带采样 ----------
def sample_palette():
    blob = subprocess.run(
        ['git', 'show', 'HEAD:shanhai/public/assets/art/iso/palace_wall_u6.png'],
        capture_output=True, check=True, cwd=REPO).stdout
    a = np.array(Image.open(io.BytesIO(blob)).convert('RGBA')).astype(np.float64)
    alpha = a[:, :, 3]
    top = np.full(W, -1.0); bot = np.full(W, -1.0)
    for x in range(W):
        ys = np.where(alpha[:, x] > 8)[0]
        if len(ys):
            top[x] = ys[0]; bot[x] = ys[-1]
    top_s = np.full(W, np.nan); bot_s = np.full(W, np.nan)
    for x in range(W):
        if top[x] >= 0:
            win = top[max(0, x - 3):x + 4]
            win = win[win >= 0]
            top_s[x] = np.median(win) if len(win) else np.nan
            win = bot[max(0, x - 3):x + 4]
            win = win[win >= 0]
            bot_s[x] = np.median(win) if len(win) else np.nan

    def band_median(d0, d1, x0=60, x1=180, anchor='top'):
        vals = []
        for x in range(x0, x1):
            ref = bot_s[x] if anchor == 'bot' else top_s[x]
            if np.isnan(ref):
                continue
            ridge = ref
            ys = np.arange(int(ridge + d0), int(ridge + d1))
            ys = ys[ys < a.shape[0]]
            if len(ys) == 0:
                continue
            m = (alpha[ys, x] > 8)
            if m.sum() == 0:
                continue
            vals.append(a[ys[m], x, :3].reshape(-1, 3))
        v = np.concatenate(vals)
        return tuple(int(q) for q in np.median(v, axis=0))

    pal = {
        'roll':  band_median(1, 4),      # 脊滚
        'tile':  band_median(5, 17),     # 筒瓦身
        'eave':  band_median(18, 21),    # 滴水/瓦当带
        'rust':  band_median(23, 26),    # 釉线（素材原样）
        'body':  band_median(40, 95),    # 墙身
        'base':  band_median(-13, -2, anchor='bot'),  # 台基（相对底边）
    }
    # 衍生色
    g = np.array(pal['tile'], dtype=np.float64)
    pal['tile_hi'] = tuple(int(min(255, q * 1.22)) for q in g)
    pal['tile_lo'] = tuple(int(q * 0.52) for q in g)
    pal['joint'] = tuple(int(q * 0.48) for q in g)
    pal['ridge_dark'] = tuple(int(q * 0.42) for q in g)
    r = np.array(pal['rust'], dtype=np.float64)
    pal['rust_dark'] = tuple(int(q * 0.72) for q in r)
    b = np.array(pal['body'], dtype=np.float64)
    pal['body_shadow'] = tuple(int(q * 0.82) for q in b)
    pal['body_low'] = tuple(int(q * 0.90) for q in b)
    st = np.array(pal['base'], dtype=np.float64)
    pal['base_joint'] = tuple(int(q * 0.66) for q in st)
    pal['base_dark'] = tuple(int(q * 0.52) for q in st)
    return pal


# ---------- 图案函数 ----------
def wall_color(u, d, pal):
    """(u,d) → RGB 元组；u∈[0,192) 图案坐标，d=脊下深度"""
    ru, rd = float(u), float(d)
    if rd < 0 or rd >= H_ART:
        return None
    if rd < 1:                                   # 脊线描边
        return pal['ridge_dark']
    if rd < CAP - 3:                             # 脊滚 + 筒瓦身
        if rd < 4:
            f = (rd - 1) / 3.0                   # 脊滚：暗-亮-暗 圆滚
            shade = 0.78 + 0.40 * np.sin(np.pi * f)
            c = np.array(pal['roll'], dtype=np.float64)
            return tuple(int(min(255, q * shade)) for q in c)
        k = int(ru // TILE)
        uc = k * TILE + TILE / 2.0
        du = abs(ru - uc)
        tv = 1.0 - 0.52 * (du / (TILE / 2.0)) ** 1.4
        tv *= 1.0 + 0.10 * (h2(k % 16, 0, 71) - 0.5)
        c = np.array(pal['tile'], dtype=np.float64)
        if du > TILE / 2.0 - 0.7:
            return pal['joint']
        out = c * max(tv, 0.30)
        out *= (1.0 - 0.16 * (rd - 4) / 14.0)    # 上亮下暗
        return tuple(int(min(255, q)) for q in out)
    if rd < CAP + RUST:                          # 滴水瓦当带 + 石绿釉线
        k = int(ru // TILE)
        uc = k * TILE + TILE / 2.0
        du = abs(ru - uc)
        drop = rd - (CAP - 3)                    # 0..7 下垂深度
        dist = np.sqrt(du ** 2 + (max(0.0, drop - 1.2)) ** 2)
        if drop < 3.6 and dist < 4.6:            # 瓦当半圆（下垂越过带界）
            rim = dist > 3.6
            return pal['joint'] if rim else pal['tile_hi']
        if rd < CAP:                             # 滴水带底
            if du > TILE / 2.0 - 0.7:
                return pal['joint']
            return pal['tile_lo']
        f = (rd - CAP) / RUST                    # 石绿釉线
        c = np.array(pal['rust'], dtype=np.float64)
        col = c * (1.0 - 0.18 * f)
        if rd >= CAP + RUST - 1:
            col = np.array(pal['rust_dark'], dtype=np.float64)
        return tuple(int(q) for q in col)
    if rd < D_BASE0:                             # 朱红墙身
        c = np.array(pal['body'], dtype=np.float64)
        n1 = vnoise(ru, rd, 21)
        n2 = h2(int(ru), int(rd), 33)
        f = 1.0 + 0.11 * (n1 - 0.5) + 0.07 * (n2 - 0.5)
        if rd < D_BODY0 + 10:
            f *= 0.85                            # 瓦帽投影
        if rd > D_BASE0 - 8:
            f *= 0.90                            # 台基压顶
        return tuple(int(min(255, max(0, q * f))) for q in c)
    if rd < H_ART:                               # 台基（两皮石块）
        c = np.array(pal['base'], dtype=np.float64)
        upper = rd < (D_BASE0 + H_ART) / 2.0
        off = 0 if upper else TILE
        blk = int((ru + off) // (2 * TILE))
        f = 1.0 + 0.06 * (h2(blk % 8, 0 if upper else 1, 51) - 0.5)
        f += 0.05 * (h2(int(ru), int(rd), 57) - 0.5)
        jv = (ru + off) % (2 * TILE)
        if jv < 1.2 or jv > 2 * TILE - 1.2:
            return pal['base_joint']
        if abs(rd - (D_BASE0 + H_ART) / 2.0) < 0.8:
            return pal['base_joint']
        if rd >= H_ART - 2:
            return pal['base_dark']
        return tuple(int(min(255, max(0, q * f))) for q in c)
    return None


# ---------- 几何 ----------
def ground_u(x):
    """u 墙地面线（锚点线）"""
    return 174.0 + 0.5 * x


def ground_v(c):
    """v 墙地面线：前底顶点在列 64"""
    return 270.0 + 0.5 * (64 - c) if c < 64 else 270.0 - 0.5 * (c - 64)


def build(kind, pal):
    """kind='u6'|'v6' → RGBA 数组"""
    out = np.zeros((HCV, W, 4), dtype=np.uint8)
    for x in range(W):
        if kind == 'u6':
            g = ground_u(x)
            u = x % P
        else:
            g = ground_v(x)
            u = (x - 64) % P
        ridge = g - H_ART
        y0 = max(0, int(np.ceil(ridge)))
        y1 = min(HCV, int(np.floor(g)) + 1)
        for y in range(y0, y1):
            d = y - ridge
            col = wall_color(u, d, pal)
            if col is not None:
                out[y, x, :3] = col
                out[y, x, 3] = 255
    return out


def main():
    pal = sample_palette()
    print('调色板:', {k: v for k, v in pal.items() if not k.endswith(('hi', 'lo', 'dark', 'joint', 'shadow', 'low'))})

    u6 = build('u6', pal)
    v6 = build('v6', pal)

    # —— 验证 1：接缝相位连续（条带拼接后列差无尖峰）——
    strip = np.zeros((HCV + 96, 192 + W, 4), dtype=np.uint8)
    strip[:HCV, :W] = u6
    strip[96:96 + HCV, 192:192 + W] = u6
    g = strip[:, :, :3].astype(np.float64)
    D = []
    for x in range(150, 233):
        local = x - 192 if x >= 192 else x
        gr = ground_u(local) + (96 if x >= 192 else 0)
        ridge = gr - H_ART
        y0, y1 = max(0, int(ridge)), min(strip.shape[0], int(gr))
        n = min(y1 - y0, strip.shape[0] - y0)
        if n <= 0:
            continue
        D.append(np.abs(g[y0:y0 + n, x] - g[y0:y0 + n, x + 1]).mean())
    D = np.array(D)
    seam = D[191 - 150]
    base = np.median(np.delete(D, 191 - 150))
    print(f'u 墙接缝列差: {seam:.1f} / 基线 {base:.1f} (差 {seam - base:+.1f})')

    # —— 验证 2：墙顶剖面贴合理想线 ——
    al = u6[:, :, 3]
    err = []
    for x in range(0, 192, 24):
        ridge = ground_u(x) - H_ART
        ys = np.where(al[:, x] > 8)[0]
        if len(ys):
            err.append(int(ys[0] - round(ridge)))
    print('墙顶-理想线:', err)

    for name, im in [('palace_wall_u6.png', Image.fromarray(u6)), ('palace_wall_v6.png', Image.fromarray(v6))]:
        for d in (MOD_PUBLIC, MOD_SRC):
            im.save(d + '/' + name)
            print('saved', d.replace(ROOT, '.') + '/' + name, im.size)

    note = ('2026-11-20 v7 推倒重设计：程序化整段绘制（gen_palace_wall.py 可复跑），'
            '图案 f(u,d) 以 192 为周期、筒瓦12px/台基石块24px 全部整除面宽，'
            'u/v 两类墙接缝相位差恒 0 像素级连续；脊线=地面-145 与角楼墩台顶边对齐；'
            '调色板自 v4 素材分带采样延续工笔风格')
    for name in ['palace_wall_u6.json', 'palace_wall_v6.json']:
        for d in (MOD_PUBLIC, MOD_SRC):
            jp = d + '/' + name
            try:
                with open(jp, encoding='utf-8') as f:
                    meta = json.load(f)
                meta['seam_note'] = note
                with open(jp, 'w', encoding='utf-8') as f:
                    json.dump(meta, f, ensure_ascii=False, indent=1)
                print('updated', jp.replace(ROOT, '.'))
            except FileNotFoundError:
                print('skip (missing)', jp.replace(ROOT, '.'))


if __name__ == '__main__':
    main()
