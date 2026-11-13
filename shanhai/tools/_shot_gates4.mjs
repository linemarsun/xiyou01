/** CDP 截图：四门衔接 + 门洞内景验证 */
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
const { writeFileSync } = await import('node:fs');

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

const shots = [
  // [名字, 传送点, 视野中心, 缩放]
  ['_shot_n_west', [5700, 1250], [5780, 1060], 0.85],   // 北门西侧衔接
  ['_shot_n_east', [6350, 1350], [6150, 1180], 0.85],   // 北门东侧衔接
  ['_shot_w_gate', [2500, 1350], [2350, 1150], 0.8],    // 西门全景
  ['_shot_e_gate', [5800, 3100], [5950, 2950], 0.8],    // 东门全景
  ['_shot_tunnel', [5920, 1300], [5960, 1090], 1.0],    // 北门洞内特写
];
for (const [name, tp, view, zoom] of shots) {
  await evalJs(`(async () => {
    const s = window.__shanhai;
    s.teleport(${tp[0]}, ${tp[1]});
    s.view(${zoom}, ${view[0]}, ${view[1]});
    await new Promise(r => setTimeout(r, 1100));
    return true;
  })()`);
  await sleep(500);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`tools/${name}.png`, Buffer.from(shot.result.data, 'base64'));
  console.log(`[完成] ${name}`);
}
ws.close();
process.exit(0);
