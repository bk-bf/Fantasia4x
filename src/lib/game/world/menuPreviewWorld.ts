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

// Title-screen art direction: the glowing magical trees are placed on a clean, SYMMETRIC circle around
// the centred title/menu UI (the logo + button stack sit over the map centre — see GameCanvas framing),
// so they wreath the menu evenly. The ring is perfectly even-spaced at a constant radius, anchored with a
// tree dead-centre top. The count is a MULTIPLE OF 4 so trees land on all four cardinal points (top,
// bottom, left, right centre) and the ring has full 4-fold symmetry — mirror-symmetric about BOTH the
// vertical and horizontal axes through the centre. Radius is tuned to clear the UI box yet stay inside
// the 2× visible view. Each tree stands alone (no surrounding patch) — deliberately placed, by design.
const PREVIEW_GROVE_COUNT = 12;
// Ring radius as a fraction of the map's SHORTER side: 0.20·100 = 20 tiles → a 40-tile diameter. Large
// enough to clear the central UI box, small enough to stay within the 16:9 visible window (half-height
// ~0.225·H ⇒ ±22 tiles). Square tiles ⇒ a constant tile radius renders as an actual circle on screen.
const RING_RADIUS_FRAC = 0.2;

// ── 2D vector helpers (grove ring geometry) ─────────────────────────────────────────────────────
type Vec2 = { x: number; y: number };
const vAdd = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
const vScale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
const vRound = (a: Vec2): Vec2 => ({ x: Math.round(a.x), y: Math.round(a.y) });
/** Unit vector at angle θ (radians): θ=0 → +x (right), θ=−π/2 → −y (up, screen space). */
const vFromAngle = (theta: number): Vec2 => ({ x: Math.cos(theta), y: Math.sin(theta) });

/**
 * The N grove centres: P_i = C + R·(cos θ_i, sin θ_i), with θ_i = −π/2 + i·(2π/N) — i.e. evenly spaced
 * points on a circle of radius `radius` about centre `c`, the first straight up. The reflection θ ↦ π−θ
 * negates only the x-component, so the ring is mirror-symmetric about the vertical axis through C; when
 * N is a multiple of 4 a point also lands on each cardinal axis and θ ↦ −θ maps the set onto itself, so
 * it is ALSO symmetric about the horizontal axis (4-fold). An integer centre keeps rounding symmetric.
 */
function ringPoints(c: Vec2, radius: number, n: number): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const theta = -Math.PI / 2 + (i / n) * 2 * Math.PI;
    out.push(vRound(vAdd(c, vScale(vFromAngle(theta), radius))));
  }
  return out;
}

/**
 * Compute the `PREVIEW_GROVE_COUNT` grove sites: an even, mirror-symmetric circle of points around the
 * map centre (where the title/menu UI sits — see ringPoints), returning the in-bounds, walkable-land ring
 * tiles. A single glowing magical tree is planted on each (after resource generation) — by design they
 * are placed deliberately and stand ALONE, with no surrounding patch carved (no clumps).
 */
function seedPreviewGroves(world: WorldTile[][]): Vec2[] {
  const h = world.length;
  const w = world[0]?.length ?? 0;
  // True grid centre in TILE-INDEX space: tile i renders centred at pixel (i+0.5)·tileSize, so the index
  // that lands on the on-screen centre is (w-1)/2 — NOT w/2 (that's half a tile right). With the odd map
  // width (see MENU_PREVIEW_MAP), (w-1)/2 is an exact integer, so the ring centres on a real column.
  const centre: Vec2 = { x: (w - 1) / 2, y: (h - 1) / 2 };
  const radius = Math.min(w, h) * RING_RADIUS_FRAC;
  return ringPoints(centre, radius, PREVIEW_GROVE_COUNT).filter((p) => {
    const t = world[p.y]?.[p.x];
    return !!t && t.walkable && !WATER_SUBTYPES.has(t.subType);
  });
}

export function customizeMenuPreviewWorld(world: WorldTile[][]): Vec2[] {
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

  // …then return the deliberately-placed magical-tree ring sites (planted after resource generation).
  return seedPreviewGroves(world);
}

