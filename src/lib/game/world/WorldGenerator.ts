// src/lib/game/world/WorldGenerator.ts
import { createNoise2D } from 'simplex-noise';
import type { WorldTile } from '../core/types';
import {
  SUBTERRAINS,
  SUBTERRAIN_FALLBACK,
  pickBiome,
  pickSubterrain,
  pickChar,
  getWaterLevel
} from '../core/Terrains';
import { resourceGeneratorService } from '../services/ResourceGeneratorService';
import { biomeBaseMoisture, baseMoistureFromWater } from '../services/EnvironmentService';
import { makeSeededRng } from '../core/rng';

// Noise constants ported from Celestia noise_generator.gd
const TERRAIN_FREQUENCY = 0.005;
const DETAIL_FREQUENCY = 0.05;
const TERRAIN_OCTAVES = 5;
const TERRAIN_LACUNARITY = 2.0;
const TERRAIN_GAIN = 0.6;
// Domain-warp frequency for biome boundaries. MUST be in the terrain's frequency range (≈0.005), NOT
// the detail frequency (0.05): warping the large, smooth elevation field with a 10×-higher-frequency
// noise jittered mountain/biome edges every ~20 tiles → jagged, fragmented coastlines. A low-frequency
// warp displaces whole regions slowly, giving organic, smoothly-meandering mountain shapes.
const WARP_FREQUENCY = 0.01;
const WARP_AMOUNT = 35; // tiles of max displacement — bigger, sweeping meanders
// Decoupled water (see Terrains.getWaterLevel): a dedicated low-frequency field, warped like the
// elevation, pools coherent lakes/seas in any lowland biome instead of confining water to the
// swamp/river density bands. Lower frequency = larger, fewer water bodies.
const WATER_FREQUENCY = 0.012;

/**
 * Fractional Brownian Motion over a simplex noise function.
 * Matches Celestia's FastNoiseLite fractal settings.
 */
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
  return value / max; // normalise to -1..1
}

// ── Noise utility functions (ported from Celestia map_gen-refactored noise_generator.gd) ──

/** Ridged noise: sharp ridge-line features. Use for mountain peak subterrain selection. */
export function getRidgedNoise(
  terrainNoise2d: (x: number, y: number) => number,
  x: number,
  y: number
): number {
  return 1.0 - Math.abs(terrainNoise2d(x * TERRAIN_FREQUENCY, y * TERRAIN_FREQUENCY));
}

/** Domain-warped noise: organic biome edges and river course variation. */
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

/** Blended noise: linear interpolation between terrain and detail layers. Use for transition zone mixing. */
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

/** Terrace noise: stepped elevation values. Use for mesa biomes or plateau terrain. */
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

export function generateWorld(width: number, height: number, seed = Date.now()): WorldTile[][] {
  const detailSeed = (seed * 6971) >>> 0;

  // Two independent noise instances — same API as simplex-noise v4
  const terrainNoise = createNoise2D(makeSeededRng(seed));
  const detailNoise = createNoise2D(makeSeededRng(detailSeed));
  // Third independent field drives decoupled water placement (biome-agnostic lakes/seas).
  const waterNoise = createNoise2D(makeSeededRng((seed * 7919) >>> 0));
  const waterLevel = getWaterLevel();

  const world: WorldTile[][] = [];

  for (let y = 0; y < height; y++) {
    world[y] = [];
    for (let x = 0; x < width; x++) {
      // Domain-warp the elevation sampling with a LOW-frequency noise so biome boundaries (mountain
      // silhouettes, coastlines, river courses) meander organically over large spans instead of
      // jittering. (Sampling the warp at DETAIL_FREQUENCY fragmented the edges — see WARP_FREQUENCY.)
      const wx = detailNoise(x * WARP_FREQUENCY + 17.3, y * WARP_FREQUENCY + 17.3) * WARP_AMOUNT;
      const wy = detailNoise(x * WARP_FREQUENCY - 17.3, y * WARP_FREQUENCY - 17.3) * WARP_AMOUNT;
      const raw = fbm(terrainNoise, x + wx, y + wy);
      const density = Math.max(0, Math.min(1, (raw + 1) / 2));

      // Detail noise in -1..1 for subterrain selection
      const detail = detailNoise(x * DETAIL_FREQUENCY, y * DETAIL_FREQUENCY);

      const biomeName = pickBiome(density) ?? 'plains';
      // Base ground-cover only; object placement is handled later in ResourceGeneratorService
      let subTypeName = pickSubterrain(biomeName, detail);
      // Decoupled water: where the dedicated water field dips below the level, override to water,
      // regardless of biome. Mountain peaks are excluded so alpine tiles stay solid (and the
      // interior-mountain silhouette hide-logic doesn't punch "lakes" into the rock).
      if (waterLevel > 0 && biomeName !== 'mountain') {
        const wv = (waterNoise((x + wx) * WATER_FREQUENCY, (y + wy) * WATER_FREQUENCY) + 1) / 2;
        if (wv < waterLevel) subTypeName = wv < waterLevel * 0.55 ? 'water' : 'shallow_water';
      }
      const sub = SUBTERRAINS[subTypeName] ?? SUBTERRAIN_FALLBACK;

      // Walkability and movement cost come entirely from the subterrain definition
      const walkable = sub.walkable;
      const movementCost = sub.movementCost;

      // Legacy type field (kept for compatibility with existing code)
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

  // Phase 5a: distribute base tile wetness outward from water (spider-web falloff).
  assignMoisture(world, detailNoise);

  // Phase 5b: populate tile-level resource amounts
  resourceGeneratorService.generateResources(world, seed);

  return world;
}

// Organic ± jitter on the baked moisture so the damp bands aren't perfectly smooth contours.
const MOISTURE_NOISE_FREQUENCY = 0.06;
const MOISTURE_NOISE_SPREAD = 8; // ± wetness points

/**
 * Bake base tile wetness (`tile.moisture`, 0–100%) from each tile's distance to the nearest water.
 * A two-pass chamfer distance transform gives every tile its distance (in tiles) to water in O(n×2);
 * `baseMoistureFromWater` then turns that into wetness — high beside water, thinning inland to the
 * biome baseline. If a map has no water, every tile falls back to its biome baseMoisture. Runs once at
 * world-gen; the runtime only reads the baked value (+ live weather).
 */
function assignMoisture(world: WorldTile[][], detailNoise: (x: number, y: number) => number): void {
  const h = world.length;
  const w = h > 0 ? world[0].length : 0;
  if (w === 0) return;
  const INF = 1e9;
  const ORTHO = 1; // orthogonal step distance
  const DIAG = Math.SQRT2; // diagonal step distance
  const dist = new Float64Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) dist[y * w + x] = world[y][x].type === 'water' ? 0 : INF;

  // Forward pass (top-left → bottom-right): relax each cell from its already-finalised NW neighbours.
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
  // Backward pass (bottom-right → top-left): relax from SE neighbours to complete the transform.
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
