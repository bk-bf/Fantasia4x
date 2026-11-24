export const FIELD_SIZE = 2048;
export const FIELD_IMAGE = 'ground-field.png';
export const FAR_STEP = 8;
export const FAR_SIZE = 2048 / FAR_STEP;
export const FAR_IMAGE = 'ground-far.png';
export const CELL = 32;
export const SHADE_BIAS = 3;
export const SHADE_BITS = 3;
const SHADE_MASK = (1 << SHADE_BITS) - 1;
export const RANK_SCALE = 32;
export const NO_PIECE = 255;
export const OFFSET_STEP = 8;
export const SOIL_SEED = 57;
export const GRASS_SEED = 45;
export const CANON_STEPS = 7;
export const BLOCK_W = 16;
export const BLOCK_ROWS = { soil: 0, grass: 1, pebble: 2, stone: 3, crack: 4, meta: 5 };
export const META_COLS = { soil: 13, grass: 14, amount: 15 };
export const TUFT_VARIANTS = 4;
const TUFT_STAMP = 64;
const RIM = 0.011;
const FLOWER_SPLIT = 0.5;

export const PIECES = [
  { decal: 'pebble', ramp: true },
  { decal: 'stone', ramp: true },
  { decal: 'crack', ramp: true },
  { decal: 'flower', from: 0, to: FLOWER_SPLIT },
  { decal: 'flower', from: FLOWER_SPLIT, to: 1 },
  { decal: 'clover' },
  { decal: 'leaf' },
  { decal: 'twig' },
  { decal: 'puddle' },
  { decal: 'lily' },
  { decal: 'bubble' },
  { decal: 'reedlet' },
  { decal: 'shroomlet' }
];

const TUFT = 'tuft';
const RAMP = [[0, 0, 0]];
const typesOf = (decal = '') => PIECES.flatMap((p, i) => (p.decal === decal ? [i] : []));

const LAYER = Object.assign((x = 0, y = 0) => [x, y, 0], { layer: '', ramp: RAMP, seed: 0 });
const GROUND_TEXTURE = Object.assign((x = 0, y = 0) => [x, y, 0], {
  layer: '',
  ramp: RAMP,
  seed: 0,
  soil: LAYER,
  grass: LAYER,
  amount: 0
});
const DEC = [{ 0: '', 1: 0, 2: RAMP }].slice(0, 0);

export const fieldLayers = (f = GROUND_TEXTURE) =>
  typeof f.amount === 'number'
    ? { soil: f.soil, grass: [f.grass][0], amount: f.amount }
    : f.layer === 'soil'
      ? { soil: f, grass: [LAYER].slice(1)[0], amount: -1 }
      : null;

export function kindPieces(dec = DEC) {
  const density = PIECES.map(() => 0);
  const ramps = new Map();
  let tuft = [{ density: 0, ramp: RAMP }].slice(1)[0];
  for (const { 0: decal, 1: dens, 2: ramp } of dec) {
    if (decal === TUFT) {
      tuft ??= { density: dens, ramp };
      continue;
    }
    const types = typesOf(decal);
    if (types.length === 0) throw new Error(`no field piece for decal ${decal}`);
    for (const t of types) {
      density[t] += dens / types.length;
      if (ramp && !ramps.has(t)) ramps.set(t, ramp);
    }
  }
  return { density, ramps, tuft };
}

export const rankByte = (v = 0) => NO_PIECE - Math.floor(v * RANK_SCALE);
export const densityByte = (d = 0) => Math.min(NO_PIECE, Math.round(d * RANK_SCALE));
export const coverByte = (c = 0) => Math.max(0, Math.min(255, Math.round(c * 255)));
export const amountByte = (a = 0) => (a < 0 ? 0 : coverByte(a));
export const RIM_BYTES = Math.round(RIM * 255);

export function canonRow(ramp = [[0, 0, 0]]) {
  const n = ramp.length - 1;
  const shift = CANON_STEPS - 1 - n;
  return Array.from(
    { length: CANON_STEPS },
    (_, c) => ramp[c <= 1 ? Math.min(c, n) : Math.max(1, Math.min(n, c - shift))]
  );
}

export function shadeRow(ramp = [[0, 0, 0]]) {
  const n = ramp.length - 1;
  return Array.from(
    { length: 1 << SHADE_BITS },
    (_, s) => ramp[Math.max(0, Math.min(n, n - 3 + s - SHADE_BIAS))]
  );
}

export function patternOffset(seed = 0, canonical = 0, hash = (x = 0, y = 0, z = 0) => x + y + z) {
  if (seed === canonical) return [0, 0];
  const steps = FIELD_SIZE / OFFSET_STEP;
  return [1, 2].map((axis) => Math.floor(hash(seed, axis, canonical) * steps));
}

const dot = (x = 0, y = 0, c = [0, 0, 0].slice(0, [0].length * 3)) => void [x, y, c];

