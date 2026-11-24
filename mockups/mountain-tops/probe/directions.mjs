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

const clampTo = (v, a, b) => (v < a ? a : v > b ? b : v);

function facets(ctx, field, size, seed, stretch) {
  const { A, FW, FH, foot } = ctx;
  const cols = Math.ceil(FW / size) + 5,
    rows = Math.ceil(FH / size) + 5;
  const px = new Float32Array(cols * rows),
    py = new Float32Array(cols * rows);
  for (let cy = 0; cy < rows; cy++)
    for (let cx = 0; cx < cols; cx++) {
      px[cy * cols + cx] = (cx - 2 + A.hash(cx, cy, seed)) * size;
      py[cy * cols + cx] = (cy - 2 + A.hash(cx, cy, seed + 7)) * size;
    }
  const site = new Int32Array(FW * FH);
  const at = (x, y) => field[clampTo(y, 0, FH - 1) * FW + clampTo(x, 0, FW - 1)];
  each(ctx, (x, y, i) => {
    if (!foot[i]) return;
    const gx = at(x + 4, y) - at(x - 4, y),
      gy = at(x, y + 4) - at(x, y - 4),
      g = Math.hypot(gx, gy);
    const ux = g > 0.4 ? gx / g : 1,
      uy = g > 0.4 ? gy / g : 0,
      k = g > 0.4 ? stretch : 1;
    const cx = Math.floor(x / size) + 2,
      cy = Math.floor(y / size) + 2;
    let best = 1e9,
      pick = 0;
    for (let j = -2; j <= 2; j++)
      for (let q = -2; q <= 2; q++) {
        const c = (cy + j) * cols + cx + q;
        const dx = x - px[c],
          dy = y - py[c];
        const along = (dx * ux + dy * uy) / k,
          across = dx * uy - dy * ux;
        const m = along * along + across * across;
        if (m < best) {
          best = m;
          pick = c;
        }
      }
    site[i] = clampTo(Math.round(py[pick]), 0, FH - 1) * FW + clampTo(Math.round(px[pick]), 0, FW - 1);
  });
  return site;
}

function drainage(ctx, height, N) {
  const { A, FW, FH, foot, box } = ctx;
  const route = new Float32Array(FW * FH);
  const BINS = 4096;
  const count = new Int32Array(BINS + 1);
  const bin = (v) => clampTo(Math.floor(v * 6) + 64, 0, BINS - 1);
  each(ctx, (x, y, i) => {
    if (!foot[i]) return;
    route[i] = height[i] + N.noise(x / 16, y / 16, 211) * 4 + A.hash(x, y, 213) * 0.4;
    count[bin(route[i]) + 1]++;
  });
  for (let k = 0; k < BINS; k++) count[k + 1] += count[k];
  const order = new Int32Array(count[BINS]);
  each(ctx, (x, y, i) => {
    if (foot[i]) order[count[bin(route[i])]++] = i;
  });
  const flow = new Float32Array(FW * FH);
  const near = [-FW - 1, -FW, -FW + 1, -1, 1, FW - 1, FW, FW + 1];
  for (let n = order.length - 1; n >= 0; n--) {
    const i = order[n],
      x = i % FW,
      y = (i - x) / FW;
    flow[i] += 1;
    if (x <= box.x0 || x >= box.x1 - 1 || y <= box.y0 || y >= box.y1 - 1) continue;
    let low = route[i],
      to = -1;
    for (const d of near) {
      const j = i + d,
        v = foot[j] ? route[j] : -1;
      if (v < low) {
        low = v;
        to = j;
      }
    }
    if (to >= 0 && foot[to]) flow[to] += flow[i];
  }
  return flow;
}

