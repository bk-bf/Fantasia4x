const NEEDLE = ['#2e1e12', '#402a18', '#553820', '#6b4a2a', '#825e36'];
const GREY_SOIL = ['#2a2622', '#3a342e', '#4c443a', '#5e5548', '#726857'];
const GREY_GRASS = ['#3a3a2c', '#4c4c38', '#626046', '#7a7656', '#928c68'];
const SCORCH = ['#100c0c', '#1a1312', '#261a17', '#34231d', '#463024'];
const ASH = ['#5e5a52', '#7a756a', '#959082', '#aea897', '#c6c0ae'];
const RUST = ['#3c1d12', '#5a2a15', '#7c3c18', '#9e531d', '#bb6d26'];
const SLAG = ['#1c1d22', '#2a2c33', '#3a3d44', '#4d5158', '#62676c'];
const MOON = ['#27335e', '#3d4d7e', '#5f72a0', '#8c9cc0', '#bcc8dc', '#e6ecf2'];
const HEX = ['#1a1220', '#241a2a', '#302436', '#3e3042', '#4e3e50'];
const RIME = ['#5d8fa0', '#86b4bf', '#b0d2d6', '#d4e8e8', '#f2fafa'];
const TURF = ['#344d26', '#47632c', '#5f7a34', '#7a923f', '#93a84a'];

