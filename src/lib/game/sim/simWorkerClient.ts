/**
 * simWorkerClient — main-thread side of the sim worker (ADR-021, sim→Worker).
 *
 * W1: a standalone verifier for "does the WASM spatial core init in a Worker?" — it does NOT
 * touch the live game path. Spawns the worker, runs a wasm-check, logs the result, terminates.
 * Exposed as `globalThis.verifyWasmInWorker()` in dev so it can be run from the console.
 */
import { isClientRuntime } from '../core/runtime';

export function verifyWasmInWorker(): void {
  if (!isClientRuntime) {
    console.warn('[SIM-WORKER] not in a browser; cannot spawn worker');
    return;
  }
  console.info('[SIM-WORKER] spawning worker, running wasm-check…');
  // `new URL(..., import.meta.url)` + { type: 'module' } is the Vite-recognised module-worker form
  // (lets the worker use ESM imports + dynamic import() of the wasm-pack glue).
  const w = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
  w.onmessage = (e: MessageEvent) => {
    const d = e.data;
    if (d?.type === 'wasm-result') {
      if (d.ready) {
        console.info('[SIM-WORKER] ✅ WASM initialised IN the worker (browser=%s)', d.browser);
      } else if (d.browser === false) {
        console.error(
          '[SIM-WORKER] ❌ $app/environment.browser is FALSE in the worker → init gate skipped WASM. ' +
            'Fix: WasmPathfinderService must use a worker-safe environment check.'
        );
      } else {
        console.error(
          '[SIM-WORKER] ❌ WASM failed to load in the worker:',
          d.error ?? '(no error)'
        );
      }
      w.terminate();
    }
  };
  w.onerror = (e) => console.error('[SIM-WORKER] worker error:', e.message || e);
  w.postMessage({ type: 'wasm-check' });
}

// Dev convenience: callable from the browser console as `verifyWasmInWorker()`.
if (isClientRuntime && import.meta.env.DEV) {
  (globalThis as Record<string, unknown>).verifyWasmInWorker = verifyWasmInWorker;
}
