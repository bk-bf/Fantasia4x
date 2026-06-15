/**
 * simWorkerClient — main-thread side of the sim worker (ADR-021, sim→Worker).
 *
 * Two things:
 *  1. `verifyWasmInWorker()` — W1 standalone WASM-in-worker check (console, dev).
 *  2. `simWorkerBridge` — the sim runs here (ADR-021 W4 complete): spawns the sim worker, forwards
 *     commands + lifecycle, and reassembles the worker's snapshots into the store projection. This is
 *     now the ONLY sim path in the browser (`USE_SIM_WORKER` = `isClientRuntime`); the `?simworker`
 *     opt-in flag is retired.
 */
import { isClientRuntime } from '../core/runtime';
import { realSimLogSink } from '../../stores/simLogBridge';
import type { SimLogEvent, EntitySync } from './simProtocol';
import type { GameState, Pawn, Mob, WorldTile } from '../core/types';

/**
 * Apply a per-entity sync (W2b) onto a per-id mirror, returning the reconstructed array in order.
 * A `full` resync replaces the mirror; otherwise slim upserts are merged onto the mirror (so cold
 * fields persist between resyncs), full upserts (newly-seen ids) replace, and `removed` ids are
 * reaped. Each merge makes a NEW object so downstream reactivity still fires.
 */
function applyEntitySync<T extends { id: string }>(
  mirror: Map<string, T>,
  sync: EntitySync<T>
): T[] {
  if ('full' in sync) {
    mirror.clear();
    for (const e of sync.full) mirror.set(e.id, e);
    return sync.full;
  }
  for (const u of sync.upserts) {
    const prev = mirror.get(u.id);
    mirror.set(u.id, prev ? ({ ...prev, ...u } as T) : (u as T));
  }
  for (const id of sync.removed) mirror.delete(id);
  return sync.order.map((id) => mirror.get(id)!);
}

export function verifyWasmInWorker(): void {
  if (!isClientRuntime) {
    console.warn('[SIM-WORKER] not in a browser; cannot spawn worker');
    return;
  }
  console.info('[SIM-WORKER] spawning worker, running wasm-check…');
  const w = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
  w.onmessage = (e: MessageEvent) => {
    const d = e.data;
    if (d?.type === 'wasm-result') {
      if (d.ready)
        console.info('[SIM-WORKER] ✅ WASM initialised IN the worker (browser=%s)', d.browser);
      else if (d.browser === false)
        console.error('[SIM-WORKER] ❌ browser FALSE in worker → init gate skipped WASM.');
      else
        console.error(
          '[SIM-WORKER] ❌ WASM failed to load in the worker:',
          d.error ?? '(no error)'
        );
      w.terminate();
    }
  };
  w.onerror = (e) => console.error('[SIM-WORKER] worker error:', e.message || e);
  w.postMessage({ kind: 'wasm-check' });
}

/**
 * The sim ALWAYS runs in the worker now (ADR-021 W4 complete — the `?simworker` opt-in flag is
 * retired). True in any browser runtime; false only under SSR/tests (no worker, no tick loop), where
 * the engine is driven directly by the test/headless caller.
 */
export const USE_SIM_WORKER: boolean = isClientRuntime;

/**
 * Bridge to the sim worker. The worker owns GameState + the tick loop; this forwards commands and
 * lifecycle, caches the (rarely-sent) worldMap, and reattaches it to each snapshot before handing a
 * full GameState to the store projection.
 */
class SimWorkerBridge {
  private w: Worker | null = null;
  private worldMap: GameState['worldMap'] = [];
  /** Mirror of the worker's sent state, rebuilt from sectional diffs (W2). Each snapshot carries
   *  only the top-level fields whose ref changed; unchanged sections are reused from here, so they
   *  aren't re-cloned across the boundary. Reset on init to match the worker's `lastSent` baseline. */
  private lastState: Partial<GameState> = {};
  /** Per-id entity mirrors (W2b): pawns/mobs arrive as slim-per-flush + periodic full resync, merged
   *  here so cold fields persist between resyncs. Reset on init to match the worker's id baselines. */
  private pawnMirror = new Map<string, Pawn>();
  private mobMirror = new Map<string, Mob>();
  /** Store hook: full state projection per snapshot. `flush` = update held value AND notify+save
   *  (~15Hz); between flushes only the held value is refreshed (per-tick positions for the renderer). */
  onState: ((s: GameState, flush: boolean) => void) | null = null;
  /** Store hook: a requested full state (for explicit save). */
  onFullState: ((s: GameState) => void) | null = null;

