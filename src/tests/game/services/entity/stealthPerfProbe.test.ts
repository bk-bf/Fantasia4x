// TEMP PERF PROBE — locates the es:step regression by CPU self-time.
// Runs the REAL stepEntities pipeline headless under the V8 sampling profiler and prints the
// top functions by self-time. DELETE this file + the probe line in entityHelpers.ts when done.
// Run: pnpm vitest run src/tests/game/services/entity/stealthPerfProbe.test.ts --reporter=basic
import { describe, it } from 'vitest';
import { Session } from 'node:inspector';
import { buildProfilerScenario } from '$lib/game/dev/profilerScenario';
import { entityService } from '$lib/game/services/EntityService';
import type { GameState } from '$lib/game/core/types';

function profile(ticks: number): Promise<void> {
  let state: GameState = buildProfilerScenario({ seed: 0xbeef, pawns: 5, mobs: 529 });
  for (let i = 0; i < 60; i++) state = entityService.stepEntities(state); // warm

  const session = new Session();
  session.connect();
  const post = (m: string, p?: object) =>
    new Promise<any>((res, rej) =>
      session.post(m as any, p as any, (e: any, r: any) => (e ? rej(e) : res(r)))
    );

  return (async () => {
    await post('Profiler.enable');
    await post('Profiler.setSamplingInterval', { interval: 50 }); // 50µs → fine-grained
    await post('Profiler.start');
    for (let i = 0; i < ticks; i++) state = entityService.stepEntities(state);
    const { profile } = await post('Profiler.stop');

    // Aggregate self-time (hitCount) by function, sum over all call sites.
    const byFn = new Map<string, { self: number; file: string }>();
    let totalHits = 0;
    for (const node of profile.nodes) {
      const hits = node.hitCount ?? 0;
      totalHits += hits;
      if (hits === 0) continue;
      const cf = node.callFrame;
      const name = cf.functionName || '(anonymous)';
      const file = (cf.url || '').split('/').slice(-1)[0].replace('.ts', '');
      const key = `${name}  @${file}`;
      const cur = byFn.get(key) ?? { self: 0, file };
      cur.self += hits;
      byFn.set(key, cur);
    }
    const rows = [...byFn.entries()].sort((a, b) => b[1].self - a[1].self).slice(0, 30);
    // eslint-disable-next-line no-console
    console.log(
      `\n=== es:step CPU SELF-TIME (top 30, ${totalHits} samples over ${ticks} ticks) ===\n` +
        rows
          .map(
            ([k, v]) =>
              `  ${((v.self / totalHits) * 100).toFixed(1).padStart(5)}%  ${k}`
          )
          .join('\n') +
        '\n'
    );
  })();
}

describe('STEALTH perf probe', () => {
  it('CPU self-time of stepEntities', async () => {
    (globalThis as any).__STEALTH_BYPASS = false;
    await profile(400);
  });
});
