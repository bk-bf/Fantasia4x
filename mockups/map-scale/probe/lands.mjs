import { hash, noise, fbm, smooth, distanceTo, nearestOf, patches } from './grid.mjs';

const WATER = new Set(['water', 'shallow_water', 'rapids']);
const GRASS = /_patch$|^forest_moss$|^moss$|^savanna$/;
const wet = (t) => WATER.has(t.subType);
const rock = (t) => t.terrainType === 'mountain';
const lowland = (t) => !wet(t) && !rock(t);
const boulders = (x, y, dense, sparse) => hash(x, y, 81) < (noise(x / 8, y / 8, 83) > 0.6 ? dense : sparse);
const wooded = (t) => t.terrainType === 'forest' || t.terrainType === 'deep_forest';

const POND_AREA = 700;
const KEPT_TREES = 0.56;
const AGES = [
  { share: 0.2, f: 1 },
  { share: 0.36, f: 1.5 },
  { share: 0.36, f: 2.2 },
  { share: 0.08, f: 3.1 }
];

function setGround(t, subType) {
  t.subType = subType;
  t.type = WATER.has(subType) ? 'water' : 'land';
}

function strip(t, keep = () => false) {
  for (const k of Object.keys(t.resources ?? {})) {
    if (keep(k)) continue;
    delete t.resources[k];
    if (t.growth) delete t.growth[k];
  }
}

function treeOn(t, kinds) {
  for (const k of Object.keys(t.resources ?? {})) if (t.resources[k] > 0 && kinds[k]) return k;
  return null;
}

function reedsAndLilies(world, n, pond) {
  const at = (i) => world[(i / n) | 0][i % n];
  const toLand = distanceTo(n, n, (i) => !wet(at(i)));
  const reeds = [],
    lilies = [];
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const i = y * n + x,
        t = world[y][x];
      if (!wet(t)) continue;
      const d = toLand[i],
        still = pond(i),
        bed = noise(x / 9, y / 9, 61);
      if (t.river && !still) {
        if (d <= 1.2 && bed > 0.68 && hash(x, y, 63) < 0.6) reeds.push([x, y]);
        continue;
      }
      if (still) {
        if (d <= 1.6 && hash(x, y, 63) < 0.62) reeds.push([x, y]);
        else if (d > 1.6 && d < 6 && hash(x, y, 65) < 0.13) lilies.push([x, y]);
      } else if (d <= 2.6 && bed > 0.6) {
        if (hash(x, y, 63) < 0.66) reeds.push([x, y]);
      } else if (d > 1.5 && d < 5 && bed > 0.56 && hash(x, y, 65) < 0.07) lilies.push([x, y]);
    }
  return { reeds, lilies };
}

