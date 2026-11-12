/** CDP 截图：八个墙门衔接点高清特写（zoom 1.6） */
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

// 八个衔接点：[名称, 视野中心世界坐标]
const shots = [
  ['_jx_n_west', [5776, 1048]],   // 北门·西侧
  ['_jx_n_east', [6112, 1200]],   // 北门·东侧
  ['_jx_w_north', [2416, 1048]],  // 西门·上侧
  ['_jx_w_south', [2096, 1208]],  // 西门·下侧
  ['_jx_e_north', [6096, 2888]],  // 东门·上侧
  ['_jx_e_south', [5776, 3064]],  // 东门·下侧
  ['_jx_s_west', [2192, 2936]],   // 南门·西侧
  ['_jx_s_east', [2320, 3000]],   // 南门·东侧
];
// 玩家停到远离衔接点的空地，避免 updateOccluders 把墙体淡出成半透明
const PARK = [4096, 2560];
const meta = {};
for (const [name, view] of shots) {
  await evalJs(`(async () => {
    const s = window.__shanhai;
    s.teleport(${PARK[0]}, ${PARK[1]});
    await new Promise(r => setTimeout(r, 350));
    s.view(1.6, ${view[0]}, ${view[1]});
    await new Promise(r => setTimeout(r, 1100));
    return true;
  })()`);
  await sleep(450);
  const info = await evalJs(`window.__shanhai.info()`);
  const rect = await evalJs(`(() => { const c = document.querySelector('canvas'); const r = c.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height, dpr: window.devicePixelRatio }; })()`);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`tools/${name}.png`, Buffer.from(shot.result.data, 'base64'));
  meta[name] = { cam: info.cam, rect, view };
  console.log(`[完成] ${name} cam=(${info.cam.x},${info.cam.y})`);
}
writeFileSync('tools/_jx_meta.json', JSON.stringify(meta, null, 1));
console.log('meta -> tools/_jx_meta.json');
ws.close();
process.exit(0);
