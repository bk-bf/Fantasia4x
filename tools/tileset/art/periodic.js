'use strict';
let PER = 128;
const wrap = (v, q) => ((v % q) + q) % q;
const cells = f => Math.max(1, Math.round(PER * f));
function pnoiseQ(x, y, qx, qy, s, ox, oy) {
  const gx = x * qx / PER + (ox || 0), gy = y * qy / PER + (oy || 0);
  const xi = Math.floor(gx), yi = Math.floor(gy);
  let xf = gx - xi, yf = gy - yi;
  xf = xf * xf * (3 - 2 * xf); yf = yf * yf * (3 - 2 * yf);
  const x0 = wrap(xi, qx), x1 = wrap(xi + 1, qx), y0 = wrap(yi, qy), y1 = wrap(yi + 1, qy);
  return mix(mix(hash(x0, y0, s), hash(x1, y0, s), xf), mix(hash(x0, y1, s), hash(x1, y1, s), xf), yf);
}
const pn = (x, y, fx, fy, s, ox, oy) => pnoiseQ(x, y, cells(fx), cells(fy), s, ox, oy);
function pfbm(x, y, f, s, o) {
  const q = cells(f);
  let a = .5, m = 1, v = 0, n = 0;
  for (let i = 0; i < o; i++) { v += a * pnoiseQ(x, y, q * m, q * m, s + i * 17); n += a; a *= .5; m *= 2; }
  return v / n;
}
function pvor(x, y, sc, s) {
  const q = Math.max(1, Math.round(PER / sc)), c = PER / q, gx = x / c, gy = y / c, cx = Math.floor(gx), cy = Math.floor(gy);
  let d1 = 9, d2 = 9, id = 0, bx = 0, by = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const hx = wrap(cx + i, q), hy = wrap(cy + j, q);
    const px = cx + i + hash(hx, hy, s), py = cy + j + hash(hx, hy, s + 7);
    const d = Math.hypot(gx - px, gy - py);
    if (d < d1) { d2 = d1; d1 = d; id = hash(hx, hy, s + 13); bx = gx - px; by = gy - py; } else if (d < d2) d2 = d;
  }
  VEDGE = (d2 - d1) * c; VDX = bx * c; VDY = by * c;
  return id;
}
