/**
 * 国风美术映射（纯数据，禁止 import DOM）。
 *
 * 素材来源：同仓库另一个工作区生成的「原创国风西游」引擎素材，
 * 统一放在 public/assets/art/（characters / portraits / backgrounds / icons / ui）。
 * 风格规范：国风 Q版 4.5 头身、深色描边 + 赛璐璐平涂、朱红/靛青/赭金/米白、云纹木框。
 *
 * 这里是「表现层映射表」，只决定哪个游戏实体用哪张图，不改任何玩法数值。
 * 参考素材没有动作序列帧、且场景为固定满幅不支持平铺，因此：
 *   - 战斗精灵帧动画、世界分块 tile 仍由 tools/gen-assets.mjs 程序化生成（调色板已统一到本文件主色）；
 *   - 真实素材用在 UI 组件、头像、图标与战斗满幅背景。
 */
export const ART_ROOT = '/assets/art';

/** 新素材契约（assets_v2）：精灵 `sprites/<id>/<anim>_<n>.png`（单帧 128×128 RGBA） */
export const SPRITE_ROOT = '/assets/sprites';
/** 世界地图区段：`art/maps/<region>_<n>.png`（1440×900 原生满幅） */
export const MAP_ART_DIR = 'maps';
/** 战斗背景：`art/battle/<region>.png`（1440×900 原生满幅） */
export const BATTLE_ART_DIR = 'battle';
/** 前景遮挡：`art/foreground/<region>_<n>.json` + 同目录贴图 */
export const FOREGROUND_ART_DIR = 'foreground';

/** 国风主色；CSS 与素材生成器共用同一套色值语义 */
export const ART_THEME = {
  vermilion: '#a63d2f',
  indigo: '#2f4a5c',
  ochreGold: '#b8892f',
  cream: '#f7f0dd',
  wood: '#3a2a20',
} as const;

/** 四门派 → 参考角色立绘/头像（按族属与题材对应，可按需替换） */
export const CLASS_ART: Record<string, { portrait: string; character: string }> = {
  xiake: { portrait: 'portraits/char_human_yunlan.png', character: 'characters/char_human_yunlan.png' },
  lingguan: { portrait: 'portraits/char_xian_shuanghua.png', character: 'characters/char_xian_shuanghua.png' },
  moshi: { portrait: 'portraits/char_mo_xuanjin.png', character: 'characters/char_mo_xuanjin.png' },
  wuzhu: { portrait: 'portraits/char_gui_mingxi.png', character: 'characters/char_gui_mingxi.png' },
};

/** 初始宠物 → 参考召唤兽（只有 2 张，青冥雷鸢复用白泽幼兽） */
export const PET_ART: Record<string, { portrait: string; character: string }> = {
  linghu: { portrait: 'portraits/pet_baize.png', character: 'characters/pet_baize.png' },
  yanjia: { portrait: 'portraits/pet_chiyan_lingsuan.png', character: 'characters/pet_chiyan_lingsuan.png' },
  leisun: { portrait: 'portraits/pet_baize.png', character: 'characters/pet_baize.png' },
};

/** 酒馆同伴 / 长老可用的额外立绘 */
export const EXTRA_CHARACTER_ART = {
  elder: 'portraits/char_yao_aheng.png',
  companion: 'portraits/char_yao_aheng.png',
} as const;

/** 战斗场景键 → 满幅国风背景（世界 tile 仍用程序化图，见 gen-assets.mjs） */
export const SCENE_ART: Record<string, string> = {
  default: 'backgrounds/bg_qingya_shandao.png',
  heifengling: 'backgrounds/bg_qingya_shandao.png',
  luanzanggang: 'backgrounds/bg_du_wangchuan.png',
  shanxiao: 'backgrounds/bg_linglong_dongtian.png',
  taoyuan: 'backgrounds/bg_yunjing.png',
  wild_heifeng: 'backgrounds/bg_qingya_shandao.png',
  wild_luanzang: 'backgrounds/bg_du_wangchuan.png',
  wild_shanxiao: 'backgrounds/bg_linglong_dongtian.png',
  difu: 'backgrounds/bg_du_wangchuan.png',
};

/**
 * 旧版世界背景（1024²）：仅作为新分段图缺位时的回退，渲染层已不再裁切/镜像。
 */
export const WORLD_TILE_ART: Record<string, string> = {
  taoyuan: 'backgrounds/bg_yunjing.png',
  wild_heifeng: 'backgrounds/bg_qingya_shandao.png',
  wild_luanzang: 'backgrounds/bg_du_wangchuan.png',
  wild_shanxiao: 'backgrounds/bg_linglong_dongtian.png',
};

export const UI_ART = {
  panel: 'ui/ui_panel_base.png',
  button: 'ui/ui_btn_normal.png',
  buttonActive: 'ui/ui_btn_active.png',
  divider: 'ui/ui_cloud_divider.png',
  frame: 'ui/ui_cloud_frame.png',
  hpBarBg: 'ui/ui_hp_bar_bg.png',
  hpBarFill: 'ui/ui_hp_bar_fill.png',
  skillSlot: 'ui/ui_skill_slot.png',
} as const;

/** 道具图标（战斗指令面板用） */
export const ITEM_ART: Record<'heal' | 'mana', string> = {
  heal: 'icons/icon_elixir_gourd.png',
  mana: 'icons/icon_azure_orb.png',
};

/** 其余图标，供背包/技能/任务等面板扩展使用 */
export const ICON_ART = {
  bambooScroll: 'icons/icon_bamboo_scroll.png',
  beastPill: 'icons/icon_beast_pill.png',
  bronzeBell: 'icons/icon_bronze_bell.png',
  cloudCharm: 'icons/icon_cloud_charm.png',
  jadeTalisman: 'icons/icon_jade_talisman.png',
  steelSword: 'icons/icon_steel_sword.png',
  whiteJade: 'icons/icon_white_jade.png',
} as const;

