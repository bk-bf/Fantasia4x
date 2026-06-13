// src/lib/game/world/WorldGenerator.ts
import { createNoise2D } from 'simplex-noise';
import type { WorldTile } from '../core/types';
import {
  SUBTERRAINS,
  SUBTERRAIN_FALLBACK,
  pickBiome,
  pickSubterrain,
  pickChar
} from '../core/Terrains';
import { resourceGeneratorService } from '../services/ResourceGeneratorService';

// Noise constants ported from Celestia noise_generator.gd
const TERRAIN_FREQUENCY = 0.005;
const DETAIL_FREQUENCY = 0.05;
const TERRAIN_OCTAVES = 5;
const TERRAIN_LACUNARITY = 2.0;
const TERRAIN_GAIN = 0.6;

/** Simple seeded PRNG (xorshift32) — returns values in [0, 1). */
function makeRng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 0x100000000;
  };
}

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
  const terrainNoise = createNoise2D(makeRng(seed));
  const detailNoise = createNoise2D(makeRng(detailSeed));

  const world: WorldTile[][] = [];

  for (let y = 0; y < height; y++) {
    world[y] = [];
    for (let x = 0; x < width; x++) {
      // Domain-warp the biome sampling so river (and all biome boundary) contours
      // meander organically rather than running in straight diagonal bands.
      // Mirrors Celestia's get_warped_noise(), which was defined but never wired up.
      const warpAmt = 20;
      const wx = detailNoise(x * DETAIL_FREQUENCY + 17.3, y * DETAIL_FREQUENCY + 17.3) * warpAmt;
      const wy = detailNoise(x * DETAIL_FREQUENCY - 17.3, y * DETAIL_FREQUENCY - 17.3) * warpAmt;
      const raw = fbm(terrainNoise, x + wx, y + wy);
      const density = Math.max(0, Math.min(1, (raw + 1) / 2));

      // Detail noise in -1..1 for subterrain selection
      const detail = detailNoise(x * DETAIL_FREQUENCY, y * DETAIL_FREQUENCY);

      const biomeName = pickBiome(density) ?? 'plains';
      // Base ground-cover only; object placement is handled later in ResourceGeneratorService
      const subTypeName = pickSubterrain(biomeName, detail);
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
        resources: {},
        territoryOwner: '',
        gCost: 0,
        hCost: 0,
        fCost: 0,
        parent: null
      };
    }
  }

  // Phase 5b: populate tile-level resource amounts
  resourceGeneratorService.generateResources(world, seed);

  return world;
}
