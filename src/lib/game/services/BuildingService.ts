import type { Building, GameState, PlacedBuilding } from '../core/types';
import buildingsData from '../database/buildings.jsonc';
import itemsData from '../database/items.jsonc';
import type { Item } from '../core/types';
import { resolveCharSpans } from '../core/Terrains';
import { markTileDirty } from '../core/tileDeltas';
import { patchPathfindingWalkable } from './PathfinderService';
import type { CharSpan } from '../core/Terrains';
import { rng } from '../core/rng';
import { perTick } from '../core/time';
import { aggregateMaterialMods } from '../core/materialProperties';
import {
  consumeFromStockpiles,
  addToStockpileZone,
  availableAggregateFromDrops,
  reserveForOrder,
  releaseReservation
} from '../core/GameState';

const AVAILABLE_BUILDINGS = buildingsData as unknown as Building[];
const ITEMS_DB = itemsData as unknown as Item[];

// `category:<cat>` cost-slot match. Local copy of ItemService.itemMatchesCostCategory (kept here to
// avoid a BuildingService↔ItemService import cycle): real categories match `item.category`; the
// pseudo-category `plank` matches ANY sawn plank so `category:plank` means "any plank".
function itemMatchesCostCategory(item: { id: string; category?: string }, cat: string): boolean {
  if (cat === 'plank') return item.id.endsWith('_plank');
  if (cat === 'log') return item.id.endsWith('_log');
  return item.category === cat;
}

// O(1) id lookup over the static building DB. `getBuildingById` was a per-call `.find()` and
// showed up hot in the sim worker profile (~3.6%); the DB never mutates at runtime, so index once.
let _buildingById: Map<string, Building> | null = null;
function buildingIndex(): Map<string, Building> {
  return (_buildingById ??= new Map(AVAILABLE_BUILDINGS.map((b) => [b.id, b])));
}

/**
 * BuildingService - Clean interface for building queries and validation
 * Separates business logic from data definitions
 */
export interface BuildingService {
  // Query Methods
  getBuildingById(id: string): Building | undefined;
  getBuildingsByCategory(category: string): Building[];
  getBuildingsByTier(tier: number): Building[];
  getBuildingsByRarity(rarity: string): Building[];
  getAvailableBuildings(gameState: GameState, category?: string): Building[];

  // Validation Methods
  canBuildBuilding(buildingId: string, gameState: GameState): boolean;
  hasRequiredResources(buildingId: string, gameState: GameState): boolean;
  /** Resolve buildingCost to concrete items to consume (supports `category:<cat>` slots), or null if
   *  unaffordable. `materialOverride` maps a cost key (e.g. `category:stone`) → a chosen itemId to
   *  spend preferentially for that slot (player's material pick); any shortfall auto-fills as before. */
  resolveBuildingCost(
    buildingId: string,
    gameState: GameState,
    materialOverride?: Record<string, string>
  ): Record<string, number> | null;
  hasRequiredResearch(buildingId: string, gameState: GameState): boolean;
  hasRequiredPopulation(buildingId: string, gameState: GameState): boolean;
  hasRequiredTools(buildingId: string, gameState: GameState): boolean;
  meetsStateRestrictions(buildingId: string, gameState: GameState): boolean;

  // Calculation Methods
  calculateBuildingCost(buildingId: string): Record<string, number>;
  calculateBuildingEffects(buildingId: string): Record<string, number>;
  calculateConstructionTime(buildingId: string, gameState: GameState): number;
  calculateBuildingEfficiency(buildingId: string, gameState: GameState): number;

  // Building Management
  getBuildingDependencies(buildingId: string): string[];
  getBuildingUnlocks(buildingId: string): Building[];
  getBuildingMaintenanceNeeds(buildingId: string): {
    upkeep: Record<string, number>;
    requirements: string[];
  };

  // ADR-016 station tiers: generic crafting stations form a tier ladder (craft_spot 0 →
  // makers_bench 1 → …); a higher tier supersedes lower ones and crafts their recipes faster.
  stationTier(buildingType: string): number | undefined;
  craftingBonusOf(buildingType: string): number;
  stationFulfills(haveType: string, recipeStation: string): boolean;
  bestCraftStation(recipeStation: string, gameState: GameState): PlacedBuilding | null;