  start(): void {
    if (this.w) return;
    this.w = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
    this.w.onmessage = (e: MessageEvent) => this.handle(e.data);
    this.w.onerror = (e) => console.error('[SIM-WORKER] error:', e.message || e);
  }

  init(state: GameState, seed: number): void {
    this.worldMap = state.worldMap;
    this.lastState = {}; // matches the worker resetting its sectional-diff baseline on init
    this.pawnMirror.clear();
    this.mobMirror.clear();
    this.w?.postMessage({ kind: 'init', state, seed });
  }
  command(cmd: unknown): void {
    this.w?.postMessage({ kind: 'command', cmd });
  }
  setSpeed(speed: number): void {
    this.w?.postMessage({ kind: 'setSpeed', speed });
  }
  setPaused(paused: boolean): void {
    this.w?.postMessage({ kind: 'setPaused', paused });
  }
  requestSave(): void {
    this.w?.postMessage({ kind: 'requestSave' });
  }

  private handle(m: {
    kind: string;
    state?: GameState;
    pawns?: EntitySync<Pawn>;
    mobs?: EntitySync<Mob>;
    worldMap?: GameState['worldMap'];
    worldMapDelta?: Array<{ y: number; x: number; tile: Partial<WorldTile> }>;
    flush?: boolean;
    error?: string;
    events?: SimLogEvent[];
  }): void {
    if (m.kind === 'snapshot') {
      if (m.worldMap) {
        this.worldMap = m.worldMap;
      } else if (m.worldMapDelta) {
        // Merge each SLIM delta tile (§D) onto the full cached tile: only render/movement fields are
        // shipped during harvest; the rest are preserved from the cached tile (they don't change on a
        // regrowth/harvest delta). Cheap vs. re-cloning full tiles; renderer rebuilds off _terrainRev.
        for (const d of m.worldMapDelta) {
          const row = this.worldMap[d.y];
          if (row) row[d.x] = { ...row[d.x], ...d.tile };
        }
      }
      // Merge the sectional diff onto the mirror: changed fields overwrite, unchanged ones keep
      // their refs (no re-clone). pawns/mobs are reconstructed from their per-entity mirrors and
      // worldMap from its own cache. A new top-level object each flush keeps the store reactive.
      this.lastState = { ...this.lastState, ...(m.state as object) };
      const pawns = m.pawns
        ? applyEntitySync(this.pawnMirror, m.pawns)
        : (this.lastState.pawns ?? []);
      const mobs = m.mobs ? applyEntitySync(this.mobMirror, m.mobs) : (this.lastState.mobs ?? []);
      this.onState?.(
        { ...this.lastState, pawns, mobs, worldMap: this.worldMap } as GameState,
        m.flush ?? true
      );
    } else if (m.kind === 'simlog') {
      // Replay the worker's buffered chronicle/combat-text calls against the real (DOM) sink.
      const sink = realSimLogSink as unknown as Record<string, (...a: unknown[]) => unknown>;
      for (const ev of m.events ?? []) sink[ev.m]?.(...ev.a);
    } else if (m.kind === 'fullState' && m.state) {
      this.worldMap = m.state.worldMap;
      this.onFullState?.(m.state);
    } else if (m.kind === 'error') {
      console.error('[SIM-WORKER]', m.error);
    }
  }
}

export const simWorkerBridge = new SimWorkerBridge();

// Dev convenience: callable from the browser console as `verifyWasmInWorker()`.
if (isClientRuntime && import.meta.env.DEV) {
  (globalThis as Record<string, unknown>).verifyWasmInWorker = verifyWasmInWorker;
  // R1 sim-core benchmark: `await runSimCoreBench()` (lazy — bench code stays out of the bundle
  // until invoked). Optional args: (entities, width, height, ticks, reps).
  (globalThis as Record<string, unknown>).runSimCoreBench = async (...args: number[]) =>
    (await import('../sim-core/bench')).runSimCoreBench(...args);
}
