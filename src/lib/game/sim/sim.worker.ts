/// <reference lib="webworker" />
/**
 * sim.worker.ts — the simulation worker (ADR-021, sim→Worker decouple, W1–W4).
 *
 * Owns the canonical GameState and runs the whole tick loop OFF the render thread, so the main
 * thread renders at the display rate regardless of sim cost. The engine's per-tick output and
 * command commits (decoupled via injected sinks in W0) become postMessages here.
 *
 * Protocol: see simProtocol.ts. Commands arrive as serializable {type,payload} (W3 registry);
 * state goes back as full-ish snapshots (worldMap omitted when unchanged — it's the big part and
 * rarely changes). WASM (W1) inits in the worker. Save (W4) = post the full state on request.
 */
import { isClientRuntime } from '../core/runtime';
import { wasmPathfinderService } from '../services/WasmPathfinderService';
import { GameStateManager } from '../core/GameState';
import { gameEngine } from '../systems/GameEngineImpl';
import { rng } from '../core/rng';
import { resetUnreachableJobs } from '../systems/PawnStateMachine';
import { TICKS_PER_SECOND } from '../core/time';
import { setSimLogSink, simLog, type SimLogSink } from '../core/logSink';
import { applySimCommand } from './commands';
import type { SimLogEvent, EntitySync } from './simProtocol';
import { drainTileDeltas, clearTileDeltas } from '../core/tileDeltas';
import type { GameState, Pawn, Mob } from '../core/types';

const TICK_MS = 1000 / TICKS_PER_SECOND;
// W5 — batch governed by a WALL-CLOCK budget, not a tick count (a fixed step cap locks the worker
// ~360ms with no snapshots posted → stutter). Run ticks until the budget is spent, then yield so
// snapshots keep flowing. The budget must be ≥ ~one tick-cost so a backlogged worker runs ticks
// BACK-TO-BACK and actually uses its capacity: at 8ms (< the ~12ms heavy tick) every batch did
// exactly 1 tick then idled until the 16ms timer → pinned ~62 TPS at EVERY speed, so the speed
// control did nothing. At ~16ms a backlogged batch runs ~2 ticks (≈the compute ceiling, ~83 TPS /
// ~1.4× under 150-pawn load — high speeds are compute-bound on one core, unreachable by any budget),
// while 1× still self-limits to 60 TPS via the accumulator. Light load drains fully → true 4×.
const BATCH_BUDGET_MS = 16;
const MAX_STEPS_PER_BATCH = 120; // hard safety only; the budget is the real limiter
// Cap carried backlog so high speed CARRIES across batches (drives more ticks) without spiralling
// into ever-longer locked catch-up. ~9 ticks (150ms) of slack, then we're best-effort behind realtime.
const MAX_BACKLOG_MS = 150;

let speed = 1;
let paused = true;
// perf sampler (~1 Hz): a low-rate TPS/load line into the unified log's `perf` category, so the
// agent can fetch `.debug/perf.log` without the retired per-tick firehose. Cheap (one entry/sec).
let perfTicksAccum = 0;
let perfWindowStart = 0;
let accMs = 0;
let lastBatch = 0;
let loop: ReturnType<typeof setInterval> | null = null;
let lastWorldMap: GameState['worldMap'] | null = null;
// Terrain-rebuild signal: structured-clone gives the main thread NEW refs for designations/buildings/
// zoneTiles every snapshot, defeating its ref-based "did terrain change?" check (→ a 90ms rebuild
// every throttle window = freeze frames). In the worker, immutable updates preserve unchanged refs,
// so we compute a reliable revision here and the renderer rebuilds terrain only when it actually bumps.
let terrainRev = 0;
let prevWM: unknown,
  prevBuildingsSig = '',
  prevDesignations: unknown,
  prevZoneTiles: unknown;

/**
 * Visual signature of the building set — ONLY the fields the terrain layer draws (pos/type/status/
 * deconstruct/paused), deliberately EXCLUDING fuel/lit. Mirrors GameCanvas.buildingsVisualSig.
 * Critical for terrainRev: a lit campfire decrements fuel every tick → a fresh `buildings` array
 * every tick → a raw ref-compare would bump terrainRev constantly and rebuild the 38k-tile terrain
 * ~2/s for an invisible change (the residual freeze frames).
 */
