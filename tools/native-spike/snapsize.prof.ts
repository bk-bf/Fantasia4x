import { test } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { serialize } from 'node:v8';
import { buildScenario } from '../../src/lib/game/headless/Scenario';
import { getScenarioPreset } from '../../src/lib/game/headless/scenarios/presets';

const SCENARIO = process.env.SNAP_SCENARIO ?? 'large-wilderness';
const SECONDS = Number(process.env.SNAP_SECONDS ?? 20);
const SPEED = Number(process.env.SNAP_SPEED ?? 1);
const OUT = process.env.SNAP_OUT ?? 'tools/native-spike/out/snapsize';

type Snap = { kind?: string; snowDelta?: ArrayBufferView; worldMap?: unknown };

const binBytes = (m: Snap) => m.snowDelta?.byteLength ?? 0;
const jsonBytes = (m: Snap) => JSON.stringify({ ...m, snowDelta: undefined }).length;

test(`snapshot sizes ${SCENARIO} at ${SPEED}x`, async () => {
  const snaps: { t: number; json: number; clone: number; bin: number; worldMap: boolean }[] = [];
  const samples: Snap[] = [];
  let measuring = false;
  const self = {
    onmessage: null as null | ((e: { data: unknown }) => Promise<void>),
    postMessage(msg: Snap) {
      if (msg?.kind !== 'snapshot' || !measuring) return;
      snaps.push({ t: performance.now(), json: jsonBytes(msg), clone: serialize(msg).length, bin: binBytes(msg), worldMap: msg.worldMap !== undefined });
      if (samples.length < 400) samples.push(msg);
    }
  };
  (globalThis as unknown as { self: unknown }).self = self;
  const state = buildScenario(getScenarioPreset(SCENARIO)!.spec);
  await import('../../src/lib/game/sim/sim.worker');
  measuring = true;
  await self.onmessage!({ data: { kind: 'init', state, seed: state.seed } });
  await self.onmessage!({ data: { kind: 'setSpeed', speed: SPEED } });
  await self.onmessage!({ data: { kind: 'setPaused', paused: false } });
  await new Promise((r) => setTimeout(r, SECONDS * 1000));
  await self.onmessage!({ data: { kind: 'setPaused', paused: true } });
  const steady = snaps.filter((s) => !s.worldMap);
  const sorted = (k: 'json' | 'clone') => steady.map((s) => s[k]).sort((a, b) => a - b);
  const q = (xs: number[], p: number) => xs[Math.min(xs.length - 1, Math.floor(p * xs.length))] ?? 0;
  const span = (snaps.at(-1)!.t - snaps[0].t) / 1000;
  const report = {
    scenario: SCENARIO,
    speed: SPEED,
    snapshots: snaps.length,
    perSecond: snaps.length / span,
    full: snaps.filter((s) => s.worldMap).map((s) => ({ json: s.json, clone: s.clone })),
    steadyJson: { p50: q(sorted('json'), 0.5), p95: q(sorted('json'), 0.95), max: q(sorted('json'), 1) },
    steadyClone: { p50: q(sorted('clone'), 0.5), p95: q(sorted('clone'), 0.95), max: q(sorted('clone'), 1) },
    binBytes: steady.reduce((a, s) => a + s.bin, 0) / Math.max(1, steady.length),
    jsonBytesPerSecond: steady.reduce((a, s) => a + s.json, 0) / span
  };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/${SCENARIO}.${SPEED}x.json`, JSON.stringify(report, null, 1));
  const p50 = q(sorted('json'), 0.5);
  const typical = samples.filter((m) => m.worldMap === undefined).sort((a, b) => Math.abs(jsonBytes(a) - p50) - Math.abs(jsonBytes(b) - p50))[0];
  writeFileSync(`${OUT}/typical.json`, JSON.stringify({ ...typical, snowDelta: undefined }));
  const full = samples.find((m) => m.worldMap !== undefined);
  if (full) writeFileSync(`${OUT}/full.json`, JSON.stringify({ ...full, snowDelta: undefined }));
  console.log(JSON.stringify(report));
});
