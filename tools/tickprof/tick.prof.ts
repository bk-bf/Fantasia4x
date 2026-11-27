import { test } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { PerformanceObserver } from 'node:perf_hooks';
import { HeadlessSession } from '../../src/lib/game/headless/HeadlessSession';
import { wasmPathfinderService } from '../../src/lib/game/services/WasmPathfinderService';
import { SCENARIOS } from './scenarios';
import { gzipSync } from 'node:zlib';
import { toSnapshot } from '../../src/lib/game/headless/snapshot';
import { provenance, worldOf } from './provenance';

const NAME = process.env.PROF_SCENARIO ?? 'dev-save';
const WARM = Number(process.env.PROF_WARM ?? 600);
const MEASURE = Number(process.env.PROF_TICKS ?? 1800);
const OUT = process.env.PROF_OUT ?? 'tools/tickprof/out';

type Wasm = Record<string, (...a: unknown[]) => unknown>;
const wasmStats: Record<string, { calls: number; ms: number; bytesIn: number; bytesOut: number }> = {};
let wasmOn = false;
function wrapWasm() {
  const svc = wasmPathfinderService as unknown as { mod: Wasm };
  const mod = svc.mod;
  const wrapped: Wasm = {};
  for (const k of Object.keys(mod)) {
    const f = mod[k];
    if (typeof f !== 'function') { (wrapped as Record<string, unknown>)[k] = f; continue; }
    wrapped[k] = (...a: unknown[]) => {
      if (!wasmOn) return f(...a);
      const s = performance.now();
      const r = f(...a);
      const ms = performance.now() - s;
      const e = (wasmStats[k] ??= { calls: 0, ms: 0, bytesIn: 0, bytesOut: 0 });
      e.calls++; e.ms += ms;
      for (const x of a) if (ArrayBuffer.isView(x)) e.bytesIn += x.byteLength;
      if (ArrayBuffer.isView(r)) e.bytesOut += (r as ArrayBufferView).byteLength;
      return r;
    };
  }
  svc.mod = wrapped;
}

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] ?? 0;
};

test(`tick profile ${NAME}`, async () => {
  const t0 = performance.now();
  const state = SCENARIOS[NAME]();
  const buildMs = performance.now() - t0;
  const start = worldOf(state);
  if (process.env.PROF_DUMP) writeFileSync(process.env.PROF_DUMP, gzipSync(JSON.stringify(toSnapshot(state))));
  const s = new HeadlessSession();
  await s.start(state);
  wrapWasm();
  const engine = (s as unknown as { engine: Record<string, unknown> }).engine;
  let cur: Record<string, number> = {};
  engine.timed = (label: string, fn: () => void) => {
    const st = performance.now();
    fn();
    cur[label] = (cur[label] ?? 0) + (performance.now() - st);
  };
  s.tick(WARM);

  const gc: { kind: number; ms: number; t: number }[] = [];
  const obs = new PerformanceObserver((l) => {
    for (const e of l.getEntries()) gc.push({ kind: (e as unknown as { detail?: { kind: number } }).detail?.kind ?? -1, ms: e.duration, t: e.startTime });
  });
  obs.observe({ entryTypes: ['gc'] });

  const perTick: Record<string, number>[] = [];
  const totals: number[] = [];
  const memStart = process.memoryUsage();
  wasmOn = true;
  const m0 = performance.now();
  for (let i = 0; i < MEASURE; i++) {
    cur = {};
    const st = performance.now();
    const r = s.tick(1);
    totals.push(performance.now() - st);
    if (!r.result.success) throw new Error((r.result.errors ?? []).join(';'));
    perTick.push(cur);
  }
  const wall = performance.now() - m0;
  wasmOn = false;
  await new Promise((r) => setTimeout(r, 50));
  obs.disconnect();
  const memEnd = process.memoryUsage();

  const labels = [...new Set(perTick.flatMap((t) => Object.keys(t)))];
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const tickMean = mean(totals);
  const phases = labels
    .map((l) => {
      const xs = perTick.map((t) => t[l] ?? 0);
      return { label: l, mean: mean(xs), p95: pct(xs, 95), max: Math.max(...xs), share: mean(xs) / tickMean };
    })
    .sort((a, b) => b.mean - a.mean);
  const gs = s.getState();
  const gcTotal = gc.reduce((a, g) => a + g.ms, 0);
  const report = {
    ...provenance(start, gs),
    scenario: NAME,
    mapSize: [gs.worldMap[0]?.length, gs.worldMap.length],
    buildings: (gs.buildings ?? []).length,
    jobs: (gs.jobs ?? []).length,
    pawnStates: gs.pawns.reduce((a, p) => ((a[String((p as unknown as { currentState?: string }).currentState)] = (a[String((p as unknown as { currentState?: string }).currentState)] ?? 0) + 1), a), {} as Record<string, number>),
    stock: Object.values((gs.stockpile ?? {}) as Record<string, number>).reduce((a, b) => a + b, 0),
    designations: Object.keys(gs.designations ?? {}).length,
    craftQueue: (gs.craftingQueue ?? []).length,
    dropped: (gs.droppedItems ?? []).length,
    buildMs,
    warm: WARM,
    measured: MEASURE,
    wallMs: wall,
    tick: { mean: tickMean, p50: pct(totals, 50), p95: pct(totals, 95), p99: pct(totals, 99), max: Math.max(...totals) },
    uncappedTps: 1000 / tickMean,
    gc: {
      count: gc.length,
      totalMs: gcTotal,
      perTickMs: gcTotal / MEASURE,
      share: gcTotal / wall,
      maxPauseMs: Math.max(0, ...gc.map((g) => g.ms)),
      byKind: Object.entries(gc.reduce((a, g) => ((a[g.kind] = (a[g.kind] ?? 0) + g.ms), a), {} as Record<number, number>))
    },
    wasm: Object.fromEntries(
      Object.entries(wasmStats).map(([k, e]) => [k, { ...e, callsPerTick: e.calls / MEASURE, msPerTick: e.ms / MEASURE, bytesInPerTick: e.bytesIn / MEASURE, share: e.ms / wall }])
    ),
    heapMB: { start: memStart.heapUsed / 1e6, end: memEnd.heapUsed / 1e6, rss: memEnd.rss / 1e6, external: memEnd.external / 1e6, arrayBuffers: memEnd.arrayBuffers / 1e6 },
    phases
  };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/${process.env.PROF_TAG ?? NAME}.json`, JSON.stringify(report, null, 1));
  console.log(JSON.stringify({ ...report, phases: phases.slice(0, 14).map((p) => `${p.label} ${p.mean.toFixed(3)} p95 ${p.p95.toFixed(3)} ${(p.share * 100).toFixed(1)}%`) }, null, 1));
});