export function bridge(source, kinds) {
  const world = structuredClone(source);
  const n = world.length;
  const at = (i) => world[(i / n) | 0][i % n];

  const lakes = patches(n, n, (i) => wet(at(i)) && !at(i).river);
  const toLake = distanceTo(n, n, (i) => lakes.id[i] >= 0);
  const toRiver = distanceTo(n, n, (i) => wet(at(i)) && Boolean(at(i).river));
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const i = y * n + x,
        t = world[y][x];
      if (!lowland(t)) continue;
      const reach = 2.4 * Math.max(0, 1 - toLake[i] / 46) + (noise(x / 5, y / 5, 71) - 0.5);
      if (toRiver[i] > reach) continue;
      setGround(t, 'shallow_water');
      t.river = true;
      strip(t);
    }

  const toShore = distanceTo(n, n, (i) => !wet(at(i)));
  const toWater = distanceTo(n, n, (i) => wet(at(i)));
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const i = y * n + x,
        t = world[y][x];
      if (t.subType === 'water' && toShore[i] < 8 + 2.5 * noise(x / 12, y / 12, 73)) setGround(t, 'shallow_water');
      if (!lowland(t)) continue;
      const beach = toLake[i] < 6 ? 3.4 * smooth(0.5, 0.74, noise(x / 15, y / 15, 75)) : 0;
      if (toWater[i] > Math.max(1.5, beach)) continue;
      if (t.subType !== 'riverbank') strip(t, (k) => Boolean(kinds[k]));
      setGround(t, 'riverbank');
    }

  const toRock = distanceTo(n, n, (i) => rock(at(i)));
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const i = y * n + x,
        t = world[y][x];
      if (!lowland(t)) continue;
      const band = 2 + 5 * noise(x / 11, y / 11, 77);
      if (toRock[i] > band + 2) continue;
      const tree = treeOn(t, kinds);
      if (tree && (toRock[i] <= 2 || hash(x, y, 79) < 0.7)) strip(t, (k) => k !== tree);
      if (toRock[i] > band) continue;
      const scree = toRock[i] <= band * 0.58 && t.subType !== 'riverbank';
      if (scree) {
        strip(t, (k) => !GRASS.test(k));
        setGround(t, 'rocky');
      }
      if (Object.keys(t.resources).length === 0 && boulders(x, y, scree ? 0.26 : 0.1, scree ? 0.03 : 0.012)) t.resources = { stone_outcrop: 5 };
    }

  const trees = [];
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const t = world[y][x];
      const tree = treeOn(t, kinds);
      if (!tree) continue;
      if (hash(x, y, 83) >= KEPT_TREES) {
        strip(t, (k) => k !== tree);
        continue;
      }
      let roll = hash(x, y, 85),
        age = 0;
      while (age < AGES.length - 1 && roll >= AGES[age].share) roll -= AGES[age++].share;
      if (age === 0) continue;
      strip(t, (k) => k !== tree);
      trees.push({ x, y, kind: kinds[tree], f: AGES[age].f * (0.92 + 0.16 * hash(x, y, 87)), seed: 1 + Math.floor(hash(x, y, 89) * 4) });
    }

  const pond = (i) => lakes.id[i] >= 0 && lakes.sizes[lakes.id[i]] < POND_AREA;
  return { world, plan: { trees, ...reedsAndLilies(world, n, pond) } };
}

const ZONES = { foothill: 35, scree: 110, alpine: 230 };
const CLIFFS = [66, 120, 172, 226, 280, 330];

export function flankHeight(x, y, n) {
  const along = (x + (n - 1 - y)) / Math.SQRT2;
  return along - (690 / 750) * n + 140 * (fbm(x / 170, y / 170, 11) - 0.5) + 32 * (fbm(x / 45, y / 45, 13) - 0.5);
}

export const snowDepth = (x, y, n) => flankHeight(x, y, n) - ZONES.alpine + 36 * (fbm(x / 26, y / 26, 15) - 0.5);

function course(points, half) {
  return { points, half };
}

function meander(from, to, turns, sway, steps, phase) {
  const dx = to[0] - from[0],
    dy = to[1] - from[1],
    len = Math.hypot(dx, dy),
    px = -dy / len,
    py = dx / len;
  const out = [];
  for (let k = 0; k <= steps; k++) {
    const t = k / steps;
    const off = sway * Math.sin(2 * Math.PI * turns * t + phase) + sway * 0.42 * Math.sin(2 * Math.PI * turns * 2.3 * t + phase * 3.1);
    out.push([from[0] + dx * t + px * off, from[1] + dy * t + py * off, t]);
  }
  return out;
}

function carve(n, { points, half }) {
  const field = new Float32Array(n * n).fill(1e9);
  for (const [cx, cy, t] of points) {
    const r = half(t),
      reach = Math.ceil(r + 9);
    for (let y = Math.max(0, Math.floor(cy - reach)); y <= Math.min(n - 1, Math.ceil(cy + reach)); y++)
      for (let x = Math.max(0, Math.floor(cx - reach)); x <= Math.min(n - 1, Math.ceil(cx + reach)); x++) {
        const d = Math.hypot(x - cx, y - cy) - r;
        if (d < field[y * n + x]) field[y * n + x] = d;
      }
  }
  return field;
}

