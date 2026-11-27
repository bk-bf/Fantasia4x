const REED_BEDS = [1, 2, 3];
const LILY_RAFTS = [5, 6, 7, 8];
const SHORE_VARIANTS = 4;

const TILE = 32;
const FOOT_X = 16;
const FOOT_Y = 23;
const W = 112;
const H = 96;
const AX = 56;
const AY = 56;

const canvas = () => ({
  w: W,
  h: H,
  ax: AX,
  ay: AY,
  c: new Array(W * H).fill(null),
  e: new Uint8Array(W * H),
  sway: 0
});

const dot = (x = 0, y = 0, c = [0, 0, 0]) => {
  void [x, y, c];
};

const ART = {
  hash: (x = 0, y = 0, z = 0) => ((x * 31 + y * 17 + z * 13) % 97) / 97,
  mkPlant: (kind = '', seed = 0, season = '') => (void [kind, seed, season], canvas()),
  decal: (kind = '', x = 0, y = 0, h = 0, ramp = null, d = dot, winter = false) =>
    void [kind, x, y, h, ramp, d, winter]
};

function put(s = canvas(), x = 0, y = 0, c = [0, 0, 0], e = 0) {
  const px = Math.round(x),
    py = Math.round(y);
  if (!c || px < 0 || py < 0 || px >= s.w || py >= s.h) return;
  s.c[py * s.w + px] = c;
  s.e[py * s.w + px] = e;
}

function reedBed(A = ART, stalks = 1, v = 0) {
  const s = canvas();
  const feet = Array.from({ length: stalks }, (_, k) => ({
    dx:
      Math.round((A.hash(v, k, 521) - 0.5) * 0.7 * TILE) +
      Math.round((A.hash(v, k, 317) - 0.5) * 10),
    dy:
      Math.round((A.hash(v, k, 531) - 0.5) * 0.5 * TILE) +
      22 +
      Math.round(A.hash(v, k, 319) * 8) -
      FOOT_Y,
    seed: 1 + Math.floor(A.hash(v, k, 315) * 3)
  })).sort((a, b) => a.dy - b.dy);
  for (const f of feet) {
    const p = A.mkPlant('reeds', f.seed, 'summer');
    s.sway = p.sway;
    for (let j = 0; j < p.h; j++)
      for (let i = 0; i < p.w; i++)
        put(
          s,
          AX + f.dx - p.ax + i,
          AY + f.dy - p.ay + j,
          p.c[j * p.w + i],
          p.e?.[j * p.w + i] ?? 0
        );
  }
  return s;
}

function lilyRaft(A = ART, points = 5, v = 0) {
  const s = canvas();
  const at = (x = 0, y = 0, c = [0, 0, 0]) => put(s, AX + x - FOOT_X, AY + y - FOOT_Y, c);
  for (let k = 0; k < points; k++) {
    const cx =
      Math.round((A.hash(v, k, 541) - 0.5) * 0.45 * TILE) + 6 + Math.floor(A.hash(v, k, 301) * 20);
    const cy =
      Math.round((A.hash(v, k, 551) - 0.5) * 0.4 * TILE) + 6 + Math.floor(A.hash(v, k, 303) * 20);
    const pads = 1 + Math.floor(A.hash(v, k, 305) * 3);
    for (let p = 0; p < pads; p++) {
      const ox = cx + Math.round((A.hash(v + p, k, 307) - 0.5) * 16);
      const oy = cy + Math.round((A.hash(v, k + p, 309) - 0.5) * 12);
      A.decal('lily', ox, oy, A.hash(v + p, k - p, 313), null, at, false);
    }
  }
  return s;
}

export const shoreSprites = (A = ART) => [
  ...REED_BEDS.flatMap((n) =>
    Array.from({ length: SHORE_VARIANTS }, (_, v) => ({
      id: `plant/reedbed/${n}/${v}`,
      sprite: reedBed(A, n, v)
    }))
  ),
  ...LILY_RAFTS.flatMap((n) =>
    Array.from({ length: SHORE_VARIANTS }, (_, v) => ({
      id: `plant/lilies/${n}/${v}`,
      sprite: lilyRaft(A, n, v)
    }))
  )
];