  // Phase 4d: Tile-placed buildings. `materialOverride` (cost-key → chosen itemId) picks which
  // concrete item fills a `category:` cost slot (player's material choice).
  placeBuilding(
    type: string,
    x: number,
    y: number,
    gameState: GameState,
    materialOverride?: Record<string, string>
  ): GameState;
  hasCompletedBuilding(type: string, gameState: GameState): boolean;
  countCompletedBuildings(type: string, gameState: GameState): number;
  /** Apply a solid building's tile-blocking on completion / restore it on removal. No-op for
   *  passable buildings (def.walkable !== false) or if the tile already matches. */
  applyBuildingFootprint(state: GameState, building: PlacedBuilding, blocking: boolean): GameState;

  // UI Helper Methods
  getBuildingIcon(buildingId: string): string;
  getBuildingColor(buildingId: string): string;
  hasBuildings(buildingCounts: Record<string, number>, category: string): boolean;
  /** Resolve the map glyph character for a building from its charSpans. Falls back to '#'. */
  getBuildingGlyph(buildingId: string): string;
  /** Remove a placed building instance (cancel construction). */
  cancelBuilding(instanceId: string, gameState: GameState): GameState;
  /** Toggle the paused flag on a planned/under_construction building. */
  togglePausedBuilding(instanceId: string, gameState: GameState): GameState;
  /** Mark a completed building as queued for demolition (shows overlay; removal happens next turn). */
  deconstructBuilding(instanceId: string, gameState: GameState): GameState;
  /** Cancel a queued demolition — clears the deconstructQueued flag. */
  cancelDeconstructBuilding(instanceId: string, gameState: GameState): GameState;
  /** Remove all buildings flagged deconstructQueued and refund 50% of their materials. Called each turn. */
  processDeconstructionQueue(gameState: GameState): GameState;
  /** Assign (or unassign) a pawn to a shelter building. Pass null to clear the assignment. */
  assignShelterPawn(instanceId: string, pawnId: string | null, gameState: GameState): GameState;

  // ── §E Trapping ──
  /** Each complete trap rolls its `catchChance` per tick; on success its `catchItem` is added. */
  stepTraps(gameState: GameState): GameState;

  // ── Refactor Stage 1: structural condition (§B building wear) ──
  /** Decay complete buildings' `condition` by their def `conditionDecayPerTurn` (per-tick). */
  stepBuildingCondition(gameState: GameState): GameState;
  /** Restore a building to full condition, consuming a fraction of its build cost. No-op if unaffordable. */
  repairBuilding(instanceId: string, gameState: GameState): GameState;
}

/**
 * BuildingService Implementation
 */
export class BuildingServiceImpl implements BuildingService {
  getBuildingById(id: string): Building | undefined {
    return buildingIndex().get(id);
  }

  getBuildingsByCategory(category: string): Building[] {
    return AVAILABLE_BUILDINGS.filter((building) => building.category === category);
  }

  getBuildingsByTier(tier: number): Building[] {
    return AVAILABLE_BUILDINGS.filter((building) => building.tier === tier);
  }

  getBuildingsByRarity(rarity: string): Building[] {
    return AVAILABLE_BUILDINGS.filter((building) => building.rarity === rarity);
  }

  getAvailableBuildings(gameState: GameState, category?: string): Building[] {
    let buildings = AVAILABLE_BUILDINGS;

    // Filter by category if specified
    if (category) {
      buildings = buildings.filter((building) => building.category === category);
    }

    return buildings.filter((building) => this.canBuildBuilding(building.id, gameState));
  }

  canBuildBuilding(buildingId: string, gameState: GameState): boolean {
    const building = this.getBuildingById(buildingId);
    if (!building) return false;

    // Check all requirements
    return (
      this.hasRequiredResources(buildingId, gameState) &&
      this.hasRequiredResearch(buildingId, gameState) &&
      this.hasRequiredPopulation(buildingId, gameState) &&
      this.hasRequiredTools(buildingId, gameState) &&
      this.meetsStateRestrictions(buildingId, gameState)
    );
  }

  hasRequiredResources(buildingId: string, gameState: GameState): boolean {
    return this.resolveBuildingCost(buildingId, gameState) !== null;
  }