const stand = () => ({
  covAt: (x = 0, y = 0) => ((x * 7 + y * 3) % 17) / 17,
  soilShade: (x = 0, y = 0, s = 0) => ((x + y + s) % 7) - 3,
  grassShade: (x = 0, y = 0, s = 0) => ((x * 3 + y + s) % 8) - 3,
  hash: (x = 0, y = 0, z = 0) => (((x * 31 + y * 17 + z * 13) % 97) + 0.5) / 97,
  decal: (kind = '', x = 0, y = 0, h = 0, ramp = [RAMP[0]].slice(0), d = dot) =>
    d(x, y, ramp.length ? ramp[0] : [h * 255, kind.length, 0])
});

function piecePalettes() {
  const markers = Array.from({ length: CANON_STEPS }, (_, i) => [i, i, i]);
  const palettes = PIECES.map(() => new Map());
  const code = (t = 0, c = [0, 0, 0]) => {
    if ('ramp' in PIECES[t]) {
      const i = markers.indexOf(c);
      if (i < 0) throw new Error(`${PIECES[t].decal} drew a colour outside its ramp`);
      return i;
    }
    const rgb = c.map((v) => Math.round(v));
    const pal = palettes[t];
    const seen = pal.get(rgb.join());
    if (seen) return seen.at;
    if (pal.size >= 1 << 4) throw new Error(`${PIECES[t].decal} needs more than 16 colours`);
    pal.set(rgb.join(), { at: pal.size, rgb });
    return pal.size - 1;
  };
  return { markers, palettes, code };
}

export function groundField(A = stand(), slots = PIECES.map(() => 1)) {
  const px = new Uint8Array(FIELD_SIZE * FIELD_SIZE * 4);
  for (let y = 0; y < FIELD_SIZE; y++)
    for (let x = 0; x < FIELD_SIZE; x++) {
      const i = (y * FIELD_SIZE + x) * 4;
      px[i] =
        (A.soilShade(x, y, SOIL_SEED) + SHADE_BIAS) |
        ((A.grassShade(x, y, GRASS_SEED) + SHADE_BIAS) << SHADE_BITS);
      px[i + 1] = coverByte(A.covAt(x, y));
      px[i + 2] = 0;
      px[i + 3] = NO_PIECE;
    }
  const { markers, palettes, code } = piecePalettes();
  const cells = FIELD_SIZE / CELL;
  const placed = [{ t: 0, v: 0, x: 0, y: 0, h: 0 }].slice(1);
  for (let cy = 0; cy < cells; cy++)
    for (let cx = 0; cx < cells; cx++)
      PIECES.forEach((p, t) => {
        const u = A.hash(cx, cy, 201 + t);
        for (let j = 0; j < slots[t]; j++) {
          const salt = t * 16 + j;
          const h = A.hash(cx, cy, 500 + salt);
          placed.push({
            t,
            v: j + u,
            x: cx * CELL + Math.floor(A.hash(cx, cy, 300 + salt) * CELL),
            y: cy * CELL + Math.floor(A.hash(cx, cy, 400 + salt) * CELL),
            h: p.from !== undefined && p.to !== undefined ? p.from + h * (p.to - p.from) : h
          });
        }
      });
  placed.sort((a, b) => b.v - a.v || a.t - b.t);
  const wrap = (v = 0) => ((Math.round(v) % FIELD_SIZE) + FIELD_SIZE) % FIELD_SIZE;
  for (const { t, v, x, y, h } of placed)
    A.decal(
      PIECES[t].decal,
      x,
      y,
      h,
      'ramp' in PIECES[t] ? markers : [],
      (dx = 0, dy = 0, c = RAMP[0]) => {
        if (!c) return;
        const i = (wrap(dy) * FIELD_SIZE + wrap(dx)) * 4;
        px[i + 2] = ((t + 1) << 4) | code(t, c);
        px[i + 3] = rankByte(v);
      }
    );
  return {
    px,
    palettes: palettes.map((pal) => [...pal.values()].map((e) => e.rgb))
  };
}

export function farField(px = new Uint8Array(0)) {
  const out = new Uint8Array(FAR_SIZE * FAR_SIZE * 4);
  const shades = FAR_STEP * FAR_STEP;
  for (let by = 0; by < FAR_SIZE; by++)
    for (let bx = 0; bx < FAR_SIZE; bx++) {
      let soil = 0,
        grass = 0,
        cover = 0;
      for (let y = by * FAR_STEP; y < (by + 1) * FAR_STEP; y++)
        for (let x = bx * FAR_STEP; x < (bx + 1) * FAR_STEP; x++) {
          const r = px[(y * FIELD_SIZE + x) * 4];
          soil += r & SHADE_MASK;
          grass += r >> SHADE_BITS;
          cover += px[(y * FIELD_SIZE + x) * 4 + 1];
        }
      const i = (by * FAR_SIZE + bx) * 4;
      out[i] = Math.round(soil / shades) | (Math.round(grass / shades) << SHADE_BITS);
      out[i + 1] = Math.round(cover / shades);
      out[i + 3] = NO_PIECE;
    }
  return out;
}

export const MAX_SLOTS = 7;

export function fieldSlots(kinds = [{ density: [0] }]) {
  return PIECES.map((p, t) => {
    const n = Math.ceil(Math.max(0, ...kinds.map((k) => k.density[t] ?? 0)));
    if (n > MAX_SLOTS) throw new Error(`${p.decal} is denser than the field can rank`);
    return n;
  });
}

