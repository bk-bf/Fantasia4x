/** @typedef {{ gaps: number[], paused: boolean[] }} FrameGaps */
/** @typedef {typeof window & { __f4xGaps: number[], __f4xPaused: boolean[], __f4xRaf: number }} GapWindow */

export function startFrameGaps() {
  const w = /** @type {GapWindow} */ (window);
  const paused = () => (document.querySelector('button.ctrl-btn')?.className ?? '').includes('is-paused');
  w.__f4xGaps = [];
  w.__f4xPaused = [];
  let last = performance.now();
  /** @param {number} t */
  const f = (t) => {
    w.__f4xGaps.push(t - last);
    w.__f4xPaused.push(paused());
    last = t;
    w.__f4xRaf = requestAnimationFrame(f);
  };
  w.__f4xRaf = requestAnimationFrame(f);
}

/** @returns {FrameGaps} */
export function stopFrameGaps() {
  const w = /** @type {GapWindow} */ (window);
  cancelAnimationFrame(w.__f4xRaf);
  return { gaps: w.__f4xGaps.slice(1), paused: w.__f4xPaused.slice(1) };
}

/** @param {FrameGaps} recorded */
export function summarizeGaps({ gaps, paused }) {
  const sorted = [...gaps].sort((a, b) => b - a);
  const pausedMs = gaps.reduce((s, g, i) => s + (paused[i] ? g : 0), 0);
  const total = gaps.reduce((s, g) => s + g, 0);
  return {
    frames: gaps.length,
    maxMs: Math.round(sorted[0] ?? 0),
    top5: sorted.slice(0, 5).map(Math.round),
    over100: gaps.filter((g) => g > 100).length,
    over250: gaps.filter((g) => g > 250).length,
    stallMs: Math.round(gaps.filter((g) => g > 50).reduce((s, g) => s + g, 0)),
    pausedShare: total ? Math.round((pausedMs / total) * 100) / 100 : 0,
    worstPaused: paused[gaps.indexOf(sorted[0])] ?? null
  };
}
