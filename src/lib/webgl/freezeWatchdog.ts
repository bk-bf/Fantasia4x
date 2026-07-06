/**
 * freezeWatchdog — main-thread client for the off-thread freeze watchdog (freeze-watchdog.worker.ts).
 *
 * WHY: a main-thread freeze (a pathological WebGL draw, a GPU watchdog reset, a runaway loop) can't
 * be logged FROM the main thread — the frozen thread can't run its own logger. So the render loop
 * `beat()`s a phase label to a worker before each risky phase; the worker detects the absence of
 * beats and records the freeze itself. See the worker file for the full rationale.
 *
 * DEV-only + best-effort: `beat()` is a bare `postMessage` (a few µs, non-blocking) so it's safe to
 * call every frame; if the worker never started it's a no-op.
 */

let worker: Worker | null = null;

/** Spawn the watchdog and tell it how long a heartbeat gap counts as "frozen". No-op outside DEV /
 *  a browser, or if already running. */
export function startFreezeWatchdog(thresholdMs = 2000): void {
  if (worker || typeof Worker === 'undefined' || !import.meta.env.DEV) return;
  try {
    worker = new Worker(new URL('./freeze-watchdog.worker.ts', import.meta.url), { type: 'module' });
    worker.postMessage({ kind: 'config', threshold: thresholdMs });
  } catch {
    worker = null; // watchdog is diagnostics-only; never let its failure affect the game
  }
}

/** Report that the main thread is alive and about to enter `phase`. The LAST phase beat before a
 *  freeze is what the worker names as the culprit. Cheap enough to call unconditionally per frame. */
export function beat(phase: string, turn = 0): void {
  if (!worker) return;
  try {
    worker.postMessage({ kind: 'beat', phase, turn });
  } catch {
    /* never let a diagnostic throw into the render loop */
  }
}

export function stopFreezeWatchdog(): void {
  worker?.terminate();
  worker = null;
}
