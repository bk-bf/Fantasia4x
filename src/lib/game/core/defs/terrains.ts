import terrainsData from '../../database/world/terrains.json';
import subterrainsData from '../../database/world/subterrains.json';
import { CP437_TO_UNICODE } from '../util/cp437.js';
import { hexToRgb01 } from '../util/color';
import type { WorldTile } from '../types';

export interface BiomeDef {
  displayName: string;
  densityRange?: [number, number];
  parent?: string;
  baseTemp?: number;
  baseMoisture?: number;
}

export interface SubterrainDef {
  displayName: string;
  walkable: boolean;
  blocksSight?: boolean;
  movementCost: number;
  fg: [number, number, number];
  bg: [number, number, number];
  chars: string[];
  biomes?: Record<string, [number | null, number | null]>;
}

const T = (n: number): string =>
  n === 32 ? String.fromCodePoint(0xea00) : (CP437_TO_UNICODE[n] ?? String.fromCharCode(n));
const P = (n: number): string => String.fromCodePoint(0xe000 + n);
const M = (n: number): string => String.fromCodePoint(0xe200 + n);
const B = (n: number): string => String.fromCodePoint(0xe400 + n);
const I = (n: number): string => String.fromCodePoint(0xe500 + n);
const W = (n: number): string => String.fromCodePoint(0xe600 + n);
const CROP = (n: number): string => String.fromCodePoint(0xe700 + n);
const CR = (n: number): string => String.fromCodePoint(0xe800 + n);
const RA = (n: number): string => String.fromCodePoint(0xe900 + n);

export interface CharSpan {
  sheet?:
    | 'tiles'
    | 'plants'
    | 'map'
    | 'buildings'
    | 'items'
    | 'workshops'
    | 'crops'
    | 'creatures'
    | 'cultures';
  from?: number;
  to?: number;
  id?: number;
  literal?: string;
}

type SheetFn = (n: number) => string;
const SHEET_FN: Record<string, SheetFn> = {
  tiles: T,
  plants: P,
  map: M,
  buildings: B,
  items: I,
  workshops: W,
  crops: CROP,
  creatures: CR,
  cultures: RA
};

export function resolveCharSpans(spans: CharSpan[]): string[] {
  return spans.flatMap((span) => {
    if (span.literal !== undefined) return [span.literal];
    const fn = SHEET_FN[span.sheet ?? 'plants'];
    if (!fn) {
      console.warn(`resolveCharSpans: unknown sheet "${span.sheet}" — using fallback glyph`);
      return ['?'];
    }
    if (span.id !== undefined) return [fn(span.id)];
    return Array.from({ length: span.to! - span.from! + 1 }, (_, i) => fn(span.from! + i));
  });
}

export function pickChar(sub: { chars: string[] }, x: number, y: number): string {
  const { chars } = sub;
  if (chars.length === 1) return chars[0];
  const h = ((x * 1619 + y * 31337) >>> 0) % chars.length;
  return chars[h];
}
export const BIOMES: Record<string, BiomeDef> = Object.fromEntries(
  (terrainsData.biomes as unknown as Array<{ id: string } & Record<string, unknown>>).map((b) => [
    b.id,
    b
  ])
) as unknown as Record<string, BiomeDef>;

export interface BiomeConfigEntry {
  id: string;
  displayName: string;
  share: number;
  baseTemp: number;
  baseMoisture: number;
}

const DEFAULT_BIOME_CONFIG: Record<
  string,
  { densityRange: [number, number]; baseTemp: number; baseMoisture: number }
> = Object.fromEntries(
  Object.entries(BIOMES)
    .filter(([, d]) => d.densityRange)
    .map(([id, d]) => [
      id,
      {
        densityRange: [d.densityRange![0], d.densityRange![1]] as [number, number],
        baseTemp: d.baseTemp ?? 0,
        baseMoisture: d.baseMoisture ?? 0
      }
    ])
);

const DENSITY_ORDER: string[] = Object.entries(DEFAULT_BIOME_CONFIG)
  .sort((a, b) => a[1].densityRange[0] - b[1].densityRange[0])
  .map(([id]) => id);

export function getBiomeConfig(): BiomeConfigEntry[] {
  return DENSITY_ORDER.map((id) => {
    const d = BIOMES[id];
    return {
      id,
      displayName: d.displayName,
      share: d.densityRange![1] - d.densityRange![0],
      baseTemp: d.baseTemp ?? 0,
      baseMoisture: d.baseMoisture ?? 0
    };
  });
}

export function applyBiomeShares(shares: Record<string, number>): void {
  const total = DENSITY_ORDER.reduce((s, id) => s + Math.max(0, shares[id] ?? 0), 0);
  let cursor = 0;
  DENSITY_ORDER.forEach((id, i) => {
    if (!BIOMES[id]) return;
    const w = total > 0 ? Math.max(0, shares[id] ?? 0) / total : 1 / DENSITY_ORDER.length;
    const start = i === 0 ? 0 : cursor;
    cursor += w;
    const end = i === DENSITY_ORDER.length - 1 ? 1 : cursor;
    BIOMES[id].densityRange = [start, end];
  });
}

