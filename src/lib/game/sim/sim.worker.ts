/// <reference lib="webworker" />
/**
 * sim.worker.ts — the simulation worker (ADR-021, sim→Worker decouple).
 *
 * W1 scope: prove the WASM spatial core initialises in a Worker context. The risk is that
 * `$app/environment`'s `browser` flag (which `WasmPathfinderService.init` gates on) may be `false`
 * inside a worker (no `window`), which would silently skip WASM load. So we report BOTH the
 * `browser` value and the post-init `isReady()` so the failure mode is unambiguous:
 *   browser=false            → the gate blocked it; WasmPathfinderService must use a worker-safe check.
 *   browser=true, ready=false → WASM load/instantiate failed (asset path / vite worker bundling).
 *   ready=true               → WASM works in the worker; proceed to W2+ (run the tick loop here).
 *
 * Later steps (W2–W5) will run GameEngineImpl + services + the tick loop in this worker and
 * postMessage per-tick snapshots; commands arrive as messages. For now it only answers wasm-check.
 */
import { isClientRuntime } from '../core/runtime';
import { wasmPathfinderService } from '../services/WasmPathfinderService';

type InMsg = { type: 'wasm-check' };

self.onmessage = async (e: MessageEvent<InMsg>) => {
  const msg = e.data;
  if (msg?.type === 'wasm-check') {
    let error: string | undefined;
    let ready = false;
    try {
      await wasmPathfinderService.init();
      ready = wasmPathfinderService.isReady();
    } catch (err) {
      error = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    }
    self.postMessage({ type: 'wasm-result', browser: isClientRuntime, ready, error });
  }
};
