'use strict';
(() => {
  const BT = (window.BT = window.BT || {});
  const WIND = {
    mockupStrength: 0.45,
    maxScale: 2.2,
    sway: { idle: 0.3, gust: 1.2, idleRate: 1.25, flutterRate: 4 },
    phase: [0.045, 0.02],
    gust: { along: 0.85, across: 0.3, onset: 150, width: 105, speed: 40 },
    gustNoise: [
      { fx: 0.006, fy: 0.008, amp: 520 },
      { fx: 0.05, fy: 0.05, amp: 26 }
    ]
  };
  const PERIOD = 256;
  const STRENGTH = { still: 0, breeze: 0.36, windy: 0.6, gale: 0.95 };
  const LEVEL = { still: 0, breeze: 1, windy: 2, gale: 3 };

  function cell(x, y) {
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    h = (h ^ (h >>> 16)) >>> 0;
    return (h & 65535) / 65535;
  }
  function valueNoise(x, y) {
    const ix = Math.floor(x),
      iy = Math.floor(y);
    let fx = x - ix,
      fy = y - iy;
    fx = fx * fx * (3 - 2 * fx);
    fy = fy * fy * (3 - 2 * fy);
    const top = cell(ix, iy) + (cell(ix + 1, iy) - cell(ix, iy)) * fx;
    const bottom = cell(ix, iy + 1) + (cell(ix + 1, iy + 1) - cell(ix, iy + 1)) * fx;
    return top + (bottom - top) * fy;
  }

  function make(word) {
    const strength = STRENGTH[word] ?? 0;
    const scale = Math.min(WIND.maxScale, strength / WIND.mockupStrength);
    const len = Math.hypot(1, 0.18);
    const dir = { x: 1 / len, y: 0.18 / len };
    const pace = 0.5 + 0.5 * Math.min(1, scale);
    const scrollAt = (t) => (WIND.gust.speed * pace * t) % PERIOD;
    const gust = (x, y, t) => {
      const [a, b] = WIND.gustNoise;
      const along = (x * dir.x + y * dir.y) * WIND.gust.along;
      const across = (x * -dir.y + y * dir.x) * WIND.gust.across;
      const raw = along - across + valueNoise(x * a.fx, y * a.fy) * a.amp + valueNoise(x * b.fx, y * b.fy) * b.amp - scrollAt(t);
      const p = ((raw % PERIOD) + PERIOD) % PERIOD;
      if (p < WIND.gust.onset) return 0;
      const s = Math.sin(((p - WIND.gust.onset) / WIND.gust.width) * Math.PI);
      return s * s;
    };
    const lean = (x, y, amp, t) => {
      if (!scale) return 0;
      const idleT = t % (8 * Math.PI);
      const ph = x * WIND.phase[0] + y * WIND.phase[1];
      const g = gust(x, y, t) * WIND.sway.gust;
      const flutter = (1 - Math.abs(dir.x)) * Math.sin(idleT * WIND.sway.flutterRate + ph);
      const idle = Math.sin(idleT * WIND.sway.idleRate + ph) * WIND.sway.idle;
      return amp * scale * (idle + g * (dir.x + flutter));
    };
    return { word, level: LEVEL[word] ?? 0, scale, dir, gust, lean, flutterRate: WIND.sway.flutterRate };
  }

  BT.wind = make;
  BT.noise = valueNoise;
  BT.cell = cell;
})();
