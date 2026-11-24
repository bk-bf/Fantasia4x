const smooth = (a, b, v) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function noises(hash) {
  const mix = (a, b, t) => a + (b - a) * t;
  const noise = (x, y, s) => {
    const xi = Math.floor(x),
      yi = Math.floor(y);
    let xf = x - xi,
      yf = y - yi;
    xf = xf * xf * (3 - 2 * xf);
    yf = yf * yf * (3 - 2 * yf);
    return mix(
      mix(hash(xi, yi, s), hash(xi + 1, yi, s), xf),
      mix(hash(xi, yi + 1, s), hash(xi + 1, yi + 1, s), xf),
      yf
    );
  };
  const fbm = (x, y, s, o) => {
    let a = 0.5,
      f = 1,
      v = 0,
      n = 0;
    for (let i = 0; i < o; i++) {
      v += a * noise(x * f, y * f, s + i * 17);
      n += a;
      a *= 0.5;
      f *= 2;
    }
    return v / n;
  };
  const ridged = (x, y, s) => 1 - Math.abs(2 * noise(x, y, s) - 1);
  return { noise, fbm, ridged };
}

function each(ctx, fn) {
  const { box, FW } = ctx;
  for (let y = box.y0; y < box.y1; y++)
    for (let x = box.x0; x < box.x1; x++) fn(x, y, y * FW + x);
}

function light(ctx, height, o) {
  const { FW, FH, foot } = ctx;
  const lambert = new Float32Array(FW * FH),
    shadow = new Float32Array(FW * FH);
  const L = o.from;
  const ln = Math.hypot(...L);
  const flat = L[2] / ln;
  const ground = Math.hypot(L[0], L[1]);
  const ux = L[0] / ground,
    uy = L[1] / ground;
  const at = (x, y) => height[Math.max(0, Math.min(FH - 1, y)) * FW + Math.max(0, Math.min(FW - 1, x))];
  each(ctx, (x, y, i) => {
    if (!foot[i]) return;
    const gx = (at(x + o.reach, y) - at(x - o.reach, y)) / (2 * o.reach),
      gy = (at(x, y + o.reach) - at(x, y - o.reach)) / (2 * o.reach);
    lambert[i] = (-gx * L[0] - gy * L[1] + L[2]) / (Math.hypot(gx, gy, 1) * ln) - flat;
    const h0 = height[i];
    let dark = 0;
    for (let k = 1; k <= o.steps; k++) {
      const sx = Math.round(x + k * o.stride * ux),
        sy = Math.round(y + k * o.stride * uy);
      if (sx < 0 || sy < 0 || sx >= FW || sy >= FH) break;
      const over = height[sy * FW + sx] - (h0 + k * o.stride * o.rise);
      if (over > 0) dark = Math.max(dark, Math.min(1, over / o.soft));
    }
    shadow[i] = dark;
  });
  return { lambert, shadow };
}

function rim(ctx, x, y) {
  const { FW, foot } = ctx;
  const i = y * FW + x;
  if (!foot[i - FW] || !foot[i - 1]) return 1;
  if (!foot[i + 1]) return -1;
  return 0;
}

