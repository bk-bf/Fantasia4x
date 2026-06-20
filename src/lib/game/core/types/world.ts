// World map tile. Split out of the former monolithic core/types.ts (P-4); re-exported via the
// core/types.ts barrel so existing `from '../core/types'` imports are unchanged.

export interface WorldTile {
  x: number;
  y: number;
  type: 'land' | 'water' | 'mountain' | 'forest';
  discovered: boolean;
  ascii: string;
  // Phase 2 — rich terrain
  terrainType: string;
  subType: string;
  density: number;
  moisture: number;
  temperature: number;
  movementCost: number;
  walkable: boolean;
  /** Combat line-of-sight occluder (RANGED-COMBAT Part VII). Baked alongside `walkable`: true on a
   *  wall building's tile and on natural rock (cliff / mountain_wall / cliff_wall), false on water and
   *  see-through non-walkables (campfire, furnace). `hasLineOfSight` reads this one flag per cell. */
  blocksSight?: boolean;
  resources: Record<string, number>;
  /** resourceId → turn number when that resource finishes regrowing (persistent resources). */
  resourceCooldowns?: Record<string, number>;
  /** Accumulated snow cover 0–100 (SEASONS_WEATHER). Builds while it's snowing AND temp < 0°C,
   *  faster on wetter tiles; melts above 0°C. Whitens the terrain/resource layer in buildGameGrid.
   *  Ships to the renderer in the slim worldMapDelta (it is a visible per-tile field). */
  snow?: number;
  territoryOwner: string;
  // A* scratch fields (reset before each pathfind, not persisted)
  gCost?: number;
  hCost?: number;
  fCost?: number;
  parent?: { x: number; y: number } | null;
}