/** @type {Record<string, Record<string, any>>} */
export const TREE_GROUND_KINDS = {
  oak: {
    bed: 'litter',
    herb: { ramp: 'oak', amount: 0.7 },
    fleck: { shape: 'leaf', bed: 0.2, out: 0.05, cols: [['litter', 4], ['litter', 3], ['fallOrange', 2]] },
    props: [['cushion', 3, 6, 'foot', 0, 'moss'], ['fern', 2, 5, 0.7, 1.4], ['gtuft', 5, 10, 'rim', 0, 'oak'], ['shroom', 1, 3, 0.5, 1.2], ['twig', 1, 2, 0.6, 1.4]],
    roots: { n: [5, 9], moss: 'moss' },
    autumn: { fall: 'fallOrange', carpet: 0.55 },
    winter: 'buried'
  },
  ash: {
    bed: 'litter',
    herb: { ramp: 'oak', amount: 0.7 },
    fleck: { shape: 'leaf', bed: 0.16, out: 0.04, cols: [['litter', 4], ['soilPoor', 4], ['litter', 3]] },
    props: [['cushion', 2, 5, 'foot', 0, 'moss'], ['fern', 3, 5, 0.7, 1.4], ['gtuft', 4, 9, 'rim', 0, 'oak'], ['twig', 1, 2, 0.6, 1.4]],
    roots: { n: [4, 8], moss: 'moss' },
    autumn: { fall: 'fallYellow', carpet: 0.5 },
    winter: 'buried'
  },
  birch: {
    gain: 0.9,
    bed: 'soilPoor',
    herb: { ramp: 'grassLoam', amount: 0.62 },
    fleck: { shape: 'leaf', bed: 0.2, out: 0.07, cols: [['fallYellow', 3], ['fallYellow', 4], ['birch', 4]] },
    props: [['gtuft', 6, 10, 'rim', 0, 'grassLoam'], ['cushion', 1, 3, 'foot', 0, 'olive'], ['shroom', 1, 2, 0.5, 1.1, 'red']],
    roots: { n: [3, 6] },
    autumn: { fall: 'fallYellow', carpet: 0.6 },
    winter: 'buried'
  },
  apple: {
    gain: 0.95,
    bed: TURF,
    remap: true,
    core: 'litter',
    fleck: { shape: 'leaf', bed: 0.05, out: 0.0, cols: [['grassLoam', 4], ['grassLoam', 3]] },
    props: [['apple', 5, 8, 0.45, 1.5], ['flower', 3, 4, 0.8, 1.5, 'white'], ['gtuft', 3, 6, 'rim', 0, 'grass']],
    roots: { n: [3, 6] },
    autumn: { fall: 'fallRed', carpet: 0.25, props: [['apple', 9, 14, 0.4, 1.6]] },
    winter: 'buried'
  },
  willow: {
    gain: 1.05,
    bed: 'mud',
    tint: { mode: 'wet', reach: 0.24 },
    herb: { ramp: 'mossSwamp', amount: 0.82 },
    fleck: { shape: 'leaf', bed: 0.06, out: 0.02, cols: [['willow', 4], ['willow', 3]] },
    props: [['sedge', 5, 8, 0.6, 1.6, 'mossSwamp'], ['puddle', 1, 2, 0.8, 1.3], ['cushion', 2, 4, 'foot', 0, 'olive'], ['gtuft', 4, 8, 'rim', 0, 'mossSwamp']],
    roots: { n: [4, 7] },
    autumn: { fall: 'fallYellow', carpet: 0.3 },
    winter: 'buried',
    winterProps: [['sedge', 4, 6, 0.6, 1.5, 'savanna'], ['ice', 1, 2, 0.8, 1.3]]
  },
  pine: {
    bed: NEEDLE,
    hard: true,
    fleck: { shape: 'needle', bed: 0.34, out: 0.05, cols: [[NEEDLE, 4], [NEEDLE, 3], ['fallOrange', 3]] },
    props: [['cone', 4, 7, 0.5, 1.4], ['twig', 2, 3, 0.6, 1.4], ['gtuft', 2, 5, 'rim', 0, 'grassDry']],
    roots: { n: [4, 7] },
    winter: 'well'
  },
  yew: {
    bed: 'soilRich',
    hard: true,
    herb: { ramp: 'oak', amount: 0.36, low: 1 },
    fleck: { shape: 'needle', bed: 0.2, out: 0.03, cols: [['pine', 4], ['pine', 3], ['red', 3]] },
    props: [['berry', 3, 5, 0.4, 1.3], ['cushion', 2, 4, 'foot', 0, 'moss'], ['fern', 1, 2, 0.8, 1.4], ['gtuft', 3, 6, 'rim', 0, 'moss']],
    roots: { n: [5, 8], moss: 'moss' },
    winter: 'well'
  },
  dead: {
    gain: 0.8,
    bed: GREY_SOIL,
    tint: { mode: 'remap', ramp: GREY_GRASS, reach: 0.12 },
    herb: { ramp: GREY_GRASS, amount: 0.45 },
    fleck: { shape: 'leaf', bed: 0.07, out: 0.02, cols: [['woodGrey', 4], ['woodGrey', 3]] },
    props: [['branch', 2, 4, 0.6, 1.5, 'woodGrey'], ['twig', 2, 3, 0.5, 1.4], ['gtuft', 3, 6, 'rim', 0, 'savanna'], ['shroom', 1, 2, 0.4, 1]],
    roots: { n: [3, 6] },
    winter: 'buried'
  },
  heartwood: {
    bed: 'preta',
    herb: { ramp: 'heart', amount: 0.66, low: 2 },
    fleck: { shape: 'leaf', bed: 0.1, out: 0.03, cols: [['heart', 4], ['heart', 3]] },
    props: [['cushion', 3, 7, 'foot', 0, 'heart'], ['flower', 4, 9, 0.6, 1.5, 'heart'], ['fern', 2, 4, 0.8, 1.5, 'heartFern'], ['gtuft', 3, 7, 'rim', 0, 'moss']],
    roots: { n: [5, 10], vein: ['heart', 5] },
    winter: 'well'
  },
  frostheart: {
    bed: RIME,
    hard: true,
    crack: { col: ['frost', 3] },
    tint: { mode: 'rime', reach: 0.13 },
    fleck: { shape: 'glint', bed: 0.06, out: 0.02, cols: [['snow', 4]] },
    props: [['crystal', 4, 9, 0.5, 1.5, 'frost']],
    roots: { n: [4, 8], cap: ['snow', 4] },
    winter: 'ice'
  },
  moonwood: {
    bed: 'soilRich',
    herb: { ramp: MOON, amount: 0.7, low: 1 },
    fleck: { shape: 'glint', bed: 0.04, out: 0.02, cols: [[MOON, 5]] },
    props: [['cushion', 3, 7, 'foot', 0, 'moon'], ['flower', 4, 9, 0.6, 1.6, 'moon'], ['shroom', 2, 4, 0.5, 1.3, 'moon'], ['gtuft', 2, 5, 'rim', 0, 'moss']],
    roots: { n: [4, 8], vein: [MOON, 4] },
    winter: 'buried',
    glow: '#cfe0f6'
  },
  ironwood: {
    bed: SLAG,
    hard: true,
    moss: { ramp: RUST, amount: 0.55, base: 1 },
    fleck: { shape: 'glint', bed: 0.03, out: 0.0, cols: [['iron', 5]] },
    props: [['stone', 4, 9, 0.5, 1.5, 'iron'], ['shard', 2, 4, 0.6, 1.4, 'iron']],
    roots: { n: [6, 10], straight: true },
    winter: 'well',
    stain: RUST
  },
  emberwood: {
    gain: 1.05,
    bed: SCORCH,
    hard: true,
    crack: { col: ['ember', 4], hot: ['fire', 3] },
    tint: { mode: 'remap', ramp: 'grassDry', reach: 0.16 },
    fleck: { shape: 'leaf', bed: 0.1, out: 0.03, cols: [[ASH, 2], [ASH, 3]] },
    props: [['coal', 4, 9, 0.5, 1.4], ['branch', 1, 3, 0.6, 1.4, 'furDark'], ['gtuft', 4, 8, 'rim', 0, 'savanna']],
    roots: { n: [4, 8], vein: ['ember', 4] },
    winter: 'melt'
  },
  soulwood: {
    bed: GREY_SOIL,
    tint: { mode: 'wet', reach: 0.14 },
    herb: { ramp: 'soul', amount: 0.7, low: 1 },
    fleck: { shape: 'glint', bed: 0.04, out: 0.02, cols: [['soul', 5]] },
    props: [['cushion', 3, 7, 'foot', 0, 'soul'], ['bell', 4, 9, 0.6, 1.6, 'soul'], ['sedge', 3, 5, 0.7, 1.5, 'soulSedge']],
    roots: { n: [4, 8], vein: ['soul', 4] },
    winter: 'buried',
    glow: '#c4ece2'
  },
  witchwood: {
    bed: HEX,
    tint: { mode: 'hex', reach: 0.14 },
    herb: { ramp: 'witch', amount: 0.4, low: 1 },
    fleck: { shape: 'leaf', bed: 0.05, out: 0.0, cols: [['witch', 4], ['witch', 3]] },
    props: [['shroom', 2, 4, 0.4, 0.8, 'witch'], ['cushion', 2, 4, 'foot', 0, 'witch']],
    ring: { type: 'shroom', n: [8, 15], r: [1.25, 1.2], tone: 'witch' },
    roots: { n: [5, 9] },
    winter: 'well'
  },
  bonewood: {
    bed: ASH,
    hard: true,
    crack: { col: [ASH, 0] },
    tint: { mode: 'remap', ramp: GREY_GRASS, reach: 0.2 },
    fleck: { shape: 'leaf', bed: 0.03, out: 0.0, cols: [['bone', 5]] },
    props: [['bone', 4, 9, 0.5, 1.5], ['skull', 0, 1, 0.9, 1.2], ['gtuft', 2, 4, 'rim', 0, 'savanna']],
    roots: { n: [4, 8] },
    winter: 'buried',
    stain: ASH
  }
};