  /**
   * §A any-rock stations. Resolve a building's `buildingCost` to concrete item ids the colony can
   * actually pay, supporting **category cost slots** keyed `category:<cat>` (e.g. `category:stone`
   * = "8 of any stone"). Greedily covers each category slot from available stock without
   * double-spending across slots. Returns the concrete `{itemId: qty}` to consume, or null if
   * unaffordable. This is the building-cost analogue of a recipe's `acceptsCategory` slot.
   */
  resolveBuildingCost(
    buildingId: string,
    gameState: GameState,
    materialOverride?: Record<string, string>
  ): Record<string, number> | null {
    const building = this.getBuildingById(buildingId);
    if (!building?.buildingCost) return {};
    // ADR-016: pay from AVAILABLE stock (reserved-for-craft stacks excluded).
    const stock = availableAggregateFromDrops(gameState.droppedItems);
    const resolved: Record<string, number> = {};
    const used: Record<string, number> = {};

    for (const [key, cost] of Object.entries(building.buildingCost)) {
      if (key.startsWith('category:')) {
        const cat = key.slice('category:'.length);
        let need = cost as number;
        // Player's material pick for this slot is spent first; the auto-fill below covers any shortfall.
        const chosen = materialOverride?.[key];
        if (chosen) {
          const item = ITEMS_DB.find((i) => i.id === chosen);
          if (item && itemMatchesCostCategory(item, cat)) {
            const avail = (stock[item.id] ?? 0) - (used[item.id] ?? 0);
            const take = Math.min(Math.max(avail, 0), need);
            if (take > 0) {
              resolved[item.id] = (resolved[item.id] ?? 0) + take;
              used[item.id] = (used[item.id] ?? 0) + take;
              need -= take;
            }
          }
        }
        for (const item of ITEMS_DB) {
          if (need <= 0) break;
          if (!itemMatchesCostCategory(item, cat)) continue;
          const avail = (stock[item.id] ?? 0) - (used[item.id] ?? 0);
          if (avail <= 0) continue;
          const take = Math.min(avail, need);
          resolved[item.id] = (resolved[item.id] ?? 0) + take;
          used[item.id] = (used[item.id] ?? 0) + take;
          need -= take;
        }
        if (need > 0) return null; // not enough of this category
      } else {
        const avail = (stock[key] ?? 0) - (used[key] ?? 0);
        if (avail < (cost as number)) return null;
        resolved[key] = (resolved[key] ?? 0) + (cost as number);
        used[key] = (used[key] ?? 0) + (cost as number);
      }
    }
    return resolved;
  }

  hasRequiredResearch(buildingId: string, gameState: GameState): boolean {
    // DEBUG: `_devResearchGateOff` turns research gating off (see gamestate.ts).
    if (gameState._devResearchGateOff) return true;
    const building = this.getBuildingById(buildingId);
    if (!building?.researchRequired) return true;

    return gameState.completedResearch.includes(building.researchRequired);
  }

  hasRequiredPopulation(buildingId: string, gameState: GameState): boolean {
    const building = this.getBuildingById(buildingId);
    if (!building) return false;

    const currentPop = gameState.pawns.length;

    // Check minimum population requirement
    if (currentPop < building.populationRequired) return false;

    return true;
  }

  hasRequiredTools(buildingId: string, gameState: GameState): boolean {
    const building = this.getBuildingById(buildingId);
    if (!building?.toolTierRequired) return true;

    return gameState.currentToolLevel >= building.toolTierRequired;
  }

  meetsStateRestrictions(buildingId: string, gameState: GameState): boolean {
    const building = this.getBuildingById(buildingId);
    if (!building?.buildingState) return true;

    const currentCount = (gameState.buildings ?? []).filter(
      (b) => b.type === buildingId && b.status === 'complete'
    ).length;

    // Check if building is unique and already exists
    if (building.buildingState.isUnique && currentCount > 0) return false;

    // Check maximum count
    if (building.buildingState.maxCount && currentCount >= building.buildingState.maxCount)
      return false;

    return true;
  }

  calculateBuildingCost(buildingId: string): Record<string, number> {
    const building = this.getBuildingById(buildingId);
    return building?.buildingCost || {};
  }

  calculateBuildingEffects(buildingId: string): Record<string, number> {
    const building = this.getBuildingById(buildingId);
    return building?.effects || {};
  }

