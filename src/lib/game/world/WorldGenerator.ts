import { createNoise2D } from 'simplex-noise';
import type { WorldTile } from '../core/types';
import {
  BIOMES,
  SUBTERRAINS,
  SUBTERRAIN_FALLBACK,
  pickBiome,
  pickSubterrain,
  pickChar,
  getWaterLevel
} from '../core/defs/terrains';
import { resourceGeneratorService } from '../services/ResourceGeneratorService';
import { biomeBaseMoisture, baseMoistureFromWater } from '../services/EnvironmentService';
import { makeSeededRng } from '../core/util/rng';

const TERRAIN_FREQUENCY = 0.005;
const DETAIL_FREQUENCY = 0.05;
const TERRAIN_OCTAVES = 5;
const TERRAIN_LACUNARITY = 2.0;
const TERRAIN_GAIN = 0.6;
const WARP_FREQUENCY = 0.01;
const WARP_AMOUNT = 35;
const WATER_FREQUENCY = 0.012;

function fbm(noise2d: (x: number, y: number) => number, x: number, y: number): number {
  let value = 0,
    amplitude = 1,
    frequency = 1,
    max = 0;
  for (let i = 0; i < TERRAIN_OCTAVES; i++) {
    value +=
      noise2d(x * frequency * TERRAIN_FREQUENCY, y * frequency * TERRAIN_FREQUENCY) * amplitude;
    max += amplitude;
    amplitude *= TERRAIN_GAIN;
    frequency *= TERRAIN_LACUNARITY;
  }
  return value / max;
}

export function getRidgedNoise(
  terrainNoise2d: (x: number, y: number) => number,
  x: number,
  y: number
): number {
  return 1.0 - Math.abs(terrainNoise2d(x * TERRAIN_FREQUENCY, y * TERRAIN_FREQUENCY));
}

export function getWarpedNoise(
  terrainNoise2d: (x: number, y: number) => number,
  detailNoise2d: (x: number, y: number) => number,
  x: number,
  y: number,
  warp = 30.0
): number {
  const warpX = detailNoise2d((x + 500) * DETAIL_FREQUENCY, (y + 500) * DETAIL_FREQUENCY) * warp;
  const warpY = detailNoise2d((x - 500) * DETAIL_FREQUENCY, (y - 500) * DETAIL_FREQUENCY) * warp;
  return terrainNoise2d((x + warpX) * TERRAIN_FREQUENCY, (y + warpY) * TERRAIN_FREQUENCY);
}

export function getCombinedNoise(
  terrainNoise2d: (x: number, y: number) => number,
  detailNoise2d: (x: number, y: number) => number,
  x: number,
  y: number,
  weight = 0.5
): number {
  const t = terrainNoise2d(x * TERRAIN_FREQUENCY, y * TERRAIN_FREQUENCY);
  const d = detailNoise2d(x * DETAIL_FREQUENCY, y * DETAIL_FREQUENCY);
  return t * (1.0 - weight) + d * weight;
}

export function getTerraceNoise(
  terrainNoise2d: (x: number, y: number) => number,
  x: number,
  y: number,
  steps = 5
): number {
  const raw = terrainNoise2d(x * TERRAIN_FREQUENCY, y * TERRAIN_FREQUENCY);
  const normalized = (raw + 1.0) / 2.0;
  return (Math.floor(normalized * steps) / steps) * 2.0 - 1.0;
}

export function generateWorld(
  width: number,
  height: number,
  seed = Date.now(),
  opts?: { skipResources?: boolean; tidyWater?: boolean }
): WorldTile[][] {
  const detailSeed = (seed * 6971) >>> 0;

  const terrainNoise = createNoise2D(makeSeededRng(seed));
  const detailNoise = createNoise2D(makeSeededRng(detailSeed));
  const waterNoise = createNoise2D(makeSeededRng((seed * 7919) >>> 0));
  const waterLevel = getWaterLevel();

  const world: WorldTile[][] = [];

  for (let y = 0; y < height; y++) {
    world[y] = [];
    for (let x = 0; x < width; x++) {
      const wx = detailNoise(x * WARP_FREQUENCY + 17.3, y * WARP_FREQUENCY + 17.3) * WARP_AMOUNT;
      const wy = detailNoise(x * WARP_FREQUENCY - 17.3, y * WARP_FREQUENCY - 17.3) * WARP_AMOUNT;
      const raw = fbm(terrainNoise, x + wx, y + wy);
      const density = Math.max(0, Math.min(1, (raw + 1) / 2));

      const detail = detailNoise(x * DETAIL_FREQUENCY, y * DETAIL_FREQUENCY);

      const biomeName = pickBiome(density) ?? 'plains';
      let subTypeName = pickSubterrain(biomeName, detail);
      if (waterLevel > 0 && biomeName !== 'mountain') {
        const wv = (waterNoise((x + wx) * WATER_FREQUENCY, (y + wy) * WATER_FREQUENCY) + 1) / 2;
        if (wv < waterLevel) subTypeName = wv < waterLevel * 0.55 ? 'water' : 'shallow_water';
      }
      const sub = SUBTERRAINS[subTypeName] ?? SUBTERRAIN_FALLBACK;

      const walkable = sub.walkable;
      const movementCost = sub.movementCost;

      const legacyType =
        biomeName === 'mountain'
          ? 'mountain'
          : subTypeName === 'water' || subTypeName === 'shallow_water' || subTypeName === 'rapids'
            ? 'water'
            : biomeName === 'forest'
              ? 'forest'
              : 'land';

      world[y][x] = {
        x,
        y,
        type: legacyType as WorldTile['type'],
        discovered: true,
        ascii: pickChar(sub, x, y),
        terrainType: biomeName,
        subType: subTypeName,
        density,
        moisture: 0,
        temperature: 0,
        movementCost,
        walkable,
        blocksSight: sub.blocksSight ?? false,
        resources: {},
        territoryOwner: '',
        gCost: 0,
        hCost: 0,
        fCost: 0,
        parent: null
      };
    }
  }

  if (opts?.tidyWater !== false) tidyWaterbodies(world);

  promoteBiomeVariants(world, detailNoise);

  assignMoisture(world, detailNoise);

  if (!opts?.skipResources) resourceGeneratorService.generateResources(world, seed);

  return world;
}

