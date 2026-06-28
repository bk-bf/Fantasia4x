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
import {
  markRenderTileDirty,
  clearRenderTileDeltas
} from '../../components/UI/gameCanvas/mainTileDeltas';
import { batchLogReplay } from '../../stores/Log';
import { vlog, setVerboseLogging } from '../core/logSink';
import type { SimLogEvent, EntitySync } from './simProtocol';
import type { GameState, Pawn, Mob, WorldTile, DroppedItem } from '../core/types';

/**
 * Apply a per-entity sync (W2b) onto a per-id mirror, returning the reconstructed array in order.
 * A `full` resync replaces the mirror; otherwise slim upserts are merged onto the mirror (so cold
 * fields persist between resyncs), full upserts (newly-seen ids) replace, and `removed` ids are
 * reaped. Each merge makes a NEW object so downstream reactivity still fires.
 */
// Update the per-id mirror from a delta — upserts MERGED (pawns/mobs: hot+cold split) or REPLACED
// wholesale (`replace`=drops, sent as a complete slim object), removed deleted, `full` resets it.
// Split out from the array rebuild so a PAUSED client can keep the mirror in sync CHEAPLY (no array,
// no render) — a per-id EntitySync cannot skip frames (a later frame's `order` references ids whose
// upsert rode an earlier frame, so dropping a frame strands them → `mirror.get` undefined → crash).
function updateEntityMirror<T extends { id: string }>(
  mirror: Map<string, T>,
  sync: EntitySync<T>,
  replace = false
): void {
  if ('full' in sync) {
    mirror.clear();
    for (const e of sync.full) mirror.set(e.id, e);
    return;
  }
  for (const u of sync.upserts) {
    if (replace) {
      mirror.set(u.id, u as T);
    } else {
      const prev = mirror.get(u.id);
      mirror.set(u.id, prev ? ({ ...prev, ...u } as T) : (u as T));
    }
  }
  for (const id of sync.removed) mirror.delete(id);
}

// Reconstruct the ordered array after updating the mirror. `.filter` is defensive: a healthy delta
// keeps `order ⊆ mirror`, but a stranded id must never crash a downstream `.filter(d => d.stored)`.
function applyEntitySync<T extends { id: string }>(
  mirror: Map<string, T>,
  sync: EntitySync<T>
): T[] {
  updateEntityMirror(mirror, sync, false);
  if ('full' in sync) return sync.full;
  return sync.order.map((id) => mirror.get(id)).filter((e): e is T => e !== undefined);
}

