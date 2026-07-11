// src/lib/game/world/WorldGenerator.ts
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

export function generateWorld(
  width: number,
  height: number,
  seed = Date.now(),
  opts?: { skipResources?: boolean; tidyWater?: boolean }
): WorldTile[][] {
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

  // Phase 5·0: tidy waterbodies before moisture/resources — fill fully-enclosed land holes (nothing
  // stranded inside a lake, e.g. a clay tile) and ring every waterbody with riverbank for a clean shore.
  // Skipped via `tidyWater: false` by callers that erase water afterwards (the menu backdrop), which
  // would otherwise leave the riverbank ring stranded as "banks with no river".
  if (opts?.tidyWater !== false) tidyWaterbodies(world);

  // Phase 5·1: promote the deep interior of parent biomes to their nested variants (deep_forest…),
  // before moisture so a variant tile bakes its own baseMoisture.
  promoteBiomeVariants(world, detailNoise);

  // Phase 5a: distribute base tile wetness outward from water (spider-web falloff).
  assignMoisture(world, detailNoise);

  // Phase 5b: populate tile-level resource amounts. Callers that need to control the scatter (e.g. the
  // menu preview, which excludes the magical groves so only its deliberate ring exists) pass
  // `skipResources` and run generateResources themselves.
  if (!opts?.skipResources) resourceGeneratorService.generateResources(world, seed);

  return world;
}

// ── Waterbody tidy pass (Phase 5·0) ───────────────────────────────────────────────────────────────
const WATER_SUBS = new Set(['water', 'shallow_water', 'rapids']);
const isWaterTile = (t: WorldTile): boolean => WATER_SUBS.has(t.subType);

// Re-derive a tile's subterrain-dependent fields after changing its subType (used by tidyWaterbodies).
// Keeps x/y/density/terrainType; refreshes glyph, walkability, sight, movement cost, and legacy `type`.
function setTileSubtype(t: WorldTile, subTypeName: string): void {
  const sub = SUBTERRAINS[subTypeName] ?? SUBTERRAIN_FALLBACK;
  t.subType = subTypeName;
  t.ascii = pickChar(sub, t.x, t.y);
  t.walkable = sub.walkable;
  t.movementCost = sub.movementCost;
  t.blocksSight = sub.blocksSight ?? false;
  t.type = (WATER_SUBS.has(subTypeName) ? 'water' : 'land') as WorldTile['type'];
}

/**
 * Tidy generated waterbodies (run before moisture/resources):
 *  A) Fill enclosed holes — a non-water tile whose 8 neighbours are ALL water becomes water, so a clay
 *     (or any land) tile is never stranded inside a lake.
 *  B) Riverbank ring — every remaining non-water, non-mountain tile that touches water (8-neighbour)
 *     becomes riverbank, giving each waterbody a consistent one-tile shore (and so no clay borders water).
 */
function tidyWaterbodies(world: WorldTile[][]): void {
  const h = world.length;
  const w = world[0]?.length ?? 0;
  const waterAt = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < w && y < h && isWaterTile(world[y][x]);

  // A) Fill water-enclosed land. Label land into 8-connected components; any component that never
  //    touches the map border is cut off from the outside by water — an island / stray clay patch
  //    inside a waterbody — so flood it to water. The single largest component (the mainland) is always
  //    kept, even on a continent-ringed-by-ocean map. This clears ALL land stranded inside water, not
  //    just single-tile holes.
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

  // B) Riverbank ring. Collect targets against the cleaned water tiles first, then apply — the adjacency
  //    test only ever reads water, never freshly-laid riverbank.
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

// ── Biome variant promotion (nested cores, Phase 5·1) ───────────────────────────────────────────────
// Tiles this many steps in from a parent biome's boundary promote to its variant. Only large blobs HAVE
// an interior this deep, so a variant is always a rare core nested inside a real forest/mountain — never
// a random scattered patch. Tunable: lower = more/larger cores, higher = rarer.
const VARIANT_DEPTH = 5;

/**
 * Promote the deep interior of each parent biome's blobs to its nested variant (deep_forest inside
 * forest, …). Data-driven off BIOMES `parent`: distance-transform inward from the biome boundary — any
 * non-parent tile, any water tile, and the map edge count as a boundary at distance 0 — then flip every
 * parent tile at least VARIANT_DEPTH steps in to the variant, re-picking its subterrain (which inherits
 * the parent's plus any variant-only subterrain). Legacy `type` is left as the parent tile already had
 * it. Runs after the waterbody tidy so water/riverbank boundaries are final.
 */
function promoteBiomeVariants(
  world: WorldTile[][],
  detailNoise: (x: number, y: number) => number
): void {
  const h = world.length;
  const w = world[0]?.length ?? 0;
  if (w === 0) return;

  // parent biome id → variant biome id (first variant of a parent wins).
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
    // Seed: INF inside the parent blob (away from the map edge), 0 on every boundary (non-parent tile,
    // water, or a tile on the map border).
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
    // Two-pass chamfer distance transform (same shape as assignMoisture).
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
    // Promote the deep interior, re-picking the subterrain so any variant-only subterrain lights up.
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
