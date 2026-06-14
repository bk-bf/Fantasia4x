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
import { applySimCommand } from './commands';
import type { GameState } from '../core/types';

const TICK_MS = 1000 / TICKS_PER_SECOND;
// Off the render thread, the sim can run more ticks per batch without starving anything — but cap
// so a single batch can't lock the worker. W5 may raise this once measured.
const MAX_STEPS_PER_BATCH = 30;

let speed = 1;
let paused = true;
let accMs = 0;
let lastBatch = 0;
let loop: ReturnType<typeof setInterval> | null = null;
let lastWorldMap: GameState['worldMap'] | null = null;
// Terrain-rebuild signal: structured-clone gives the main thread NEW refs for designations/buildings/
// zoneTiles every snapshot, defeating its ref-based "did terrain change?" check (→ a 90ms rebuild
// every throttle window = freeze frames). In the worker, immutable updates preserve unchanged refs,
// so we compute a reliable revision here and the renderer rebuilds terrain only when it actually bumps.
let terrainRev = 0;
let prevWM: unknown, prevBuildings: unknown, prevDesignations: unknown, prevZoneTiles: unknown;

function post(msg: unknown) {
  (self as unknown as Worker).postMessage(msg);
}

/**
 * Publish state to the main thread EVERY tick (not just on flush) so the renderer interpolates from
 * per-tick-fresh entity positions — otherwise motion arrives in ~15Hz chunks and looks "wavy",
 * especially at high speed. The `flush` flag (true at the ~15Hz UI-push interval) tells the main
 * thread when to actually NOTIFY subscribers + save; between flushes it only refreshes the held
 * value (cheap; the renderer reads it via get()). worldMap is sent only when its ref changed (38k
 * tiles), so the per-tick payload stays small.
 */
function publish(state: GameState, flush: boolean) {
  const worldMapChanged = state.worldMap !== lastWorldMap;
  lastWorldMap = state.worldMap;
  if (
    state.worldMap !== prevWM ||
    state.buildings !== prevBuildings ||
    state.designations !== prevDesignations ||
    state.zoneTiles !== prevZoneTiles
  ) {
    terrainRev++;
    prevWM = state.worldMap;
    prevBuildings = state.buildings;
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
  let steps = 0;
  while (accMs >= TICK_MS && steps < MAX_STEPS_PER_BATCH) {
    const r = gameEngine.processGameTurn();
    if (!r.success) {
      accMs = 0;
      post({ kind: 'error', error: 'tick failed: ' + (r.errors ?? []).join('; ') });
      break;
    }
    accMs -= TICK_MS;
    steps++;
  }
  if (steps >= MAX_STEPS_PER_BATCH) accMs = 0;
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
