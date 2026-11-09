import '../style.css';
import { clearSave, loadGame, newGame, WORLD_MAPS, type GameState } from '../core/world';
import { simulateAll } from '../core/sim';
import { CLASSES, PETS } from '../core/content';
import { h } from './dom';
import { WorldScreen } from './world-screen';
import { renderSetup, type SetupResult } from './setup-screen';
import { audio } from '../audio/audio';

const app = document.getElementById('app')!;

// 浏览器自动播放策略：首次用户交互才创建/恢复 AudioContext
document.addEventListener('pointerdown', () => audio.unlock(), { once: true });
document.addEventListener('keydown', () => audio.unlock(), { once: true });

if (location.hash === '#sim') {
  renderSim();
} else {
  // 开发态截图辅助：?play=1 直接开局；可叠加 ?map=<id> 直达任意场景，
  // 并把角色落到该图第一个边界出入口旁，方便验收各图边界与渲染。
  const devPlay = import.meta.env.DEV
    ? new URLSearchParams(location.search).get('play')
    : null;
  if (devPlay) {
    const params = new URLSearchParams(location.search);
    const devMap = params.get('map');
    clearSave();
    const gs = newGame({ classId: CLASSES[0].id, petId: PETS[0].id, playerName: '测试少侠' });
    if (devMap && WORLD_MAPS[devMap]) {
      const def = WORLD_MAPS[devMap];
      const portal = def.exits[0];
      gs.mapId = devMap;
      gs.px = portal ? portal.x : def.w / 2;
      gs.py = portal ? portal.y : def.h / 2;
    }
    void showWorld(gs);
  } else {
    showSetup();
  }
}

// hash 变化（如进入/退出 #sim）时整体重载，路由判断在启动时进行
window.addEventListener('hashchange', () => location.reload());

function showSetup(): void {
  audio.setScene('setup');
  const save = loadGame();
  renderSetup(app, {
    hasSave: !!save,
    onContinue: () => void showWorld(save!),
    onStart: (r: SetupResult) => {
      clearSave();
      void showWorld(newGame(r));
    },
  });
}

function showWorld(gs: GameState): void {
  void WorldScreen.create(app, gs, { onExitToSetup: () => showSetup() });
}

/** 数值仿真报告（地址栏 #sim 进入）：批量跑完整战斗，看各职业胜率 */
function renderSim(): void {
  app.innerHTML = '';
  const pre = h('pre', { class: 'sim-report' }, '仿真中…');
  app.append(
    h('div', { class: 'setup' },
      h('h1', { class: 'game-title' }, '山 海 奇 谭'),
      h('div', { class: 'game-sub' }, '数值仿真 · AI 执挥双方'),
      pre,
      h('div', { style: 'text-align:center;margin-top:16px' },
        h('button', { class: 'btn', onclick: () => { location.hash = ''; location.reload(); } }, '返回游戏'),
      ),
    ),
  );
  const t0 = performance.now();
  const results = simulateAll('linghu', 36);
  const dt = Math.round(performance.now() - t0);
  const lines = [
    `灵兽固定：${PETS[0].name} ｜ 每职业 36 场（三种遭遇轮换）｜ 耗时 ${dt}ms`,
    '',
    ...results.map((r) =>
      `${r.className}：胜率 ${(r.wins / r.total * 100).toFixed(0)}%（${r.wins}/${r.total}）`
      + `  平均 ${r.avgRounds.toFixed(1)} 回合  胜场平均 ${r.avgWinRounds.toFixed(1)} 回合`,
    ),
  ];
  pre.textContent = lines.join('\n');
}
