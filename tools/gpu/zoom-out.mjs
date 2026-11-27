import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openGpuGame, sleep } from './session.mjs';
import { startFrameGaps, stopFrameGaps, summarizeGaps } from './frame-gaps.mjs';
import { recordBench } from '../ledger/bench.mjs';

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
      await page.evaluate(startFrameGaps);
      await cdp.send('Profiler.start');
      const t0 = Date.now();
      await wheel(120, 45);
      const wheelMs = Date.now() - t0;
      await sleep(3000);
      const { profile } = await cdp.send('Profiler.stop');
      const recorded = await page.evaluate(stopFrameGaps);
      const outTile = await tile();
      const row = { mode, round: r, inTile, outTile, wheelMs, ...summarizeGaps(recorded) };
      results.push(row);
      writeFileSync(join(OUT_DIR, `${LABEL}-${mode}-${r}.cpuprofile`), JSON.stringify(profile));
      log(`ROW ${JSON.stringify(row)}`);
    }
  }
} catch (e) { log(`FAIL ${e.stack}`); }
writeFileSync(join(OUT_DIR, `${LABEL}-results.json`), JSON.stringify(results, null, 1));
await finish();
await recordBench('zoom-out', {
  tree: TREE, label: LABEL, rows: results, result: join(OUT_DIR, `${LABEL}-results.json`),
  profiles: results.map((r) => join(OUT_DIR, `${LABEL}-${r.mode}-${r.round}.cpuprofile`))
});
