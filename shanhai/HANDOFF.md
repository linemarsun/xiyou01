---
doc: HANDOFF
schema: 1
updated: 2026-11-12
updated_at: "2026-11-12 19:52 +08:00"
repo: https://github.com/linemarsun/xiyou01
branch: main
baseline_main: 935c697d36d83014954b8b3e3773846828d6cf3b
baseline_tag: v0.15.0
this_release: v0.15.1
tests: 75/75
build: pass
repo_files: 986
repo_png: 792
node: v22.22.2
local_git_note: 本机 .git 可能是 codeload 快照重建的独立根提交，与远端历史不连通，勿直接 git push
---

# 山海奇谭 · 开发目标 / 阶段进展 / 环境交接

> **本文件是跨环境续接的唯一可信源（single source of truth）。**
> 目标、状态快照、进展、环境切换都在这里；`PROGRESS.md` 记详细流水账，`docs/` 记功能与接口，三者只从此处链接，不再各自维护一份「当前状态」。
> 换环境第一步：读本文件第 0 节 → 跑第 4.3 节自检清单。

---

## 0. 30 秒接手

| 问题 | 答案 |
| --- | --- |
| 项目是什么 | 大话西游式 2D 回合制 RPG，原创美术/文案；`core/` 纯逻辑层为联机预留，单机流程已完整跑通 |
| 代码在哪 | `https://github.com/linemarsun/xiyou01`，主分支 `main`，应用根目录是仓库内的 `shanhai/` |
| 现在到哪一步 | **G-NOW 已完成**（`v0.15.0`）；`v0.15.1` 做了一轮造型精修与出图脚本跨环境修复，下一阶段目标仍待拍板（1.5 节） |
| 基线 | 远端 `main = 935c697`（`v0.15.0`，本次推送前）/ 最新 tag `v0.15.1`（`v0.13.0` 为宫城素材族） |
| 健康度 | `npm test` 75/75、`npm run build` 通过；986 个文件（含 792 张 PNG） |
| 本环境最大坑 | git 智能协议被代理拦截（`clone/fetch/push` 502），只能走 codeload + GitHub API；本地 `.git` 是快照重建的独立根提交，**不能常规 push** |

---

## 1. 目标

### 1.1 产品目标（长期，不变）

做一款可在浏览器完整跑通「选人 → 大地图探索 → 遭遇战 → 结算成长」的原创 2D 回合制 RPG。数值与规则借鉴大话式回合制，美术、命名、文案、素材全部原创；`src/core/` 保持纯逻辑、可序列化指令与事件流，为 M4 联机预留。

### 1.2 当前阶段目标（2026-11-10 用户确认）

> **G-NOW：用真实美术素材替换程序化占位，延续「一景一制」的视觉辨识度。**

远端 `v0.13.0` 已迈出第一步（宫城素材族：`palace_hall` / `palace_hall_s` / `palace_gate` / `palace_corner` / `palace_wall_u6|v6|u2|v2` / `pagoda` / `ground_marble` 等真实 PNG + `iso.ts` 类型登记）。本阶段把它推广到五张地图。

| # | 验收标准 | 验证方式 | 状态 |
| --- | --- | --- | --- |
| A1 | 五图（云京 / 青崖山道 / 渡忘川 / 玲珑洞天 / 地府）主构件均有真实 PNG，程序化占位退化为**缺图回退** | 浏览器 `?map=<id>` 逐图截图；`npm test [18]` 候选链零缺图断言 | ✅ `v0.15.0` 完成（12 张新贴图覆盖 rock / bridge / stele / well / incense / crate / hall） |
| A2 | 每图素材风格统一且彼此可区分，不退回「同一套模板」 | 五图地形/构件对比页 + `npm test` 主题差异断言 | ✅ 完成：山石 4 变体、石桥 2 变体、大殿 2 变体，按格坐标确定性色差/镜像/高度起伏 |
| A3 | 新素材登记进 `core/iso.ts` 类型/候选与 `public/assets/art/iso/*.json` 布局，`npm run maps` 仍幂等 | 两次运行 `npm run maps` 后 `git diff` 为空；`npm test` 布局合法性断言 | ✅ 完成：候选链按文件名自动命中，未改布局数据；`props` / `maps` 两次运行字节一致 |
| A4 | 不退化：`npm test` ≥ 67、`npm run build` 通过、五图可走、跨图出入口仍贴边界 | 第 4.3 节自检清单 | ✅ 当前 75/75 |
| A5 | 素材文件 + 出图脚本一并入仓，随提交打 tag | `node tools/gh-sync.mjs status` 与 `git tag` | ✅ `tools/gen-iso-props.mjs` 入库、tag `v0.15.0` |

