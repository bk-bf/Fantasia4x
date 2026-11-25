'use strict';
(() => {
  const PER = 2048;
  const hash = (x, y, z) => {
    let n = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1274126177);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const wrap = (v, q) => ((v % q) + q) % q;
  const cells = (f) => Math.max(1, Math.round(PER * f));

  function value(x, y, s) {
    const xi = Math.floor(x),
      yi = Math.floor(y);
    let xf = x - xi,
      yf = y - yi;
    xf = xf * xf * (3 - 2 * xf);
    yf = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi, s),
      b = hash(xi + 1, yi, s),
      c = hash(xi, yi + 1, s),
      d = hash(xi + 1, yi + 1, s);
    const top = a + (b - a) * xf,
      bot = c + (d - c) * xf;
    return top + (bot - top) * yf;
  }

  function periodic(x, y, qx, qy, s) {
    const gx = (x * qx) / PER,
      gy = (y * qy) / PER;
    const xi = Math.floor(gx),
      yi = Math.floor(gy);
    let xf = gx - xi,
      yf = gy - yi;
    xf = xf * xf * (3 - 2 * xf);
    yf = yf * yf * (3 - 2 * yf);
    const x0 = wrap(xi, qx),
      x1 = wrap(xi + 1, qx),
      y0 = wrap(yi, qy),
      y1 = wrap(yi + 1, qy);
    const a = hash(x0, y0, s),
      b = hash(x1, y0, s),
      c = hash(x0, y1, s),
      d = hash(x1, y1, s);
    const top = a + (b - a) * xf,
      bot = c + (d - c) * xf;
    return top + (bot - top) * yf;
  }

  function pfbm(x, y, f, s, o) {
    const q = cells(f);
    let a = 0.5,
      m = 1,
      v = 0,
      n = 0;
    for (let i = 0; i < o; i++) {
      v += a * periodic(x, y, q * m, q * m, s + i * 17);
      n += a;
      a *= 0.5;
      m *= 2;
    }
    return v / n;
  }

  const C17 = cells(0.17),
    C15 = cells(0.15);
  const cover = (x, y) => pfbm(x, y, 0.02, 3, 3) * 0.72 + periodic(x, y, C17, C17, 5) * 0.28;

  function soilShade(x, y, seed) {
    const big = pfbm(x, y, 0.03, seed, 2),
      m = periodic(x, y, C15, C15, seed + 3),
      h = hash(x, y, seed + 5);
    let k = (big > 0.58 ? 1 : big < 0.4 ? -1 : 0) + (m > 0.74 ? 1 : m < 0.22 ? -1 : 0);
    if (h > 0.95) k += 1;
    else if (h < 0.06) k -= 1;
    return k;
  }

  const C10 = cells(0.1);
  function grassShade(x, y, seed) {
    const big = pfbm(x, y, 0.021, seed, 3),
      mid = periodic(x, y, C10, C10, seed + 5);
    let k = big > 0.57 ? 1 : big < 0.43 ? -1 : 0;
    const off = Math.floor(hash(x, 0, seed + 7) * 6),
      yy = wrap(y + off, PER),
      cy = Math.floor(yy / 6),
      py = yy - cy * 6,
      h = hash(x, cy, seed + 9);
    if (h > 0.58) {
      if (py === 0) k += 2;
      else if (py < 4) k += 1;
    } else if (h < 0.2 && py > 2) k -= 1;
    if (mid > 0.76) k += 1;
    else if (mid < 0.2) k -= 1;
    return k;
  }

  const WARP = { wideF: 0.042, wideA: 22, fineF: 0.155, fineA: 7 };
  function warp(x, y, out) {
    out[0] = x + (value(x * WARP.wideF, y * WARP.wideF, 11) - 0.5) * WARP.wideA + (value(x * WARP.fineF, y * WARP.fineF, 12) - 0.5) * WARP.fineA;
    out[1] = y + (value(x * WARP.wideF, y * WARP.wideF, 14) - 0.5) * WARP.wideA + (value(x * WARP.fineF, y * WARP.fineF, 15) - 0.5) * WARP.fineA;
  }

  window.TGN = { hash, value, cover, soilShade, grassShade, warp };
})();