  calculateConstructionTime(buildingId: string, gameState: GameState): number {
    const building = this.getBuildingById(buildingId);
    if (!building) return 0;

    let time = building.workAmount;

    // Apply population bonus (more workers = faster construction)
    const availableWorkers = Math.min(gameState.pawns.length, building.populationRequired * 2);
    const workerBonus = Math.max(0.5, availableWorkers / building.populationRequired);
    time = Math.round(time / workerBonus);

    return Math.max(1, time);
  }

  calculateBuildingEfficiency(buildingId: string, gameState: GameState): number {
    // Simple efficiency calculation without modifier system dependency
    let efficiency = 1.0;

    // Apply network effects from synergies
    const building = this.getBuildingById(buildingId);
    if (building?.synergies?.networkEffects) {
      const count = (gameState.buildings ?? []).filter(
        (b) => b.type === buildingId && b.status === 'complete'
      ).length;
      Object.entries(building.synergies.networkEffects).forEach(([effect, bonus]) => {
        efficiency += bonus * count;
      });
    }

    return efficiency;
  }

  getBuildingDependencies(buildingId: string): string[] {
    const building = this.getBuildingById(buildingId);
    if (!building) return [];

    const dependencies = [];

    if (building.researchRequired) {
      dependencies.push(`Research: ${building.researchRequired}`);
    }

    if (building.toolTierRequired && building.toolTierRequired > 0) {
      dependencies.push(`Tool Level: ${building.toolTierRequired}`);
    }

    if (building.populationRequired > 0) {
      dependencies.push(`Population: ${building.populationRequired}`);
    }

    return dependencies;
  }

  getBuildingUnlocks(buildingId: string): Building[] {
    return AVAILABLE_BUILDINGS.filter((building) => {
      // Check if this building is required for construction
      if (building.researchRequired === buildingId) return true;

      // Check synergies
      if (building.synergies?.chainBonus?.includes(buildingId)) return true;

      return false;
    });
  }

  getBuildingMaintenanceNeeds(buildingId: string): {
    upkeep: Record<string, number>;
    requirements: string[];
  } {
    const building = this.getBuildingById(buildingId);
    if (!building) return { upkeep: {}, requirements: [] };

    const upkeep = building.upkeepCost || {};
    const requirements = [];

    if (building.itemInteractions?.requires) {
      requirements.push(...building.itemInteractions.requires);
    }

    if (building.buildingState?.environmentalNeeds) {
      requirements.push(...building.buildingState.environmentalNeeds);
    }

    return { upkeep, requirements };
  }

  /**
   * Phase 4d / Phase 5c: Place a building at specific tile coordinates with status 'planned'.
   * Sets workRequired = workAmount so that JobService can generate a construct job.
   */
  /** Crafting tier of a generic station (effects.tier); undefined for specialised/non-craft buildings. */
  stationTier(buildingType: string): number | undefined {
    return this.getBuildingById(buildingType)?.effects?.tier;
  }

  /** Crafting speed bonus of a station (effects.craftingBonus, e.g. 0.2 = +20%); 0 if none. */
  craftingBonusOf(buildingType: string): number {
    return this.getBuildingById(buildingType)?.effects?.craftingBonus ?? 0;
  }

  /**
   * Can a complete building of `haveType` craft a recipe authored for `recipeStation`?
   * Generic tiered stations supersede lower tiers (a Crude Workbench can do craft_spot recipes);
   * a specialised station (sawtable, forge, …) needs an exact-type match.
   */
  stationFulfills(haveType: string, recipeStation: string): boolean {
    if (haveType === recipeStation) return true;
    const need = this.stationTier(recipeStation);
    const have = this.stationTier(haveType);
    return need !== undefined && have !== undefined && have >= need;
  }

  /** Best complete building that can craft a recipe for `recipeStation` — highest tier wins (so a
   *  shared recipe runs at the better, faster workshop). Null if none can. */
  bestCraftStation(recipeStation: string, gameState: GameState): PlacedBuilding | null {
    const eligible = (gameState.buildings ?? []).filter(
      (b) => b.status === 'complete' && this.stationFulfills(b.type, recipeStation)
    );
    if (eligible.length === 0) return null;
    return eligible.reduce((best, b) =>
      (this.stationTier(b.type) ?? -1) > (this.stationTier(best.type) ?? -1) ? b : best
    );
  }

