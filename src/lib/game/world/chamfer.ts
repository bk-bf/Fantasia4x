const ORTHO = 1;
const DIAG = Math.SQRT2;
export const CHAMFER_FAR = 1e9;

export function chamferDistance(
  w: number,
  h: number,
  isSource: (i: number) => boolean
): Float64Array {
  const dist = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) dist[i] = isSource(i) ? 0 : CHAMFER_FAR;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let d = dist[i];
      if (x > 0) d = Math.min(d, dist[i - 1] + ORTHO);
      if (y > 0) d = Math.min(d, dist[i - w] + ORTHO);
      if (x > 0 && y > 0) d = Math.min(d, dist[i - w - 1] + DIAG);
      if (x < w - 1 && y > 0) d = Math.min(d, dist[i - w + 1] + DIAG);
      dist[i] = d;
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      let d = dist[i];
      if (x < w - 1) d = Math.min(d, dist[i + 1] + ORTHO);
      if (y < h - 1) d = Math.min(d, dist[i + w] + ORTHO);
      if (x < w - 1 && y < h - 1) d = Math.min(d, dist[i + w + 1] + DIAG);
      if (x > 0 && y < h - 1) d = Math.min(d, dist[i + w - 1] + DIAG);
      dist[i] = d;
    }
  }
  return dist;
}
