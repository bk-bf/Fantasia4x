'use strict';
(() => {
  const A = HUD.art, RAIN_INK = [170, 196, 236], FOG_INK = [176, 184, 196], tiles = {};
  const Q = new URLSearchParams(location.search), FROZEN = Q.has('t'), AT = +Q.get('t') || 0;
  const INK = { fog: FOG_INK, mist: [158, 176, 204], snow: [240, 244, 250], dust: [228, 208, 140], grit: [176, 150, 98], gale: [206, 194, 160], air: [240, 236, 224], heat: [255, 224, 168] };
  const RAIN = [
    { p: 384, segs: 4, len: 16, alpha: 200, dens: [.5, .85], secs: 1.5, gust: [5.3, .55] },
    { p: 300, segs: 3, len: 11, alpha: 150, dens: [.55, .9], secs: 1.75, gust: [8.1, .45] },
    { p: 240, segs: 3, len: 7, alpha: 105, dens: [.6, .95], secs: 2.1, gust: [12.7, .35] }
  ];
  const FOG = [
    { w: 160, h: 96, size: 880, secs: 95, dir: 1, seed: 3, peak: .5, gust: [17, .55] },
    { w: 128, h: 80, size: 1340, secs: 150, dir: -1, seed: 9, peak: .5, gust: [23, .45] },
    { w: 96, h: 64, size: 560, secs: 64, dir: 1, seed: 15, peak: .3, gust: [11, .3] }
  ];
  const FALL = {
    drizzle: { lean: 6, layers: [
      { p: 240, segs: 6, len: 6, alpha: 185, dens: [.46], secs: 1.9, gust: [7.3, .6] },
      { p: 180, segs: 5, len: 4, alpha: 140, dens: [.52], secs: 2.2, gust: [11.1, .5] },
      { p: 120, segs: 4, len: 3, alpha: 100, dens: [.58], secs: 1.8, gust: [13.3, .45] }] },
    windyrain: { lean: 1, layers: [
      { p: 384, segs: 4, len: 13, alpha: 200, dens: [.7], secs: 1.2, gust: [3.1, .3] },
      { p: 300, segs: 3, len: 9, alpha: 150, dens: [.76], secs: 1.4, gust: [4.7, .25] },
      { p: 240, segs: 3, len: 6, alpha: 105, dens: [.82], secs: 1.7, gust: [6.3, .2] }] },
    heavyrain: { lean: 3, layers: [
      { p: 384, segs: 4, len: 24, alpha: 215, dens: [.74], secs: 1.05, gust: [5.3, .7], wide: 2 },
      { p: 300, segs: 3, len: 16, alpha: 165, dens: [.8], secs: 1.25, gust: [8.1, .6] },
      { p: 240, segs: 3, len: 10, alpha: 120, dens: [.86], secs: 1.5, gust: [12.7, .5] }] },
    foggyrain: { lean: 6, layers: [
      { p: 240, segs: 4, len: 10, alpha: 205, dens: [.7], secs: 1.7, gust: [6.1, .6] },
      { p: 180, segs: 3, len: 7, alpha: 150, dens: [.78], secs: 2, gust: [9.7, .5] }] }
  };
  const VEIL = {
    heavyrain: [
      { w: 160, h: 96, size: 980, secs: 34, dir: 1, seed: 21, peak: .3, gust: [9, .5], ink: 'mist' },
      { w: 128, h: 80, size: 1460, secs: 58, dir: 1, seed: 27, peak: .26, gust: [13, .4], ink: 'mist' }],
    foggyrain: [
      { w: 160, h: 96, size: 880, secs: 95, dir: 1, seed: 3, peak: .4, gust: [17, .55] },
      { w: 128, h: 80, size: 1340, secs: 150, dir: 1, seed: 9, peak: .4, gust: [23, .45] },
      { w: 96, h: 64, size: 560, secs: 64, dir: 1, seed: 15, peak: .24, gust: [11, .3] }],
    blizzard: [
      { w: 160, h: 96, size: 940, secs: 11, dir: 1, seed: 33, peak: .3, gust: [4.3, .45], ink: 'snow' },
      { w: 192, h: 128, size: 1240, secs: 6.5, dir: 1, seed: 39, peak: .5, fx: 3, fy: 14, cut: .5, gust: [3.1, .4], ink: 'snow' }],
    snowdust: [
      { w: 192, h: 128, size: 1150, secs: 9, dir: 1, seed: 61, peak: .52, fx: 3, fy: 16, cut: .52, gust: [3.7, .3], ink: 'snow' },
      { w: 160, h: 112, size: 1480, secs: 15, dir: 1, seed: 67, peak: .4, fx: 3, fy: 12, cut: .54, gust: [5.9, .25], ink: 'snow' }],
    dust: [
      { w: 192, h: 128, size: 1150, secs: 12, dir: 1, seed: 71, peak: .34, fx: 3, fy: 16, cut: .53, gust: [4.9, .3], ink: 'dust' },
      { w: 160, h: 112, size: 1480, secs: 19, dir: 1, seed: 77, peak: .26, fx: 3, fy: 12, cut: .55, gust: [7.3, .25], ink: 'dust' }],
    gale: [
      { w: 192, h: 128, size: 1150, secs: 5, dir: 1, seed: 85, peak: .5, fx: 3, fy: 16, cut: .52, gust: [2.9, .3], ink: 'gale' },
      { w: 160, h: 112, size: 1480, secs: 7.5, dir: 1, seed: 89, peak: .4, fx: 3, fy: 12, cut: .54, gust: [4.3, .25], ink: 'gale' }],
    heat: [
      { w: 128, h: 96, size: 1100, secs: 70, dir: 0, rise: 1, seed: 45, peak: .15, gust: [9, .45], ink: 'heat' },
      { w: 96, h: 80, size: 760, secs: 46, dir: 0, rise: 1, seed: 51, peak: .11, gust: [6.3, .35], ink: 'heat' }]
  };
  const MOTES = {
    snowdust: [
      { w: 384, h: 96, len: 3, cell: 6, tall: 1, dens: .014, alpha: 235, secs: 1.6, seed: 91, ink: 'snow' },
      { w: 320, h: 80, len: 2, tall: 1, dens: .016, alpha: 190, secs: 2.3, seed: 92, ink: 'snow' }],
    dust: [{ w: 384, h: 96, len: 1, tall: 1, dens: .006, alpha: 170, secs: 3.1, seed: 93, ink: 'dust', flat: 1 }],
    blizzard: [
      { w: 384, h: 128, len: 4, tall: 2, dens: .036, alpha: 240, secs: 1.5, seed: 95, ink: 'snow' },
      { w: 320, h: 160, len: 3, tall: 1, dens: .026, alpha: 215, secs: 2, seed: 97, ink: 'snow' },
      { w: 256, h: 128, len: 1, cell: 4, tall: 1, dens: .02, alpha: 180, secs: 2.6, seed: 99, ink: 'snow' }],
    gale: [
      { w: 320, h: 80, len: 2, tall: 1, dens: .004, alpha: 170, secs: 1.5, seed: 103, ink: 'gale' },
      { w: 400, h: 100, len: 30, cell: 40, tall: 1, dens: .00022, alpha: 125, secs: .8, seed: 105, ink: 'air', flat: 1, taper: 6 },
      { w: 320, h: 80, len: 18, cell: 32, tall: 1, dens: .00026, alpha: 95, secs: .95, seed: 107, ink: 'air', flat: 1, taper: 5 }]
  };
  const LOOK = {
    drizzle: { opacity: .66 }, windyrain: { opacity: .9 }, heavyrain: { opacity: .82, wash: ['mist', .09] },
    foggyrain: { wash: ['fog', .09], fade: .55 },
    snowdust: { wash: ['snow', .04], dim: .4, fade: .7 }, dust: { wash: ['dust', .05], dim: .3, fade: .6 },
    blizzard: { wash: ['snow', .08], dim: .42 }, gale: { wash: ['gale', .1], dim: .35, fade: .7 },
    heat: { wash: ['heat', .06], dim: .5 }
  };
  const wrap = (v, p) => ((v % p) + p) % p;
  function loopNoise(x, y, px, py, seed) {
    const xi = Math.floor(x), yi = Math.floor(y), at = (i, j) => hash(wrap(i, px), wrap(j, py), seed);
    let xf = x - xi, yf = y - yi;
    xf = xf * xf * (3 - 2 * xf); yf = yf * yf * (3 - 2 * yf);
    return mix(mix(at(xi, yi), at(xi + 1, yi), xf), mix(at(xi, yi + 1), at(xi + 1, yi + 1), xf), yf);
  }
  function rainTile(L, heavy, seed, lean = -3) {
    const p = L.p, cols = p / 6, seg = p / L.segs, base = L.dens[heavy ? 1 : 0], m = Math.abs(lean), dir = Math.sign(lean), wide = L.wide || 1;
    return A.paint(p, p * m, (x, y) => {
      const u = wrap(x - dir * Math.floor(y / m), p);
      if (u % 6 >= wide) return null;
      const col = Math.floor(u / 6), v = wrap(y + Math.floor(hash(col, 1, seed) * p), p), s = Math.floor(v / seg), ph = v - s * seg;
      const clump = loopNoise(col / cols * 4, s + .5, 4, L.segs, seed + 3);
      if (hash(col, s, seed + 7) > base * (.25 + 1.5 * clump)) return null;
      const len = Math.round(L.len * (.6 + .8 * hash(col, s, seed + 9)));
      return ph < len ? [...RAIN_INK, (ph < len * .35 ? L.alpha * .55 : L.alpha) * (u % 6 ? .6 : 1)] : null;
    });
  }
  function fogTile(L) {
    const ink = L.ink ? INK[L.ink] : FOG_INK, fx = L.fx || 4, fy = L.fy || 3, cut = L.cut || .46;
    return A.paint(L.w, L.h, (x, y) => {
      let n = 0, a = .5, f = 1, t = 0;
      for (let o = 0; o < 3; o++) { n += a * loopNoise(x / L.w * fx * f, y / L.h * fy * f, fx * f, fy * f, L.seed + o * 17); t += a; a *= .5; f *= 2; }
      const d = clamp((n / t - cut) / .22, 0, 1);
      return [...ink, 255 * L.peak * d * d * (3 - 2 * d)];
    });
  }
  function snowTile() {
    return A.paint(128, 128, (x, y) => { const h = hash(x >> 1, y >> 1, 12); return h > .992 ? [246, 248, 252, 235] : h > .986 && !(x & 1) && !(y & 1) ? [226, 232, 244, 200] : null; });
  }
  function moteTile(L) {
    const ink = INK[L.ink], cw = L.cell || L.len + 2;
    return A.paint(L.w, L.h, (x, y) => {
      const row = Math.floor(y / L.tall), sx = wrap(x + Math.floor(hash(row, 5, L.seed) * cw), L.w), cx = Math.floor(sx / cw), at = sx - cx * cw;
      if (at >= L.len || hash(cx, row, L.seed) > L.dens * cw) return null;
      return [...ink, L.alpha * (L.taper ? Math.min(1, (at + 1) / L.taper, (L.len - at) / L.taper) : at === 0 && L.len > 1 ? .55 : 1)];
    });
  }
  const url = (key, make) => tiles[key] || (tiles[key] = `url(${make().toDataURL()})`);
  function layer(el, o) {
    const i = document.createElement('i'), tx = o.tx, ty = o.ty, hold = FROZEN ? ' paused' : '', gust = o.gust ? `, wx-gust ${o.gust[0]}s ease-in-out ${-(o.gust[0] * o.at + AT)}s infinite alternate${hold}` : '';
    Object.assign(i.style, {
      position: 'absolute', left: (tx > 0 ? -tx : 0) + 'px', top: (ty > 0 ? -ty : 0) + 'px', width: `calc(100% + ${Math.abs(tx)}px)`, height: `calc(100% + ${Math.abs(ty)}px)`,
      backgroundImage: o.image, backgroundSize: o.size, imageRendering: o.soft ? 'auto' : 'pixelated', opacity: o.opacity === undefined ? '' : o.opacity,
      animation: `wx-move ${o.secs}s ${o.steps ? `steps(${o.steps})` : 'linear'} ${-(o.secs * o.at + AT)}s infinite${hold}${gust}`
    });
    i.style.setProperty('--tx', tx + 'px'); i.style.setProperty('--ty', ty + 'px'); i.style.setProperty('--lo', o.gust ? o.gust[1] : 1);
    el.append(i);
  }
  const fall = (el, kind, k) => FALL[kind].layers.forEach((L, n) => layer(el, { image: url(kind + n, () => rainTile(L, false, 120 + n * 11, FALL[kind].lean)), size: `${L.p * k}px ${L.p * FALL[kind].lean * k}px`, tx: L.p / FALL[kind].lean * k, ty: L.p * k, secs: L.secs, steps: L.p / 6, gust: L.gust, at: n * .37 }));
  const veil = (el, kind, k) => VEIL[kind].forEach((L, n) => { const h = Math.round(L.size * L.h / L.w); layer(el, { image: url(kind + 'veil' + n, () => fogTile(L)), size: `${L.size * k}px ${h * k}px`, tx: L.dir * L.size * k, ty: L.rise ? -h * k : 0, secs: L.secs, soft: true, gust: L.gust, at: n * .41 }); });
  const motes = (el, kind, k) => MOTES[kind].forEach((L, n) => layer(el, { image: url(kind + 'mote' + n, () => moteTile(L)), size: `${L.w * k}px ${L.h * k}px`, tx: L.w * k, ty: L.flat ? 0 : L.h * k, secs: L.secs, steps: L.flat ? L.w / 2 : L.h, at: n * .31 }));
  function build(el, kind, k) {
    el.textContent = '';
    if (kind === 'rain' || kind === 'storm') RAIN.forEach((L, n) => layer(el, { image: url(kind + n, () => rainTile(L, kind === 'storm', 20 + n * 11)), size: `${L.p * k}px ${L.p * 3 * k}px`, tx: -L.p / 3 * k, ty: L.p * k, secs: L.secs, steps: L.p / 6, gust: L.gust, at: n * .37 }));
    else if (kind === 'fog') FOG.forEach((L, n) => layer(el, { image: url('fog' + n, () => fogTile(L)), size: `${L.size * k}px ${Math.round(L.size * L.h / L.w) * k}px`, tx: L.dir * L.size * k, ty: 0, secs: L.secs, soft: true, gust: L.gust, at: n * .41 }));
    else if (kind === 'snow') layer(el, { image: url('snow', snowTile), size: `${128 * k}px`, tx: 128 * k, ty: 512 * k, secs: 18, at: 0 });
    else {
      if (FALL[kind]) fall(el, kind, k);
      if (MOTES[kind]) motes(el, kind, k);
      if (VEIL[kind]) veil(el, kind, k);
    }
  }
  HUD.weather = (el, amb, k) => {
    const w = amb.weather, kind = w.kind || (w.rain ? (w.rain > .75 ? 'storm' : 'rain') : w.fog ? 'fog' : w.snow ? 'snow' : ''), key = kind + '@' + k, fog = w.fog * (.2 + .2 * amb.light), look = LOOK[kind];
    if (!document.getElementById('wx-keys')) {
      const st = document.createElement('style');
      st.id = 'wx-keys';
      st.textContent = '@keyframes wx-move { to { transform: translate(var(--tx), var(--ty)); } } @keyframes wx-gust { from { opacity: var(--lo); } to { opacity: 1; } }';
      document.head.append(st);
    }
    if (el.dataset.wx !== key) { el.dataset.wx = key; build(el, kind, k); }
    el.style.overflow = 'hidden';
    if (look) {
      el.style.opacity = (look.opacity || 1) * (look.fade ? look.fade + (1 - look.fade) * amb.light : 1);
      el.style.background = look.wash ? `rgb(${INK[look.wash[0]].join(' ')} / ${look.wash[1]})` : '';
      el.style.filter = look.dim ? `brightness(${(look.dim + (1 - look.dim) * amb.light).toFixed(3)})` : '';
      return;
    }
    el.style.filter = '';
    el.style.opacity = w.rain ? .5 + w.rain * .4 : w.fog ? Math.min(1, fog * 2.5) : 1;
    el.style.background = w.fog ? `rgb(${FOG_INK.join(' ')} / .12)` : '';
  };
})();