function rangeHeight(ctx, N, o) {
  const { FW, FH, dist, foot, nearX, nearY } = ctx;
  const raw = new Float32Array(FW * FH);
  each(ctx, (x, y, i) => {
    if (!foot[i]) return;
    const d = dist[i];
    const sx = Math.max(0, Math.min(FW - 1, Math.round(x + (N.fbm(x / 110, y / 110, 31, 2) - 0.5) * o.warp))),
      sy = Math.max(0, Math.min(FH - 1, Math.round(y + (N.fbm(x / 110, y / 110, 37, 2) - 0.5) * o.warp)));
    const j = sy * FW + sx;
    const dw = Math.min(foot[j] ? dist[j] : 0, d * 1.7 + 8) * 0.65 + d * 0.35;
    const bx = nearX[j] + (N.noise(x / 46, y / 46, 91) - 0.5) * 30,
      by = nearY[j] + (N.noise(x / 46, y / 46, 93) - 0.5) * 30;
    const s1 = N.ridged(bx / 82, by / 82, 61),
      s2 = N.ridged(bx / 33, by / 33, 67);
    const spur = 0.6 * s1 * s1 + 0.4 * s2;
    const crest = 0.5 + 1.0 * N.fbm(x / 300, y / 300, 21, 2);
    const wx = x + (N.fbm(x / 140, y / 140, 131, 2) - 0.5) * 90,
      wy = y + (N.fbm(x / 140, y / 140, 137, 2) - 0.5) * 90;
    const deep = smooth(90, 230, d);
    const r1 = N.ridged(wx / 170, wy / 170, 41),
      r3 = N.ridged(x / 37, y / 37, 53);
    const flank = o.top * Math.tanh((dw * o.slope) / o.top);
    const h = flank * (0.55 + 0.65 * spur) * crest + deep * crest * o.massif * r1 * r1 + smooth(4, 40, d) * 7 * r3 * r3;
    raw[i] = Math.min(h, d * o.steep);
  });
  return ctx.blur(raw, FW, FH, o.soften, 2);
}

function shade(ctx, N, raw, o) {
  const { A, FW, FH, foot } = ctx;
  const { lambert, shadow } = light(ctx, raw, { from: o.from, reach: 2, steps: 18, stride: 3, rise: 0.8, soft: 10 });
  const fine = ctx.blur(raw, FW, FH, 3, 2);
  const wide = ctx.blur(raw, FW, FH, 14, 2);
  const tone = new Float32Array(FW * FH);
  const white = new Float32Array(FW * FH);
  each(ctx, (x, y, i) => {
    if (!foot[i]) return;
    const h = raw[i];
    const l = lambert[i];
    const south = raw[Math.max(0, i - FW * 2)] - raw[Math.min(FW * FH - 1, i + FW * 2)];
    const steep = Math.min(1, Math.hypot(raw[i + 2] - raw[i - 2], south) / 3.2);
    let t = o.key + (l > 0 ? l * o.lit : l * o.dim) - shadow[i] * o.cast;
    t += Math.max(-0.4, Math.min(0.4, south)) * o.front;
    t = Math.max(o.floor, t);
    t += Math.max(-0.1, Math.min(0.16, (h - fine[i]) * 0.09));
    t -= Math.max(0, Math.min(0.08, (wide[i] - h) * 0.006));
    t += (ctx.grain(x, y) - 0.6) * o.grain * (1 - steep * 0.5);
    const band = (h + N.noise(x / 40, y / 40, 81) * 10) / 6.5;
    if (band - Math.floor(band) < 0.2 && N.noise(x / 55, y / 23, 83) > 0.38) t -= 0.09 * steep;
    tone[i] = Math.max(0.17, Math.min(0.93, t));
    if (!ctx.snow) return;
    const line = o.snowLine + (N.fbm(x / 70, y / 70, 71, 2) - 0.5) * 36 + (N.noise(x / 9, y / 9, 73) - 0.5) * 14;
    white[i] = h + Math.min(0, l) * 50 - steep * 16 + (h - fine[i]) * 4 - line;
  });
  const S = A.P.snow;
  return (x, y, r) => {
    const i = y * FW + x;
    if (white[i] > 0) {
      const t = 0.66 + lambert[i] * 1.5 - shadow[i] * 0.3 + (raw[i] - fine[i]) * 0.06 + (ctx.grain(x, y) - 0.6) * 0.18 + Math.min(0.1, white[i] * 0.005);
      return A.rp(S, t, x, r, 0.45);
    }
    const edge = rim(ctx, x, y);
    return A.rp(A.P.rock, tone[i] + (edge > 0 ? 0.24 : edge < 0 ? -0.2 : 0), x, r, 0.5);
  };
}

function ridgelines(ctx) {
  const N = noises(ctx.A.hash);
  const raw = rangeHeight(ctx, N, { warp: 64, top: 150, slope: 0.66, massif: 70, steep: 9, soften: 2 });
  const colour = shade(ctx, N, raw, { from: [-1, -0.25, 1.15], key: 0.55, lit: 1.05, dim: 0.74, cast: 0.07, front: 0.1, grain: 0.24, floor: 0.3, snowLine: 142 });
  return { height: new Float32Array(ctx.FW * ctx.FH), colour };
}