export function trueWorld(source, kinds) {
  const n = source.length;
  const k = n / 750;
  const from = (i) => source[(i / n) | 0][i % n];
  const near = nearestOf(n, n, (i) => lowland(from(i)));
  const wall = source.flat().find((t) => t.resources?.mountain_wall > 0 && Object.keys(t.resources).length === 1 && t.subType === 'cave');
  const clampTile = (v) => Math.max(0, Math.min(n - 1, v));

  const river = carve(n, course(meander([150 * k, -12], [105 * k, 640 * k], 1.7, 58 * k, 900, 0.6), (t) => 14 + 6 * t));
  const stream = carve(n, course(meander([470 * k, 236 * k], [150 * k, 318 * k], 3.1, 15 * k, 600, 1.9), () => 1.3));
  const world = [];
  for (let y = 0; y < n; y++) {
    const row = [];
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      let src = source[y][x];
      if (!lowland(src)) {
        const jx = clampTile(x + Math.round((noise(x / 9, y / 9, 41) - 0.5) * 26)),
          jy = clampTile(y + Math.round((noise(x / 9, y / 9, 43) - 0.5) * 26));
        src = from(near[jy * n + jx]);
      }
      const t = { ...src, x, y, resources: { ...src.resources }, growth: src.growth ? { ...src.growth } : undefined };
      delete t.river;
      delete t.riverCourse;
      if (t.subType === 'riverbank') {
        strip(t);
        setGround(t, hash(x, y, 45) < 0.5 ? 'grass' : 'dirt');
      }
      const tree = treeOn(t, kinds);
      if (tree && hash(x, y, 47) >= 0.1) strip(t, (r) => r !== tree);

      const lake = Math.hypot(x, n - 1 - y) - (235 * k + 140 * (fbm(x / 120, y / 120, 21) - 0.5) + 28 * (fbm(x / 30, y / 30, 23) - 0.5));
      const pond = Math.hypot((x - 455 * k) / 14, (y - 560 * k) / 9) - 1 - 0.5 * (noise(x / 7, y / 7, 25) - 0.5);
      const e = flankHeight(x, y, n);
      if (lake < 0 || pond < 0 || (river[i] < 0 && e < ZONES.foothill) || (stream[i] < 0 && e < ZONES.scree)) {
        strip(t);
        setGround(t, 'shallow_water');
        if (lake >= 0 && pond >= 0) t.river = true;
        t.still = pond < 0;
        t.open = lake < 0;
        t.midstream = lake >= 0 && pond >= 0 && river[i] < -7.5;
      }
      t.height = e;
      row.push(t);
    }
    world.push(row);
  }

  const at = (i) => world[(i / n) | 0][i % n];
  const toShore = distanceTo(n, n, (i) => !wet(at(i)));
  const toWater = distanceTo(n, n, (i) => wet(at(i)));
  const toBroad = distanceTo(n, n, (i) => wet(at(i)) && (at(i).open || river[i] < 0));
  const toWoods = distanceTo(n, n, (i) => !wooded(at(i)) || wet(at(i)));
  const trees = [];

  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const i = y * n + x,
        t = world[y][x],
        e = t.height;
      if (wet(t)) {
        if ((t.open && toShore[i] > 15 + 5 * noise(x / 14, y / 14, 27)) || t.midstream) setGround(t, 'water');
        continue;
      }
      const sand = toBroad[i] < 8 ? 1.5 + 4.5 * smooth(0.42, 0.72, noise(x / 16, y / 16, 31)) : 1.5;
      if (toWater[i] <= sand) {
        strip(t);
        setGround(t, 'riverbank');
        continue;
      }
      if (e <= 0) continue;
      const band = CLIFFS.findIndex((c, b) => Math.abs(e - c) < 2.2 + 4 * noise(x / 23, y / 23, 100 + b) && noise(x / 58, y / 58, 150 + b) > 0.3);
      if (band >= 0) {
        world[y][x] = { ...wall, x, y, resources: { ...wall.resources }, height: e };
        continue;
      }
      const tree = treeOn(t, kinds);
      if (e <= ZONES.foothill) {
        const rubble = noise(x / 8, y / 8, 33) + noise(x / 27, y / 27, 35) * 0.5 > 1.25 - (e / ZONES.foothill) * 0.62;
        if (tree && hash(x, y, 37) < e / ZONES.foothill) strip(t, (r) => r !== tree);
        if (!rubble) continue;
        strip(t, (r) => !GRASS.test(r));
        setGround(t, 'rocky');
        if (Object.keys(t.resources).length === 0 && boulders(x, y, 0.2, 0.02)) t.resources = { stone_outcrop: 5 };
        continue;
      }
      strip(t);
      t.terrainType = 'plains';
      if (e <= ZONES.scree) {
        setGround(t, noise(x / 17, y / 17, 39) + 0.3 * noise(x / 4, y / 4, 40) > 0.97 ? 'dirt' : 'rocky');
        if (boulders(x, y, 0.2, 0.012)) t.resources = { stone_outcrop: 5 };
        else if (hash(x, y, 91) < 0.004) trees.push({ x, y, kind: 'pine', f: 1.25, seed: 1 + Math.floor(hash(x, y, 89) * 4) });
        continue;
      }
      if (e <= ZONES.alpine) {
        const turf = noise(x / 15, y / 15, 51) + 0.4 * noise(x / 5, y / 5, 53);
        setGround(t, turf < 0.5 ? 'rocky' : turf < 1.14 ? 'grass' : 'savanna');
        if (t.subType !== 'rocky' && hash(x, y, 55) < 0.3) t.resources = { grass_patch: 3 };
        else if (boulders(x, y, 0.12, 0.008)) t.resources = { stone_outcrop: 5 };
        else if (t.subType !== 'rocky' && hash(x, y, 57) < 0.02) t.resources = { wildflower_patch: 2 };
        continue;
      }
      setGround(t, 'rocky');
      if (boulders(x, y, 0.08, 0.004)) t.resources = { stone_outcrop: 5 };
    }

  const CELL = 4;
  for (let gy = 0; gy < n; gy += CELL)
    for (let gx = 0; gx < n; gx += CELL) {
      const x = Math.min(n - 1, gx + Math.floor(hash(gx, gy, 93) * CELL)),
        y = Math.min(n - 1, gy + Math.floor(hash(gx, gy, 95) * CELL));
      const t = world[y][x];
      if (!lowland(t) || t.subType === 'riverbank' || t.subType === 'rocky' || t.height > ZONES.foothill) continue;
      const stand = wooded(t) ? (t.terrainType === 'deep_forest' ? 0.95 : 0.8) : noise(x / 34, y / 34, 97) > 0.78 ? 0.5 : 0.012;
      if (hash(x, y, 99) >= stand * (1 - Math.max(0, t.height) / (ZONES.foothill + 8))) continue;
      const edge = wooded(t) ? smooth(0, 7, toWoods[y * n + x]) : 0.6;
      const mix = hash(x, y, 101);
      const conifer = noise(x / 70, y / 70, 103) > 0.6;
      const kind = toWater[y * n + x] < 9 && mix < 0.45 ? 'willow' : conifer ? (mix < 0.82 ? 'pine' : 'birch') : mix < 0.4 ? 'oak' : mix < 0.62 ? 'ash' : mix < 0.82 ? 'birch' : mix < 0.94 ? 'pine' : 'yew';
      strip(t);
      trees.push({ x, y, kind, f: (2.9 + 1.5 * edge) * (0.82 + 0.5 * hash(x, y, 87)), seed: 1 + Math.floor(hash(x, y, 89) * 4) });
    }

  const pond = (i) => Boolean(at(i).still);
  const plan = { trees, ...reedsAndLilies(world, n, pond) };
  for (const row of world)
    for (const t of row) {
      delete t.still;
      delete t.open;
      delete t.midstream;
      delete t.height;
    }
  return { world, plan };
}