export const SOIL_CLASS = {
  grass: 'g',
  deep_grass: 'g',
  tall_grass: 'g',
  savanna: 'g',
  terra_preta: 'g',
  dirt: 's',
  mud: 'm',
  clay: 'c',
  riverbank: 'a',
  quicksand: 'a',
  mineral_deposit: 'r',
  cave: 'r',
  bog: 'b',
  mossy_ground: 'o',
  moss: 'o',
  shallow_water: 'w',
  water: 'w'
};

export const SOILS = {
  g: { gain: 1, grassy: true },
  o: { gain: 0.86, grassy: true },
  s: { gain: 1 },
  m: { gain: 0.92 },
  c: { gain: 0.86 },
  a: { gain: 0.76, dry: true },
  r: { gain: 0.72, dry: true },
  b: { gain: 0.6, wet: true },
  w: { gain: 0 }
};

const PLANTS = new Set(['fern', 'tuft', 'gtuft', 'cushion', 'flower', 'apple', 'berry', 'sedge', 'puddle', 'bell']);
const THIRSTY = new Set(['fern', 'tuft', 'cushion', 'flower', 'sedge', 'bell', 'puddle', 'shroom']);
const PROP_VARIANTS = 6;
const ROOT_VARIANTS = { mature: 4, elder: 2 };
const TUFT_VARIANTS = 4;
const LEAFY = new Set([3, 4, 5, 7]);
const ROOT_SALT = 211;
const PROP_SALT = 307;
const SNOW_SALT = 409;

const hash = (x = 0, y = 0, z = 0) => {
  let n = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1274126177);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};

const rng = (a = 0, b = 0) => {
  let n = 0;
  return () => hash(a, b * 977 + ++n, PROP_SALT);
};

const rgbOf = (h = '#000000') => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hexOf = (c = [0, 0, 0]) =>
  '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const lum = (c = [0, 0, 0]) => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
const dim = (c = [0, 0, 0], k = 1) => [c[0] * k, c[1] * k, c[2] * k];

/** @typedef {number[][]} Ramp */
/** @typedef {[number, number, number[], number?][]} Pixels */

/** @param {Record<string, Ramp>} P */
function palette(P) {
  /** @param {string | string[]} r */
  const rampOf = (r) => (Array.isArray(r) ? r.map(rgbOf) : P[r]);
  /** @param {string | string[]} r @param {number} i */
  const C = (r, i) => {
    const ramp = rampOf(r);
    return ramp ? ramp[Math.max(0, Math.min(ramp.length - 1, i))] : undefined;
  };
  return { rampOf, C };
}

/** @param {Pixels} px @param {() => number} rand @param {Ramp} ramp @param {number} count @param {number} tall @param {number} spread @param {number[] | null | undefined} heads */
function blades(px, rand, ramp, count, tall, spread, heads) {
  for (let i = 0; i < count; i++) {
    const u = count === 1 ? 0 : (i / (count - 1)) * 2 - 1,
      lean = u * spread + (rand() - 0.5) * 0.3,
      len = Math.round(tall * (1 - Math.abs(u) * 0.35) * (0.8 + rand() * 0.3));
    for (let j = 0; j <= len; j++) {
      const f = j / len,
        x = Math.round(u * 1.5 + lean * j * 0.55 + lean * f * f * 2);
      px.push([x, -j, ramp[j === len ? 2 : f < 0.35 ? 0 : 1]]);
    }
    if (heads && rand() < 0.6) px.push([Math.round(u * 1.5 + lean * len * 0.55 + lean * 2), -len - 1, heads]);
  }
}

/** @param {Pixels} px @param {number[]} col @param {boolean} around @returns {Pixels} */
function rimmed(px, col, around) {
  const seen = new Set(px.map((p) => `${p[0]},${p[1]}`));
  /** @type {Pixels} */
  const edge = [];
  const sides = around ? [[0, 1], [-1, 0], [1, 0], [0, -1]] : [[0, 1], [-1, 0], [1, 0]];
  for (const p of px)
    for (const [dx, dy] of sides) {
      const k = `${p[0] + dx},${p[1] + dy}`;
      if (seen.has(k)) continue;
      seen.add(k);
      edge.push([p[0] + dx, p[1] + dy, col]);
    }
  return edge.concat(px);
}

