/** CDP 冒烟 3：宽城门楼渲染 + 宽券洞通行 + 截图 */
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
// 直达城门近景：?at=5920,1088 落到门洞内，?view=0.55,5984,1056 聚焦城门
await send('Page.navigate', { url: GAME_URL + '?at=5920,1088&view=0.55,5984,1000' });
await sleep(2500);
await evalJs(`(async () => {
  const input = document.querySelector('input.name-input, input');
  if (input && !input.value) { input.value = '冒烟侠'; input.dispatchEvent(new Event('input', { bubbles: true })); }
  [...document.querySelectorAll('button')].find(b => b.textContent.replace(/\\s+/g, '').includes('开始冒险'))?.click();
  await new Promise(r => setTimeout(r, 3500));
  return true;
})()`);
await sleep(1500);

// 宽券洞各列可走性（碰撞层实测）
const lane = await evalJs(`(async () => {
  const s = window.__shanhai;
  const info = s.info();
  const cells = [];
  for (const gx of [60, 62, 64, 66, 67]) {
    for (const gy of [4, 5, 6]) cells.push([gx, gy]);
  }
  return JSON.stringify({ mode: info.map.mode, cols: info.iso.cols, playerCell: info.iso.playerCell });
})()`);
console.log('[城门区]', lane);

// 截图城门近景
await sleep(800);
const shot = await send('Page.captureScreenshot', { format: 'png' });
const { writeFileSync } = await import('node:fs');
writeFileSync('tools/_shot_widegate.png', Buffer.from(shot.result.data, 'base64'));
console.log('[截图] tools/_shot_widegate.png');

// 传送穿越：从门外 (62,2) 走到门内 (62,5)，应全程无阻
const pass = await evalJs(`(async () => {
  const s = window.__shanhai;
  s.teleport(5984, 1024); // (62,2) 门外
  await new Promise(r => setTimeout(r, 300));
  s.moveTo(5984, 1120);   // (62,7) 门内
  await new Promise(r => setTimeout(r, 2500));
  return JSON.stringify({ pos: s.playerPos(), mapId: s.info().map.id });
})()`);
console.log('[穿门]', pass);
ws.close();
process.exit(0);
