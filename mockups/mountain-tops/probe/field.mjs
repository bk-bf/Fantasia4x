import { readFileSync, writeFileSync, existsSync } from 'node:fs';

export const TILE = 32;

export async function loadScene(TREE, OUT) {
  const { art, ROCK } = await import(`${TREE}/tools/tileset/bake.mjs`);
  const { LIFT } = await import(`${TREE}/tools/tileset/rock.mjs`);
  const meta = JSON.parse(readFileSync(`${OUT}/meta.json`, 'utf8'));
  const M = meta.margin * TILE;
  const W = meta.W,
    H = meta.H,
    FW = W + 2 * M,
    FH = H + 2 * M;
  const mass = (tx = 0, ty = 0) => meta.mass[ty]?.[tx] === '1';
  const file = `${OUT}/footprint.bin`;
  let foot;
  if (existsSync(file)) foot = new Uint8Array(readFileSync(file));
  else {
    foot = new Uint8Array(FW * FH);
    for (let y = 0; y < FH; y++)
      for (let x = 0; x < FW; x++) foot[y * FW + x] = ROCK.rock(mass, x, y) ? 1 : 0;
    writeFileSync(file, foot);
  }
  const today = new Uint8Array(readFileSync(`${OUT}/today.rgba`));
  const s0 = readFileSync(`${OUT}/shade0.rgba`),
    s6 = readFileSync(`${OUT}/shade6.rgba`);
  const top = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++)
    top[i] = s0[i * 4] !== s6[i * 4] || s0[i * 4 + 1] !== s6[i * 4 + 1] ? 1 : 0;
  return { art, LIFT, M, W, H, FW, FH, foot, today, top, s0, s6 };
}

const INF = 1e20;

function edt1d(f, n, d, v, z, arg) {
  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s;
    do {
      const p = v[k];
      s = (f[q] + q * q - (f[p] + p * p)) / (2 * q - 2 * p);
    } while (s <= z[k] && --k >= 0);
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const p = v[k];
    d[q] = (q - p) * (q - p) + f[p];
    arg[q] = p;
  }
}

export function distanceInside(mask, w, h) {
  const dist = new Float32Array(w * h);
  const nearX = new Int16Array(w * h),
    nearY = new Int16Array(w * h);
  const n = Math.max(w, h);
  const f = new Float64Array(n),
    d = new Float64Array(n),
    v = new Int32Array(n),
    z = new Float64Array(n + 1),
    arg = new Int32Array(n);
  const g = new Float64Array(w * h);
  const gy = new Int16Array(w * h);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = mask[y * w + x] ? INF : 0;
    edt1d(f, h, d, v, z, arg);
    for (let y = 0; y < h; y++) {
      g[y * w + x] = d[y];
      gy[y * w + x] = arg[y];
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = g[y * w + x];
    edt1d(f, w, d, v, z, arg);
    for (let x = 0; x < w; x++) {
      dist[y * w + x] = Math.sqrt(d[x]);
      nearX[y * w + x] = arg[x];
      nearY[y * w + x] = gy[y * w + arg[x]];
    }
  }
  return { dist, nearX, nearY };
}

export function blur(src, w, h, r, passes = 2) {
  const a = Float32Array.from(src),
    b = new Float32Array(w * h);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {
      let s = 0;
      const row = y * w;
      for (let x = -r; x <= r; x++) s += a[row + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) {
        b[row + x] = s / (2 * r + 1);
        s += a[row + Math.min(w - 1, x + r + 1)] - a[row + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let y = -r; y <= r; y++) s += b[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) {
        a[y * w + x] = s / (2 * r + 1);
        s += b[Math.min(h - 1, y + r + 1) * w + x] - b[Math.max(0, y - r) * w + x];
      }
    }
  }
  return a;
}