function buildingsVisualSig(bs: GameState['buildings']): string {
  let sig = '';
  for (const b of bs ?? [])
    sig += `${b.id}:${b.x},${b.y}:${b.type}:${b.status}:${b.deconstructQueued ? 1 : 0}:${b.paused ? 1 : 0}|`;
  return sig;
}

function post(msg: unknown) {
  (self as unknown as Worker).postMessage(msg);
}

// --- sim-log forwarding (combat text + chronicle) ---------------------------------------------
// The real SimLogSink (chronicle + combatFeedback) lives in the store/DOM layer and can't run in
// the worker, so calls are buffered and replayed on the main thread (simWorkerClient). Without this
// the worker's sink stays the no-op default → floating combat text + chronicle silently vanish.
let logBuffer: SimLogEvent[] = [];
function flushLog() {
  if (logBuffer.length === 0) return;
  post({ kind: 'simlog', events: logBuffer });
  logBuffer = [];
}
function installForwardingLogSink() {
  const fwd =
    (m: string) =>
    (...a: unknown[]) => {
      logBuffer.push({ m, a });
    };
  setSimLogSink({
    // logActivity returns an id; nothing in the sim consumes it, so '' is safe.
    logActivity: (...a: unknown[]) => {
      logBuffer.push({ m: 'logActivity', a });
      return '';
    },
    logEvent: fwd('logEvent'),
    logCombatSwing: fwd('logCombatSwing'),
    logCombatKill: fwd('logCombatKill'),
    pushCombatText: fwd('pushCombatText'),
    logHuntStart: fwd('logHuntStart'),
    logFlee: fwd('logFlee'),
    logEntityDeath: fwd('logEntityDeath'),
    logEntityStateChange: fwd('logEntityStateChange')
  } as SimLogSink);
}

/**
 * Last-sent ref per top-level GameState field (the W2 sectional diff). Reset on `init`. The bridge
 * keeps the mirror copy; the two stay in lock-step because postMessage is ordered + reliable.
 * pawns/mobs/worldMap are handled by dedicated paths and excluded here.
 */
let lastSent: Record<string, unknown> = {};
const SECTIONAL_SKIP = new Set(['pawns', 'mobs', 'worldMap']);

// ── W2b per-entity sync ───────────────────────────────────────────────────────────────────────
// Heavy/static fields dropped from the per-flush SLIM projection and only re-sent on a periodic
// FULL resync. Everything NOT listed (position, needs, state, path, combat scalars…) stays fresh at
// the flush rate; these deep/rarely-changing trees are what made the full-entity clone expensive.
const PAWN_COLD = new Set<string>([
  'inventory',
  'equipment',
  'stats',
  'physicalTraits',
  'racialTraits',
  'skills',
  'limbs',
  'injuries',
  'conditions',
  'statusEffectDurations'
]);
const MOB_COLD = new Set<string>([
  'stats',
  'physicalTraits',
  'skills',
  'limbs',
  'injuries',
  'conditions',
  'statusEffectDurations'
]);
// Resync the full (cold-inclusive) entities every Nth flush (~2/s at the 15Hz flush rate). The cold
// fields are thus ≤ this many flushes stale on the main thread — fine for limbs/inventory/skills,
// while position/needs/state/pain/blood stay live every flush.
const RESYNC_EVERY = 8;
let flushSeq = 0;
let lastPawnIds = new Set<string>();
let lastMobIds = new Set<string>();

/** Project an entity to its slim form (all fields except the cold set). */
function slimEntity<T extends { id: string }>(
  e: T,
  cold: Set<string>
): Partial<T> & { id: string } {
  const o: Record<string, unknown> = {};
  for (const k in e) if (!cold.has(k)) o[k] = (e as Record<string, unknown>)[k];
  return o as Partial<T> & { id: string };
}