const WATER_SUBS = new Set(['water', 'shallow_water', 'rapids']);
const isWaterTile = (t: WorldTile): boolean => WATER_SUBS.has(t.subType);

function setTileSubtype(t: WorldTile, subTypeName: string): void {
  const sub = SUBTERRAINS[subTypeName] ?? SUBTERRAIN_FALLBACK;
  t.subType = subTypeName;
  t.ascii = pickChar(sub, t.x, t.y);
  t.walkable = sub.walkable;
  t.movementCost = sub.movementCost;
  t.blocksSight = sub.blocksSight ?? false;
  t.type = (WATER_SUBS.has(subTypeName) ? 'water' : 'land') as WorldTile['type'];
}

function tidyWaterbodies(world: WorldTile[][]): void {
  const h = world.length;
  const w = world[0]?.length ?? 0;
  const waterAt = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < w && y < h && isWaterTile(world[y][x]);

  const comp = new Int32Array(w * h).fill(-1);
  const compSize: number[] = [];
  const compBorder: boolean[] = [];
  for (let sy = 0; sy < h; sy++) {
    for (let sx = 0; sx < w; sx++) {
      if (comp[sy * w + sx] !== -1 || isWaterTile(world[sy][sx])) continue;
      const id = compSize.length;
      let size = 0;
      let border = false;
      const flood = [sy * w + sx];
      comp[sy * w + sx] = id;
      while (flood.length) {
        const i = flood.pop() as number;
        const x = i % w;
        const y = (i / w) | 0;
        size++;
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) border = true;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const ni = ny * w + nx;
            if (comp[ni] !== -1 || isWaterTile(world[ny][nx])) continue;
            comp[ni] = id;
            flood.push(ni);
          }
        }
      }
      compSize.push(size);
      compBorder.push(border);
    }
  }
  let mainland = 0;
  for (let id = 1; id < compSize.length; id++) if (compSize[id] > compSize[mainland]) mainland = id;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const id = comp[y * w + x];
      if (id >= 0 && id !== mainland && !compBorder[id]) setTileSubtype(world[y][x], 'water');
    }
  }

  const ring: WorldTile[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = world[y][x];
      if (isWaterTile(t) || t.terrainType === 'mountain') continue;
      let touchesWater = false;
      for (let dy = -1; dy <= 1 && !touchesWater; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if ((dx || dy) && waterAt(x + dx, y + dy)) {
            touchesWater = true;
            break;
          }
        }
      }
      if (touchesWater) ring.push(t);
    }
  }
  for (const t of ring) setTileSubtype(t, 'riverbank');
}

const VARIANT_DEPTH = 5;

function promoteBiomeVariants(
  world: WorldTile[][],
  detailNoise: (x: number, y: number) => number
): void {
  const h = world.length;
  const w = world[0]?.length ?? 0;
  if (w === 0) return;

  const variantOf = new Map<string, string>();
  for (const [id, def] of Object.entries(BIOMES)) {
    if (def.parent && !variantOf.has(def.parent)) variantOf.set(def.parent, id);
  }
  if (variantOf.size === 0) return;

  const INF = 1e9;
  const ORTHO = 1;
  const DIAG = Math.SQRT2;
  const dist = new Float64Array(w * h);

  for (const [parent, variant] of variantOf) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const t = world[y][x];
        const interior =
          t.terrainType === parent &&
          !WATER_SUBS.has(t.subType) &&
          x > 0 &&
          y > 0 &&
          x < w - 1 &&
          y < h - 1;
        dist[y * w + x] = interior ? INF : 0;
      }
    }
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
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (dist[y * w + x] < VARIANT_DEPTH) continue;
        const t = world[y][x];
        t.terrainType = variant;
        const detail = detailNoise(x * DETAIL_FREQUENCY, y * DETAIL_FREQUENCY);
        const newSub = pickSubterrain(variant, detail);
        if (newSub === t.subType) continue;
        const sub = SUBTERRAINS[newSub] ?? SUBTERRAIN_FALLBACK;
        t.subType = newSub;
        t.ascii = pickChar(sub, t.x, t.y);
        t.walkable = sub.walkable;
        t.movementCost = sub.movementCost;
        t.blocksSight = sub.blocksSight ?? false;
      }
    }
  }
}

const MOISTURE_NOISE_FREQUENCY = 0.06;
const MOISTURE_NOISE_SPREAD = 8;

function assignMoisture(world: WorldTile[][], detailNoise: (x: number, y: number) => number): void {
  const h = world.length;
  const w = h > 0 ? world[0].length : 0;
  if (w === 0) return;
  const INF = 1e9;
  const ORTHO = 1;
  const DIAG = Math.SQRT2;
  const dist = new Float64Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) dist[y * w + x] = world[y][x].type === 'water' ? 0 : INF;

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

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const tile = world[y][x];
      const base = baseMoistureFromWater(biomeBaseMoisture(tile.terrainType), dist[y * w + x]);
      const jitter =
        detailNoise(x * MOISTURE_NOISE_FREQUENCY, y * MOISTURE_NOISE_FREQUENCY) *
        MOISTURE_NOISE_SPREAD;
      tile.moisture = Math.max(0, Math.min(100, Math.round(base + jitter)));
    }
  }
}
