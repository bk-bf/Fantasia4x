let worker: Worker | null = null;

export function startFreezeWatchdog(thresholdMs = 2000): void {
  if (worker || typeof Worker === 'undefined' || !import.meta.env.DEV) return;
  try {
    worker = new Worker(new URL('./freeze-watchdog.worker.ts', import.meta.url), {
      type: 'module'
    });
    worker.postMessage({ kind: 'config', threshold: thresholdMs });
  } catch {
    worker = null;
  }
}

export function beat(phase: string, turn = 0): void {
  if (!worker) return;
  try {
    worker.postMessage({ kind: 'beat', phase, turn });
  } catch {}
}

export function stopFreezeWatchdog(): void {
  worker?.terminate();
  worker = null;
}
