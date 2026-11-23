'use strict';
(() => {
  const Q = new URLSearchParams(location.search), FROZEN = Q.has('t'), AT = +Q.get('t') || 0, T0 = performance.now(), TIMEKEYS = ['day', 'dusk', 'night'];
  const CANVAS = { day: 'mapday', dusk: 'mapdusk', night: 'mapnight' };
  const tones = list => list.map(c => [c, dark(c, .55), lit(c, 1.2)]);
  const FX = {
    spring: { leaf: 2.2, petal: .35, flock: 90, tones: tones([[168, 206, 96], [250, 232, 240], [204, 226, 128], [244, 196, 214]]) },
    dust: { leaf: 1 },
    autumn: { leaf: 3.5, flock: 180, tones: tones([[232, 120, 44], [240, 170, 56], [205, 95, 40]]) },
    snowdust: {},
    drizzle: { leaf: .2, splash: .03 },
    windyrain: { leaf: 1.2, splash: .3, flock: 60, tones: tones([[186, 104, 48], [170, 136, 66]]) },
    heavyrain: { leaf: .4, splash: .6 },
    blizzard: {},
    foggyrain: { splash: .08 },
    heat: { heat: 1 },
    gale: { leaf: 5, flock: 320, twigs: .18, trail: 5, tones: tones([[236, 180, 84], [232, 128, 48], [244, 214, 130], [165, 135, 80]]) }
  };
  const PETAL = [[246, 224, 234], [224, 188, 206]], SPLASH = [206, 222, 246], TWIG = [[74, 54, 38], [104, 78, 52]], SHADE = [10, 12, 18];
  let raf = 0, last = 0, clones = {}, owner = null, live = false, rows = null, rowsE = null;

  const windOf = ws => { const s = ws / .5; return { s, speed: 40 * (.5 + .5 * s), from: Math.round(255 - 105 * clamp(s, .25, 1.9)), rate: 1.25 * (.75 + .25 * s), idle: .3 * (.4 + .6 * s), gust: 1.2 * s, lean: Math.max(0, ws - .5) * 1.6 }; };
  const now = () => FROZEN ? AT : (performance.now() - T0) / 1000;

  function pen(a, W, time, X0, X1, Y0, Y1) {
    const am = TIMES[time].amb;
    return (x, y, c, k) => {
      x = Math.round(x); y = Math.round(y);
      if (x < X0 || x >= X1 || y < Y0 || y >= Y1) return;
      const p = y * W + x, d = a[p], r = c[0] * am[0], g = c[1] * am[1], b = c[2] * am[2];
      a[p] = k === undefined ? (0xff000000 | (b << 16) | (g << 8) | r) >>> 0
        : (0xff000000 | (((d >> 16 & 255) * (1 - k) + b * k) << 16) | (((d >> 8 & 255) * (1 - k) + g * k) << 8) | ((d & 255) * (1 - k) + r * k)) >>> 0;
    };
  }
  function blades(r) {
    const { W, H, gm } = r, idx = [], thr = [];
    for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i++) if (gm[i] && hash(x, y, 191) < .14) { idx.push(i); thr.push(8 + hash(x, y, 193) * 240); }
    return { idx: Int32Array.from(idx), thr: Uint8Array.from(thr) };
  }
  function shimmer(r, a, time, Y0, Y1, tint, wd, set) {
    const { W, gph } = r, base = r.gb[time], am = TIMES[time].amb, from = wd.from, span = 255 - from, gain = 255 * Math.min(1, wd.s), env = new Uint8Array(256), lo = Y0 * W, hi = Y1 * W, { idx, thr } = set;
    for (let v = from; v < 256; v++) { const s = Math.sin((v - from) / span * Math.PI); env[v] = s * s * gain; }
    const ar = 12 * am[0], ag = 14 * am[1], ab = 4 * am[2];
    for (let k = 0; k < idx.length; k++) {
      const i = idx[k];
      if (i < lo || i >= hi || env[(gph[i] - tint) & 255] <= thr[k]) continue;
      const c = base[i];
      if (a[i] !== c) continue;
      a[i] = (0xff000000 | (Math.min(255, (c >> 16 & 255) * 1.06 + ab) << 16) | (Math.min(255, (c >> 8 & 255) * 1.24 + ag) << 8) | Math.min(255, (c & 255) * 1.22 + ar)) >>> 0;
    }
  }
  function leaf(put, x, y, c, c2, air, beat, gy) {
    put(x, y, c); put(x + 1, y, c);
    if (air && beat) put(x, y + 1, c2); else put(x + 1, y + 1, c2);
    if (air && gy - y > 3) put(x + 1, gy + 1, SHADE, .3);
  }
  function leaves(r, put, ts, C, wd, X0, X1, Y0, Y1) {
    const L = r.leafy, n = Math.round(L.length * C.leaf), s = wd.s, rest = s > 1.6 ? .3 : 2.2;
    for (let i = 0; i < n; i++) {
      const T = 5.5 + hash(i, 1, 205) * 4, u = ts / T + hash(i, 2, 205), cyc = Math.floor(u), age = (u - cyc) * T, sd = i * 7919 + cyc * 104729;
      const t = L[Math.floor(hash(sd, 3, 205) * L.length)], tf = T - rest - hash(sd, 4, 205) * .6, vx = 4 + 24 * s * s * (.7 + .6 * hash(sd, 5, 205));
      if (age > tf + rest || t.x > X1 + 30 || t.x + vx * T < X0 - 30 || t.y < Y0 - 30 || t.y - t.top > Y1 + 30) continue;
      const ph = hash(sd, 6, 205) * 6.28, z0 = t.top * (.35 + hash(sd, 7, 205) * .4), air = age < tf, wob = air ? Math.min(1, (tf - age) * 2) : 0;
      const x = t.x + (hash(sd, 8, 205) - .5) * 44 + vx * Math.min(age, tf) + Math.sin(ts * 4 + ph) * 2.5 * wob + (air ? 0 : (age - tf) * 14 * Math.max(0, s - .8));
      const gy = t.y - 8 + hash(sd, 9, 205) * 22 + Math.sin(ts * 2 + ph) * 2 * wob, y = gy - (air ? z0 * (1 - age / tf) + Math.sin(ts * 3 + ph) * 1.5 * wob : 0);
      const top = t.ramp.length - 1, tone = C.tones && hash(sd, 12, 205) < .35 ? C.tones[Math.floor(hash(sd, 13, 205) * C.tones.length)] : null;
      const c = C.petal && hash(sd, 11, 205) < C.petal ? PETAL[0] : tone ? tone[0] : t.ramp[top - Math.floor(hash(sd, 10, 205) * 3)];
      leaf(put, x, y, c, c === PETAL[0] ? PETAL[1] : tone ? tone[1] : dark(c, .6), air, Math.floor(ts * 5 + ph) & 1, gy);
    }
  }
  function tumble(put, x, y, g, turn, gy) {
    const c = g[0], d = g[1], h = g[2];
    if (turn === 0) { put(x + 1, y, h); put(x + 2, y, h); put(x, y + 1, c); put(x + 1, y + 1, c); put(x + 2, y + 1, c); put(x + 3, y + 1, d); put(x + 1, y + 2, d); put(x + 2, y + 2, d); }
    else if (turn === 1) { put(x + 2, y, h); put(x + 1, y + 1, c); put(x + 2, y + 1, c); put(x, y + 2, c); put(x + 1, y + 2, d); }
    else { put(x, y, h); put(x + 1, y, c); put(x + 1, y + 1, c); put(x + 2, y + 1, d); }
    put(x + 1, gy + 2, SHADE, .32); put(x + 2, gy + 2, SHADE, .32);
  }
  function flock(put, ts, C, s, X0, X1, Y0, Y1) {
    const span = X1 - X0 + 120, h = Y1 - Y0, n = Math.round(C.flock * span * h / 1e6);
    for (let j = 0; j < n; j++) {
      const v = (75 + hash(j, 1, 211) * 65) * s, u = hash(j, 2, 211) * span + v * ts, cyc = Math.floor(u / span), fx = u - cyc * span, ph = hash(j, 3, 211) * 6.28;
      const x = X0 - 60 + fx, gy = Y0 + hash(j * 31 + cyc, 4, 211) * h + fx * .05, y = gy - 10 - hash(j, 6, 211) * 26 + Math.sin(ts * 2.3 + ph) * 6;
      if (hash(j, 5, 211) < (C.twigs || 0)) { const up = Math.floor(ts * 7 + ph) & 1; put(x, y, TWIG[0]); put(x + 1, y, TWIG[0]); put(x + 2, y - up, TWIG[1]); put(x + 3, y - up, TWIG[1]); continue; }
      const g = C.tones[j % C.tones.length];
      for (let q = 1; q <= (C.trail || 0); q++) put(x - q, y + 1, g[0], .5 - q * .08);
      tumble(put, x, y, g, Math.floor(ts * 6 + ph) % 3, gy);
    }
  }
  function splashes(put, ts, dens, X0, X1, Y0, Y1) {
    const slot = Math.floor(ts * 9), w = X1 - X0, h = Y1 - Y0, n = Math.round(w * h / 1000 * dens);
    for (let g = 0; g < 3; g++) for (let j = 0; j < n; j++) {
      const x = X0 + Math.floor(hash(j, slot - g, 221) * w), y = Y0 + Math.floor(hash(j, slot - g, 223) * h);
      if (g === 0) put(x, y, SPLASH, .7);
      else if (g === 1) { put(x - 1, y - 1, SPLASH, .5); put(x + 1, y - 1, SPLASH, .5); put(x, y, SPLASH, .25); }
      else { put(x - 2, y, SPLASH, .28); put(x + 2, y, SPLASH, .28); }
    }
  }
  function heat(r, a, e, ts, amp, X0, X1, Y0, Y1) {
    const { W } = r, STEP = 16, n = X1 - X0;
    if (!rows || rows.length < W) { rows = new Uint32Array(W); rowsE = new Uint8Array(W); }
    for (let y = Y0; y < Y1; y++) {
      const row = y * W, wave = Math.sin(y * .55 - ts * 4.2);
      let copied = false;
      for (let x = X0 - (X0 % STEP); x < X1; x += STEP) {
        const patch = noise(x * .012 + ts * .03, y * .016 + ts * .16, 77) - .46;
        if (patch <= 0) continue;
        const off = Math.round((wave * Math.min(1, patch * 6) + Math.sin(y * .23 + x * .05 - ts * 2.9) * .3) * amp);
        if (!off) continue;
        if (!copied) { rows.set(a.subarray(row + X0, row + X1)); rowsE.set(e.subarray(row + X0, row + X1)); copied = true; }
        for (let q = Math.max(X0, x), end = Math.min(X1, x + STEP); q < end; q++) { const sx = clamp(q - off - X0, 0, n - 1); a[row + q] = rows[sx]; e[row + q] = rowsE[sx]; }
      }
    }
  }
  function effects() {
    const map = HUD.map, amb = HUD.amb, w = amb && amb.weather;
    if (!map || !w || !w.kind) return null;
    if (!map.blades) map.blades = blades(map.r);
    const ts = now(), wd = windOf(w.ws), C = FX[w.kind] || {};
    const post = (r, a, e, time, X0, X1, Y0, Y1, tint) => {
      const put = pen(a, r.W, time, X0, X1, Y0, Y1);
      if (wd.s >= .3) shimmer(r, a, time, Y0, Y1, tint, wd, map.blades);
      if (C.splash) splashes(put, ts, C.splash, X0, X1, Y0, Y1);
      if (C.leaf) leaves(r, put, ts, C, wd, X0, X1, Y0, Y1);
      if (C.flock) flock(put, ts, C, wd.s, X0, X1, Y0, Y1);
      if (C.heat) heat(r, a, e, ts, .45 + .6 * amb.light, X0, X1, Y0, Y1);
    };
    return { ts, wind: wd, post };
  }
  function frame() {
    const map = HUD.map, fx = !HUD.motion.on && effects();
    if (!fx) return;
    if (owner !== map) { clones = {}; owner = map; }
    const seen = HUD.ambient.seen(HUD.amb), clip = HUD.view.clip();
    SEASON = map.season;
    for (const t of TIMEKEYS) if (seen[t]) present(clones[t] || (clones[t] = { ...map.r }), document.getElementById(CANVAS[t]).getContext('2d'), t, fx.ts, { clip, wind: fx.wind, post: fx.post });
  }
  function loop(t) {
    raf = requestAnimationFrame(loop);
    if (t - last < 30 || document.hidden) return;
    last = t;
    frame();
  }
  HUD.windEffects = effects;
  HUD.wind = () => {
    const map = HUD.map, on = !!(HUD.amb && HUD.amb.weather.kind);
    if (!on) {
      if (!live) return;
      live = false; cancelAnimationFrame(raf); raf = 0; clones = {}; owner = null;
      if (map) for (const t of TIMEKEYS) document.getElementById(CANVAS[t]).getContext('2d').drawImage(map[t], 0, 0);
      return;
    }
    live = true;
    if (FROZEN) frame(); else if (!raf) raf = requestAnimationFrame(loop);
  };
})();