> **阶段进展**
> - `v0.14.0`：三种树形（`leaf` / `pine` / `dead`）全部有真实 PNG，由零依赖 `tools/gen-tree-art.mjs` 生成（`npm run trees`，幂等）。
> - **`v0.15.0`（本轮）**：补齐其余全部缺图构件 —— `rock{,_moss,_dark,_crystal}`、`bridge{,_dark}`、`stele`、`well`、`incense`、`crate`、`hall{,_stone}` 共 12 张真实 PNG，由零依赖 `tools/gen-iso-props.mjs` 生成（`npm run props`，幂等）。**G-NOW 的 A1/A2/A3 全部达成**，程序化占位现在只是缺图回退。
> - **`v0.15.1`（本轮精修，用户 2026-11-12 拍板「做精修」）**：不新增缺图构件，只打磨造型与工程可移植性 —— 石桥改为分段拱起 + 两孔券洞 + 镂空栏板，大殿瓦垄改双线并拉开四坡明暗，晶簇从三根等高柱改为五根错落棱柱；洞天晶石按「洞厅留白 / 环廊通透 / 洞壁成丛」分层（805 → 661 块）；`modv2/*.py` 的机器绝对路径全部收敛到 `paths.py`，补 `requirements.txt` 与出图命令说明。`npm test [19]` 锁住细节不回退与路径约束，回归 72 → 75。
> - 下一阶段主目标（M4 联机预研 / 深化玩法 / 再精修）仍未拍板，见 1.5 节；不要自行把「继续补图」当成默认目标。

### 1.3 长期约束（用户明确要求，任何阶段都不得违反）

| 约束 | 出处 | 落地证据 |
| --- | --- | --- |
| 每个场景必须有自己的特色，不能千篇一律 | 2026-11-09 用户反馈 | `tools/gen-iso-maps.mjs` 每图一个 build 函数：盘山之字 / 斜河双堤 / 环廊放射 / 黄泉直道；回归 `[12b]` 断言路网签名与地表组合互异 |
| 规模参考云京，但尺寸、形状可不同 | 同上 | `core/world.ts` 的 `ISO_GRIDS` 逐图定义：128×128 / 128×96 / 96×128 / 104×104 / 80×112 |
| 地图切换出入口必须在边界 | 同上 | 9 条跨图边全在边界带 `gx∈{1,cols−2}` 或 `gy∈{1,rows−2}`，成对互为落点；回归断言 |
| 完成后推送代码并打 tag | 2026-11-09 用户要求 | `55851ba` / `v0.12.0`；`6cf599a` / `v0.13.0` |
| 素材来源与状态可追溯 | 2026-11-09 用户追问 | 本文件第 2.3 节「素材状态」专章 |
| 目标与进展随代码入仓，便于换环境 | 2026-11-10 用户要求 | 本文件 + `tools/gh-sync.mjs`，随 `v0.13.1` 入库 |

### 1.4 非目标（本阶段不做，避免范围蔓延）

- ❌ M4 联机（服务端技术栈 / 部署方式 / 协议范围尚未拍板，见 `PROGRESS.md` 待确认项）。
- ❌ 改玩法数值、任务链、存档结构（素材接入若必须改，需单独记录）。
- ❌ 引入第三方或现成游戏美术素材（版权红线）。
- ❌ 云存档、帮派、摆摊等远期系统。
- ❌ 把「文档」分散到 README / PROGRESS / docs 多处重复维护（本次起收敛到本文件）。