  placeBuilding(
    type: string,
    x: number,
    y: number,
    gameState: GameState,
    materialOverride?: Record<string, string>
  ): GameState {
    const building = this.getBuildingById(type);
    if (!building) {
      console.warn(`[BuildingService] Unknown building type: ${type}`);
      return gameState;
    }
    // Can't build on an already-blocked tile: a mountain/cliff wall, water, or an existing solid
    // building all set worldMap[y][x].walkable = false. Reject placement there so wall blueprints
    // can't be painted onto non-walkable terrain (mine it out first).
    if (gameState.worldMap?.[y]?.[x]?.walkable === false) return gameState;
    const instant = building.workAmount === 0;
    const placed: PlacedBuilding = {
      id: `${type}-${x}-${y}-${Date.now()}`,
      type,
      // zero-workAmount buildings (craft_spot) are complete immediately
      status: instant ? 'complete' : 'planned',
      progress: instant ? 1 : 0,
      x,
      y,
      // work-point model: workRequired = workAmount directly
      workRequired: building.workAmount,
      workDone: instant ? building.workAmount : 0,
      materialsDelivered: false,
      // §M record the player's per-slot material picks so the finished building's stats reflect what
      // it was built from (oak vs pine plank, granite vs marble block). Empty = default/auto material.
      ...(materialOverride && Object.keys(materialOverride).length > 0
        ? { materials: { ...materialOverride } }
        : {}),
      // PRODUCTION-CHAIN-III §B.2: seed the per-building fuel whitelist from the def so a tanning
      // bucket only ever burns brine (the refuel planner reads fuelSettings.allowedFuelItemIds).
      ...(building.defaultAllowedFuelItemIds && building.defaultAllowedFuelItemIds.length > 0
        ? { fuelSettings: { allowedFuelItemIds: [...building.defaultAllowedFuelItemIds] } }
        : {})
    };
    let state: GameState = { ...gameState, buildings: [...(gameState.buildings ?? []), placed] };

    // ADR-016 building-material hauling: resolve the build cost and, for a building that takes
    // construction work, RESERVE it to this building (do not consume). Pawns then fetch the
    // reserved materials to the build site and construction consumes them on completion (see
    // JobService). Instant (zero-work) buildings consume their cost immediately as before.
    const cost = this.resolveBuildingCost(type, gameState, materialOverride);
    if (cost && Object.keys(cost).length > 0) {
      if (instant) {
        state = consumeFromStockpiles(state, cost);
      } else {
        for (const [itemId, qty] of Object.entries(cost)) {
          state = reserveForOrder(state, itemId, qty, placed.id).state;
        }
      }
    }
    // A solid building that completes on placement (zero-work) blocks its tile immediately.
    // Work-built ones block at construction completion (see JobService._completeConstruct).
    if (instant) state = this.applyBuildingFootprint(state, placed, true);
    return state;
  }

