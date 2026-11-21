export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

export const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

export const dith = (x: number, y: number): number => (BAYER4[((y & 3) << 2) | (x & 3)] + 0.5) / 16;

export function hash(x: number, y: number, z: number): number {
  let n = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1274126177);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

export function noise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  let xf = x - xi;
  let yf = y - yi;
  xf = xf * xf * (3 - 2 * xf);
  yf = yf * yf * (3 - 2 * yf);
  const top = mix(hash(xi, yi, seed), hash(xi + 1, yi, seed), xf);
  const bottom = mix(hash(xi, yi + 1, seed), hash(xi + 1, yi + 1, seed), xf);
  return mix(top, bottom, yf);
}

export function fbm(x: number, y: number, seed: number, octaves: number): number {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise(x * freq, y * freq, seed + i * 17);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}
