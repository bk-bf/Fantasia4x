import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openGpuGame, sleep } from './session.mjs';

const [TREE, LABEL, OUT_DIR, SECONDS = '10'] = process.argv.slice(2);
const watchWorker = () => {
  window.__f4xTurn = 0;
  window.__f4xWorkerTps = [];
  const Native = window.Worker;
  window.Worker = class extends Native {
    constructor(...a) {
      super(...a);
      this.addEventListener('message', (e) => {
        const d = e.data;
        if (d?.kind === 'snapshot' && typeof d.state?.turn === 'number') window.__f4xTurn = d.state.turn;
        if (d?.kind === 'simlog') for (const ev of d.events ?? []) { const m = /tps=(\d+)/.exec(ev.message ?? ''); if (ev.category === 'perf' && m) window.__f4xWorkerTps.push(Number(m[1])); }
      });
    }
  };
};
const { page, cdp, log, tile, wheel, setPaused, finish } = await openGpuGame({
  tree: TREE, label: LABEL, outDir: OUT_DIR, init: [watchWorker],
  usage: 'usage: CHROME=<chromium binary> [F4X_QUERY=?painted=0] node tools/gpu/steady.mjs <app tree> <label> <out dir> [seconds per cell]'
});
const PROFILE = process.env.F4X_PROFILE === '1';
if (PROFILE) {
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
}
await cdp.send('Performance.enable');
const mainThread = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
const perSecond = (a, b, key) => Math.round(((b[key] - a[key]) * 1000) / Number(SECONDS));
const ZOOMS = [['close', -120, 60], ['default', 120, 20], ['far', 120, 60]];
const MODES = ['paused', '1x', '4x'];
const turn = () => page.evaluate(() => window.__f4xTurn);
const setSpeed = (s) => page.evaluate((s) => [...document.querySelectorAll('.spd')].find((b) => b.textContent.trim().replace('×', 'x') === s)?.click(), s);
const pct = (sorted, p) => Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] * 10) / 10;
const results = [];
try {
  for (const [zoom, deltaY, steps] of ZOOMS) {
    await setPaused(true);
    await wheel(deltaY, steps); await sleep(1500);
    const tileW = await tile();
    for (const mode of MODES) {
      if (mode !== 'paused') await setSpeed(mode);
      await setPaused(mode === 'paused');
      await sleep(3000);
      const t0 = await turn();
      await page.evaluate(() => { window.__f4xWorkerTps = []; });
      if (PROFILE) await cdp.send('Profiler.start');
      const m0 = await mainThread();
      const gaps = await page.evaluate(async (ms) => {
        const g = []; let last = performance.now(); let id;
        const f = (t) => { g.push(t - last); last = t; id = requestAnimationFrame(f); };
        id = requestAnimationFrame(f);
        await new Promise((r) => setTimeout(r, ms));
        cancelAnimationFrame(id);
        return g.slice(1);
      }, Number(SECONDS) * 1000);
      const m1 = await mainThread();
      const t1 = await turn();
      if (PROFILE) writeFileSync(join(OUT_DIR, `${LABEL}-${zoom}-${mode}.cpuprofile`), JSON.stringify((await cdp.send('Profiler.stop')).profile));
      const workerTps = await page.evaluate(() => window.__f4xWorkerTps);
      const sorted = [...gaps].sort((a, b) => a - b);
      const total = gaps.reduce((s, g) => s + g, 0);
      const row = { zoom, tileW, mode, fps: Math.round((gaps.length / total) * 10000) / 10, tps: Math.round(((t1 - t0) / Number(SECONDS)) * 10) / 10, workerTps, p50: pct(sorted, 0.5), p95: pct(sorted, 0.95), p99: pct(sorted, 0.99), maxMs: Math.round(sorted.at(-1) ?? 0), over33: gaps.filter((g) => g > 33.4).length, over50: gaps.filter((g) => g > 50).length, taskMs: perSecond(m0, m1, 'TaskDuration'), scriptMs: perSecond(m0, m1, 'ScriptDuration'), layoutMs: perSecond(m0, m1, 'LayoutDuration'), styleMs: perSecond(m0, m1, 'RecalcStyleDuration'), nodes: m1.Nodes };
      results.push(row);
      log(`ROW ${JSON.stringify(row)}`);
    }
  }
} catch (e) { log(`FAIL ${e.stack}`); }
writeFileSync(join(OUT_DIR, `${LABEL}-steady.json`), JSON.stringify(results, null, 1));
await finish();
