import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { worstFrames } from './trace-stall.mjs';
import { startFrameGaps, stopFrameGaps, summarizeGaps } from './frame-gaps.mjs';

const [ENDPOINT, OUT_DIR, ROUNDS = '3'] = process.argv.slice(2);
if (!ENDPOINT || !OUT_DIR) {
  console.error('usage: node tools/gpu/attach-trace.mjs <cdp http endpoint, e.g. http://127.0.0.1:9333> <out dir> [rounds]');
  process.exit(2);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (l) => process.stdout.write(`[trace] ${l}\n`);
mkdirSync(OUT_DIR, { recursive: true });

const CATEGORIES = [
  'devtools.timeline', 'disabled-by-default-devtools.timeline.frame', 'toplevel', 'blink.user_timing',
  'cc', 'gpu', 'viz', 'v8.execute', 'disabled-by-default-gpu.service'
];

function connect(url) {
  const ws = new WebSocket(url);
  let id = 0;
  const waiting = new Map();
  const listeners = new Map();
  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && waiting.has(msg.id)) {
      const { resolve, reject } = waiting.get(msg.id);
      waiting.delete(msg.id);
      msg.error ? reject(new Error(`${msg.error.message} ${msg.error.data ?? ''}`)) : resolve(msg.result);
    } else if (msg.method) for (const f of listeners.get(msg.method) ?? []) f(msg.params);
  });
  const opened = new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  return {
    opened,
    send: (method, params = {}) => new Promise((resolve, reject) => { const n = ++id; waiting.set(n, { resolve, reject }); ws.send(JSON.stringify({ id: n, method, params })); }),
    on: (method, f) => listeners.set(method, [...(listeners.get(method) ?? []), f]),
    close: () => ws.close()
  };
}

const version = await (await fetch(`${ENDPOINT}/json/version`)).json();
const pages = (await (await fetch(`${ENDPOINT}/json/list`)).json()).filter((t) => t.type === 'page' && !t.url.startsWith('devtools://'));
if (pages.length === 0) throw new Error('no page target on that endpoint');
const target = pages[0];
log(`browser ${version.Browser} page ${target.url}`);
const browser = connect(version.webSocketDebuggerUrl);
const page = connect(target.webSocketDebuggerUrl);
await Promise.all([browser.opened, page.opened]);
const evaluate = async (fn, ...args) => (await page.send('Runtime.evaluate', { expression: `(${fn})(...${JSON.stringify(args)})`, awaitPromise: true, returnByValue: true })).result.value;

const env = await evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl2');
  const e = gl?.getExtension('WEBGL_debug_renderer_info');
  const gpu = gl ? gl.getParameter(e ? e.UNMASKED_RENDERER_WEBGL : gl.RENDERER) : 'none';
  gl?.getExtension('WEBGL_lose_context')?.loseContext();
  const paused = (document.querySelector('button.ctrl-btn')?.className ?? '').includes('is-paused');
  return { gpu, window: `${innerWidth}x${innerHeight}@${devicePixelRatio}`, screen: `${screen.width}x${screen.height}`, url: location.href, paused };
});
log(`ENV ${JSON.stringify(env)}`);

const tile = () => evaluate(() => { try { return JSON.parse(sessionStorage.getItem('fantasia4x-camera'))?.tileWidth ?? null; } catch { return null; } });
const wheel = (deltaY, steps) => evaluate(async (deltaY, steps) => {
  const map = document.querySelector('[aria-label="World map"]'); const b = map.getBoundingClientRect();
  for (let i = 0; i < steps; i++) { map.dispatchEvent(new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true, clientX: b.x + b.width / 2, clientY: b.y + b.height / 2 })); await new Promise((r) => setTimeout(r, 60)); }
}, deltaY, steps);

const tracePath = join(OUT_DIR, 'trace.json');
const done = new Promise((r) => browser.on('Tracing.tracingComplete', r));
await browser.send('Tracing.start', { traceConfig: { includedCategories: CATEGORIES, recordMode: 'recordContinuously' }, transferMode: 'ReturnAsStream' });
await page.send('Profiler.enable');
await page.send('Profiler.setSamplingInterval', { interval: 500 });
const rows = [];
try {
  for (let r = 0; r < Number(ROUNDS); r++) {
    await wheel(-120, 60); await sleep(2000);
    const inTile = await tile();
    await page.send('Profiler.start');
    await sleep(500);
    await evaluate(startFrameGaps);
    await evaluate((r) => performance.mark(`f4x-zoom-${r}-start`), r);
    await wheel(120, 45);
    await sleep(3000);
    await evaluate((r) => performance.mark(`f4x-zoom-${r}-end`), r);
    const recorded = await evaluate(stopFrameGaps);
    const { profile } = await page.send('Profiler.stop');
    writeFileSync(join(OUT_DIR, `round-${r}.cpuprofile`), JSON.stringify(profile));
    const row = { round: r, inTile, outTile: await tile(), ...summarizeGaps(recorded) };
    rows.push(row);
    log(`ROW ${JSON.stringify(row)}`);
  }
} finally {
  await browser.send('Tracing.end');
}
log('waiting for the trace');
const { stream } = await done;
const chunks = [];
let bytes = 0;
for (;;) {
  const { data, eof, base64Encoded } = await browser.send('IO.read', { handle: stream, size: 1 << 20 });
  const text = base64Encoded ? Buffer.from(data, 'base64').toString('utf8') : data;
  chunks.push(text);
  bytes += text.length;
  if (chunks.length % 50 === 0) log(`read ${(bytes / 1e6).toFixed(0)} MB`);
  if (eof) break;
}
await browser.send('IO.close', { handle: stream });
const trace = chunks.join('');
writeFileSync(tracePath, trace);
writeFileSync(join(OUT_DIR, 'rows.json'), JSON.stringify({ env, rows }, null, 1));
log(`trace ${tracePath} (${(trace.length / 1e6).toFixed(1)} MB)`);
for (const f of worstFrames(JSON.parse(trace), 5)) log(`FRAME ${JSON.stringify(f)}`);
browser.close();
page.close();
log('DONE');