  /**
   * Solid buildings (def.walkable === false — walls, furnaces, fires) block their tile once
   * built. This flips worldMap[y][x].walkable, which every walkability check already honors
   * (the A* grid builder, mob isWalkable, approach-finding, idle wander). `blocking=true` on
   * completion, `false` when the building is removed. Passable buildings are a no-op.
   */
  applyBuildingFootprint(state: GameState, building: PlacedBuilding, blocking: boolean): GameState {
    const def = this.getBuildingById(building.type);
    const { x, y } = building;
    const row = state.worldMap?.[y];
    const tile = row?.[x];
    if (!tile) return state;

    // Floor buildings (walkable) bake a movement/dryness modifier onto the tile — set on completion,
    // cleared on deconstruct. Read by MovementSystem.moveCostToEnter (speed) and the pawn/mob wetness
    // ticks (dryness). Mirrors the walkable/blocksSight bake below: mutate in place + dirty + fresh ref.
    const floorSpeed = def?.effects?.floorSpeed;
    const floorDryness = def?.effects?.floorDryness;
    if (floorSpeed != null || floorDryness != null) {
      if (blocking) tile.floor = { speed: floorSpeed ?? 1, dryness: floorDryness ?? 0 };
      else delete tile.floor;
      markTileDirty(y, x, tile);
      return { ...state };
    }

    if (def?.walkable !== false) return state; // passable, non-floor building — nothing to do
    const nextWalkable = !blocking;
    if (tile.walkable === nextWalkable) return state; // already in the desired state
    // Mutate the one tile IN PLACE + mark it dirty (§D — like §C regrowth / harvest completion),
    // rather than `worldMap.map()` rebuilding all 38k tiles to flip one `walkable` flag (which flipped
    // the worldMap ref → full re-clone + terrain rebuild). Event-rate (build/deconstruct), but the
    // pattern is the same. Return a fresh top-level state ref (worldMap ref stays stable → ships a delta).
    tile.walkable = nextWalkable;
    // RANGED-COMBAT Part VII: a wall also occludes line-of-sight; a furnace/fire (also non-walkable)
    // does not, so this tracks `def.blocksSight`, not `walkable`. Walls sit on walkable terrain, whose
    // baked `blocksSight` is false, so clearing on deconstruct (blocking=false) restores correctly.
    tile.blocksSight = blocking && def.blocksSight === true;
    // Keep the memoized A* grid in sync — the worldMap ref is unchanged, so the pathfinding
    // cache (keyed on worldMap identity) would otherwise stay stale and route pawns onto the wall.
    patchPathfindingWalkable(x, y, nextWalkable);
    markTileDirty(y, x, tile);
    return { ...state };
  }

  /**
   * Helper: does any complete building of this type exist?
   */
  hasCompletedBuilding(type: string, gameState: GameState): boolean {
    return (gameState.buildings ?? []).some((b) => b.type === type && b.status === 'complete');
  }

  /**
   * Helper: count complete buildings of this type.
   */
  countCompletedBuildings(type: string, gameState: GameState): number {
    return (gameState.buildings ?? []).filter((b) => b.type === type && b.status === 'complete')
      .length;
  }

  getBuildingIcon(buildingId: string): string {
    const building = this.getBuildingById(buildingId);
    if (building?.emoji) return building.emoji;

    // Fallback icons based on category
    const categoryIcons: Record<string, string> = {
      housing: '🏠',
      production: '🔨',
      food: '🍖',
      knowledge: '📜',
      military: '⚔️',
      magical: '⚗️',
      commerce: '🏪'
    };

    return categoryIcons[building?.category || 'production'] || '🏗️';
  }

  getBuildingColor(buildingId: string): string {
    const building = this.getBuildingById(buildingId);
    return building?.color || '#4CAF50';
  }

  hasBuildings(
    buildingCountsOrGameState: Record<string, number> | GameState,
    category: string
  ): boolean {
    // Support legacy buildingCounts map or full GameState
    const buildingCounts: Record<string, number> =
      'buildings' in buildingCountsOrGameState
        ? {}
        : (buildingCountsOrGameState as Record<string, number>);

    if ('buildings' in buildingCountsOrGameState) {
      // New path: check buildings array
      const gs = buildingCountsOrGameState as GameState;
      return (gs.buildings ?? []).some((b) => {
        if (b.status !== 'complete') return false;
        const building = this.getBuildingById(b.type);
        return building?.category === category;
      });
    }

    return Object.entries(buildingCounts).some(([buildingId, count]) => {
      if (count > 0) {
        const building = this.getBuildingById(buildingId);
        return building?.category === category;
      }
      return false;
    });
  }

  getBuildingGlyph(buildingId: string): string {
    const building = this.getBuildingById(buildingId);
    if (!building?.charSpans) return '#';
    const chars = resolveCharSpans(building.charSpans as CharSpan[]);
    return chars[0] ?? '#';
  }

  cancelBuilding(instanceId: string, gameState: GameState): GameState {
    // ADR-016: release any build materials reserved/staged for this building back to free stock
    // (nothing was consumed at placement for work-requiring buildings).
    const released = releaseReservation(gameState, instanceId);
    return {
      ...released,
      buildings: (released.buildings ?? []).filter((b) => b.id !== instanceId)
    };
  }

  togglePausedBuilding(instanceId: string, gameState: GameState): GameState {
    return {
      ...gameState,
      buildings: (gameState.buildings ?? []).map((b) =>
        b.id === instanceId ? { ...b, paused: !b.paused } : b
      )
    };
  }

