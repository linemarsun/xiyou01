/**
 * Chrome CDP 冒烟：云京城门出口 + 舆图快捷键。
 * 前置：无头 Chrome --remote-debugging-port=9223；dev server 5199。
 */
const DEBUG_PORT = 9223;
const GAME_URL = 'http://localhost:5199/';

const list = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`)).json();
const page = list.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));

let seq = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
};
function send(method, params = {}) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res) => pending.set(id, res));
}
async function evalJs(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error('eval failed: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 300));
  return r.result?.result?.value;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: GAME_URL });
await sleep(2500);

// —— 1. 主菜单 → 建角进世界（沿用 UI 按钮文本驱动）——
const menuInfo = await evalJs(`(() => {
  const btns = [...document.querySelectorAll('button')].map(b => b.textContent.trim());
  return JSON.stringify(btns);
})()`);
console.log('[menu buttons]', menuInfo);

// 依次点「启程/开始」类按钮（有名字输入就填）
const started = await evalJs(`(async () => {
  const input = document.querySelector('input.name-input, input');
  if (input && !input.value) { input.value = '冒烟侠'; input.dispatchEvent(new Event('input', { bubbles: true })); }
  const kw = ['启程', '开始', '进入', '踏上'];
  const btn = [...document.querySelectorAll('button')].find(b => kw.some(k => b.textContent.replace(/\\s+/g, '').includes(k)));
  if (btn) { btn.click(); return btn.textContent.trim(); }
  return null;
})()`);
console.log('[start clicked]', started);
await sleep(3500);

// —— 2. 校验出口路牌位置 = 城门 (62,3) → 世界 (5984,1056) ——
const exitInfo = await evalJs(`(() => {
  const s = window.__shanhai; if (!s) return null;
  const info = s.info();
  return JSON.stringify({ mapId: info.mapId, exits: info.exits ?? null, player: s.playerPos() });
})()`);
console.log('[world info]', exitInfo);

// —— 3. M 键开关舆图 ——
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'm', code: 'KeyM', windowsVirtualKeyCode: 77 });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'm', code: 'KeyM', windowsVirtualKeyCode: 77 });
await sleep(600);
const panelOpen = await evalJs(`(() => {
  const p = document.querySelector('.dialogue.map-panel');
  const canvas = p ? p.querySelector('canvas') : null;
  return JSON.stringify({ open: !!p && getComputedStyle(p).display !== 'none', hasCanvas: !!canvas,
    cw: canvas ? canvas.width : 0 });
})()`);
console.log('[map panel after M]', panelOpen);

// 再按一次 M 关闭
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'm', code: 'KeyM', windowsVirtualKeyCode: 77 });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'm', code: 'KeyM', windowsVirtualKeyCode: 77 });
await sleep(400);
const panelClosed = await evalJs(`JSON.stringify({ open: !!(document.querySelector('.dialogue.map-panel')?.offsetParent) })`);
console.log('[map panel after M again]', panelClosed);

// —— 4. 传送到城门附近，验证 3 秒内不弹回（出口就在旁边，屏蔽保护生效）——
const tp = await evalJs(`(async () => {
  const s = window.__shanhai; if (!s) return null;
  s.teleport(5904, 1104); // 城门内侧街面（62,5 附近），紧邻出口 (5984,1056)
  await new Promise(r => setTimeout(r, 3000));
  return JSON.stringify({ pos: s.playerPos(), info: s.info() });
})()`);
console.log('[after teleport near gate]', tp);

const errs = await evalJs(`window.__errors ? JSON.stringify(window.__errors) : 'n/a'`);
console.log('[errors]', errs);
ws.close();
process.exit(0);
