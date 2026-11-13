# -*- coding: utf-8 -*-
"""本地重出城墙 / 城门贴图（跨机器、跨平台，不写死任何盘符）。

做法：把 modv2 脚本拷到临时目录，用 ``paths.py`` 提供的 ``SHANHAI_*``
环境变量把产物全部导到临时目录，再做尺寸对比；默认**不覆盖**仓库内的
正式贴图，加 ``--apply`` 才会把新产物拷回 ``public/assets/art/iso``。

用法：
    python _local_build.py            # 只重建 + 对比
    python _local_build.py --apply    # 重建并覆盖正式贴图
"""
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
APP_ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))  # shanhai/
ISO_OUT = os.path.join(APP_ROOT, 'public', 'assets', 'art', 'iso')
BUILD = os.path.join(os.environ.get('TEMP') or os.path.expanduser('~'), 'yj_build')
BUILD_ASSETS = os.path.join(BUILD, 'assets_src')
BUILD_ISO = os.path.join(BUILD, 'iso_out')

TARGETS = [
    'city_wall_u6', 'city_wall_u2', 'city_wall_v6', 'city_wall_v2',
    'city_wall_corner', 'city_gate_tower', 'city_gate_wide', 'city_gate_wide_v',
]


def main():
    apply_changes = '--apply' in sys.argv[1:]

    for d in (BUILD, os.path.join(BUILD_ASSETS, 'modules'),
              os.path.join(BUILD_ASSETS, 'preview', 'gen'), BUILD_ISO):
        os.makedirs(d, exist_ok=True)

    # 拷脚本（含 paths.py / post.py / shopbuild.py 等依赖）
    for f in os.listdir(HERE):
        if f.endswith('.py'):
            shutil.copy(os.path.join(HERE, f), os.path.join(BUILD, f))

    # 路径隔离：脚本内一切输出都落在临时目录；字体目录沿用系统默认或环境变量
    env = dict(os.environ)
    env['SHANHAI_ROOT'] = BUILD
    env['SHANHAI_ASSETS_SRC'] = BUILD_ASSETS
    env['SHANHAI_ISO_OUT'] = BUILD_ISO

    # citybuild 出直段 / 角台 / 旧门楼（写 BUILD_ASSETS/modules）；
    # widegate 的出图入口在 __main__ 里，必须作为脚本单独跑（写 BUILD_ISO）
    steps = [
        [sys.executable, '-c', 'import citybuild; citybuild.run_walls(); citybuild.run_gate()'],
        [sys.executable, 'widegate.py'],
    ]
    for cmd in steps:
        r = subprocess.run(cmd, cwd=BUILD, env=env, capture_output=True, text=True)
        if r.stdout:
            print(r.stdout[-3000:])
        if r.returncode != 0:
            print(r.stderr[-4000:])
            sys.exit(1)

    # 汇总产物：直段/角台/旧门楼在 modules，宽门在 iso_out
    product_dirs = [os.path.join(BUILD_ASSETS, 'modules'), BUILD_ISO]
    found = {}
    for t in TARGETS:
        for d in product_dirs:
            p = os.path.join(d, t + '.png')
            if os.path.exists(p):
                found[t] = p
                break

    from PIL import Image
    copied = []
    for t in TARGETS:
        src = found.get(t)
        if not src:
            print(f'{t}: 未产出')
            continue
        im = Image.open(src)
        dst = os.path.join(ISO_OUT, t + '.png')
        old = os.path.getsize(dst) if os.path.exists(dst) else 0
        print(f'{t}: {im.size[0]}x{im.size[1]}  bytes {old} -> {os.path.getsize(src)}')
        if apply_changes:
            shutil.copy(src, dst)
            copied.append(t)
    print('apply:' if apply_changes else 'compare-only:', copied if apply_changes else '(未覆盖正式贴图)')


if __name__ == '__main__':
    main()
