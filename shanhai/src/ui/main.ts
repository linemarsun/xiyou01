import '../style.css';
import { clearSave, loadGame, newGame, type GameState } from '../core/world';
import { simulateAll } from '../core/sim';
import { h } from './dom';
import { WorldScreen } from './world-screen';
import { renderSetup, type SetupResult } from './setup-screen';

const app = document.getElementById('app')!;

if (location.hash === '#sim') {
  renderSim();
} else {
  showSetup();
}

// hash 变化（如进入/退出 #sim）时整体重载，路由判断在启动时进行
window.addEventListener('hashchange', () => location.reload());

function showSetup(): void {
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
  void WorldScreen.create(app, gs, { onExitToSetup: () => showSetup() }).then((ws) => {
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__shanhai = {
        state: () => ws.getState(),
        playerPos: () => ws.playerPos(),
        info: () => ws.debugInfo(),
        moveTo: (x: number, y: number) => ws.debugMoveTo(x, y),
      };
    }
  });
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
    `宠物固定：灵狐 ｜ 每职业 36 场（三种遭遇轮换）｜ 耗时 ${dt}ms`,
    '',
    ...results.map((r) =>
      `${r.className}：胜率 ${(r.wins / r.total * 100).toFixed(0)}%（${r.wins}/${r.total}）`
      + `  平均 ${r.avgRounds.toFixed(1)} 回合  胜场平均 ${r.avgWinRounds.toFixed(1)} 回合`,
    ),
  ];
  pre.textContent = lines.join('\n');
}