### 1.5 待用户拍板（不自行推测）

1. **出图管线**：`v0.14.0` / `v0.15.0` 已用**零依赖 Node 生成器**（`gen-tree-art.mjs` / `gen-iso-props.mjs`）补齐全部缺图构件；`v0.15.1` 已把旧 `assets_src/tools/modv2/*.py` 的硬编码路径收敛到 `paths.py` 并补 `requirements.txt` + 出图说明（见 `docs/使用方式.md` 7.1）。是否把 Python 脚本整体迁到 Node 路线，仍待定。
2. **替换优先级**：A1 已达成；`v0.15.1` 已完成石桥等距可读性、大殿瓦垄对比度、晶石密度三项打磨（第 6 节任务 4）。后续若要再精修，需重新列出具体造型清单。
3. ~~**素材由谁产出**~~：**已明确（2026-11-12 用户指令「补充缺少的素材」）** —— 由 AI 用零依赖脚本生成原创 PNG 并入仓，风格对齐仓库已有国风贴图；不使用第三方或现成游戏素材仍是红线。
4. **性能预算**：单图纹理数、单张 PNG 尺寸上限、是否需要图集（当前按视口裁剪逐件绘制；洞天可见精灵最多，软件渲染下俯瞰截图偶发超时）。
5. **下一阶段主目标**：2026-11-12 用户已拍板「先做一轮精修」（即 `v0.15.1`）；再往后是转 M4 联机预研、深化玩法，还是继续美术精修，仍未拍板。**未拍板前不要自行开工。**

---

## 2. 阶段进展

### 2.1 时间线（证据可回溯）

| 日期 | 阶段 | 交付 | 证据 / 状态 |
| --- | --- | --- | --- |
| 2026-11-06 | 模块 0~3 | 基线与文档、全链回归自检、装备补全、宠物炼妖 | `npm test` 18 → 24 → 29 |
| 2026-11-07 | 模块 4~10 | 组队同伴、音乐音效、自动挂机、分块地图、国风美术、世界观文案、国风地图与悬赏榜 | `npm test` 35 → 53 |
| 2026-11-09 上午 | 模块 11 · 等距野外全场景 | 四张野外/地府从横向卷轴改为等距构件图，玩法锚点格坐标化 | `npm test` **60/60** |
| 2026-11-09 下午 | 模块 12 · 一景一制（用户纠正后重做） | 五图独立格网 + 专属路网 + 边界出入口；新增 `npm run maps` 生成器（自带 BFS 自检） | `npm test` **61/61**；截图五图验收 |
| 2026-11-09 | 交付推送 | 16 文件（+1035/−122）推送 `main`、`4cf6fc0 → 55851ba` | tag **`v0.12.0`**（附注对象 `0248e06`） |
| 2026-11-09 晚 | 远端后续（另一工作流） | `e8f8021` 城门嵌入与格级寻路、`968e269` 鼓楼贴图、`4cf6fc0` 券门拓宽、`6cf599a` 宫城素材族（modv2 `palace.py` + 真实 PNG + `iso.ts` 登记 + A* / 舆图） | `npm test` **67/67**；tag **`v0.13.0`** |
| 2026-11-10 | 下拉同步 | codeload 快照：48 增/覆盖、918 跳过、0 删除；966 文件按 git blob sha 与远端 tree 完全一致 | `npm test` 67/67、`npm run build` 通过；本地快照提交 `4b21699`，工作区干净 |
| 2026-11-10 | 目标固化与交接（本文件） | `HANDOFF.md` + `tools/gh-sync.mjs` + README / PROGRESS 口径修正；+2 文件（966 → 968） | tag **`v0.13.1`** → `ec859fe` |
| 2026-11-10 | 状态快照校正 | front matter 的基线 sha / tag / 文件数改为推送后的真实值 | tag **`v0.13.2`** |
| 2026-11-10 | 模块 13 · 云京道路净空 + 树木美术 | 迁移 5 栋压在窄路上的建筑并清理 12 件挡路小摆件；新增 `tree_leaf.png` / `tree_dead.png` + 零依赖生成器；渲染层加确定性色差/镜像；回归 67 → 69 | tag **`v0.14.0`** |
| 2026-11-12 | 模块 14 · 四图构件素材补齐 | 用户要求「完善云京之外的其他地图、补充缺少的素材」；新增 12 张真实 PNG + `tools/gen-iso-props.mjs`（零依赖、幂等）；渲染层把确定性色差扩到山石/石碑/木箱；回归 69 → 72（候选链零缺图、变体互异、主题独立）；971 → 984 文件 / 780 → 792 PNG | tag **`v0.15.0`** |
| 2026-11-12 晚 | 模块 15 · 造型精修 + 出图脚本跨环境 | 用户「帮我做一下精修」；重绘 `bridge{,_dark}` / `hall{,_stone}` / `rock_crystal` 五张 PNG（拱桥券洞、双线瓦垄、五根错落晶体），洞天晶石分层 805 → 661；`modv2` 26 个脚本去机器绝对路径 + 新增 `paths.py` / `requirements.txt` + 出图说明；回归 72 → 75（`[19]` 细节不回退 / 晶石分层 / 路径约束）；984 → 986 文件 / 792 PNG | tag **`v0.15.1`** |

