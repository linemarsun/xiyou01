/**
 * 等距（2:1 菱形）构件合成的数据层。
 *
 * 坐标约定：
 * - 格 (gx, gy) 的菱形中心 = (ox + (gx-gy)*tileW/2, oy + (gx+gy)*tileH/2)
 * - 所有构件贴图锚点统一为足迹「前底顶点」(0.5, 1.0)，即足迹最前方格的菱形下顶点
 * - 深度排序基准 = 该锚点的世界 y
 */

export interface IsoGrid {
  cols: number;
  rows: number;
  /** 菱形宽（默认 64） */
  tileW: number;
  /** 菱形高（默认 32，2:1） */
  tileH: number;
  /** 格 (0,0) 菱形中心的世界坐标偏移 */
  ox: number;
  oy: number;
}

/** 构件四向朝向：ne/se/sw/nw（贴图取 `<type>[_<variant>]_<facing>.png`） */
export type IsoFacing = 'ne' | 'se' | 'sw' | 'nw';

export const ISO_FACINGS: readonly IsoFacing[] = ['ne', 'se', 'sw', 'nw'];

export function isIsoFacing(v: unknown): v is IsoFacing {
  return typeof v === 'string' && (ISO_FACINGS as readonly string[]).includes(v);
}

export interface IsoItem {
  type: string;
  gx: number;
  gy: number;
  /** 足迹宽（格），缺省取类型定义 */
  w?: number;
  /** 足迹深（格），缺省取类型定义 */
  h?: number;
  /** 可选变体：贴图取 `<type>_<variant>.png`，缺省 `<type>.png` */
  variant?: string;
  /** 可选朝向：贴图取 `<type>[_<variant>]_<facing>.png`，缺对应朝向时回退到 sw */
  facing?: IsoFacing;
  /**
   * 可选分坊着色（0xRRGGBB）。渲染层对精灵/占位容器整体做乘法 tint，
   * 用于俯瞰时区分市集/宅院/庙署/园林四坊的瓦色与墙色（不改美术原图）。
   */
  tint?: number;
}

/**
 * 沿街自动填房（可选便利逻辑，逐条手写的 items 仍然保留）。
 * `from`/`to` 是街道「中心线」的两个端点格；起止必须同行（横街）或同列（纵街）。
 * facing 同时决定贴图朝向与贴哪一侧：
 *   - 横街：朝南（facing 以 s 开头）→ 北侧；朝北 → 南侧
 *   - 纵街：朝东（facing 以 e 结尾）→ 西侧；朝西 → 东侧
 */
export interface IsoStreetFill {
  from: [number, number];
  to: [number, number];
  facing: IsoFacing;
  /** 显式指定贴哪一侧，缺省按 facing 推导 */
  side?: 'north' | 'south' | 'west' | 'east';
  /** 街宽（格），缺省取 rules.streetWidth（再缺省 5） */
  width?: number;
  /** 房屋与街沿之间的额外空档（格，默认 1） */
  clearance?: number;
  /** 沿街步长（格，默认 4） */
  step?: number;
  /** 垂直街方向的排数（默认 2） */
  rows?: number;
  /** 排间距（格，默认 3） */
  rowStep?: number;
  /** 构件类型（默认 house） */
  type?: string;
  /** 固定变体（与 variants 二选一） */
  variant?: string;
  /** 沿街轮换的变体，默认 ['wood','stone'] */
  variants?: string[];
  /** 足迹宽/深（格），缺省取类型定义 */
  w?: number;
  h?: number;
}

export interface IsoRules {
  /** 主街宽（格） */
  streetWidth?: number;
  /** 约定：房屋前底顶点与街道中心线的最小格距（回归自检用，渲染层不额外裁剪） */
  houseClearanceFromStreetCenter?: number;
  /**
   * 屋面兜底抬升（px）。默认 0：美术成套屋身已把檐口 z=170 / 正脊 z=210 烘进图，
   * 落地即贴合墙顶；只有旧构件缺少标高信息时才把它配成 170 补缝。
   */
  roofLift?: number;
  /** 沿街自动填房规则（可选） */
  streetFill?: IsoStreetFill[];
}

