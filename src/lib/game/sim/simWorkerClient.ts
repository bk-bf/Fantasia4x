/**
 * simWorkerClient — main-thread side of the sim worker (ADR-021, sim→Worker).
 *
 * Two things:
 *  1. `verifyWasmInWorker()` — W1 standalone WASM-in-worker check (console, dev).
 *  2. `simWorkerBridge` — W2–W4 cutover: spawns the sim worker, forwards commands + lifecycle, and
 *     surfaces the worker's state snapshots to the store. Gated by `USE_SIM_WORKER` (default OFF —
 *     enable with `?simworker` or localStorage `simworker=1`), so the live main-thread path is
 *     untouched until the user opts in to test the cutover (which needs a browser).
 */
import { isClientRuntime } from '../core/runtime';
import type { GameState } from '../core/types';

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

/** Is the sim-in-worker cutover active? Off by default; opt in with `?simworker` or localStorage. */
export const USE_SIM_WORKER: boolean =
  isClientRuntime &&
  import.meta.env.DEV &&
  typeof location !== 'undefined' &&
  (new URLSearchParams(location.search).has('simworker') ||
    (typeof localStorage !== 'undefined' && localStorage.getItem('simworker') === '1'));

/**
 * Bridge to the sim worker. The worker owns GameState + the tick loop; this forwards commands and
 * lifecycle, caches the (rarely-sent) worldMap, and reattaches it to each snapshot before handing a
 * full GameState to the store projection.
 */
class SimWorkerBridge {
  private w: Worker | null = null;
  private worldMap: GameState['worldMap'] = [];
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
    worldMap?: GameState['worldMap'];
    flush?: boolean;
    error?: string;
  }): void {
    if (m.kind === 'snapshot') {
      if (m.worldMap) this.worldMap = m.worldMap;
      this.onState?.(
        { ...(m.state as object), worldMap: this.worldMap } as GameState,
        m.flush ?? true
      );
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
}
