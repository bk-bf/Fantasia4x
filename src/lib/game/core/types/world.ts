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
  resources: Record<string, number>;
  /** resourceId → turn number when that resource finishes regrowing (persistent resources). */
  resourceCooldowns?: Record<string, number>;
  territoryOwner: string;
  // A* scratch fields (reset before each pathfind, not persisted)
  gCost?: number;
  hCost?: number;
  fCost?: number;
  parent?: { x: number; y: number } | null;
}
