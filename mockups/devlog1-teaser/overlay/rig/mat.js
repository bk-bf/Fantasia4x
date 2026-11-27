'use strict';
const lit = (c, k) => [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)];
const M = {
  wood(ramp, o) {
    o = o || {};
    const pw = o.pw || 6, seed = o.seed || 0, n = ramp.length - 1, b = o.b === undefined ? n - 2 : o.b, v = o.dir === 'v', len = o.len || 0;
    return (x, y) => {
      const a = v ? x : y, c = v ? y : x, pl = Math.floor(a / pw), pa = a - pl * pw;
      if (pw > 2 && pa === pw - 1) return ramp[Math.max(0, b - 2)];
      const e = len ? (c + Math.floor(hash(pl, seed, 5) * len)) % len : -1;
      if (e === 0) return ramp[Math.max(0, b - 2)];
      if (e === 2 && pa === (pw >> 1)) return ramp[0];
      const h = hash(pl, seed, 1);
      let k = b + (h > .62 ? 1 : h < .22 ? -1 : 0);
      if (pa === 0) k += 1;
      if (noise(c * .2 + pl * 7.3, a * 1.4, seed + 3) > .7) k -= 1;
      return ramp[clamp(k, 0, n)];
    };
  },
  stone(ramp, bw, bh, o) {
    o = o || {};
    const seed = o.seed || 0, n = ramp.length - 1, b = o.b === undefined ? n - 2 : o.b;
    return (x, y) => {
      const row = Math.floor(y / bh), xx = x + (row & 1) * (bw >> 1) + Math.floor(hash(row, seed, 2) * 3), col = Math.floor(xx / bw), lx = xx - col * bw, ly = y - row * bh;
      if (ly === bh - 1 || lx === bw - 1) return ramp[Math.max(0, b - 3)];
      const h = hash(col, row, seed + 3);
      let k = b + (h > .68 ? 1 : h < .25 ? -1 : 0);
      if (ly === 0 || lx === 0) k += 1; else if (ly === bh - 2 || lx === bw - 2) k -= 1;
      if (hash(x, y, seed + 5) > .94) k -= 1;
      if (h > .86 && Math.abs(lx - ly * 1.4 - bw * .25) < .8) k -= 2;
      return ramp[clamp(k, 0, n)];
    };
  },
  thatch(ramp, o) {
    o = o || {};
    const seed = o.seed || 0, n = ramp.length - 1, rh = o.rh || 7;
    return (x, y) => {
      const yy = y + Math.floor(hash(x >> 1, 0, seed) * 3), row = Math.floor(yy / rh), py = yy - row * rh;
      let k = n - 2 + (hash(x, row, seed + 1) > .62 ? 1 : 0) - (hash(x, row, seed + 2) > .82 ? 1 : 0);
      if (py === rh - 1) k -= 2; else if (py === rh - 2) k -= 1; else if (py === 0) k += 1;
      return ramp[clamp(k, 0, n)];
    };
  },
  flat(ramp, b, seed, amt) {
    const n = ramp.length - 1;
    return (x, y) => { const h = hash(x, y, seed || 0), m = noise(x * .12, y * .12, (seed || 0) + 1); return ramp[clamp(b + (m > .66 ? 1 : m < .3 ? -1 : 0) + (h > 1 - (amt || .05) ? 1 : h < (amt || .05) ? -1 : 0), 0, n)]; };
  },
  weave(ramp, b) { return (x, y) => ramp[clamp(b + ((((x >> 1) + (y >> 1)) & 1) ? 1 : -1) + ((x & 1) && (y & 1) ? -1 : 0), 0, ramp.length - 1)]; },
  cloth(ramp, b, seed) {
    const n = ramp.length - 1;
    return (x, y) => ramp[clamp(b + (Math.sin(x * .55 + noise(x * .1, y * .1, seed || 0) * 6) > .55 ? 1 : 0) - (Math.sin(x * .55 + 2 + y * .08) > .75 ? 1 : 0), 0, n)];
  },
  fur(ramp, b, seed) {
    const n = ramp.length - 1;
    return (x, y) => ramp[clamp(b + (noise(x * .9, y * .35, seed || 0) > .62 ? 1 : 0) - (noise(x * .8 + 9, y * .3, (seed || 0) + 3) > .66 ? 1 : 0), 0, n)];
  },
};
Spr.prototype.fill = function (x, y, w, h, fn, e) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const c = fn(x + i, y + j, i, j); if (c) this.set(x + i, y + j, c, e); }
  return this;
};
Spr.prototype.slab = function (x, y, w, d, h, top, front, o) {
  o = o || {};
  for (let j = 0; j < d; j++) for (let i = 0; i < w; i++) {
    let c = top(x + i, y + j, i, j); if (!c) continue;
    if (j === 0 || i === 0) c = lit(c, 1.16); else if (i === w - 1) c = dark(c, .82);
    this.set(x + i, y + j, c);
  }
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    let c = front(x + i, y + d + j, i, j); if (!c) continue;
    c = dark(c, j === 0 ? .9 : o.fd || .74);
    if (i === 0) c = lit(c, 1.14); else if (i === w - 1 || j === h - 1) c = dark(c, .74);
    this.set(x + i, y + d + j, c);
  }
  return this;
};
Spr.prototype.tube = function (x, y, w, h, tex, e) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const u = w > 1 ? i / (w - 1) : .5;
    let c = tex(x + i, y + j, i, j); if (!c) continue;
    c = u < .12 ? lit(c, 1.05) : u < .32 ? lit(c, 1.22) : u < .6 ? c : u < .82 ? dark(c, .78) : dark(c, .6);
    this.set(x + i, y + j, c, e);
  }
  return this;
};
Spr.prototype.oval = function (cx, cy, rx, ry, tex, e) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
    const nx = (x + .5 - cx) / rx, ny = (y + .5 - cy) / ry, q = nx * nx + ny * ny;
    if (q > 1) continue;
    let c = tex(x, y, nx, ny); if (!c) continue;
    if (q > .72) c = nx + ny < 0 ? lit(c, 1.18) : dark(c, .8);
    this.set(x, y, c, e);
  }
  return this;
};
Spr.prototype.thick = function (x0, y0, x1, y1, w, ramp, b) {
  const n = Math.round(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))), m = ramp.length - 1, vert = Math.abs(y1 - y0) >= Math.abs(x1 - x0);
  for (let i = 0; i <= n; i++) {
    const k = n ? i / n : 0, x = x0 + (x1 - x0) * k, y = y0 + (y1 - y0) * k;
    for (let j = 0; j < w; j++) this.set(vert ? x + j : x, vert ? y : y + j, ramp[clamp(b + (j === 0 ? 1 : j === w - 1 && w > 1 ? -1 : 0), 0, m)]);
  }
  return this;
};
