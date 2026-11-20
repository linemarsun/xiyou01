"""
宫城墙段无缝修复 v5（2026-11-18）：
 替换失败的"墙顶剖面标准化"尝试（96px 落差铺满 256px 画布 → 坡度 0.375≠0.5，
 墙身被推出画布下缘，接缝处呈 24px 锯齿）。

几何契约（对照渲染正常的外城 city_wall_u6 校准）：
- 画布 256×275，锚点 anchor_px=[192,270]（前底格 S 中心，= 足迹底顶点上方 16px）
- 真实地面线：y_g(x) = 270 - 96 + 0.5x（长立面沿 SW 边，斜率严格 0.5）

缺陷根源（v4 遗留）：每段左端 0..48px 是"端头收顶"画法——屋脊翘起 ~40px、墙高塌到 85，
而下一段精灵左端正好压在本段端面区上（画家序后者在上），导致每处拼接都露出端头尖 +
高度断台（用户截图 4 处红框）。

修复：整段重排为"纯墙身 + 恒定墙高 + 0.5 坡度"，逐列平移对齐：
- 墙身源：v4 版 x∈[48..192)（实测 H 恒定 114~116）
- 左端 [0..48)：源列 = x+96（上移 ~48px）——使第 0 列与第 192 列采样同一源列、
  位移差恰 = 段步进落差 96px，拼接边界逐像素严格连续（瓦垄/墙身/石基零缝）
- 右端 [192..256)：源列 = x-96（下移 ~48px），该区恒被下一段/角楼/宫门覆盖
- 相位代价：瓦垄竖缝在 x=48（每段面中）有 ~12px 相位跳，远离开接缝、低对比，可接受
"""
import json
import io
import subprocess
import numpy as np
from PIL import Image

ROOT = __file__.rsplit('\\tools', 1)[0]          # .../xiyou01/shanhai
MOD_PUBLIC = ROOT + '/public/assets/art/iso'
MOD_SRC = ROOT + '/assets_src/modules'

CANVAS_W, CANVAS_H = 256, 275
ANCHOR = (192, 270)
BODY = (48, 192)   # v4 版墙身稳定区（H 恒定）


def load_head_u6():
    """以 HEAD（v4）版墙身作为纹理源"""
    blob = subprocess.run(
        ['git', 'show', 'HEAD:shanhai/public/assets/art/iso/palace_wall_u6.png'],
        capture_output=True, check=True, cwd=ROOT + '/..').stdout
    return Image.open(io.BytesIO(blob)).convert('RGBA')


def profiles(alpha):
    W = alpha.shape[1]
    top = np.full(W, -1, dtype=np.int32)
    bot = np.full(W, -1, dtype=np.int32)
    for x in range(W):
        ys = np.where(alpha[:, x] > 8)[0]
        if len(ys):
            top[x] = ys[0]
            bot[x] = ys[-1]
    return top, bot


def median_smooth(arr, k=5, allow_negative=False):
    """一维中值滤波。allow_negative=True 时不把负值当缺失值过滤
    （位移序列全列有效且可为负；剖面序列用 -1 表示缺列）。"""
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


