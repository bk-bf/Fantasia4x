import { execFileSync, spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const UNIT = 'f4x-gpu-compositor';
const instances = () => JSON.parse(execFileSync('hyprctl', ['instances', '-j'], { encoding: 'utf8' }));

async function startCompositor(log) {
  const sessionEnv = Object.fromEntries(
    execFileSync('systemctl', ['--user', 'show-environment'], { encoding: 'utf8' }).trim().split('\n').map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])
  );
  const config = join(tmpdir(), `${UNIT}.conf`);
  writeFileSync(config, 'monitor = , 1920x1080@60, auto, 1\nanimations {\n enabled = false\n}\ndecoration {\n blur {\n enabled = false\n }\n shadow {\n enabled = false\n }\n}\nmisc {\n disable_hyprland_logo = true\n disable_splash_rendering = true\n}\nxwayland {\n enabled = false\n}\necosystem {\n no_update_news = true\n no_donation_nag = true\n}\n');
  const before = new Set(instances().map((i) => i.instance));
  const { HYPRLAND_INSTANCE_SIGNATURE: _a, HYPRLAND_CONFIG: _b, DISPLAY: _c, ...cleanEnv } = process.env;
  spawn('systemd-run', ['--user', '--scope', '--quiet', '--collect', `--unit=${UNIT}`, '--slice=app.slice', '--', 'Hyprland', '-c', config], {
    env: { ...cleanEnv, WAYLAND_DISPLAY: sessionEnv.WAYLAND_DISPLAY }, detached: true, stdio: 'ignore'
  }).unref();
  let inst;
  for (let i = 0; i < 60 && !(inst = instances().find((n) => !before.has(n.instance))); i++) await sleep(500);
  if (!inst) throw new Error('nested compositor did not start');
  const hypr = (...a) => execFileSync('hyprctl', a, { encoding: 'utf8', env: { ...process.env, HYPRLAND_INSTANCE_SIGNATURE: inst.instance } }).trim();
  const nested = JSON.parse(hypr('-j', 'monitors')).map((m) => m.name);
  hypr('output', 'create', 'headless');
  for (const n of nested) hypr('output', 'remove', n);
  const out = JSON.parse(hypr('-j', 'monitors'))[0].name;
  hypr('keyword', 'monitor', `${out},1920x1080@60,0x0,1`);
  await sleep(1000);
  log(`nested compositor ${inst.instance} socket ${inst.wl_socket} output ${out}`);
  const stop = () => {
    try { hypr('dispatch', 'exit'); } catch {}
    execFileSync('systemctl', ['--user', 'stop', `${UNIT}.scope`], { stdio: 'ignore' });
  };
  return { socket: inst.wl_socket, cleanEnv, stop };
}

const SERVED_SAVE = 'f4x-bench-save.json';

function patchChromium(chromium, { chrome, socket, cleanEnv, query, servedSave }) {
  const origLaunch = chromium.launch.bind(chromium);
  chromium.launch = async (o) => {
    const browser = await origLaunch({
      ...o, headless: false, executablePath: chrome,
      env: { ...cleanEnv, WAYLAND_DISPLAY: socket, XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR },
      args: ['--ozone-platform=wayland', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--mute-audio', '--window-size=1440,870']
    });
    const newContext = browser.newContext.bind(browser);
    browser.newContext = async (co) => {
      const ctx = await newContext(co);
      const newPage = ctx.newPage.bind(ctx);
      ctx.newPage = async () => {
        const pg = await newPage();
        const route = pg.route.bind(pg);
        pg.route = (pattern, handler) => route(pattern, (r) =>
          servedSave && r.request().url().endsWith('/save.json')
            ? r.fulfill({ status: 302, headers: { location: `/${servedSave}` } })
            : handler(r)
        );
        const goto = pg.goto.bind(pg);
        pg.goto = (url, opts) => goto(query && url.endsWith('/') ? url + query : url, opts);
        return pg;
      };
      return ctx;
    };
    return browser;
  };
}

export async function openGpuGame({ tree, label, outDir, usage, init = [] }) {
  const chrome = process.env.CHROME;
  if (!tree || !label || !outDir || !chrome) {
    console.error(usage);
    process.exit(2);
  }
  mkdirSync(outDir, { recursive: true });
  const log = (l) => process.stdout.write(`[${label}] ${l}\n`);
  const comp = await startCompositor(log);
  const harness = process.env.F4X_HARNESS ?? tree;
  const { chromium } = await import(harness + '/node_modules/playwright/index.mjs');
  const fixture = process.env.F4X_FIXTURE;
  const servedPath = join(tree, 'static', SERVED_SAVE);
  if (fixture) writeFileSync(servedPath, fixture.endsWith('.gz') ? gunzipSync(readFileSync(fixture)) : readFileSync(fixture));
  const dropServed = () => fixture && rmSync(servedPath, { force: true });
  patchChromium(chromium, { chrome, socket: comp.socket, cleanEnv: comp.cleanEnv, query: process.env.F4X_QUERY ?? '', servedSave: fixture ? SERVED_SAVE : null });
  const { openGame } = await import(harness + '/tools/work-pins/browser-session.mjs');
  const game = await openGame({
    tree, fixture: process.env.F4X_FIXTURE ?? tree + '/tools/work-pins/fixtures/dev-save.json.gz',
    serverLog: join(outDir, `${label}-server.log`), log, clock: false, workPins: false, init
  }).catch((e) => {
    comp.stop();
    dropServed();
    throw e;
  });
  const { page } = game;
  const renderer = await page.evaluate(() => { const gl = document.createElement('canvas').getContext('webgl2'); const e = gl?.getExtension('WEBGL_debug_renderer_info'); return gl ? gl.getParameter(e ? e.UNMASKED_RENDERER_WEBGL : gl.RENDERER) : 'none'; });
  log(`url ${page.url()} renderer ${renderer} viewport ${await page.evaluate(() => `${innerWidth}x${innerHeight}`)}`);
  const tile = () => page.evaluate(() => { try { return JSON.parse(sessionStorage.getItem('fantasia4x-camera'))?.tileWidth ?? null; } catch { return null; } });
  const wheel = (deltaY, steps, gapMs = 60) => page.evaluate(async ([deltaY, steps, gapMs]) => {
    const map = document.querySelector('[aria-label="World map"]'); const b = map.getBoundingClientRect();
    for (let i = 0; i < steps; i++) { map.dispatchEvent(new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true, clientX: b.x + b.width / 2, clientY: b.y + b.height / 2 })); await new Promise((r) => setTimeout(r, gapMs)); }
  }, [deltaY, steps, gapMs]);
  const setPaused = async (want) => {
    const isP = () => page.evaluate(() => (document.querySelector('button.ctrl-btn')?.className ?? '').includes('is-paused'));
    if ((await isP()) !== want) await page.evaluate(() => document.querySelector('button.ctrl-btn').click());
    await sleep(300);
    return isP();
  };
  const finish = async () => {
    log(`ERRORS ${JSON.stringify(game.errors.slice(0, 5))}`);
    await game.close();
    comp.stop();
    dropServed();
    log('DONE');
  };
  return { ...game, log, tile, wheel, setPaused, finish };
}
