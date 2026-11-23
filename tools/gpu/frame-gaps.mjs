export function startFrameGaps() {
  const paused = () => (document.querySelector('button.ctrl-btn')?.className ?? '').includes('is-paused');
  window.__f4xGaps = [];
  window.__f4xPaused = [];
  let last = performance.now();
  const f = (t) => {
    window.__f4xGaps.push(t - last);
    window.__f4xPaused.push(paused());
    last = t;
    window.__f4xRaf = requestAnimationFrame(f);
  };
  window.__f4xRaf = requestAnimationFrame(f);
}

export function stopFrameGaps() {
  cancelAnimationFrame(window.__f4xRaf);
  return { gaps: window.__f4xGaps.slice(1), paused: window.__f4xPaused.slice(1) };
}

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