/** @param {Pixels} px @param {Ramp} ramp @param {number} angle @param {number} len */
function frond(px, ramp, angle, len) {
  const dx = Math.cos(angle),
    dy = Math.sin(angle);
  for (let j = 0; j <= len; j++) {
    const f = j / len,
      x = Math.round(dx * j),
      y = Math.round(dy * j + f * f * len * 0.34);
    px.push([x, y, ramp[f > 0.7 ? 2 : 1]]);
    if (j > 0 && j < len - 1) {
      px.push([x, y - 1, ramp[j % 2 ? 2 : 1]]);
      if (j % 2 === 0) px.push([x, y + 1, ramp[0]]);
    }
  }
}

/** @param {(r: string | string[], i: number) => number[] | undefined} C */
function makers(C) {
  /** @param {string | string[]} r @param {number} i */
  const c = (r, i) => C(r, i) ?? [0, 0, 0];
  /** @type {Record<string, (c: typeof C) => Ramp>} */
  const TONES = {
    moss: () => [c('moss', 0), c('moss', 2), c('moss', 3), c('moss', 5)],
    olive: () => [c('mossSwamp', 0), c('mossSwamp', 1), c('mossSwamp', 2), c('mossSwamp', 4)],
    heart: () => [c('heart', 0), c('heart', 2), c('heart', 3), c('heart', 5)],
    moon: () => [[39, 51, 94], [95, 114, 160], [140, 156, 192], [230, 236, 242]],
    soul: () => [c('soul', 0), c('soul', 2), c('soul', 3), c('soul', 5)],
    witch: () => [c('witch', 0), c('witch', 2), c('witch', 3), c('witch', 5)]
  };
  /** @type {Record<string, (r: () => number, tone: string) => Pixels>} */
  const MAKE = {
    fern(r, tone) {
      const ramp = tone === 'heartFern' ? [c('heart', 1), c('heart', 2), c('heart', 4)] : [c('grass', 1), c('grass', 3), c('grass', 5)];
      /** @type {Pixels} */
      const px = [];
      const n = 6 + Math.floor(r() * 2);
      for (let i = 0; i < n; i++) frond(px, ramp, -Math.PI * (0.06 + (0.88 * i) / (n - 1)) + (r() - 0.5) * 0.16, 6 + Math.floor(r() * 4));
      return rimmed(px, [ramp[0][0] * 0.42, ramp[0][1] * 0.42, ramp[0][2] * 0.5], false);
    },
    cushion(r, tone) {
      const ramp = (TONES[tone] ?? TONES.moss)(C);
      /** @type {Pixels} */
      const px = [];
      const n = 1 + Math.floor(r() * 2.5);
      for (let k = 0; k < n; k++) {
        const ox = Math.round((k - (n - 1) / 2) * 5 + (r() - 0.5) * 2),
          oy = Math.round((r() - 0.5) * 3),
          rx = 3 + Math.floor(r() * 3),
          ry = 2 + Math.floor(r() * 1.6);
        for (let y = -ry; y <= ry; y++)
          for (let x = -rx; x <= rx; x++) {
            const q = (x * x) / ((rx + 0.4) * (rx + 0.4)) + (y * y) / ((ry + 0.4) * (ry + 0.4));
            if (q > 1) continue;
            const lit = -x / rx - (y / ry) * 1.3;
            px.push([ox + x, oy + y - ry, ramp[lit > 0.9 ? 3 : lit > -0.2 ? 2 : 1]]);
          }
      }
      return rimmed(px, [ramp[0][0] * 0.6, ramp[0][1] * 0.6, ramp[0][2] * 0.66], false);
    },
    sedge(r, tone) {
      const ramp = tone === 'soulSedge' ? [c('soul', 1), c('soul', 3), c('soul', 4)] : tone === 'savanna' ? [c('savanna', 1), c('savanna', 3), c('savanna', 5)] : [c('mossSwamp', 0), c('mossSwamp', 2), c('mossSwamp', 4)];
      /** @type {Pixels} */
      const px = [];
      blades(px, r, ramp, 6 + Math.floor(r() * 3), 10, 0.42, tone === 'soulSedge' ? c('soul', 5) : c('wood', 3));
      return px;
    },
    shroom(r, tone) {
      const cap = tone === 'red' ? [c('red', 2), c('red', 3), c('red', 4)] : tone === 'moon' ? [C('moon', 3) ?? [106, 127, 168], [200, 212, 232], [244, 248, 252]] : tone === 'witch' ? [c('witch', 3), C('purple', 3) ?? c('witch', 5), c('witch', 5)] : [c('litter', 2), c('litter', 4), c('plank', 4)];
      const stem = tone === 'witch' ? [214, 204, 222] : [222, 214, 190];
      const big = r() < 0.5;
      /** @type {Pixels} */
      const px = [];
      const w = big ? 2 : 1;
      for (let x = -w; x <= w; x++) px.push([x, big ? -3 : -2, cap[x === -w ? 2 : x === w ? 0 : 1]]);
      if (big) for (let x = -1; x <= 1; x++) px.push([x, -4, cap[x < 0 ? 2 : 1]]);
      px.push([0, big ? -2 : -1, stem], [0, big ? -1 : 0, dim(stem, 0.8)]);
      if (big) px.push([0, 0, dim(stem, 0.7)]);
      if (tone === 'red' && big) px.push([0, -4, [240, 236, 226]]);
      return rimmed(px, [24, 18, 16], false);
    },
    twig(r) {
      const w = [c('wood', 1), c('wood', 3)];
      /** @type {Pixels} */
      const px = [];
      const len = 6 + Math.floor(r() * 5),
        slope = (r() - 0.5) * 0.7,
        dir = r() < 0.5 ? -1 : 1;
      for (let j = 0; j < len; j++) px.push([dir * j, Math.round(slope * j), w[1]], [dir * j, Math.round(slope * j) + 1, dim(w[0], 0.8)]);
      const k = 2 + Math.floor(r() * (len - 4));
      px.push([dir * (k + 1), Math.round(slope * k) - 1, w[1]], [dir * (k + 2), Math.round(slope * k) - 2, w[1]]);
      return px;
    },
    branch(r, tone) {
      const R = tone ?? 'woodGrey';
      const w = [c(R, 1), c(R, 3), C(R, 4) ?? c(R, 3)];
      /** @type {Pixels} */
      const px = [];
      const len = 11 + Math.floor(r() * 7),
        slope = (r() - 0.5) * 0.5,
        dir = r() < 0.5 ? -1 : 1;
      for (let j = 0; j < len; j++) {
        const y = Math.round(slope * j);
        px.push([dir * j, y - 1, w[2]], [dir * j, y, w[1]], [dir * j, y + 1, dim(w[0], 0.75)]);
      }
      for (const k of [Math.floor(len * 0.35), Math.floor(len * 0.7)]) {
        const y = Math.round(slope * k);
        for (let j = 1; j <= 3; j++) px.push([dir * (k + j), y - 1 - j, w[1]]);
      }
      return px;
    },
    cone(r) {
      const w = [c('wood', 1), c('wood', 3), c('wood', 5)];
      const lie = r() < 0.5;
      /** @type {Pixels} */
      const flat = [[-2, -2, w[2]], [-1, -2, w[2]], [0, -2, w[1]], [1, -2, w[1]], [-2, -1, w[2]], [-1, -1, w[1]], [0, -1, w[2]], [1, -1, w[1]], [2, -1, w[0]], [-1, 0, w[1]], [0, 0, w[0]], [1, 0, w[0]]];
      /** @type {Pixels} */
      const stood = [[0, -4, w[2]], [-1, -3, w[2]], [0, -3, w[1]], [1, -3, w[0]], [-1, -2, w[1]], [0, -2, w[2]], [1, -2, w[0]], [-1, -1, w[2]], [0, -1, w[1]], [1, -1, w[0]], [0, 0, w[0]]];
      return rimmed(lie ? flat : stood, [22, 14, 10], false);
    },
    apple(r) {
      const pick = r();
      const a = pick < 0.55 ? [c('red', 1), c('red', 3), c('red', 4)] : pick < 0.8 ? [c('fallYellow', 2), c('fallYellow', 4), c('fallYellow', 5)] : [c('grassLoam', 2), c('grassLoam', 4), c('birchLeaf', 5)];
      return rimmed([[-1, -2, a[2]], [0, -2, a[1]], [-1, -1, a[1]], [0, -1, a[1]], [1, -1, a[0]], [-1, 0, a[0]], [0, 0, a[0]], [1, -2, a[1]], [1, 0, a[0]]], [30, 20, 18], true);
    },
    berry(r) {
      const b = [c('red', 2), c('red', 4)];
      /** @type {Pixels} */
      const px = [];
      for (let i = 0; i < 3; i++) {
        const x = Math.round((r() - 0.5) * 7),
          y = Math.round((r() - 0.5) * 4);
        px.push([x, y, b[1]], [x + 1, y, b[0]]);
      }
      return px;
    },
    flower(r, tone) {
      const petal = tone === 'heart' ? c('heart', 5) : tone === 'moon' ? [244, 238, 188] : [240, 236, 224];
      const eye = tone === 'heart' ? [255, 236, 248] : tone === 'moon' ? [255, 252, 226] : c('gold', 3);
      const stem = tone === 'heart' ? c('heart', 2) : tone === 'moon' ? [68, 86, 136] : c('grass', 3);
      const h = 2 + Math.floor(r() * 2);
      /** @type {Pixels} */
      const px = [];
      for (let j = 0; j < h; j++) px.push([0, -j, stem]);
      px.push([0, -h - 1, eye], [-1, -h - 1, petal], [1, -h - 1, petal], [0, -h - 2, petal], [0, -h, petal]);
      return px;
    },
    bell(r) {
      const stem = c('soul', 2),
        glow = c('soul', 5),
        mid = c('soul', 4);
      const h = 4 + Math.floor(r() * 3),
        side = r() < 0.5 ? -1 : 1;
      /** @type {Pixels} */
      const px = [];
      for (let j = 0; j < h; j++) px.push([0, -j, stem]);
      px.push([side, -h, stem], [side * 2, -h + 1, glow], [side * 2, -h + 2, mid], [side, -h + 1, mid]);
      return px;
    },
    crystal(r) {
      const f = [c('frost', 2), c('frost', 4), c('frost', 5), c('snow', 4)];
      /** @type {Pixels} */
      const px = [];
      const shards = 1 + Math.floor(r() * 2.4);
      for (let s = 0; s < shards; s++) {
        const x0 = (s - (shards - 1) / 2) * 3,
          h = 4 + Math.floor(r() * 5),
          lean = r() < 0.5 ? -1 : 1;
        for (let j = 0; j < h; j++) {
          const x = Math.round(x0 + (lean * j) / 4);
          px.push([x, -j, f[2]], [x + 1, -j, f[j > h - 3 ? 1 : 0]]);
        }
        px.push([Math.round(x0 + (lean * h) / 4), -h, f[3]]);
      }
      return px;
    },
    stone(r, tone) {
      const R = tone ?? 'rock';
      const s = [c(R, 1), c(R, 3), c(R, 5)];
      const w = 2 + Math.floor(r() * 2);
      /** @type {Pixels} */
      const px = [];
      for (let x = -w; x <= w; x++) {
        if (Math.abs(x) < w) px.push([x, -2, s[x < 0 ? 2 : 1]]);
        px.push([x, -1, s[x < 0 ? 1 : 0]], [x, 0, dim(s[0], 0.7)]);
      }
      return px;
    },
    shard(r) {
      const s = [c('iron', 1), c('iron', 3), c('iron', 6)];
      const h = 4 + Math.floor(r() * 3),
        lean = r() < 0.5 ? -1 : 1;
      /** @type {Pixels} */
      const px = [];
      for (let j = 0; j < h; j++) {
        const x = Math.round((lean * j) / 2);
        px.push([x, -j, s[2]], [x + 1, -j, s[1]]);
        if (j < h - 2) px.push([x + 2, -j, s[0]]);
      }
      return px;
    },
    coal(r) {
      const hot = [c('ember', 4), c('fire', 3)];
      const cold = [[14, 10, 10], [34, 24, 22]];
      const w = 1 + Math.floor(r() * 2);
      /** @type {Pixels} */
      const px = [];
      for (let x = -w; x <= w; x++) px.push([x, -1, cold[1]], [x, 0, cold[0]]);
      px.push([0, -1, hot[r() < 0.5 ? 0 : 1]]);
      if (w > 1) px.push([-1, 0, hot[0]]);
      return px;
    },
    bone(r) {
      const b = [c('bone', 2), c('bone', 4), c('bone', 5)];
      const len = 5 + Math.floor(r() * 4),
        slope = (r() - 0.5) * 0.8,
        dir = r() < 0.5 ? -1 : 1;
      /** @type {Pixels} */
      const px = [];
      for (let j = 0; j < len; j++) px.push([dir * j, Math.round(slope * j), b[1]], [dir * j, Math.round(slope * j) + 1, dim(b[0], 0.75)]);
      px.push([0, -1, b[2]], [dir * (len - 1), Math.round(slope * (len - 1)) - 1, b[2]], [-dir, 0, b[2]], [dir * len, Math.round(slope * (len - 1)), b[2]]);
      return px;
    },
    skull() {
      const b = [c('bone', 2), c('bone', 4), c('bone', 5)];
      const d = [30, 26, 24];
      return [[-2, -4, b[2]], [-1, -4, b[2]], [0, -4, b[2]], [1, -4, b[1]], [-3, -3, b[2]], [-2, -3, b[2]], [-1, -3, b[2]], [0, -3, b[1]], [1, -3, b[1]], [2, -3, b[0]], [-3, -2, b[2]], [-2, -2, d], [-1, -2, b[1]], [0, -2, d], [1, -2, b[1]], [2, -2, b[0]], [-2, -1, b[1]], [-1, -1, b[1]], [0, -1, b[1]], [1, -1, b[0]], [-2, 0, b[0]], [-1, 0, d], [0, 0, b[0]], [1, 0, d]];
    },
    puddle(r) {
      const s = [c('shallow', 1), c('shallow', 3), c('shallow', 5)];
      /** @type {Pixels} */
      const px = [];
      const rx = 6 + Math.floor(r() * 4),
        ry = 2 + Math.floor(r() * 2);
      for (let y = -ry; y <= ry; y++)
        for (let x = -rx; x <= rx; x++) {
          const q = (x * x) / (rx * rx) + (y * y) / (ry * ry) + (r() - 0.5) * 0.18;
          if (q > 1) continue;
          px.push([x, y, q > 0.72 ? dim(s[0], 0.75) : y < 0 && x < 0 && q < 0.3 ? s[2] : s[1]]);
        }
      return px;
    },
    ice(r) {
      const s = [C('ice', 1) ?? [148, 180, 198], C('ice', 2) ?? [188, 211, 220], [236, 246, 248]];
      /** @type {Pixels} */
      const px = [];
      const rx = 6 + Math.floor(r() * 4),
        ry = 2 + Math.floor(r() * 2);
      for (let y = -ry; y <= ry; y++)
        for (let x = -rx; x <= rx; x++) {
          const q = (x * x) / (rx * rx) + (y * y) / (ry * ry) + (r() - 0.5) * 0.18;
          if (q > 1) continue;
          px.push([x, y, q > 0.72 ? s[0] : x === y * 2 ? s[2] : s[1]]);
        }
      return px;
    }
  };
  return MAKE;
}

