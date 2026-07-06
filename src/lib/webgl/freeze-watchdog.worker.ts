/// <reference lib="webworker" />
/**
 * Freeze watchdog — runs OFF the main thread specifically so it can observe (and report) a
 * MAIN-THREAD freeze that no on-thread logger ever can.
 *
 * The problem this solves: when `frame()` (or any main-thread work) blocks for seconds/minutes,
 * every on-thread logger is dead too — `crashBreadcrumb`, `perf.log`, even the browser's own
 * `[Violation]` line, which only prints AFTER the frame finally unblocks. If the thread never
 * recovers, there is silence forever. You cannot log a frozen thread from the frozen thread.
 *
 * The mechanism: the main thread `beat`s a phase label before each risky render phase (see
 * freezeWatchdog.ts). THIS thread — which the main-thread freeze cannot touch — runs its own timer
 * off its own clock. If beats stop arriving for longer than the threshold, the main thread is
 * blocked; this thread writes the last-seen phase to `.debug/crash.log` via its own `fetch`
 * (this thread isn't blocked, so the request goes out). The onset line lands within ~one threshold
 * of the freeze STARTING — independent of whether the game recovers in 7 min, 2 h, or never.
 */

let lastBeatAt = 0; // worker-clock ms of the last received heartbeat (0 = not started)
let lastPhase = '(none)';
let lastTurn = 0;
let threshold = 2000; // ms without a beat before the main thread is declared frozen
let frozen = false; // latched so onset logs once; recovery logs once
let frozenPhase = ''; // the phase we were stuck in when the freeze was detected
let frozenSince = 0; // worker-clock ms when the freeze was first detected
let lastStillLog = 0; // worker-clock ms of the last "still frozen" progress line

function post(line: string): void {
  // The main thread is dead, but THIS thread isn't — the fetch actually goes out.
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
  if (lastBeatAt === 0) return; // main thread hasn't started beating yet
  const gap = performance.now() - lastBeatAt;
  if (!frozen) {
    if (gap > threshold) {
      frozen = true;
      frozenPhase = lastPhase;
      frozenSince = lastBeatAt; // the freeze began at the last successful beat
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
  // Still frozen: emit a progress line every ~5s so an indefinite freeze accumulates evidence
  // (proving it never recovered), not just the single onset line.
  const nowMs = performance.now();
  if (nowMs - lastStillLog >= 5000) {
    lastStillLog = nowMs;
    post(
      `[T${String(lastTurn).padStart(5, '0')}] [warn] … STILL FROZEN — ~${Math.round(nowMs - frozenSince)}ms ` +
        `and counting in phase '${frozenPhase}'.`
    );
  }
}, 250);
