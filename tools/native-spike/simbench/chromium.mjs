import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { extname, join } from 'node:path';

const [, , page = 'index.html', query = '', out = ''] = process.argv;
const dir = fileURLToPath(new URL('../out/simbench/', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm' };
const browser = await chromium.launch({ headless: true, args: ['--disable-gpu'] });
const ctx = await browser.newContext();
await ctx.route('http://bench.local/**', (route) => {
  const p = new URL(route.request().url()).pathname.slice(1);
  if (route.request().method() === 'POST') return route.fulfill({ status: 200, body: String(route.request().postDataBuffer()?.length ?? 0) });
  route.fulfill({ status: 200, contentType: types[extname(p)] ?? 'application/octet-stream', body: readFileSync(join(dir, p)) });
});
const pg = await ctx.newPage();
pg.on('console', (m) => { if (!m.text().startsWith('[')) console.log(m.text()); });
await pg.goto(`http://bench.local/${page}?${query}`);
await pg.waitForFunction(() => window.__result || window.__error, null, { timeout: 0, polling: 1000 });
const r = await pg.evaluate(() => window.__result ?? { error: window.__error });
r.browserVersion = browser.version();
console.log(JSON.stringify(r.rounds?.map((x) => [x.tps.toFixed(1), x.p50.toFixed(3), x.p95.toFixed(3)]) ?? r));
if (out) writeFileSync(out, JSON.stringify(r, null, 1));
await browser.close();