// The glowing "magical" groves (heartwood/moonwood/ironwood/emberwood) — the distinctive landmark trees.
// Derived from the data (any tree resource that emits a `glow`) so a new magical species is picked up
// automatically.
function magicalGroveDefs() {
  return resourceObjectService.getAll().filter((d) => d.subterrain === 'tree' && d.glow);
}

/** Ids of the glowing magical groves — excluded from the menu's RANDOM resource scatter so the
 *  deliberately-placed ring (placeMenuPreviewMagicalGroves) is their SOLE source on the backdrop. */
export function menuPreviewMagicalGroveIds(): ReadonlySet<string> {
  return new Set(magicalGroveDefs().map((d) => d.id));
}

/**
 * Plant one glowing magical tree at each ring site. Runs AFTER `generateResources` so any ordinary tree
 * the scatter dropped on a site tile is replaced (placeSingleResource clears the tile first). Magical
 * groves are excluded from that scatter (menuPreviewMagicalGroveIds), so these are the only ones present.
 * Deterministic in the preview seed. No-op if the data defines no glowing groves.
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

/**
 * MM2 backdrop variant: plant 2× the magical trees scattered across the map in a jittered CHECKERBOARD
 * (every other grid cell, ± a fraction of a cell so they don't sit on a perfect lattice) — never gluing
 * together (cells are spaced well apart). Species are drawn from a balanced, SHUFFLED bag (equal count of
 * each, MIXED across the map — not banded). Runs AFTER `generateResources`; placeSingleResource clears
 * each target tile so it overwrites any ordinary tree the scatter dropped there. Deterministic in the seed.
 */
export function placeMenuPreviewScatteredGroves(world: WorldTile[][], seed: number): void {
  const groves = magicalGroveDefs();
  if (groves.length === 0) return;
  const h = world.length;
  const w = world[0]?.length ?? 0;
  if (w === 0 || h === 0) return;
  const rand = makeSeededRng((seed ^ 0x2545f491) >>> 0);
  // Checkerboard grid over a central region: COLS×ROWS cells, half used ((c+r) even) ⇒ 2× the ring count.
  const COLS = 8;
  const ROWS = 6; // 8×6 = 48 cells → 24 checkerboard sites = 2 × PREVIEW_GROVE_COUNT
  const sites = Math.ceil((COLS * ROWS) / 2); // checkerboard cells actually planted (24)
  // Balanced, SHUFFLED species bag sized to the SITES count: an equal share of each species, then
  // Fisher-Yates so they're MIXED across the map (not banded into vertical stripes). Sizing the bag to
  // `sites` (not all cells) is what keeps the counts exactly equal — 24 / 4 = 6 of each.
  const bag: typeof groves = [];
  const perSpecies = Math.floor(sites / groves.length);
  for (const g of groves) for (let k = 0; k < perSpecies; k++) bag.push(g);
  for (let i = 0; bag.length < sites; i++) bag.push(groves[i % groves.length]); // spread any remainder
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  // Region is constrained to the on-screen window (the menu zooms 2× and shows only the central ~half of
  // the map: ≈ x[0.25,0.75] × y[0.28,0.72]). Keeping every site inside it means all 24 trees are visible,
  // so the equal species split actually shows — a wider region scattered half of them off-screen, which
  // skewed the VISIBLE counts even though the data was balanced.
  const x0 = 0.27 * w;
  const y0 = 0.3 * h;
  const cellW = (0.73 * w - x0) / COLS;
  const cellH = (0.7 * h - y0) / ROWS;
  const JIT = 0.28; // ± fraction of a cell — breaks the lattice without letting trees touch
  let placed = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if ((c + r) % 2 !== 0) continue; // checkerboard
      const x = Math.round(x0 + (c + 0.5) * cellW + (rand() * 2 - 1) * JIT * cellW);
      const y = Math.round(y0 + (r + 0.5) * cellH + (rand() * 2 - 1) * JIT * cellH);
      const tile = world[y]?.[x];
      if (!tile || WATER_SUBTYPES.has(tile.subType)) continue;
      const def = bag[placed];
      resourceGeneratorService.placeSingleResource(tile, def, (seed + placed * 2654435761) >>> 0);
      placed++;
    }
  }
}
