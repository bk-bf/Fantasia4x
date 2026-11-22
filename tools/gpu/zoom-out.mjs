import { execFileSync, spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const [TREE, LABEL, OUT_DIR, ROUNDS = '3'] = process.argv.slice(2);
const CHROME = process.env.CHROME;
if (!TREE || !LABEL || !OUT_DIR || !CHROME) {
  console.error('usage: CHROME=<chromium binary> [F4X_QUERY=?painted=1&blend=1] node tools/gpu/zoom-out.mjs <app tree> <label> <out dir> [rounds]');
  process.exit(2);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (l) => process.stdout.write(`[${LABEL}] ${l}\n`);
mkdirSync(OUT_DIR, { recursive: true });

const sessionEnv = Object.fromEntries(
  execFileSync('systemctl', ['--user', 'show-environment'], { encoding: 'utf8' }).trim().split('\n').map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])
);
const instances = () => JSON.parse(execFileSync('hyprctl', ['instances', '-j'], { encoding: 'utf8' }));
const UNIT = 'f4x-zoom-compositor';
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

const { chromium } = await import(TREE + '/node_modules/playwright/index.mjs');
const origLaunch = chromium.launch.bind(chromium);
chromium.launch = (o) => origLaunch({
  ...o, headless: false, executablePath: CHROME,
  env: { ...cleanEnv, WAYLAND_DISPLAY: inst.wl_socket, XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR },
  args: ['--ozone-platform=wayland', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--mute-audio', '--window-size=1440,870']
});
const QUERY = process.env.F4X_QUERY ?? '';
const launched = chromium.launch;
chromium.launch = async (o) => {
  const browser = await launched(o);
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (co) => {
    const ctx = await newContext(co);
    const newPage = ctx.newPage.bind(ctx);
    ctx.newPage = async () => {
      const pg = await newPage();
      const goto = pg.goto.bind(pg);
      pg.goto = (url, opts) => goto(QUERY && url.endsWith('/') ? url + QUERY : url, opts);
      return pg;
    };
    return ctx;
  };
  return browser;
};
const { openGame } = await import(TREE + '/tools/work-pins/browser-session.mjs');
const { page, cdp, errors, close } = await openGame({
  tree: TREE, fixture: TREE + '/tools/work-pins/fixtures/dev-save.json.gz',
  serverLog: join(OUT_DIR, `${LABEL}-server.log`), log, clock: false, workPins: false
});
const results = [];
try {
  const renderer = await page.evaluate(() => { const gl = document.createElement('canvas').getContext('webgl2'); const e = gl?.getExtension('WEBGL_debug_renderer_info'); return gl ? gl.getParameter(e ? e.UNMASKED_RENDERER_WEBGL : gl.RENDERER) : 'none'; });
  log(`url ${page.url()} renderer ${renderer} viewport ${await page.evaluate(() => `${innerWidth}x${innerHeight}`)}`);
  const tile = () => page.evaluate(() => { try { return JSON.parse(sessionStorage.getItem('fantasia4x-camera'))?.tileWidth ?? null; } catch { return null; } });
  const wheel = (deltaY, steps) => page.evaluate(async ([deltaY, steps]) => {
    const map = document.querySelector('[aria-label="World map"]'); const b = map.getBoundingClientRect();
    for (let i = 0; i < steps; i++) { map.dispatchEvent(new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true, clientX: b.x + b.width / 2, clientY: b.y + b.height / 2 })); await new Promise((r) => setTimeout(r, 60)); }
  }, [deltaY, steps]);
  const setPaused = async (want) => { const isP = () => page.evaluate(() => (document.querySelector('button.ctrl-btn')?.className ?? '').includes('is-paused')); if ((await isP()) !== want) await page.evaluate(() => document.querySelector('button.ctrl-btn').click()); await sleep(300); return isP(); };
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 250 });
  for (const mode of ['paused', 'running']) {
    for (let r = 0; r < Number(ROUNDS); r++) {
      await setPaused(true);
      await wheel(-120, 60); await sleep(2000);
      const inTile = await tile();
      await setPaused(mode === 'paused'); await sleep(1500);
      await page.evaluate(() => { window.__gaps = []; let last = performance.now(); const f = (t) => { window.__gaps.push(t - last); last = t; window.__raf = requestAnimationFrame(f); }; window.__raf = requestAnimationFrame(f); });
      await cdp.send('Profiler.start');
      const t0 = Date.now();
      await wheel(120, 45);
      const wheelMs = Date.now() - t0;
      await sleep(3000);
      const { profile } = await cdp.send('Profiler.stop');
      const gaps = await page.evaluate(() => { cancelAnimationFrame(window.__raf); return window.__gaps.slice(1); });
      const outTile = await tile();
      const sorted = [...gaps].sort((a, b) => b - a);
      const row = { mode, round: r, inTile, outTile, wheelMs, frames: gaps.length, maxMs: Math.round(sorted[0] ?? 0), top5: sorted.slice(0, 5).map(Math.round), over100: gaps.filter((g) => g > 100).length, over250: gaps.filter((g) => g > 250).length, stallMs: Math.round(gaps.filter((g) => g > 50).reduce((s, g) => s + g, 0)) };
      results.push(row);
      writeFileSync(join(OUT_DIR, `${LABEL}-${mode}-${r}.cpuprofile`), JSON.stringify(profile));
      log(`ROW ${JSON.stringify(row)}`);
    }
  }
  log(`ERRORS ${JSON.stringify(errors.slice(0, 5))}`);
} catch (e) { log(`FAIL ${e.stack}`); }
writeFileSync(join(OUT_DIR, `${LABEL}-results.json`), JSON.stringify(results, null, 1));
await close();
try { hypr('dispatch', 'exit'); } catch {}
execFileSync('systemctl', ['--user', 'stop', `${UNIT}.scope`], { stdio: 'ignore' });
log('DONE');
