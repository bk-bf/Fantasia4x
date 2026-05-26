/**
 * Resources.ts — Tile-level resource definitions
 * Ported from Celestia: world/terrain/resource_database.gd
 */

export interface ResourceDef {
    displayName: string;
    terrainSubtypes: string[];
    resourceAmount: [number, number]; // [min, max] per tile
    harvestTime: number;              // turns
}

export const RESOURCES: Record<string, ResourceDef> = {
    wood: {
        displayName: 'Wood',
        terrainSubtypes: ['tree'],
        resourceAmount: [3, 6],
        harvestTime: 5.0
    },
    stone: {
        displayName: 'Stone',
        terrainSubtypes: ['rocky', 'cliff'], // peak removed — not a subterrain in Fantasia4x port
        resourceAmount: [5, 10],
        harvestTime: 8.0
    },
    herbs: {
        displayName: 'Herbs',
        terrainSubtypes: ['wildflowers', 'moss', 'deep_grass'],
        resourceAmount: [2, 5],
        harvestTime: 3.0
    },

    // ===== PHASE 6e — PRIMITIVE RESOURCES =====
    twig: {
        displayName: 'Twigs',
        terrainSubtypes: ['tree', 'bush', 'shrub', 'light_forest'],
        resourceAmount: [3, 8],
        harvestTime: 1.0
    },
    flint_shard: {
        displayName: 'Flint Shards',
        terrainSubtypes: ['rocky', 'cliff', 'gravel'],
        resourceAmount: [2, 5],
        harvestTime: 2.0
    },
    plant_fiber: {
        displayName: 'Plant Fiber',
        terrainSubtypes: ['deep_grass', 'wildflowers', 'marsh', 'reed_bed'],
        resourceAmount: [3, 7],
        harvestTime: 1.5
    },
    bark: {
        displayName: 'Bark',
        terrainSubtypes: ['tree', 'light_forest'],
        resourceAmount: [2, 4],
        harvestTime: 2.0
    },
    surface_stone: {
        displayName: 'Surface Stone',
        terrainSubtypes: ['rocky', 'cliff', 'gravel', 'plains'],
        resourceAmount: [4, 8],
        harvestTime: 1.5
    },
    clay_lump: {
        displayName: 'Clay',
        terrainSubtypes: ['riverbank', 'marsh', 'lake_shore', 'wetland'],
        resourceAmount: [3, 6],
        harvestTime: 2.0
    }
};