export interface IsoLayout {
  grid: IsoGrid;
  rules?: IsoRules;
  items: IsoItem[];
}

interface IsoTypeDef {
  w: number;
  h: number;
  /** ground_* 为地面，不参与遮挡/碰撞 */
  ground?: boolean;
  /** 占位盒子的墙体高度（px） */
  height?: number;
}

/**
 * 已支持的构件类型；新类型未登记时按 1×1 处理。
 * 足迹与美术交付的模块元数据（assets_v2/modules/*.json）一致：
 * 屋身 4×4（两面墙各 4 格 + 双坡屋面各 2 格 + 屋脊 1 格）。
 */
export const ISO_TYPES: Record<string, IsoTypeDef> = {
  ground_grass: { w: 1, h: 1, ground: true },
  ground_stone: { w: 1, h: 1, ground: true },
  ground_dirt: { w: 1, h: 1, ground: true },
  /** 水面：地面的一种，但不可行走（石桥的桥面格例外，见 buildCollision） */
  ground_water: { w: 1, h: 1, ground: true },
  house: { w: 4, h: 4, height: 190 },
  /** 大档建筑：跨 3~4 格的两层楼阁/大宅（层高抬到 280，暂无美术，走程序化占位盒） */
  house_large: { w: 4, h: 4, height: 280 },
  /** 小档建筑：单间铺面/偏房（跨 2 格） */
  shop_small: { w: 2, h: 2, height: 150 },
  /** 庙署正殿等大体量建筑（暂无美术，走程序化占位盒） */
  hall: { w: 6, h: 6, height: 260 },
  /** 城墙直段（可复用，沿 gx 或 gy 拉长；垛口由渲染层按长度重复） */
  city_wall: { w: 1, h: 1, height: 120 },
  /** 城墙转角（单独构件） */
  wall_corner: { w: 2, h: 2, height: 140 },
  /** 美术城墙直段（u = 沿 gx 铺 6 格 / 2 格，厚 2 格；马道 200 / 垛口 224） */
  city_wall_u6: { w: 6, h: 2, height: 224 },
  city_wall_u2: { w: 2, h: 2, height: 224 },
  /** 美术城墙直段（v = 沿 gy 铺 6 格 / 2 格，厚 2 格） */
  city_wall_v6: { w: 2, h: 6, height: 224 },
  city_wall_v2: { w: 2, h: 2, height: 224 },
  /** 美术转角角台 2×2（女墙 232，四方位通用） */
  city_wall_corner: { w: 2, h: 2, height: 232 },
  /** 美术城门楼 4×3：城台 + 券门洞 + 重檐城楼（正脊 406，全城最高） */
  city_gate_tower: { w: 4, h: 3, height: 406 },
  /** 全城制高点：中心鼓楼（三层重檐，7×7 足迹，底层券门可穿） */
  bell_tower: { w: 7, h: 7, height: 460 },
  /** 市集货箱 / 庙前石碑 */
  crate: { w: 1, h: 1, height: 44 },
  stele: { w: 1, h: 2, height: 90 },
  gate_arch: { w: 3, h: 3, height: 222 },
  /** 牌坊：复用城门贴图（art.isoModuleCandidates 里做别名） */
  paifang: { w: 3, h: 3, height: 222 },
  tree: { w: 1, h: 1, height: 186 },
  stall: { w: 2, h: 2, height: 108 },
  fence: { w: 2, h: 1, height: 44 },
  stairs: { w: 3, h: 1, height: 30 },
  lantern_post: { w: 1, h: 1, height: 150 },
  /** 石桥：跨水面，桥面格全部可走 */
  bridge: { w: 3, h: 5, height: 26 },
  /** 水井 / 香炉 / 山石：点状地标 */
  well: { w: 1, h: 1, height: 74 },
  incense: { w: 1, h: 1, height: 96 },
  rock: { w: 1, h: 1, height: 44 },
};

