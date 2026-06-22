// Menu-backdrop world art-direction (title screen only). The procedural world for MENU_PREVIEW_SEED is
// post-processed here so the title shot reads the way we want, independent of what the generator rolled:
//   • the mountain is flattened to land (it dominated the top-right corner),
//   • the generator's water bodies are removed, and
//   • a single diagonal river is carved across the LOWER-LEFT so it cuts the bottom-left of the framed
//     view instead of running into the centred logo.
//
// Tune the river with RIVER_A / RIVER_B (endpoints, in MAP tile coords — the map is 160×100) and
// RIVER_WIDTH (half-thickness in tiles). The preview is centred + zoomed, so on a 16:10 screen the
// visible region is roughly x∈[40,120], y∈[25,75]; the defaults aim the river at that view's
// bottom-left. Move RIVER_A/B left/down to push the river toward the corner, widen with RIVER_WIDTH.
import type { WorldTile, Season, WeatherState } from '../core/types';
import { SUBTERRAINS, SUBTERRAIN_FALLBACK, pickChar } from '../core/Terrains';
import { makeWeather } from '../services/EnvironmentService';
import { makeSeededRng, freshSeed } from '../core/rng';

const WATER_SUBTYPES = new Set(['water', 'shallow_water', 'rapids']);

/** River endpoints (map tile coords) — the diagonal runs A → B across the lower-left. */
const RIVER_A = { x: 30, y: 54 };
const RIVER_B = { x: 70, y: 86 };
/** River half-thickness in tiles (core water; +~1 tile of shallow bank on each side). */
const RIVER_WIDTH = 3.5;

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

/** Perpendicular distance from (px,py) to segment A→B (clamped to the segment). */
function distToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  const s = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + s * dx), py - (ay + s * dy));
}

// ===== TITLE-SCREEN CLIMATE (random each launch, season from the real-world date) =====
//
// Curated per-season weather pools for the backdrop. fog / foggy_rain are deliberately excluded (drab,
// low-vis — bad first impression), and snow / blizzard live ONLY in the winter pool, so they can only
// appear when the machine's real-world season is winter (see localSeason). Everything else is fair game.
const SEASON_WEATHER_POOL: Record<Season, string[]> = {
  spring: ['clear', 'spring_windy', 'drizzle', 'rain', 'windy_rain', 'heavy_rain', 'storm', 'gale'],
  summer: ['clear', 'summer_windy', 'drizzle', 'rain', 'windy_rain', 'heat_wave', 'gale'],
  autumn: ['clear', 'autumn_windy', 'drizzle', 'rain', 'windy_rain', 'heavy_rain', 'storm', 'gale'],
  winter: ['clear', 'winter_windy', 'snow', 'blizzard', 'gale']
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

export function customizeMenuPreviewWorld(world: WorldTile[][]): void {
  const h = world.length;
  const w = world[0]?.length ?? 0;
  if (w === 0 || h === 0) return;
  const land = landTemplate(world);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = world[y][x];
      // Wobble the banks a touch so the river isn't a ruler-straight line.
      const edge = RIVER_WIDTH + Math.sin((x + y) * 0.22) * 0.7;
      const dist = distToSegment(x, y, RIVER_A.x, RIVER_A.y, RIVER_B.x, RIVER_B.y);
      if (dist <= edge) {
        // Core = deep water, banks = shallow water. Mountains under the river just become water.
        applySub(t, 'plains', dist <= edge * 0.55 ? 'water' : 'shallow_water', 'water');
      } else if (t.terrainType === 'mountain' || WATER_SUBTYPES.has(t.subType)) {
        // Flatten the mountain + erase the generator's own water bodies.
        applySub(t, land.biome, land.subId, 'land');
      }
    }
  }
}
