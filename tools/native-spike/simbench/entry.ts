import { initSync } from '$lib/spatial-core-pkg/spatial_core.js';
import { HeadlessSession } from '$lib/game/headless/HeadlessSession';
import { buildScenario } from '$lib/game/headless/Scenario';
import { getScenarioPreset } from '$lib/game/headless/scenarios/presets';

export interface BenchOptions {
  wasm: BufferSource;
  scenario?: string;
  warm?: number;
  ticks?: number;
  rounds?: number;
  log?: (line: string) => void;
}

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] ?? 0;
};

export async function runBench(o: BenchOptions) {
  const log = o.log ?? (() => {});
  initSync({ module: o.wasm });
  const name = o.scenario ?? 'large-wilderness';
  const warm = o.warm ?? 300;
  const ticks = o.ticks ?? 1500;
  const roundsN = o.rounds ?? 3;
  const t0 = performance.now();
  const state = buildScenario(getScenarioPreset(name)!.spec);
  const buildMs = performance.now() - t0;
  const s = new HeadlessSession();
  await s.start(state);
  const startMs = performance.now() - t0;
  log(`built ${name} in ${buildMs.toFixed(0)}ms, started in ${startMs.toFixed(0)}ms`);
  s.tick(warm);
  const rounds = [];
  for (let r = 0; r < roundsN; r++) {
    const per: number[] = [];
    const m0 = performance.now();
    for (let i = 0; i < ticks; i++) {
      const st = performance.now();
      const res = s.tick(1);
      per.push(performance.now() - st);
      if (!res.result.success) throw new Error((res.result.errors ?? []).join(';'));
    }
    const wall = performance.now() - m0;
    const round = { ticks, wallMs: wall, tps: (ticks * 1000) / wall, p50: pct(per, 50), p95: pct(per, 95), max: Math.max(...per) };
    log(`round ${r + 1}: ${round.tps.toFixed(1)} t/s p50 ${round.p50.toFixed(3)} p95 ${round.p95.toFixed(3)}`);
    rounds.push(round);
  }
  const gs = s.getState();
  return { scenario: name, map: [gs.worldMap[0]?.length, gs.worldMap.length], pawns: gs.pawns.length, mobs: (gs.mobs ?? []).length, turn: gs.turn, buildMs, warm, rounds };
}