### 2.2 本轮地图任务：用户诉求 → 落地对照

| 用户原话 | 落地 | 证据 |
| --- | --- | --- |
| 「添加其他场景的地图，并修改、完善这些地图场景」 | 四张野外/地府全部改为等距构件地图并持续完善 | `public/assets/art/iso/{wild_heifeng,wild_luanzang,wild_shanxiao,difu}.json` |
| 「每个场景需要有自己的特色，不要千篇一律」 | 推翻第一版「统一 128×128 + 十字广场 + 中心券门」重做 | 四套独立 build 函数与路网签名 |
| 「规模参考云京，形状也可以不完全一致」 | `ISO_GRIDS` 逐图定义，世界尺寸与 bounds 由格网推导 | 五图尺寸互不相同 |
| 「地图切换的出口和入口要在边界上」 | 9 条跨图边落边界带，成对互为落点；新增忘川 ⇄ 幽都水路 | `core/world.ts` `at(mapId,…)` 按目标图格网换算 |
| 「完成后推送代码并打 tag」 | `55851ba` + `v0.12.0` | 远端已复核 |

### 2.3 素材状态（换环境最容易误判，单列）

- **本轮自有改动（模块 11 / 12）没有生成、也没有上传任何新美术 PNG。** 上传到仓库的是 4 个布局 JSON 与生成器 `tools/gen-iso-maps.mjs`；画面里新增的石桥、山石、枯木、碑阵、引魂灯等，全部由 `render/world-renderer.ts` 的**程序化占位**绘制。仓库原有 PNG 未被本轮修改。
- 下拉后远端**已有另一条工作流新增的真实素材**：`public/assets/art/iso/` 下的 `palace_*.png`、`pagoda.png`、`ground_marble.png`、`city_gate_wide*`、宫墙系列，以及 `assets_src/tools/modv2/palace.py`、`widegate.py`。它们属于 `v0.13.0`，不是本轮模块 11/12 的产物。
- **历史结论（截至 `v0.13.0`）**：五图的主体表现仍是「布局 JSON + 程序化占位」，真实美术只覆盖了宫城素材族。这正是 G-NOW 的起点。
- **`v0.14.0`**：新增 `tree_leaf.png` / `tree_dead.png`（`tree_pine.png` 原有），三种树形不再走占位；树木按格坐标做确定性色差与镜像。生成器 `tools/gen-tree-art.mjs` **零外部依赖**（纯 Node + zlib、路径相对脚本位置），`npm run trees` 幂等。
- **`v0.15.0`（当前）已全部补齐**：新增 `rock.png` / `rock_moss.png` / `rock_dark.png` / `rock_crystal.png`（青崖苔石 / 忘川·地府玄石 / 洞天晶簇）、`bridge.png` / `bridge_dark.png`（青石桥 / 幽冥石桥）、`stele.png`、`well.png`、`incense.png`、`crate.png`、`hall.png` / `hall_stone.png`（朱红殿 / 云京石殿），共 **12 张真实 PNG**。由 `tools/gen-iso-props.mjs` 生成（同样零依赖、纯 Node + zlib、`npm run props` 幂等），风格对齐 `gate_arch.png` / `house_4x4_sw.png` 的深墨描边 + 等距四向明暗分面 + 低饱和石/木/瓦色。
  - **候选链自动命中**：文件名严格贴合 `core/art.ts` 的 `isoModuleCandidates(type, variant)`，因此**没有改任何布局 JSON**，`npm run maps` 两次运行字节一致。
  - **避免复制感**：`world-renderer.ts` 的 `PROP_TINT` 给 tree / rock / stele / crate / lantern_post 按格坐标做确定性色差，山石另加镜像（1/7）与 5 档纵向起伏 —— 洞天成片晶石（当时 805 块，`v0.15.1` 分层后 661 块）不再像同一张图复制粘贴。
  - **回归锁死**：`npm test [18]` 会展开五图每一条非地面构件，逐个验证候选链至少命中一张真实 PNG；缺任意一张即失败。`[18]` 还校验 12 张新贴图是带 alpha 的合法 PNG、变体内容互异、四图山石变体各自独立。
  - **当前结论**：五图所有非地面构件均有真实 PNG，程序化占位只剩缺图回退；`render/world-renderer.ts` 里那些 `drawRock` / `drawBridge` / `drawStele` 等函数保留为兜底，正常游玩不再命中。