function applyDropSync(
  mirror: Map<string, DroppedItem>,
  sync: EntitySync<DroppedItem>
): DroppedItem[] {
  updateEntityMirror(mirror, sync, true);
  if ('full' in sync) return sync.full;
  return sync.order.map((id) => mirror.get(id)).filter((e): e is DroppedItem => e !== undefined);
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
  /** Per-id mirror of dropped items, rebuilt from the `drops` per-id sync (W2b-style). */
  private dropMirror = new Map<string, DroppedItem>();
  /** Store hook: full state projection per snapshot. `flush` = update held value AND notify+save
   *  (~15Hz); between flushes only the held value is refreshed (per-tick positions for the renderer). */
  onState: ((s: GameState, flush: boolean) => void) | null = null;
  /** Store hook: a requested full state (for explicit save). */
  onFullState: ((s: GameState) => void) | null = null;
  /** Mirror of the worker's paused flag. While true the client DROPS per-tick (non-commit) snapshots
   *  so the renderer can't be raced by in-flight tick frames after the user hits pause (the worker
   *  takes up to one batch to actually stop). Commit snapshots — command results + the pause hand-off
   *  — are always applied so player actions while paused still render. */
  private paused = false;
  /** Settings → Debug mode: mirror of the verbose-logging gate. Re-sent on every (re)init so a freshly
   *  spawned worker inherits the current setting. */
  private verbose = false;

  start(): void {
    if (this.w) return;
    this.w = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
    this.w.onmessage = (e: MessageEvent) => this.handle(e.data);
    this.w.onerror = (e) => console.error('[SIM-WORKER] error:', e.message || e);
  }

  init(state: GameState, seed: number, opts?: { preview?: boolean }): void {
    this.worldMap = state.worldMap;
    this.lastState = {}; // matches the worker resetting its sectional-diff baseline on init
    this.pawnMirror.clear();
    this.mobMirror.clear();
    this.dropMirror.clear();
    // `preview` (menu backdrop) makes the engine run a gutted turn; the real boot omits it ⇒ false.
    this.w?.postMessage({ kind: 'init', state, seed, preview: opts?.preview ?? false });
    // Re-apply the verbose gate to the (possibly freshly spawned) worker, since `init` resets its
    // forwarding sink — without this a worker started after the toggle was set would log nothing.
    this.w?.postMessage({ kind: 'setVerbose', on: this.verbose });
  }
  command(cmd: unknown): void {
    this.w?.postMessage({ kind: 'command', cmd });
  }
  setSpeed(speed: number): void {
    this.w?.postMessage({ kind: 'setSpeed', speed });
  }
  /** Settings → Debug mode toggle: enable/disable the verbose sim traces at runtime. Flips both the
   *  worker's gate (where the per-tick sim runs) and this thread's own gate (main-thread `vlog` calls,
   *  e.g. the ITEM-DBG receive trace). */
  setVerbose(on: boolean): void {
    this.verbose = on;
    setVerboseLogging(on); // main-thread copy
    this.w?.postMessage({ kind: 'setVerbose', on });
  }
  setPaused(paused: boolean): void {
    // Set the client gate FIRST (synchronously) so any tick snapshots already queued from the worker
    // are dropped on arrival — the render freezes the instant the user clicks, not a batch later.
    this.paused = paused;
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
    drops?: EntitySync<DroppedItem>;
    worldMap?: GameState['worldMap'];
    worldMapDelta?: Array<{ y: number; x: number; tile: Partial<WorldTile> }>;
    flush?: boolean;
    commit?: boolean;
    error?: string;
    events?: SimLogEvent[];
  }): void {
    if (m.kind === 'snapshot') {
      // Apply worldMap + lastState + per-id mirrors on EVERY frame so the delta protocol stays
      // consistent (frames can't be skipped — see updateEntityMirror).
      if (m.worldMap) {
        this.worldMap = m.worldMap;
        // ADR-026: a full worldMap send (worldgen / game-load) → GameCanvas does a full rebuild that
        // repaints every cell, so any pending per-tile coords are moot (mirrors worker clearTileDeltas).
        clearRenderTileDeltas();
      } else if (m.worldMapDelta) {
        // Merge each SLIM delta tile (§D) onto the full cached tile: only render/movement fields are
        // shipped during harvest; the rest are preserved from the cached tile (they don't change on a
        // regrowth/harvest delta). Cheap vs. re-cloning full tiles; renderer rebuilds off _terrainRev.
        for (const d of m.worldMapDelta) {
          const row = this.worldMap[d.y];
          if (row) {
            row[d.x] = { ...row[d.x], ...d.tile };
            // ADR-026: record the coord so GameCanvas repaints ONLY this cell (no whole-map scan).
            markRenderTileDirty(d.y, d.x);
          }
        }
      }
      // Merge the sectional diff onto the mirror: changed fields overwrite, unchanged ones keep
      // their refs (no re-clone). pawns/mobs are reconstructed from their per-entity mirrors and
      // worldMap from its own cache. A new top-level object each flush keeps the store reactive.
      this.lastState = { ...this.lastState, ...(m.state as object) };

      // While paused, keep the per-id mirrors CURRENT (so the delta protocol stays valid) but skip the
      // O(entities) array rebuild + render notify — this freezes the renderer the instant the user
      // pauses without it being raced by in-flight tick frames. Commit frames (command results + the
      // pause hand-off) fall through and render. (Replaces the old "drop the whole frame", which
      // stranded per-id upserts → undefined holes → the currentStockpile `d.stored` crash.)
      if (this.paused && !m.commit) {
        if (m.pawns) updateEntityMirror(this.pawnMirror, m.pawns, false);
        if (m.mobs) updateEntityMirror(this.mobMirror, m.mobs, false);
        if (m.drops) updateEntityMirror(this.dropMirror, m.drops, true);
        return;
      }

      // ITEM-DBG: confirm the main thread actually RECEIVED a pawn's inventory upsert (the other end
      // of the worker's "SYNC→main shipped" line). Worker shipped + here received = the change reached
      // the store, so a still-empty carry card is a render bug. Worker shipped but NO line here = the
      // delta was lost in transit (dropped/raced flush). Cheap: only fires on a real inventory upsert.
      if (m.pawns && 'upserts' in m.pawns) {
        for (const u of m.pawns.upserts) {
          if (u && 'inventory' in u) {
            const inv = (u as { inventory?: { items?: Record<string, number> } }).inventory;
            vlog(
              'item',
              this.lastState.turn ?? 0,
              `RECV←worker: ${u.id} inventory = ${JSON.stringify(inv?.items ?? {})}`
            );
          }
        }
      }
      const pawns = m.pawns
        ? applyEntitySync(this.pawnMirror, m.pawns)
        : (this.lastState.pawns ?? []);
      const mobs = m.mobs ? applyEntitySync(this.mobMirror, m.mobs) : (this.lastState.mobs ?? []);
      const droppedItems = m.drops
        ? applyDropSync(this.dropMirror, m.drops)
        : (this.lastState.droppedItems ?? []);
      this.onState?.(
        { ...this.lastState, pawns, mobs, droppedItems, worldMap: this.worldMap } as GameState,
        m.flush ?? true
      );
    } else if (m.kind === 'simlog') {
      // Replay the worker's buffered chronicle/combat-text calls against the real (DOM) sink. Wrap the
      // whole batch so the chronicle store fires ONE notification for the lot (a combat flood otherwise
      // re-ran every derived view + panel per event — the engagement-start FPS dip).
      const sink = realSimLogSink as unknown as Record<string, (...a: unknown[]) => unknown>;
      const events = m.events ?? [];
      batchLogReplay(() => {
        for (const ev of events) sink[ev.m]?.(...ev.a);
      });
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
