'use strict';
(() => {
  const W = 72;
  const H = 44;
  const RES = 4;
  const CATCHMENT = 900;
  const MAX_RADIUS = 3.2;
  const MIN_LAKE_DEPTH = 0.004;
  const DEEP_FROM_SHORE = 3.5;
  const VALLEY_SIDE = 0.03;
  const SPREAD_SIGMA = 1.5;
  const BANK_SPEED = 0.22;
  const BEND_PULL = 2.4;
  const PLUME_REACH = 4.5;
  const DRAW_REACH = 2.6;
  const SPILL = 0.28;
  const LAKE = { x: 47, y: 21.5, rx: 12.5, ry: 9.5 };
  const GUIDES = [
    { key: 'inflow', head: 1350, pts: [[0.5, 9], [6, 5.5], [12, 9], [12.5, 15.5], [18, 19.5], [24.5, 16], [30.5, 20.5], [37, 22]], fall: [[0, 0.6], [0.16, 0.565], [0.3, 0.46], [1, 0.292]] },
    { key: 'branch', head: 1080, pts: [[3, 43.5], [8.5, 36], [7, 30], [12.5, 25.5], [18, 19.5]], fall: [[0, 0.62], [1, 0.425]] },
    { key: 'outlet', head: 0, pts: [[57, 26.5], [62.5, 30], [61, 36], [66, 39.5], [71.5, 42.5]], fall: [[0, SPILL], [1, 0.12]] }
  ];
  const NARROWS = { x: 26.5, y: 17.2, reach: 3, squeeze: 0.75 };

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (a, b, x) => {
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };

  function hash(x, y, s) {
    let n = (Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(s, 1274126177)) >>> 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177) >>> 0;
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }

  function noise(x, y, s) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    let fx = x - ix;
    let fy = y - iy;
    fx = fx * fx * (3 - 2 * fx);
    fy = fy * fy * (3 - 2 * fy);
    const top = lerp(hash(ix, iy, s), hash(ix + 1, iy, s), fx);
    const bottom = lerp(hash(ix, iy + 1, s), hash(ix + 1, iy + 1, s), fx);
    return lerp(top, bottom, fy);
  }

  function distanceTo(isSeed, w, h) {
    const d = new Float32Array(w * h).fill(Infinity);
    for (let i = 0; i < w * h; i++) if (isSeed(i)) d[i] = 0;
    const relax = (i, x, y, cost) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      const via = d[y * w + x] + cost;
      if (via < d[i]) d[i] = via;
    };
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        relax(i, x - 1, y, 1);
        relax(i, x - 1, y - 1, Math.SQRT2);
        relax(i, x, y - 1, 1);
        relax(i, x + 1, y - 1, Math.SQRT2);
      }
    for (let y = h - 1; y >= 0; y--)
      for (let x = w - 1; x >= 0; x--) {
        const i = y * w + x;
        relax(i, x + 1, y, 1);
        relax(i, x + 1, y + 1, Math.SQRT2);
        relax(i, x, y + 1, 1);
        relax(i, x - 1, y + 1, Math.SQRT2);
      }
    return d;
  }

  function spline(pts) {
    const out = [];
    const at = (i) => pts[clamp(i, 0, pts.length - 1)];
    for (let i = 0; i < pts.length - 1; i++) {
      const [a, b, c, d] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
      for (let k = 0; k < 16; k++) {
        const t = k / 16;
        const point = [0, 1].map((n) => 0.5 * (2 * b[n] + (c[n] - a[n]) * t + (2 * a[n] - 5 * b[n] + 4 * c[n] - d[n]) * t * t + (3 * b[n] - a[n] - 3 * c[n] + d[n]) * t * t * t));
        out.push(point);
      }
    }
    out.push(pts[pts.length - 1]);
    let run = 0;
    const along = out.map((p, i) => (run += i ? Math.hypot(p[0] - out[i - 1][0], p[1] - out[i - 1][1]) : 0));
    return out.map((p, i) => ({ x: p[0], y: p[1], f: along[i] / run }));
  }

  function fallAt(fall, f) {
    for (let i = 0; i < fall.length - 1; i++)
      if (f <= fall[i + 1][0]) return lerp(fall[i][1], fall[i + 1][1], (f - fall[i][0]) / (fall[i + 1][0] - fall[i][0]));
    return fall[fall.length - 1][1];
  }

  function elevationField() {
    const lines = GUIDES.map((g) => ({ g, line: spline(g.pts) }));
    const e = new Float32Array(W * H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        let low = Infinity;
        for (const { g, line } of lines) {
          let best = Infinity;
          let f = 0;
          for (const p of line) {
            const d = Math.hypot(p.x - px, p.y - py);
            if (d < best) { best = d; f = p.f; }
          }
          low = Math.min(low, fallAt(g.fall, f) + VALLEY_SIDE * best);
        }
        const rough = (noise(x * 0.17, y * 0.17, 5) - 0.5) * 0.3 + (noise(x * 0.45, y * 0.45, 6) - 0.5) * 0.12;
        const rr = Math.hypot((px - LAKE.x) / LAKE.rx, (py - LAKE.y) / LAKE.ry) + rough;
        if (rr < 1) low = Math.min(low, SPILL - 0.006 - (1 - rr) * 0.25);
        e[y * W + x] = low + noise(x * 0.8, y * 0.8, 7) * 0.0006;
      }
    return e;
  }

  class MinHeap {
    constructor() { this.keys = []; this.vals = []; }
    get length() { return this.keys.length; }
    push(key, val) {
      const { keys, vals } = this;
      let i = keys.length;
      keys.push(key);
      vals.push(val);
      while (i > 0) {
        const up = (i - 1) >> 1;
        if (keys[up] <= key) break;
        keys[i] = keys[up];
        vals[i] = vals[up];
        i = up;
      }
      keys[i] = key;
      vals[i] = val;
    }
    pop() {
      const { keys, vals } = this;
      const top = vals[0];
      const key = keys.pop();
      const val = vals.pop();
      const n = keys.length;
      if (n) {
        let i = 0;
        for (;;) {
          let c = 2 * i + 1;
          if (c >= n) break;
          if (c + 1 < n && keys[c + 1] < keys[c]) c++;
          if (keys[c] >= key) break;
          keys[i] = keys[c];
          vals[i] = vals[c];
          i = c;
        }
        keys[i] = key;
        vals[i] = val;
      }
      return top;
    }
  }

  function drain(elevation) {
    const n = W * H;
    const fill = new Float32Array(n);
    const parent = new Int32Array(n).fill(-1);
    const order = new Int32Array(n);
    const seen = new Uint8Array(n);
    const heap = new MinHeap();
    const key = (i) => fill[i] + 1e-3 * elevation[i];
    const seed = (i) => {
      if (seen[i]) return;
      seen[i] = 1;
      fill[i] = elevation[i];
      heap.push(key(i), i);
    };
    for (let x = 0; x < W; x++) { seed(x); seed((H - 1) * W + x); }
    for (let y = 1; y < H - 1; y++) { seed(y * W); seed(y * W + W - 1); }
    let k = 0;
    while (heap.length) {
      const i = heap.pop();
      order[k++] = i;
      const x = i % W;
      const y = (i / W) | 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if ((!dx && !dy) || nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const j = ny * W + nx;
          if (seen[j]) continue;
          seen[j] = 1;
          fill[j] = Math.max(elevation[j], fill[i]);
          parent[j] = i;
          heap.push(key(j), j);
        }
    }
    return { fill, parent, order };
  }

  function largestPatch(inside) {
    const n = W * H;
    const mark = new Int32Array(n);
    let best = [];
    for (let s = 0; s < n; s++) {
      if (!inside(s) || mark[s]) continue;
      const patch = [s];
      mark[s] = 1;
      for (let k = 0; k < patch.length; k++) {
        const i = patch[k];
        const x = i % W;
        for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) {
          if (j < 0 || j >= n || mark[j] || !inside(j)) continue;
          mark[j] = 1;
          patch.push(j);
        }
      }
      if (patch.length > best.length) best = patch;
    }
    return best;
  }

  function blur(src, w, h, sigma) {
    const r = Math.ceil(sigma * 3);
    const kernel = [];
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += kernel[k + r] = Math.exp((-k * k) / (2 * sigma * sigma));
    const pass = (from, horizontal) => {
      const to = new Float32Array(w * h);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          let s = 0;
          for (let k = -r; k <= r; k++) {
            const xx = horizontal ? x + k : x;
            const yy = horizontal ? y : y + k;
            if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
            s += from[yy * w + xx] * kernel[k + r];
          }
          to[y * w + x] = s / sum;
        }
      return to;
    };
    return pass(pass(src, true), false);
  }

  function build() {
    const n = W * H;
    const elevation = elevationField();
    const { fill, parent, order } = drain(elevation);
    const lake = new Uint8Array(n);
    for (const i of largestPatch((i) => fill[i] - elevation[i] > MIN_LAKE_DEPTH)) lake[i] = 1;

    const acc = new Float32Array(n).fill(1);
    for (const g of GUIDES) {
      if (!g.head) continue;
      const [x, y] = g.pts[0];
      acc[clamp(Math.round(y - 0.5), 1, H - 2) * W + clamp(Math.round(x - 0.5), 1, W - 2)] += g.head;
    }
    for (let k = n - 1; k >= 0; k--) {
      const p = parent[order[k]];
      if (p >= 0) acc[p] += acc[order[k]];
    }

    const radiusOf = (q) => Math.min(MAX_RADIUS, 0.5 + 0.8 * Math.log2(q / CATCHMENT));
    const centre = new Uint8Array(n);
    const river = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      if (acc[i] < CATCHMENT || lake[i]) continue;
      centre[i] = 1;
      const x = i % W;
      const y = (i / W) | 0;
      const pinch = 1 - NARROWS.squeeze * Math.exp(-(((x + 0.5 - NARROWS.x) ** 2 + (y + 0.5 - NARROWS.y) ** 2) / NARROWS.reach ** 2));
      const radius = Math.max(0.5, radiusOf(acc[i]) * pinch);
      const r = Math.ceil(radius);
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > radius * radius + 0.25) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          river[ny * W + nx] = 1;
        }
      const p = parent[i];
      if (p >= 0 && p % W !== x && ((p / W) | 0) !== y) river[y * W + (p % W)] = 1;
    }
    for (let i = 0; i < n; i++) if (lake[i]) river[i] = 0;

    const water = (i) => lake[i] || river[i];
    const toLand = distanceTo((i) => !water(i), W, H);
    const classes = new Uint8Array(n);
    for (let i = 0; i < n; i++) classes[i] = !water(i) ? 0 : lake[i] && toLand[i] >= DEEP_FROM_SHORE ? 2 : 1;

    const down = (i, steps) => {
      let j = i;
      for (let k = 0; k < steps && parent[j] >= 0; k++) j = parent[j];
      return j;
    };
    const slope = new Float32Array(n);
    const slopes = [];
    for (let i = 0; i < n; i++) {
      if (!centre[i]) continue;
      const j = down(i, 4);
      const run = Math.hypot((j % W) - (i % W), ((j / W) | 0) - ((i / W) | 0));
      slope[i] = run > 0 ? (fill[i] - fill[j]) / run : 0;
      slopes.push(slope[i]);
    }
    const inland = (i) => Math.min(i % W, W - 1 - (i % W), (i / W) | 0, H - 1 - ((i / W) | 0)) >= 4;
    const steepest = slope.reduce((best, v, i) => (inland(i) && v > slope[best] ? i : best), slope.findIndex((_, i) => inland(i)));
    slopes.sort((a, b) => a - b);
    const typical = slopes[slopes.length >> 1] || 1;

    const src = { w: new Float32Array(n), vx: new Float32Array(n), vy: new Float32Array(n), sp: new Float32Array(n), ra: new Float32Array(n), px: new Float32Array(n), py: new Float32Array(n) };
    const dir8 = new Int8Array(n).fill(-1);
    const speedOf = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      if (!centre[i]) continue;
      const x = i % W;
      const y = (i / W) | 0;
      const p = parent[i];
      if (p < 0) continue;
      dir8[i] = ((((p / W) | 0) - y + 1) * 3 + ((p % W) - x + 1));
      const j = down(i, 2);
      const len = Math.hypot((j % W) - x, ((j / W) | 0) - y) || 1;
      const half = Math.max(0.5, toLand[i] - 0.5);
      const natural = Math.floor(Math.sqrt(radiusOf(acc[i]) ** 2 + 0.25)) + 0.5;
      const narrow = clamp(natural / half, 0.75, 2.4);
      const steep = clamp(slope[i] / (1.3 * typical), 0.7, 3.5) ** 0.75;
      const base = clamp(0.38 + 0.03 * Math.log2(acc[i] / CATCHMENT), 0.36, 0.46);
      speedOf[i] = clamp(base * narrow * steep, 0.2, 1);
      src.w[i] = 1;
      src.vx[i] = ((j % W) - x) / len;
      src.vy[i] = (((j / W) | 0) - y) / len;
      src.sp[i] = speedOf[i];
      src.ra[i] = half;
      src.px[i] = x + 0.5;
      src.py[i] = y + 0.5;
    }
    const spread = {};
    for (const k of Object.keys(src)) spread[k] = blur(src[k], W, H, SPREAD_SIGMA);

    const tap = (arr, px, py) => {
      const fx = clamp(px - 0.5, 0, W - 1);
      const fy = clamp(py - 0.5, 0, H - 1);
      const x0 = Math.min(W - 2, Math.floor(fx));
      const y0 = Math.min(H - 2, Math.floor(fy));
      const tx = fx - x0;
      const ty = fy - y0;
      const i = y0 * W + x0;
      return lerp(lerp(arr[i], arr[i + 1], tx), lerp(arr[i + W], arr[i + W + 1], tx), ty);
    };
    const courseAt = (px, py) => {
      const w = tap(spread.w, px, py);
      if (w < 1e-4) return null;
      const vx = tap(spread.vx, px, py) / w;
      const vy = tap(spread.vy, px, py) / w;
      const len = Math.hypot(vx, vy) || 1;
      return { w, x: vx / len, y: vy / len, sp: tap(spread.sp, px, py) / w, ra: tap(spread.ra, px, py) / w, cx: tap(spread.px, px, py) / w, cy: tap(spread.py, px, py) / w };
    };

    const mouths = [];
    const outlets = [];
    for (let i = 0; i < n; i++) {
      const p = parent[i];
      if (p < 0) continue;
      const here = { x: (i % W) + 0.5, y: ((i / W) | 0) + 0.5 };
      const there = { x: (p % W) + 0.5, y: ((p / W) | 0) + 0.5 };
      if (centre[i] && lake[p]) {
        const c = courseAt(here.x, here.y);
        mouths.push({ ...here, dx: c.x, dy: c.y, sp: speedOf[i], half: src.ra[i] });
      }
      if (lake[i] && centre[p] && acc[i] >= CATCHMENT) {
        const c = courseAt(there.x, there.y);
        outlets.push({ ...there, dx: c.x, dy: c.y, sp: speedOf[p], half: src.ra[p] });
      }
    }

    const nearRiver = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const x = i % W;
      const y = (i / W) | 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < W && ny < H && river[ny * W + nx]) nearRiver[i] = 1;
        }
    }

    const roomy = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = i % W;
      const y = (i / W) | 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < W && ny < H) roomy[i] = Math.max(roomy[i], toLand[ny * W + nx] - 0.5);
        }
    }

    const fw = W * RES;
    const fh = H * RES;
    let vx = new Float32Array(fw * fh);
    let vy = new Float32Array(fw * fh);
    let mask = new Float32Array(fw * fh);
    for (let ty = 0; ty < fh; ty++)
      for (let tx = 0; tx < fw; tx++) {
        const px = (tx + 0.5) / RES;
        const py = (ty + 0.5) / RES;
        const tile = Math.floor(py) * W + Math.floor(px);
        const t = ty * fw + tx;
        const c = courseAt(px, py);
        if (c && (river[tile] || (!lake[tile] && nearRiver[tile]))) {
          const bank = Math.max(0, tap(toLand, px, py) - 0.5);
          const profile = BANK_SPEED + (1 - BANK_SPEED) * smoothstep(0, clamp(0.8 * Math.min(c.ra, roomy[tile]), 0.35, 0.9), bank);
          const ahead = courseAt(px + c.x, py + c.y) || c;
          const turning = c.x * ahead.y - c.y * ahead.x;
          const side = c.x * (py - c.cy) - c.y * (px - c.cx);
          const bend = clamp(1 - BEND_PULL * turning * side, 0.3, 1.35);
          const sp = c.sp * profile * bend;
          vx[t] = c.x * sp;
          vy[t] = c.y * sp;
          mask[t] = 1;
          continue;
        }
        let ax = 0;
        let ay = 0;
        let m = 0;
        for (const o of mouths) {
          const rx = px - o.x;
          const ry = py - o.y;
          const r = Math.hypot(rx, ry);
          const along = rx * o.dx + ry * o.dy;
          const across = o.dx * ry - o.dy * rx;
          const s = Math.exp(-r / PLUME_REACH) * smoothstep(-1.5, 0.5, along) * Math.exp(-((across / (o.half + 0.6 + 0.55 * Math.max(0, along))) ** 2));
          const fx = o.dx + (0.55 * rx) / Math.max(r, 1);
          const fy = o.dy + (0.55 * ry) / Math.max(r, 1);
          const len = Math.hypot(fx, fy) || 1;
          ax += (fx / len) * o.sp * s;
          ay += (fy / len) * o.sp * s;
          m += s;
        }
        for (const o of outlets) {
          const rx = o.x - px;
          const ry = o.y - py;
          const r = Math.hypot(rx, ry);
          const s = Math.exp(-r / DRAW_REACH);
          const near = Math.exp(-r);
          const fx = rx / Math.max(r, 0.5) + o.dx * near;
          const fy = ry / Math.max(r, 0.5) + o.dy * near;
          const len = Math.hypot(fx, fy) || 1;
          ax += (fx / len) * o.sp * s;
          ay += (fy / len) * o.sp * s;
          m += s;
        }
        vx[t] = ax;
        vy[t] = ay;
        mask[t] = smoothstep(0.06, 0.7, m);
      }
    vx = blur(vx, fw, fh, 1.2);
    vy = blur(vy, fw, fh, 1.2);
    mask = blur(mask, fw, fh, 1.6);

    const texture = new Uint8Array(fw * fh * 4);
    for (let t = 0; t < fw * fh; t++) {
      const sp = Math.hypot(vx[t], vy[t]);
      const ux = sp > 1e-4 ? vx[t] / sp : 0;
      const uy = sp > 1e-4 ? vy[t] / sp : 0;
      texture[t * 4] = Math.round(127.5 + 127.5 * ux);
      texture[t * 4 + 1] = Math.round(127.5 + 127.5 * uy);
      texture[t * 4 + 2] = Math.round(clamp(sp, 0, 1) * 255);
      texture[t * 4 + 3] = Math.round(clamp(mask[t], 0, 1) * 255);
    }

    const flowAt = (px, py) => {
      const fx = clamp(px * RES - 0.5, 0, fw - 1.001);
      const fy = clamp(py * RES - 0.5, 0, fh - 1.001);
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const t = y0 * fw + x0;
      const mix = (a) => lerp(lerp(a[t], a[t + 1], fx - x0), lerp(a[t + fw], a[t + fw + 1], fx - x0), fy - y0);
      return { x: mix(vx), y: mix(vy), mask: mix(mask) };
    };

    return {
      W, H, RES, CATCHMENT, classes, lake, river, centre, parent, acc, dir8, speedOf, toLand,
      flow: { w: fw, h: fh, texture, at: flowAt },
      look: { mouth: [mouths[0].x + 3, mouths[0].y], outlet: [outlets[0].x, outlets[0].y], narrows: [NARROWS.x, NARROWS.y], rapids: [(steepest % W) + 0.5, ((steepest / W) | 0) + 0.5] },
      mouths, outlets,
      util: { hash, noise, distanceTo, clamp, lerp, smoothstep }
    };
  }

  globalThis.FLOWMAP = build();
})();