- **`v0.15.1` 造型精修（重绘，未新增文件）**：`bridge.png` / `bridge_dark.png` 由「平板 + 实心栏墙」改为沿长轴 12 段 sin 拱起的桥面、近侧两孔券洞（深墨券口 + 亮色券石）、半透镂空栏板 + 五根望柱、两端 9px 桥板断面；`hall.png` / `hall_stone.png` 把 1.1px 单线瓦垄换成「一阴一阳」双线 + 三道横向瓦缝，四坡拉开明暗，补檐板瓦当与正脊吻兽，去掉穿过前坡中央的金色垂脊；`rock_crystal.png` 由三根等高柱改为五根错落棱柱 + 基座碎晶，并跳过会穿过晶体的黑色分面线。全部由 `npm run props` 重新生成，幂等；`npm test [19]` 用 PNG 非透明像素数与颜色种类数锁住细节不回退（旧版 bridge 104 色 → 517、hall 420 → 1044、crystal 223 → 658）。
- **洞天晶石分布**：`tools/gen-iso-maps.mjs` 新增 `decoDensityAt(gx, gy)` 钩子，洞天按距圆心分层（圆厅 0.012 / 环廊 0.032 / 洞壁 0.095），总量 805 → **661**（圆厅 10 / 环廊 31 / 洞壁 620），环廊与四条放射石阶重新可读；`npm test [19]` 锁住该分层。
- ✅ **出图脚本跨环境路径已修（`v0.15.1`）**：新增 `assets_src/tools/modv2/paths.py`，从脚本位置上溯到应用根，旧工作区 `assets_v2` 对应仓库 `assets_src`；26 个 `modv2/*.py` 中的 `D:\...` / `C:\Windows\Fonts\...` 绝对路径改为 `ISO_OUT` / `MODULES` / `PREVIEW` / `GEN` / `FONT_DIR` 等常量（可用 `SHANHAI_ROOT` / `SHANHAI_ASSETS_SRC` / `SHANHAI_ISO_OUT` / `SHANHAI_FONT_DIR` 覆盖）。`requirements.txt` 与出图命令说明见 `docs/使用方式.md` 7.1；`npm test [19]` 会扫描所有脚本，出现盘符路径即失败。依赖仍是 Python + Pillow + numpy（**本机安装源不可用，未能实跑 Python 脚本**，已做全量 `py_compile` 语法检查与 `paths.py` 路径解析验证）。

