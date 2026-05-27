/**
 * Resources.ts — Tile-level resource definitions
 * Backward-compatible projection sourced from external database files.
 */

import resourceObjectsData from '../database/resource-objects.json';

export interface ResourceDef {
    displayName: string;
    terrainSubtypes: string[];
    resourceAmount: [number, number]; // [min, max] per tile
    harvestTime: number;              // turns
}

export const RESOURCES: Record<string, ResourceDef> = Object.fromEntries(
    (resourceObjectsData as Array<{
        id: string;
        displayName: string;
        terrainSubtypes: string[];
        nodeAmountRange: number[];
        interaction: { workAmount: number };
    }>).map((def) => [
        def.id,
        {
            displayName: def.displayName,
            terrainSubtypes: def.terrainSubtypes,
            resourceAmount: [def.nodeAmountRange[0], def.nodeAmountRange[1]] as [number, number],
            harvestTime: def.interaction.workAmount
        }
    ])
);