export function setBiomeField(id: string, field: 'baseTemp' | 'baseMoisture', value: number): void {
  const d = BIOMES[id];
  if (!d) return;
  if (field === 'baseTemp') d.baseTemp = value;
  else d.baseMoisture = value;
}

const DEFAULT_WATER_LEVEL = 0.22;
let waterLevel = DEFAULT_WATER_LEVEL;
export function getWaterLevel(): number {
  return waterLevel;
}
export function setWaterLevel(v: number): void {
  waterLevel = Math.max(0, Math.min(1, v));
}

export function resetBiomeConfig(): void {
  for (const [id, def] of Object.entries(DEFAULT_BIOME_CONFIG)) {
    const d = BIOMES[id];
    if (!d) continue;
    d.densityRange = [def.densityRange[0], def.densityRange[1]];
    d.baseTemp = def.baseTemp;
    d.baseMoisture = def.baseMoisture;
  }
  waterLevel = DEFAULT_WATER_LEVEL;
}

export const SUBTERRAINS: Record<string, SubterrainDef> = Object.fromEntries(
  (subterrainsData as unknown as Array<Record<string, unknown>>).map((sub) => [
    sub.id as string,
    {
      displayName: sub.displayName as string,
      walkable: sub.walkable as boolean,
      blocksSight: sub.blocksSight as boolean | undefined,
      movementCost: sub.movementCost as number,
      fg: hexToRgb01(sub.fg, [0.5, 0.5, 0.5]),
      bg: hexToRgb01(sub.bg, [0.03, 0.03, 0.03]),
      chars: resolveCharSpans(sub.charSpans as CharSpan[]),
      biomes: sub.biomes as Record<string, [number | null, number | null]> | undefined
    } satisfies SubterrainDef
  ])
);

export const SUBTERRAIN_FALLBACK: SubterrainDef = {
  displayName: 'Unknown',
  walkable: true,
  movementCost: 1.0,
  chars: ['?'],
  fg: [0.5, 0.5, 0.5],
  bg: [0.03, 0.03, 0.03]
};

export function pickSubterrain(biomeName: string, detailNoise: number): string {
  const parent = BIOMES[biomeName]?.parent;
  for (const [id, def] of Object.entries(SUBTERRAINS)) {
    const range = def.biomes?.[biomeName] ?? (parent ? def.biomes?.[parent] : undefined);
    if (!range) continue;
    const [min, max] = range;
    if ((min === null || detailNoise >= min) && (max === null || detailNoise < max)) {
      return id;
    }
  }
  return 'dirt';
}

export type SoilTier = 0 | 1 | 2 | 3 | 4;

const FERTILITY_PCT_BY_SUBTYPE: Record<string, number> = {
  dirt: 0,
  savanna: 0,
  grass: 25,
  tall_grass: 50,
  deep_grass: 75,
  mossy_ground: 75,
  terra_preta: 100
};

export function soilFertilityPct(tile: { subType: string } | undefined | null): number {
  return tile ? (FERTILITY_PCT_BY_SUBTYPE[tile.subType] ?? 0) : 0;
}

export function soilTierForTile(tile: { subType: string } | undefined | null): SoilTier {
  return (soilFertilityPct(tile) / 25) as SoilTier;
}

export const SOIL_TIER_NAME: Record<SoilTier, string> = {
  0: 'Barren Dirt',
  1: 'Poor Soil',
  2: 'Loam',
  3: 'Rich Soil',
  4: 'Terra Preta'
};

export const SOIL_ITEM_BY_TIER: Record<SoilTier, string> = {
  0: 'dirt',
  1: 'poor_soil',
  2: 'loam',
  3: 'rich_soil',
  4: 'terra_preta'
};

export const SUBTYPE_BY_SOIL_TIER: Record<SoilTier, string> = {
  0: 'dirt',
  1: 'grass',
  2: 'tall_grass',
  3: 'deep_grass',
  4: 'terra_preta'
};

const SPAWNABLE_BIOMES = new Set(['forest', 'plains', 'swamp']);
const WATER_SUBTYPES = new Set(['water', 'shallow_water', 'rapids']);

export function terrainBlocksSight(walkable: boolean, subType: string): boolean {
  return !walkable && !WATER_SUBTYPES.has(subType);
}

export function isSpawnableTile(tile: WorldTile | undefined | null): boolean {
  if (!tile || !tile.walkable) return false;
  const biome = tile.terrainType;
  if (!SPAWNABLE_BIOMES.has(biome) && !SPAWNABLE_BIOMES.has(BIOMES[biome]?.parent ?? ''))
    return false;
  if (WATER_SUBTYPES.has(tile.subType)) return false;
  return true;
}

export function pickBiome(density: number): string | null {
  for (const [name, def] of Object.entries(BIOMES)) {
    if (!def.densityRange) continue;
    if (density >= def.densityRange[0] && density < def.densityRange[1]) return name;
  }
  return null;
}
