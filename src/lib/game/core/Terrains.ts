import terrainsData from '../database/terrains.jsonc';
import subterrainsData from '../database/subterrains.jsonc';
import { CP437_TO_UNICODE } from './cp437.js';
import mshockAtlasMap from './mshock-atlas.json';
import type { WorldTile } from './types';

/**
 * MShockXotto+ tiles occupy PUA codepoints starting here (bitlands uses U+E000–U+E9FF).
 * A `{sheet:"mshock", tile:"t_grass"}` charSpan resolves to U+EA00 + mshock-atlas.json[tile];
 * the renderer (font-atlas extendAtlasWithNamedSheet) registers those codepoints' atlas cells,
 * and the shader draws them full-colour (a_fullColor) instead of luminance-tinting. */
export const MSHOCK_PUA_BASE = 0xea00;
/** Atlas tile rects: [name, x, y, w, h] in packing order. Index = order = PUA offset. */
export type MshockTile = [string, number, number, number, number];
export const MSHOCK_TILES = (mshockAtlasMap.tiles as MshockTile[]) ?? [];
const MSHOCK_INDEX: Record<string, number> = {};
MSHOCK_TILES.forEach((t, i) => {
  MSHOCK_INDEX[t[0]] = i;
});

function mshockChar(tile: string): string | undefined {
  const i = MSHOCK_INDEX[tile];
  return i === undefined ? undefined : String.fromCodePoint(MSHOCK_PUA_BASE + i);
}

/**
 * CDDA multitile connection variants. A ground tile picks one by which cardinal neighbours share its
 * subType: surrounded → `center`; an isolated patch → `unconnected`; a region's border → an edge/
 * corner/end/t_connection whose sprite blends the ground out toward the *different* neighbour. Ultica's
 * dirt sprites are opaque grass→dirt transitions, so a dirt patch feathers into the grass around it.
 */
export const AUTOTILE_VARIANTS = [
  'center', 'edge_ns', 'edge_ew', 'corner_ne', 'corner_nw', 'corner_se', 'corner_sw',
  'end_piece_n', 'end_piece_e', 'end_piece_s', 'end_piece_w',
  't_connection_n', 't_connection_e', 't_connection_s', 't_connection_w', 'unconnected'
] as const;

/** Build variant→glyph map for an autotile ground (base "t_dirt" → t_dirt_center, t_dirt_edge_ns, …). */
function buildAutotileChars(base: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const v of AUTOTILE_VARIANTS) {
    const c = mshockChar(`${base}_${v}`);
    if (c) out[v] = c;
  }
  return out;
}

/**
 * Terrains.ts — Biome and subterrain definitions
 * Ported from Celestia: world/terrain/terrain_database.gd
 */

export interface BiomeDef {
  displayName: string;
  densityRange: [number, number];
  /** Baseline temperature in conceptual °C (SEASONS_WEATHER Subsystem 3). */
  baseTemp?: number;
  /** Baseline wetness 0–100% (SEASONS_WEATHER display; weather adds on top). */
  baseMoisture?: number;
}

export interface SubterrainDef {
  displayName: string;
  walkable: boolean;
  /** Blocks combat line-of-sight (RANGED-COMBAT Part VII). Data-driven, like a building/resource's
   *  `blocksSight`: true only for opaque terrain (a `cliff`). Water is non-walkable but see-through, so
   *  it stays unset. Baked onto `tile.blocksSight` at worldgen. */
  blocksSight?: boolean;
  movementCost: number;
  fg: [number, number, number];
  bg: [number, number, number];
  chars: string[];
  /** When set, this ground autotiles: variant suffix → glyph char. The renderer picks the variant by
   *  cardinal-neighbour connectivity (see applyTileToGrid) so dirt feathers into the surrounding grass. */
  autotile?: Record<string, string>;
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
/** crops.bmp index → PUA Unicode char (U+E700 + n) */
const CROP = (n: number): string => String.fromCodePoint(0xe700 + n);
/** creatures.bmp index → PUA Unicode char (U+E800 + n) */
const CR = (n: number): string => String.fromCodePoint(0xe800 + n);
/** races.bmp index → PUA Unicode char (U+E900 + n) */
const RA = (n: number): string => String.fromCodePoint(0xe900 + n);

// ── CharSpan resolver ─────────────────────────────────────────────────────────
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
    | 'races'
    | 'mshock';
  from?: number;
  to?: number;
  id?: number;
  literal?: string;
  /** MShockXotto+ tile id (e.g. "t_grass", "f_anvil"). Used with sheet:"mshock". */
  tile?: string;
}

type SheetFn = (n: number) => string;
// Every sheet loaded into the atlas (loadBitlandsAtlas) must appear here, or a charSpans referencing
// it resolves to `undefined(id)` and throws at module load — crashing the whole app (a 500 in dev).
const SHEET_FN: Record<string, SheetFn> = {
  tiles: T,
  plants: P,
  map: M,
  buildings: B,
  items: I,
  workshops: W,
  crops: CROP,
  creatures: CR,
  races: RA
};

