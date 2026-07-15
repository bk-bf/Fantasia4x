/**
 * Resources.ts — Tile-level resource definitions
 * Backward-compatible projection sourced from external database files.
 */

import resourceObjectsData from '../database/world/resources.jsonc';

export interface ResourceDef {
  displayName: string;
  terrainSubtypes: string[];
  resourceAmount: [number, number]; // [min, max] per tile
  harvestTime: number; // turns
}

export const RESOURCES: Record<string, ResourceDef> = Object.fromEntries(
  (
    resourceObjectsData as unknown as Array<{
      id: string;
      displayName: string;
      spawn: { subterrains: Record<string, number> };
      nodeAmountRange: number[];
      interaction: { workAmount: number };
    }>
  ).map((def) => [
    def.id,
    {
      displayName: def.displayName,
      terrainSubtypes: Object.keys(def.spawn.subterrains),
      resourceAmount: [def.nodeAmountRange[0], def.nodeAmountRange[1]] as [number, number],
      harvestTime: def.interaction.workAmount
    }
  ])
);
