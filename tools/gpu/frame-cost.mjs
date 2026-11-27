import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openGpuGame, sleep } from './session.mjs';

/** @typedef {import('../work-pins/browser-session.mjs').Page} Page */
/** @typedef {import('../work-pins/browser-session.mjs').CDPSession} CDPSession */
/** @typedef {Awaited<ReturnType<typeof measureCell>>} Cell */
/** @typedef {{ skipped: string, zoom: string, tilePx: number | null, speed: string } & Cell} Row */

const [TREE, LABEL, OUT_DIR, SECONDS = '8'] = process.argv.slice(2);
const USAGE =
  'usage: CHROME=<chromium binary> [F4X_QUERY=?painted=1&blend=1] [F4X_SCENARIO=large-wilderness | F4X_FIXTURE=<save.json.gz>] [F4X_SKIP="none;gl;terrain,snow"] [F4X_CAPPED=1] node tools/gpu/frame-cost.mjs <app tree> <label> <out dir> [seconds per cell]';
const UNCAPPED = ['--disable-gpu-vsync', '--disable-frame-rate-limit'];
const MAX_SPEED = 1000;
const SETTLE_MS = 3000;
/** @type {[string, number, number][]} */
const ZOOMS = [
  ['close', -120, 60],
  ['default', 120, 20],
  ['far', 120, 60]
];
/** @type {[string, number][]} */
const SPEEDS = [
  ['paused', 0],
  ['1x', 1],
  ['4x', 4],
  ['max', MAX_SPEED]
];
const scenario = process.env.F4X_SCENARIO ?? (process.env.F4X_FIXTURE ? '' : 'large-wilderness');
const skipSets = (process.env.F4X_SKIP ?? 'none;gl').split(';').map((s) => (s === 'none' ? '' : s));
const args = process.env.F4X_CAPPED === '1' ? [] : UNCAPPED;
const seconds = Number(SECONDS);

function watchSim() {
  window.__f4xTurn = 0;
  window.__f4xSpeed = null;
  const Native = window.Worker;
  window.Worker = class extends Native {
    constructor(/** @type {string | URL} */ url, /** @type {WorkerOptions | undefined} */ options) {
      super(url, options);
      if (String(url).includes('sim.worker')) window.__f4xSim = this;
      this.addEventListener('message', (e) => {
        const d = e.data;
        if (d?.kind === 'snapshot' && typeof d.state?.turn === 'number') window.__f4xTurn = d.state.turn;
        if (d?.kind === 'simlog')
          for (const { m: sink, a } of d.events ?? []) {
            const speed = /speed=([\d.]+)x/.exec(a?.[0]?.message ?? '');
            if (sink === 'logEvent' && a[0].category === 'perf' && speed) window.__f4xSpeed = Number(speed[1]);
          }
      });
    }
  };
}

/** @param {string} skip */
function queryFor(skip) {
  const q = new URLSearchParams(process.env.F4X_QUERY ?? '');
  if (scenario) q.set('scenario', scenario);
  if (skip) q.set('skip', skip);
  const s = q.toString();
  return s ? `?${s}` : '';
}

/** @param {number[]} sorted @param {number} p */
const quantile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
/** @param {number} n @param {number} [d] */
const fixed = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

/** @param {Page} page @param {CDPSession} cdp */
async function measureCell(page, cdp) {
  const mainThread = async () =>
    Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  const t0 = await page.evaluate(() => window.__f4xTurn);
  const m0 = await mainThread();
  const gaps = await page.evaluate(async (/** @type {number} */ ms) => {
    /** @type {number[]} */
    const g = [];
    let last = performance.now();
    /** @type {number} */
    let id;
    const f = (/** @type {number} */ t) => {
      g.push(t - last);
      last = t;
      id = requestAnimationFrame(f);
    };
    id = requestAnimationFrame(f);
    await new Promise((r) => setTimeout(r, ms));
    cancelAnimationFrame(id);
    return g.slice(1);
  }, seconds * 1000);
  const m1 = await mainThread();
  const t1 = await page.evaluate(() => window.__f4xTurn);
  const sorted = [...gaps].sort((a, b) => a - b);
  const total = gaps.reduce((s, g) => s + g, 0);
  /** @param {string} key */
  const perFrame = (key) => fixed(((m1[key] - m0[key]) * 1000) / Math.max(1, gaps.length));
  return {
    fps: fixed((gaps.length * 1000) / total, 1),
    frameP50Ms: fixed(quantile(sorted, 0.5)),
    frameP95Ms: fixed(quantile(sorted, 0.95)),
    frameMaxMs: fixed(sorted.at(-1) ?? 0, 1),
    mainThreadMsPerFrame: perFrame('TaskDuration'),
    scriptMsPerFrame: perFrame('ScriptDuration'),
    layoutStyleMsPerFrame: fixed(perFrame('LayoutDuration') + perFrame('RecalcStyleDuration')),
    tps: fixed((t1 - t0) / seconds, 1),
    nodes: m1.Nodes
  };
}

