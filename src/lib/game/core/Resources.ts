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
    }
};
