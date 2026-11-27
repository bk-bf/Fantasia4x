import { spawn } from 'node:child_process';
import { createWriteStream, readFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STORE = '/src/lib/stores/gameState.ts';

function freePort() {
  return new Promise((done, fail) => {
    const s = createServer();
    s.on('error', fail);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => done(port));
    });
  });
}

async function startServer(tree, port, logFile) {
  const out = createWriteStream(logFile);
  const child = spawn(join(tree, 'dev.sh'), ['--browser', '--port', String(port)], {
    cwd: tree, detached: true, env: { ...process.env, GIT_DIR: '/dev/null', CI: 'true' }, stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.pipe(out);
  child.stderr.pipe(out);
  for (let i = 0; i < 600; i++) {
    if (child.exitCode !== null) throw new Error(`dev server exited ${child.exitCode}, see ${logFile}`);
    try { if ((await fetch(`http://127.0.0.1:${port}/`)).ok) return child; } catch { await sleep(500); }
  }
  throw new Error('dev server never answered');
}

function hideAudio() {
  for (const name of ['Audio', 'AudioContext', 'webkitAudioContext']) Reflect.deleteProperty(window, name);
  localStorage.setItem('fx.gameplay.autosave', 'false');
  localStorage.setItem('fx.gameplay.autoPauseOnThreat', 'false');
  localStorage.setItem('fx.gameplay.autoPauseOnDeath', 'false');
}

async function seedSave(page, origin, body) {
  const route = `${origin}/__shots/**`;
  await page.route(route, (r) =>
    r.request().url().endsWith('/save.json')
      ? r.fulfill({ contentType: 'application/json', body })
      : r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>shots</title>' })
  );
  await page.goto(`${origin}/__shots/seed`);
  const renderer = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return gl ? gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) : 'no WebGL2';
  });
  await page.evaluate(async () => {
    const snap = await (await fetch('/__shots/save.json')).json();
    const db = await new Promise((done, fail) => {
      const req = indexedDB.open('fantasia4x', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('saves');
      req.onsuccess = () => done(req.result);
      req.onerror = () => fail(req.error);
    });
    await new Promise((done, fail) => {
      const tx = db.transaction('saves', 'readwrite');
      tx.objectStore('saves').put(snap.dynamic, 'save:shots');
      tx.objectStore('saves').put(snap.world, 'world:shots');
      tx.oncomplete = done;
      tx.onerror = () => fail(tx.error);
    });
    db.close();
  });
  await page.unroute(route);
  return renderer;
}

async function loadGame(page, origin, query) {
  await page.goto(`${origin}/${query}`);
  await page.waitForFunction(
    () => [...document.querySelectorAll('button')].some((b) => (b.getAttribute('aria-label') ?? b.textContent.trim()) === 'Load Game' && !b.disabled),
    null, { timeout: 300_000, polling: 500 }
  );
  await page.getByRole('button', { name: 'Load Game', exact: true }).dispatchEvent('click');
  await page.getByRole('button', { name: 'Load', exact: true }).or(page.locator('.row button.main')).first().dispatchEvent('click', {}, { timeout: 60_000 });
  await page.waitForFunction(
    () => !!document.querySelector('[aria-label="World map"]') && !document.querySelector('.loading-screen') && !!document.querySelector('button.ctrl-btn'),
    null, { timeout: 900_000, polling: 500 }
  );
}

export async function open({ tree, harness = tree, out, query = '', fixture, log = console.log }) {
  mkdirSync(out, { recursive: true });
  const { startCompositor } = await import(join(harness, 'tools/gpu/session.mjs'));
  const { chromium } = await import(join(harness, 'node_modules/playwright/index.mjs'));
  const comp = await startCompositor(log);
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const server = await startServer(tree, port, join(out, '.server.log'));
  const browser = await chromium.launch({
    headless: false, executablePath: process.env.CHROME,
    env: { ...comp.cleanEnv, WAYLAND_DISPLAY: comp.socket, XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR },
    args: ['--ozone-platform=wayland', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--mute-audio', '--window-size=1920,1104', '--force-device-scale-factor=1']
  });
  const stop = async () => {
    try { await browser.close(); } catch {}
    try { process.kill(-server.pid, 'SIGTERM'); } catch {}
    comp.stop();
  };
  process.on('exit', () => { try { process.kill(-server.pid, 'SIGTERM'); } catch {} try { comp.stop(); } catch {} });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: Number(process.env.VH ?? 1104) }, deviceScaleFactor: 1 });
  await ctx.addInitScript(hideAudio);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text().slice(0, 200)));
  const body = gunzipSync(readFileSync(fixture ?? join(tree, 'tools/work-pins/fixtures/dev-save.json.gz')));
  const renderer = await seedSave(page, origin, body);
  log(`renderer ${renderer}`);
  await loadGame(page, origin, query);
  log('game loaded');
  await sleep(4000);
  return { page, errors, stop, renderer, origin };
}

export function api(page) {
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const cmd = (type, payload = {}) =>
    ev(async ([store, type, payload]) => { const s = await import(store); s.gameState.command({ type, payload, save: false }); }, [STORE, type, payload]);
  const paused = async (want) => {
    const isP = () => ev(() => (document.querySelector('button.ctrl-btn')?.className ?? '').includes('is-paused'));
    if ((await isP()) !== want) await ev(() => document.querySelector('button.ctrl-btn').click());
    await sleep(300);
  };
  const camera = async (cam) => {
    await ev(async ([store, cam]) => {
      const w = globalThis;
      const s = await import(store);
      sessionStorage.setItem('fantasia4x-camera', JSON.stringify(cam));
      w.__shotsUp = false;
      s.storeReady.set(false);
      await Promise.resolve();
      const un = s.rendererReady.subscribe((v) => (w.__shotsUp = v));
      s.storeReady.set(true);
    }, [STORE, cam]);
    const t = Date.now();
    while (!(await ev(() => globalThis.__shotsUp === true))) {
      if (Date.now() - t > 180_000) throw new Error('renderer did not come back');
      await sleep(250);
    }
  };
  const state = (fn, arg) => ev(async ([store, src, arg]) => {
    const s = await import(store);
    let gs; s.gameState.subscribe((v) => (gs = v))();
    return new Function('gs', 'arg', 'return (' + src + ')(gs, arg)')(gs, arg);
  }, [STORE, fn.toString(), arg]);
  const store = (fn, arg) => ev(async ([store, src, arg]) => {
    const s = await import(store);
    return await new Function('s', 'arg', 'return (' + src + ')(s, arg)')(s, arg);
  }, [STORE, fn.toString(), arg]);
  return { ev, cmd, paused, camera, state, store };
}
