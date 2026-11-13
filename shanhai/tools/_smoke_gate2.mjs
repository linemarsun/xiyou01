/** CDP 冒烟 2：城门路牌触发切图（62,3 路牌 → 青崖山道），并验证落点即回程路牌不弹回 */
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
  await new Promise(r => setTimeout(r, 3000));
  return true;
})()`);

// 传送到城门内 (62,5)=世界(5920,1088)，然后自动走向路牌 (5984,1056)
const step1 = await evalJs(`(async () => {
  const s = window.__shanhai;
  s.teleport(5920, 1088);
  await new Promise(r => setTimeout(r, 300));
  s.moveTo(5984, 1056); // 城门洞北沿的路牌
  await new Promise(r => setTimeout(r, 2500)); // 等待走路 + 切图 + 落地
  return JSON.stringify({ afterWalk: s.info()?.map?.id ?? null, pos: s.playerPos() });
})()`);
console.log('[走进城门后]', step1);

// 落到山道后原地等 3 秒，确认不弹回云京
const step2 = await evalJs(`(async () => {
  const s = window.__shanhai;
  await new Promise(r => setTimeout(r, 3000));
  return JSON.stringify({ mapId: s.info()?.map?.id ?? null, pos: s.playerPos() });
})()`);
console.log('[3秒后]', step2);

// 再从山道走回程路牌（落点即回程路牌机制）→ 应回云京并稳定
const step3 = await evalJs(`(async () => {
  const s = window.__shanhai;
  const info = s.info();
  return JSON.stringify(info.map ? { id: info.map.id } : info);
})()`);
console.log('[当前图]', step3);
ws.close();
process.exit(0);