  deconstructBuilding(instanceId: string, gameState: GameState): GameState {
    const building = (gameState.buildings ?? []).find((b) => b.id === instanceId);
    if (!building) return gameState;
    const def = this.getBuildingById(building.type);
    const deconstructWorkRequired = Math.max(1, Math.ceil((def?.workAmount ?? 0) / 2));
    return {
      ...gameState,
      buildings: (gameState.buildings ?? []).map((b) =>
        b.id === instanceId
          ? { ...b, deconstructQueued: true, deconstructWorkRequired, deconstructWorkDone: 0 }
          : b
      )
    };
  }

  cancelDeconstructBuilding(instanceId: string, gameState: GameState): GameState {
    return {
      ...gameState,
      buildings: (gameState.buildings ?? []).map((b) =>
        b.id === instanceId
          ? {
              ...b,
              deconstructQueued: false,
              deconstructWorkRequired: undefined,
              deconstructWorkDone: undefined
            }
          : b
      )
    };
  }

  /** No-op — deconstruction is now driven by the job system (deconstruct job type). */
  processDeconstructionQueue(gameState: GameState): GameState {
    return gameState;
  }

  assignShelterPawn(instanceId: string, pawnId: string | null, gameState: GameState): GameState {
    return {
      ...gameState,
      buildings: (gameState.buildings ?? []).map((b) =>
        b.id === instanceId ? { ...b, assignedPawnId: pawnId ?? undefined } : b
      )
    };
  }

  stepTraps(gameState: GameState): GameState {
    let state = gameState;
    for (const b of gameState.buildings ?? []) {
      if (b.status !== 'complete') continue;
      const def = AVAILABLE_BUILDINGS.find((d) => d.id === b.type);
      const fx = def?.effects;
      if (!fx?.['trapEnabled']) continue;
      const chance = fx['catchChance'] ?? 0;
      if (chance <= 0 || !rng.chance(chance)) continue;
      const item = (fx as unknown as Record<string, unknown>)['catchItem'];
      if (typeof item !== 'string') continue;
      state = addToStockpileZone(state, `${b.x},${b.y}`, { [item]: 1 });
    }
    return state;
  }

  stepBuildingCondition(gameState: GameState): GameState {
    let changed = false;
    const buildings = (gameState.buildings ?? []).map((b) => {
      if (b.status !== 'complete') return b;
      const def = AVAILABLE_BUILDINGS.find((d) => d.id === b.type);
      const rate = def?.conditionDecayPerTurn;
      if (!rate) return b;
      const cur = b.condition ?? 100;
      if (cur <= 0) return b;
      // §M a more durable material decays slower (oak/granite ÷1.3, ironwood ÷1.7; pine/sandstone ÷0.85).
      const durMul = b.materials
        ? aggregateMaterialMods(Object.values(b.materials), 'building').durability
        : 1;
      const next = Math.max(0, cur - perTick(rate) / durMul);
      if (next === cur) return b;
      changed = true;
      return { ...b, condition: next };
    });
    return changed ? { ...gameState, buildings } : gameState;
  }

  repairBuilding(instanceId: string, gameState: GameState): GameState {
    const b = (gameState.buildings ?? []).find((x) => x.id === instanceId);
    if (!b || b.status !== 'complete') return gameState;
    const def = AVAILABLE_BUILDINGS.find((d) => d.id === b.type);
    if (!def) return gameState;
    const cur = b.condition ?? 100;
    if (cur >= 100) return gameState;

    // Repair costs ~25% of the build cost (rounded up, min 1 per material).
    const cost: Record<string, number> = {};
    for (const [item, qty] of Object.entries(def.buildingCost ?? {})) {
      cost[item] = Math.max(1, Math.ceil((qty as number) * 0.25));
    }
    const stock = gameState.stockpile ?? {};
    for (const [item, qty] of Object.entries(cost)) {
      if ((stock[item] ?? 0) < qty) return gameState; // can't afford → no-op
    }

    let state = consumeFromStockpiles(gameState, cost);
    state = {
      ...state,
      buildings: (state.buildings ?? []).map((x) =>
        x.id === instanceId ? { ...x, condition: 100 } : x
      )
    };
    return state;
  }
}

// Export singleton instance
export const buildingService = new BuildingServiceImpl();
