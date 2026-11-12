"""本地构建脚本：拷贝 modv2 到临时目录、修补路径、重出城墙上城门贴图。
用法：python _local_build.py
"""
import os
import shutil
import subprocess
import sys
import json

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))  # shanhai/
MODV2 = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(os.environ.get('TEMP', '/tmp'), 'yj_build')
ISO_OUT = os.path.join(REPO, 'public', 'assets', 'art', 'iso')

TARGETS = [
    'city_wall_u6', 'city_wall_u2', 'city_wall_v6', 'city_wall_v2',
    'city_wall_corner', 'city_gate_tower', 'city_gate_wide', 'city_gate_wide_v',
]


def main():
    os.makedirs(BUILD, exist_ok=True)
    os.makedirs(os.path.join(BUILD, 'assets_v2', 'modules'), exist_ok=True)
    os.makedirs(os.path.join(BUILD, 'assets_v2', 'preview'), exist_ok=True)
    # 拷贝脚本
    for f in os.listdir(MODV2):
        if f.endswith('.py'):
            shutil.copy(os.path.join(MODV2, f), os.path.join(BUILD, f))
    # 修补 ROOT / OUT
    cb = open(os.path.join(BUILD, 'citybuild.py'), encoding='utf-8').read()
    cb = cb.replace(r"ROOT = r'D:\workspace\dahuayou_web'",
                    'ROOT = r' + repr(BUILD))
    open(os.path.join(BUILD, 'citybuild.py'), 'w', encoding='utf-8').write(cb)
    wg = open(os.path.join(BUILD, 'widegate.py'), encoding='utf-8').read()
    wg = wg.replace(r"OUT = r'D:\workspace\game\xiyou01\shanhai\public\assets\art\iso'",
                    'OUT = r' + repr(ISO_OUT))
    open(os.path.join(BUILD, 'widegate.py'), 'w', encoding='utf-8').write(wg)

    # 记录旧尺寸
    old = {}
    for t in TARGETS:
        p = os.path.join(ISO_OUT, t + '.png')
        old[t] = os.path.getsize(p) if os.path.exists(p) else 0

    # 构建（citybuild 出直段/角台/旧门楼，widegate 出宽门）
    code = 'import citybuild; citybuild.run_walls(); citybuild.run_gate(); import widegate'
    r = subprocess.run([sys.executable, '-c', code], cwd=BUILD,
                       capture_output=True, text=True)
    print(r.stdout[-3000:] if r.stdout else '')
    if r.returncode != 0:
        print(r.stderr[-4000:])
        sys.exit(1)

    # 把直段/角台/旧门楼从 modules 拷到 iso 目录（宽门已直出）
    mod_dir = os.path.join(BUILD, 'assets_v2', 'modules')
    copied = []
    for t in TARGETS:
        src = os.path.join(mod_dir, t + '.png')
        dst = os.path.join(ISO_OUT, t + '.png')
        if os.path.exists(src):
            shutil.copy(src, dst)
            copied.append(t)
    # 尺寸校验
    from PIL import Image
    ok = True
    for t in TARGETS:
        p = os.path.join(ISO_OUT, t + '.png')
        if os.path.exists(p):
            im = Image.open(p)
            print(f'{t}: {im.size[0]}x{im.size[1]}  bytes {old[t]} -> {os.path.getsize(p)}')
    print('copied:', copied)


if __name__ == '__main__':
    main()