export function artUrl(file: string): string {
  return `${ART_ROOT}/${file}`;
}

/** 新契约：地图区段贴图（1440×900 原生，不裁切不缩放） */
export function mapArtUrl(region: string, seg: number): string {
  return artUrl(`${MAP_ART_DIR}/${region}_${seg}.png`);
}

/**
 * 等距构件：布局 JSON `art/iso/<region>.json`，模块贴图 `art/iso/<type>_<variant>.png`（缺省 `<type>.png`）。
 * 贴图锚点统一为足迹前底顶点 (0.5, 1.0)，尺寸按 64×32 菱形绘制。
 */
export function isoLayoutUrl(region: string): string {
  return artUrl(`iso/${region}.json`);
}

export function isoModuleUrl(type: string, variant?: string, facing?: string): string {
  const base = variant ? `${type}_${variant}` : type;
  return artUrl(`iso/${facing ? `${base}_${facing}` : base}.png`);
}

/**
 * 四向朝向的贴图候选（按优先级）：目标朝向 → sw 版本 → 无朝向旧图。
 * 带变体时先试 `<type>_<variant>_*`，再退回不带变体的 `<type>_*` / `<type>.png`，
 * 这样 `stall.png`、`gate_arch.png`、`tree_pine.png` 这类单图也能被直接命中。
 */
/** 无独立贴图的构件借用既有模块图（牌坊与城门同为三门石坊） */
export const ISO_MODULE_ALIAS: Record<string, string> = { paifang: 'gate_arch' };

/**
 * 双素材线命名分流：云京沿用本地工笔线贴图（iso/ 根目录），其余四图走 main
 * 手绘线版本（iso/hw/ 同名文件优先）。同名冲突文件在 hw/ 保留 main 版原素材，
 * 云京与其余地图互不覆盖；hw/ 缺图的构件自然回落 iso/ 根目录（两线一致的文件）。
 */
export const ISO_HW_MAPS = new Set(['wild_heifeng', 'wild_luanzang', 'wild_shanxiao', 'difu']);

export function isoModuleCandidates(type: string, variant?: string, facing?: string, mapId?: string): string[] {
  const base0 = ISO_MODULE_ALIAS[type] ?? type;
  const bases = variant ? [`${base0}_${variant}`, base0] : [base0];
  const out: string[] = [];
  for (const base of bases) {
    if (facing) {
      out.push(artUrl(`iso/${base}_${facing}.png`));
      if (facing !== 'sw') out.push(artUrl(`iso/${base}_sw.png`));
    }
    out.push(artUrl(`iso/${base}.png`));
  }
  if (mapId && ISO_HW_MAPS.has(mapId)) {
    const hw = out.map((u) => u.replace('/assets/art/iso/', '/assets/art/iso/hw/'));
    return [...hw, ...out];
  }
  return out;
}

/** 成套屋身贴图：`iso/house_4x4_<facing>[_<variant>].png`（檐口 z=170 / 正脊 z=210 已烘进图，
 * 锚点 = 足迹前底顶点，落地即与墙顶贴合，渲染层不再抬升）。
 * 四向 16 件均为真实几何（含 se 门脸变体），不再用水平镜像兜底；
 * ne/nw 的门在远侧墙、镜头不可见，变体无视觉差异（模块元数据 fallback=true），
 * 取图链直接落到 `<facing>` 基础屋身，避免缺图占位。
 */
const HOUSE_BACK_FACINGS = new Set(['ne', 'nw']);

export function isoHouseCandidates(facing?: string, variant?: string): string[] {
  const f = facing ?? 'sw';
  const out: string[] = [];
  if (variant && !HOUSE_BACK_FACINGS.has(f)) out.push(artUrl(`iso/house_4x4_${f}_${variant}.png`));
  out.push(artUrl(`iso/house_4x4_${f}.png`));
  return out;
}

/** 旧版单张地图名回退（`<region>.png`），用于新分段图未到位时 */
export function mapArtLegacyUrl(region: string): string {
  return artUrl(`${MAP_ART_DIR}/${region}.png`);
}

/** 新契约：战斗背景（1440×900 原生） */
export function battleArtUrl(region: string): string {
  return artUrl(`${BATTLE_ART_DIR}/${region}.png`);
}

/** 新契约：前景遮挡物件清单（相对 public/assets，fetch 用） */
export function foregroundJsonUrl(region: string, seg: number): string {
  return artUrl(`${FOREGROUND_ART_DIR}/${region}_${seg}.json`);
}

/** 前景贴图相对路径 → 实际 URL（允许 JSON 里写 `foreground/xxx.png` 或 `art/foreground/xxx.png`） */
export function foregroundImageUrl(file: string): string {
  if (/^(https?:)?\//.test(file)) return file;
  if (file.startsWith('art/')) return `/assets/${file}`;
  return artUrl(`${FOREGROUND_ART_DIR}/${file}`);
}

/** 供回归自检使用：所有被引用的素材文件（相对 public/assets/art/） */
export function allArtFiles(): string[] {
  return [
    ...Object.values(CLASS_ART).flatMap((v) => [v.portrait, v.character]),
    ...Object.values(PET_ART).flatMap((v) => [v.portrait, v.character]),
    ...Object.values(EXTRA_CHARACTER_ART),
    ...Object.values(SCENE_ART),
    ...Object.values(WORLD_TILE_ART),
    ...Object.values(UI_ART),
    ...Object.values(ITEM_ART),
    ...Object.values(ICON_ART),
  ];
}