### 2.4 已修正的文档口径漂移

`PROGRESS.md` 原停在「61 项 / 2026-11-09 / 基线 55851ba」，与远端 `v0.13.0` 的 67 项不符；本次已同步。今后**状态快照只认本文件 front matter**，其他文档不得再写「当前测试数 / 当前基线」。

---

## 3. 当前状态快照

| 项 | 值 |
| --- | --- |
| 远端 `main` | `935c697d36d83014954b8b3e3773846828d6cf3b`（`v0.15.0`，即 `v0.15.1` 的父提交）；本次提交后 main 会前移 |
| tags | `v0.12.0` → `55851ba`；`v0.13.0` → `6cf599a`；`v0.13.1` → `ec859fe`；`v0.13.2` → `edb7045`；`v0.14.0` → `5413786`；`v0.15.0` → `935c697`；`v0.15.1` → 本次提交 |
| 本地 git | 当前环境为 codeload 快照重建的独立根提交（与远端历史不连通）；`core.autocrlf=false` / `core.eol=lf`；网络放行后建议重新 clone |
| 测试 / 构建 | `npm test` 75/75；`npm run build`（`tsc --noEmit` + `vite build`）通过；`props` / `maps` / `trees` 三生成器两次运行 92 个产物文件哈希全一致 |
| 文件规模 | 986 个，其中 792 张 PNG（本轮重绘 5 张已有 PNG，新增 `paths.py` + `requirements.txt` 两个文件） |
| 美术生成 | `npm run maps`（布局）、`npm run trees`（树木）、`npm run props`（场景构件）、`npm run assets`（像素素材）四个生成器均幂等、零外部依赖（纯 Node + zlib） |
| 应用目录 | `shanhai/`，入口 `src/ui/main.ts`；开发态 `?play=1` 直接开局、`?map=<id>` 直达场景；`#sim` 数值仿真 |
| 地图格网 | `core/world.ts` 的 `ISO_GRIDS`（五图各一规格），`core/iso.ts` 提供与尺寸无关的碰撞/BFS，`core/iso-path.ts` 保留 A*，`ui/map-panel.ts` 为舆图 |
| 布局生成 | `npm run maps` → `tools/gen-iso-maps.mjs` → `public/assets/art/iso/*.json`（幂等，自带 BFS 自检） |
| 存档 | `localStorage` 键 `shanhai-save-1`，靠字段兜底迁移，无版本号 / 无导入导出 |

---

## 4. 环境切换手册

### 4.1 路径 A：网络正常（首选）

```bash
git clone https://github.com/linemarsun/xiyou01.git
cd xiyou01/shanhai
npm ci                 # 不要改 package-lock.json；Windows npm install 曾删掉 libc 字段
npm test               # 期望 75/75
npm run build
npm run dev            # http://localhost:5199
```

Git 换行设置建议 `core.autocrlf=false` / `core.eol=lf`，否则按 blob sha 比对会出现大量伪差异。

### 4.2 路径 B：git 智能协议被代理拦截（当前环境）

**症状**：`git clone` / `ls-remote` / `fetch` / `push` 返回 502 或 SSL EOF，但 `api.github.com` 与 `codeload.github.com` 可访问。

```bash
cd xiyou01/shanhai
node tools/gh-sync.mjs status                              # 只读：远端 sha/tag + 本地差异
node tools/gh-sync.mjs pull --apply                        # codeload 快照下拉（默认不删本地独有文件）
node tools/gh-sync.mjs push                               # dry-run，先看清单
node tools/gh-sync.mjs push --apply --tag v0.15.2 -m "..." # 写入 main 并打附注 tag（换成新版本号）
```