/**
 * Build the per-entity sync for one array. On a resync flush, send everything FULL and reset the
 * id baseline. Otherwise send a slim upsert for every known id (fresh hot fields) and a FULL entity
 * for any newly-seen id (so the mirror is never missing cold fields), plus `removed`/`order`.
 */
function syncEntities<T extends { id: string }>(
  arr: readonly T[],
  prevIds: Set<string>,
  cold: Set<string>,
  full: boolean
): EntitySync<T> {
  if (full) {
    prevIds.clear();
    for (const e of arr) prevIds.add(e.id);
    return { full: arr as T[] };
  }
  const upserts: Array<Partial<T> & { id: string }> = new Array(arr.length);
  const order: string[] = new Array(arr.length);
  const cur = new Set<string>();
  for (let i = 0; i < arr.length; i++) {
    const e = arr[i];
    order[i] = e.id;
    cur.add(e.id);
    upserts[i] = prevIds.has(e.id) ? slimEntity(e, cold) : e; // new id → full
  }
  const removed: string[] = [];
  for (const id of prevIds) if (!cur.has(id)) removed.push(id);
  prevIds.clear();
  for (const id of cur) prevIds.add(id);
  return { upserts, removed, order };
}

/**
 * Publish state to the main thread at the ~15Hz UI-push (flush) rate. Posting EVERY tick was tried
 * and reverted: structured-cloning the full ~290-entity snapshot 50×/s overwhelmed the main thread's
 * deserialize and crashed FPS to ~7. The freeze-frames the per-tick attempt was meant to fix were
 * actually the terrain-rebuild storm (now handled by `_terrainRev` below), not position-update rate
 * — so 15Hz snapshots are fine.
 *
 * W2 sectional diff: rather than re-cloning the WHOLE state every flush (profiled at ~38% of sim
 * time — `post` structured-clone + the `{...rest}` spread), send ONLY the top-level fields whose
 * ref changed since the last flush. Immutable updates give changed sections a new ref and leave
 * untouched ones (buildings, designations, research, settings, …) ref-stable, so those are skipped
 * and the bridge reuses its cached copy — no re-clone across the boundary. pawns/mobs change every
 * tick so they still flow; worldMap stays special-cased (38k tiles, sent only when its ref changes).
 */
function publish(state: GameState, flush: boolean) {
  if (!flush) return;
  const worldMapChanged = state.worldMap !== lastWorldMap;
  lastWorldMap = state.worldMap;
  // In-place tile mutations (resource regrowth) don't flip the worldMap ref — they accumulate as
  // deltas. A full worldMap send already carries them, so drain-and-discard in that case; otherwise
  // ship the deltas. Either way a visible terrain change must bump _terrainRev (renderer rebuild).
  const tileDeltas = worldMapChanged ? (clearTileDeltas(), null) : drainTileDeltas();
  const bSig = buildingsVisualSig(state.buildings);
  if (
    state.worldMap !== prevWM ||
    tileDeltas !== null ||
    bSig !== prevBuildingsSig ||
    state.designations !== prevDesignations ||
    state.zoneTiles !== prevZoneTiles
  ) {
    terrainRev++;
    prevWM = state.worldMap;
    prevBuildingsSig = bSig;
    prevDesignations = state.designations;
    prevZoneTiles = state.zoneTiles;
  }
  const delta: Record<string, unknown> = {};
  const src = state as unknown as Record<string, unknown>;
  for (const k in state) {
    if (SECTIONAL_SKIP.has(k)) continue; // pawns/mobs → EntitySync; worldMap → its own cache
    const v = src[k];
    if (v !== lastSent[k]) {
      delta[k] = v;
      lastSent[k] = v;
    }
  }
  delta._terrainRev = terrainRev; // always present; renderer's terrain-rebuild trigger

  const full = flushSeq % RESYNC_EVERY === 0;
  flushSeq++;
  const pawns = syncEntities(state.pawns, lastPawnIds, PAWN_COLD, full);
  const mobs = syncEntities(state.mobs ?? [], lastMobIds, MOB_COLD, full);

  post({
    kind: 'snapshot',
    state: delta,
    pawns,
    mobs,
    worldMap: worldMapChanged ? state.worldMap : undefined,
    worldMapDelta: tileDeltas ?? undefined,
    flush
  });
}

