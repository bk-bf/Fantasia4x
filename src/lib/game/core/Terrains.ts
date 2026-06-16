import terrainsData from '../database/terrains.jsonc';
import subterrainsData from '../database/subterrains.jsonc';
import { CP437_TO_UNICODE } from './cp437.js';

/**
 * Terrains.ts — Biome and subterrain definitions
 * Ported from Celestia: world/terrain/terrain_database.gd
 */

export interface BiomeDef {
  displayName: string;
  densityRange: [number, number];
  /** Baseline temperature in conceptual °C (SEASONS_WEATHER Subsystem 3). */
  baseTemp?: number;
}

export interface SubterrainDef {
  displayName: string;
  walkable: boolean;
  movementCost: number;
  fg: [number, number, number];
  bg: [number, number, number];
  chars: string[];
  /** Per-biome noise threshold ranges [min, max] where null = unbounded. */
  biomes?: Record<string, [number | null, number | null]>;
}

// ── Char helpers ──────────────────────────────────────────────────────────────
/**
 * tiles.bmp raw cell index (0–255, as shown in the dev spritesheet-viewer) → the Unicode char the
 * atlas registered that cell under. This MUST be the exact CP437 table `loadBitlandsAtlas` uses, or
 * a `{sheet:"tiles", id}` resolves to the wrong/blank cell — so both share `core/cp437`.
 */
const T = (n: number): string => CP437_TO_UNICODE[n] ?? String.fromCharCode(n);
/** Range of tiles.bmp indices → array of Unicode chars */
const TR = (from: number, to: number): string[] =>
  Array.from({ length: to - from + 1 }, (_, i) => T(from + i));
/** plants.bmp index → PUA Unicode char (U+E000 + n) */
const P = (n: number): string => String.fromCodePoint(0xe000 + n);
/** Range of plants.bmp indices → array of PUA chars */
const PR = (from: number, to: number): string[] =>
  Array.from({ length: to - from + 1 }, (_, i) => P(from + i));
/** map.bmp index → PUA Unicode char (U+E200 + n) */
const M = (n: number): string => String.fromCodePoint(0xe200 + n);
/** buildings.bmp index → PUA Unicode char (U+E400 + n) */
const B = (n: number): string => String.fromCodePoint(0xe400 + n);
/** items.bmp index → PUA Unicode char (U+E500 + n) */
const I = (n: number): string => String.fromCodePoint(0xe500 + n);
/** workshops.bmp index → PUA Unicode char (U+E600 + n) */
const W = (n: number): string => String.fromCodePoint(0xe600 + n);
/** creatures.bmp index → PUA Unicode char (U+E800 + n) */
const CR = (n: number): string => String.fromCodePoint(0xe800 + n);
/** races.bmp index → PUA Unicode char (U+E900 + n) */
const RA = (n: number): string => String.fromCodePoint(0xe900 + n);

// ── CharSpan resolver ─────────────────────────────────────────────────────────
export interface CharSpan {
  sheet?: 'tiles' | 'plants' | 'map' | 'buildings' | 'items' | 'workshops' | 'creatures' | 'races';
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
  creatures: CR,
  races: RA
};

export function resolveCharSpans(spans: CharSpan[]): string[] {
  return spans.flatMap((span) => {
    if (span.literal !== undefined) return [span.literal];
    const fn = SHEET_FN[span.sheet ?? 'plants'];
    if (span.id !== undefined) return [fn(span.id)];
    return Array.from({ length: span.to! - span.from! + 1 }, (_, i) => fn(span.from! + i));
  });
}

/**
 * Deterministically pick a char from a SubterrainDef's chars array based
 * on tile position. Returns the same char for the same (x, y) every time.
 */
export function pickChar(sub: { chars: string[] }, x: number, y: number): string {
  const { chars } = sub;
  if (chars.length === 1) return chars[0];
  const h = ((x * 1619 + y * 31337) >>> 0) % chars.length;
  return chars[h];
}
// ── Biomes ────────────────────────────────────────────────────────────────────
// density = primary noise output clamped to 0-1
// subterrainThresholds[i] is the detail-noise boundary between subterrains[i] and [i+1]
export const BIOMES: Record<string, BiomeDef> = Object.fromEntries(
  (terrainsData.biomes as unknown as Array<{ id: string } & Record<string, unknown>>).map((b) => [
    b.id,
    b
  ])
) as unknown as Record<string, BiomeDef>;

// ── Subterrains ───────────────────────────────────────────────────────────────
// Chars are resolved at load time from tile-index descriptors (charSpans) stored
// in terrains.json.  Each span references tiles.bmp or plants.bmp by sheet + index.
export const SUBTERRAINS: Record<string, SubterrainDef> = Object.fromEntries(
  (subterrainsData as unknown as Array<Record<string, unknown>>).map((sub) => [
    sub.id as string,
    {
      displayName: sub.displayName as string,
      walkable: sub.walkable as boolean,
      movementCost: sub.movementCost as number,
      fg: sub.fg as [number, number, number],
      bg: sub.bg as [number, number, number],
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

/**
 * Pick the subterrain for a given biome given a detail noise value (-1..1).
 * Each subterrain declares its own biome membership as a [min, max] range
 * (null = unbounded). Ranges are non-overlapping so the first match is unique.
 */
export function pickSubterrain(biomeName: string, detailNoise: number): string {
  for (const [id, def] of Object.entries(SUBTERRAINS)) {
    const range = def.biomes?.[biomeName];
    if (!range) continue;
    const [min, max] = range;
    if ((min === null || detailNoise >= min) && (max === null || detailNoise < max)) {
      return id;
    }
  }
  return 'dirt'; // fallback
}

/**
 * Pick a biome for a given density value (0..1) clamped from primary noise.
 * Returns null if no biome covers that density (tile will be bare land).
 */
export function pickBiome(density: number): string | null {
  for (const [name, def] of Object.entries(BIOMES)) {
    if (density >= def.densityRange[0] && density < def.densityRange[1]) return name;
  }
  return null;
}