/**
 * 非正方足迹贴图的落点偏差（px）：sp 位置需减去该值，才能把美术导出的
 * 「足迹前底顶点」(anchor_px) 对到世界落点。数值取自 assets_v2/modules/*.json：
 * ax = anchor_px.x - spriteW/2，ay = anchor_px.y - spriteH。
 */
export const ISO_ANCHOR_OFFSET: Record<string, { ax: number; ay: number }> = {
  city_wall_u6: { ax: 64, ay: -5 },
  city_wall_u2: { ax: 0, ay: -5 },
  city_wall_v6: { ax: -64, ay: -5 },
  city_wall_v2: { ax: 0, ay: -5 },
  city_wall_corner: { ax: 0, ay: -6 },
  city_gate_tower: { ax: 15.5, ay: -5 },
  // 7×7 鼓楼：anchor_px [229,602] - (spriteW/2, spriteH) = (0, -4)，画布底比足迹前底顶点低 4px
  bell_tower: { ax: 0, ay: -4 },
};

export function isoSize(item: IsoItem): { w: number; h: number } {
  const d = ISO_TYPES[item.type];
  return { w: item.w ?? d?.w ?? 1, h: item.h ?? d?.h ?? 1 };
}

export function isGroundType(type: string): boolean {
  return !!ISO_TYPES[type]?.ground;
}

/** 格中心的世界坐标 */
export function cellToWorld(g: IsoGrid, gx: number, gy: number): { x: number; y: number } {
  return {
    x: g.ox + (gx - gy) * (g.tileW / 2),
    y: g.oy + (gx + gy) * (g.tileH / 2),
  };
}

/** 世界坐标 → 所在菱形格（2:1 菱形按四边等距划分，四舍五入即可） */
export function cellAt(g: IsoGrid, x: number, y: number): { gx: number; gy: number } {
  const u = (x - g.ox) / (g.tileW / 2);
  const v = (y - g.oy) / (g.tileH / 2);
  return { gx: Math.round((u + v) / 2), gy: Math.round((v - u) / 2) };
}

/** 足迹前底顶点（贴图锚点 / 深度排序基准） */
export function frontVertex(g: IsoGrid, item: IsoItem): { x: number; y: number } {
  const { w, h } = isoSize(item);
  const c = cellToWorld(g, item.gx + w - 1, item.gy + h - 1);
  return { x: c.x, y: c.y + g.tileH / 2 };
}

/** gate_arch 的拱洞格（足迹中间那一格，可穿行） */
export function archCell(item: IsoItem): { gx: number; gy: number } {
  const { w, h } = isoSize(item);
  return { gx: item.gx + Math.floor(w / 2), gy: item.gy + Math.floor(h / 2) };
}

/**
 * 拱洞通道：中列 + 中行（十字），3×3 城门南北/东西都能穿过。
 * 南北门用中列，东西门靠中行走通城墙开口。
 */
export function archLane(item: IsoItem): Array<{ gx: number; gy: number }> {
  const { w, h } = isoSize(item);
  const cx = item.gx + Math.floor(w / 2);
  const cy = item.gy + Math.floor(h / 2);
  const out: Array<{ gx: number; gy: number }> = [];
  for (let dy = 0; dy < h; dy++) out.push({ gx: cx, gy: item.gy + dy });
  for (let dx = 0; dx < w; dx++) {
    if (dx !== Math.floor(w / 2)) out.push({ gx: item.gx + dx, gy: cy });
  }
  return out;
}

