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
import { setSimLogSink, type SimLogSink } from '../core/logSink';
import { gameLogger } from '../dev/gameLogger';
import { applySimCommand } from './commands';
import type { SimLogEvent } from './simProtocol';
import type { GameState } from '../core/types';

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
let profile = false; // opt-in (init {profile}); gates the [PROF]/[SIM-TPS] perf.log diagnostics
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
 * Publish state to the main thread at the ~15Hz UI-push (flush) rate. Posting EVERY tick was tried
 * and reverted: structured-cloning the full ~290-entity snapshot 50×/s overwhelmed the main thread's
 * deserialize and crashed FPS to ~7. The freeze-frames the per-tick attempt was meant to fix were
 * actually the terrain-rebuild storm (now handled by `_terrainRev` below), not position-update rate
 * — so 15Hz snapshots are fine. worldMap is sent only when its ref changed (38k tiles).
 */
function publish(state: GameState, flush: boolean) {
  if (!flush) return;
  const worldMapChanged = state.worldMap !== lastWorldMap;
  lastWorldMap = state.worldMap;
  const bSig = buildingsVisualSig(state.buildings);
  if (
    state.worldMap !== prevWM ||
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
  const { worldMap, ...rest } = state;
  post({
    kind: 'snapshot',
    state: { ...rest, _terrainRev: terrainRev },
    worldMap: worldMapChanged ? worldMap : undefined,
    flush
  });
}

// Always-on TPS/tick-cost meter → perf.log once/sec. Tells us the compute ceiling (achieved TPS,
// avg ms/tick, worker busy%) so "4× does nothing" can be diagnosed as compute-bound vs. a bug.
let tpsTicks = 0;
let tpsTickMs = 0;
let tpsSince = 0;

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
    const t0 = profile ? performance.now() : 0; // per-tick timing only when profiling
    const r = gameEngine.processGameTurn();
    if (profile) {
      tpsTickMs += performance.now() - t0;
      tpsTicks++;
    }
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
  flushLog(); // ship combat-text/chronicle emitted during this batch's ticks

  if (!profile) return;
  if (!tpsSince) tpsSince = now;
  const elapsed = now - tpsSince;
  if (elapsed >= 1000) {
    const tps = (tpsTicks / elapsed) * 1000;
    const avg = tpsTicks ? tpsTickMs / tpsTicks : 0;
    const busy = (tpsTickMs / elapsed) * 100;
    gameLogger.log(
      gameEngine.getGameState()?.turn ?? 0,
      'PERF',
      `[SIM-TPS] speed=${speed}× tps=${tps.toFixed(0)} (target ${speed * TICKS_PER_SECOND}) avgTick=${avg.toFixed(1)}ms busy=${busy.toFixed(0)}%`
    );
    tpsTicks = 0;
    tpsTickMs = 0;
    tpsSince = now;
  }
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
      // Opt-in diagnostics (init {profile}, from ?simprof): per-phase [PROF] + [SIM-TPS] to
      // perf.log. The console profileTurns() sets the flag on the MAIN globalThis, which the worker
      // can't see — so it's driven through init instead. Default OFF (no per-tick perf.log spam).
      profile = !!msg.profile;
      if (profile) {
        const g = globalThis as Record<string, unknown>;
        g.__profileTurns = true;
        g.__prof = {};
        g.__profCounts = {};
      }
      gameEngine.setGameStateManager(new GameStateManager(msg.state));
      gameEngine.setOutputSink(publish); // per-tick → snapshot
      gameEngine.setCommitSink((s) => publish(s, true)); // command result → snapshot
      await wasmPathfinderService.init();
      lastWorldMap = (msg.state as GameState).worldMap;
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
