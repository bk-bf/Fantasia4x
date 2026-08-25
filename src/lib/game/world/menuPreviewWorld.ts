import type { WorldTile, Season, WeatherState } from '../core/types';
import { SUBTERRAINS, SUBTERRAIN_FALLBACK, pickChar } from '../core/defs/terrains';
import { makeWeather } from '../services/EnvironmentService';
import { makeSeededRng, freshSeed } from '../core/util/rng';
import { resourceObjectService } from '../services/ResourceObjectService';
import { resourceGeneratorService } from '../services/ResourceGeneratorService';

const WATER_SUBTYPES = new Set(['water', 'shallow_water', 'rapids']);

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

const SEASON_WEATHER_POOL: Record<
  Season,
  ReadonlyArray<readonly [type: string, weight: number]>
> = {
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
    ['spring_windy', 5],
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

const FALLBACK_CLIMATE = { season: 'spring' as Season, type: 'spring_windy' };

export function localSeason(d: Date = new Date()): Season {
  const m = d.getMonth();
  if (!Number.isInteger(m) || m < 0 || m > 11) return FALLBACK_CLIMATE.season;
  if (m === 11 || m <= 1) return 'winter';
  if (m <= 4) return 'spring';
  if (m <= 7) return 'summer';
  return 'autumn';
}

export function pickMenuPreviewClimate(): { season: Season; weather: WeatherState } {
  try {
    const season = localSeason();
    const pool = SEASON_WEATHER_POOL[season];
    if (!pool || pool.length === 0) {
      return { season: FALLBACK_CLIMATE.season, weather: makeWeather(FALLBACK_CLIMATE.type) };
    }
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

export function customizeMenuPreviewWorld(world: WorldTile[][]): void {
  const h = world.length;
  const w = world[0]?.length ?? 0;
  if (w === 0 || h === 0) return;
  const land = landTemplate(world);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = world[y][x];
      if (t.terrainType === 'mountain' || WATER_SUBTYPES.has(t.subType)) {
        applySub(t, land.biome, land.subId, 'land');
      }
    }
  }
}

function magicalGroveDefs() {
  return resourceObjectService.getAll().filter((d) => d.subterrain === 'tree' && d.glow);
}

export function menuPreviewMagicalGroveIds(): ReadonlySet<string> {
  return new Set(magicalGroveDefs().map((d) => d.id));
}

export function placeMenuPreviewScatteredGroves(world: WorldTile[][], seed: number): void {
  const groves = magicalGroveDefs();
  if (groves.length === 0) return;
  const h = world.length;
  const w = world[0]?.length ?? 0;
  if (w === 0 || h === 0) return;
  const rand = makeSeededRng((seed ^ 0x2545f491) >>> 0);
  const COLS = 8;
  const ROWS = 6;
  const sites = Math.ceil((COLS * ROWS) / 2);
  const bag: typeof groves = [];
  const perSpecies = Math.floor(sites / groves.length);
  for (const g of groves) for (let k = 0; k < perSpecies; k++) bag.push(g);
  for (let i = 0; bag.length < sites; i++) bag.push(groves[i % groves.length]);
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  const x0 = 0.27 * w;
  const y0 = 0.3 * h;
  const cellW = (0.73 * w - x0) / COLS;
  const cellH = (0.7 * h - y0) / ROWS;
  const JIT = 0.28;
  let placed = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if ((c + r) % 2 !== 0) continue;
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
