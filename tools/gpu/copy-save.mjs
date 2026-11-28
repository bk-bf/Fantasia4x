import { writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const [ENDPOINT, OUT, WANTED] = process.argv.slice(2);
if (!ENDPOINT || !OUT) {
  console.error('usage: node tools/gpu/copy-save.mjs <cdp http endpoint, e.g. http://127.0.0.1:9333> <out.json.gz> [save id]');
  process.exit(2);
}
const SLICE = 8_000_000;

/** @type {{ type: string, url: string, webSocketDebuggerUrl: string }[]} */
const targets = await (await fetch(`${ENDPOINT}/json/list`)).json();
const target = targets.find((t) => t.type === 'page' && !t.url.startsWith('devtools://'));
if (!target) throw new Error('no page target on that endpoint');
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
let n = 0;
const waiting = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); waiting.get(m.id)?.(m); });
/** @param {string} expression */
const evaluate = (expression) => new Promise((resolve) => {
  const id = ++n;
  waiting.set(id, resolve);
  ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
}).then((m) => {
  if (m.result?.exceptionDetails) throw new Error(JSON.stringify(m.result.exceptionDetails).slice(0, 400));
  return m.result.result.value;
});

const openDb = `new Promise((d, f) => { const r = indexedDB.open('fantasia4x'); r.onsuccess = () => d(r.result); r.onerror = () => f(r.error); })`;
const ids = await evaluate(`(async () => { const db = await ${openDb}; const keys = await new Promise((d) => { const r = db.transaction('saves').objectStore('saves').getAllKeys(); r.onsuccess = () => d(r.result); }); db.close(); return keys.filter((k) => String(k).startsWith('save:')).map((k) => String(k).slice(5)); })()`);
const id = WANTED ?? (ids.length === 1 ? ids[0] : null);
if (!id) throw new Error(`pick a save id: ${ids.join(', ')}`);
const length = await evaluate(`(async () => { const db = await ${openDb}; const get = (k) => new Promise((d) => { const r = db.transaction('saves').objectStore('saves').get(k); r.onsuccess = () => d(r.result); }); const dynamic = await get('save:${id}'); const world = await get('world:${id}'); db.close(); window.__f4xSaveCopy = JSON.stringify({ dynamic, world }); return window.__f4xSaveCopy.length; })()`);
const parts = [];
for (let i = 0; i < length; i += SLICE) parts.push(await evaluate(`window.__f4xSaveCopy.slice(${i}, ${i + SLICE})`));
await evaluate('delete window.__f4xSaveCopy');
ws.close();
const body = parts.join('');
if (body.length !== length) throw new Error(`read ${body.length} of ${length} characters`);
JSON.parse(body);
writeFileSync(OUT, gzipSync(body));
console.log(`save ${id}: ${(length / 1e6).toFixed(0)} MB of JSON written to ${OUT}`);
