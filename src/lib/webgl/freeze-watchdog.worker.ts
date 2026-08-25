/// <reference lib="webworker" />

let lastBeatAt = 0;
let lastPhase = '(none)';
let lastTurn = 0;
let threshold = 2000;
let frozen = false;
let frozenPhase = '';
let frozenSince = 0;
let lastStillLog = 0;

function post(line: string): void {
  fetch('/api/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entries: [{ category: 'crash', line }] })
  }).catch(() => {});
}

self.onmessage = (e: MessageEvent) => {
  const d = e.data;
  if (d?.kind === 'config') {
    if (typeof d.threshold === 'number') threshold = d.threshold;
    return;
  }
  if (d?.kind === 'beat') {
    lastBeatAt = performance.now();
    if (typeof d.phase === 'string') lastPhase = d.phase;
    if (typeof d.turn === 'number') lastTurn = d.turn;
    if (frozen) {
      const blocked = Math.round(performance.now() - frozenSince);
      post(
        `[T${String(lastTurn).padStart(5, '0')}] [warn] ✅ MAIN THREAD RECOVERED after ~${blocked}ms ` +
          `blocked in phase '${frozenPhase}'.`
      );
      frozen = false;
    }
  }
};

setInterval(() => {
  if (lastBeatAt === 0) return;
  const gap = performance.now() - lastBeatAt;
  if (!frozen) {
    if (gap > threshold) {
      frozen = true;
      frozenPhase = lastPhase;
      frozenSince = lastBeatAt;
      lastStillLog = performance.now();
      post(
        `[T${String(lastTurn).padStart(5, '0')}] [warn] ⛔ MAIN THREAD FROZEN — no heartbeat for ` +
          `${Math.round(gap)}ms. Last phase before the freeze: '${frozenPhase}'. The main thread is ` +
          `blocked HERE; this line was written from the watchdog worker because nothing on the main ` +
          `thread can run.`
      );
    }
    return;
  }
  const nowMs = performance.now();
  if (nowMs - lastStillLog >= 5000) {
    lastStillLog = nowMs;
    post(
      `[T${String(lastTurn).padStart(5, '0')}] [warn] … STILL FROZEN — ~${Math.round(nowMs - frozenSince)}ms ` +
        `and counting in phase '${frozenPhase}'.`
    );
  }
}, 250);
