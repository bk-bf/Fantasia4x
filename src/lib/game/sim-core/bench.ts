/**
 * R1 spike benchmark (ENGINE-PERFORMANCE ★ ACTIVE) — the go/no-go gate for the Rust-SoA core.
 *
 * Runs ONE representative hot loop (per-entity needs decay + one-step movement with a chunked-grid
 * tile-cost read) at target scale and times four implementations doing the **identical** work:
 *
 *   1. Rust-SoA          — the proposed core (`SimWorld.bench_step`, over wasm SoA buffers)
 *   2. JS-SoA            — same data layout, in JS over plain typed arrays  → isolates language delta
 *   3. JS-OOP (mutate)   — array of entity objects, mutated in place        → isolates SoA vs objects
 *   4. JS-OOP (immutable)— spreads new entity+needs objects each tick       → the CURRENT engine style
 *
 * So: (3 vs 4) = the allocation tax the current code pays; (2 vs 3) = the SoA layout win; (1 vs 2) =
 * what Rust buys on top. Run from the browser console: `await runSimCoreBench()`.
 *
 * Honest-comparison notes: all four read tile cost from the same chunk-major addressing; all run the
 * same tick count after a warmup; Rust runs the loop entirely in wasm (one boundary crossing) and
 * the JS variants in a JS loop — i.e. pure per-tick COMPUTE, no per-tick JS↔wasm marshalling (that
 * boundary is an R3 concern, measured separately there). Numbers are this machine's V8 + wasm.
 */
import {
  SimWorldView,
  CHUNK,
  NF32,
  NI32,
  NU8,
  F_HUNGER,
  F_NEXT_CELL_COST,
  I_X,
  I_Y,
  U_ALIVE
} from './simWorldView';
import { gameLogger } from '../dev/gameLogger';

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1]
];

export interface BenchResult {
  entities: number;
  width: number;
  height: number;
  ticks: number;
  msPerTick: Record<string, number>;
  ratios: Record<string, number>;
}

/** Chunk-major tile index (mirrors SimWorldView.tileIndex) over a plain JS tile-cost array. */
function tileIdx(x: number, y: number, chunksX: number): number {
  return (
    (((y / CHUNK) | 0) * chunksX + ((x / CHUNK) | 0)) * CHUNK * CHUNK +
    (y % CHUNK) * CHUNK +
    (x % CHUNK)
  );
}

function median(ms: number[]): number {
  const s = [...ms].sort((a, b) => a - b);
  return s[s.length >> 1];
}

/** Time `fn` over `reps` runs (each running the full tick count), return median ms per single run. */
function timeRuns(fn: () => number, reps: number): number {
  let sink = 0;
  const samples: number[] = [];
  for (let r = 0; r < reps; r++) {
    const t0 = performance.now();
    sink += fn();
    samples.push(performance.now() - t0);
  }
  if (sink === Infinity) console.log('unreachable'); // keep `sink` live
  return median(samples);
}

/**
 * Run the R1 benchmark. Defaults to the target scale (500 entities, 1000×1000, 600 ticks ≈ 10
 * sim-seconds). Logs a table to the console + perf.log and returns the structured result.
 */
