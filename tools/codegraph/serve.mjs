// @ts-check
/**
 * Live codebase-graph server.
 *
 * - Builds codegraph.html on start.
 * - Serves it on http://localhost:5180 with a live-reload script injected.
 * - Watches src/lib/**.ts plus the viewer template/descriptions; on change it
 *   re-runs extract + build and pushes a reload to every open tab.
 *
 * Zero external deps (Node built-ins only). Run:  node tools/codegraph/serve.mjs
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, '..', '..');
const SRC = path.join(ROOT, 'src', 'lib');
const HTML = path.join(DIR, 'codegraph.html');
const PORT = Number(process.env.CODEGRAPH_PORT) || 5180;

// The live-reload client lives in template.html (guarded to http only), so the
// server can stream codegraph.html verbatim — no fragile HTML string surgery.

/** @type {Set<import('node:http').ServerResponse>} */
const clients = new Set();
function notifyReload() {
  for (const res of clients) {
    try { res.write('data: reload\n\n'); } catch { /* dropped */ }
  }
}

// --- build pipeline (reuse the standalone scripts) --------------------------
let building = false;
let pending = false;
function run(script) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [path.join(DIR, script)], { stdio: ['ignore', 'ignore', 'inherit'] });
    p.on('close', (code) => resolve(code ?? 0));
  });
}
async function rebuild(reason) {
  if (building) { pending = true; return; }
  building = true;
  const t = Date.now();
  process.stdout.write(`[codegraph] rebuilding (${reason})… `);
  const ex = await run('extract.mjs');
  const bd = ex === 0 ? await run('build-html.mjs') : 1;
  building = false;
  if (ex === 0 && bd === 0) {
    console.log(`done in ${((Date.now() - t) / 1000).toFixed(1)}s — reloading tabs`);
    notifyReload();
  } else {
    console.log('FAILED (see output above)');
  }
  if (pending) { pending = false; rebuild('queued change'); }
}

// --- http server ------------------------------------------------------------
const server = http.createServer((req, res) => {
  if (req.url === '/__reload') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write(':ok\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  if (req.url === '/' || req.url === '/codegraph.html' || req.url === '/index.html') {
    fs.readFile(HTML, (err, data) => {
      if (err) { res.writeHead(503); res.end('codegraph.html not built yet'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
    return;
  }
  res.writeHead(404); res.end('not found');
});

// --- file watching (debounced) ---------------------------------------------
let timer = null;
function scheduleRebuild(reason) {
  clearTimeout(timer);
  timer = setTimeout(() => rebuild(reason), 350);
}
function watch() {
  // recursive watch is supported on Linux/macOS for the Node versions this repo uses
  fs.watch(SRC, { recursive: true }, (_e, file) => {
    if (file && /\.ts$/.test(file) && !/\.test\.ts$/.test(file)) scheduleRebuild(file);
  });
  for (const f of ['template.html', 'descriptions.json']) {
    fs.watch(path.join(DIR, f), () => scheduleRebuild(f));
  }
}

// --- boot -------------------------------------------------------------------
(async () => {
  await rebuild('startup');
  watch();
  server.listen(PORT, () => {
    console.log(`[codegraph] live graph → http://localhost:${PORT}  (watching src/lib)`);
  });
})();

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