function crags(ctx, N, soft, o) {
  const { A, FW, FH, foot, dist } = ctx;
  const size = FW * FH;
  const wide = ctx.blur(soft, FW, FH, 5, 2);
  const big = facets(ctx, wide, o.face, 301, 2.3),
    chip = facets(ctx, wide, o.chip, 311, 1.7),
    stone = facets(ctx, new Float32Array(size), 5, 321, 1);
  const height = new Float32Array(size);
  each(ctx, (x, y, i) => {
    if (!foot[i]) return;
    const shift = A.hash(big[i], 1, 303) * o.bench;
    const q = (soft[i] + shift) / o.bench,
      whole = Math.floor(q);
    const stepped = (whole + smooth(0.36, 0.64, q - whole)) * o.bench - shift;
    const h = soft[i] + (stepped - soft[i]) * o.cliff * smooth(16, 60, soft[i]);
    height[i] = Math.max(0, Math.min(h, dist[i] * o.steep));
  });
  const flow = drainage(ctx, soft, N);
  const channel = new Float32Array(size);
  each(ctx, (x, y, i) => {
    if (foot[i] && flow[i] > o.gully) channel[i] = Math.min(1, 0.35 + Math.log2(flow[i] / o.gully) / 5);
  });
  const fan = ctx.blur(channel, FW, FH, 7, 2),
    groove = ctx.blur(channel, FW, FH, 1, 2);
  const cut = (i) => groove[i] > o.groove;
  const { shadow } = light(ctx, height, { from: o.from, reach: 2, steps: 18, stride: 3, rise: 0.8, soft: 4 });
  const L = o.from,
    ln = Math.hypot(...L),
    flat = L[2] / ln;
  const at = (x, y) => wide[clampTo(y, 0, FH - 1) * FW + clampTo(x, 0, FW - 1)];
  const slopeAt = (j) => {
    const x = j % FW,
      y = (j - x) / FW;
    return [(at(x + 6, y) - at(x - 6, y)) / 12, (at(x, y + 6) - at(x, y - 6)) / 12];
  };
  const lambert = new Float32Array(size),
    steep = new Float32Array(size),
    tone = new Float32Array(size),
    kind = new Uint8Array(size);
  each(ctx, (x, y, i) => {
    if (!foot[i]) return;
    const b = big[i],
      c = chip[i];
    const [bx, by] = slopeAt(b),
      [cx, cy] = slopeAt(c);
    const gx = bx * 0.6 + cx * 0.4 + (A.hash(b, 2, 303) - 0.5) * o.jag + (A.hash(c, 2, 313) - 0.5) * o.jag * 0.6,
      gy = by * 0.6 + cy * 0.4 + (A.hash(b, 3, 303) - 0.5) * o.jag + (A.hash(c, 3, 313) - 0.5) * o.jag * 0.6;
    lambert[i] = (-gx * L[0] - gy * L[1] + L[2]) / (Math.hypot(gx, gy, 1) * ln) - flat;
    steep[i] = Math.min(1, Math.hypot(bx, by) / 0.75);
  });
  const S = { rock: 0, snow: 1, scree: 2, gully: 3 };
  each(ctx, (x, y, i) => {
    if (!foot[i]) return;
    const l = lambert[i],
      h = height[i];
    let t = o.key + (l > 0 ? l * o.lit : l * o.dim) + (A.hash(chip[i], 4, 313) - 0.5) * 0.07;
    if (shadow[i] > 0.55) t -= o.cast;
    const layer = (h + A.hash(big[i], 5, 305) * 16 + N.noise(x / 90, y / 90, 81) * 14 + x * 0.05) / o.strata,
      bed = Math.floor(layer);
    if (steep[i] > 0.3) {
      t += (A.hash(bed, 0, 307) - 0.5) * 0.2;
      if (layer - bed < 1.2 / o.strata && A.hash(bed, Math.floor(x / 43), 309) > 0.5) t -= 0.17;
    }
    t = Math.round(clampTo(t, 0.26, 0.95) * 6) / 6;
    const apron = o.scree * (0.35 + 1.2 * N.fbm(x / 60, y / 60, 91, 2)) + fan[i] * 60;
    if (dist[i] + (A.dith(x, y) - 0.5) * 7 < apron && soft[i] < 34) {
      const s = stone[i];
      t = 0.4 + A.hash(s, 6, 323) * 0.34 + (A.hash(s, 7, 323) > 0.86 ? 0.14 : 0);
      if (stone[i - 1] !== s || stone[i - FW] !== s) t += 0.1;
      else if (stone[i + 1] !== s || stone[i + FW] !== s) t -= 0.2;
      kind[i] = S.scree;
    } else if (cut(i)) {
      t = cut(i - 1) ? Math.min(t - 0.17, 0.34) : 0.17;
      kind[i] = S.gully;
    } else if (cut(i - 1)) t += 0.17;
    tone[i] = t;
    if (!ctx.snow || kind[i] === S.scree) return;
    const line = o.snowLine + (N.fbm(x / 70, y / 70, 71, 2) - 0.5) * 36;
    const held = kind[i] === S.gully;
    const cover = h + Math.min(0, l) * 46 - steep[i] * 22 + (held ? o.couloir : 0) + (A.hash(big[i], 8, 303) - 0.5) * 22 - line;
    if (cover <= 0) return;
    kind[i] = S.snow;
    tone[i] = Math.round(clampTo(0.72 + l * 1.5 - (shadow[i] > 0.55 ? 0.22 : 0) - (held ? 0.14 : 0), 0, 1) * 4) / 4;
  });
  const edged = Float32Array.from(tone);
  const cell = (i) => big[i] * 31 + chip[i];
  each(ctx, (x, y, i) => {
    if (!foot[i] || kind[i] !== S.rock) return;
    const me = cell(i);
    const west = foot[i - 1] && cell(i - 1) !== me,
      north = foot[i - FW] && cell(i - FW) !== me;
    if ((west && tone[i] > tone[i - 1] + 0.05) || (north && tone[i] > tone[i - FW] + 0.05)) {
      edged[i] = tone[i] + 0.12;
      return;
    }
    const east = foot[i + 1] && cell(i + 1) !== me,
      south = foot[i + FW] && cell(i + FW) !== me;
    const other = east ? cell(i + 1) : south ? cell(i + FW) : me;
    if (other !== me && A.hash(Math.min(me, other), Math.max(me, other), 315) > 0.45) edged[i] = tone[i] - 0.17;
  });
  const colour = (x, y, r, k, span) => {
    const i = y * FW + x;
    if (span >= 5 && k > 0 && kind[i] !== S.scree) {
      const e = height[i] - k;
      const layer = (e + A.hash(big[i], 5, 305) * 16 + N.noise(x / 90, y / 90, 81) * 14 + x * 0.05) / o.strata,
        bed = Math.floor(layer);
      let t = 0.36 - (k / span) * 0.14 + lambert[i] * 0.5 + (N.noise(x / 3, e / 60, 331) - 0.5) * 0.34 + (A.hash(bed, 0, 307) - 0.5) * 0.16;
      if (layer - bed < 1.2 / o.strata && A.hash(bed, Math.floor(x / 43), 309) > 0.55) t -= 0.2;
      if (k === span - 1) t -= 0.12;
      if (kind[i] === S.snow && span < 12) return A.rp(A.P.snow, tone[i] - (span >= 9 ? 0.25 : 0), x, r, 0.3);
      return A.rp(A.P.rock, Math.round(clampTo(t, 0.08, 0.8) * 6) / 6, x, r, 0.3);
    }
    const lip = span >= 5 ? 0.17 : 0;
    if (kind[i] === S.snow) return A.rp(A.P.snow, tone[i], x, r, 0.3);
    const edge = rim(ctx, x, y);
    return A.rp(A.P.rock, edged[i] + lip + (edge > 0 ? 0.2 : edge < 0 ? -0.18 : 0), x, r, 0.3);
  };
  return { height, colour };
}

function peaks(ctx) {
  const N = noises(ctx.A.hash);
  const soft = rangeHeight(ctx, N, { warp: 64, top: 190, slope: 0.6, massif: 84, steep: 0.88, soften: 3 });
  return crags(ctx, N, soft, {
    from: [-1, 0.15, 1.15],
    steep: 0.88,
    face: 44,
    chip: 16,
    bench: 30,
    cliff: 0.7,
    jag: 0.5,
    gully: 90,
    groove: 0.12,
    strata: 13,
    scree: 16,
    key: 0.5,
    lit: 1.2,
    dim: 0.8,
    cast: 0.17,
    snowLine: 150,
    couloir: 60
  });
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
