import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openGpuGame, sleep } from './session.mjs';

const [TREE, LABEL, OUT_DIR, ROUNDS = '3'] = process.argv.slice(2);
const { page, cdp, log, tile, wheel, setPaused, finish } = await openGpuGame({
  tree: TREE, label: LABEL, outDir: OUT_DIR,
  usage: 'usage: CHROME=<chromium binary> [F4X_QUERY=?painted=1&blend=1] node tools/gpu/zoom-out.mjs <app tree> <label> <out dir> [rounds]'
});
const results = [];
try {
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
} catch (e) { log(`FAIL ${e.stack}`); }
writeFileSync(join(OUT_DIR, `${LABEL}-results.json`), JSON.stringify(results, null, 1));
await finish();
