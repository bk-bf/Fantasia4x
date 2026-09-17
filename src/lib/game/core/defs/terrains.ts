import terrainsData from '../../database/world/terrains.json';
import subterrainsData from '../../database/world/subterrains.json';
import { CP437_TO_UNICODE } from '../util/cp437.js';
import { hexToRgb01 } from '../util/color';
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

export const SPAWNABLE_BIOMES = new Set(['forest', 'plains', 'swamp']);
export const WATER_SUBTYPES = new Set(['water', 'shallow_water', 'rapids']);

export function terrainBlocksSight(walkable: boolean, subType: string): boolean {
  return !walkable && !WATER_SUBTYPES.has(subType);
}
