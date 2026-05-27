import terrainsData from '../database/terrains.json';
import subterrainsData from '../database/subterrains.json';

/**
 * Terrains.ts — Biome and subterrain definitions
 * Ported from Celestia: world/terrain/terrain_database.gd
 */

export interface BiomeDef {
    densityRange: [number, number];
}

export interface SubterrainDef {
    walkable: boolean;
    movementCost: number;
    fg: [number, number, number];
    bg: [number, number, number];
    chars: string[];
    /** Per-biome noise threshold ranges [min, max] where null = unbounded. */
    biomes?: Record<string, [number | null, number | null]>;
}

// ── Char helpers ──────────────────────────────────────────────────────────────
/** tiles.bmp index → CP437-mapped Unicode char */
const T = (n: number): string => {
    if (n >= 32 && n <= 126) return String.fromCharCode(n);
    if (n === 3) return '\u2665'; // ♥  cave mouth
    if (n === 176) return '\u2591'; // ░  light shade
    if (n === 177) return '\u2592'; // ▒  medium shade
    if (n === 178) return '\u2593'; // ▓  dark shade
    if (n === 209) return '\u2564'; // ╤  trunk cross-section
    if (n === 219) return '\u2588'; // █  full block
    return String.fromCharCode(n);  // best-effort fallback
};
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

// ── CharSpan resolver ─────────────────────────────────────────────────────────
export interface CharSpan {
    sheet?: 'tiles' | 'plants' | 'map' | 'buildings' | 'items' | 'workshops';
    from?: number;
    to?: number;
    id?: number;
    literal?: string;
}

type SheetFn = (n: number) => string;
const SHEET_FN: Record<string, SheetFn> = {
    tiles: T, plants: P, map: M, buildings: B, items: I, workshops: W
};

export function resolveCharSpans(spans: CharSpan[]): string[] {
    return spans.flatMap(span => {
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
export const BIOMES: Record<string, BiomeDef> =
    terrainsData.biomes as unknown as Record<string, BiomeDef>;

// ── Subterrains ───────────────────────────────────────────────────────────────
// Chars are resolved at load time from tile-index descriptors (charSpans) stored
// in terrains.json.  Each span references tiles.bmp or plants.bmp by sheet + index.
export const SUBTERRAINS: Record<string, SubterrainDef> = Object.fromEntries(
    (Object.entries(subterrainsData) as [string, Record<string, unknown>][]).map(
        ([id, sub]) => [
            id,
            {
                walkable: sub.walkable as boolean,
                movementCost: sub.movementCost as number,
                fg: sub.fg as [number, number, number],
                bg: sub.bg as [number, number, number],
                chars: resolveCharSpans(sub.charSpans as CharSpan[]),
                biomes: sub.biomes as Record<string, [number | null, number | null]> | undefined
            } satisfies SubterrainDef
        ]
    )
);

export const SUBTERRAIN_FALLBACK: SubterrainDef = {
    walkable: true, movementCost: 1.0,
    chars: ['?'], fg: [0.5, 0.5, 0.5], bg: [0.03, 0.03, 0.03]
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