/**
 * @param {() => number} r
 * @param {number} foot
 * @param {{ n: number[], moss?: string, vein?: [string | string[], number], cap?: [string, number], straight?: boolean }} spec
 * @param {Ramp} bark
 * @param {(r: string | string[], i: number) => number[] | undefined} C
 * @param {boolean} elder
 * @returns {Pixels}
 */
function roots(r, foot, spec, bark, C, elder) {
  /** @type {Pixels} */
  const px = [];
  const n = spec.n[elder ? 1 : 0];
  const body = [bark[1], bark[2], bark[3] ?? bark[2]];
  for (let i = 0; i < n; i++) {
    const u = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
    const a = Math.PI * (0.5 - u * 0.56) + (r() - 0.5) * 0.24;
    const len = (elder ? 26 + r() * 46 : 9 + r() * 12) * (1 - Math.abs(u) * 0.12);
    let x = Math.cos(a) * foot * 0.86,
      y = Math.sin(a) * foot * 0.22 - 1;
    let dir = a;
    const wide = elder ? 3.4 : 2.2;
    const bend = spec.straight ? 0.04 : 0.3;
    for (let j = 0; j < len; j++) {
      const f = j / len;
      dir += (r() - 0.5) * bend;
      x += Math.cos(dir);
      y += Math.sin(dir) * 0.55;
      const w = Math.max(1, Math.round(wide * (1 - f * 0.85)));
      for (let k = 0; k < w; k++) {
        const top = k === 0;
        let c = top ? body[2] : k === w - 1 && w > 1 ? body[0] : body[1];
        if (top && spec.cap) c = C(spec.cap[0], spec.cap[1]) ?? c;
        if (top && spec.moss && r() < 0.34 && f < 0.7) c = C(spec.moss, 3) ?? c;
        if (spec.vein && w > 1 && k === 1 && (j & 3) !== 3) c = C(spec.vein[0], spec.vein[1]) ?? c;
        px.push([Math.round(x), Math.round(y) + k, c]);
      }
      px.push([Math.round(x), Math.round(y) + w, dim(body[0], 0.55), 1]);
      if (elder && j > len * 0.45 && r() < 0.04) {
        let bx = x,
          by = y;
        const bd = dir + (r() < 0.5 ? -0.8 : 0.8);
        for (let q = 0; q < 8 + r() * 10; q++) {
          bx += Math.cos(bd);
          by += Math.sin(bd) * 0.55;
          px.push([Math.round(bx), Math.round(by), body[1]], [Math.round(bx), Math.round(by) + 1, dim(body[0], 0.55), 1]);
        }
      }
    }
  }
  return px;
}