function batch() {
  if (paused) {
    accMs = 0;
    lastBatch = performance.now();
    return;
  }
  const now = performance.now();
  const dt = lastBatch ? now - lastBatch : 0;
  lastBatch = now;
  accMs += Math.min(dt, 250) * speed;
  const start = now;
  let steps = 0;
  while (accMs >= TICK_MS && steps < MAX_STEPS_PER_BATCH) {
    const r = gameEngine.processGameTurn();
    if (!r.success) {
      accMs = 0;
      post({ kind: 'error', error: 'tick failed: ' + (r.errors ?? []).join('; ') });
      return;
    }
    accMs -= TICK_MS;
    steps++;
    // Budget check AFTER a tick so every batch makes ≥1 tick of progress, then yields.
    if (performance.now() - start >= BATCH_BUDGET_MS) break;
  }
  // Compute-bound: clamp (don't zero) the carried backlog so a higher speed keeps driving extra
  // ticks across batches, while bounding it so it can't spiral into ever-longer locked catch-up.
  if (accMs > MAX_BACKLOG_MS) accMs = MAX_BACKLOG_MS;

  // ── perf sampler (~1 Hz) ──
  perfTicksAccum += steps;
  if (perfWindowStart === 0) perfWindowStart = now;
  const perfElapsed = now - perfWindowStart;
  if (perfElapsed >= 1000) {
    // Skip windows bloated by a pause/stall (they'd report a bogus TPS).
    if (perfElapsed < 3000 && perfTicksAccum > 0) {
      const tps = Math.round((perfTicksAccum * 1000) / perfElapsed);
      const gs = gameEngine.getGameState();
      simLog.logEvent({
        category: 'perf',
        turn: gs.turn,
        message: `tps=${tps} speed=${speed}x pawns=${gs.pawns.length} mobs=${(gs.mobs ?? []).length}`
      });
    }
    perfTicksAccum = 0;
    perfWindowStart = now;
  }

  flushLog(); // ship combat-text/chronicle emitted during this batch's ticks
}

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data;
  switch (msg?.kind) {
    case 'wasm-check': {
      // W1 verifier (kept).
      let ready = false;
      let error: string | undefined;
      try {
        await wasmPathfinderService.init();
        ready = wasmPathfinderService.isReady();
      } catch (err) {
        error = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      }
      post({ type: 'wasm-result', browser: isClientRuntime, ready, error });
      break;
    }
    case 'init': {
      rng.reseed(msg.seed ?? 0);
      resetUnreachableJobs();
      installForwardingLogSink();
      gameEngine.setGameStateManager(new GameStateManager(msg.state));
      gameEngine.setOutputSink(publish); // per-tick → snapshot
      gameEngine.setCommitSink((s) => publish(s, true)); // command result → snapshot
      await wasmPathfinderService.init();
      lastWorldMap = (msg.state as GameState).worldMap;
      lastSent = {}; // reset the sectional-diff baseline so the first publish sends every field
      flushSeq = 0; // first publish is a full entity resync (flushSeq % RESYNC_EVERY === 0)
      lastPawnIds = new Set();
      lastMobIds = new Set();
      lastBatch = performance.now();
      if (!loop) loop = setInterval(batch, 16);
      post({ kind: 'ready' });
      // Push the initial state straight back so the main projection is populated.
      publish(msg.state, true);
      break;
    }
    case 'command':
      gameEngine.applyCommand((s) => applySimCommand(s, msg.cmd), msg.cmd.save ?? false);
      flushLog(); // a command (e.g. a draft attack) can emit combat text outside the batch loop
      break;
    case 'setSpeed':
      speed = msg.speed;
      break;
    case 'setPaused':
      paused = msg.paused;
      if (!paused) lastBatch = performance.now();
      break;
    case 'requestSave':
      post({ kind: 'fullState', state: gameEngine.getGameState() });
      break;
  }
};
