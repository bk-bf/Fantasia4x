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
        subterrains: ['dirt', 'grass', 'deep_grass', 'bush', 'tree', 'tree_stump', 'fallen_logs', 'mushroom_patch'],
        subterrainThresholds: [-0.8, -0.6, -0.4, -0.2, 0.4, 0.7, 0.9]
    },
    swamp: {
        densityRange: [0.20, 0.30],
        walkable: true,
        movementCost: 2.0,
        subterrains: ['shallow_water', 'mud', 'bog', 'clay', 'moss', 'quicksand', 'dead_trees'],
        subterrainThresholds: [-0.8, -0.6, -0.4, -0.2, 0.2, 0.6, 0.8]
    },
    plains: {
        densityRange: [0.30, 0.45],
        walkable: true,
        movementCost: 1.0,
        subterrains: ['dirt', 'grass', 'bush', 'deep_grass', 'tall_grass', 'wildflowers', 'scrubland', 'savanna'],
        subterrainThresholds: [-0.8, -0.6, -0.4, -0.2, 0.4, 0.6, 0.8]
    },
    mountain: {
        densityRange: [0.60, 1.00],
        walkable: false,
        movementCost: 3.0,
        subterrains: ['rocky', 'peak', 'cave', 'cliff', 'mineral_deposit', 'crystal_formation', 'arcane_glade'],
        subterrainThresholds: [-0.6, -0.3, 0.0, 0.3, 0.6, 0.85, 0.95]
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

export const SUBTERRAINS: Record<string, SubterrainDef> = {
    // Forest
    dirt: { walkable: true, movementCost: 1.2, char: '·', fg: [0.56, 0.36, 0.18], bg: [0.04, 0.03, 0.01] },
    grass: { walkable: true, movementCost: 1.0, char: '.', fg: [0.38, 0.62, 0.22], bg: [0.03, 0.06, 0.01] },
    deep_grass: { walkable: true, movementCost: 1.5, char: '"', fg: [0.25, 0.52, 0.18], bg: [0.02, 0.07, 0.01] },
    bush: { walkable: true, movementCost: 1.8, char: '♣', fg: [0.18, 0.38, 0.12], bg: [0.02, 0.05, 0.01] },
    tree: { walkable: true, movementCost: 2.0, char: '♦', fg: [0.13, 0.55, 0.13], bg: [0.01, 0.07, 0.01] },
    tree_stump: { walkable: true, movementCost: 2.0, char: '╥', fg: [0.55, 0.32, 0.10], bg: [0.03, 0.04, 0.01] },
    fallen_logs: { walkable: true, movementCost: 2.2, char: '═', fg: [0.54, 0.27, 0.07], bg: [0.03, 0.03, 0.01] },
    mushroom_patch: { walkable: true, movementCost: 1.6, char: '∩', fg: [0.80, 0.40, 0.40], bg: [0.04, 0.03, 0.02] },
    // Swamp
    shallow_water: { walkable: true, movementCost: 2.5, char: '≈', fg: [0.10, 0.62, 0.62], bg: [0.01, 0.05, 0.08] },
    water: { walkable: false, movementCost: 0.0, char: '~', fg: [0.20, 0.45, 0.80], bg: [0.01, 0.04, 0.12] },
    mud: { walkable: true, movementCost: 3.0, char: '~', fg: [0.36, 0.25, 0.18], bg: [0.04, 0.03, 0.02] },
    bog: { walkable: true, movementCost: 3.5, char: '%', fg: [0.25, 0.25, 0.18], bg: [0.03, 0.03, 0.01] },
    clay: { walkable: true, movementCost: 2.8, char: '·', fg: [0.69, 0.40, 0.20], bg: [0.05, 0.03, 0.01] },
    moss: { walkable: true, movementCost: 1.5, char: '"', fg: [0.42, 0.52, 0.22], bg: [0.02, 0.05, 0.01] },
    quicksand: { walkable: true, movementCost: 25.0, char: '~', fg: [0.76, 0.60, 0.40], bg: [0.06, 0.05, 0.02] },
    dead_trees: { walkable: true, movementCost: 2.5, char: 'T', fg: [0.36, 0.25, 0.18], bg: [0.03, 0.02, 0.01] },
    // Mountain
    rocky: { walkable: true, movementCost: 2.5, char: '░', fg: [0.60, 0.60, 0.58], bg: [0.05, 0.05, 0.05] },
    peak: { walkable: false, movementCost: 0.0, char: '▲', fg: [0.78, 0.78, 0.76], bg: [0.06, 0.06, 0.06] },
    cave: { walkable: true, movementCost: 1.0, char: '○', fg: [0.20, 0.20, 0.20], bg: [0.02, 0.02, 0.02] },
    cliff: { walkable: false, movementCost: 0.0, char: '█', fg: [0.40, 0.40, 0.40], bg: [0.04, 0.04, 0.04] },
    mineral_deposit: { walkable: true, movementCost: 2.8, char: '¤', fg: [0.80, 0.80, 0.10], bg: [0.05, 0.05, 0.02] },
    crystal_formation: { walkable: true, movementCost: 2.0, char: '✦', fg: [0.40, 0.90, 0.90], bg: [0.02, 0.06, 0.06] },
    arcane_glade: { walkable: true, movementCost: 1.5, char: '☼', fg: [0.90, 0.60, 0.90], bg: [0.04, 0.02, 0.06] },
    // Plains
    tall_grass: { walkable: true, movementCost: 1.3, char: '|', fg: [0.48, 0.60, 0.22], bg: [0.03, 0.06, 0.01] },
    wildflowers: { walkable: true, movementCost: 1.1, char: '¥', fg: [0.85, 0.44, 0.84], bg: [0.03, 0.05, 0.02] },
    scrubland: { walkable: true, movementCost: 1.7, char: ';', fg: [0.42, 0.26, 0.15], bg: [0.04, 0.03, 0.01] },
    savanna: { walkable: true, movementCost: 1.2, char: ',', fg: [0.82, 0.72, 0.20], bg: [0.05, 0.04, 0.01] },
    // River
    rapids: { walkable: false, movementCost: 0.0, char: '≡', fg: [0.20, 0.80, 1.00], bg: [0.01, 0.05, 0.12] },
    riverbank: { walkable: true, movementCost: 1.4, char: '.', fg: [0.54, 0.38, 0.18], bg: [0.04, 0.03, 0.01] }
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
