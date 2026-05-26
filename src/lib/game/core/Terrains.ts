/**
 * Terrains.ts — Biome and subterrain definitions
 * Ported from Celestia: world/terrain/terrain_database.gd
 */

export interface BiomeDef {
    densityRange: [number, number];
    walkable: boolean;
    movementCost: number;
    /** Ground-cover subterrains selected by detail noise threshold. */
    subterrains: string[];
    subterrainThresholds: number[]; // length = subterrains.length - 1
    /**
     * Object scatter: subterrain name → probability per tile (0–1).
     * Evaluated in order; first hit wins. Remaining probability = bare ground.
     */
    objects?: Record<string, number>;
}

export interface SubterrainDef {
    walkable: boolean;
    movementCost: number;
    // RGB 0-1 for WebGL renderer
    fg: [number, number, number];
    bg: [number, number, number];
    /** One or more glyph chars. When multiple, pickChar() selects by tile position. */
    chars: string[];
}

// ── Char helpers ──────────────────────────────────────────────────────────────
/** tiles.bmp index → CP437-mapped Unicode char */
const T = (n: number): string => {
    if (n >= 32 && n <= 126) return String.fromCharCode(n);
    if (n === 3)   return '\u2665'; // ♥  cave mouth
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

/**
 * Deterministically pick a char from a SubterrainDef's chars array based
 * on tile position. Returns the same char for the same (x, y) every time.
 */
export function pickChar(sub: SubterrainDef, x: number, y: number): string {
    const { chars } = sub;
    if (chars.length === 1) return chars[0];
    const h = ((x * 1619 + y * 31337) >>> 0) % chars.length;
    return chars[h];
}

// ── Biomes ────────────────────────────────────────────────────────────────────
// density = primary noise output clamped to 0-1
// subterrainThresholds[i] is the detail-noise boundary between subterrains[i] and [i+1]

export const BIOMES: Record<string, BiomeDef> = {
    forest: {
        densityRange: [0.52, 0.70],
        walkable: true,
        movementCost: 1.5,
        // Ground cover only — objects are scattered separately
        subterrains: ['dirt', 'grass', 'deep_grass'],
        subterrainThresholds: [-0.3, 0.3],
        objects: {
            tree:           0.14,
            bush:           0.08,
            fallen_logs:    0.020,
            tree_stump:     0.014,
            mushroom_patch: 0.010,
        }
    },
    swamp: {
        densityRange: [0.18, 0.28],
        walkable: true,
        movementCost: 2.0,
        subterrains: ['shallow_water', 'mud', 'bog', 'clay', 'moss', 'quicksand'],
        subterrainThresholds: [-0.5, -0.2, 0.2, 0.5, 0.70],
        objects: {
            dead_trees: 0.015,
        }
    },
    plains: {
        densityRange: [0.28, 0.52],
        walkable: true,
        movementCost: 1.0,
        subterrains: ['dirt', 'grass', 'tall_grass', 'savanna'],
        subterrainThresholds: [-0.15, 0.15, 0.70],
        objects: {
            wildflowers: 0.015,
            scrubland:   0.008,
            bush:        0.015,
        }
    },
    mountain: {
        densityRange: [0.70, 1.00],
        walkable: false,
        movementCost: 3.0,
        // mineral_deposit is noise-based (last threshold slot); crystals + arcane are scattered
        subterrains: ['rocky', 'cave', 'cliff', 'mineral_deposit'],
        subterrainThresholds: [-0.3, 0.35, 0.85],
        objects: {
            crystal_formation: 0.005,
            arcane_glade:      0.002,
        }
    },
    river: {
        densityRange: [0.00, 0.18],
        walkable: true,
        movementCost: 2.5,
        subterrains: ['shallow_water', 'water', 'rapids', 'riverbank'],
        subterrainThresholds: [-0.6, -0.3, 0.0, 0.3]
    }
};

// ── Subterrains ───────────────────────────────────────────────────────────────
// All chars are resolved against bitlands_combined.png:
//   Normal chars → top half (bitlands_tiles.bmp, font fallback for empty cells)
//   P(n)         → bottom half (bitlands_plants.bmp, font fallback for empty cells)
//
// Key tile coverages (white pixels / 216 total):
//   tiles[96] ` : 5.6%  tiles[39] ' : 18.5%  tiles[58] : : 25.0%
//   tiles[44] , : 27.3%  tiles[34] " : 25.9%  tiles[46] . : 54.6%
//   plants[5]  TREE_BROAD : 46.3%   plants[6]  SHRUB_LEAFY : 33.8%
//   plants[11] TREE_SHROOM: 32.4%   plants[23] TREE_PINE   : 51.4%
//   plants[42] FLOWERY    : 40.3%   plants[94] SPARSE_CROSS: 17.6%
//   tiles[30]  ▲ empty → font fallback   tiles[126] ~ empty → font fallback
//
// fg   = color for dark/opaque pixels in the sprite
// bg   = cell background (fills the whole tile behind the sprite)

// ── Color guide ──────────────────────────────────────────────────────────────
// fg = sprite color (opaque pixels of the tile art)
// bg = cell background fill — set to a VISIBLE warm dark brown on all land tiles,
//      dark blue for water. This creates a pervasive warm-amber tint analogous to
//      the blue tint in the DF reference screenshot.
// All fg hues shifted +0.04 red / -0.05 blue (warm amber bias) while keeping
// greens green, blues blue, etc.

export const SUBTERRAINS: Record<string, SubterrainDef> = {
    // ── Forest ───────────────────────────────────────────────────────────────
    dirt: { walkable: true, movementCost: 1.2, chars: TR(64, 71), fg: [0.46, 0.30, 0.09], bg: [0.10, 0.07, 0.03] },
    grass: { walkable: true, movementCost: 1.0, chars: TR(72, 79), fg: [0.52, 0.68, 0.13], bg: [0.08, 0.10, 0.03] },
    deep_grass: { walkable: true, movementCost: 1.5, chars: PR(83, 84), fg: [0.38, 0.56, 0.09], bg: [0.07, 0.09, 0.03] },
    bush: { walkable: true, movementCost: 1.8, chars: [P(41)], fg: [0.26, 0.46, 0.05], bg: [0.07, 0.09, 0.03] }, // plants 41    shrub
    tree: { walkable: true, movementCost: 2.0, chars: PR(0, 71), fg: [0.52, 0.72, 0.11], bg: [0.07, 0.10, 0.03] }, // plants 0-71  72 tree/plant varieties
    tree_stump: { walkable: true, movementCost: 2.0, chars: [T(209)], fg: [0.56, 0.34, 0.09], bg: [0.10, 0.07, 0.03] }, // tiles 209    ╤ trunk cross-section
    fallen_logs: { walkable: true, movementCost: 2.2, chars: [P(209)], fg: [0.48, 0.26, 0.05], bg: [0.10, 0.06, 0.03] }, // plants 209
    mushroom_patch: { walkable: true, movementCost: 1.6, chars: [P(120)], fg: [0.86, 0.52, 0.33], bg: [0.10, 0.06, 0.03] }, // plants 120   mushroom (121-123 are empty)
    // ── Swamp ────────────────────────────────────────────────────────────────
    shallow_water: { walkable: true, movementCost: 2.5, chars: ['~'], fg: [0.20, 0.52, 0.41], bg: [0.04, 0.07, 0.08] },
    water: { walkable: false, movementCost: 0.0, chars: ['~'], fg: [0.16, 0.36, 0.55], bg: [0.03, 0.04, 0.12] },
    mud: { walkable: true, movementCost: 3.0, chars: ['.'], fg: [0.34, 0.22, 0.09], bg: [0.10, 0.07, 0.04] },
    bog: { walkable: true, movementCost: 3.5, chars: [','], fg: [0.30, 0.28, 0.07], bg: [0.08, 0.08, 0.03] },
    clay: { walkable: true, movementCost: 2.8, chars: ['"'], fg: [0.68, 0.36, 0.13], bg: [0.10, 0.07, 0.03] },
    moss: { walkable: true, movementCost: 1.5, chars: [P(16)], fg: [0.30, 0.48, 0.09], bg: [0.07, 0.09, 0.03] },
    quicksand: { walkable: true, movementCost: 25.0, chars: ['.'], fg: [0.70, 0.52, 0.25], bg: [0.10, 0.08, 0.03] },
    dead_trees: { walkable: true, movementCost: 2.5, chars: PR(164, 166), fg: [0.44, 0.36, 0.21], bg: [0.10, 0.07, 0.03] }, // plants 164-166 bare branches
    // ── Mountain (no peak) ───────────────────────────────────────────────────
    rocky: { walkable: true, movementCost: 2.5, chars: TR(177, 178), fg: [0.62, 0.52, 0.37], bg: [0.11, 0.08, 0.04] },
    cave: { walkable: true, movementCost: 1.0, chars: [T(3)], fg: [0.26, 0.18, 0.09], bg: [0.07, 0.05, 0.03] }, // tiles 3  ♥ cave mouth
    cliff: { walkable: false, movementCost: 0.0, chars: [T(219)], fg: [0.50, 0.42, 0.27], bg: [0.11, 0.08, 0.04] },
    mineral_deposit: { walkable: true, movementCost: 2.8, chars: TR(43, 47), fg: [0.92, 0.76, 0.13], bg: [0.11, 0.08, 0.03] }, // tiles 43-47 ore veins, bright gold
    crystal_formation: { walkable: true, movementCost: 2.0, chars: TR(48, 55), fg: [0.40, 0.84, 0.79], bg: [0.06, 0.08, 0.10] }, // tiles 48-55 crystal shards, warm cyan
    arcane_glade: { walkable: true, movementCost: 1.5, chars: [...TR(40, 42), ...TR(56, 57)], fg: [0.86, 0.50, 0.79], bg: [0.09, 0.05, 0.09] }, // tiles 40-42 + 56-57 arcane symbols
    // ── Plains ───────────────────────────────────────────────────────────────
    tall_grass: { walkable: true, movementCost: 1.3, chars: PR(83, 84), fg: [0.24, 0.42, 0.06], bg: [0.05, 0.07, 0.02] },
    wildflowers: { walkable: true, movementCost: 1.1, chars: PR(89, 111), fg: [0.88, 0.42, 0.71], bg: [0.09, 0.06, 0.06] }, // plants 89-111 flower varieties
    scrubland: { walkable: true, movementCost: 1.7, chars: [P(21)], fg: [0.48, 0.34, 0.09], bg: [0.10, 0.07, 0.03] },
    savanna: { walkable: true, movementCost: 1.2, chars: TR(35, 37), fg: [0.82, 0.64, 0.15], bg: [0.10, 0.08, 0.03] }, // tiles 35-37 '#','$','%' sparse = open plain
    // ── River ────────────────────────────────────────────────────────────────
    rapids: { walkable: false, movementCost: 0.0, chars: ['~'], fg: [0.38, 0.80, 0.91], bg: [0.03, 0.06, 0.16] },
    riverbank: { walkable: true, movementCost: 1.4, chars: ['#'], fg: [0.58, 0.44, 0.13], bg: [0.10, 0.07, 0.03] }, // tiles 35 '#' = sandy bank
};

// Fallback for any subterrain not in the table
export const SUBTERRAIN_FALLBACK: SubterrainDef = {
    walkable: true, movementCost: 1.0,
    chars: ['?'], fg: [0.5, 0.5, 0.5], bg: [0.03, 0.03, 0.03]
};

/**
 * Pick the subterrain for a given biome given a detail noise value (-1..1).
 */
export function pickSubterrain(biome: BiomeDef, detailNoise: number): string {
    const { subterrains, subterrainThresholds } = biome;
    for (let i = 0; i < subterrainThresholds.length; i++) {
        if (detailNoise < subterrainThresholds[i]) return subterrains[i];
    }
    return subterrains[subterrains.length - 1];
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
