/** CDP 截图：宽城门楼近景（不触发切图） */
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
await evalJs(`(async () => {
  const input = document.querySelector('input.name-input, input');
  if (input && !input.value) { input.value = '冒烟侠'; input.dispatchEvent(new Event('input', { bubbles: true })); }
  [...document.querySelectorAll('button')].find(b => b.textContent.replace(/\\s+/g, '').includes('开始冒险'))?.click();
  await new Promise(r => setTimeout(r, 3500));
  return true;
})()`);
// 传送到城门外安全区 cell(63,1)=(6080,1024)，聚焦城门 (5984,1056)
await evalJs(`(async () => {
  const s = window.__shanhai;
  s.teleport(6080, 1024);
  s.view(0.6, 5984, 1060);
  await new Promise(r => setTimeout(r, 1200));
  return s.playerPos();
})()`);
await sleep(600);
const shot = await send('Page.captureScreenshot', { format: 'png' });
const { writeFileSync } = await import('node:fs');
writeFileSync('tools/_shot_widegate.png', Buffer.from(shot.result.data, 'base64'));
console.log('[截图完成]');
ws.close();
process.exit(0);
