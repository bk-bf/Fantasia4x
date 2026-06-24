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
  /**
   * Constructed indoor floor baked onto the tile by a floor building (BuildingService.applyBuildingFootprint),
   * cleared on deconstruct. `speed` multiplies the tile's movement cost (<1 = faster — boards/flagstones
   * beat mud/grass); `dryness` (0–1) cuts how wet the tile reads for an entity standing on it (you're on
   * dry boards, off the wet ground). Sim-side only (movement + wetness ticks).
   */
  floor?: { speed: number; dryness: number };
  /** Combat line-of-sight occluder (RANGED-COMBAT Part VII). Baked alongside `walkable`: true on a
   *  wall building's tile and on natural rock (cliff / mountain_wall / cliff_wall), false on water and
   *  see-through non-walkables (campfire, furnace). `hasLineOfSight` reads this one flag per cell. */
  blocksSight?: boolean;
  resources: Record<string, number>;
  /** resourceId → turn number when that resource finishes regrowing (persistent resources). */
  resourceCooldowns?: Record<string, number>;
  /**
   * PRODUCTION-CHAIN-II §F — per-node growth/maturity 0–100% (absent = 100% fully grown). Wild plants
   * roll 50–100% at world-gen and reset on harvest (0%, or a tree's 80% for branch-foraging); they
   * return to 100% on regrowth. CROPS start at 0% when sown and climb toward 100% ONLY while the tile
   * meets the crop's requirements (fertility/temp/wetness/light — `processCropGrowth`). Growth scales
   * harvest yield, and is shown as `growth XX%` in the tile inspector.
   */
  growth?: Record<string, number>;
  /**
   * PRODUCTION-CHAIN-II §F — accumulated fertility drawn by HARVESTED crops at the current soil tier
   * (0–100 = one tier). Each harvested crop adds its `crop.fertilityCost`; at 100 the tile's soil
   * drops one tier (terra preta → rich → loam → poor → barren `dirt`) and the wear carries the
   * remainder — so a crop gets ~WEAR_PER_TIER/fertilityCost harvests before its tile drops below its
   * `minSoil` and replanting is blocked. Only cultivated, reaped crops wear soil; wild plants and
   * crops that died never charge it.
   */
  fertilityWear?: number;
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
