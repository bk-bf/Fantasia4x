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
