// Menu-backdrop world art-direction (title screen only). The procedural world for MENU_PREVIEW_SEED is
// post-processed here so the title shot reads the way we want, independent of what the generator rolled:
//   • the mountain is flattened to land (it dominated the top-right corner), and
//   • the generator's water bodies are removed.
// The result is an open plain — no mountain, no water.
import type { WorldTile, Season, WeatherState } from '../core/types';
import { SUBTERRAINS, SUBTERRAIN_FALLBACK, pickChar } from '../core/Terrains';
import { makeWeather } from '../services/EnvironmentService';
import { makeSeededRng, freshSeed } from '../core/rng';
import { resourceObjectService } from '../services/ResourceObjectService';
import { resourceGeneratorService } from '../services/ResourceGeneratorService';
import { MENU_DECOR_BANDS_X, MENU_DECOR_Y } from '../services/entity/entityConstants';

const WATER_SUBTYPES = new Set(['water', 'shallow_water', 'rapids']);

/** Rewrite a tile's terrain fields from a subterrain id, re-deriving its glyph for the position. */
function applySub(t: WorldTile, biome: string, subId: string, legacyType: WorldTile['type']): void {
  const sub = SUBTERRAINS[subId] ?? SUBTERRAIN_FALLBACK;
  t.terrainType = biome;
  t.subType = subId;
  t.type = legacyType;
  t.walkable = sub.walkable;
  t.movementCost = sub.movementCost;
  t.blocksSight = sub.blocksSight ?? false;
  t.ascii = pickChar(sub, t.x, t.y);
  t.resources = {};
}

/** A representative walkable land tile from the generated world, to flatten mountains/old water onto. */
function landTemplate(world: WorldTile[][]): { biome: string; subId: string } {
  for (const row of world) {
    for (const t of row) {
      if (t.walkable && t.terrainType !== 'mountain' && !WATER_SUBTYPES.has(t.subType)) {
        return { biome: t.terrainType, subId: t.subType };
      }
    }
  }
  return { biome: 'plains', subId: 'grass' };
}

// ===== TITLE-SCREEN CLIMATE (random each launch, season from the real-world date) =====
//
// Curated per-season weather pools for the backdrop. `clear` is excluded so the title always shows a
// visible weather effect; `fog` / `foggy_rain` are excluded too (drab, low-vis — bad first impression);
// and snow / blizzard live ONLY in the winter pool, so they only appear when the machine's real-world
// season is winter (see localSeason). Everything else is fair game.
const SEASON_WEATHER_POOL: Record<Season, string[]> = {
  spring: ['spring_windy', 'drizzle', 'rain', 'windy_rain', 'heavy_rain', 'storm', 'gale'],
  summer: ['summer_windy', 'drizzle', 'rain', 'windy_rain', 'heavy_rain', 'storm', 'gale'],
  autumn: ['autumn_windy', 'drizzle', 'rain', 'windy_rain', 'heavy_rain', 'storm', 'gale'],
  winter: ['winter_windy', 'snow', 'blizzard', 'gale']
};

/** Spring breeze — the universal fallback when the date/weather pick can't be resolved. */
const FALLBACK_CLIMATE = { season: 'spring' as Season, type: 'spring_windy' };

/**
 * Real-world season from the machine's local date (Northern-Hemisphere month bands — flip the bands
 * for the Southern Hemisphere). Dec–Feb winter, Mar–May spring, Jun–Aug summer, Sep–Nov autumn.
 * OS-agnostic: `Date#getMonth()` reads the host clock through the JS engine on any platform; guarded
 * so a bogus/unavailable clock falls back to spring rather than throwing.
 */
export function localSeason(d: Date = new Date()): Season {
  const m = d.getMonth(); // 0 = January (local time)
  if (!Number.isInteger(m) || m < 0 || m > 11) return FALLBACK_CLIMATE.season;
  if (m === 11 || m <= 1) return 'winter';
  if (m <= 4) return 'spring';
  if (m <= 7) return 'summer';
  return 'autumn';
}

/**
 * A random, season-appropriate title-screen climate. The season is pinned to the machine's local date
 * (so snow only shows in a real winter); the weather is rolled RANDOMLY from that season's pool on a
 * FRESH seed (not the fixed world seed), so it differs every launch. The engine skips the daily weather
 * re-roll in preview mode, so this sticks. Any failure (clock, empty pool, bad weather id) falls back
 * to a spring breeze.
 */
export function pickMenuPreviewClimate(): { season: Season; weather: WeatherState } {
  try {
    const season = localSeason();
    const pool = SEASON_WEATHER_POOL[season];
    if (!pool || pool.length === 0) {
      return { season: FALLBACK_CLIMATE.season, weather: makeWeather(FALLBACK_CLIMATE.type) };
    }
    const rand = makeSeededRng(freshSeed());
    const type = pool[Math.floor(rand() * pool.length)] ?? FALLBACK_CLIMATE.type;
    return { season, weather: makeWeather(type) };
  } catch {
    return { season: FALLBACK_CLIMATE.season, weather: makeWeather(FALLBACK_CLIMATE.type) };
  }
}

