---
doc: HANDOFF
schema: 1
updated: 2026-11-10
updated_at: "2026-11-10 19:55 +08:00"
repo: https://github.com/linemarsun/xiyou01
branch: main
baseline_main: ec859fec8ae4667f80f7ebf69391e120d2f1e108
baseline_tag: v0.13.1
this_release: v0.13.2
tests: 67/67
build: pass
repo_files: 968
repo_png: 778
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
| 现在到哪一步 | 五张等距地图「一景一制」已完成（v0.12.0）；远端 v0.13.0 起转向**真实宫城美术素材**，本阶段目标是把程序化占位逐步替换成真实 PNG |
| 基线 | 远端 `main = ec859fe` / 最新 tag `v0.13.2`（`v0.13.1` 引入本文件，`v0.13.0` 为宫城素材族） |
| 健康度 | `npm test` 67/67、`npm run build` 通过；968 个文件（含 778 张 PNG） |
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
| A1 | 五图（云京 / 青崖山道 / 渡忘川 / 玲珑洞天 / 地府）主构件均有真实 PNG，程序化占位退化为**缺图回退** | 浏览器 `?map=<id>` 逐图截图；`render/world-renderer.ts` 的占位分支不再命中主构件 | ⬜ 未开始 |
| A2 | 每图素材风格统一且彼此可区分，不退回「同一套模板」 | 五图地形/构件对比页 + `npm test` 主题差异断言 | ⬜ 未开始（布局层已由模块 12 锁住） |
| A3 | 新素材登记进 `core/iso.ts` 类型/候选与 `public/assets/art/iso/*.json` 布局，`npm run maps` 仍幂等 | 两次运行 `npm run maps` 后 `git diff` 为空；`npm test` 布局合法性断言 | ⬜ 未开始 |
| A4 | 不退化：`npm test` ≥ 67、`npm run build` 通过、五图可走、跨图出入口仍贴边界 | 第 4.3 节自检清单 | ✅ 当前满足 |
| A5 | 素材文件 + 出图脚本一并入仓，随提交打 tag | `node tools/gh-sync.mjs status` 与 `git tag` | ✅  tooling 已具备 |

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

1. **出图管线**：是否统一走 `assets_src/tools/modv2/*.py`（Python + Pillow / numpy）？其依赖清单与运行命令目前**没有文档**，且存在硬编码绝对路径（见 2.3 / 4.4）。
2. **替换优先级**：云京宫城 → 青崖山道 → 渡忘川 → 玲珑洞天 → 地府，还是按「玩家主线顺序」推进？
3. **素材由谁产出**：由 AI 生成 / 用户提供参考图 / 复用仓库已有 PNG？
4. **性能预算**：单图纹理数、单张 PNG 尺寸上限、是否需要图集（当前按视口裁剪逐件绘制）。

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
- **结论**：截至 `v0.13.0`，五图的主体表现仍是「布局 JSON + 程序化占位」，真实美术只覆盖了宫城素材族。这正是 G-NOW 的起点。
- ⚠️ **出图脚本有跨环境硬编码绝对路径**（换机器必踩）：`assets_src/tools/modv2/palace.py:23` 与 `widegate.py:19` 写死 `D:\workspace\game\xiyou01\shanhai\public\assets\art\iso`；另有 `calib.py:10`、`cityfill.py:25`、`ground.py:10`、`_shots.py:9` 指向其他本机目录。依赖为 Python + Pillow + numpy，仓库**暂无 `requirements.txt` / 运行说明**。

### 2.4 已修正的文档口径漂移

`PROGRESS.md` 原停在「61 项 / 2026-11-09 / 基线 55851ba」，与远端 `v0.13.0` 的 67 项不符；本次已同步。今后**状态快照只认本文件 front matter**，其他文档不得再写「当前测试数 / 当前基线」。

---

## 3. 当前状态快照

