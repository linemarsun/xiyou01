/**
 * 全链回归自检（Node 侧，无需浏览器）。
 * 用 esbuild 把 src/core/ 打成 ESM 后直接在 Node 里跑，覆盖：
 *   任务链三环 / 战斗结算 / 存档迁移 / 成长与装备 / 师门 / 召唤兽 /
 *   战斗可复现性 / 捕捉规则 / 素材清单契约 / 装备补全 / 炼妖 / 组队同伴 /
 *   音频事件映射与 BGM 常量 / 寻路规划 / 挂机决策 / 等距地图与素材清单 /
 *   国风美术映射与素材文件完整性 / 世界观文案统一 / 国风地图与悬赏榜数据 /
 *   一景一制（独立格网、边界出入口、专属路网、全锚点 BFS 连通、主题区分）/
 *   等距 A* 寻路 / 跨图落点「落地即弹回」保护。
 * 运行：npm test   （新增玩法模块时请在本文件补对应断言）
 */
import { build } from 'esbuild';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// ---- localStorage 替身（core/world.ts 的存档依赖） ----
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};

// ---- 打包 core/ 为可在 Node 里 import 的 ESM ----
const entry = [
  './src/core/world.ts', './src/core/battle.ts', './src/core/content.ts',
  './src/core/types.ts', './src/core/equipment.ts', './src/core/skill.ts',
  './src/core/ai.ts', './src/core/rng.ts', './src/core/sim.ts',
  './src/core/audio-map.ts', './src/core/path.ts', './src/core/autoplay.ts',
  './src/core/art.ts', './src/core/iso.ts', './src/core/iso-path.ts',
].map((p, i) => `export * as m${i} from '${p}';`).join('\n');

const bundled = await build({
  stdin: { contents: entry, resolveDir: ROOT, loader: 'ts' },
  bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent',
});
const code = bundled.outputFiles[0].text;
const mod = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const [world, battle, content, types, equipment, skill, ai, rng, sim, audiomap, pathutil, autoplay, art, iso, isopath] =
  [mod.m0, mod.m1, mod.m2, mod.m3, mod.m4, mod.m5, mod.m6, mod.m7, mod.m8, mod.m9, mod.m10, mod.m11, mod.m12, mod.m13, mod.m14];