- 凭据优先级：`GITHUB_TOKEN` / `GH_TOKEN` 环境变量 → `git credential fill`（本机为 Windows 凭据管理器）。令牌只进内存，不打印、不落盘。
- `push` 以**当前远端 main** 为父提交创建 tree/commit 并快进，保留完整历史；检测到「远端有、本地没有」的文件会**中止**，防止误删。
- ⚠️ 本机 `.git` 是 codeload 快照后 `git init` 重建的独立根提交，与远端历史**不连通**。`pull` 不会生成本地对应提交，因此**不要在这里用 `git push`**；网络放行后重新 `git clone` 一次即可回到常规工作流。

### 4.3 换环境自检清单（照顺序跑）

1. `node tools/gh-sync.mjs status` → 本地与远端 tree 是否一致、文档基线 `baseline_main` 是否对得上。
2. `npm test` → **75/75**（低于此数说明代码或素材没拉全；`[18]` 逐个检查候选链零缺图，`[19]` 检查精修贴图、晶石分层与 Python 脚本路径）。
3. `npm run build` → 通过。
4. `npm run dev` + `?play=1&map=<id>` 逐图看一眼；改过布局再跑一次 `npm run maps`，确认 `git diff` 为空（幂等）。
5. 对照本文件 front matter 的 `this_release` 与 `git tag`；若不一致，说明拿到的是旧文档。

### 4.4 换环境已知坑

| 坑 | 处理 |
| --- | --- |
| Python 出图脚本曾写死 `D:\workspace\...` 绝对路径 | `v0.15.1` 已收敛到 `paths.py`，见 2.3 与 `docs/使用方式.md` 7.1 |
| Python 依赖 / 中文字体 | `requirements.txt` 已入库（Pillow + numpy）；非 Windows 需设 `SHANHAI_FONT_DIR` 指向含中文字体的目录 |
| 洞天软件渲染俯瞰偶发超时 | 见第 6 节任务 5；`v0.15.1` 分层后晶石 661 块，近景截图仍可能卡 `Page.captureScreenshot` |
| vite HMR 偶发吃掉同批多次编辑 | 硬刷新或重启 dev server |
| 无头浏览器截图首帧黑屏 / `window.__shanhai` 滞后一次导航 | 等 `visibleSprites`、双帧同步、独立标签页禁用缓存 |
| 工作区根目录的临时文件**不在仓库里** | `push-github.mjs`（旧版）、`shot.mjs`、`map-overview.*`、`chrome-*` profile 等均为本机临时产物，新环境不需要，也不应复制进去 |

---

## 5. 开发约定

- **分层**：`src/core/` 禁止 import DOM；`src/render/` PixiJS；`src/ui/` DOM。指令与事件全是可序列化纯对象。
- **随机**：战斗内走 `core/rng.ts`（mulberry32，种子化，可复现）；世界掉落用 `Math.random`。
- **数值**：全部集中在 `src/core/content.ts`，改完跑 `#sim` 看胜率。
- **地图**：改 `tools/gen-iso-maps.mjs` 后跑 `npm run maps`；布局 `grid` 必须与 `ISO_GRIDS[region]` 一致，`anchors` 必须与 `BASE_MAPS` 逐条一致，`npm test` 会锁住。
- **素材**：真实 PNG 优先，`isoModuleCandidates()` / `isoHouseCandidates()` 找不到才回退程序化占位；`tools/gen-assets.mjs` 负责像素素材（`npm run assets`），`tools/gen-tree-art.mjs` 负责树木（`npm run trees`），`tools/gen-iso-props.mjs` 负责场景构件（`npm run props`）。三个生成器零外部依赖、固定种子幂等，改完跑一次并用 `git diff` 确认产物字节一致。
- **新增构件贴图命名必须贴合候选链**：`<type>_<variant>.png` → `<type>.png`，房屋走 `house_4x4_<facing>[_<variant>].png`；`npm test [18]` 会展开五图逐条校验，缺图即失败。布局 JSON 不需要为新贴图改动。
- **文档分工**：目标/状态/进展 → **本文件**；详细流水账 → `PROGRESS.md`；功能与机制 → `docs/功能说明.md`；类型与接口 → `docs/接口说明.md`；操作与排障 → `docs/使用方式.md`。
- **交付**：每个阶段收尾先跑 `npm test` + `npm run build`，再推送并打 tag，最后更新本文件 front matter 的 `baseline_main` / `this_release`。
- **调试句柄**：DEV 构建下 `window.__shanhai`（state / playerPos / info / moveTo）。