/** 城门楼券门通道：4 宽足迹中间两列为可走（券门半宽 0.92 格 ≈ 2 格净宽） */
export function gateTowerLane(item: IsoItem): Array<{ gx: number; gy: number }> {
  const { w, h } = isoSize(item);
  const x0 = item.gx + Math.floor((w - 2) / 2);
  const out: Array<{ gx: number; gy: number }> = [];
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < 2; dx++) out.push({ gx: x0 + dx, gy: item.gy + dy });
  return out;
}

/**
 * 鼓楼底层券门：7×7 足迹正中 3×3 格可穿行（南北、东西两条券洞交汇于中心）。
 * 取中间三格而非两格：中线 = gx+3.5 与足迹几何中心重合，美术券洞（净宽 54px ≈ 0.84 格）居中无偏置。
 */
export function bellTowerLane(item: IsoItem): Array<{ gx: number; gy: number }> {
  const { w, h } = isoSize(item);
  const x0 = item.gx + Math.floor((w - 3) / 2);
  const y0 = item.gy + Math.floor((h - 3) / 2);
  const out: Array<{ gx: number; gy: number }> = [];
  for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) out.push({ gx: x0 + dx, gy: y0 + dy });
  return out;
}

/** 鼓楼券门可走的四向通道（3 格宽，从中心券洞直通足迹边缘，方便角色穿楼而过） */
export function bellTowerPassage(item: IsoItem): Array<{ gx: number; gy: number }> {
  const { w, h } = isoSize(item);
  const cx = item.gx + Math.floor((w - 3) / 2);
  const cy = item.gy + Math.floor((h - 3) / 2);
  const out: Array<{ gx: number; gy: number }> = [];
  for (let dx = 0; dx < w; dx++) for (let d = 0; d < 3; d++) out.push({ gx: item.gx + dx, gy: cy + d });
  for (let dy = 0; dy < h; dy++) for (let d = 0; d < 3; d++) out.push({ gx: cx + d, gy: item.gy + dy });
  return out;
}

/** 组合式房屋的子构件（相对足迹前底顶点的像素偏移；全部锚定在各自足迹近角） */
export interface IsoPiece {
  type: string;
  facing: IsoFacing;
  dx: number;
  dy: number;
  /** 组内绘制顺序（小在前） */
  order: number;
}

const PIECE_HALF_W = 32; // 1 格 = 64×32，半个菱形
/** 成套屋身的标高（美术 housebuild.py 烘焙时烘进图里：檐口 = 墙高 170，正脊 210） */
export const ROOF_EAVE_Z = 170;
export const ROOF_RIDGE_Z = 210;

/**
 * 各构件贴图锚点相对「精灵底边中点」的偏移 = (anchor_px - (spriteW/2, spriteH))。
 * 取自美术模块元数据（assets_v2/modules/*.json）；缺项按 0 处理。
 * 渲染层用 anchor(0.5,1) 落地，再叠加这里的偏差即可与美术合成位一致。
 */
const PIECE_ANCHOR: Record<string, { ax: number; ay: number }> = {
  wall_wood_sw: { ax: 0, ay: 0 },
  wall_wood_se: { ax: 0, ay: 0 },
  roof_slope_sw: { ax: 34, ay: -10 },
  roof_slope_ne: { ax: 93, ay: -4 },
  roof_slope_se: { ax: -35, ay: -10 },
  roof_slope_nw: { ax: -94, ay: -4 },
  roof_ridge_sw: { ax: 48, ay: -6 },
  roof_ridge_se: { ax: -49, ay: -6 },
  roof_gable_se: { ax: -63.5, ay: -11 },
  roof_gable_sw: { ax: 62.5, ay: -11 },
};

/**
 * 组合式房屋的子构件（相对足迹前底顶点的像素偏移；全部锚定在各自足迹近角）。
 * `lift` 是旧构件缺标高时的兜底抬升（布局 rules.roofLift），默认 0 = 按美术标高直接叠放。
 */