/** @param {string} skip @param {Row[]} rows */
async function runSkipSet(skip, rows) {
  const { page, cdp, log, tile, wheel, setPaused, finish } = await openGpuGame({
    tree: TREE,
    label: `${LABEL}-${skip || 'none'}`,
    outDir: OUT_DIR,
    usage: USAGE,
    init: [watchSim, ...(scenario ? [watchScenarioLoad(scenario)] : [])],
    args,
    query: queryFor(skip)
  });
  try {
    if (scenario) await waitForScenario(page, scenario);
    await cdp.send('Performance.enable');
    /** @param {number} speed */
    const setSpeed = (speed) =>
      page.evaluate((/** @type {number} */ s) => {
        window.__f4xSpeed = null;
        window.__f4xSim.postMessage({ kind: 'setSpeed', speed: s });
      }, speed);
    /** @param {number} speed */
    const assertSpeed = async (speed) => {
      const running = await page.evaluate(() => window.__f4xSpeed);
      if (running !== speed) throw new Error(`asked the sim for ${speed}x, it reports ${running ?? 'no'} speed`);
    };
    for (const [zoom, deltaY, steps] of ZOOMS) {
      await setPaused(true);
      await wheel(deltaY, steps);
      await sleep(1500);
      const tilePx = await tile();
      for (const [speed, value] of SPEEDS) {
        if (value) await setSpeed(value);
        await setPaused(!value);
        await sleep(SETTLE_MS);
        const row = { skipped: skip || 'none', zoom, tilePx, speed, ...(await measureCell(page, cdp)) };
        if (value) await assertSpeed(value);
        rows.push(row);
        log(`ROW ${JSON.stringify(row)}`);
      }
    }
  } catch (e) {
    log(`FAIL ${e instanceof Error ? e.stack : e}`);
    process.exitCode = 1;
  }
  await finish();
}

/** @param {Row[]} rows */
function table(rows) {
  const head =
    '| skipped passes | zoom | tile px | speed | FPS, higher is better | frame p50 ms | frame p95 ms | longest frame ms | main-thread ms per frame | script ms per frame | layout and style ms per frame | TPS (60 per 1x) | DOM nodes |';
  /** @param {Row} r */
  const line = (r) =>
    `| ${r.skipped} | ${r.zoom} | ${r.tilePx ?? '-'} | ${r.speed} | ${r.fps} | ${r.frameP50Ms} | ${r.frameP95Ms} | ${r.frameMaxMs} | ${r.mainThreadMsPerFrame} | ${r.scriptMsPerFrame} | ${r.layoutStyleMsPerFrame} | ${r.tps} | ${r.nodes} |`;
  return [head, `|${'---|'.repeat(13)}`, ...rows.map(line)].join('\n');
}

const { watchScenarioLoad, waitForScenario } = await import(
  `${process.env.F4X_HARNESS ?? TREE}/tools/work-pins/browser-session.mjs`
);
/** @type {Row[]} */
const rows = [];
for (const skip of skipSets) await runSkipSet(skip, rows);
writeFileSync(join(OUT_DIR, `${LABEL}-frame-cost.json`), JSON.stringify({ scenario, args, seconds, rows }, null, 1));
process.stdout.write(`\n${scenario || process.env.F4X_FIXTURE}, ${args.length ? 'uncapped' : 'vsync-capped'}, ${seconds} s per cell\n\n${table(rows)}\n`);
