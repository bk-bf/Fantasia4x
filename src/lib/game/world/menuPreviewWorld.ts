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
// Curated per-season weather pools for the backdrop, each entry WEIGHTED for the per-launch pick (this
// is menu-only — it does NOT affect in-game weather, which rolls via its own Markov chain). `clear` is
// excluded so the title always shows a visible weather effect; `fog` / `foggy_rain` are excluded too
// (drab, low-vis — bad first impression); and snow / blizzard live ONLY in the winter pool, so they only
// appear when the machine's real-world season is winter (see localSeason).
//
// SPRING & SUMMER favour the dry WIND variants (the season breeze + gale, which blow leaves/dust) over
// the RAIN variants (drizzle/rain/windy_rain/heavy_rain/storm), so the title mostly shows a pleasant
// breeze and only occasionally rain. Autumn/winter stay evenly weighted (weight 1 each).
const SEASON_WEATHER_POOL: Record<Season, ReadonlyArray<readonly [type: string, weight: number]>> = {
  spring: [
    ['spring_windy', 7],
    ['gale', 3],
    ['drizzle', 1],
    ['rain', 1],
    ['windy_rain', 1],
    ['heavy_rain', 1],
    ['storm', 1]
  ],
  summer: [
    ['summer_windy', 7],
    ['gale', 3],
    ['drizzle', 1],
    ['rain', 1],
    ['windy_rain', 1],
    ['heavy_rain', 1],
    ['storm', 1]
  ],
  autumn: [
    ['autumn_windy', 1],
    ['drizzle', 1],
    ['rain', 1],
    ['windy_rain', 1],
    ['heavy_rain', 1],
    ['storm', 1],
    ['gale', 1]
  ],
  winter: [
    ['winter_windy', 1],
    ['snow', 1],
    ['blizzard', 1],
    ['gale', 1]
  ]
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
    // Weighted pick: walk the cumulative weights (so spring/summer's high-weight wind variants win most
    // launches). Last entry covers any floating-point drift at the top of the range.
    const rand = makeSeededRng(freshSeed());
    const total = pool.reduce((s, [, weight]) => s + weight, 0);
    let r = rand() * total;
    let type = pool[pool.length - 1][0];
    for (const [t, weight] of pool) {
      r -= weight;
      if (r < 0) {
        type = t;
        break;
      }
    }
    return { season, weather: makeWeather(type) };
  } catch {
    return { season: FALLBACK_CLIMATE.season, weather: makeWeather(FALLBACK_CLIMATE.type) };
  }
}

// Title-screen art direction: the magical groves are arranged in an almost-circular RING around the
// centred title/menu UI (the logo + button stack sit over the map centre — see GameCanvas menu framing),
// so they wreath the menu at roughly equal spacing instead of scattering. Each ring point gets a small
// deep_grass blob (generateResources, run AFTER this, scatters ordinary trees onto deep_grass) with a
// glowing magical tree planted dead-centre, so each reads as a natural little grove rather than a lone
// icon. Counts/geometry are tuned to clear the UI box yet stay inside the zoomed-in (2×) visible window.
const PREVIEW_GROVE_COUNT = 10;
// Ring radius as a fraction of the map's SHORTER side: large enough to clear the central UI box on every
// common aspect ratio, small enough to stay within the visible window (whose half-height is only ~0.17·H
// on a wide screen). Square tiles ⇒ a constant tile radius renders as an actual circle on screen.
const RING_RADIUS_FRAC = 0.18;
const RING_ANGLE_JITTER = 0.25; // ± fraction of the 36° step — natural wobble, still "almost a circle"
const RING_RADIUS_JITTER = 0.08; // ± fraction of the radius — groves sit at slightly varied distances
const GROVE_BLOB_MIN_RADIUS = 2;
const GROVE_BLOB_MAX_RADIUS = 4;

/**
 * Lay `PREVIEW_GROVE_COUNT` grove sites in a jittered ring around the map centre (where the title/menu
 * UI sits), carve a small organic deep_grass blob at each, and RETURN the ring of centre tiles (for the
 * glowing magical trees, planted after resource generation). Evenly spaced by angle (±jitter) at a near
 * constant radius (±jitter) so it reads as an almost-circle wreathing the menu, but natural — not a
 * mechanical polygon. Deterministic in the preview seed. Water is already flattened to land by the time
 * this runs, so every ring tile is walkable land.
 */
function seedPreviewGroves(world: WorldTile[][], seed: number): Array<{ x: number; y: number }> {
  const h = world.length;
  const w = world[0]?.length ?? 0;
  const rand = makeSeededRng((seed ^ 0x9e3779b9) >>> 0);
  const cx0 = w / 2;
  const cy0 = h / 2;
  const ringR = Math.min(w, h) * RING_RADIUS_FRAC;
  const step = (Math.PI * 2) / PREVIEW_GROVE_COUNT;
  const startAngle = rand() * Math.PI * 2; // random ring orientation per seed
  const centers: Array<{ x: number; y: number }> = [];
  for (let g = 0; g < PREVIEW_GROVE_COUNT; g++) {
    const angle = startAngle + g * step + (rand() * 2 - 1) * step * RING_ANGLE_JITTER;
    const r = ringR * (1 + (rand() * 2 - 1) * RING_RADIUS_JITTER);
    const cx = Math.round(cx0 + Math.cos(angle) * r);
    const cy = Math.round(cy0 + Math.sin(angle) * r);
    if (cx < 0 || cy < 0 || cx >= w || cy >= h) continue;
    const blobR =
      GROVE_BLOB_MIN_RADIUS + Math.floor(rand() * (GROVE_BLOB_MAX_RADIUS - GROVE_BLOB_MIN_RADIUS + 1));
    for (let dy = -blobR; dy <= blobR; dy++) {
      for (let dx = -blobR; dx <= blobR; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        // Jittered radius → organic grove outline, not a hard disc.
        if (Math.sqrt(dx * dx + dy * dy) > blobR - 0.5 + rand()) continue;
        const t = world[y][x];
        if (!t.walkable || WATER_SUBTYPES.has(t.subType)) continue;
        applySub(t, 'forest', 'deep_grass', 'forest');
      }
    }
    // Guarantee the centre tile is grove land so the magical centrepiece has somewhere to sit.
    const c = world[cy]?.[cx];
    if (c && c.walkable && !WATER_SUBTYPES.has(c.subType)) {
      applySub(c, 'forest', 'deep_grass', 'forest');
      centers.push({ x: cx, y: cy });
    }
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
  // Balanced species: shuffle the grove types once (so the round-robin below isn't biased to a fixed
  // order each seed), then assign them around the ring cyclically. With 10 sites and 4 types every
  // species appears 2–3× — no single tree dominates the pool, while neighbours still differ.
  const order = [...groves];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  centers.forEach(({ x, y }, i) => {
    const tile = world[y]?.[x];
    if (!tile) return;
    const def = order[i % order.length];
    // Distinct seed per node so growth/amount vary; reuses the world-gen placement path.
    resourceGeneratorService.placeSingleResource(tile, def, (seed + i * 2654435761) >>> 0);
  });
}