// Title-screen art direction: how many extra forest groves to stamp onto the plain (the generator
// rolls only ~2 on this small flattened map). Each is a deep_grass blob; generateResources — run AFTER
// this in startMenuPreview — scatters trees densely on deep_grass, so each blob fills in as a grove.
const PREVIEW_GROVE_COUNT = 7;
const GROVE_MIN_RADIUS = 3;
const GROVE_MAX_RADIUS = 5;

/**
 * Stamp `PREVIEW_GROVE_COUNT` forest groves (deep_grass blobs) onto open land so the title shot reads
 * as a wooded landscape rather than bare grass, and RETURN each grove's centre tile. Deterministic in
 * the preview seed (so the backdrop is stable across launches). Centres are placed in the MENU_DECOR
 * side bands (the same on-screen area FLANKING the title/menu UI that the herds use) so the groves —
 * and their glowing magical centrepieces — actually decorate the menu instead of sitting off-screen or
 * behind the buttons. Only converts walkable, non-water land — never paves over the river. MUST run
 * BEFORE resource generation so trees populate the new deep_grass tiles; the returned centres are then
 * used to drop a glowing magical grove into each (after resources).
 */
function seedPreviewGroves(world: WorldTile[][], seed: number): Array<{ x: number; y: number }> {
  const h = world.length;
  const w = world[0]?.length ?? 0;
  const rand = makeSeededRng((seed ^ 0x9e3779b9) >>> 0);
  const [y0, y1] = MENU_DECOR_Y;
  const centers: Array<{ x: number; y: number }> = [];
  for (let g = 0; g < PREVIEW_GROVE_COUNT; g++) {
    const [x0, x1] = MENU_DECOR_BANDS_X[g % MENU_DECOR_BANDS_X.length]; // alternate L / R bands
    const cx = Math.floor((x0 + rand() * (x1 - x0)) * w);
    const cy = Math.floor((y0 + rand() * (y1 - y0)) * h);
    const radius = GROVE_MIN_RADIUS + Math.floor(rand() * (GROVE_MAX_RADIUS - GROVE_MIN_RADIUS + 1));
    let carved = false;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        // Jittered radius → organic grove outline, not a hard disc.
        if (Math.sqrt(dx * dx + dy * dy) > radius - 0.5 + rand()) continue;
        const t = world[y][x];
        if (!t.walkable || WATER_SUBTYPES.has(t.subType)) continue;
        applySub(t, 'forest', 'deep_grass', 'forest');
        carved = true;
      }
    }
    // Only offer the centre as a magical-grove site if its own tile actually became grove land.
    if (carved && world[cy]?.[cx]?.subType === 'deep_grass') centers.push({ x: cx, y: cy });
  }
  return centers;
}

export function customizeMenuPreviewWorld(
  world: WorldTile[][],
  seed: number
): Array<{ x: number; y: number }> {
  const h = world.length;
  const w = world[0]?.length ?? 0;
  if (w === 0 || h === 0) return [];
  const land = landTemplate(world);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = world[y][x];
      // Flatten the mountain + erase the generator's water bodies → an open plain.
      if (t.terrainType === 'mountain' || WATER_SUBTYPES.has(t.subType)) {
        applySub(t, land.biome, land.subId, 'land');
      }
    }
  }

  // …then carve extra forest groves into the open plain (more wooded title shot), returning their
  // centres so a glowing magical grove can be planted in each after resource generation.
  return seedPreviewGroves(world, seed);
}

// The glowing "magical" groves (heartwood/moonwood/ironwood/emberwood) — the distinctive landmark trees.
// Derived from the data (any tree resource that emits a `glow`) so a new magical species is picked up
// automatically. They spawn at ~0.1% per tile in normal gen, so on the small menu map almost none roll;
// we plant one at the centre of each carved grove instead.
function magicalGroveDefs() {
  return resourceObjectService.getAll().filter((d) => d.subterrain === 'tree' && d.glow);
}

/**
 * Plant a glowing magical grove at the centre of each carved grove. Runs AFTER `generateResources` so
 * the ordinary tree the scatter pass may have dropped on the centre tile is replaced (not the other way
 * round). Deterministic in the preview seed. No-op if the data defines no glowing groves.
 */
export function placeMenuPreviewMagicalGroves(
  world: WorldTile[][],
  centers: Array<{ x: number; y: number }>,
  seed: number
): void {
  const groves = magicalGroveDefs();
  if (groves.length === 0 || centers.length === 0) return;
  const rand = makeSeededRng((seed ^ 0x5bd1e995) >>> 0);
  centers.forEach(({ x, y }, i) => {
    const tile = world[y]?.[x];
    if (!tile) return;
    const def = groves[Math.floor(rand() * groves.length)];
    // Distinct seed per node so growth/amount vary; reuses the world-gen placement path.
    resourceGeneratorService.placeSingleResource(tile, def, (seed + i * 2654435761) >>> 0);
  });
}
