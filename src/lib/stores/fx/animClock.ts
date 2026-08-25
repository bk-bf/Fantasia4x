let pausedAccumMs = 0;
let pauseStartMs: number | null = null;

export function animNow(): number {
  const raw = Date.now();
  return raw - pausedAccumMs - (pauseStartMs !== null ? raw - pauseStartMs : 0);
}

export function setAnimPaused(paused: boolean): void {
  const raw = Date.now();
  if (paused) {
    if (pauseStartMs === null) pauseStartMs = raw;
  } else if (pauseStartMs !== null) {
    pausedAccumMs += raw - pauseStartMs;
    pauseStartMs = null;
  }
}