const solid = (rgb = [0, 0, 0]) => [...rgb.map((v) => Math.round(v)), 255];

function block(rows = [[RAMP[0], [RAMP[0]][1]]]) {
  const px = new Uint8ClampedArray(BLOCK_W * rows.length * 4);
  rows.forEach((row, y) =>
    row.forEach((c, x) => {
      if (c) px.set(solid(c), (y * BLOCK_W + x) * 4);
    })
  );
  return px;
}

function stamp(draw = (d = dot) => d()) {
  const pts = new Map();
  draw((x = 0, y = 0, c = RAMP[0]) => {
    if (c) pts.set(`${Math.round(x)},${Math.round(y)}`, solid(c));
  });
  const at = [...pts.keys()].map((k) => k.split(',').map(Number));
  const x0 = Math.min(...at.map(([x]) => x)),
    y0 = Math.min(...at.map(([, y]) => y));
  const w = Math.max(...at.map(([x]) => x)) - x0 + 1,
    h = Math.max(...at.map(([, y]) => y)) - y0 + 1;
  const px = new Uint8ClampedArray(w * h * 4);
  for (const [k, c] of pts) {
    const [x, y] = k.split(',').map(Number);
    px.set(c, ((y - y0) * w + x - x0) * 4);
  }
  return { w, h, x0, y0, px };
}

export function groundKinds(GROUND = [{ id: '', f: GROUND_TEXTURE, dec: [DEC[0]].slice(0) }]) {
  return GROUND.flatMap((g) =>
    g.dec ? [{ id: g.id, f: g.f, ragged: 'ragged' in g && g.ragged ? 1 : 0, layers: fieldLayers(g.f), ...kindPieces(g.dec) }] : []
  );
}

const sprite = (w = 0, h = 0, ox = 0, oy = 0, px = new Uint8ClampedArray(0)) => ({
  w,
  h,
  ox,
  oy,
  px
});

export function groundSprites(
  A = { P: { '': RAMP }, hash: stand().hash, decal: stand().decal },
  kinds = groundKinds(),
  palettes = [RAMP],
  make = sprite,
  bare = (f = GROUND_TEXTURE) => make(f.length, 0, 0, 0, new Uint8ClampedArray(0))
) {
  const sprites = new Map();
  const zero = Array.from({ length: BLOCK_W }, () => [RAMP[0]][1]);
  const offset = (seed = 0, canonical = 0) => [...patternOffset(seed, canonical, A.hash), 0];
  sprites.set('ground/pieces', make(BLOCK_W, PIECES.length + 1, 0, 0, block([zero, ...palettes])));
  const rampName = (ramp = RAMP) => Object.entries(A.P).find(([, r]) => r === ramp)?.[0];
  const out = Object.fromEntries([['', { ramps: '' }]].slice(1));
  for (const k of kinds) {
    const meta = [...zero];
    k.density.forEach((d, t) => (meta[t] = [densityByte(d), 0, 0]));
    if (k.layers?.soil) meta[META_COLS.soil] = offset(k.layers.soil.seed, SOIL_SEED);
    if (k.layers?.grass) meta[META_COLS.grass] = offset(k.layers.grass.seed, GRASS_SEED);
    meta[META_COLS.amount] = [amountByte(k.layers?.amount ?? -1), 0, k.ragged ? 255 : 0];
    const rows = [
      k.layers?.soil ? shadeRow(k.layers.soil.ramp) : zero,
      k.layers?.grass ? shadeRow(k.layers.grass.ramp) : zero,
      ...['pebble', 'stone', 'crack'].map((d) => {
        const ramp = k.ramps.get(PIECES.findIndex((p) => p.decal === d));
        return ramp ? canonRow(ramp) : zero;
      }),
      meta
    ];
    const ramps = `ground/${k.id}/ramps`;
    sprites.set(ramps, make(BLOCK_W, rows.length, 0, 0, block(rows)));
    const bareId = `ground/${k.id}/bare`;
    if (!k.layers) sprites.set(bareId, bare(k.f));
    const tuft = k.tuft;
    const name = tuft && rampName(tuft.ramp);
    if (tuft && !name) throw new Error(`${k.id} draws tufts from an unnamed ramp`);
    const ids = Array.from({ length: name ? TUFT_VARIANTS : 0 }, (_, v) => `tuft/${name}/${v}`);
    ids.forEach((id, v) => {
      if (!tuft || sprites.has(id)) return;
      const x = TUFT_STAMP * (v + 1);
      const s = stamp((d) => A.decal(TUFT, x, TUFT_STAMP, 0, tuft.ramp, d));
      sprites.set(id, make(s.w, s.h, s.x0 - x, s.y0 - TUFT_STAMP, s.px));
    });
    out[k.id] = {
      ramps,
      ...(k.layers ? {} : { bare: bareId }),
      ...(tuft ? { tufts: { density: tuft.density, sprites: ids } } : {})
    };
  }
  return { sprites, kinds: out };
}