/** @param {Pixels} px */
export function pixelSprite(px) {
  const xs = px.map((p) => p[0]),
    ys = px.map((p) => p[1]);
  const x0 = Math.min(...xs),
    y0 = Math.min(...ys);
  const w = Math.max(...xs) - x0 + 1,
    h = Math.max(...ys) - y0 + 1;
  /** @type {(number[] | null)[]} */
  const c = Array.from({ length: w * h }, () => null);
  for (const [x, y, col] of px) c[(y - y0) * w + (x - x0)] = col.map((v) => Math.round(Math.max(0, Math.min(255, v))));
  return { w, h, ax: -x0, ay: -y0, c };
}

/** @param {{ w: number, h: number, ax: number, ay: number, c: (number[] | null)[], kind?: Uint8Array }} s */
export function treeFoot(s) {
  let x0 = s.w,
    x1 = 0;
  for (let y = Math.max(0, s.ay - 3); y <= Math.min(s.h - 1, s.ay); y++)
    for (let x = 0; x < s.w; x++) {
      const i = y * s.w + x;
      if (s.c[i] && !LEAFY.has(s.kind?.[i] ?? 0)) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
      }
    }
  return x1 < x0 ? 4 : Math.max(3, Math.round((x1 - x0 + 1) / 2));
}