---

## 6. 下一步任务队列（按优先级，均可直接开工）

| # | 任务 | 验收 |
| --- | --- | --- |
| 1 | ✅ ~~修掉 `modv2/*.py` 硬编码路径 + 补依赖与出图说明~~ | `v0.15.1` 完成：26 个脚本改用 `paths.py`，`requirements.txt` 与 7.1 节说明入库，`npm test [19]` 锁死 |
| 2 | ✅ ~~素材缺口清单 + 逐图补真实 PNG~~ | `v0.15.0` 已完成，`npm test [18]` 保证候选链零缺图；清单即 `tools/gen-iso-props.mjs` 顶部的 12 项 JOBS |
| 3 | **待用户拍板再下一阶段目标**（见 1.5 节）：出图管线是否全面迁 Node、性能预算、或转向 M4 联机预研 | 先落一项决策再动代码，避免继续自行推测 |
| 4 | ✅ ~~石桥 / 大殿瓦垄 / 晶石密度造型打磨~~ | `v0.15.1` 完成；`npm test [19]` 用 PNG 颜色复杂度锁住细节，`props_wild_heifeng_v016_bridge_cdp.png` 实拍确认拱桥与瓦垄可读 |
| 5 | 可选：洞天（`wild_shanxiao`）可见精灵最多，软件渲染下俯瞰截图偶发超时；真机 GPU 未见异常，若做性能预算可优先测这一图 | 1440×900 俯瞰截图稳定出图 + 帧时间记录 |

---

## 7. 本文件维护规则

- **每次推送前**更新 front matter：`updated` / `updated_at` / `baseline_main` / `this_release` / `tests` / `build`。
- **每个阶段结束**在第 2.1 节追加一行，并把第 1.2 节对应验收状态改为 ✅。
- 目标变更（尤其 1.3 长期约束与 1.4 非目标）必须先经用户确认再改。
- 本文件与代码**同提交、同 tag**，保证任一 checkout 自带对应版本的状态说明。

### 变更记录

| 版本 | 日期 | 内容 |
| --- | --- | --- |
| v1 / `v0.13.1` | 2026-11-10 | 创建：目标与验收、阶段进展时间线、素材状态专章、环境切换手册、`tools/gh-sync.mjs` 入库；修正 PROGRESS / README 过期口径 |
| v2 / `v0.13.2` | 2026-11-10 | 校正状态快照：写入推送后的真实基线 sha / tag / 文件数，避免自引用计数偏差 |
| v3 / `v0.14.0` | 2026-11-10 | 模块 13：云京道路净空与树木美术；状态快照推进到 69/69、971 文件 |
| v4 / `v0.15.0` | 2026-11-12 | 模块 14：四图构件素材补齐（12 张真实 PNG + `gen-iso-props.mjs`）；A1/A2/A3 全部达成；状态快照推进到 72/72、984 文件 / 792 PNG；任务队列换为待拍板项 |
| v5 / `v0.15.1` | 2026-11-12 | 模块 15：造型精修（拱桥券洞 / 双线瓦垄 / 五根晶柱）、洞天晶石分层、`modv2` 跨环境路径与依赖说明；新增 `[19]` 回归，状态快照推进到 75/75、986 文件 / 792 PNG；任务队列 1、4 标记完成 |
