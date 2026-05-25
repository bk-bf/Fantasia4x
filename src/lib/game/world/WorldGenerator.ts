// src/lib/game/world/WorldGenerator.ts
import { createNoise2D } from 'simplex-noise';
import type { WorldTile, Location } from '../core/types';
import { BIOMES, SUBTERRAINS, SUBTERRAIN_FALLBACK, pickBiome, pickSubterrain } from '../core/Terrains';

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
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return ((s >>> 0) / 0x100000000);
  };
}

/**
 * Fractional Brownian Motion over a simplex noise function.
 * Matches Celestia's FastNoiseLite fractal settings.
 */
function fbm(noise2d: (x: number, y: number) => number, x: number, y: number): number {
  let value = 0, amplitude = 1, frequency = 1, max = 0;
  for (let i = 0; i < TERRAIN_OCTAVES; i++) {
    value += noise2d(x * frequency * TERRAIN_FREQUENCY, y * frequency * TERRAIN_FREQUENCY) * amplitude;
    max += amplitude;
    amplitude *= TERRAIN_GAIN;
    frequency *= TERRAIN_LACUNARITY;
  }
  return value / max; // normalise to -1..1
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
      // Primary noise → density in 0..1
      const raw = fbm(terrainNoise, x, y);
      const density = Math.max(0, Math.min(1, (raw + 1) / 2));

      // Detail noise in -1..1 for subterrain selection
      const detail = detailNoise(x * DETAIL_FREQUENCY, y * DETAIL_FREQUENCY);

      const biomeName = pickBiome(density) ?? 'plains';
      const biome = BIOMES[biomeName];
      const subTypeName = pickSubterrain(biome, detail);
      const sub = SUBTERRAINS[subTypeName] ?? SUBTERRAIN_FALLBACK;

      // Walkability: subterrain overrides biome for water/peak
      const walkable = sub.walkable;
      const movementCost = sub.movementCost || biome.movementCost;

      // Legacy type field (kept for compatibility with existing code)
      const legacyType = biomeName === 'mountain'
        ? 'mountain'
        : subTypeName === 'water' || subTypeName === 'shallow_water' || subTypeName === 'rapids'
          ? 'water'
          : biomeName === 'forest'
            ? 'forest'
            : 'land';

      world[y][x] = {
        x, y,
        type: legacyType as WorldTile['type'],
        discovered: true,
        ascii: sub.char,
        terrainType: biomeName,
        subType: subTypeName,
        density,
        moisture: 0,
        temperature: 0,
        movementCost,
        walkable,
        resources: {},
        territoryOwner: '',
        gCost: 0, hCost: 0, fCost: 0, parent: null
      };
    }
  }

  return world;
}

function generateLocationName(): string {
  const prefixes = ['Ancient', 'Forgotten', 'Dark', 'Green', 'Misty', 'Stone', 'Iron', 'Lost'];
  const suffixes = ['Vale', 'Peak', 'Grove', 'Hollow', 'Ridge', 'Haven', 'Ford', 'Reach'];
  return `${prefixes[Math.floor(Math.random() * prefixes.length)]} ${suffixes[Math.floor(Math.random() * suffixes.length)]}`;
}

export function generateLocations(worldMap: WorldTile[][]): Location[] {
  const locations: Location[] = [];
  const locationTypes = ['forest', 'ruins', 'plains', 'hills'] as const;

  // Generate 10-15 random locations
  const numLocations = Math.floor(Math.random() * 6) + 10;

  for (let i = 0; i < numLocations; i++) {
    const x = Math.floor(Math.random() * worldMap[0].length);
    const y = Math.floor(Math.random() * worldMap.length);

    locations.push({
      id: `loc_${i}`,
      name: generateLocationName(),
      description: `A ${locationTypes[Math.floor(Math.random() * locationTypes.length)]} location`,
      type: locationTypes[Math.floor(Math.random() * locationTypes.length)],
      tier: Math.floor(Math.random() * 3),
      rarity: ['common', 'uncommon', 'rare'][Math.floor(Math.random() * 3)] as 'common' | 'uncommon' | 'rare',
      discovered: false,
      availableResources: {
        tier0: ['wood', 'stone'],
        tier1: ['iron_ore'],
        tier2: ['gold_ore']
      },
      workModifiers: {},
      explorationRequirements: {},
      hazards: [],
      specialFeatures: [],
      emoji: '🌲',
      color: '#228B22'
    });
  }

  return locations;
}