export async function runSimCoreBench(
  entities = 500,
  width = 1000,
  height = 1000,
  ticks = 600,
  reps = 5
): Promise<BenchResult> {
  const chunksX = Math.ceil(width / CHUNK);

  // ── 1. Rust-SoA (real wasm core) ────────────────────────────────────────────────────────────
  const view = await SimWorldView.create(entities + 16, width, height);
  for (let i = 0; i < entities; i++) {
    const slot = view.spawn();
    view.setI32(I_X, slot, (i * 131) % width);
    view.setI32(I_Y, slot, (i * 197) % height);
    view.setF32(F_HUNGER, slot, 10);
  }
  view.benchStep(ticks); // warmup
  const rust = timeRuns(() => view.benchStep(ticks), reps);

  // ── 2. JS-SoA (same layout, plain typed arrays) ──────────────────────────────────────────────
  const cap = entities + 16;
  const f32 = new Float32Array(NF32 * cap);
  const i32 = new Int32Array(NI32 * cap);
  const u8 = new Uint8Array(NU8 * cap);
  const tileTotal = chunksX * Math.ceil(height / CHUNK) * CHUNK * CHUNK;
  const tCost = new Float32Array(tileTotal).fill(1);
  for (let i = 0; i < entities; i++) {
    u8[U_ALIVE * cap + i] = 1;
    i32[I_X * cap + i] = (i * 131) % width;
    i32[I_Y * cap + i] = (i * 197) % height;
    f32[F_HUNGER * cap + i] = 10;
  }
  const jsSoa = () => {
    let cs = 0;
    for (let t = 0; t < ticks; t++) {
      for (let i = 0; i < entities; i++) {
        if (u8[U_ALIVE * cap + i] === 0) continue;
        f32[F_HUNGER * cap + i] = Math.min(100, f32[F_HUNGER * cap + i] + 0.1);
        f32[1 * cap + i] = Math.min(100, f32[1 * cap + i] + 0.05); // fatigue
        f32[3 * cap + i] = Math.min(100, f32[3 * cap + i] + 0.08); // thirst
        f32[4 * cap + i] = Math.min(100, f32[4 * cap + i] + 0.02); // hygiene
        const ncc = f32[F_NEXT_CELL_COST * cap + i] - 1;
        if (ncc <= 0) {
          const [dx, dy] = DIRS[i & 7];
          let nx = i32[I_X * cap + i] + dx;
          let ny = i32[I_Y * cap + i] + dy;
          if (nx < 0 || nx >= width) nx -= 2 * dx;
          if (ny < 0 || ny >= height) ny -= 2 * dy;
          i32[I_X * cap + i] = nx;
          i32[I_Y * cap + i] = ny;
          f32[F_NEXT_CELL_COST * cap + i] = tCost[tileIdx(nx, ny, chunksX)];
        } else {
          f32[F_NEXT_CELL_COST * cap + i] = ncc;
        }
        cs += i32[I_X * cap + i] + f32[F_HUNGER * cap + i];
      }
    }
    return cs;
  };
  jsSoa();
  const jsSoaMs = timeRuns(jsSoa, reps);

  // ── 3 & 4. JS-OOP ────────────────────────────────────────────────────────────────────────────
  type Ent = {
    x: number;
    y: number;
    hunger: number;
    fatigue: number;
    thirst: number;
    hygiene: number;
    ncc: number;
    dir: number;
  };
  const makeEnts = (): Ent[] =>
    Array.from({ length: entities }, (_, i) => ({
      x: (i * 131) % width,
      y: (i * 197) % height,
      hunger: 10,
      fatigue: 0,
      thirst: 0,
      hygiene: 0,
      ncc: 0,
      dir: i & 7
    }));

  // 3. mutate in place
  const entsM = makeEnts();
  const jsOopMut = () => {
    let cs = 0;
    for (let t = 0; t < ticks; t++) {
      for (let i = 0; i < entities; i++) {
        const e = entsM[i];
        e.hunger = Math.min(100, e.hunger + 0.1);
        e.fatigue = Math.min(100, e.fatigue + 0.05);
        e.thirst = Math.min(100, e.thirst + 0.08);
        e.hygiene = Math.min(100, e.hygiene + 0.02);
        const ncc = e.ncc - 1;
        if (ncc <= 0) {
          const [dx, dy] = DIRS[e.dir];
          let nx = e.x + dx;
          let ny = e.y + dy;
          if (nx < 0 || nx >= width) nx -= 2 * dx;
          if (ny < 0 || ny >= height) ny -= 2 * dy;
          e.x = nx;
          e.y = ny;
          e.ncc = tCost[tileIdx(nx, ny, chunksX)];
        } else {
          e.ncc = ncc;
        }
        cs += e.x + e.hunger;
      }
    }
    return cs;
  };
  jsOopMut();
  const jsOopMutMs = timeRuns(jsOopMut, reps);

  // 4. immutable spread each tick (the current engine's pattern) — fresh array of fresh objects
  const jsOopImm = () => {
    let cs = 0;
    let ents = makeEnts();
    for (let t = 0; t < ticks; t++) {
      ents = ents.map((e) => {
        const ncc = e.ncc - 1;
        let next: Ent;
        if (ncc <= 0) {
          const [dx, dy] = DIRS[e.dir];
          let nx = e.x + dx;
          let ny = e.y + dy;
          if (nx < 0 || nx >= width) nx -= 2 * dx;
          if (ny < 0 || ny >= height) ny -= 2 * dy;
          next = { ...e, x: nx, y: ny, ncc: tCost[tileIdx(nx, ny, chunksX)] };
        } else {
          next = { ...e, ncc };
        }
        next.hunger = Math.min(100, e.hunger + 0.1);
        next.fatigue = Math.min(100, e.fatigue + 0.05);
        next.thirst = Math.min(100, e.thirst + 0.08);
        next.hygiene = Math.min(100, e.hygiene + 0.02);
        cs += next.x + next.hunger;
        return next;
      });
    }
    return cs;
  };
  jsOopImm();
  const jsOopImmMs = timeRuns(jsOopImm, reps);

  view.free();

  const per = (total: number) => total / ticks;
  const msPerTick = {
    'rust-soa': per(rust),
    'js-soa': per(jsSoaMs),
    'js-oop-mutable': per(jsOopMutMs),
    'js-oop-immutable': per(jsOopImmMs)
  };
  const ratios = {
    'soa-layout-win (oop-mut/js-soa)': jsOopMutMs / jsSoaMs,
    'rust-win (js-soa/rust)': jsSoaMs / rust,
    'alloc-tax (oop-imm/oop-mut)': jsOopImmMs / jsOopMutMs,
    'total (oop-imm/rust)': jsOopImmMs / rust
  };
  const result: BenchResult = { entities, width, height, ticks, msPerTick, ratios };

  const banner =
    `[SIM-BENCH] ${entities} entities · ${width}×${height} · ${ticks} ticks × ${reps} reps (median)\n` +
    Object.entries(msPerTick)
      .map(([k, v]) => `  ${k.padEnd(18)} ${v.toFixed(4)} ms/tick`)
      .join('\n') +
    '\n' +
    Object.entries(ratios)
      .map(([k, v]) => `  ${k.padEnd(34)} ${v.toFixed(1)}×`)
      .join('\n');
  // eslint-disable-next-line no-console
  console.log(banner);
  gameLogger.log(0, 'PERF', '[SIM-BENCH] ' + JSON.stringify(result));
  return result;
}