export function housePieces(item: IsoItem, lift = 0): IsoPiece[] {
  const facing = item.facing ?? 'sw';
  const alongU = facing === 'sw' || facing === 'ne';
  // 脊线沿 gx（sw/ne）→ 前坡 sw / 后坡 ne；沿 gy（se/nw）→ 前坡 se / 后坡 nw
  const roofFacing: IsoFacing = alongU ? 'sw' : 'se';
  const backFacing: IsoFacing = alongU ? 'ne' : 'nw';
  const nearGable: IsoFacing = alongU ? 'se' : 'sw';
  const farGable: IsoFacing = alongU ? 'sw' : 'se';
  // 与美术成套屋身同源的格位（sw 版；se/nw 为屏幕水平镜像，(du,dv) → (dv,du)）
  const back = alongU ? { du: 0, dv: -4 } : { du: -4, dv: 0 };
  const ridge = alongU ? { du: 0, dv: -1.5 } : { du: -1.5, dv: 0 };
  const near = { du: 0, dv: 0 };
  const far = alongU ? { du: -4, dv: 0 } : { du: 0, dv: -4 };

  const piece = (
    type: string, f: IsoFacing, cell: { du: number; dv: number }, z: number, order: number,
  ): IsoPiece => {
    const key = `${type}_${f}`;
    const a = PIECE_ANCHOR[key] ?? { ax: 0, ay: 0 };
    return {
      type, facing: f, order,
      dx: (cell.du - cell.dv) * PIECE_HALF_W - a.ax,
      dy: (cell.du + cell.dv) * 16 - z - a.ay - lift,
    };
  };

  return [
    { type: 'wall_wood', facing: 'sw', dx: 0, dy: 0, order: 0 },
    { type: 'wall_wood', facing: 'se', dx: 0, dy: 0, order: 1 },
    piece('roof_slope', backFacing, back, ROOF_EAVE_Z, 2),
    piece('roof_gable', farGable, far, ROOF_EAVE_Z, 3),
    piece('roof_gable', nearGable, near, ROOF_EAVE_Z, 4),
    piece('roof_slope', roofFacing, near, ROOF_EAVE_Z, 5),
    piece('roof_ridge', roofFacing, ridge, ROOF_RIDGE_Z, 6),
  ];
}

export function keyOf(gx: number, gy: number): string {
  return `${gx},${gy}`;
}

export interface IsoCollision {
  /** 有地面覆盖的格（可走的前提） */
  ground: Set<string>;
  /** 被构件足迹占用的格（不可走） */
  blocked: Set<string>;
}

/** 构件足迹覆盖的所有格 */
export function itemCells(item: IsoItem): Array<{ gx: number; gy: number }> {
  const { w, h } = isoSize(item);
  const out: Array<{ gx: number; gy: number }> = [];
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) out.push({ gx: item.gx + dx, gy: item.gy + dy });
  }
  return out;
}

/**
 * 由布局推导碰撞与地面：地面格可走，构件足迹格不可走。
 * 例外：gate_arch 拱洞中列、bridge 桥面全部格可穿行；ground_water 是地面但不可走。
 */
export function buildCollision(layout: IsoLayout): IsoCollision {
  const ground = new Set<string>();
  const blocked = new Set<string>();
  /** 拱洞 / 桥面等可穿行格：最后统一从 blocked 里剔除（可覆盖下方水面的不可走标记） */
  const passable = new Set<string>();
  for (const item of layout.items) {
    const cells = itemCells(item);
    if (isGroundType(item.type)) {
      for (const c of cells) {
        const k = keyOf(c.gx, c.gy);
        ground.add(k);
        if (item.type === 'ground_water') blocked.add(k); // 水面不可走
      }
      continue;
    }
    const lane = new Set<string>(
      item.type === 'gate_arch' || item.type === 'paifang'
        ? archLane(item).map((c) => keyOf(c.gx, c.gy))
        : item.type === 'city_gate_tower'
          ? gateTowerLane(item).map((c) => keyOf(c.gx, c.gy))
          : item.type === 'bell_tower'
            ? bellTowerPassage(item).map((c) => keyOf(c.gx, c.gy))
            : item.type === 'bridge'
            ? cells.map((c) => keyOf(c.gx, c.gy))
            : [],
    );
    for (const c of cells) {
      const k = keyOf(c.gx, c.gy);
      if (lane.has(k)) {
        ground.add(k); // 拱洞通道 / 桥面可穿行
        passable.add(k);
        continue;
      }
      blocked.add(k);
    }
  }
  for (const k of passable) blocked.delete(k);
  return { ground, blocked };
}