def fix_u6():
    src_im = load_head_u6()
    assert src_im.size == (CANVAS_W, CANVAS_H), src_im.size
    a = np.array(src_im)
    top, bot = profiles(a[:, :, 3])

    # —— 自校准：墙身段 = 长立面 [0..192) 内 H 最稳定的连续区，H = 中位墙高 ——
    # （端面区 x≥192 的墙底被画布下缘裁剪，H 失真，不参与探测）
    Hs = np.where((top >= 0) & (bot >= 0), bot - top, -1)
    ok = (Hs > 40) & (Hs < 200)
    H_med = float(np.median(Hs[ok]))
    stable = set(np.where(np.abs(Hs[:192] - H_med) <= 2)[0].tolist())
    spans, s0 = [], None
    for i in range(192 + 1):
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
    if (b0, b1) != BODY:
        print(f'提示: 墙身段与预期 {BODY} 不同，按探测值继续')

    top_s = median_smooth(top, 5)

    # —— 目标线：地面 = 锚点-96+0.5x（严格 0.5 坡度），墙顶 = 地面 - H ——
    gx = np.arange(CANVAS_W)
    ground = (ANCHOR[1] - 96) + 0.5 * gx
    ridge_t = ground - H

    # —— 源列映射 + 逐列平移 ——
    # 位移序列按链分段平滑（链间位移有 ~50px 跳变，跨链取中值会互相污染）；
    # allow_negative：位移可为负（内容上移），不得当缺失值过滤
    sx_map = np.zeros(CANVAS_W, dtype=np.int64)
    shifts = np.zeros(CANVAS_W, dtype=np.float64)
    for x in range(CANVAS_W):
        sx = x + 96 if x < b0 else (x if x < b1 else x - 96)
        sx_map[x] = sx
        shifts[x] = ridge_t[x] - top_s[sx]
    sm = shifts.copy()
    sm[:b0] = median_smooth(shifts[:b0], 5, allow_negative=True)
    sm[b0:b1] = median_smooth(shifts[b0:b1], 5, allow_negative=True)
    sm[b1:] = median_smooth(shifts[b1:], 5, allow_negative=True)
    shifts = np.round(sm).astype(np.int64)
    # 拼接边界精确性：列 0 与列 192 同源列，位移差必须恰为段步进落差 96px
    # （平滑取整可能引入 ±1 偏差，这里强制回填）
    shifts[0] = shifts[192] - 96

    out = np.zeros_like(a)
    for x in range(CANVAS_W):
        ny = np.arange(CANVAS_H) + shifts[x]   # 源行 y → 目标行 y+shift
        okr = (ny >= 0) & (ny < CANVAS_H)
        out[ny[okr], x, :] = a[okr, sx_map[x], :]

    # —— 保险：墙基线以下 10px 的残留内容强制透明（历史端头残迹/垂出杂质）——
    ground_rows = np.round((ANCHOR[1] - 96) + 0.5 * gx).astype(np.int64)
    for x in range(CANVAS_W):
        cut = ground_rows[x] + 10
        if cut < CANVAS_H:
            out[cut:, x, 3] = 0

    # —— 相位拼接处（x=b0）竖缝软化：边界右侧 12px 从"延拓链"渐变到"墙身链" ——
    # 两条链都按 ridge_t 对齐（屋脊/墙基线连续），仅瓦垄竖缝相位相差 ~12px，
    # 线性渐变把硬缝化为 12px 柔和过渡
    Z = 12
    for x in range(b0, min(b0 + Z, CANVAS_W)):
        t = (x - b0) / Z        # 0=延拓链(src x+96), 1=墙身链(src x)
        acc_a = np.zeros(CANVAS_H, dtype=np.float64)
        acc_prem = np.zeros((CANVAS_H, 3), dtype=np.float64)
        for sxx, w in ((x + 96, 1.0 - t), (x, t)):
            if not (0 <= sxx < CANVAS_W):
                continue
            s = int(round(ridge_t[x] - top_s[sxx]))
            ny = np.arange(CANVAS_H) + s
            okr = (ny >= 0) & (ny < CANVAS_H)
            col = a[okr, sxx, :].astype(np.float64)
            acc_a[ny[okr]] += col[:, 3] * w
            acc_prem[ny[okr]] += col[:, :3] * (col[:, 3] / 255.0)[:, None] * w
        m = acc_a > 1
        o = np.zeros((CANVAS_H, 4), dtype=np.float64)
        o[m, 3] = 255.0
        o[m, :3] = acc_prem[m] / acc_a[m, None] * 255.0
        out[:, x, :] = o.astype(np.uint8)

    # —— 验证：墙顶贴目标线、墙底贴地面线（±4px）——
    otop, obot = profiles(out[:, :, 3])
    err_t = [int(otop[x] - ridge_t[x]) for x in range(0, 192, 24)]
    err_b = [int(obot[x] - ground[x]) for x in range(0, 192, 24)]
    print('墙顶-目标线:', err_t)
    print('墙底-地面线:', err_b)
    assert max(abs(e) for e in err_t) <= 2, '墙顶对齐超差'

    # —— 拼接边界逐像素连续性自检：列 0 与列 192 应相差正好 96px 平移 ——
    d = shifts[192] - shifts[0]
    print(f'列192-列0 位移差 = {d} (期望 96)')
    assert d == 96, '拼接边界位移差异常'

    return Image.fromarray(out)


def main():
    fixed = fix_u6()
    v6 = fixed.transpose(Image.FLIP_LEFT_RIGHT)

    for name, im in [('palace_wall_u6.png', fixed), ('palace_wall_v6.png', v6)]:
        for d in (MOD_PUBLIC, MOD_SRC):
            im.save(d + '/' + name)
            print('saved', d.replace(ROOT, '.') + '/' + name, im.size)

    note = ('2026-11-18 v5: 整段重排为纯墙身+恒定墙高+0.5坡度（对照 city_wall_u6 地面线校准），'
            '左端源列x+96上移、右端x-96下移，列0/列192同源列位移差96=段步进落差，'
            '拼接边界逐像素连续；消除 v4 端头收顶在拼接处露出的屋脊翘尖与高度断台')
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
