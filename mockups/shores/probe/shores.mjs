import { hash, noise, smooth, distanceTo, patches } from '../../map-scale/probe/grid.mjs';

const WATER = new Set(['water', 'shallow_water', 'rapids']);
const wet = (t) => WATER.has(t.subType);
const lowland = (t) => !wet(t) && t.terrainType !== 'mountain';

export const POND_AREA = 400;
const SHALLOWS = 8;
const SHALLOWS_WOBBLE = 2.4;
const DEEP_CORE = 3;
const TODAY_SHALLOWS = 6;
const BEACH = 3.6;
const MOUTH_REACH = 12;
const MOUTH_FLARE = 2.3;

export const beachStretch = (x, y) => smooth(0.62, 0.74, noise(x / 12, y / 12, 505));

function setGround(t, subType) {
  t.subType = subType;
  t.type = WATER.has(subType) ? 'water' : 'land';
}

function strip(t) {
  t.resources = {};
  delete t.growth;
}

function waters(world, n) {
  const at = (i) => world[(i / n) | 0][i % n];
  const still = patches(n, n, (i) => wet(at(i)) && !at(i).river);
  const sizeAt = (i) => (still.id[i] >= 0 ? still.sizes[still.id[i]] : 0);
  return { at, sizeAt, lake: (i) => sizeAt(i) >= POND_AREA, pond: (i) => sizeAt(i) > 0 && sizeAt(i) < POND_AREA };
}

export function shores(source) {
  const world = structuredClone(source);
  const n = world.length;
  const { at, lake } = waters(world, n);

  const toLake = distanceTo(n, n, lake);
  const toRiver = distanceTo(n, n, (i) => wet(at(i)) && Boolean(at(i).river));
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const i = y * n + x,
        t = world[y][x];
      if (!lowland(t) || toLake[i] > MOUTH_REACH) continue;
      const flare = MOUTH_FLARE * smooth(MOUTH_REACH, 1, toLake[i]) + (noise(x / 4, y / 4, 501) - 0.5) * 0.9;
      if (toRiver[i] > flare) continue;
      setGround(t, 'shallow_water');
      t.river = true;
      strip(t);
    }

  const toShore = distanceTo(n, n, (i) => !wet(at(i)));
  const body = patches(n, n, (i) => wet(at(i)) && !at(i).river);
  const widest = new Float32Array(body.sizes.length);
  for (let i = 0; i < n * n; i++) if (body.id[i] >= 0) widest[body.id[i]] = Math.max(widest[body.id[i]], toShore[i]);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const i = y * n + x,
        t = world[y][x];
      if (t.subType !== 'water') continue;
      const reach = Math.min(SHALLOWS + SHALLOWS_WOBBLE * noise(x / 10, y / 10, 503), Math.max(TODAY_SHALLOWS, widest[body.id[i]] - DEEP_CORE));
      if (toShore[i] < reach) setGround(t, 'shallow_water');
    }

  const after = waters(world, n);
  const toLakeWater = distanceTo(n, n, after.lake);
  const toStream = distanceTo(n, n, (i) => wet(at(i)) && Boolean(at(i).river));
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const i = y * n + x,
        t = world[y][x];
      if (!lowland(t)) continue;
      const stretch = beachStretch(x, y);
      if (stretch <= 0 || toStream[i] < 4) continue;
      const width = 1 + (BEACH - 1) * stretch + (noise(x / 3.5, y / 3.5, 507) - 0.5) * 1.4 * stretch;
      if (toLakeWater[i] > width) continue;
      setGround(t, 'riverbank');
      strip(t);
    }

  const toWater = distanceTo(n, n, (i) => wet(at(i)));
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const t = world[y][x];
      if (lowland(t) && t.subType !== 'riverbank' && toWater[y * n + x] < 1.5) setGround(t, 'riverbank');
    }
  return world;
}

export function plants(world) {
  const n = world.length;
  const { at, lake, pond } = waters(world, n);
  const toLand = distanceTo(n, n, (i) => !wet(at(i)));
  const toPond = distanceTo(n, n, pond);
  const reeds = [],
    lilies = [];
  const clump = (x, y, core) => {
    if (core < 0.06 && hash(x, y, 513) < 0.5) return;
    const stalk = (k) => [x + (hash(x, y, 521 + k) - 0.5) * 0.7, y + (hash(x, y, 531 + k) - 0.5) * 0.5];
    reeds.push(stalk(0));
    if (core > 0.1) reeds.push(stalk(1));
    if (core > 0.2) reeds.push(stalk(2));
  };
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const i = y * n + x,
        t = world[y][x];
      if (!wet(t)) continue;
      const d = toLand[i],
        bed = noise(x / 7, y / 7, 511);
      if (pond(i)) {
        if (d <= 1.6 && bed > 0.38) clump(x, y, bed - 0.38);
        else if (d > 1.6 && d < 5.5) {
          const raft = noise(x / 3.5, y / 3.5, 515) - 0.72;
          const pads = raft <= 0 ? 0 : Math.min(8, 5 + Math.floor(raft * 60));
          for (let k = 0; k < pads; k++) lilies.push([x + (hash(x, y, 541 + k) - 0.5) * 0.45, y + (hash(x, y, 551 + k) - 0.5) * 0.4]);
        }
        continue;
      }
      if (beachStretch(x, y) > 0) continue;
      if (lake(i) || (t.river && toPond[i] > 3)) {
        const reach = lake(i) ? 2.2 : 1.2;
        const from = lake(i) ? 0.56 : 0.68;
        if (d <= reach && bed > from) clump(x, y, bed - from);
      }
    }
  return { trees: [], reeds, lilies };
}