function peaks(ctx) {
  const N = noises(ctx.A.hash);
  const raw = rangeHeight(ctx, N, { warp: 64, top: 190, slope: 0.6, massif: 84, steep: 0.88, soften: 3 });
  const colour = shade(ctx, N, raw, { from: [-1, 0.15, 1.15], key: 0.54, lit: 1.0, dim: 0.72, cast: 0.07, front: 0.2, grain: 0.3, floor: 0.3, snowLine: 150 });
  return { height: raw, colour };
}

const STEP = 24;
const TOP_TIER = 4;

function tiers(ctx) {
  const { A, FW, FH, dist, foot } = ctx;
  const N = noises(A.hash);
  const level = new Uint8Array(FW * FH);
  const raw = new Float32Array(FW * FH);
  const fields = Array.from({ length: TOP_TIER }, () => new Float32Array(FW * FH));
  each(ctx, (x, y, i) => {
    if (!foot[i]) return;
    const d = dist[i];
    const crest = 0.5 + 1.0 * N.fbm(x / 300, y / 300, 21, 2);
    const crag = N.ridged(x / 150, y / 150, 141);
    const set = 30 + N.fbm(x / 90, y / 90, 145, 2) * 44;
    const body = (0.2 + 1.0 * N.fbm(x / 190, y / 190, 143, 2) + 0.5 * crag * crag) * crest * smooth(50, 200, d);
    fields[0][i] = smooth(set, set + 26, d);
    for (let k = 1; k < TOP_TIER; k++)
      fields[k][i] = (body - 0.36 - k * 0.2) * 4 + (N.fbm(x / 75, y / 75, 200 + k * 13, 2) - 0.5) * 1.1;
  });
  const calm = fields.map((f) => ctx.blur(f, FW, FH, 6, 2));
  each(ctx, (x, y, i) => {
    if (!foot[i]) return;
    const jag = (N.noise(x / 19, y / 19, 147) - 0.5) * 0.2 + (N.noise(x / 7, y / 7, 149) - 0.5) * 0.08;
    const cap = Math.floor((dist[i] - 8) / (STEP * 1.1));
    let k = 0;
    while (k < TOP_TIER && k < cap && calm[k][i] + jag > 0.5) k++;
    level[i] = k;
    raw[i] = k * STEP;
  });
  const { shadow } = light(ctx, raw, { from: [-1, -0.3, 1], reach: 1, steps: 10, stride: 2, rise: 1.1, soft: 4 });
  const S = A.P.snow;
  return {
    height: raw,
    colour(x, y, r, k, span) {
      const i = y * FW + x;
      const lv = level[i];
      if (span >= 5 && lv > 0) {
        let c = A.rockFace(x, r, k, span);
        if (level[i - 1] < lv) c = A.lit(c, 1.14);
        else if (level[i + 1] < lv) c = A.dark(c, 0.72);
        if (k === span - 1) c = A.dark(c, 0.6);
        return c;
      }
      const up = !foot[i - FW] || level[i - FW] < lv,
        left = !foot[i - 1] || level[i - 1] < lv,
        right = !foot[i + 1] || level[i + 1] < lv;
      const edge = up || left ? 0.26 : right ? -0.2 : 0;
      const g = ctx.grain(x, y);
      const drift = N.fbm(x / 60, y / 60, 71, 2) + (N.noise(x / 6, y / 6, 75) - 0.5) * 0.06;
      if (ctx.snow && lv >= TOP_TIER - 1 && !right && drift + (lv - TOP_TIER) * 0.3 > 0.34)
        return A.rp(S, 0.6 + (g - 0.6) * 0.5 + (N.fbm(x / 34, y / 34, 77, 2) - 0.5) * 0.5 - shadow[i] * 0.4 + edge, x, r, 0.45);
      return A.rp(A.P.rock, g - 0.07 + lv * 0.075 - shadow[i] * 0.2 + edge, x, r, 0.3);
    }
  };
}

export const DIRECTIONS = { a: ridgelines, b: tiers, c: peaks };