/** @param {{ w: number, h: number, ay: number, c: (number[] | null)[], kind?: Uint8Array }} s */
function barkOf(s) {
  const seen = new Map();
  for (let y = Math.max(0, s.ay - 14); y < Math.min(s.h, s.ay + 1); y++)
    for (let x = 0; x < s.w; x++) {
      const i = y * s.w + x;
      const c = s.c[i];
      if (!c || LEAFY.has(s.kind?.[i] ?? 0)) continue;
      const k = hexOf(c);
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
  return [...seen.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([k]) => rgbOf(k))
    .sort((a, b) => lum(a) - lum(b));
}

/** @param {[string, number, number, number | string, number, string?][]} list @param {'summer' | 'autumn' | 'winter'} season @param {typeof TREE_GROUND_KINDS.oak & { winterProps?: typeof TREE_GROUND_KINDS.willow.winterProps }} k */
function seasonProps(list, season, k) {
  const fall = /** @type {{ props?: typeof list } | undefined} */ (k.autumn);
  let out = season === 'autumn' && fall?.props ? list.filter((p) => !fall.props?.some((q) => q[0] === p[0])).concat(fall.props) : list.slice();
  if (season === 'winter') out = k.winterProps ?? (k.winter === 'buried' ? out.filter((p) => !PLANTS.has(p[0])) : out.filter((p) => p[0] !== 'apple' && p[0] !== 'puddle'));
  return out;
}

const ramp = (/** @type {Ramp | undefined} */ r) => (r ? r.map(hexOf) : null);

/**
 * @param {Record<string, Ramp>} P
 * @param {Map<string, { kind: string, mature?: { c: (number[] | null)[], w: number, h: number, ax: number, ay: number, kind?: Uint8Array }, elder?: { c: (number[] | null)[], w: number, h: number, ax: number, ay: number, kind?: Uint8Array } }>} species
 * @param {(px: Pixels) => unknown} make
 * @param {[number, number]} grassShift
 */
export function treeGround(P, species, make, grassShift) {
  const { rampOf, C } = palette(P);
  const MAKE = makers(C);
  /** @type {Map<string, unknown>} */
  const sprites = new Map();
  /** @param {string} type @param {string | undefined} tone */
  const propIds = (type, tone) => {
    if (type === 'gtuft') return Array.from({ length: TUFT_VARIANTS }, (_, v) => `tuft/${tone}/${v}`);
    const key = tone ? `${type}/${tone}` : type;
    const ids = Array.from({ length: PROP_VARIANTS }, (_, v) => `treeground/${key}/${v}`);
    ids.forEach((id, v) => {
      if (!sprites.has(id)) sprites.set(id, make(MAKE[type](rng(v + 1, type.length * 31 + (tone?.length ?? 0)), tone ?? '')));
    });
    return ids;
  };
  /** @param {[string, number, number, number | string, number, string?][]} list */
  const props = (list) =>
    list.map(([type, mature, elder, r0, r1, tone]) => ({
      sprites: propIds(type, tone),
      mature,
      elder,
      at: r0 === 'rim' || r0 === 'foot' ? r0 : 'spread',
      r0: typeof r0 === 'number' ? r0 : 0,
      r1,
      thirsty: THIRSTY.has(type)
    }));
  const kinds = Object.entries(TREE_GROUND_KINDS).map(([name, kk], index) => {
    const k = /** @type {typeof TREE_GROUND_KINDS.oak & Record<string, any>} */ (kk);
    const made = species.get(name);
    const bark = made?.mature ? barkOf(made.mature) : [];
    const barkRamp = bark.length >= 4 ? bark : P.wood;
    const rootSet = Object.fromEntries(
      /** @type {const} */ (['mature', 'elder']).flatMap((age) => {
        const s = made?.[age];
        if (!s) return [];
        const foot = treeFoot(s);
        const bySeason = Object.fromEntries(
          /** @type {const} */ (['summer', 'winter']).map((season) => [
            season,
            Array.from({ length: ROOT_VARIANTS[age] }, (_, v) => {
              const id = `treeground/roots/${name}/${age}/${season}/${v}`;
              let n = 0;
              const r = () => hash(index * 16 + v, ++n, ROOT_SALT + (age === 'elder' ? 1 : 0));
              const px = roots(r, foot, k.roots, barkRamp, C, age === 'elder');
              if (season === 'winter' && (k.winter === 'buried' || k.winter === 'ice')) {
                let m = 0;
                const s2 = () => hash(index * 16 + v, ++m, SNOW_SALT);
                for (const p of px) if (!p[3] && s2() < 0.5 && p[2] !== barkRamp[1]) p[2] = P.snow[4];
              }
              sprites.set(id, make(px));
              return id;
            })
          ])
        );
        return [[age, bySeason]];
      })
    );
    const fleckCols = k.fleck.cols.map((/** @type {[string | string[], number]} */ [r, i]) => hexOf(C(r, i) ?? [0, 0, 0]));
    return {
      name,
      gain: k.gain ?? 1,
      hard: Boolean(k.hard),
      winter: k.winter,
      props: {
        summer: props(seasonProps(k.props, 'summer', k)),
        autumn: props(seasonProps(k.props, 'autumn', k)),
        winter: props(seasonProps(k.props, 'winter', k))
      },
      ...(k.ring ? { ring: { sprites: propIds(k.ring.type, k.ring.tone), n: k.ring.n, r: k.ring.r } } : null),
      roots: rootSet,
      look: {
        bed: ramp(rampOf(k.bed)),
        remap: Boolean(k.remap),
        core: k.core ? ramp(rampOf(k.core)) : null,
        herb: k.herb ? { ramp: ramp(rampOf(k.herb.ramp)), amount: k.herb.amount, low: k.herb.low ?? 0 } : null,
        tint: k.tint ? { mode: k.tint.mode, reach: k.tint.reach, ramp: k.tint.ramp ? ramp(rampOf(k.tint.ramp)) : null } : null,
        fleck: { shape: k.fleck.shape, bed: k.fleck.bed, out: k.fleck.out, cols: fleckCols },
        fall: k.autumn ? { ramp: ramp(P[k.autumn.fall]), carpet: k.autumn.carpet } : null,
        moss: k.moss ? { ramp: ramp(rampOf(k.moss.ramp)), amount: k.moss.amount, base: k.moss.base ?? 2 } : null,
        crack: k.crack ? { col: hexOf(C(k.crack.col[0], k.crack.col[1]) ?? [0, 0, 0]), hot: k.crack.hot ? hexOf(C(k.crack.hot[0], k.crack.hot[1]) ?? [0, 0, 0]) : null } : null,
        glow: k.glow ?? null,
        stain: k.stain ? ramp(rampOf(k.stain)) : null
      }
    };
  });
  return {
    sprites,
    manifest: {
      kinds,
      soils: Object.fromEntries(Object.entries(SOIL_CLASS).map(([id, c]) => [id, c])),
      classes: SOILS,
      shared: { snow: ramp(P.snow), frost: ramp(P.frost), mud: ramp(P.mud), ice: ramp(P.ice) },
      grassShift
    }
  };
}
