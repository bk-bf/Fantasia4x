'use strict';
const TK = (() => {
  const RAMP_OF = new Map();
  const adopt = r => { for (const c of r) if (!RAMP_OF.has(c)) RAMP_OF.set(c, r); return r; };
  const ramp = s => adopt(R(s));
  const at = (r, k) => r[clamp(Math.round(k), 0, r.length - 1)];
  const cool = (c, k) => [Math.round(c[0] * k * .88), Math.round(c[1] * k * .86), Math.round(Math.min(255, c[2] * k + 12))];
  const canvas = (w, h) => new Spr(w || 32, h || 32, (w || 32) >> 1, (h || 32) - 1);
  const luma = c => c[0] * .3 + c[1] * .59 + c[2] * .11;
  const key = c => (Math.round(c[0]) << 16) | (Math.round(c[1]) << 8) | Math.round(c[2]);
  const peek = (s, x, y) => x < 0 || y < 0 || x >= s.w || y >= s.h ? null : s.c[y * s.w + x];
  const cut = (s, x, y) => { if (s.ok(x, y)) s.c[y * s.w + x] = null; };
  const px = (s, x, y, r, k) => s.set(x, y, at(r, k));
  const each = (s, fn) => { for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) fn(x, y, s.c[y * s.w + x]); };

  function ball(s, cx, cy, rx, ry, r, o) {
    o = o || {};
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const nx = (x + .5 - cx) / rx, ny = (y + .5 - cy) / ry, q = nx * nx + ny * ny;
      if (q > 1 || (o.clip && !o.clip(x, y))) continue;
      const l = nx * LV[0] + ny * LV[1] + Math.sqrt(1 - q) * LV[2];
      s.set(x, y, rp(r, .5 + l * .5 * (o.amp === undefined ? 1 : o.amp) + (o.bias || 0), x, y, o.d === undefined ? .25 : o.d));
    }
  }

  function poly(s, pts, fn) {
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++) {
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const a = pts[j], b = pts[i];
        if ((a[1] > y + .5) !== (b[1] > y + .5) && x + .5 < (b[0] - a[0]) * (y + .5 - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
      }
      const c = inside && fn(x, y);
      if (c) s.set(x, y, c);
    }
  }

  function seg(s, a, b, hw, fn) {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, pad = typeof hw === 'function' ? 5 : hw + 1;
    for (let y = Math.floor(Math.min(a[1], b[1]) - pad); y <= Math.max(a[1], b[1]) + pad; y++) for (let x = Math.floor(Math.min(a[0], b[0]) - pad); x <= Math.max(a[0], b[0]) + pad; x++) {
      const qx = x + .5 - a[0], qy = y + .5 - a[1], t = (qx * ux + qy * uy) / L, v = -qx * uy + qy * ux, w = typeof hw === 'function' ? hw(t) : hw;
      if (t < 0 || t > 1 || Math.abs(v) > w) continue;
      const c = fn(t, v / w, x, y);
      if (c) s.set(x, y, c);
    }
  }

  function path(s, pts, hw, fn) {
    let done = 0;
    const lens = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1])), total = lens.reduce((a, b) => a + b, 0);
    pts.slice(1).forEach((p, i) => {
      const from = done / total, span = lens[i] / total;
      seg(s, pts[i], p, typeof hw === 'function' ? t => hw(from + t * span) : hw, (t, u, x, y) => fn(from + t * span, u, x, y));
      done += lens[i];
    });
  }

  const curve = (a, c, b, n) => Array.from({ length: (n || 12) + 1 }, (_, i) => { const t = i / (n || 12), k = 1 - t; return [k * k * a[0] + 2 * k * t * c[0] + t * t * b[0], k * k * a[1] + 2 * k * t * c[1] + t * t * b[1]]; });

  function stamp(s, x0, y0, rows, legend) {
    rows.forEach((row, j) => [...row].forEach((ch, i) => {
      if (ch === '.') cut(s, x0 + i, y0 + j);
      else if (legend[ch]) s.set(x0 + i, y0 + j, legend[ch]);
    }));
  }

  const darkest = c => { const r = RAMP_OF.get(c); return r ? r[0] : c; };

  function outline(s, o) {
    o = o || {};
    const add = [];
    each(s, (x, y, c) => {
      if (c) return;
      const shaded = peek(s, x - 1, y) || peek(s, x, y - 1), lit = peek(s, x + 1, y) || peek(s, x, y + 1);
      const from = shaded || (o.shadowOnly ? null : lit);
      if (from) add.push([y * s.w + x, cool(darkest(from), shaded ? (o.k || .6) : (o.litK || 1.25))]);
    });
    for (const [i, c] of add) s.c[i] = c;
    return s;
  }

  function clone(s) {
    const t = new Spr(s.w, s.h, s.ax, s.ay);
    t.c = s.c.slice();
    return t;
  }

  function shrink(s, size) {
    const b = bounds(s);
    if (!b) return canvas(size, size);
    const f = Math.max(b.w, b.h) / size, W = Math.max(1, Math.round(b.w / f)), H = Math.max(1, Math.round(b.h / f)), out = canvas(size + 2, size + 2);
    const ox = (size + 2 - W) >> 1, oy = size + 1 - H;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const tally = new Map(); let n = 0, all = 0;
      for (let v = Math.floor(y * f); v < Math.max(Math.floor(y * f) + 1, Math.floor((y + 1) * f)); v++) for (let u = Math.floor(x * f); u < Math.max(Math.floor(x * f) + 1, Math.floor((x + 1) * f)); u++) {
        const c = peek(s, b.x + u, b.y + v); all++;
        if (!c) continue;
        n++; const k = key(c), e = tally.get(k) || { c, n: 0 }; e.n++; tally.set(k, e);
      }
      if (n * 2 < all) continue;
      out.c[(oy + y) * out.w + ox + x] = [...tally.values()].sort((p, q) => q.n - p.n || luma(q.c) - luma(p.c))[0].c;
    }
    return out;
  }

  function bounds(s) {
    let x0 = s.w, y0 = s.h, x1 = -1, y1 = -1;
    each(s, (x, y, c) => { if (c) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } });
    return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  function image(s, trim) {
    const b = trim ? bounds(s) || { x: 0, y: 0, w: 1, h: 1 } : { x: 0, y: 0, w: s.w, h: s.h }, rgba = new Uint8ClampedArray(b.w * b.h * 4);
    for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
      const c = s.c[(b.y + y) * s.w + b.x + x], i = (y * b.w + x) * 4;
      if (c) { rgba[i] = c[0]; rgba[i + 1] = c[1]; rgba[i + 2] = c[2]; rgba[i + 3] = 255; }
    }
    return { w: b.w, h: b.h, rgba };
  }

  function fromImage(img, pad) {
    const m = pad === undefined ? 1 : pad, s = canvas(img.w + m * 2, img.h + m * 2), seen = new Map();
    for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
      const i = (y * img.w + x) * 4;
      if (img.rgba[i + 3] < 128) continue;
      const c = [img.rgba[i], img.rgba[i + 1], img.rgba[i + 2]], k = key(c);
      if (!seen.has(k)) seen.set(k, c);
      s.c[(y + m) * s.w + x + m] = seen.get(k);
    }
    return s;
  }

  return { adopt, ramp, at, cool, canvas, luma, key, peek, cut, px, each, ball, poly, seg, path, curve, stamp, outline, clone, shrink, bounds, image, fromImage };
})();