/** 世界坐标是否可走：格在网格内、有地面、且未被建筑/树木/摊位占用 */
export function isoWalkable(col: IsoCollision, g: IsoGrid, x: number, y: number): boolean {
  const { gx, gy } = cellAt(g, x, y);
  if (gx < 0 || gy < 0 || gx >= g.cols || gy >= g.rows) return false;
  const k = keyOf(gx, gy);
  return col.ground.has(k) && !col.blocked.has(k);
}

function cellWalkable(col: IsoCollision, g: IsoGrid, gx: number, gy: number): boolean {
  if (gx < 0 || gy < 0 || gx >= g.cols || gy >= g.rows) return false;
  const k = keyOf(gx, gy);
  return col.ground.has(k) && !col.blocked.has(k);
}

/** 落在障碍里/网格外的目标：环形向外找最近的可走格（点击楼顶也能落到楼边） */
export function nearestWalkableCell(
  col: IsoCollision, g: IsoGrid, gx: number, gy: number, maxRadius = 12,
): { gx: number; gy: number } | null {
  if (cellWalkable(col, g, gx, gy)) return { gx, gy };
  for (let r = 1; r <= maxRadius; r++) {
    let best: { gx: number; gy: number } | null = null;
    let bestD = Infinity;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const cx = gx + dx;
        const cy = gy + dy;
        if (!cellWalkable(col, g, cx, cy)) continue;
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = { gx: cx, gy: cy }; }
      }
    }
    if (best) return best;
  }
  return null;
}

/** 两点间的世界直线是否全程可走（每 step 像素采样一次，用于拉直 A* 折线） */
export function isoLineWalkable(
  col: IsoCollision, g: IsoGrid, x0: number, y0: number, x1: number, y1: number, step = 6,
): boolean {
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(1, Math.ceil(dist / step));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    if (!isoWalkable(col, g, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return false;
  }
  return true;
}

/**
 * 格级 BFS 寻路（4 邻接，等权 → 最短步数）。
 * 返回 [起点之后 … 目标] 的格序列；不可达返回 null。
 * 4 邻接在等距投影里正好是沿街的四个对角方向，走出来的折线天然贴着街道。
 */
export function findIsoPath(
  col: IsoCollision, g: IsoGrid, from: { gx: number; gy: number }, to: { gx: number; gy: number },
): Array<{ gx: number; gy: number }> | null {
  if (!cellWalkable(col, g, from.gx, from.gy) || !cellWalkable(col, g, to.gx, to.gy)) return null;
  const startKey = keyOf(from.gx, from.gy);
  const goalKey = keyOf(to.gx, to.gy);
  if (startKey === goalKey) return [];

  const parent = new Map<string, string>();
  const seen = new Set<string>([startKey]);
  const queue: Array<{ gx: number; gy: number }> = [from];
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    for (const [nx, ny] of [
      [cur.gx + 1, cur.gy], [cur.gx - 1, cur.gy], [cur.gx, cur.gy + 1], [cur.gx, cur.gy - 1],
    ]) {
      const nk = keyOf(nx, ny);
      if (seen.has(nk) || !cellWalkable(col, g, nx, ny)) continue;
      seen.add(nk);
      parent.set(nk, keyOf(cur.gx, cur.gy));
      if (nk === goalKey) {
        const out: Array<{ gx: number; gy: number }> = [];
        let k = nk;
        while (k !== startKey) {
          const [px, py] = k.split(',').map(Number);
          out.push({ gx: px, gy: py });
          k = parent.get(k) ?? startKey;
        }
        return out.reverse();
      }
      queue.push({ gx: nx, gy: ny });
    }
  }
  return null;
}

