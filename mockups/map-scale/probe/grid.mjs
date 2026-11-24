export const hash = (x, y, s = 0) => {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

export const noise = (x, y, s = 0) => {
  const xi = Math.floor(x),
    yi = Math.floor(y);
  let xf = x - xi,
    yf = y - yi;
  xf = xf * xf * (3 - 2 * xf);
  yf = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, s) + (hash(xi + 1, yi, s) - hash(xi, yi, s)) * xf;
  const b = hash(xi, yi + 1, s) + (hash(xi + 1, yi + 1, s) - hash(xi, yi + 1, s)) * xf;
  return a + (b - a) * yf;
};

export const fbm = (x, y, s = 0, octaves = 3) => {
  let amp = 0.5,
    freq = 1,
    value = 0,
    total = 0;
  for (let i = 0; i < octaves; i++) {
    value += amp * noise(x * freq, y * freq, s + i * 17);
    total += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return value / total;
};

export const smooth = (a, b, v) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function distanceTo(w, h, inside) {
  const d = new Float32Array(w * h).fill(1e9);
  for (let i = 0; i < w * h; i++) if (inside(i)) d[i] = 0;
  const DIAG = Math.SQRT2;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let v = d[i];
      if (x > 0) v = Math.min(v, d[i - 1] + 1);
      if (y > 0) {
        v = Math.min(v, d[i - w] + 1);
        if (x > 0) v = Math.min(v, d[i - w - 1] + DIAG);
        if (x < w - 1) v = Math.min(v, d[i - w + 1] + DIAG);
      }
      d[i] = v;
    }
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      let v = d[i];
      if (x < w - 1) v = Math.min(v, d[i + 1] + 1);
      if (y < h - 1) {
        v = Math.min(v, d[i + w] + 1);
        if (x < w - 1) v = Math.min(v, d[i + w + 1] + DIAG);
        if (x > 0) v = Math.min(v, d[i + w - 1] + DIAG);
      }
      d[i] = v;
    }
  return d;
}

export function nearestOf(w, h, inside) {
  const near = new Int32Array(w * h).fill(-1);
  const queue = new Int32Array(w * h);
  let tail = 0;
  for (let i = 0; i < w * h; i++)
    if (inside(i)) {
      near[i] = i;
      queue[tail++] = i;
    }
  for (let head = 0; head < tail; head++) {
    const i = queue[head],
      x = i % w,
      y = (i / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx,
        ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (near[j] >= 0) continue;
      near[j] = near[i];
      queue[tail++] = j;
    }
  }
  return near;
}

export function patches(w, h, inside) {
  const id = new Int32Array(w * h).fill(-1);
  const sizes = [];
  const stack = [];
  for (let s = 0; s < w * h; s++) {
    if (id[s] >= 0 || !inside(s)) continue;
    const k = sizes.length;
    let size = 0;
    id[s] = k;
    stack.push(s);
    while (stack.length) {
      const i = stack.pop(),
        x = i % w,
        y = (i / w) | 0;
      size++;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx,
          ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (id[j] >= 0 || !inside(j)) continue;
        id[j] = k;
        stack.push(j);
      }
    }
    sizes.push(size);
  }
  return { id, sizes };
}