// ---- 迷你测试框架 ----
let passed = 0;
const failures = [];
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (e) {
    failures.push({ name, message: e?.message ?? String(e) });
    console.log(`  \x1b[31m✗\x1b[0m ${name}\n      ${e?.message ?? e}`);
  }
}
function ok(cond, msg = '断言失败') { if (!cond) throw new Error(msg); }
function eq(actual, expected, msg = '') {
  if (actual !== expected) throw new Error(`${msg} 期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
}
/** 固定 Math.random，让掉落类断言可复现 */
function withRandom(v, fn) {
  const orig = Math.random;
  Math.random = () => v;
  try { return fn(); } finally { Math.random = orig; }
}
const fresh = () => {
  store.clear();
  return world.newGame({ classId: 'xiake', petId: 'linghu', playerName: '回归测试' });
};

console.log('\n=== 山海奇谭 · 全链回归自检 ===\n');

console.log('[1] 任务链三环');
test('新开档初始状态', () => {
  const gs = fresh();
  eq(gs.questStep, 0, '未接任务');
  eq(gs.silver, 50, '初始银两');
  eq(gs.inv.heal, 3, '金疮药');
  eq(gs.inv.mana, 3, '凝气丹');
  eq(gs.inv.respec, 0, '洗点丹');
  eq(gs.level, 1, '等级');
  eq(world.activeQuest(gs), null, '无激活任务');
  ok(world.dialogueFor(gs).actions.some((a) => a.kind === 'accept'), '应有接任务按钮');
});

test('接缉狼令 → 击杀野狼×3 → 达成 → 交付', () => {
  const gs = fresh();
  world.acceptQuest(gs);
  eq(gs.questStep, 1, '进度 1');
  eq(world.activeQuest(gs).id, 'q1', '当前任务');
  ok(!world.questReady(gs), '初始未达成');
  world.onKilled(gs, ['yelang']);
  world.onKilled(gs, ['yelang']);
  eq(gs.questKills, 2, '击杀计数');
  const done = world.onKilled(gs, ['yelang']);
  eq(done?.id, 'q1', '应返回达成任务');
  ok(world.questReady(gs), '已可交付');
  ok(world.dialogueFor(gs).actions.some((a) => a.kind === 'claim'), '应有领取按钮');
  const r = world.claimQuest(gs);
  eq(r.silver, 100, '赏银');
  eq(gs.silver, 150, '银两入账');
  eq(gs.inv.heal, 5, '奖励金疮药×2');
  eq(gs.inv.respec, 1, 'q1 奖励洗点丹×1');
  eq(gs.questStep, 2, '推进到 q2');
  eq(gs.questKills, 0, '击杀数重置');
});

test('净乱葬：骷髅/蜘蛛×4 → 交付 → 讨山魈 → 全链完成', () => {
  const gs = fresh();
  world.acceptQuest(gs);
  world.onKilled(gs, ['yelang', 'yelang', 'yelang']);
  world.claimQuest(gs);
  eq(world.activeQuest(gs).id, 'q2', '进入 q2');
  ok(world.onKilled(gs, ['kulou', 'zhizhu']) === null, '未达 4 只');
  const d2 = world.onKilled(gs, ['kulou', 'zhizhu']);
  eq(d2?.id, 'q2', 'q2 达成');
  const r2 = world.claimQuest(gs);
  eq(r2.silver, 160, 'q2 赏银');
  eq(gs.silver, 310, '累计银两');
  eq(gs.inv.mana, 5, 'q2 奖励凝气丹×2');
  eq(gs.questStep, 3, '进入 q3');
  eq(world.activeQuest(gs).id, 'q3', '当前任务');
  const d3 = world.onKilled(gs, ['shanxiaowang']);
  eq(d3?.id, 'q3', 'q3 达成');
  const r3 = world.claimQuest(gs);
  eq(r3.silver, 300, 'q3 赏银');
  eq(gs.silver, 610, '累计银两');
  eq(gs.inv.heal, 7, 'q3 奖励金疮药×2');
  eq(gs.inv.mana, 6, 'q3 奖励凝气丹×1');
  eq(gs.questStep, 4, '超出任务链');
  eq(world.activeQuest(gs), null, '无激活任务');
  ok(world.dialogueFor(gs).text.includes('安宁'), '收尾对话');
});

test('非目标怪不计入任务进度', () => {
  const gs = fresh();
  world.acceptQuest(gs);
  eq(world.onKilled(gs, ['heixiong']), null, '黑熊精不算野狼');
  eq(gs.questKills, 0, '进度不变');
});

console.log('\n[2] 战斗结算与存档');
test('胜利结算：扣道具、发银两经验、清怪、落盘', () => {
  const gs = fresh();
  const key = 'wild_heifeng:0';
  world.registerBattleInventory(key, gs.inv);
  const s = withRandom(0.9, () => world.settleBattle(gs, {
    winner: 'ally', enemyIds: ['yelang'], itemsUsed: { heal: 1, mana: 0 }, caught: [],
  }, key));
  eq(gs.inv.heal, 2, '扣掉 1 个金疮药（固定随机、无掉落）');
  ok(gs.silver > 50, '获得银两');
  ok(gs.exp > 0, '获得经验');
  eq(gs.killedGroups[key], true, '标记清怪');
  ok(s.lines.some((l) => l.includes('获得经验')), '结算摘要含经验');
  ok(store.has('shanhai-save-1'), '已写入存档');
  // 掉落可能在扣账基础上额外加药，重新按登记存量核对不会低于 2
});

test('败北结算：只扣道具，不发奖励不清怪', () => {
  const gs = fresh();
  const key = 'wild_heifeng:1';
  world.registerBattleInventory(key, gs.inv);
  const before = gs.silver;
  const s = world.settleBattle(gs, {
    winner: 'enemy', enemyIds: ['yelang'], itemsUsed: { heal: 2, mana: 1 },
  }, key);
  eq(gs.inv.heal, 1, '扣 2 个金疮药');
  eq(gs.inv.mana, 2, '扣 1 个凝气丹');
  eq(gs.silver, before, '银两不变');
  eq(gs.killedGroups[key], undefined, '不清怪');
  ok(s.lines.some((l) => l.includes('败北')), '败北提示');
});

test('收服的怪入栏（按人物等级入场，上限 6）', () => {
  const gs = fresh();
  gs.level = 4;
  const key = 'wild_luanzang:0';
  world.registerBattleInventory(key, gs.inv);
  world.settleBattle(gs, {
    winner: 'ally', enemyIds: ['kulou'], itemsUsed: { heal: 0, mana: 0 }, caught: ['kulou'],
  }, key);
  eq(gs.petInstances.length, 2, '新增 1 只');
  eq(gs.petInstances[1].level, 4, '按人物等级入场');
  eq(gs.petInstances[1].defId, 'kulou', '物种来自 MONSTERS 表');
});

test('旧存档迁移：缺失字段按等级补发潜能', () => {
  store.clear();
  store.set('shanhai-save-1', JSON.stringify({
    classId: 'xiake', petId: 'yanjia', playerName: '老档', silver: 88,
    inv: { heal: 1, mana: 1 }, questStep: 1, questKills: 1,
    mapId: 'taoyuan', px: 700, py: 640, killedGroups: {}, level: 3,
  }));
  const gs = world.loadGame();
  ok(gs, '应能读档');
  eq(gs.level, 3, '等级保留');
  eq(gs.potential, 10, '(3-1)×5 潜能');
  eq(gs.petInstances.length, 1, '宠物个体化');
  eq(gs.petInstances[0].defId, 'yanjia', '旧 petId 迁移');
  eq(gs.skillLevels && typeof gs.skillLevels, 'object', '师门等级字段');
  eq(gs.stats && gs.stats.str, 0, '加点字段');
  eq(gs.bag.length, 0, '背包容错');
  eq(gs.inv.respec, 0, '洗点丹字段迁移');
  ok(gs.petInstances[0].equipped, '宠物装备位字段迁移');
});

test('非法存档拒绝读取；clearSave 生效', () => {
  store.clear();
  store.set('shanhai-save-1', JSON.stringify({ classId: 'xiake', mapId: '不存在的地图' }));
  eq(world.loadGame(), null, '无效 mapId');
  world.clearSave();
  eq(store.has('shanhai-save-1'), false, '已清除');
});

console.log('\n[3] 成长、装备与师门');
test('四维加点与装备加成汇总', () => {
  const gs = fresh();
  gs.stats = { str: 2, vit: 1, int: 3, agi: 4 };
  const b = world.totalBonus(gs);
  eq(b.atk, 4, '力量 攻+2/点');
  eq(b.def, 1, '根骨 防+1/点');
  eq(b.hp, 12, '根骨 气血+12/点');
  eq(b.mag, 6, '灵性 法+2/点');
  eq(b.mp, 24, '灵性 法力+8/点');
  eq(b.spd, 8, '敏捷 速+2/点');
});

test('装备生成 / 炼化 / 加成', () => {
  const it = equipment.generateEquipment(3);
  eq(it.tier, 3, '品阶');
  ok(equipment.EQUIP_SLOTS.includes(it.slot), '合法部位');
  ok(it.affixes.length >= 1, '至少一条词条');
  const before = equipment.itemBonus(it);
  equipment.rerollAffixes(it);
  ok(equipment.describeItem(it).includes(it.name), '描述含名称');
  ok(Object.values(before).every((v) => typeof v === 'number'), '加成结构完整');
});

test('师门修炼：费用、上限与非本门派拦截', () => {
  const gs = fresh();
  eq(skill.skillUpgradeCost(1).silver, 80, 'Lv1→2 银两');
  eq(skill.skillUpgradeCost(1).potential, 2, 'Lv1→2 潜能');
  ok(!world.learnSkill(gs, 'zx_huo').ok, '非本门派法术被拒');
  ok(!world.learnSkill(gs, 'jy_zhan').ok, '银两不足被拒');
  gs.silver = 1000; gs.potential = 100;
  ok(world.learnSkill(gs, 'jy_zhan').ok, '修炼成功');
  eq(world.skillLevel(gs, 'jy_zhan'), 2, '等级 2');
  eq(gs.silver, 920, '扣银两');
  eq(gs.potential, 98, '扣潜能');
  const e = skill.effectiveSkill(content.SKILLS.jy_zhan, 2);
  ok(e.mpCost > content.SKILLS.jy_zhan.mpCost, '耗蓝随级增长');
  ok(e.power > content.SKILLS.jy_zhan.power, '威力随级增长');
  gs.skillLevels.jy_zhan = skill.SKILL_MAX_LEVEL;
  ok(!world.learnSkill(gs, 'jy_zhan').ok, '满级被拒');
});

console.log('\n[4] 召唤兽');
test('petBase 兼容 PETS 与 MONSTERS；成长与经验曲线', () => {
  ok(world.petBase('linghu').name.includes('白泽幼兽'), '初始宠物');
  ok(world.petBase('kulou').name.includes('忘川骨卒'), '收服的怪');
  eq(world.petGrowth(1), 1, 'Lv1 无加成');
  ok(Math.abs(world.petGrowth(3) - 1.16) < 1e-9, '每级 +8%');
  eq(world.petExpNeeded(1), 55, 'Lv1 升级需求');
  const inst = { uid: 'p', defId: 'linghu', level: 3, exp: 0 };
  eq(world.petUnitStats(inst).hp, Math.round(content.PETS[0].stats.hp * 1.16), '等级缩放');
});

console.log('\n[5] 战斗引擎');
test('同种子 + 同指令 ⇒ 完全一致的事件流（可回放）', () => {
  const run = (seed) => {
    const b = new battle.Battle({ encounterId: 'heifengling', classId: 'xiake', petId: 'linghu', playerName: 't', seed });
    const driver = new rng.Rng(12345);
    const events = [];
    while (!b.over && b.round < 40) {
      events.push(...b.resolveRound(ai.planCommands(b.aliveOf('ally'), b.aliveOf('enemy'), driver)));
    }
    return { events, winner: b.winner, rounds: b.round };
  };
  const a = run(777), c = run(777), d = run(778);
  eq(JSON.stringify(a.events), JSON.stringify(c.events), '同种子事件流');
  ok(a.winner !== null, '战斗能结束');
  ok(JSON.stringify(a.events) !== JSON.stringify(d.events), '不同种子结果不同');
});

test('头目不可收服；残血捕捉成功率显著更高', () => {
  const b = new battle.Battle({ encounterId: 'custom', enemyIds: ['shanxiaowang'], classId: 'xiake', petId: 'linghu', playerName: 't', seed: 1 });
  const ev = b.resolveRound([{ type: 'catch', actorId: b.units[0].id, targetId: b.units[2].id }]);
  ok(ev.some((e) => e.t === 'catchFail' && e.chance === 0), '头目捕捉必失败');
  ok(!ev.some((e) => e.t === 'catchSuccess'), '不入栏');

  let wins = 0;
  for (let seed = 1; seed <= 120; seed++) {
    const x = new battle.Battle({ encounterId: 'custom', enemyIds: ['yelang'], classId: 'xiake', petId: 'linghu', playerName: 't', seed });
    x.units[2].hp = Math.max(1, Math.round(x.units[2].maxHp * 0.05));
    const r = x.resolveRound([{ type: 'catch', actorId: x.units[0].id, targetId: x.units[2].id }]);
    if (r.some((e) => e.t === 'catchSuccess')) wins++;
  }
  ok(wins > 60, `残血成功率应约 72%，实际 ${wins}/120`);
});

test('#sim 仿真可跑完并返回四门派结果', () => {
  const r = sim.simulateAll('linghu', 3);
  eq(r.length, content.CLASSES.length, '四职业');
  ok(r.every((x) => x.total === 3 && x.wins <= 3), '统计合法');
});

console.log('\n[6] 素材清单契约（新 assets_v2）');
function pngInfo(file) {
  const b = readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), depth: b[24], colorType: b[25] };
}
test('每个职业/宠物/怪物/长老都有 128×128 RGBA 单帧，五套动作齐全', () => {
  const manifestPath = path.join(ROOT, 'public/assets/manifest.json');
  ok(existsSync(manifestPath), 'manifest.json 存在');
  const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const ids = [
    ...content.CLASSES.map((c) => c.id), ...content.PETS.map((p) => p.id),
    ...Object.keys(content.MONSTERS), 'elder',
  ];
  const expected = { idle: 2, walk: 4, attack: 6, cast: 4, dead: 3 };
  for (const id of ids) {
    ok(m[id], `缺少角色定义: ${id}`);
    eq(m[id].frameSize?.[0], 128, `${id} 单帧宽`);
    eq(m[id].frameSize?.[1], 128, `${id} 单帧高`);
    for (const [anim, count] of Object.entries(expected)) {
      const def = m[id].anims?.[anim];
      ok(def && Array.isArray(def.frames), `${id} 缺少 ${anim} 动作`);
      eq(def.frames.length, count, `${id}.${anim} 帧数`);
      for (const f of def.frames) {
        const p = path.join(ROOT, 'public/assets', f);
        ok(existsSync(p), `${id}.${anim} 缺文件 ${f}`);
        const info = pngInfo(p);
        eq(info.w, 128, `${f} 宽`); eq(info.h, 128, `${f} 高`);
        eq(info.depth, 8, `${f} 位深`); eq(info.colorType, 6, `${f} 需为 RGBA`);
      }
    }
  }
});

test('旧 $scenes / $worldTiles 契约已移除，不再被渲染层依赖', () => {
  const m = JSON.parse(readFileSync(path.join(ROOT, 'public/assets/manifest.json'), 'utf8'));
  ok(!m.$scenes, '新 manifest 不含 $scenes');
  ok(!m.$worldTiles, '新 manifest 不含 $worldTiles');
});

console.log('\n[7] 装备系统补全（模块 2）');
test('极品稀有词条：★ 标记且数值翻倍', () => {
  const it = withRandom(0.01, () => equipment.generateEquipment(3));
  eq(it.tier, 3, '品阶');
  ok(equipment.hasRareAffix(it), '应掷出稀有词条');
  eq(it.affixes[0].value, 26, '基础 13 ×2');
  ok(equipment.describeItem(it).startsWith('★'), '描述带 ★');
  const normal = withRandom(0.01, () => equipment.generateEquipment(1));
  ok(!equipment.hasRareAffix(normal), '凡品不出稀有词条');
});

test('掉落池品阶按怪物难度权重', () => {
  ok(world.DROP_TIER_WEIGHTS.shanxiaowang[2] > world.DROP_TIER_WEIGHTS.yelang[2], '头目极品权重更高');
  eq(withRandom(0, () => world.dropTierFor(['yelang'])), 1, '野狼池必出凡品');
  eq(withRandom(0.99, () => world.dropTierFor(['shanxiaowang'])), 3, '头目池可出极品');
  eq(withRandom(0.99, () => world.dropTierFor(['yelang', 'shanxiaowang'])), 3, '一组怪取最强权重');
});

test('洗点丹：全额退还潜能点并清空四维', () => {
  const gs = fresh();
  ok(!world.useRespecPill(gs).ok, '无洗点丹时被拒');
  gs.inv.respec = 1;
  gs.stats = { str: 2, vit: 1, int: 0, agi: 0 };
  gs.potential = 3;
  ok(world.useRespecPill(gs).ok, '使用成功');
  eq(gs.inv.respec, 0, '消耗 1 个');
  eq(gs.potential, 6, '退还 3 点');
  eq(gs.stats.str + gs.stats.vit + gs.stats.int + gs.stats.agi, 0, '加点清零');
  eq(world.totalBonus(gs).atk, 0, '加成归零');
});

test('宠物装备位：共用装备池、加成独立、不可一件两穿', () => {
  const gs = fresh();
  const it = withRandom(0.5, () => equipment.generateEquipment(1));
  it.slot = 'armor';
  gs.bag.push(it);
  ok(!world.isEquippedAnywhere(gs, it.uid), '初始未穿戴');
  const pet = world.activePet(gs);
  pet.equipped = { armor: it.uid };
  ok(world.isEquippedAnywhere(gs, it.uid), '穿戴后可查到');
  eq(world.petEquipBonus(gs).def, equipment.itemBonus(it).def, '宠物加成来自该装备');
  eq(world.equipBonus(gs).def, 0, '不会串到人物加成');
  ok(world.totalBonus(gs).def === world.allocationBonus(gs).def, '人物加成不含宠物装备');
});

test('战斗结算保留洗点丹；头目必掉洗点丹', () => {
  const gs = fresh();
  gs.inv.respec = 2;
  const key = 'wild_heifeng:2';
  world.registerBattleInventory(key, gs.inv);
  withRandom(0.9, () => world.settleBattle(gs, {
    winner: 'ally', enemyIds: ['yelang'], itemsUsed: { heal: 0, mana: 0 },
  }, key));
  eq(gs.inv.respec, 2, '普通战斗未掉洗点丹时保持原值');
  const key2 = 'wild_shanxiao:2';
  world.registerBattleInventory(key2, gs.inv);
  const s = withRandom(0.9, () => world.settleBattle(gs, {
    winner: 'ally', enemyIds: ['shanxiaowang'], itemsUsed: { heal: 0, mana: 0 },
  }, key2));
  eq(gs.inv.respec, 3, '头目必掉 +1');
  ok(s.lines.some((l) => l.includes('洗点丹')), '结算摘要有洗点丹');
});

test('BattleOptions.petBonus 只作用于出战召唤兽', () => {
  const opts = { encounterId: 'custom', enemyIds: ['yelang'], classId: 'xiake', petId: 'linghu', playerName: 't', seed: 5 };
  const plain = new battle.Battle(opts);
  const boosted = new battle.Battle({ ...opts, playerBonus: { atk: 50 }, petBonus: { hp: 100, atk: 20 } });
  const [p0, pet0] = plain.units;
  const [p1, pet1] = boosted.units;
  eq(p1.atk - p0.atk, 50, '主角得到 playerBonus');
  eq(pet1.atk - pet0.atk, 20, '宠物得到 petBonus');
  eq(pet1.hp - pet0.hp, 100, '宠物气血加成');
  eq(p1.hp, p0.hp, '主角不受 petBonus 影响');
});

console.log('\n[8] 宠物炼妖（模块 3）');
test('新增通用宠物技能已注册且类型正确', () => {
  ok(content.SKILLS.pt_xue?.kind === 'physical' && content.SKILLS.pt_xue.drain > 0, '噬血爪');
  ok(content.SKILLS.pt_dun?.kind === 'buff', '玄岩甲');
  ok(content.SKILLS.pt_lei?.kind === 'magic' && content.SKILLS.pt_lei.element === 'thunder', '引雷诀');
  eq(world.FUSE_SKILL_POOL.length, 3, '技能池');
});

test('petUnitSpec：普通宠物走物种技能，炼妖宠物走自身技能与成长', () => {
  const gs = fresh();
  const p = gs.petInstances[0];
  const spec = world.petUnitSpec(p);
  eq(spec.skillIds.join(','), content.PETS[0].skillIds.join(','), '缺省走物种技能');
  p.skillIds = ['pt_xue'];
  p.growth = 1.2;
  eq(world.petUnitSpec(p).skillIds[0], 'pt_xue', '使用炼妖技能表');
  ok(world.petUnitSpec(p).stats.hp > content.PETS[0].stats.hp, '成长系数生效');
});

test('炼妖前置校验：不同个体 / 非出战 / 银两足够 / 存在', () => {
  const gs = fresh();
  gs.silver = 500;
  gs.petInstances.push({ uid: 'p2', defId: 'yanjia', level: 4, exp: 0, equipped: {} });
  gs.petInstances.push({ uid: 'p3', defId: 'kulou', level: 2, exp: 0, equipped: {} });
  ok(!world.fusePets(gs, 'p2', 'p2').ok, '同一个体被拒');
  ok(!world.fusePets(gs, gs.activePetUid, 'p2').ok, '出战宠物被拒');
  ok(!world.fusePets(gs, 'p2', '不存在').ok, '不存在被拒');
  gs.silver = 10;
  ok(!world.fusePets(gs, 'p2', 'p3').ok, '银两不足被拒');
  eq(gs.petInstances.length, 3, '失败不改动宠物栏');
});

test('炼妖成功：物种/等级/技能/成长/银两/出战宠物', () => {
  const gs = fresh();
  gs.silver = 500;
  gs.petInstances.push({ uid: 'p2', defId: 'yanjia', level: 4, exp: 0, equipped: {} });
  gs.petInstances.push({ uid: 'p3', defId: 'kulou', level: 2, exp: 0, equipped: {} });
  const activeUid = gs.activePetUid;
  const r = withRandom(0.5, () => world.fusePets(gs, 'p2', 'p3'));
  ok(r.ok, '成功');
  eq(gs.silver, 400, `扣 ${world.FUSE_COST} 银`);
  eq(gs.petInstances.length, 2, '两只换一只');
  eq(gs.activePetUid, activeUid, '出战宠物不变');
  eq(r.result.defId, 'kulou', '物种二选一');
  eq(r.result.level, 4, '等级取较高');
  eq(r.result.exp, 0, '经验清零');
  eq(r.result.growth, 1.1, '成长系数');
  ok(r.result.growth >= world.FUSE_GROWTH_MIN && r.result.growth <= world.FUSE_GROWTH_MAX, '成长在区间内');
  eq(r.result.skillIds.length, 3, '技能最多 3 个');
  const allowed = new Set(['yan_han', 'yan_bi', 'm_guci']);
  ok(r.result.skillIds.every((id) => allowed.has(id)), '技能来自双方并集');
  ok(r.result.equipped && Object.keys(r.result.equipped).length === 0, '装备不继承');
  eq(world.petUnitSpec(r.result).skillIds.join(','), r.result.skillIds.join(','), '战斗规格使用炼妖技能');
  ok(r.lines.some((l) => l.includes('炼成')), '结果摘要');
});

test('炼妖有概率领悟通用技能', () => {
  const gs = fresh();
  gs.silver = 500;
  gs.petInstances.push({ uid: 'p2', defId: 'linghu', level: 1, exp: 0, equipped: {} });
  gs.petInstances.push({ uid: 'p3', defId: 'linghu', level: 1, exp: 0, equipped: {} });
  const r = withRandom(0.01, () => world.fusePets(gs, 'p2', 'p3'));
  ok(r.ok, '成功');
  ok(r.result.skillIds.includes('pt_xue'), '领悟池内技能');
  ok(r.lines.some((l) => l.includes('领悟')), '摘要提示领悟');
});

console.log('\n[9] 组队同伴（模块 4）');
test('新开档与旧存档都有 companions 字段', () => {
  const gs = fresh();
  eq(gs.companions.length, 0, '新档无同伴');
  store.clear();
  store.set('shanhai-save-1', JSON.stringify({
    classId: 'xiake', petId: 'linghu', playerName: '老档', silver: 10,
    inv: { heal: 1, mana: 1 }, questStep: 0, questKills: 0,
    mapId: 'taoyuan', px: 700, py: 640, killedGroups: {}, level: 2,
  }));
  eq(world.loadGame().companions.length, 0, '旧档迁移为空数组');
});

test('雇佣校验：模板 / 银两 / 上限 / 解雇不退款', () => {
  const gs = fresh();
  ok(!world.hireCompanion(gs, '不存在').ok, '未知模板被拒');
  ok(!world.hireCompanion(gs, 'wuzhu').ok, '银两不足被拒');
  gs.silver = 1000;
  ok(world.hireCompanion(gs, 'wuzhu').ok, '雇佣 1');
  eq(gs.silver, 1000 - world.HIRE_COST, '扣银两');
  eq(gs.companions[0].level, 1, '按人物等级入场');
  ok(world.hireCompanion(gs, 'lingguan').ok, '雇佣 2');
  eq(gs.companions.length, world.COMPANION_CAP, '达到上限');
  ok(!world.hireCompanion(gs, 'moshi').ok, '超出上限被拒');
  const before = gs.silver;
  ok(world.dismissCompanion(gs, gs.companions[0].uid).ok, '解雇成功');
  eq(gs.silver, before, '解雇不退款');
  eq(gs.companions.length, 1, '人数减一');
});

test('companionSpec：复用职业数值与技能，按等级缩放', () => {
  const cls = content.CLASSES.find((c) => c.id === 'lingguan');
  const s = world.companionSpec({ uid: 'c', templateId: 'lingguan', level: 3 });
  eq(s.defId, 'lingguan', '复用职业精灵 id');
  eq(s.skillIds.join(','), cls.skillIds.join(','), '复用职业技能');
  eq(s.stats.hp, Math.round(cls.stats.hp * world.companionGrowth(3)), '等级缩放');
  eq(world.COMPANION_TEMPLATES.length, 3, '三种模板');
});

test('胜利结算把同伴等级同步到人物等级', () => {
  const gs = fresh();
  gs.level = 5;
  gs.silver = 1000;
  world.hireCompanion(gs, 'wuzhu');
  gs.companions[0].level = 1;
  const key = 'wild_heifeng:4';
  world.registerBattleInventory(key, gs.inv);
  withRandom(0.99, () => world.settleBattle(gs, {
    winner: 'ally', enemyIds: ['shanxiaowang'], itemsUsed: { heal: 0, mana: 0 },
  }, key));
  eq(gs.companions[0].level, gs.level, '同伴等级跟随人物');
});

test('Battle 同伴进入己方、不可捕捉、事件流仍可复现', () => {
  const comp = world.companionSpec({ uid: 'c', templateId: 'moshi', level: 1 });
  const opts = {
    encounterId: 'custom', enemyIds: ['yelang'], classId: 'xiake', petId: 'linghu',
    playerName: 't', seed: 9, companions: [comp],
  };
  const b = new battle.Battle(opts);
  eq(b.units.length, 4, '主角 + 宠物 + 同伴 + 1 怪');
  const c = b.units.find((u) => u.tag === 'companion');
  ok(c && c.side === 'ally', '同伴在己方');
  eq(c.name, comp.name, '名称来自模板');
  const ev = b.resolveRound([
    { type: 'catch', actorId: c.id, targetId: b.units[3].id },
    { type: 'defend', actorId: b.units[0].id },
    { type: 'defend', actorId: b.units[1].id },
  ]);
  ok(!ev.some((e) => e.t === 'catchSuccess'), '同伴不能收服');
  const run = () => {
    const x = new battle.Battle(opts);
    const driver = new rng.Rng(42);
    const out = [];
    while (!x.over && x.round < 40) {
      out.push(...x.resolveRound(ai.planCommands(x.aliveOf('ally'), x.aliveOf('enemy'), driver)));
    }
    return JSON.stringify(out);
  };
  eq(run(), run(), '带同伴的战斗仍可回放');
});

test('桃源镇配置了酒馆且素材清单覆盖同伴职业', () => {
  const m = JSON.parse(readFileSync(path.join(ROOT, 'public/assets/manifest.json'), 'utf8'));
  ok(world.WORLD_MAPS.taoyuan.tavern, '桃源镇有酒馆');
  for (const t of world.COMPANION_TEMPLATES) ok(m[t.classId], `同伴职业有精灵: ${t.classId}`);
});

console.log('\n[10] 音乐音效（模块 5）');
test('事件 → 音效名映射是纯函数且覆盖全部事件类型', () => {
  eq(audiomap.sfxForEvent({ t: 'attack', actorId: 'u1' }), 'attack', '普攻');
  eq(audiomap.sfxForEvent({ t: 'cast', actorId: 'u1', skillId: 'x' }), 'cast', '施法');
  eq(audiomap.sfxForEvent({ t: 'damage', sourceId: 'u1', targetId: 'u2', amount: 1, element: 'physical', crit: false, hpAfter: 1 }), 'hit', '伤害');
  eq(audiomap.sfxForEvent({ t: 'poisonTick', targetId: 'u1', amount: 1, hpAfter: 1 }), 'hit', '毒发');
  eq(audiomap.sfxForEvent({ t: 'heal', sourceId: 'u1', targetId: 'u2', amount: 1, hpAfter: 1 }), 'heal', '治疗');
  eq(audiomap.sfxForEvent({ t: 'catchSuccess', targetId: 'u1', defId: 'yelang' }), 'catch', '收服成功');
  eq(audiomap.sfxForEvent({ t: 'death', targetId: 'u1' }), 'death', '倒下');
  eq(audiomap.sfxForEvent({ t: 'battleEnd', winner: 'ally', rounds: 1 }), 'victory', '胜利');
  eq(audiomap.sfxForEvent({ t: 'battleEnd', winner: 'enemy', rounds: 1 }), 'defeat', '战败');
  eq(audiomap.sfxForEvent({ t: 'roundStart', round: 1 }), null, '回合开始静音');

  const names = new Set(['click', 'attack', 'cast', 'hit', 'heal', 'status', 'death', 'catch', 'item', 'victory', 'defeat']);
  const samples = [
    { t: 'roundStart', round: 1 }, { t: 'actionStart', actorId: 'u1' },
    { t: 'actSkip', actorId: 'u1', reason: 'sleep' }, { t: 'actOverride', actorId: 'u1', reason: 'chaos' },
    { t: 'cast', actorId: 'u1', skillId: 'x' }, { t: 'attack', actorId: 'u1' }, { t: 'defend', actorId: 'u1' },
    { t: 'damage', sourceId: 'u1', targetId: 'u2', amount: 1, element: 'fire', crit: true, hpAfter: 1 },
    { t: 'heal', sourceId: 'u1', targetId: 'u2', amount: 1, hpAfter: 1 },
    { t: 'mpChange', targetId: 'u1', delta: 1, mpAfter: 1 },
    { t: 'statusHit', targetId: 'u1', kind: 'seal', rounds: 2 },
    { t: 'statusResist', targetId: 'u1', kind: 'seal' },
    { t: 'statusEnd', targetId: 'u1', kind: 'seal', reason: 'expire' },
    { t: 'poisonTick', targetId: 'u1', amount: 1, hpAfter: 1 }, { t: 'death', targetId: 'u1' },
    { t: 'catchSuccess', targetId: 'u1', defId: 'yelang' }, { t: 'catchFail', targetId: 'u1', chance: 0.3 },
    { t: 'itemUsed', actorId: 'u1', itemId: 'heal', remain: 1 },
    { t: 'battleEnd', winner: 'ally', rounds: 1 }, { t: 'battleEnd', winner: 'enemy', rounds: 1 },
  ];
  for (const ev of samples) {
    const s = audiomap.sfxForEvent(ev);
    ok(s === null || names.has(s), `${ev.t} 的映射必须为空或合法音效名`);
  }
  eq(audiomap.sfxForEvent({ t: 'battleEnd', winner: 'ally', rounds: 1 }),
     audiomap.sfxForEvent({ t: 'battleEnd', winner: 'ally', rounds: 9 }), '纯函数可重复');
});

test('三档 BGM 间隔常量可用', () => {
  ok(audiomap.BGM_INTERVAL.battle < audiomap.BGM_INTERVAL.world, '战斗节奏更快');
  ok(audiomap.BGM_INTERVAL.world < audiomap.BGM_INTERVAL.setup, '世界比选人紧凑');
  ok(Object.values(audiomap.BGM_INTERVAL).every((v) => typeof v === 'number' && v > 0), '均为正数');
});

console.log('\n[11] 自动寻路与挂机决策（模块 6）');
test('planPath：边界钳制、单段 waypoint、长度；nearestTarget', () => {
  const b = world.WORLD_MAPS.taoyuan.bounds;
  const c = pathutil.clampToBounds({ x: -10, y: 9999 }, b);
  eq(c.x, b.minX, '左边界'); eq(c.y, b.maxY, '下边界');
  const beyond = { x: b.maxX + 500, y: b.maxY + 500 };
  const p = pathutil.planPath({ x: 100, y: 500 }, beyond, b);
  eq(p.waypoints.length, 1, '当前策略为单段直线');
  ok(p.clipped, '越界被裁剪');
  eq(p.waypoints[0].x, b.maxX, '目标钳制到区内');
  ok(p.length > 0, '路径长度');
  eq(pathutil.nearestTarget({ x: 0, y: 0 }, [{ x: 10, y: 0 }, { x: 3, y: 0 }]), 1, '取最近');
  eq(pathutil.nearestTarget({ x: 0, y: 0 }, []), -1, '空候选');
});

test('routeExit：BFS 返回通往目标地图的第一跳', () => {
  eq(autoplay.routeExit('taoyuan', 'taoyuan'), undefined, '同图无需出口');
  const direct = autoplay.routeExit('taoyuan', 'wild_heifeng');
  eq(direct?.to, 'wild_heifeng', '直达');
  const multi = autoplay.routeExit('wild_luanzang', 'wild_shanxiao');
  eq(multi?.to, 'wild_heifeng', '乱葬岗→山魈岭需先经黑风岭');
  eq(autoplay.AUTO_ROUTE.length, 4, '巡游路线四张图');
});

test('挂机决策：接任务 → 出城 → 打最近的怪', () => {
  const gs = fresh();
  let a = autoplay.nextAutoAction(gs);
  eq(a.kind, 'quest', '未接任务先找长老');
  world.acceptQuest(gs);
  a = autoplay.nextAutoAction(gs);
  eq(a.kind, 'travel', '接完任务出城');
  eq(a.to, 'wild_heifeng', '第一站黑风岭');
  gs.mapId = 'wild_heifeng';
  gs.px = 700; gs.py = 640;
  a = autoplay.nextAutoAction(gs);
  eq(a.kind, 'fight', '有怪就打');
  ok(world.WORLD_MAPS.wild_heifeng.spawns.some((s) => s.x === a.target.x && s.y === a.target.y), '目标为某组出生点');
});

test('挂机决策：清图跨图 / 任务达成回镇 / 丹药耗尽 / 全链完成', () => {
  const cleared = fresh();
  world.acceptQuest(cleared);
  cleared.mapId = 'wild_heifeng';
  world.WORLD_MAPS.wild_heifeng.spawns.forEach((_, i) => { cleared.killedGroups[`wild_heifeng:${i}`] = true; });
  const a1 = autoplay.nextAutoAction(cleared);
  eq(a1.kind, 'travel', '清完当前图继续巡游');
  ok(a1.to !== 'wild_heifeng', '换到别的图');

  const ready = fresh();
  world.acceptQuest(ready);
  ready.questKills = 3;
  ready.mapId = 'wild_heifeng';
  const a2 = autoplay.nextAutoAction(ready);
  eq(a2.kind, 'travel', '任务达成回镇');
  eq(a2.to, 'taoyuan', '目标桃源镇');

  const dry = fresh();
  dry.inv.heal = 0; dry.inv.mana = 0;
  const a3 = autoplay.nextAutoAction(dry);
  eq(a3.kind, 'stop', '丹药耗尽停止');
  ok(a3.reason.includes('丹药'), '说明原因');

  const done = fresh();
  done.questStep = world.QUESTS.length + 1;
  eq(autoplay.nextAutoAction(done).kind, 'stop', '任务链完成停止');
});

console.log('\n[12] 等距构件地图（模块 7 / 模块 12 一景一制）');
test('五图等距规格各自按格网推导；卷轴常量只留给旧素材回退', () => {
  eq(world.DEFAULT_SEGMENTS, 8, '默认 8 个区段（旧分块素材口径）');
  eq(world.TILE_W, 1440, '区段宽'); eq(world.TILE_H, 900, '区段高');
  eq(world.MAP_H, 900, '旧区段高');
  const sizes = new Set();
  for (const [id, m] of Object.entries(world.WORLD_MAPS)) {
    const g = world.isoGridOf(id);
    const sz = world.isoWorldSize(g);
    ok(m.iso?.layout, `${m.name} 已启用等距布局`);
    eq(m.w, sz.w, `${m.name} 等距世界宽由自己的格网推导`);
    eq(m.h, sz.h, `${m.name} 等距世界高由自己的格网推导`);
    eq(m.bounds.minX, 0, `${m.name} 边界格不被横向内缩裁掉`);
    eq(m.bounds.maxX, m.w, `${m.name} 可行走区覆盖整个菱形`);
    eq(m.bounds.minY, 0, `${m.name} 边界格不被纵向内缩裁掉`);
    eq(m.bounds.maxY, m.h, `${m.name} 纵向覆盖整个菱形`);
    ok(m.segments >= 1, `${m.name} 区段折算（挂机与旧素材仍按区段用）`);
    ok(!('chunks' in m) && !('chunkW' in m), `${m.name} 不再使用分块字段`);
    sizes.add(`${m.w}x${m.h}`);
  }
  ok(sizes.size >= 4, `五图世界尺寸不再完全一致（${[...sizes].join(' / ')}）`);
  ok(world.WORLD_MAPS.difu.npc?.name === '孟婆', '地府孟婆已注册');
});

test('云京：128×128 城制样板 / 闭合城墙四门 / 中心鼓楼 / 四坊密度三档尺度', () => {
  const m = world.WORLD_MAPS.taoyuan;
  eq(m.w, 8192, '云京宽 = (128+128)*32');
  eq(m.h, 4096, '云京高 = (128+128)*16');
  eq(m.iso?.layout, 'iso/taoyuan.json', '布局路径');
  const file = path.join(ROOT, 'public/assets/art', m.iso.layout);
  ok(existsSync(file), '布局文件存在');
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  eq(raw.grid.cols, 128, '网格列'); eq(raw.grid.rows, 128, '网格行');
  eq(raw.grid.tileW, 64, '菱形宽'); eq(raw.grid.tileH, 32, '菱形高 2:1');
  eq(raw.grid.ox, 4096, '网格 x 居中（菱形左右顶点贴 0 / 8192）');
  eq(raw.grid.oy, 16, '网格 y 居中（菱形上下顶点贴 0 / 4096）');
  eq(raw.rules?.streetWidth, 10, '主街宽 10 格（≥8）');
  ok(raw.rules?.houseClearanceFromStreetCenter >= 4, '房屋前底顶点离街心 ≥4 格');

  const layout = iso.expandLayout(raw);
  for (const item of layout.items) {
    const s = iso.isoSize(item);
    ok(item.gx >= 0 && item.gy >= 0 && item.gx + s.w <= layout.grid.cols && item.gy + s.h <= layout.grid.rows,
      `构件越界: ${item.type} (${item.gx},${item.gy})`);
  }
  const count = (t) => layout.items.filter((i) => i.type === t).length;
  const pick = (t) => layout.items.filter((i) => i.type === t);

  // —— 城墙闭合：四边两格厚，四门单独处理，城外 4~6 格空地 ——
  const wallSegs = count('city_wall_u6') + count('city_wall_u2') + count('city_wall_v6') + count('city_wall_v2');
  ok(wallSegs >= 60, `城墙段 ${wallSegs} 件（6 格 ${count('city_wall_u6') + count('city_wall_v6')} + 2 格 ${count('city_wall_u2') + count('city_wall_v2')}）`);
  ok(count('city_wall_u6') > 0 && count('city_wall_v6') > 0, '直段 u/v 两向都用到美术模块');
  eq(count('city_wall_corner'), 4, '四角转角构件（美术 city_wall_corner）');
  eq(count('gate_arch') + count('city_gate_tower') + count('city_gate_wide') + count('city_gate_wide_v'), 4,
    '四向城门各一座（南城门楼 + 北/西/东宽城门楼，城台制式统一）');
  const gateSet = new Set([...pick('gate_arch'), ...pick('city_gate_tower'), ...pick('city_gate_wide'),
    ...pick('city_gate_wide_v')].map((g) => `${g.gx},${g.gy}`));
  ok(gateSet.has('59,5'), '北门 = 宽城门楼，开口与南北主街同宽 (x59..68)、外侧与城墙齐平 (gy5..7)');
  // 宽城门楼高于城墙：正脊 406 > 城墙垛口 224（城门比城墙矮不合理）
  ok(iso.ISO_TYPES.city_gate_wide.height > iso.ISO_TYPES.city_wall_u6.height,
    '北城门楼标高高于城墙');
  ok(gateSet.has('62,120') && gateSet.has('5,59') && gateSet.has('120,59'),
    '南（城门楼，外侧齐平 gy120..122）/ 西 / 东门（v 向宽城门楼，开口与东西主街同宽 y59..68）');
  // 四门城台外侧都与城墙外面齐平：北/南门凸向城内 1 排，西/东门凸向城内 1 列
  ok(iso.ISO_TYPES.city_gate_wide_v.height === iso.ISO_TYPES.city_gate_wide.height,
    '东西门与北门同一标高体系');
  for (const b of [...pick('house'), ...pick('house_large'), ...pick('hall')]) {
    ok(b.gx >= 7 && b.gy >= 7 && b.gx + iso.isoSize(b).w <= 121 && b.gy + iso.isoSize(b).h <= 121,
      `房屋不得贴边/入墙: ${b.type} (${b.gx},${b.gy})`);
  }
  // 缺图建筑不生成：不再出现无顶方盒占位（旧 shop_small 67 件已从布局移除）
  eq(count('shop_small'), 0, '缺图小档铺面不再生成（避免无顶方盒）');

  // —— 中心：鼓楼制高点 + 广场 ——
  const bell = pick('bell_tower')[0];
  ok(bell, '中心鼓楼存在');
  eq(iso.ISO_TYPES.bell_tower.w, 7, '鼓楼足迹 7 格宽（≥5 的中心建筑）');
  eq(iso.ISO_TYPES.bell_tower.h, 7, '鼓楼足迹 7 格深（≥5 的中心建筑）');
  ok(iso.ISO_TYPES.bell_tower.height > iso.ISO_TYPES.city_gate_tower.height, '鼓楼宝顶为全城最高（高于南门楼）');
  ok(iso.ISO_TYPES.bell_tower.height > iso.ISO_TYPES.house.height * 2, '鼓楼高于民居两倍以上');
  // 牌坊暂用 gate_arch 贴图别名，等专用美术（两柱一枋、无两侧墙垛）到位后换图
  ok(count('paifang') >= 4, `牌坊 ${count('paifang')} 座（中心四向 + 庙前）`);
  ok(pick('paifang').some((p) => Math.abs(p.gx - 54) <= 20 && Math.abs(p.gy - 63) <= 12), '中心广场有牌坊');

  // —— 四坊密度分化 ——
  const regionOf = (i) => {
    const w = iso.isoSize(i).w, h = iso.isoSize(i).h;
    const cx = i.gx + w / 2, cy = i.gy + h / 2;
    if (cx < 64 && cy < 64) return 'market';
    if (cx >= 64 && cy < 64) return 'residence';
    if (cx < 64 && cy >= 64) return 'temple';
    return 'garden';
  };
  const BUILDING = new Set(['house', 'house_large', 'hall']);
  const byRegion = { market: 0, residence: 0, temple: 0, garden: 0 };
  for (const it of layout.items) if (BUILDING.has(it.type)) byRegion[regionOf(it)]++;
  const totalBuildings = byRegion.market + byRegion.residence + byRegion.temple + byRegion.garden;
  ok(totalBuildings >= 60 && totalBuildings <= 80, `建筑总数 ${totalBuildings}（目标 60~80，旧版 152/200）`);
  ok(byRegion.market >= 24, `市集坊建筑 ${byRegion.market}（最密）`);
  ok(byRegion.residence >= 24, `宅院坊建筑 ${byRegion.residence}（成组院落）`);
  ok(byRegion.market + byRegion.residence > byRegion.temple + byRegion.garden,
    `四坊密度分化 市集 ${byRegion.market} / 宅院 ${byRegion.residence} / 庙署 ${byRegion.temple} / 园林 ${byRegion.garden}`);
  ok(byRegion.temple <= 10, `庙署坊建筑 ${byRegion.temple}（低密度）`);
  ok(byRegion.garden <= 6, `园林坊建筑 ${byRegion.garden}（低密度）`);
  ok(pick('hall').length >= 3, `庙署大体量殿宇 ${pick('hall').length} 座`);
  ok(count('fence') >= 100, `宅院院墙 ${count('fence')} 件`);
  ok(count('ground_water') >= 3, `园林水面 ${count('ground_water')} 处`);
  ok(count('well') >= 1 && count('incense') >= 1 && count('stele') >= 2, '水井/香炉/石碑');
  ok(count('tree') >= 60, `树 ${count('tree')} 棵`);
  ok(count('stall') >= 8, `摊位 ${count('stall')} 个`);
  ok(count('crate') >= 10, `货箱 ${count('crate')} 个`);
  ok(count('ground_stone') >= 8 && count('ground_dirt') >= 8, '石街与土路/院落');

  // —— 尺度：大档（庙署大殿）+ 中档（4×4 屋身）；house_large/shop_small 缺图暂不生成 ——
  const large = count('hall');
  const medium = count('house');
  const small = count('shop_small');
  ok(large >= 3, `大档 ${large} 座`);
  ok(medium >= 50, `中档 ${medium} 座`);
  eq(small, 0, '小档缺成套屋身，先不生成');
  eq(count('house_large'), 0, '大宅缺成套屋身，先不生成（避免空白墙面占位）');
  const lr = large / medium;
  ok(lr >= 0.03 && lr <= 0.2, `大:中 = 1:${(1 / lr).toFixed(1)}`);
  eq(iso.ISO_TYPES.house_large.w, 4, '大档跨 4 格（两三层楼阁）');
  ok(iso.ISO_TYPES.house_large.height > iso.ISO_TYPES.house.height, '大档层高高于中档');
  eq(iso.ISO_TYPES.shop_small.w, 2, '小档跨 2 格');
  eq(iso.ISO_TYPES.house.w, 4, '中档沿用 4×4 屋身');

  // —— 瓦色：靛青为主，朱红仅作点缀（10~20%），同一坊内混色（不按坊整片换色） ——
  const COOL = 0xdde6ff;
  const WARM = 0xff8f6b;
  const tinted = layout.items.filter((i) => BUILDING.has(i.type) && i.tint !== undefined);
  ok(tinted.length >= 60, `着色建筑 ${tinted.length} 座`);
  ok(tinted.every((i) => i.tint === COOL || i.tint === WARM), '瓦色只分靛青主色与朱红点缀两档');
  const warm = tinted.filter((i) => i.tint === WARM).length;
  const warmRatio = warm / tinted.length;
  ok(warmRatio >= 0.1 && warmRatio <= 0.2, `朱红瓦点缀 ${warm}/${tinted.length} = ${(warmRatio * 100).toFixed(1)}%（目标 10~20%）`);
  for (const q of ['market', 'residence', 'temple', 'garden']) {
    const mine = tinted.filter((i) => regionOf(i) === q);
    ok(mine.length > 0, `${q} 坊有瓦色`);
    ok(mine.some((i) => i.tint === COOL), `${q} 坊以靛青为主`);
    ok(mine.some((i) => i.tint === WARM), `${q} 坊内混入朱红点缀（不按坊整片换色）`);
  }

  // —— 街道骨架：10 格主街十字 + 4 格市集巷 + 5 格北门内街 ——
  const stone = new Set();
  for (const it of layout.items) {
    if (it.type !== 'ground_stone') continue;
    const s = iso.isoSize(it);
    for (let dy = 0; dy < s.h; dy++) for (let dx = 0; dx < s.w; dx++) stone.add(`${it.gx + dx},${it.gy + dy}`);
  }
  const streetRows = Array.from({ length: 10 }, (_, i) => 59 + i);
  for (const gx of [10, 40, 80, 110]) {
    eq(streetRows.filter((y) => stone.has(`${gx},${y}`)).length, 10, `东西主街 gx=${gx} 宽 10`);
  }
  const streetCols = Array.from({ length: 10 }, (_, i) => 59 + i);
  for (const gy of [10, 50, 80, 110]) {
    eq(streetCols.filter((x) => stone.has(`${x},${gy}`)).length, 10, `南北主街 gy=${gy} 宽 10`);
  }
  // 十字主街自四向门庭连续贯通到中心广场，宽 10 格且无断点
  for (const gx of [62, 63, 64, 65, 66]) {
    eq([5, 30, 45, 55, 70, 90, 110, 118].filter((y) => stone.has(`${gx},${y}`)).length, 8, `南北主街 gx=${gx} 自北门连续到南门`);
  }
  for (const gy of [62, 63, 64, 65, 66]) {
    eq([5, 30, 45, 55, 70, 90, 110, 118].filter((x) => stone.has(`${x},${gy}`)).length, 8, `东西主街 gy=${gy} 自西门连续到东门`);
  }
  for (const gy of [10, 45]) {
    eq([28, 29, 30, 31].filter((x) => stone.has(`${x},${gy}`)).length, 4, `市集纵巷 gy=${gy} 宽 4`);
  }
  for (const gx of [10, 45]) {
    eq([28, 29, 30, 31].filter((y) => stone.has(`${gx},${y}`)).length, 4, `市集横巷 gx=${gx} 宽 4`);
  }

  // 退檐：中屋四邻不得直接贴街道
  let adjacent = 0;
  for (const it of pick('house')) {
    const s = iso.isoSize(it);
    for (let dy = 0; dy < s.h; dy++) for (let dx = 0; dx < s.w; dx++) {
      const gx = it.gx + dx, gy = it.gy + dy;
      for (const [nx, ny] of [[gx - 1, gy], [gx + 1, gy], [gx, gy - 1], [gx, gy + 1]]) if (stone.has(`${nx},${ny}`)) adjacent++;
    }
  }
  eq(adjacent, 0, '房屋退檐，不与街道直接相邻');

  // 树不长在石街上（摊位允许落在市集广场石面）
  for (const it of pick('tree')) {
    const s = iso.isoSize(it);
    for (let dy = 0; dy < s.h; dy++) for (let dx = 0; dx < s.w; dx++) {
      ok(!stone.has(`${it.gx + dx},${it.gy + dy}`), `树 (${it.gx},${it.gy}) 压到石街`);
    }
  }

  // —— 碰撞：城墙不可走、四门十字通道可走、中心广场可走、水面不可走、桥面可走 ——
  const col = iso.buildCollision(layout);
  const walk = (gx, gy) => {
    const p = iso.cellToWorld(layout.grid, gx, gy);
    return iso.isoWalkable(col, layout.grid, p.x, p.y);
  };
  ok(walk(63, 5), '北门内主街街心可走');
  ok(walk(10, 29) && walk(29, 16), '坊内次级巷道可走');
  ok(walk(40, 34), '市集广场石面可走');
  ok(walk(64, 100), '南向主街可走');
  ok(walk(100, 64), '东西主街可走');
  ok(walk(57, 64) && walk(70, 64) && walk(64, 57) && walk(64, 70), '鼓楼四周环绕广场可走');
  ok(!walk(bell.gx, bell.gy), '鼓楼足迹不可走');
  ok(walk(62, 62) && walk(63, 63) && walk(64, 64), '鼓楼底层券门中心 3×3 可穿行（中线与足迹中心 63.5 重合）');
  ok(walk(60, 63) && walk(66, 63) && walk(63, 60) && walk(63, 66), '券门四向 3 格通道贯通到足迹边缘');
  ok(!walk(61, 61) && !walk(66, 66), '券门通道以外的鼓楼足迹仍阻挡');
  for (const [fx, fy, tx, ty, name] of [[63, 57, 63, 66, '南北'], [57, 63, 66, 63, '东西']]) {
    ok(iso.findIsoPath(col, layout.grid, { gx: fx, gy: fy }, { gx: tx, gy: ty }) !== null, `鼓楼 ${name} 方向 BFS 可穿行`);
  }
  // 四门券洞通道：北门（x60..67 × gy5..7）/ 南门（中 2 列）/ 西东门（y60..67 × gx5..7 / gx120..122）
  for (const [gx, gy, name] of [[63, 6, '北门'], [63, 121, '南门'], [6, 63, '西门'], [121, 63, '东门']]) {
    ok(walk(gx, gy), `${name}券洞通道可走`);
  }
  // 宽城门楼：券洞与主街同宽（北门 x60..67 全部可穿，东西门 y60..67 全部可穿），两侧墩柱阻挡
  for (const [gx, gy] of [[60, 6], [67, 5], [60, 7], [67, 7], [5, 60], [7, 67], [120, 60], [122, 67]]) {
    ok(walk(gx, gy), `宽券洞 (${gx},${gy}) 可走`);
  }
  for (const [gx, gy] of [[8, 5], [59, 5], [68, 5], [30, 121], [121, 20], [6, 30], [122, 100], [30, 5],
    [59, 6], [68, 7], [5, 59], [7, 59], [120, 59], [122, 68]]) {
    ok(!walk(gx, gy), `城墙/墩柱 (${gx},${gy}) 应阻挡`);
  }

  // —— 宫城（中心广场南侧）：构件齐全 / 制高点 / 碰撞 ——
  ok(pick('palace_hall').length === 1, '宫城主殿 1 座（6×6 金顶三重檐）');
  ok(iso.ISO_TYPES.palace_hall.w === 6 && iso.ISO_TYPES.palace_hall.h === 6, '主殿足迹 6×6');
  ok(iso.ISO_TYPES.palace_hall.height > iso.ISO_TYPES.bell_tower.height, '主殿高于鼓楼');
  ok(pick('palace_hall_s').length >= 1, '宫城配殿存在');
  ok(pick('pagoda').length === 1, '白塔 1 座');
  ok(iso.ISO_TYPES.pagoda.height > iso.ISO_TYPES.palace_hall.height, '白塔高于主殿（新城制高点）');
  ok(pick('palace_gate').length === 1, '宫门 1 座（朝南）');
  eq(count('palace_corner'), 4, '宫城四角角楼 4 座');
  ok(count('palace_wall_u6') + count('palace_wall_u2') + count('palace_wall_v6') + count('palace_wall_v2') >= 8,
    `宫墙段 ${count('palace_wall_u6') + count('palace_wall_u2') + count('palace_wall_v6') + count('palace_wall_v2')} 件`);
  ok(count('ground_marble') >= 1, '宫城内院汉白玉地面');
  const phall = pick('palace_hall')[0];
  ok(!walk(phall.gx, phall.gy), '宫城主殿足迹不可走');
  const pgate2 = pick('palace_gate')[0];
  ok(walk(pgate2.gx + 1, pgate2.gy) && walk(pgate2.gx + 2, pgate2.gy), '宫门券门中间两列可走');
  ok(!walk(pgate2.gx, pgate2.gy), '宫门门柱格不可走');
  const pcorner = pick('palace_corner')[0];
  ok(!walk(pcorner.gx, pcorner.gy), '宫城角楼足迹不可走');

  const house = pick('house')[0];
  ok(!walk(house.gx, house.gy), `房屋足迹 (${house.gx},${house.gy}) 不可走`);
  const gate = pick('paifang')[0];   // 牌坊复用 3×3 拱门贴图，拱洞机制与旧 gate_arch 一致
  const arch = iso.archCell(gate);
  ok(walk(arch.gx, arch.gy), '拱洞格可走');
  ok(!walk(gate.gx, gate.gy), '门柱格不可走');
  ok(!walk(-2, 20) && !walk(130, 20), '网格外不可走');
  ok(!walk(0, 130), '网格下方不可走');
  const water = layout.items.find((i) => i.type === 'ground_water');
  ok(!walk(water.gx, water.gy), `水面 (${water.gx},${water.gy}) 不可走`);
  const brg = layout.items.find((i) => i.type === 'bridge');
  ok(walk(brg.gx + 1, brg.gy + 2), `桥面 (${brg.gx + 1},${brg.gy + 2}) 可走`);

  // 出生点 / NPC / 酒肆 / 路牌都落在可走街面
  const gs = world.newGame({ classId: 'xiake', petId: 'linghu', playerName: '回归测试' });
  ok(world.isWalkable(m, gs.px, gs.py), '出生点在 bounds 内（兜底区间）');
  ok(iso.isoWalkable(col, layout.grid, gs.px, gs.py), '出生点在布局可走格');
  ok(iso.isoWalkable(col, layout.grid, m.npc.x, m.npc.y), 'NPC 站位可走');
  ok(iso.isoWalkable(col, layout.grid, m.tavern.x, m.tavern.y), '酒肆站位可走');
  for (const e of m.exits) ok(iso.isoWalkable(col, layout.grid, e.x, e.y), `路牌 ${e.label} 可走`);

  // 城门拱洞 222px（与 gate_arch 真实美术一致），角色通行高度不受影响
  eq(iso.ISO_TYPES.gate_arch.height, 222, '城门拱洞 222px');
  eq(iso.ISO_TYPES.house.w, 4, '屋身 4 格宽（与 4 格墙板一致）');
  eq(iso.ISO_TYPES.house.h, 4, '屋身 4 格深（两面墙各 4 格）');

  // 组合式房屋：墙 sw+se、前后坡、屋脊、山墙端面共 7 件，且脊线方向随朝向变化
  const houseItem = layout.items.find((i) => i.type === 'house');
  const pieces = iso.housePieces(houseItem);
  eq(pieces.length, 7, '房屋 7 个子构件');
  ok(pieces.some((p) => p.type === 'wall_wood' && p.facing === 'sw'), 'sw 墙面');
  ok(pieces.some((p) => p.type === 'wall_wood' && p.facing === 'se'), 'se 墙面');
  ok(pieces.filter((p) => p.type === 'roof_slope').length === 2, '双坡屋面两件');
  ok(pieces.some((p) => p.type === 'roof_ridge'), '屋脊一件');
  ok(pieces.filter((p) => p.type === 'roof_gable').length === 2, '两端山墙各一件');
  const facingU = iso.housePieces({ ...houseItem, facing: 'sw' });
  const facingV = iso.housePieces({ ...houseItem, facing: 'se' });
  const roofFacings = (ps) => ps.filter((p) => p.type === 'roof_slope').map((p) => p.facing);
  ok(roofFacings(facingU).includes('sw') && roofFacings(facingU).includes('ne'), 'sw 朝向 → 前坡 sw / 后坡 ne（脊沿 gx）');
  ok(roofFacings(facingV).includes('se') && roofFacings(facingV).includes('nw'), 'se 朝向 → 前坡 se / 后坡 nw（脊沿 gy）');
  ok(facingU.every((p) => p.dy === 0 || p.dy <= -159), '屋面按美术标高直接叠放（默认不额外抬升）');
  const lifted = iso.housePieces({ ...houseItem, facing: 'sw' }, 170);
  const plainRidge = facingU.find((p) => p.type === 'roof_ridge');
  const liftedRidge = lifted.find((p) => p.type === 'roof_ridge');
  eq(liftedRidge.dy - plainRidge.dy, -170, 'rules.roofLift 仅对旧屋面构件兜底抬升');
  eq(raw.rules?.roofLift ?? 0, 0, '屋面兜底抬升默认 0（成套屋身落地即贴墙顶）');

  // 门脸变体：四坊手摆也混用三套门脸，房屋带 variant 字段
  const houseVariants = new Set(layout.items.filter((i) => i.type === 'house').map((i) => i.variant).filter(Boolean));
  ok(houseVariants.size >= 3, `四坊实际混用 ${houseVariants.size} 套门脸`);

  // 模块 / 布局命名契约 + 四向贴图回退
  eq(art.isoLayoutUrl('taoyuan'), '/assets/art/iso/taoyuan.json', '布局路径');
  eq(art.isoModuleUrl('house', 'wood'), '/assets/art/iso/house_wood.png', '带变体模块');
  eq(art.isoModuleUrl('tree'), '/assets/art/iso/tree.png', '缺省变体模块');
  eq(art.isoModuleUrl('house', 'wood', 'ne'), '/assets/art/iso/house_wood_ne.png', '四向模块命名');
  const ne = art.isoModuleCandidates('house', 'wood', 'ne');
  eq(ne[0], '/assets/art/iso/house_wood_ne.png', '优先目标朝向');
  ok(ne.includes('/assets/art/iso/house_wood_sw.png'), '缺图回退 sw');
  const sw = art.isoModuleCandidates('stall', 'silk', 'sw');
  eq(sw[0], '/assets/art/iso/stall_silk_sw.png', 'sw 首选自身');
  ok(sw.includes('/assets/art/iso/stall.png'), '变体缺图时回退到单图 `<type>.png`');
  ok(art.isoModuleCandidates('tree', undefined, 'se').includes('/assets/art/iso/tree_sw.png'), '无变体也回退 sw');
  const houseSe = art.isoHouseCandidates('se', 'lattice');
  eq(houseSe[0], '/assets/art/iso/house_4x4_se_lattice.png', 'se 门脸变体真实图优先（不再镜像 sw）');
  eq(houseSe.length, 2, 'se 只保留 变体 → 同向基础屋身 两条候选');
  eq(houseSe[1], '/assets/art/iso/house_4x4_se.png', 'se 缺变体时回退同向基础屋身');
  const houseNe = art.isoHouseCandidates('ne', 'carved');
  eq(houseNe.length, 1, 'ne 背面门脸不参与取图（fallback=true）');
  eq(houseNe[0], '/assets/art/iso/house_4x4_ne.png', 'ne 直接回退基础屋身，不出现缺图占位');
  const houseSw = art.isoHouseCandidates('sw', 'shop');
  eq(houseSw[0], '/assets/art/iso/house_4x4_sw_shop.png', 'sw 门脸变体');
  // 四向 × 四变体共 16 件真实屋身图全部在盘（闭合检查无回退命中）
  for (const f of ['sw', 'se', 'ne', 'nw']) {
    for (const v of ['', 'lattice', 'carved', 'shop']) {
      const rel = `public/assets/art/iso/house_4x4_${f}${v ? `_${v}` : ''}.png`;
      ok(existsSync(path.join(ROOT, rel)), `屋身图在盘：${f}${v ? `/${v}` : ''}`);
    }
  }
});

test('怪组与出口落在各图自己的可行走区内，且沿专属路网铺开', () => {
  const heifeng = world.WORLD_MAPS.wild_heifeng;
  ok(heifeng.spawns.length >= 8, `青崖山道怪组数 ${heifeng.spawns.length}（沿之字栈道铺开）`);
  ok(heifeng.exits.length >= 3, '云京 / 渡忘川 / 玲珑洞天三个边界出口');
  for (const m of Object.values(world.WORLD_MAPS)) {
    for (const s of m.spawns) {
      ok(s.x >= m.bounds.minX && s.x <= m.bounds.maxX && s.y >= m.bounds.minY && s.y <= m.bounds.maxY,
        `${m.name} 怪组 (${s.x},${s.y}) 在本图可行走区内`);
    }
    for (const e of m.exits) {
      ok(e.x >= m.bounds.minX && e.x <= m.bounds.maxX && e.y >= m.bounds.minY && e.y <= m.bounds.maxY,
        `${m.name} 路牌 (${e.x},${e.y}) 在本图可行走区内`);
      ok(world.isWalkable(world.WORLD_MAPS[e.to], e.toX, e.toY),
        `${m.name} → ${e.label} 跨图落点在目标图 bounds 内`);
    }
  }
  ok(world.WORLD_MAPS.taoyuan.npc, '长老仍在市集广场');
  ok(world.WORLD_MAPS.taoyuan.tavern, '酒馆仍在广场北沿');
  ok(new Set(heifeng.spawns.map((s) => `${s.x}`)).size >= 6, '怪组分布在栈道不同路段（非区段复制）');
});

test('跨图 BFS 在大地图上仍可达；旧存档坐标仍合法', () => {
  for (const id of Object.keys(world.WORLD_MAPS)) {
    if (id === 'taoyuan') continue;
    ok(autoplay.routeExit(id, 'taoyuan'), `${id} 能回到云京`);
  }
  ok(autoplay.routeExit('taoyuan', 'wild_heifeng'), '云京能出城');
  const b = world.WORLD_MAPS.taoyuan.bounds;
  const g = world.newGame({ classId: 'xiake', petId: 'linghu', playerName: '回归测试' });
  ok(g.px >= b.minX && g.px <= b.maxX && g.py >= b.minY && g.py <= b.maxY, '新档出生点落在可行走区内');
});

test('地图原图契约：art/maps/<region>_0.png 为 1440×900 RGBA', () => {
  const dir = path.join(ROOT, 'public/assets/art/maps');
  for (const map of Object.values(world.WORLD_MAPS)) {
    const file = path.join(dir, `${map.scene}_0.png`);
    // 地府素材由另一条管线补入，未到位时允许先用占位
    if (map.id === 'difu' && !existsSync(file)) continue;
    ok(existsSync(file), `${map.name} 缺 ${map.scene}_0.png`);
    const info = pngInfo(file);
    eq(info.w, 1440, `${map.name} 地图宽`);
    eq(info.h, 900, `${map.name} 地图高`);
    eq(info.depth, 8, `${map.name} 位深`);
    eq(info.colorType, 6, `${map.name} 需为 RGBA`);
  }
});

test('战斗背景存在（art/battle/<region>.png）', () => {
  const dir = path.join(ROOT, 'public/assets/art/battle');
  for (const id of ['wild_heifeng', 'wild_luanzang', 'wild_shanxiao']) {
    ok(existsSync(path.join(dir, `${id}.png`)), `缺战斗背景 ${id}.png`);
  }
});

console.log('\n[12b] 一景一制：独立格网 / 边界出入口 / 专属路网（模块 12）');
const ISO_REGIONS = ['wild_heifeng', 'wild_luanzang', 'wild_shanxiao', 'difu'];
const sceneCache = new Map();
/** 读布局 → 展开 → 碰撞；同一张图只解析一次 */
function isoScene(id) {
  if (sceneCache.has(id)) return sceneCache.get(id);
  const m = world.WORLD_MAPS[id];
  const raw = JSON.parse(readFileSync(path.join(ROOT, 'public/assets/art', m.iso.layout), 'utf8'));
  const layout = iso.expandLayout(raw);
  const col = iso.buildCollision(layout);
  const walk = (gx, gy) => {
    const p = iso.cellToWorld(layout.grid, gx, gy);
    return iso.isoWalkable(col, layout.grid, p.x, p.y);
  };
  const value = { m, raw, layout, col, walk, walkXY: (x, y) => iso.isoWalkable(col, layout.grid, x, y) };
  sceneCache.set(id, value);
  return value;
}
/** 格坐标 → 世界坐标必须按「该图自己的格网」换算 */
const isoAt = (id, gx, gy) => iso.cellToWorld(world.isoGridOf(id), gx, gy);
const countType = (id, type) => isoScene(id).layout.items.filter((i) => i.type === type).length;
/** 边界带：距任意一条边 ≤1 格；云京北门嵌在城墙线上（宽城门楼 x59..68，券洞 gy4..6），门洞一带视作边界 */
const isBorder = (id, gx, gy) => {
  const g = world.isoGridOf(id);
  if (id === 'taoyuan' && gx >= 59 && gx <= 68 && gy >= 1 && gy <= 5) return true;
  return gx <= 1 || gy <= 1 || gx >= g.cols - 2 || gy >= g.rows - 2;
};

test('一景一制：五图各有独立格网，尺寸/形状参考云京但互不相同', () => {
  const city = world.ISO_GRIDS.taoyuan;
  eq(city.cols, 128, '云京列（基准）'); eq(city.rows, 128, '云京行（基准）');
  eq(world.ISO_GRID, city, '旧 ISO_GRID 别名仍指向云京');
  const shapes = new Set();
  for (const [id, m] of Object.entries(world.WORLD_MAPS)) {
    const g = world.isoGridOf(id);
    const raw = isoScene(id).raw;
    for (const [k, v] of Object.entries(g)) eq(raw.grid[k], v, `${m.name} 布局 grid.${k} 与 ISO_GRIDS 一致`);
    eq(g.tileW, 64, `${m.name} 菱形宽`); eq(g.tileH, 32, `${m.name} 菱形高 2:1`);
    eq(g.ox, g.rows * 32, `${m.name} ox 使左顶点贴 x=0`);
    eq(g.oy, 16, `${m.name} oy 使上顶点贴 y=0`);
    // 规模参考云京 8192×4096，但不必一致
    ok(m.w >= 8192 * 0.7 && m.w <= 8192, `${m.name} 宽 ${m.w} 与云京同量级`);
    ok(m.h >= 4096 * 0.7 && m.h <= 4096, `${m.name} 高 ${m.h} 与云京同量级`);
    shapes.add(`${g.cols}x${g.rows}`);
  }
  eq(shapes.size, 5, `五张图的格网形状互不相同（${[...shapes].join(' / ')}）`);
  for (const id of ISO_REGIONS) {
    const { raw, layout } = isoScene(id);
    ok(Array.isArray(raw.anchors?.spawns) && Array.isArray(raw.anchors?.exits), `${id} 布局带玩法锚点`);
    ok(layout.items.length >= 400 && layout.items.length <= 1500, `${id} 构件数 ${layout.items.length}（视口裁剪可控）`);
    ok(raw.signature && raw.tagline, `${id} 声明了专属路网签名`);
  }
});

test('地图切换的出口与入口全部贴在格网边界，且落点落在对方边界路牌上', () => {
  let n = 0;
  for (const [id, m] of Object.entries(world.WORLD_MAPS)) {
    for (const e of m.exits) {
      const target = world.WORLD_MAPS[e.to];
      ok(target, `${m.name} 路牌 ${e.label} 的目标图存在`);
      const from = iso.cellAt(world.isoGridOf(id), e.x, e.y);
      const to = iso.cellAt(world.isoGridOf(e.to), e.toX, e.toY);
      ok(isBorder(id, from.gx, from.gy), `${m.name} 出口 ${e.label} (${from.gx},${from.gy}) 在边界`);
      ok(isBorder(e.to, to.gx, to.gy), `${m.name} → ${e.label} 入口 (${to.gx},${to.gy}) 在边界`);
      ok(target.exits.some((te) => Math.abs(te.x - e.toX) < 1 && Math.abs(te.y - e.toY) < 1),
        `${m.name} → ${e.label} 的落点正好是对方边界路牌（可立即回程）`);
      n++;
    }
  }
  ok(n >= 9, `出入口总数 ${n}（含新开的忘川 ⇄ 幽都水路）`);
  for (const id of Object.keys(world.WORLD_MAPS)) {
    if (id === 'taoyuan') continue;
    ok(autoplay.routeExit(id, 'taoyuan'), `${id} 能沿边界路牌回到云京`);
  }
  ok(autoplay.routeExit('taoyuan', 'difu'), '云京可经山道 → 忘川 → 幽都');
});

test('布局锚点与 world.ts 玩法坐标逐条一致（怪组 / 边界路牌 / 跨图落点 / NPC）', () => {
  for (const id of ISO_REGIONS) {
    const { m, raw, walk } = isoScene(id);
    const a = raw.anchors;
    eq(m.spawns.length, a.spawns.length, `${m.name} 怪组数`);
    a.spawns.forEach((s, i) => {
      const p = isoAt(id, s.gx, s.gy);
      eq(m.spawns[i].x, p.x, `${m.name} 怪组 ${i} x`);
      eq(m.spawns[i].y, p.y, `${m.name} 怪组 ${i} y`);
      eq(m.spawns[i].group.join(','), s.group.join(','), `${m.name} 怪组 ${i} 阵容`);
      ok(walk(s.gx, s.gy), `${m.name} 怪组 ${i} 所在格可走`);
    });
    eq(m.exits.length, a.exits.length, `${m.name} 路牌数`);
    a.exits.forEach((e, i) => {
      // 源格用本图格网，落点用目标图格网（两张图尺寸不同，绝不能共用一套换算）
      const p = isoAt(id, e.gx, e.gy);
      const q = isoAt(e.to, e.toGx, e.toGy);
      eq(m.exits[i].x, p.x, `${m.name} 路牌 ${i} x`);
      eq(m.exits[i].y, p.y, `${m.name} 路牌 ${i} y`);
      eq(m.exits[i].to, e.to, `${m.name} 路牌 ${i} 目标图`);
      eq(m.exits[i].toX, q.x, `${m.name} 路牌 ${i} 落点 x`);
      eq(m.exits[i].toY, q.y, `${m.name} 路牌 ${i} 落点 y`);
      eq(m.exits[i].label, e.label, `${m.name} 路牌 ${i} 文案`);
      ok(isBorder(id, e.gx, e.gy), `${m.name} 路牌 ${i} 锚点在边界`);
      ok(isBorder(e.to, e.toGx, e.toGy), `${m.name} 路牌 ${i} 落点在对方边界`);
    });
    if (a.npc) {
      const p = isoAt(id, a.npc.gx, a.npc.gy);
      eq(m.npc?.x, p.x, `${m.name} NPC x`);
      eq(m.npc?.y, p.y, `${m.name} NPC y`);
      eq(m.npc?.name, a.npc.name, `${m.name} NPC 名`);
    }
  }
});

test('五图所有玩法点与跨图落点都落在等距可走格', () => {
  for (const [id] of Object.entries(world.WORLD_MAPS)) {
    const { m, walkXY } = isoScene(id);
    for (const s of m.spawns) ok(walkXY(s.x, s.y), `${m.name} 怪组 (${s.x},${s.y}) 可走`);
    for (const e of m.exits) ok(walkXY(e.x, e.y), `${m.name} 路牌 ${e.label} 可走`);
    if (m.npc) ok(walkXY(m.npc.x, m.npc.y), `${m.name} NPC 可走`);
    if (m.tavern) ok(walkXY(m.tavern.x, m.tavern.y), `${m.name} 酒肆可走`);
  }
  for (const m of Object.values(world.WORLD_MAPS)) {
    for (const e of m.exits) {
      ok(isoScene(e.to).walkXY(e.toX, e.toY), `${m.name} → ${e.label} 落点可走`);
    }
  }
  const mengpo = world.WORLD_MAPS.difu.npc;
  ok(isoScene('difu').walkXY(mengpo.x - 64, mengpo.y + 32), '战败重生落点（孟婆身旁）可走');
});

test('四张布局：构件不越界、全部边界出入口与玩法点两两 BFS 连通', () => {
  for (const id of ISO_REGIONS) {
    const { layout, col, raw, walk } = isoScene(id);
    for (const it of layout.items) {
      const s = iso.isoSize(it);
      ok(it.gx >= 0 && it.gy >= 0 && it.gx + s.w <= layout.grid.cols && it.gy + s.h <= layout.grid.rows,
        `${id} 构件越界: ${it.type} (${it.gx},${it.gy}) ${s.w}×${s.h}`);
    }
    const pts = [
      ...raw.anchors.exits.map((e) => ({ gx: e.gx, gy: e.gy, name: `出口 ${e.label}` })),
      ...raw.anchors.spawns.map((s) => ({ gx: s.gx, gy: s.gy, name: `怪组 (${s.gx},${s.gy})` })),
      ...(raw.anchors.npc ? [{ gx: raw.anchors.npc.gx, gy: raw.anchors.npc.gy, name: `NPC ${raw.anchors.npc.name}` }] : []),
    ];
    const from = { gx: pts[0].gx, gy: pts[0].gy };
    for (const p of pts) ok(walk(p.gx, p.gy), `${id} ${p.name} 可走`);
    for (let i = 1; i < pts.length; i++) {
      ok(iso.findIsoPath(col, layout.grid, from, { gx: pts[i].gx, gy: pts[i].gy }) !== null,
        `${id} ${pts[0].name} ⇄ ${pts[i].name} 路网连通`);
    }
    // 水面 / 桥面 / 牌坊券洞：只对该图实际存在的构件校验
    const water = layout.items.find((it) => it.type === 'ground_water');
    if (water) ok(!walk(water.gx, water.gy), `${id} 水面不可走`);
    const bridge = layout.items.find((it) => it.type === 'bridge');
    if (bridge) ok(walk(bridge.gx + 1, bridge.gy + 2), `${id} 桥面可走`);
    const arch = layout.items.find((it) => it.type === 'paifang');
    if (arch) ok(walk(arch.gx + 1, arch.gy + 1), `${id} 牌坊券洞可穿行`);
  }
});

test('四景路网与地标各具特色，不再共用十字广场 / 中心券门', () => {
  const sigs = new Set(ISO_REGIONS.map((id) => isoScene(id).raw.signature));
  eq(sigs.size, 4, `四种专属路网签名（${[...sigs].join(' / ')}）`);
  const mixes = ISO_REGIONS.map((id) =>
    ['ground_grass', 'ground_dirt', 'ground_stone', 'ground_water'].map((t) => countType(id, t)).join('/'));
  eq(new Set(mixes).size, 4, '四图地表铺装组合互不相同');
  for (const id of ISO_REGIONS) {
    eq(countType(id, 'gate_arch'), 0, `${id} 不再摆统一中心券门`);
    ok(countType(id, 'hall') >= 1, `${id} 有专属大殿地标`);
  }
  ok(countType('wild_heifeng', 'tree') > countType('wild_heifeng', 'rock') * 1.5, '青崖山道：林海');
  eq(countType('wild_heifeng', 'paifang'), 3, '青崖山道：三个山口各一牌坊');
  eq(countType('wild_heifeng', 'bridge'), 4, '青崖山道：三溪一涧的石桥');
  eq(isoScene('wild_heifeng').raw.signature, 'switchback-ridge', '之字盘山签名');

  ok(countType('wild_luanzang', 'ground_water') > 80 && countType('wild_luanzang', 'bridge') >= 6,
    '渡忘川：斜河水网 + 六渡石桥');
  ok(countType('wild_luanzang', 'fence') >= 20, '渡忘川：两岸芦苇');
  eq(isoScene('wild_luanzang').raw.signature, 'diagonal-river', '斜河双堤签名');

  ok(countType('wild_shanxiao', 'rock') > 600, '玲珑洞天：晶壁围合');
  eq(countType('wild_shanxiao', 'stairs'), 4, '玲珑洞天：四条放射石阶');
  ok(countType('wild_shanxiao', 'city_wall_u6') >= 4, '玲珑洞天：真实城墙洞壁');
  eq(isoScene('wild_shanxiao').raw.signature, 'ring-cavern', '环形洞厅签名');

  ok(countType('difu', 'stele') >= 20 && countType('difu', 'lantern_post') >= 30, '地府：碑阵与引魂灯');
  eq(countType('difu', 'bridge'), 1, '地府：唯独奈何桥');
  eq(isoScene('difu').raw.signature, 'straight-road', '黄泉直道签名');
});

console.log('\n[13] 国风美术映射（模块 8）');
test('映射表覆盖所有职业 / 宠物 / 遭遇 / 地图场景', () => {
  for (const c of content.CLASSES) ok(art.CLASS_ART[c.id], `职业缺映射 ${c.id}`);
  for (const p of content.PETS) ok(art.PET_ART[p.id], `宠物缺映射 ${p.id}`);
  ok(art.SCENE_ART.default, '默认战斗背景');
  for (const e of content.ENCOUNTERS) ok(art.SCENE_ART[e.id], `遭遇背景缺映射 ${e.id}`);
  for (const m of Object.values(world.WORLD_MAPS)) ok(art.SCENE_ART[m.scene], `地图场景缺映射 ${m.scene}`);
  ok(art.ITEM_ART.heal && art.ITEM_ART.mana, '道具图标');
  ok(art.UI_ART.panel && art.UI_ART.divider, 'UI 组件');
});

test('所有被引用的国风素材文件都存在', () => {
  const files = art.allArtFiles();
  ok(files.length >= 30, `素材引用数 ${files.length}`);
  for (const f of files) ok(existsSync(path.join(ROOT, 'public/assets/art', f)), `缺素材 ${f}`);
  ok(existsSync(path.join(ROOT, 'public/assets/art/atlas.json')), '图集坐标文件');
});

test('国风主色与 artUrl 契约', () => {
  eq(art.ART_THEME.vermilion, '#a63d2f', '朱红');
  eq(art.ART_THEME.indigo, '#2f4a5c', '靛青');
  eq(art.ART_THEME.ochreGold, '#b8892f', '赭金');
  eq(art.ART_THEME.cream, '#f7f0dd', '米白');
  ok(art.artUrl('ui/ui_panel_base.png').startsWith('/assets/art/'), 'URL 前缀');
});

console.log('\n[14] 世界观文案统一（模块 9）');
const OLD_LORE = [
  '桃源镇', '黑风岭', '乱葬岗', '山魈岭', '缉妖司', '野狼', '骷髅兵', '蜘蛛精',
  '缉狼令', '净乱葬', '讨山魈', '灵狐', '岩甲兽', '雷隼', '黑熊精',
  '游方巫祝', '云游灵官', '北荒刀客', '酒馆老板',
];
test('所有显示文案已无旧世界观词', () => {
  const texts = [
    ...content.CLASSES.flatMap((c) => [c.name, c.race, c.sect, c.desc]),
    ...content.PETS.flatMap((p) => [p.name, p.desc]),
    ...Object.values(content.MONSTERS).map((m) => m.name),
    ...content.ENCOUNTERS.flatMap((e) => [e.name, e.desc]),
    ...Object.values(world.WORLD_MAPS).flatMap((m) => [
      m.name, ...m.exits.map((x) => x.label), m.npc?.name ?? '', m.tavern?.name ?? '',
    ]),
    ...world.QUESTS.flatMap((q) => [q.name, q.desc, q.targets.label]),
    ...world.COMPANION_TEMPLATES.map((t) => t.name),
  ];
  for (const t of texts) {
    for (const w of OLD_LORE) ok(!t.includes(w), `残留旧词「${w}」于「${t}」`);
  }
});

test('id 与数值完全不变（存档兼容 / 平衡不变）', () => {
  eq(content.CLASSES.map((c) => c.id).join(','), 'xiake,lingguan,moshi,wuzhu', '职业 id');
  eq(content.PETS.map((p) => p.id).join(','), 'linghu,yanjia,leisun', '宠物 id');
  eq(Object.keys(content.MONSTERS).join(','), 'yelang,heixiong,kulou,zhizhu,shanxiao,shanxiaowang', '怪物 id');
  eq(Object.keys(world.WORLD_MAPS).join(','), 'taoyuan,wild_heifeng,wild_luanzang,wild_shanxiao,difu', '地图 id（新增地府重生点）');
  eq(world.QUESTS.map((q) => q.id).join(','), 'q1,q2,q3', '任务 id');
  eq(world.QUESTS.map((q) => q.targets.need).join(','), '3,4,1', '任务目标数');
  eq(world.QUESTS.map((q) => q.rewardSilver).join(','), '100,160,300', '任务赏银');
  eq(content.CLASSES[0].stats.hp, 620, '职业数值');
  eq(content.MONSTERS.yelang.stats.hp, 230, '怪物数值');
  eq(world.DEFAULT_SEGMENTS, 8, '地图区段');
  eq(world.WORLD_MAPS.taoyuan.bounds.maxX, world.WORLD_MAPS.taoyuan.w, '可行走区覆盖整个菱形');
});

test('新世界观命名与 NPC 对话到位', () => {
  eq(world.WORLD_MAPS.taoyuan.name, '云京', '主城');
  eq(world.WORLD_MAPS.wild_heifeng.name, '青崖山道', '山野');
  eq(world.WORLD_MAPS.wild_luanzang.name, '渡忘川', '幽冥');
  eq(world.WORLD_MAPS.wild_shanxiao.name, '玲珑洞天', '洞府');
  eq(world.WORLD_MAPS.taoyuan.npc?.name, '玄鹤长老', 'NPC');
  eq(world.QUESTS[0].name, '青崖清狼', '首环任务');
  eq(content.CLASSES[0].name, '云岚', '人族角色');
  ok(world.dialogueFor(fresh()).text.includes('青崖山道'), '接任务对话含新地名');
  const done = fresh(); done.questStep = world.QUESTS.length + 1;
  ok(world.dialogueFor(done).text.includes('云京'), '收尾对话含云京');
  ok(world.WORLD_MAPS.taoyuan.exits[0].label === '青崖山道', '路牌文案统一');
});

console.log('\n[15] 国风地图与悬赏榜（模块 10）');
test('每张世界地图都有对应的国风满幅背景', () => {
  for (const m of Object.values(world.WORLD_MAPS)) {
    // 地府原画尚未到位，渲染层先用占位底色，不阻塞死亡重生流程
    if (m.id === 'difu') continue;
    ok(art.WORLD_TILE_ART[m.scene], `${m.name} 缺背景映射`);
    ok(existsSync(path.join(ROOT, 'public/assets/art', art.WORLD_TILE_ART[m.scene])), `缺背景文件 ${m.scene}`);
  }
  eq(Object.keys(art.WORLD_TILE_ART).length, 4, '四张地图各一张');
  ok(art.allArtFiles().includes(art.WORLD_TILE_ART.taoyuan), '纳入素材自检清单');
});

test('悬赏榜所需数据完整（任务名 / 描述 / 进度 / 奖赏）', () => {
  for (const q of world.QUESTS) {
    ok(q.name && q.desc && q.targets.label, `${q.id} 文案齐全`);
    ok(q.targets.need > 0 && q.rewardSilver > 0, `${q.id} 数值有效`);
    ok(Object.keys(q.rewardItems).length > 0, `${q.id} 有奖赏`);
  }
  ok(world.dialogueFor(fresh()).actions.some((a) => a.kind === 'accept'), '有接取动作');
});

console.log('\n[16] 等距青崖山道（模块 12）');
test('全部等距图布局文件合法，世界尺寸由各自格网推导（一景一制）', () => {
  const isoMaps = Object.values(world.WORLD_MAPS).filter((m) => m.iso);
  ok(isoMaps.length >= 5, `等距地图数 ${isoMaps.length}`);
  for (const m of isoMaps) {
    const g = world.isoGridOf(m.id);
    const size = world.isoWorldSize(g);
    eq(m.w, size.w, `${m.name} 宽由格网推导`);
    eq(m.h, size.h, `${m.name} 高由格网推导`);
    const f = path.join(ROOT, 'public/assets/art', m.iso.layout);
    ok(existsSync(f), `${m.name} 布局文件存在 ${m.iso.layout}`);
    const d = JSON.parse(readFileSync(f, 'utf8'));
    eq(d.grid.cols, g.cols, `${m.name} 网格列与 ISO_GRIDS 一致`);
    eq(d.grid.rows, g.rows, `${m.name} 网格行`);
    eq(d.grid.tileW, g.tileW, `${m.name} 菱形宽`);
    eq(d.grid.tileH, g.tileH, `${m.name} 菱形高`);
    ok(Array.isArray(d.items) && d.items.length > 100, `${m.name} 布局构件数 ${d.items.length}`);
  }
});

test('青崖山道主题构件齐全，怪组与出口按格网锚定', () => {
  const f = path.join(ROOT, 'public/assets/art', 'iso/wild_heifeng.json');
  const d = JSON.parse(readFileSync(f, 'utf8'));
  const n = (t) => d.items.filter((i) => i.type === t).length;
  ok(n('ground_dirt') >= 50, '之字山径土路');
  ok(n('ground_water') >= 50, '溪涧水带');
  ok(n('bridge') >= 2, '跨溪石桥');
  ok(n('tree') >= 200, `山林 ${n('tree')} 棵`);
  ok(n('rock') >= 60, '山石');
  ok(n('paifang') >= 2 && n('house') >= 2, '山门 / 崖口牌坊与屋舍');
  ok(n('stele') >= 5 && n('lantern_post') >= 5, '石碑与灯柱点景');
  const heifeng = world.WORLD_MAPS.wild_heifeng;
  ok(heifeng.spawns.length >= 8, `怪组 ${heifeng.spawns.length} 组沿栈道铺开`);
  eq(heifeng.exits.length, 3, '三个边界出口');
  for (const src of ['wild_luanzang', 'wild_shanxiao']) {
    const back = world.WORLD_MAPS[src].exits.find((e) => e.to === 'wild_heifeng');
    ok(back && back.toX >= heifeng.bounds.minX && back.toX <= heifeng.bounds.maxX,
      `${src} 回山道落点在等距界内`);
  }
});

test('山道怪组、出口与跨图落点都落在碰撞层可走格', () => {
  const f = path.join(ROOT, 'public/assets/art', 'iso/wild_heifeng.json');
  const layout = JSON.parse(readFileSync(f, 'utf8'));
  const col = iso.buildCollision(layout);
  const m = world.WORLD_MAPS.wild_heifeng;
  const walkable = (x, y) => iso.isoWalkable(col, layout.grid, x, y);
  for (const s of m.spawns) ok(walkable(s.x, s.y), `怪组 (${s.x},${s.y}) 可走`);
  for (const e of m.exits) ok(walkable(e.x, e.y), `出口 (${e.x},${e.y}) 可走`);
  const entries = [
    world.WORLD_MAPS.taoyuan.exits[0],
    ...['wild_luanzang', 'wild_shanxiao'].map((id) => world.WORLD_MAPS[id].exits.find((e) => e.to === 'wild_heifeng')),
  ];
  for (const e of entries) {
    ok(e && walkable(e.toX, e.toY), `入山道落点 (${e?.toX},${e?.toY}) 可走`);
  }
});

test('跨图落点安全：不压圈或恰好落在成对回程路牌上（落地屏蔽保护）', () => {
  let count = 0;
  for (const src of Object.values(world.WORLD_MAPS)) {
    for (const e of src.exits) {
      const dest = world.WORLD_MAPS[e.to];
      ok(dest, `${src.id} 的出口目标 ${e.to} 存在`);
      ok(world.isWalkable(dest, e.toX, e.toY),
        `${src.id}→${dest.name} 落点 (${e.toX},${e.toY}) 在目标图可行走区内`);
      const blocked = world.exitsSuppressedOnArrival(dest, { x: e.toX, y: e.toY });
      // 一景一制下落点允许「即回程路牌」：此时被压的圈必须是路牌本体（坐标重合），
      // 渲染层在玩家首次走出触发圈前屏蔽这些出口，不会抵达当帧被传回
      for (const i of blocked) {
        const sign = dest.exits[i];
        ok(Math.abs(sign.x - e.toX) < 1 && Math.abs(sign.y - e.toY) < 1,
          `${src.id}→${dest.name} 压圈的只能是成对回程路牌本体（第 ${i} 号）`);
      }
      count++;
    }
  }
  ok(count >= 9, `覆盖跨图出口 ${count} 条`);
  // 保护函数本身：路牌本体坐标必然被识别；远离全部路牌的点不触发屏蔽
  const g = world.isoGridOf('wild_heifeng');
  const signPos = iso.cellToWorld(g, 32, 1);
  ok(world.exitsSuppressedOnArrival(world.WORLD_MAPS.wild_heifeng, signPos).length > 0,
    '落地屏蔽能识别压在路牌上的落点');
  ok(world.exitsSuppressedOnArrival(world.WORLD_MAPS.wild_heifeng, { x: signPos.x + 400, y: signPos.y + 400 }).length === 0,
    '远离路牌的落点无需屏蔽');
});

test('等距 A* 绕开城墙，从云京起点可走到出城路牌', () => {
  const f = path.join(ROOT, 'public/assets/art', 'iso/taoyuan.json');
  const layout = iso.expandLayout(JSON.parse(readFileSync(f, 'utf8')));
  const col = iso.buildCollision(layout);
  const g = layout.grid;
  const map = world.WORLD_MAPS.taoyuan;
  const start = { x: 3584, y: 784 };
  const gate = map.exits[0];
  ok(!isopath.isoLineClear(col, g, start, { x: gate.x, y: gate.y }), '起点到城门的直线确实被城墙挡住');
  const plan = isopath.planIsoPath(col, g, start, { x: gate.x, y: gate.y }, map.bounds);
  ok(plan.found, 'A* 找到绕行路径');
  ok(plan.waypoints.length >= 2 && plan.cells > 20, `路径为多段绕行（${plan.waypoints.length} 段 / ${plan.cells} 格）`);
  let prev = start;
  for (const w of plan.waypoints) {
    ok(isopath.isoLineClear(col, g, prev, w), `路径段 (${Math.round(w.x)},${Math.round(w.y)}) 全程可走`);
    prev = w;
  }
  ok(Math.hypot(prev.x - gate.x, prev.y - gate.y) < gate.r, '终点进入城门路牌触发圈');
  ok(isopath.nearestWalkablePoint(col, g, { x: 4096, y: 2048 }) !== null, '舆图点击落点可就近吸附');
});

test('等距 A* 从入山落点可走到青崖山道全部三个出口', () => {
  const f = path.join(ROOT, 'public/assets/art', 'iso/wild_heifeng.json');
  const layout = iso.expandLayout(JSON.parse(readFileSync(f, 'utf8')));
  const col = iso.buildCollision(layout);
  const g = layout.grid;
  const map = world.WORLD_MAPS.wild_heifeng;
  const start = { x: 4000, y: 608 };
  for (const e of map.exits) {
    const plan = isopath.planIsoPath(col, g, start, { x: e.x, y: e.y }, map.bounds);
    ok(plan.found, `从入山口可走到「${e.label}」路牌`);
    let prev = start;
    for (const w of plan.waypoints) {
      ok(isopath.isoLineClear(col, g, prev, w), `「${e.label}」路径段可走`);
      prev = w;
    }
  }
});

console.log(`\n=== 结果：${passed} 通过 / ${failures.length} 失败 ===\n`);
if (failures.length) {
  for (const f of failures) console.error(`  ✗ ${f.name}: ${f.message}`);
  process.exit(1);
}
