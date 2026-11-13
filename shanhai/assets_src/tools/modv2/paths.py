# -*- coding: utf-8 -*-
"""modv2 出图脚本的统一路径解析（跨机器 / 跨平台）。

旧脚本把输出写死在 ``D:\\workspace\\dahuayou_web`` 与
``D:\\workspace\\game\\xiyou01\\shanhai\\public\\assets\\art\\iso``，
换机器就跑不起来。这里统一从脚本位置上溯到应用根 ``shanhai/``：
旧工作区的 ``assets_v2`` 对应本仓库的 ``assets_src``，宫城/城门素材
直接落到 ``public/assets/art/iso``。

可用环境变量覆盖（便于把产物导到临时目录做对比，不污染仓库）：
    SHANHAI_ROOT       应用根（含 package.json），也可指向仓库根
    SHANHAI_ASSETS_SRC 素材源目录，默认 <应用根>/assets_src
    SHANHAI_ISO_OUT    等距贴图输出目录，默认 <应用根>/public/assets/art/iso
    SHANHAI_FONT_DIR   中文字体目录（旧脚本写死 C:\\Windows\\Fonts，Linux 需自行指定）
"""
import os

_HERE = os.path.dirname(os.path.abspath(__file__))
HERE = _HERE
APP_ROOT = os.environ.get('SHANHAI_ROOT') or os.path.abspath(os.path.join(_HERE, '..', '..', '..'))
# 允许 SHANHAI_ROOT 指向仓库根（xiyou01/）而不是应用根（xiyou01/shanhai/）
if not os.path.isfile(os.path.join(APP_ROOT, 'package.json')) and os.path.isdir(os.path.join(APP_ROOT, 'shanhai')):
    APP_ROOT = os.path.join(APP_ROOT, 'shanhai')

ASSETS_SRC = os.environ.get('SHANHAI_ASSETS_SRC') or os.path.join(APP_ROOT, 'assets_src')
MODULES = os.path.join(ASSETS_SRC, 'modules')
PREVIEW = os.path.join(ASSETS_SRC, 'preview')
GEN = os.path.join(PREVIEW, 'gen')
SPRITES = os.path.join(ASSETS_SRC, 'sprites')
CHAR = os.path.join(SPRITES, 'xiake', 'idle_0.png')
ISO_OUT = os.environ.get('SHANHAI_ISO_OUT') or os.path.join(APP_ROOT, 'public', 'assets', 'art', 'iso')

# 旧脚本写死 C:\Windows\Fonts\msyh*.ttc；非 Windows 可用 SHANHAI_FONT_DIR 指向含中文字体的目录
FONT_DIR = os.environ.get('SHANHAI_FONT_DIR') or os.path.join(os.environ.get('WINDIR', 'C:/Windows'), 'Fonts')

# 兼容旧脚本里 os.path.join(ROOT, 'assets_src', ...) 的写法
ROOT = APP_ROOT


def ensure(target):
    """确保输出目录存在并返回它（旧脚本假定目录已经在本机存在）。"""
    os.makedirs(target, exist_ok=True)
    return target
