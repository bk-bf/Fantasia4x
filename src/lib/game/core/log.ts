// log.ts — gated dev logging for the simulation hot path.
//
// processGameTurn() runs TICKS_PER_SECOND times per second and many services
// logged on every tick (and per pawn). Profiling showed this console traffic was
// ~75% of total per-tick cost and scaled with pawn count — the single biggest
// blocker to a steady 60 TPS and to large pawn counts.
//
// These helpers are no-ops unless debugging is explicitly enabled at runtime via
// `gameDebug(true)` in the dev console. When disabled they short-circuit before
// any console call, so the per-tick logging tax disappears in normal play.
//
// Note: arguments are still evaluated by the caller, so keep heavy work (e.g.
// JSON.stringify) out of the argument list unless guarded by `isGameDebug()`.

let enabled = false;

/** Enable/disable hot-path debug logging at runtime. */
export function setGameDebug(on: boolean): void {
  enabled = on;
}

/** Whether hot-path debug logging is currently enabled. */
export function isGameDebug(): boolean {
  return enabled;
}

/** Gated `console.log` — silent unless `gameDebug(true)`. */
export const glog = (...args: unknown[]): void => {
  if (enabled) console.log(...args);
};

/** Gated `console.debug` — silent unless `gameDebug(true)`. */
export const gdebug = (...args: unknown[]): void => {
  if (enabled) console.debug(...args);
};

/** Gated `console.warn` — silent unless `gameDebug(true)`. */
export const gwarn = (...args: unknown[]): void => {
  if (enabled) console.warn(...args);
};

/**
 * Drop-in replacement for the global `console` in hot-path modules. Import it as
 * `console` to silence all `log`/`debug`/`info`/`warn` traffic in that file
 * unless `gameDebug(true)` is set, while leaving `console.error` always live:
 *
 *   import { gatedConsole as console } from '../core/log';
 *
 * This shadows the global `console` for the whole module with a single line, so
 * existing `console.log(...)` call sites need no changes.
 */
export const gatedConsole = {
  log: glog,
  debug: gdebug,
  info: glog,
  warn: gwarn,
  // Real errors are always surfaced.
  error: (...args: unknown[]): void => console.error(...args)
};

// Expose the toggle on the global object so it can be flipped from the dev console.
if (typeof globalThis !== 'undefined') {
  (globalThis as Record<string, unknown>).gameDebug = setGameDebug;
}

/**
 * Dev profiler: tally a hot-path call by `label`. Zero work unless the turn profiler is active
 * (`profileTurns()` in the dev console sets `globalThis.__profileTurns`). Counts accumulate into
 * `globalThis.__profCounts` and are dumped + reset once per second alongside the per-phase `[PROF]`
 * timings in GameEngineImpl — so a profiling run shows BOTH phase ms and how often the suspect
 * per-tick scans actually fire (P-5). No-op (one boolean read) in normal play.
 */
export function profCount(label: string): void {
  const g = globalThis as Record<string, unknown>;
  if (!g.__profileTurns) return;
  const counts = (g.__profCounts ??= {}) as Record<string, number>;
  counts[label] = (counts[label] ?? 0) + 1;
}

/**
 * Dev profiler: time a sub-pass `fn` under `label`, accumulating into the SAME `globalThis.__prof`
 * map the per-phase `[PROF]` line dumps (so a custom label appears as its own `[PROF]` entry,
 * averaged over the window and reset each second). **Call once per tick** (wrap a whole sub-loop),
 * not per-entity — the dump reports `sum/n`, so per-call wrapping would give per-call avg, not
 * per-tick. No-op (one boolean read) unless the turn profiler is active. Returns `fn()`'s result.
 */
export function profTime<T>(label: string, fn: () => T): T {
  const g = globalThis as Record<string, unknown>;
  if (!g.__profileTurns) return fn();
  const prof = (g.__prof ??= {}) as Record<string, { sum: number; n: number }>;
  const s = performance.now();
  const r = fn();
  const e = (prof[label] ??= { sum: 0, n: 0 });
  e.sum += performance.now() - s;
  e.n++;
  return r;
}

/**
 * Dev profiler: add a pre-measured `ms` to sub-pass `label` (the no-wrapping variant of `profTime`,
 * for timing a section between two `performance.now()` reads without re-bracing a big loop). Same
 * `globalThis.__prof` accumulator → appears as its own `[PROF]` entry. **Call once per tick.**
 */
export function profAdd(label: string, ms: number): void {
  const g = globalThis as Record<string, unknown>;
  if (!g.__profileTurns) return;
  const prof = (g.__prof ??= {}) as Record<string, { sum: number; n: number }>;
  const e = (prof[label] ??= { sum: 0, n: 0 });
  e.sum += ms;
  e.n++;
}
