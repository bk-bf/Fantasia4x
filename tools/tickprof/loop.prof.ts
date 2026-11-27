import { test } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { PerformanceObserver } from 'node:perf_hooks';
import { SCENARIOS } from './scenarios';
import { provenance, worldOf } from './provenance';

const NAME = process.env.PROF_SCENARIO ?? 'dev-save';
const SECONDS = Number(process.env.PROF_SECONDS ?? 30);
const SPEED = Number(process.env.PROF_SPEED ?? 4);
const OUT = process.env.PROF_OUT ?? 'tools/tickprof/out';

type PerfEvent = { category?: string; message?: string };
type Posted = { kind?: string; events?: { m: string; a: unknown[] }[] };

const tpsOf = (msg: Posted): string[] =>
  (msg.events ?? []).flatMap((ev) => {
    const e = ev.a?.[0] as PerfEvent | undefined;
    return ev.m === 'logEvent' && e?.category === 'perf' && e.message?.startsWith('tps=') ? [e.message] : [];
  });

test(`worker loop ${NAME} at ${SPEED}x`, async () => {
  const posts = { count: 0, cloneMs: 0, byKind: {} as Record<string, { n: number; ms: number }> };
  const tpsLines: string[] = [];
  const self = {
    onmessage: null as null | ((e: { data: unknown }) => Promise<void>),
    postMessage(msg: Posted, transfer: Transferable[] = []) {
      const st = performance.now();
      structuredClone(msg, { transfer });
      const ms = performance.now() - st;
      posts.count++;
      posts.cloneMs += ms;
      const k = msg?.kind ?? '?';
      const e = (posts.byKind[k] ??= { n: 0, ms: 0 });
      e.n++;
      e.ms += ms;
      if (k === 'simlog') tpsLines.push(...tpsOf(msg));
    }
  };
  (globalThis as unknown as { self: unknown }).self = self;
  const state = SCENARIOS[NAME]();
  const start = worldOf(state);
  await import('../../src/lib/game/sim/sim.worker');
  const { gameEngine } = await import('../../src/lib/game/systems/GameEngineImpl');
  const eng = gameEngine as unknown as Record<string, unknown>;
  const phase: Record<string, number> = {};
  eng.timed = (label: string, fn: () => void) => {
    const st = performance.now();
    fn();
    phase[label] = (phase[label] ?? 0) + (performance.now() - st);
  };
  let ticks = 0;
  let tickMs = 0;
  const orig = (gameEngine.processGameTurn as () => unknown).bind(gameEngine);
  (eng as { processGameTurn: () => unknown }).processGameTurn = () => {
    const st = performance.now();
    const r = orig();
    tickMs += performance.now() - st;
    ticks++;
    return r;
  };
  await self.onmessage!({ data: { kind: 'init', state, seed: state.seed } });
  await self.onmessage!({ data: { kind: 'setSpeed', speed: SPEED } });
  await self.onmessage!({ data: { kind: 'setPaused', paused: false } });
  await new Promise((r) => setTimeout(r, 5000));
  for (const k of Object.keys(phase)) delete phase[k];
  ticks = 0;
  tickMs = 0;
  posts.count = 0;
  posts.cloneMs = 0;
  posts.byKind = {};
  tpsLines.length = 0;
  let gcMs = 0;
  let gcN = 0;
  const obs = new PerformanceObserver((l) => {
    for (const e of l.getEntries()) {
      gcMs += e.duration;
      gcN++;
    }
  });
  obs.observe({ entryTypes: ['gc'] });
  const t0 = performance.now();
  await new Promise((r) => setTimeout(r, SECONDS * 1000));
  const wall = performance.now() - t0;
  obs.disconnect();
  await self.onmessage!({ data: { kind: 'setPaused', paused: true } });
  const tpsVals = tpsLines.map((l) => Number(/tps=(\d+)/.exec(l)?.[1]));
  const report = {
    ...provenance(start, gameEngine.getGameState()),
    scenario: NAME,
    speed: SPEED,
    targetTps: 60 * SPEED,
    seconds: wall / 1000,
    ticks,
    tps: (ticks * 1000) / wall,
    workerTpsLog: {
      n: tpsVals.length,
      mean: tpsVals.reduce((a, b) => a + b, 0) / Math.max(1, tpsVals.length),
      min: tpsVals.length ? Math.min(...tpsVals) : null,
      max: tpsVals.length ? Math.max(...tpsVals) : null,
      lines: tpsLines.slice(-5)
    },
    tickMsMean: tickMs / Math.max(1, ticks),
    busyShare: tickMs / wall,
    gc: { n: gcN, ms: gcMs, share: gcMs / wall },
    posts: { ...posts, cloneMsPerSec: posts.cloneMs / (wall / 1000) },
    phaseMsPerTick: Object.fromEntries(
      Object.entries(phase)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => [k, v / Math.max(1, ticks)])
    )
  };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/${process.env.PROF_TAG ?? NAME}.loop${SPEED}x.json`, JSON.stringify(report, null, 1));
});