export function resolveCharSpans(spans: CharSpan[]): string[] {
  return spans.flatMap((span) => {
    if (span.literal !== undefined) return [span.literal];
    // MShockXotto+ named tiles: look the name up in the bundled atlas index → PUA codepoint.
    if (span.sheet === 'mshock' || span.tile !== undefined) {
      const idx = span.tile !== undefined ? MSHOCK_INDEX[span.tile] : undefined;
      if (idx === undefined) {
        console.warn(`resolveCharSpans: unknown mshock tile "${span.tile}" — fallback glyph`);
        return ['?'];
      }
      return [String.fromCodePoint(MSHOCK_PUA_BASE + idx)];
    }
    const fn = SHEET_FN[span.sheet ?? 'plants'];
    // Fail-soft: an unknown sheet name (typo, or a sheet not registered above) renders a visible
    // fallback glyph instead of throwing at import and 500-ing the whole game — a bad charSpans edit
    // should never crash the app, just look wrong on that one tile.
    if (!fn) {
      console.warn(`resolveCharSpans: unknown sheet "${span.sheet}" — using fallback glyph`);
      return ['?'];
    }
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

// ── Runtime biome tuning (Custom Map menu) ──────────────────────────────────────
// The Custom Map popup edits these live and re-runs world generation. `pickBiome` reads `BIOMES`
// directly, so mutating a biome's densityRange/baseTemp/baseMoisture here changes the next generated
// map with no other plumbing. Insertion order in BIOMES is preserved (Object.fromEntries), which is
// the order `pickBiome` scans — relevant because density ranges should stay contiguous.
export interface BiomeConfigEntry {
  id: string;
  displayName: string;
  /** This biome's slice of the elevation axis (0–1), i.e. its width on [0,1]. The Custom Map menu
   *  exposes this as a single 0–100 slider per biome instead of the raw min/max band. */
  share: number;
  baseTemp: number;
  baseMoisture: number;
}

// Snapshot of the on-disk defaults, captured once at load, so the menu's "reset" restores them.
const DEFAULT_BIOME_CONFIG: Record<
  string,
  { densityRange: [number, number]; baseTemp: number; baseMoisture: number }
> = Object.fromEntries(
  Object.entries(BIOMES).map(([id, d]) => [
    id,
    {
      densityRange: [d.densityRange[0], d.densityRange[1]] as [number, number],
      baseTemp: d.baseTemp ?? 0,
      baseMoisture: d.baseMoisture ?? 0
    }
  ])
);

// Biomes ordered low→high along the elevation axis (by default range start). Density bands are laid
// out contiguously in THIS order, so editing shares only changes widths, never the ordering.
const DENSITY_ORDER: string[] = Object.entries(DEFAULT_BIOME_CONFIG)
  .sort((a, b) => a[1].densityRange[0] - b[1].densityRange[0])
  .map(([id]) => id);

/** Current biome config (in elevation order), with each biome's share = its width on the [0,1] axis. */
export function getBiomeConfig(): BiomeConfigEntry[] {
  return DENSITY_ORDER.map((id) => {
    const d = BIOMES[id];
    return {
      id,
      displayName: d.displayName,
      share: d.densityRange[1] - d.densityRange[0],
      baseTemp: d.baseTemp ?? 0,
      baseMoisture: d.baseMoisture ?? 0
    };
  });
}

/**
 * Set every biome's share at once (the menu passes shares that already sum to ~1). Normalises, then
 * lays the biomes out as contiguous [0,1] bands in elevation order — so a share of 0 yields no tiles
 * of that biome and a share of 1 yields only that biome. Takes effect on the next `regenWorld`.
 */
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

/** Live-edit a biome's climate field; takes effect on the next `regenWorld`. */
export function setBiomeField(id: string, field: 'baseTemp' | 'baseMoisture', value: number): void {
  const d = BIOMES[id];
  if (!d) return;
  if (field === 'baseTemp') d.baseTemp = value;
  else d.baseMoisture = value;
}

// ── Runtime water level (Custom Map menu) ───────────────────────────────────────
// Water is decoupled from biomes (it used to be a swamp/river-only subterrain, so it pooled almost
// entirely in swamps). WorldGenerator now places it from a dedicated low-frequency water field
// wherever that field falls below this threshold AND the tile isn't a mountain peak — so lakes form
// in any lowland biome. The menu exposes it as a single 0–100 "water" slider. 0 = no water.
const DEFAULT_WATER_LEVEL = 0.22;
let waterLevel = DEFAULT_WATER_LEVEL;
/** Fraction (0–1) of the water-noise field below which a non-mountain tile becomes water. */
export function getWaterLevel(): number {
  return waterLevel;
}
export function setWaterLevel(v: number): void {
  waterLevel = Math.max(0, Math.min(1, v));
}

/** Restore the on-disk terrains.jsonc defaults (biome bands + water level). */
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

// ── Subterrains ───────────────────────────────────────────────────────────────
/** Parse a `#rrggbb` hex colour into a normalised RGB (0–1) triple; falls back to `fallback`. */
function hexToRgb01(
  hex: unknown,
  fallback: [number, number, number]
): [number, number, number] {
  if (typeof hex !== 'string') return fallback;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
}

// Chars are resolved at load time from tile-index descriptors (charSpans) stored
// in terrains.json.  Each span references tiles.bmp or plants.bmp by sheet + index.
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
      autotile: sub.autotile ? buildAutotileChars(sub.autotile as string) : undefined,
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

// ── PRODUCTION-CHAIN-II §F: soil fertility ─────────────────────────────────────────────────────
// Fertility is a 0–100% value per tile, depicted like wetness (`fertility 75%`). It is NOT a stored
// field — it's derived from the grass-density subterrain the world-gen noise already places (NOTES.md:
// bare dirt → 0%, grass → 25%, tall_grass → 50%, deep_grass → 75%; terra preta is the terraform-earned
// 100% peak). Quantised to 5 steps (0/25/50/75/100). `soilFertilityPct` is the value, `soilTierForTile`
// its 0–4 bucket (= pct/25) — the single reads every farming gate uses (plant eligibility, growth
// speed, dig yield). Dig (F2) strips a tile to `dirt` (0%); terraform (F3) sets `subType` to raise it.
export type SoilTier = 0 | 1 | 2 | 3 | 4;

const FERTILITY_PCT_BY_SUBTYPE: Record<string, number> = {
  dirt: 0,
  savanna: 0,
  grass: 25,
  tall_grass: 50,
  deep_grass: 75,
  terra_preta: 100
};

/** Soil fertility 0–100% for a tile (5 steps), derived from its grass-density subType — like wetness. */
export function soilFertilityPct(tile: { subType: string } | undefined | null): number {
  return tile ? (FERTILITY_PCT_BY_SUBTYPE[tile.subType] ?? 0) : 0;
}

/** Fertility bucket 0–4 (= pct/25) for discrete gates (plant eligibility, dig yield, terraform target). */
export function soilTierForTile(tile: { subType: string } | undefined | null): SoilTier {
  return (soilFertilityPct(tile) / 25) as SoilTier;
}

/** Human label for a soil tier (info panel — never leak the raw id). */
export const SOIL_TIER_NAME: Record<SoilTier, string> = {
  0: 'Barren Dirt',
  1: 'Poor Soil',
  2: 'Loam',
  3: 'Rich Soil',
  4: 'Terra Preta'
};

/** Soil ITEM id a tile of this tier yields when dug (F2) / consumed to terraform up to it (F3). */
export const SOIL_ITEM_BY_TIER: Record<SoilTier, string> = {
  0: 'dirt',
  1: 'poor_soil',
  2: 'loam',
  3: 'rich_soil',
  4: 'terra_preta'
};

/** The fertile `subType` a placed soil item produces — the inverse of SOIL_ITEM_BY_TIER (F3 terraform). */
export const SUBTYPE_BY_SOIL_TIER: Record<SoilTier, string> = {
  0: 'dirt',
  1: 'grass',
  2: 'tall_grass',
  3: 'deep_grass',
  4: 'terra_preta'
};

// Biomes where colonists and creatures may spawn. Mountains and water are excluded. NOTE: because
// water is now decoupled from biome (a "plains" tile can carry a water subType — see getWaterLevel),
// we must reject both non-spawnable biomes AND water subtypes, not just `walkable`.
const SPAWNABLE_BIOMES = new Set(['forest', 'plains', 'swamp']);
const WATER_SUBTYPES = new Set(['water', 'shallow_water', 'rapids']);

/**
 * Whether NATURAL terrain at a tile blocks combat line-of-sight (RANGED-COMBAT Part VII). Solid rock —
 * a `cliff` subterrain or a `mountain_wall`/`cliff_wall` resource — is non-walkable AND opaque; water is
 * non-walkable but see-through. So: non-walkable and not a water subtype. Buildings set `blocksSight`
 * explicitly from their def (walls block, campfires/furnaces don't) and do NOT use this rule.
 */
export function terrainBlocksSight(walkable: boolean, subType: string): boolean {
  return !walkable && !WATER_SUBTYPES.has(subType);
}

/** True only for walkable forest/plains/swamp land — the single gate for pawn AND creature spawning. */
export function isSpawnableTile(tile: WorldTile | undefined | null): boolean {
  if (!tile || !tile.walkable) return false;
  if (!SPAWNABLE_BIOMES.has(tile.terrainType)) return false;
  if (WATER_SUBTYPES.has(tile.subType)) return false;
  return true;
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