/** 折线拉直：删除可从当前点直线走到更远点的中间格，避免逐格顿挫 */
export function simplifyIsoPath(
  col: IsoCollision, g: IsoGrid, cells: Array<{ gx: number; gy: number }>,
): Array<{ gx: number; gy: number }> {
  if (cells.length <= 2) return cells;
  const out: Array<{ gx: number; gy: number }> = [cells[0]];
  let i = 0;
  while (i < cells.length - 1) {
    let j = cells.length - 1;
    for (; j > i + 1; j--) {
      const a = cellToWorld(g, cells[i].gx, cells[i].gy);
      const b = cellToWorld(g, cells[j].gx, cells[j].gy);
      if (isoLineWalkable(col, g, a.x, a.y, b.x, b.y)) break;
    }
    out.push(cells[j]);
    i = j;
  }
  return out;
}

/** 把一块世界矩形转成格范围（视口裁剪用） */
export function cellRange(
  g: IsoGrid, x0: number, y0: number, x1: number, y1: number,
): { c0: number; c1: number; r0: number; r1: number } {
  const pts = [
    cellAt(g, x0, y0), cellAt(g, x1, y0), cellAt(g, x0, y1), cellAt(g, x1, y1),
  ];
  const gxs = pts.map((p) => p.gx);
  const gys = pts.map((p) => p.gy);
  return {
    c0: Math.min(...gxs), c1: Math.max(...gxs),
    r0: Math.min(...gys), r1: Math.max(...gys),
  };
}

/**
 * 足迹底面的等距多边形（局部坐标，前底顶点为原点）。
 * 用于程序化占位盒子：先画底面，再挤出左右墙，最后盖上顶面。
 */
export function footprintPolygon(g: IsoGrid, item: IsoItem): number[] {
  const { w, h } = isoSize(item);
  const hw = g.tileW / 2;
  const hh = g.tileH / 2;
  const corners = [
    { x: 0, y: -hh },                      // 后
    { x: w * hw, y: (w - 1) * hh },        // 右
    { x: (w - h) * hw, y: (w + h - 1) * hh }, // 前
    { x: -h * hw, y: (h - 1) * hh },       // 左
  ];
  const fx = (w - h) * hw;
  const fy = (w + h - 1) * hh; // 前底顶点
  const out: number[] = [];
  for (const p of corners) out.push(p.x - fx, p.y - fy);
  return out;
}

/**
 * 展开布局：把 `rules.streetFill` 的沿街自动填房结果并入 items。
 * 纯函数、可重复调用；只往「草地」上填，街道/广场/院落与已有构件一律跳过，
 * 因此手写条目的优先级始终高于自动填房。
 */
/** 只能作为屋身/城墙部件拼接、不允许单独摆放的图（单独出现即视为布局错误） */
const COMPONENT_ONLY_TYPES = /^(wall_plaster|wall_wood)/;

