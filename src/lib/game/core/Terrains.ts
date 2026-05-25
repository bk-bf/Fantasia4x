/**
 * Terrains.ts — Biome and subterrain definitions
 * Ported from Celestia: world/terrain/terrain_database.gd
 */

export interface BiomeDef {
    densityRange: [number, number];
    walkable: boolean;
    movementCost: number;
    subterrains: string[];
    subterrainThresholds: number[]; // length = subterrains.length - 1
}

export interface SubterrainDef {
    walkable: boolean;
    movementCost: number;
    // RGB 0-1 for WebGL renderer
    fg: [number, number, number];
    bg: [number, number, number];
    char: string;
}

// ── Biomes ────────────────────────────────────────────────────────────────────
// density = primary noise output clamped to 0-1
// subterrainThresholds[i] is the detail-noise boundary between subterrains[i] and [i+1]

export const BIOMES: Record<string, BiomeDef> = {
    forest: {
        densityRange: [0.50, 0.60],
        walkable: true,
        movementCost: 1.5,
        // Ground tiles dominate (60 %+); trees/bushes are rare features (~18 %)
        subterrains: ['dirt', 'grass', 'deep_grass', 'bush', 'tree', 'tree_stump', 'fallen_logs', 'mushroom_patch'],
        subterrainThresholds: [-0.3, 0.2, 0.5, 0.72, 0.85, 0.93, 0.97]
    },
    swamp: {
        densityRange: [0.20, 0.30],
        walkable: true,
        movementCost: 2.0,
        subterrains: ['shallow_water', 'mud', 'bog', 'clay', 'moss', 'quicksand', 'dead_trees'],
        subterrainThresholds: [-0.5, -0.2, 0.2, 0.5, 0.70, 0.88]
    },
    plains: {
        densityRange: [0.30, 0.45],
        walkable: true,
        movementCost: 1.0,
        // Ground dominates; bush pushed to rare end so ♣ covers < 10 % of plains
        subterrains: ['dirt', 'grass', 'deep_grass', 'tall_grass', 'scrubland', 'wildflowers', 'savanna', 'bush'],
        subterrainThresholds: [-0.3, 0.2, 0.5, 0.68, 0.80, 0.90, 0.97]
    },
    mountain: {
        densityRange: [0.60, 1.00],
        walkable: false,
        movementCost: 3.0,
        subterrains: ['rocky', 'cave', 'cliff', 'mineral_deposit', 'crystal_formation', 'arcane_glade'],
        subterrainThresholds: [-0.4, 0.0, 0.4, 0.7, 0.9]
    },
    river: {
        densityRange: [0.00, 0.20],
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

/** Reference a tile from the plants.bmp half of the combined atlas (U+E000 + n). */
const P = (n: number): string => String.fromCodePoint(0xe000 + n);

// ── Color guide ──────────────────────────────────────────────────────────────
// Each terrain keeps its natural color; only a subtle warm shift is applied:
//   greens   → slightly yellow-shifted  (e.g. [0.38, 0.56, 0.16] not [0, 0.56, 0])
//   blues    → slightly warm            (e.g. [0.14, 0.42, 0.70] not [0, 0, 0.70])
//   greys    → warm undertone           (e.g. [0.58, 0.52, 0.42] not [0.5, 0.5, 0.5])
//   bg       → very dark warm brown to match the game theme
// fg = color for opaque/white sprite pixels; bg = cell background fill.

export const SUBTERRAINS: Record<string, SubterrainDef> = {
    // ── Forest ───────────────────────────────────────────────────────────────
    dirt:          { walkable: true,  movementCost: 1.2, char: '\u0060',  fg: [0.40, 0.30, 0.14], bg: [0.04, 0.03, 0.01] }, // tiles[96]  5.6%  near-invisible dot
    grass:         { walkable: true,  movementCost: 1.0, char: ',',       fg: [0.38, 0.56, 0.16], bg: [0.03, 0.05, 0.01] }, // tiles[44] 27.3%  warm yellow-green
    deep_grass:    { walkable: true,  movementCost: 1.5, char: '.',       fg: [0.28, 0.50, 0.12], bg: [0.02, 0.04, 0.01] }, // tiles[46] 54.6%  medium green
    bush:          { walkable: true,  movementCost: 1.8, char: P(6),      fg: [0.22, 0.44, 0.10], bg: [0.02, 0.04, 0.01] }, // plants[6] 33.8%  darker green shrub
    tree:          { walkable: true,  movementCost: 2.0, char: P(5),      fg: [0.48, 0.72, 0.16], bg: [0.02, 0.05, 0.01] }, // plants[5] 46.3%  bright warm-green crown
    tree_stump:    { walkable: true,  movementCost: 2.0, char: ':',       fg: [0.52, 0.34, 0.14], bg: [0.04, 0.03, 0.01] }, // tiles[58] 25.0%  brown stump stipple
    fallen_logs:   { walkable: true,  movementCost: 2.2, char: '"',       fg: [0.44, 0.26, 0.10], bg: [0.04, 0.02, 0.01] }, // tiles[34] 25.9%  dark brown bark
    mushroom_patch:{ walkable: true,  movementCost: 1.6, char: P(11),     fg: [0.82, 0.52, 0.38], bg: [0.05, 0.02, 0.01] }, // plants[11] 32.4% warm coral-cream
    // ── Swamp ────────────────────────────────────────────────────────────────
    shallow_water: { walkable: true,  movementCost: 2.5, char: '~',       fg: [0.16, 0.52, 0.46], bg: [0.01, 0.05, 0.05] }, // tiles[126] font ~ — murky teal
    water:         { walkable: false, movementCost: 0.0, char: '~',       fg: [0.12, 0.36, 0.60], bg: [0.01, 0.03, 0.08] }, // tiles[126] font ~ — deep murky blue
    mud:           { walkable: true,  movementCost: 3.0, char: ':',       fg: [0.30, 0.22, 0.14], bg: [0.03, 0.02, 0.02] }, // tiles[58]  25.0%  dark mud
    bog:           { walkable: true,  movementCost: 3.5, char: ',',       fg: [0.26, 0.28, 0.12], bg: [0.02, 0.03, 0.01] }, // tiles[44]  27.3%  dark olive
    clay:          { walkable: true,  movementCost: 2.8, char: '"',       fg: [0.64, 0.36, 0.18], bg: [0.05, 0.03, 0.01] }, // tiles[34]  25.9%  terracotta
    moss:          { walkable: true,  movementCost: 1.5, char: "'",       fg: [0.28, 0.46, 0.14], bg: [0.02, 0.04, 0.01] }, // tiles[39]  18.5%  moss green
    quicksand:     { walkable: true,  movementCost: 25.0,char: '.',       fg: [0.66, 0.52, 0.30], bg: [0.06, 0.05, 0.02] }, // tiles[46]  54.6%  sandy tan (dense)
    dead_trees:    { walkable: true,  movementCost: 2.5, char: P(94),     fg: [0.40, 0.36, 0.26], bg: [0.03, 0.02, 0.01] }, // plants[94] 17.6%  pale grey-brown silhouette
    // ── Mountain (no peak — too noisy) ───────────────────────────────────────
    rocky:         { walkable: true,  movementCost: 2.5, char: '"',       fg: [0.58, 0.52, 0.42], bg: [0.05, 0.04, 0.03] }, // tiles[34]  25.9%  warm grey rock
    cave:          { walkable: true,  movementCost: 1.0, char: 'o',       fg: [0.22, 0.18, 0.14], bg: [0.02, 0.01, 0.01] }, // tiles[111] near-black opening
    cliff:         { walkable: false, movementCost: 0.0, char: '\u2588',  fg: [0.46, 0.40, 0.32], bg: [0.05, 0.04, 0.03] }, // tiles[219] solid block = cliff face
    mineral_deposit:   { walkable: true, movementCost: 2.8, char: '+',   fg: [0.88, 0.76, 0.18], bg: [0.06, 0.05, 0.01] }, // tiles[43]  bright gold ore
    crystal_formation: { walkable: true, movementCost: 2.0, char: P(94), fg: [0.36, 0.84, 0.84], bg: [0.02, 0.05, 0.06] }, // plants[94] 17.6%  bright cyan crystal
    arcane_glade:      { walkable: true, movementCost: 1.5, char: P(11), fg: [0.82, 0.50, 0.84], bg: [0.04, 0.02, 0.06] }, // plants[11] 32.4%  bright magenta arcane
    // ── Plains ───────────────────────────────────────────────────────────────
    tall_grass:    { walkable: true,  movementCost: 1.3, char: '"',       fg: [0.50, 0.56, 0.18], bg: [0.04, 0.05, 0.01] }, // tiles[34]  25.9%  warm golden-green
    wildflowers:   { walkable: true,  movementCost: 1.1, char: P(42),    fg: [0.84, 0.42, 0.76], bg: [0.04, 0.02, 0.04] }, // plants[42] 40.3%  bright pink-purple
    scrubland:     { walkable: true,  movementCost: 1.7, char: ':',       fg: [0.44, 0.32, 0.14], bg: [0.05, 0.03, 0.01] }, // tiles[58]  25.0%  olive-brown
    savanna:       { walkable: true,  movementCost: 1.2, char: '\u0060',  fg: [0.78, 0.64, 0.20], bg: [0.06, 0.05, 0.01] }, // tiles[96]   5.6%  bright golden dot
    // ── River ────────────────────────────────────────────────────────────────
    rapids:        { walkable: false, movementCost: 0.0, char: '~',       fg: [0.34, 0.80, 0.96], bg: [0.01, 0.05, 0.12] }, // tiles[126] font ~ — bright white-blue
    riverbank:     { walkable: true,  movementCost: 1.4, char: ',',       fg: [0.54, 0.42, 0.18], bg: [0.05, 0.04, 0.01] }  // tiles[44]  27.3%  sandy tan
};

// Fallback for any subterrain not in the table
export const SUBTERRAIN_FALLBACK: SubterrainDef = {
    walkable: true, movementCost: 1.0,
    char: '?', fg: [0.5, 0.5, 0.5], bg: [0.03, 0.03, 0.03]
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