| 项 | 值 |
| --- | --- |
| 远端 `main` | `ec859fec8ae4667f80f7ebf69391e120d2f1e108`（`v0.13.1`，即 `v0.13.2` 的父提交）；`6cf599a` 为再上一版 |
| tags | `v0.12.0` → `55851ba`；`v0.13.0` → `6cf599a`；`v0.13.1` → `ec859fe`；`v0.13.2` → 本次提交 |
| 本地 git | 当前环境为 codeload 快照重建的独立根提交（与远端历史不连通）；`core.autocrlf=false` / `core.eol=lf`；网络放行后建议重新 clone |
| 测试 / 构建 | `npm test` 67/67；`npm run build`（`tsc --noEmit` + `vite build`）通过 |
| 文件规模 | 968 个，其中 778 张 PNG（`v0.13.0` 时为 966 个，交接文档与同步工具各 +1） |
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
npm test               # 期望 67/67
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
node tools/gh-sync.mjs push --apply --tag v0.13.3 -m "..." # 写入 main 并打附注 tag（换成新版本号）
```

- 凭据优先级：`GITHUB_TOKEN` / `GH_TOKEN` 环境变量 → `git credential fill`（本机为 Windows 凭据管理器）。令牌只进内存，不打印、不落盘。
- `push` 以**当前远端 main** 为父提交创建 tree/commit 并快进，保留完整历史；检测到「远端有、本地没有」的文件会**中止**，防止误删。
- ⚠️ 本机 `.git` 是 codeload 快照后 `git init` 重建的独立根提交，与远端历史**不连通**。`pull` 不会生成本地对应提交，因此**不要在这里用 `git push`**；网络放行后重新 `git clone` 一次即可回到常规工作流。

### 4.3 换环境自检清单（照顺序跑）

1. `node tools/gh-sync.mjs status` → 本地与远端 tree 是否一致、文档基线 `baseline_main` 是否对得上。
2. `npm test` → 67/67（低于此数说明代码或素材没拉全）。
3. `npm run build` → 通过。
4. `npm run dev` + `?play=1&map=<id>` 逐图看一眼；改过布局再跑一次 `npm run maps`，确认 `git diff` 为空（幂等）。
5. 对照本文件 front matter 的 `this_release` 与 `git tag`；若不一致，说明拿到的是旧文档。

### 4.4 换环境已知坑

| 坑 | 处理 |
| --- | --- |
| Python 出图脚本写死 `D:\workspace\...` 绝对路径 | 见 2.3；**尚未修复**，是 G-NOW 的第 1 个任务 |
| 无 Python 依赖清单 | 需补 `requirements.txt` 或 `assets_src/tools/modv2/README` |
| vite HMR 偶发吃掉同批多次编辑 | 硬刷新或重启 dev server |
| 无头浏览器截图首帧黑屏 / `window.__shanhai` 滞后一次导航 | 等 `visibleSprites`、双帧同步、独立标签页禁用缓存 |
| 工作区根目录的临时文件**不在仓库里** | `push-github.mjs`（旧版）、`shot.mjs`、`map-overview.*`、`chrome-*` profile 等均为本机临时产物，新环境不需要，也不应复制进去 |

---

## 5. 开发约定

- **分层**：`src/core/` 禁止 import DOM；`src/render/` PixiJS；`src/ui/` DOM。指令与事件全是可序列化纯对象。
- **随机**：战斗内走 `core/rng.ts`（mulberry32，种子化，可复现）；世界掉落用 `Math.random`。
- **数值**：全部集中在 `src/core/content.ts`，改完跑 `#sim` 看胜率。
- **地图**：改 `tools/gen-iso-maps.mjs` 后跑 `npm run maps`；布局 `grid` 必须与 `ISO_GRIDS[region]` 一致，`anchors` 必须与 `BASE_MAPS` 逐条一致，`npm test` 会锁住。
- **素材**：真实 PNG 优先，`isoModuleCandidates()` / `isoHouseCandidates()` 找不到才回退程序化占位；`tools/gen-assets.mjs` 负责像素素材，`npm run assets` 重建。
- **文档分工**：目标/状态/进展 → **本文件**；详细流水账 → `PROGRESS.md`；功能与机制 → `docs/功能说明.md`；类型与接口 → `docs/接口说明.md`；操作与排障 → `docs/使用方式.md`。
- **交付**：每个阶段收尾先跑 `npm test` + `npm run build`，再推送并打 tag，最后更新本文件 front matter 的 `baseline_main` / `this_release`。
- **调试句柄**：DEV 构建下 `window.__shanhai`（state / playerPos / info / moveTo）。

---

## 6. 下一步任务队列（按优先级，均可直接开工）

| # | 任务 | 验收 |
| --- | --- | --- |
| 1 | 修掉 `modv2/*.py` 的硬编码输出路径，改为相对仓库根 / 环境变量；补 Python 依赖与出图命令说明 | 在全新目录 clone 后可直接跑通出图脚本，产物落到 `public/assets/art/iso/` |
| 2 | 盘点五图「哪些构件仍是占位」，列一张真实素材缺口清单并按 1.5 节确认优先级 | 清单入仓，每图一行，标注目标 PNG 名与对应候选函数 |
| 3 | 按确认的优先级逐图补真实 PNG，登记 `iso.ts` 类型/候选与布局 JSON | 满足 A1 / A2 / A3；`?map=<id>` 截图逐图验收 |
| 4 | 每完成一图跑一次完整回归 + 构建，达标后推送并打 tag | 满足 A4 / A5；`PROGRESS.md` 追加交付记录，本文件 front matter 更新 |
| 5 | （待 1.5 节拍板后）M4 联机预研 | 先出服务端技术栈 / 协议范围决策，再动代码 |

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
