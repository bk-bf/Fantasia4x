export function peakLayer({ FW, FH, LIFT, foot }, dir, box) {
  const layer = new Uint8Array(FW * FH * 3);
  const drawn = new Uint8Array(FW * FH);
  const source = new Uint16Array(FW * FH);
  const put = (x, r, c, y) => {
    if (r < 0 || r >= FH) return;
    const i = r * FW + x;
    layer[i * 3] = c[0];
    layer[i * 3 + 1] = c[1];
    layer[i * 3 + 2] = c[2];
    drawn[i] = 1;
    source[i] = y;
  };
  for (let x = box.x0; x < box.x1; x++) {
    let front = Infinity;
    for (let y = box.y1 - 1; y >= box.y0; y--) {
      const i = y * FW + x;
      if (!foot[i]) {
        front = Infinity;
        continue;
      }
      if (front === Infinity) front = y - LIFT + 1;
      const row = Math.round(y - LIFT - dir.height[i]);
      if (row >= front) continue;
      const span = front - row;
      for (let k = 0; k < span; k++) put(x, row + k, dir.colour(x, y, row + k, k, span), y);
      front = row;
    }
  }
  return { layer, drawn, source };
}

export function sunlight({ W, H, top, s0, s6 }, ramp) {
  const gain = [0, 1, 2].map((c) => 1 / (ramp[6][c] - ramp[0][c]));
  const at = (ci, c) => (s6[ci * 4 + c] - s0[ci * 4 + c]) * gain[c];
  const noon = [0, 1, 2].map((c) => {
    const seen = [];
    for (let ci = 0; ci < W * H; ci += 97) if (top[ci]) seen.push(at(ci, c));
    return seen.sort((p, q) => p - q)[seen.length >> 1] ?? 1;
  });
  return { at, noon };
}
