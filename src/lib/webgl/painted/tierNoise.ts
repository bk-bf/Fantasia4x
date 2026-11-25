export function hash(x: number, y: number, z: number): number {
  let n = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1274126177);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

export function smooth(a: number, b: number, v: number): number {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function noise(x: number, y: number, s: number, period = 0): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  let xf = x - xi;
  let yf = y - yi;
  xf = xf * xf * (3 - 2 * xf);
  yf = yf * yf * (3 - 2 * yf);
  const w = (v: number) => (period > 0 ? ((v % period) + period) % period : v);
  const x0 = w(xi);
  const x1 = w(xi + 1);
  const y0 = w(yi);
  const y1 = w(yi + 1);
  return mix(
    mix(hash(x0, y0, s), hash(x1, y0, s), xf),
    mix(hash(x0, y1, s), hash(x1, y1, s), xf),
    yf
  );
}

export function fbm(x: number, y: number, s: number, octaves: number): number {
  let a = 0.5;
  let f = 1;
  let v = 0;
  let n = 0;
  for (let i = 0; i < octaves; i++) {
    v += a * noise(x * f, y * f, s + i * 17);
    n += a;
    a *= 0.5;
    f *= 2;
  }
  return v / n;
}

export const ridged = (x: number, y: number, s: number): number =>
  1 - Math.abs(2 * noise(x, y, s) - 1);

export const NOISE_SIZE = 512;

function periodic(x: number, y: number, qx: number, qy: number, s: number): number {
  const gx = (x * qx) / NOISE_SIZE;
  const gy = (y * qy) / NOISE_SIZE;
  const xi = Math.floor(gx);
  const yi = Math.floor(gy);
  let xf = gx - xi;
  let yf = gy - yi;
  xf = xf * xf * (3 - 2 * xf);
  yf = yf * yf * (3 - 2 * yf);
  const wx = (v: number) => ((v % qx) + qx) % qx;
  const wy = (v: number) => ((v % qy) + qy) % qy;
  return mix(
    mix(hash(wx(xi), wy(yi), s), hash(wx(xi + 1), wy(yi), s), xf),
    mix(hash(wx(xi), wy(yi + 1), s), hash(wx(xi + 1), wy(yi + 1), s), xf),
    yf
  );
}

const cells = (scale: number): number => Math.max(1, Math.round(NOISE_SIZE * scale));
const at = (x: number, y: number, fx: number, fy: number, s: number): number =>
  periodic(x, y, cells(fx), cells(fy), s);

export const JAG_RANGE = 0.4;
export const FACE_LOW = 0.75;
export const FACE_SPAN = 1.25;

export function tierJagAt(x: number, y: number): number {
  return (at(x, y, 1 / 19, 1 / 19, 147) - 0.5) * 0.2 + (at(x, y, 1 / 7, 1 / 7, 149) - 0.5) * 0.08;
}

export function faceGrainAt(x: number, y: number): number {
  let t = (at(x, y, 0.22, 0.045, 44) - 0.5) * 0.5 + (at(x, y, 0.07, 0.02, 48) - 0.5) * 0.3;
  if (Math.abs(at(x, y, 0.06, 0.06, 49) - 0.5) < 0.02) t -= 0.3;
  return t;
}

export function snowDriftAt(x: number, y: number): number {
  const drift = (at(x, y, 1 / 60, 1 / 60, 71) * 2 + at(x, y, 1 / 30, 1 / 30, 88)) / 3;
  return drift + (at(x, y, 1 / 6, 1 / 6, 75) - 0.5) * 0.06;
}

export function tierNoiseTexels(): Uint8Array {
  const out = new Uint8Array(NOISE_SIZE * NOISE_SIZE * 4);
  const byte = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255);
  for (let y = 0; y < NOISE_SIZE; y++)
    for (let x = 0; x < NOISE_SIZE; x++) {
      const o = (y * NOISE_SIZE + x) * 4;
      out[o] = byte(tierJagAt(x, y) / JAG_RANGE + 0.5);
      out[o + 1] = byte((faceGrainAt(x, y) + FACE_LOW) / FACE_SPAN);
      out[o + 2] = byte(snowDriftAt(x, y));
      out[o + 3] = byte(at(x, y, 1 / 5, 1 / 5, 331));
    }
  return out;
}
