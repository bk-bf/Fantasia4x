/**
 * Worker-safe runtime check (ADR-021, sim→Worker).
 *
 * `$app/environment`'s `browser` cannot be bundled into a Web Worker — Rollup fails to resolve
 * `__sveltekit/environment` in the worker graph. Anything that runs in BOTH the main thread and the
 * sim worker (e.g. `WasmPathfinderService`) must use this instead.
 *
 * `true` in a real browser main thread OR a Web Worker; `false` in SSR / Node / vitest — matching
 * the old `browser` semantics (WASM/DOM work is skipped there). Main thread has `window`; a worker
 * has `WorkerGlobalScope` / `importScripts`; Node/vitest have neither.
 */
const g = globalThis as {
  WorkerGlobalScope?: unknown;
  importScripts?: unknown;
};

export const isClientRuntime: boolean =
  typeof window !== 'undefined' ||
  typeof g.WorkerGlobalScope !== 'undefined' ||
  typeof g.importScripts === 'function';
