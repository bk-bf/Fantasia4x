// Paused-aware animation clock. `animNow()` is a monotonic millisecond clock that STOPS advancing
// while the game is paused — so every wall-clock floater/overlay lifetime (combat text, dialog
// speech bubbles, attack lunges, projectiles) FREEZES on pause and resumes cleanly, instead of
// ageing out during the pause and vanishing the instant you unpause. Spawn times and the ageing
// checks both read animNow(), so they stay consistent across a pause; the CSS animations are frozen
// in parallel with `animation-play-state: paused` (WorldEffectsLayer), keeping visual + logical
// lifetime in lockstep. Drive `setAnimPaused` from the isPaused store (GameCanvas).

let pausedAccumMs = 0;
let pauseStartMs: number | null = null;

/** Monotonic ms clock that halts while paused (real time minus all time spent paused). */
export function animNow(): number {
  const raw = Date.now();
  return raw - pausedAccumMs - (pauseStartMs !== null ? raw - pauseStartMs : 0);
}

/** Toggle the clock's paused state (idempotent — safe to call with the current value repeatedly). */
export function setAnimPaused(paused: boolean): void {
  const raw = Date.now();
  if (paused) {
    if (pauseStartMs === null) pauseStartMs = raw;
  } else if (pauseStartMs !== null) {
    pausedAccumMs += raw - pauseStartMs;
    pauseStartMs = null;
  }
}
