"""
宫城墙段无缝修复 v6（2026-11-20）：周期锁定经验搜索版。
 replacing v5（列0/列192 同源列方案）——v5 消灭了端头翘尖与高度断台，但两类相位缝仍在：
 1) u 墙拼接可见对是 (列191, 下一段列0)：src 191 → src 96，跳 ~6.5px
 2) v 墙（镜像）拼接可见对是 (列64, 列255)：src 191 → src 96，跳 ~13px
 3) v5 的延拓链(源列x+96)与墙身链在列46 相接：src 141 → src 46，跳 ~13px
 根因：素材纹理周期 (~13.9px) 不整除 192px 面宽，任何"+96 采样"方案必有相位缝。

v6 方案：整脸 [0..256) 用同一连续采样 s(x) = 46 + (r*x mod L)，其中
 - L = 补丁长度（源列 [46..46+L)），r = 采样速率；
 - 网格搜索 (r, L) 使"两块拼接条"的接缝列差尖峰最小（不依赖周期测量精度）；
 - 拼接可见行程 = 191 列（u 墙 0→191 / v 墙 64→255），r* 让 191 列的相位行程恰为整数个周期；
 - 段内 wrap（s 回卷）点由 L 决定，跳变同样被搜索压到最小；
 - 逐列屋脊对齐 + 墙基下 10px 裁剪 + v6 镜像派生，契约与 v5 一致。
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

CANVAS_W, CANVAS_H = 256, 275
ANCHOR = (192, 270)
BODY = (46, 192)          # v4 源的稳定墙身列范围
PATCH0 = 46               # 补丁起点（源列）


def load_head_u6():
    blob = subprocess.run(
        ['git', 'show', 'HEAD:shanhai/public/assets/art/iso/palace_wall_u6.png'],
        capture_output=True, check=True, cwd=REPO).stdout
    return Image.open(io.BytesIO(blob)).convert('RGBA')


def profiles(alpha):
    W = alpha.shape[1]
    top = np.full(W, -1, dtype=np.float64)
    bot = np.full(W, -1, dtype=np.float64)
    for x in range(W):
        ys = np.where(alpha[:, x] > 8)[0]
        if len(ys):
            top[x] = ys[0]
            bot[x] = ys[-1]
    return top, bot


def median_smooth(arr, k=5, allow_negative=False):
    out = arr.copy().astype(np.float64)
    h = k // 2
    for i in range(len(arr)):
        if allow_negative:
            win = [arr[j] for j in range(max(0, i - h), min(len(arr), i + h + 1))]
        else:
            win = [arr[j] for j in range(max(0, i - h), min(len(arr), i + h + 1)) if arr[j] >= 0]
        if win:
            out[i] = np.median(win)
    return out


def calibrate(a):
    alpha = a[:, :, 3]
    top, bot = profiles(alpha)
    Hs = np.where((top >= 0) & (bot >= 0), bot - top, -1)
    H_med = float(np.median(Hs[(Hs > 40) & (Hs < 200)]))
    stable = set(np.where(np.abs(Hs[:192] - H_med) <= 2)[0].tolist())
    spans, s0 = [], None
    for i in range(193):
        if i in stable:
            if s0 is None:
                s0 = i
        elif s0 is not None:
            spans.append((s0, i))
            s0 = None
    b0, b1 = max(spans, key=lambda t: t[1] - t[0])
    b1 = min(b1, 192)
    H = float(np.median(Hs[b0:b1]))
    print(f'墙身段 [{b0}..{b1})  H={H:.1f}')
    return top, bot, b0, b1, H


def sample_map(r, L, W=CANVAS_W):
    """整脸连续采样：s(x) = PATCH0 + (r*x mod L)，最近邻取整"""
    s = PATCH0 + (r * np.arange(W)) % L
    return np.floor(s).astype(np.int64)


def build_columns(a, top_s, ridge_t, sx, shifts_override=None, H=116.0):
    """按采样列 + 逐列屋脊对齐拷贝内容；返回 RGBA 列阵"""
    shifts = shifts_override
    if shifts is None:
        shifts = np.round(ridge_t - top_s[sx]).astype(np.int64)
    out = np.zeros_like(a)
    for x in range(CANVAS_W):
        ny = np.arange(CANVAS_H) + shifts[x]
        okr = (ny >= 0) & (ny < CANVAS_H)
        out[ny[okr], x, :] = a[okr, sx[x], :]
    # 墙基线以下 10px 强制透明
    ground_rows = np.round(ridge_t + H).astype(np.int64)  # ground = ridge + H
    for x in range(CANVAS_W):
        cut = ground_rows[x] + 10
        if cut < CANVAS_H:
            out[cut:, x, 3] = 0
    return out


def roof_band(strip, x, ridge_y):
    """瓦帽带轮廓（列 x 在 ridge_y 下 1..19 行的 RGB 均值）"""
    y0 = int(ridge_y) + 1
    y1 = int(ridge_y) + 19
    y0 = max(0, y0); y1 = min(strip.shape[0], y1)
    if y1 <= y0:
        return 0.0
    return strip[y0:y1, x, :3].astype(np.float64).mean()


def xcorr_lag(p_left, p_right, max_lag=9):
    """p_left 尾部 与 p_right 头部 的互相关最佳错位（像素，抛物线亚像素）"""
    n = min(len(p_left), len(p_right))
    a = np.array(p_left[-n:], dtype=np.float64)
    b = np.array(p_right[:n], dtype=np.float64)
    a -= a.mean(); b -= b.mean()
    scores = []
    for lag in range(-max_lag, max_lag + 1):
        if lag >= 0:
            s = np.dot(a[:n - lag], b[lag:]) if lag < n else 0.0
        else:
            s = np.dot(a[-lag:], b[:n + lag]) if -lag < n else 0.0
        scores.append(s)
    scores = np.array(scores)
    k = int(np.argmax(scores))
    if 0 < k < len(scores) - 1:
        ym, y0v, yp = scores[k - 1], scores[k], scores[k + 1]
        den = ym - 2 * y0v + yp
        delta = 0.5 * (ym - yp) / den if abs(den) > 1e-9 else 0.0
    else:
        delta = 0.0
    return (k - max_lag) + delta


def junction_delta(face, ridge_t):
    """拼接缝瓦帽带错位 δ（像素）：两块拼接条按 (+192,+96) 步进拼合后互相关测流连续性"""
    strip = np.zeros((CANVAS_H + 96, 192 + CANVAS_W, 4), dtype=np.uint8)
    strip[:CANVAS_H, :CANVAS_W] = face
    strip[96:96 + CANVAS_H, 192:192 + CANVAS_W] = face
    p_left = [roof_band(strip, x, ridge_t[x]) for x in range(150, 192)]
    p_right = [roof_band(strip, x, ridge_t[x - 192] + 96) for x in range(192, 234)]
    return xcorr_lag(p_left, p_right)


def wrap_delta(face, ridge_t, x_wrap):
    """段内回卷缝瓦帽带错位 δ"""
    p_left = [roof_band(face, x, ridge_t[x]) for x in range(max(0, x_wrap - 42), x_wrap)]
    p_right = [roof_band(face, x, ridge_t[x]) for x in range(x_wrap, min(CANVAS_W, x_wrap + 42))]
    return xcorr_lag(p_left, p_right)


def junction_score(face, ridge_t, H):
    """两块拼接条（第二块 +192px 右移、+96px 下移）：接缝列差尖峰 - 基线（保留作参考）"""
    strip = np.zeros((CANVAS_H + 96, 192 + CANVAS_W, 4), dtype=np.uint8)
    strip[:CANVAS_H, :CANVAS_W] = face
    strip[96:96 + CANVAS_H, 192:192 + CANVAS_W] = face   # u 墙步进 (+192,+96)
    g = strip[:, :, :3].astype(np.float64)
    D = []
    for x in range(150, 233):
        local = x - 192 if x >= 192 else x
        yb = int(ridge_t[local]) + 116 + (96 if x >= 192 else 0)
        yb = min(yb, strip.shape[0])
        prof1 = g[max(0, yb - 140):yb, x]
        prof2 = g[max(0, yb - 140):yb, x + 1]
        n = min(len(prof1), len(prof2))
        D.append(np.abs(prof1[:n] - prof2[:n]).mean() if n else 0)
    D = np.array(D)
    seam = D[191 - 150]          # 接缝位置（strip 191|192）
    base = np.median(np.delete(D, 191 - 150))
    return seam - base, seam, base


def wrap_score(face, ridge_t):
    """段内回卷缝（采样 s 回卷点）尖峰"""
    g = face[:, :, :3].astype(np.float64)
    D = []
    for x in range(100, 190):
        d = np.abs(g[:200, x] - g[:200, x + 1]).mean()
        D.append((x, d))
    vals = np.array([d for _, d in D])
    base = np.median(vals)
    wx, wd = max(D, key=lambda t: t[1])
    return wd - base, wx, wd, base


def main():
    src_im = load_head_u6()
    a = np.array(src_im)
    top, bot, b0, b1, H = calibrate(a)
    top_s = median_smooth(top, 5)
    bot_s = median_smooth(bot, 5)

    gx = np.arange(CANVAS_W)
    ground = (ANCHOR[1] - 96) + 0.5 * gx
    ridge_t = ground - H

    L_MAX = b1 - PATCH0            # 补丁上限（源稳定墙身内）
    print(f'补丁可用长度上限 {L_MAX}')

    # —— 网格搜索：以瓦帽带互相关错位 δ 为目标（拼接缝 + 回卷缝都压到 ~0）——
    def eval_pair(r, L):
        sx = sample_map(r, L)
        face = build_columns(a, top_s, ridge_t, sx, H=H)
        dj = junction_delta(face, ridge_t)
        xw = max(1, int(round(L / r)))
        dw = wrap_delta(face, ridge_t, xw) if 100 <= xw <= 189 else 9.9
        return dj, dw, xw

    best = None
    for L in np.arange(130, min(L_MAX, 146) + 0.1, 1.0):
        for r in np.arange(0.92, 1.061, 0.004):
            dj, dw, xw = eval_pair(r, L)
            total = abs(dj) + abs(dw)
            if best is None or total < best[0]:
                best = (total, r, L, dj, dw, xw)
    _, r0, L0, dj0, dw0, xw0 = best
    print(f'粗搜索: r={r0:.3f} L={L0:.1f}  拼接δ={dj0:+.2f}px 回卷δ={dw0:+.2f}px(x={xw0})')

    # 细搜索
    best = None
    for L in np.arange(max(130, L0 - 3), min(L_MAX, 146, L0 + 3) + 0.1, 0.5):
        for r in np.arange(r0 - 0.02, r0 + 0.021, 0.001):
            dj, dw, xw = eval_pair(r, L)
            total = abs(dj) + abs(dw)
            if best is None or total < best[0]:
                best = (total, r, L, dj, dw, xw)
    total, r_star, L_star, dj_star, dw_star, xw_star = best
    print(f'细搜索: r*={r_star:.4f} L*={L_star:.1f}  拼接δ={dj_star:+.2f}px 回卷δ={dw_star:+.2f}px(x={xw_star})')
    # 诊断：理论候选点对照
    for rr, LL in [(1.0152, 138.5), (0.9426, 138.5), (1.0, 144.0), (r_star, L_star)]:
        dj, dw, xw = eval_pair(rr, LL)
        print(f'  诊断 r={rr:.4f} L={LL:.1f}: 拼接δ={dj:+.2f}px 回卷δ={dw:+.2f}px(x={xw})')

    # —— 成品构建 ——
    sx = sample_map(r_star, L_star)
    shifts = np.round(ridge_t - top_s[sx]).astype(np.int64)
    fixed = build_columns(a, top_s, ridge_t, sx, shifts_override=shifts, H=H)

    # 验证：墙顶贴目标线
    otop, obot = profiles(fixed[:, :, 3])
    err_t = [int(otop[x] - ridge_t[x]) for x in range(0, 192, 24)]
    print('墙顶-目标线:', err_t)

    v6 = Image.fromarray(fixed).transpose(Image.FLIP_LEFT_RIGHT)
    for name, im in [('palace_wall_u6.png', Image.fromarray(fixed)), ('palace_wall_v6.png', v6)]:
        for d in (MOD_PUBLIC, MOD_SRC):
            im.save(d + '/' + name)
            print('saved', d.replace(ROOT, '.') + '/' + name, im.size)

    note = (f'2026-11-20 v6: 周期锁定经验搜索 r*={r_star:.4f} L*={L_star:.1f}（整脸连续采样，'
            '拼接可见行程191列相位对齐+段内回卷缝最小化），消除 v5 的延拓/墙身链边界缝与'
            'u/v 两类墙的拼接相位跳变；屋脊对齐+墙基裁剪契约同前')
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