export function expandLayout(layout: IsoLayout): IsoLayout {
  for (const item of layout.items) {
    if (COMPONENT_ONLY_TYPES.test(item.type)) {
      throw new Error(`布局错误：${item.type} 是屋身/城墙部件，不能单独摆放（${item.gx},${item.gy}）`);
    }
  }
  const fills = layout.rules?.streetFill;
  if (!fills || fills.length === 0) return layout;

  const g = layout.grid;
  const groundType = new Map<string, string>();
  const occupied = new Set<string>();
  for (const item of layout.items) {
    const { w, h } = isoSize(item);
    if (isGroundType(item.type)) {
      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) groundType.set(keyOf(item.gx + dx, item.gy + dy), item.type);
      }
    } else {
      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) occupied.add(keyOf(item.gx + dx, item.gy + dy));
      }
    }
  }

  const out = [...layout.items];
  const streetWidth = layout.rules?.streetWidth ?? 5;

  for (const rule of fills) {
    const type = rule.type ?? 'house';
    const def = ISO_TYPES[type];
    const w = rule.w ?? def?.w ?? 1;
    const h = rule.h ?? def?.h ?? 1;
    const horizontal = rule.from[1] === rule.to[1];
    if (!horizontal && rule.from[0] !== rule.to[0]) continue; // 起止必须同行或同列
    const center = horizontal ? rule.from[1] : rule.from[0];
    const a0 = horizontal ? rule.from[0] : rule.from[1];
    const a1 = horizontal ? rule.to[0] : rule.to[1];
    const lo = Math.min(a0, a1);
    const hi = Math.max(a0, a1);

    const half = Math.floor((rule.width ?? streetWidth) / 2);
    const clearance = rule.clearance ?? 1;
    /** 最近一排房屋与中心线的格距（默认 5 格街 + 1 格空档 → 4） */
    const near = half + 1 + clearance;
    const step = rule.step ?? 4;
    const rows = rule.rows ?? 2;
    const rowStep = rule.rowStep ?? 3;
    const side: 'north' | 'south' | 'west' | 'east' = rule.side ?? (horizontal
      ? (rule.facing.startsWith('s') ? 'north' : 'south')
      : (rule.facing.endsWith('e') ? 'west' : 'east'));
    const variants = rule.variant ? [] : (rule.variants ?? []);

    const alongSize = horizontal ? w : h;
    const span = hi - lo + 1;
    if (span < alongSize) continue;
    const slots = Math.floor((span - alongSize) / step) + 1;

    for (let r = 0; r < rows; r++) {
      const shift = r * rowStep;
      for (let i = 0; i < slots; i++) {
        const along = lo + i * step;
        let gx: number;
        let gy: number;
        if (horizontal) {
          gx = along;
          gy = side === 'north' ? center - near - shift - h + 1 : center + near + shift;
        } else {
          gy = along;
          gx = side === 'west' ? center - near - shift - w + 1 : center + near + shift;
        }

        // 只往草地填：足迹与四邻都不得压到石街，保证沿街拐角也留出 1 格街沿
        let placeable = true;
        for (let dy = 0; dy < h && placeable; dy++) {
          for (let dx = 0; dx < w; dx++) {
            const cx = gx + dx;
            const cy = gy + dy;
            if (cx < 0 || cy < 0 || cx >= g.cols || cy >= g.rows) { placeable = false; break; }
            const k = keyOf(cx, cy);
            if (groundType.get(k) !== 'ground_grass' || occupied.has(k)) { placeable = false; break; }
            if (groundType.get(keyOf(cx - 1, cy)) === 'ground_stone'
              || groundType.get(keyOf(cx + 1, cy)) === 'ground_stone'
              || groundType.get(keyOf(cx, cy - 1)) === 'ground_stone'
              || groundType.get(keyOf(cx, cy + 1)) === 'ground_stone') { placeable = false; break; }
          }
        }
        if (!placeable) continue;

        const variant = variants.length > 0 ? variants[i % variants.length] : rule.variant;
        const item: IsoItem = { type, variant, gx, gy, w, h, facing: rule.facing };
        out.push(item);
        for (let dy = 0; dy < h; dy++) {
          for (let dx = 0; dx < w; dx++) occupied.add(keyOf(gx + dx, gy + dy));
        }
      }
    }
  }

  return { ...layout, items: out };
}
