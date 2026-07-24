import type { Building, GameState, PlacedBuilding } from '../core/types';
import buildingsData from '../database/world/buildings.jsonc';
import itemsData from '../database/items/items.jsonc';
import resourcesData from '../database/world/resources.jsonc';
import type { Item } from '../core/types';
import { resolveCharSpans } from '../core/Terrains';
import { buildingDefById } from '../core/buildingDefs';
import { itemMatchesCostCategory } from '../core/itemDefs';
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
  colonyToolTier,
  reserveForOrder,
  releaseReservation
} from '../core/GameState';

const AVAILABLE_BUILDINGS = buildingsData as unknown as Building[];
const ITEMS_DB = itemsData as unknown as Item[];

// ROOF-SUPPORT: a roofed tile must sit within this Chebyshev distance of a load-bearing support,
// else its span is unsupported and the roof blueprint is rejected. 6 lets a room up to 13 tiles
// wide be roofed by its perimeter walls alone; anything wider needs an interior wall.
export const MAX_ROOF_SPAN = 6;

// Natural blockers that bear a roof (trees, stone outcrop, cliff/mountain wall) — flagged
// `roofSupport: true` in resources.jsonc. Indexed once; the DB never mutates at runtime.
const ROOF_SUPPORT_RESOURCE_IDS: Set<string> = new Set(
  (resourcesData as unknown as Array<{ id: string; roofSupport?: boolean }>)
    .filter((r) => r.roofSupport)
    .map((r) => r.id)
);

/**
 * Weather-exposure multiplier on wear (1 = the nominal rate). Wet, violent weather rots thatch, scours
 * mortar, and rusts/warps loose gear fast; clear/calm skies barely age anything (a small fair-weather
 * baseline remains — sun/thermal cycling). Computed ONCE per tick (never per entity) from the small
 * top-level `weather` scalar — no per-tile calc, and sheltered/stored things are excluded by their
 * callers before this ever applies. SHARED by `stepBuildingCondition` (structures) and
 * `stepItemDeterioration` (loose items) so the two curves can never drift. Absent weather (tests /
 * pre-weather saves) returns the nominal 1 so behaviour is unchanged.
 */
export function weatherExposureFactor(weather: GameState['weather']): number {
  if (!weather) return 1;
  const type = weather.type ?? 'clear';
  const intensity = weather.intensity ?? 0;
  // Per-type damage to an EXPOSED structure (roofs/walls take the weather; interiors are unaffected).
  let severity: number;
  if (type === 'clear' || type === 'heat_wave')
    severity = 0.12; // slow fair-weather ageing (sun, thermal cycling)
  else if (type === 'fog') severity = 0.4;
  else if (type === 'drizzle') severity = 0.8;
  else if (type === 'rain' || type === 'snow' || type === 'foggy_rain') severity = 1.6;
  else if (type === 'heavy_rain' || type === 'storm' || type === 'blizzard') severity = 3;
  else severity = 1; // unknown/custom weather id → nominal
  // Intensity scales the precip/wind-driven part — a light shower wears less than a downpour.
  return Math.max(0.1, severity * (0.5 + 0.5 * intensity));
}

// Default structural wear/turn for a complete building whose def gives no explicit `conditionDecayPerTurn`
// but DOES have a build cost — so every real building deteriorates + is repairable (slow; durable
// materials slow it further). Free/marker buildings (no cost) and explicit `0` (immune roofs) never wear.
const DEFAULT_CONDITION_DECAY = 0.15;
// Weather-exposure multiplier used for a SHELTERED (roofed) non-structural building — it ages at the
// calm baseline (use/age), NOT the full weather rate: furniture indoors doesn't rot in the rain.
const SHELTERED_EXPOSURE = 0.12;

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
  butcheryTier(buildingType: string): number | undefined;
  craftingBonusOf(buildingType: string): number;
  butcheryYieldBonusOf(buildingType: string): number;
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
  /** ROOF-SUPPORT: a per-tile "does (x,y) bear a roof?" predicate (wall building or natural blocker). */
  makeRoofSupportLookup(
    buildings: PlacedBuilding[],
    worldMap: GameState['worldMap']
  ): (x: number, y: number) => boolean;
  /** ROOF-SUPPORT: is (x,y) within MAX_ROOF_SPAN (Chebyshev) of a support tile? */
  roofTileSupported(x: number, y: number, isSupport: (x: number, y: number) => boolean): boolean;
  /** ROOF-SUPPORT: drop roofs near (cx,cy) that lost their support (e.g. overhead rock mined out). */
  removeUnsupportedRoofs(state: GameState, cx: number, cy: number): GameState;
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
  /** Effective wear/turn for a building type (0 = immune/never-wears). Gates condition + repair. */
  deterioratingRate(buildingType: string): number;
  /** Decay complete buildings' `condition` by their effective wear rate (weather/shelter scaled). */
  stepBuildingCondition(gameState: GameState): GameState;
  /** Restore a building to full condition, consuming a fraction of its build cost. No-op if unaffordable. */
  repairBuilding(instanceId: string, gameState: GameState): GameState;
}

/**
 * BuildingService Implementation
 */
export class BuildingServiceImpl implements BuildingService {
  getBuildingById(id: string): Building | undefined {
    // O(1) via the shared core index (core/buildingDefs.ts) — a per-call `.find()` showed up hot
    // in the sim worker profile (~3.6%).
    return buildingDefById(id);
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

    // ADR-009: a crafted/owned tool of the required tier satisfies the gate — not only research
    // (currentToolLevel). Otherwise a fresh colony that has crafted a stone_axe (tier 1) could
    // never build a tier-1 station, leaving it permanently BLOCKED despite holding the tool.
    return colonyToolTier(gameState) >= building.toolTierRequired;
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

  /** Butchery tier of a station (effects.butcheryTier); undefined for non-butchery stations. Butchery
   *  stations form their OWN tier ladder (butcher_spot 0 → dressing_stone 1 → flensing_table 2 →
   *  sanguinary_altar 3), kept separate from the generic crafting tier so the two families never mix. */
  butcheryTier(buildingType: string): number | undefined {
    return this.getBuildingById(buildingType)?.effects?.butcheryTier;
  }

  /** Crafting speed bonus of a station (effects.craftingBonus, e.g. 0.2 = +20%); 0 if none. */
  craftingBonusOf(buildingType: string): number {
    return this.getBuildingById(buildingType)?.effects?.craftingBonus ?? 0;
  }

  /** Butchery YIELD bonus of a station (effects.butcheryYieldBonus, e.g. 0.25 = +25% meat/hide/bone
   *  off each carcass — better tools waste less). 0 if none. Applied in craft.ts completeCraftOrder. */
  butcheryYieldBonusOf(buildingType: string): number {
    return this.getBuildingById(buildingType)?.effects?.butcheryYieldBonus ?? 0;
  }

  /** Overall rank of a station within whichever family it belongs to (generic crafting tier or the
   *  separate butchery tier) — drives "prefer the best station" in bestCraftStation. */
  private stationRank(buildingType: string): number {
    return this.stationTier(buildingType) ?? this.butcheryTier(buildingType) ?? -1;
  }

  /**
   * Can a complete building of `haveType` craft a recipe authored for `recipeStation`?
   * Generic tiered stations supersede lower tiers (a Crude Workbench can do craft_spot recipes) and
   * butchery stations supersede lower butchery stations (a Flensing Table can render a rabbit) — but
   * the two ladders are SEPARATE (a butcher spot never fulfils a craft_spot recipe). A specialised
   * station (sawtable, forge, …) needs an exact-type match.
   */
  stationFulfills(haveType: string, recipeStation: string): boolean {
    if (haveType === recipeStation) return true;
    const needT = this.stationTier(recipeStation);
    const haveT = this.stationTier(haveType);
    if (needT !== undefined && haveT !== undefined && haveT >= needT) return true;
    const needB = this.butcheryTier(recipeStation);
    const haveB = this.butcheryTier(haveType);
    return needB !== undefined && haveB !== undefined && haveB >= needB;
  }

  /** Best complete building that can craft a recipe for `recipeStation` — highest rank wins (a shared
   *  recipe runs at the better workshop: faster for generic crafts, higher-yield for butchery). Lower
   *  tiers still COEXIST as valid targets (the player can re-pin an order to them). Null if none can. */
  bestCraftStation(recipeStation: string, gameState: GameState): PlacedBuilding | null {
    const eligible = (gameState.buildings ?? []).filter(
      (b) => b.status === 'complete' && this.stationFulfills(b.type, recipeStation)
    );
    if (eligible.length === 0) return null;
    return eligible.reduce((best, b) =>
      this.stationRank(b.type) > this.stationRank(best.type) ? b : best
    );
  }

  /**
   * ROOF-SUPPORT: build a cheap per-tile "does (x,y) bear a roof?" predicate over the current
   * buildings + worldMap. A tile bears a roof if it holds a wall building (`effects.roofSupport`)
   * or a natural-blocker resource (`roofSupport: true`). The wall tiles are indexed once so the
   * whole blueprint drag can reuse one predicate (no O(buildings) scan per tile).
   */
  makeRoofSupportLookup(
    buildings: PlacedBuilding[],
    worldMap: GameState['worldMap']
  ): (x: number, y: number) => boolean {
    const supportTiles = new Set<string>();
    for (const b of buildings ?? []) {
      if (this.getBuildingById(b.type)?.effects?.roofSupport) supportTiles.add(`${b.x},${b.y}`);
    }
    return (x: number, y: number): boolean => {
      if (supportTiles.has(`${x},${y}`)) return true;
      const res = worldMap?.[y]?.[x]?.resources;
      if (res) {
        for (const rid in res) {
          if (res[rid] > 0 && ROOF_SUPPORT_RESOURCE_IDS.has(rid)) return true;
        }
      }
      return false;
    };
  }

  /** ROOF-SUPPORT: is (x,y) within MAX_ROOF_SPAN (Chebyshev) of any load-bearing support tile? */
  roofTileSupported(x: number, y: number, isSupport: (x: number, y: number) => boolean): boolean {
    for (let dy = -MAX_ROOF_SPAN; dy <= MAX_ROOF_SPAN; dy++) {
      for (let dx = -MAX_ROOF_SPAN; dx <= MAX_ROOF_SPAN; dx++) {
        if ((dx !== 0 || dy !== 0) && isSupport(x + dx, y + dy)) return true;
      }
    }
    return false;
  }

  /**
   * ROOF-SUPPORT: remove any roof building within MAX_ROOF_SPAN of (cx,cy) that no longer has a
   * support in span — called after a load-bearing tile near (cx,cy) is removed (e.g. overhead rock
   * mined out). A roof up to MAX_ROOF_SPAN away could have leaned on the now-gone support, so that
   * window is exactly the set of roofs whose support must be rechecked.
   *
   * TODO: this is the "disappear for now" placeholder. Replace the silent removal with proper
   * dangerous collapse mechanics — rubble left on the tile, falling-rock damage to any pawn/item
   * caught under the unsupported span, and ideally a warning before the carve goes too wide.
   */
  removeUnsupportedRoofs(state: GameState, cx: number, cy: number): GameState {
    const buildings = state.buildings ?? [];
    const isSupport = this.makeRoofSupportLookup(buildings, state.worldMap);
    const survivors: PlacedBuilding[] = [];
    let collapsed = false;
    for (const b of buildings) {
      const isRoof = !!this.getBuildingById(b.type)?.effects?.roof;
      if (
        isRoof &&
        Math.max(Math.abs(b.x - cx), Math.abs(b.y - cy)) <= MAX_ROOF_SPAN &&
        !this.roofTileSupported(b.x, b.y, isSupport)
      ) {
        collapsed = true; // TODO: dangerous collapse instead of a clean vanish
        continue;
      }
      survivors.push(b);
    }
    return collapsed ? { ...state, buildings: survivors } : state;
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
    // ROOF-SUPPORT: a roof tile must sit within MAX_ROOF_SPAN of a load-bearing support (a wall
    // building or a natural-blocker resource), else the span is unsupported. Mirrors the blueprint
    // preview in GameCanvas, which hides the ghost on unsupported roof tiles.
    if (building.effects?.roof) {
      const isSupport = this.makeRoofSupportLookup(gameState.buildings ?? [], gameState.worldMap);
      if (!this.roofTileSupported(x, y, isSupport)) return gameState;
    }
    const instant = building.workAmount === 0;
    const placed: PlacedBuilding = {
      id: `${type}-${x}-${y}-t${gameState.turn}`,
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

  /**
   * Effective structural wear/turn for a building TYPE. EXPLICIT `0` = immune (tile/mountain roofs);
   * an explicit positive rate is used as-is; `undefined` falls back to the default rate ONLY if the
   * building has a build cost (so every real building deteriorates + is repairable), else 0. The shared
   * gate for "does this building wear / show a condition meter + REPAIR panel".
   */
  deterioratingRate(buildingType: string): number {
    const def = this.getBuildingById(buildingType);
    if (!def) return 0;
    const raw = def.conditionDecayPerTurn;
    if (raw === 0) return 0; // explicit immune
    if (raw && raw > 0) return raw; // explicit rate
    return Object.keys(def.buildingCost ?? {}).length > 0 ? DEFAULT_CONDITION_DECAY : 0;
  }

  stepBuildingCondition(gameState: GameState): GameState {
    if (gameState._devFreezeDeterioration) return gameState; // DEBUG: freeze weather wear (headless tests)
    // ROOF-SUPPORT / weather wear: structural wear scales with how harsh the weather is — a storm rots
    // an exposed roof/wall fast, a clear calm day barely ages it. One scalar per tick (cheap).
    const weatherFactor = weatherExposureFactor(gameState.weather);
    const buildings0 = gameState.buildings ?? [];
    // Tiles a complete roof shelters — a NON-structural building under one ages at the calm baseline,
    // not the full weather rate. Built lazily (only when a non-structural building is first weighed).
    let roofedTiles: Set<string> | null = null;
    const tileIsRoofed = (x: number, y: number): boolean => {
      if (!roofedTiles) {
        roofedTiles = new Set();
        for (const b of buildings0)
          if (b.status === 'complete' && this.getBuildingById(b.type)?.effects?.roof)
            roofedTiles.add(`${b.x},${b.y}`);
      }
      return roofedTiles.has(`${x},${y}`);
    };
    let changed = false;
    let broken: PlacedBuilding[] | null = null;
    const buildings = buildings0.map((b) => {
      if (b.status !== 'complete') return b;
      const def = AVAILABLE_BUILDINGS.find((d) => d.id === b.type);
      const rate = this.deterioratingRate(b.type);
      if (!rate) return b;
      const cur = b.condition ?? 100;
      if (cur <= 0) return b;
      // §M a more durable material decays slower (oak/granite ÷1.3, ironwood ÷1.7; pine/sandstone ÷0.85).
      const durMul = b.materials
        ? aggregateMaterialMods(Object.values(b.materials), 'building').durability
        : 1;
      // The structural envelope (roof / wall / load-bearing) always takes the full weather; everything
      // else is sheltered if it sits under a roof (indoor furniture doesn't weather like an exposed wall).
      const structural = !!(
        def?.effects?.roof ||
        def?.walkable === false ||
        def?.effects?.roofSupport
      );
      const exposure = structural || !tileIsRoofed(b.x, b.y) ? weatherFactor : SHELTERED_EXPOSURE;
      const next = Math.max(0, cur - (perTick(rate) * exposure) / durMul);
      if (next === cur) return b;
      changed = true;
      const updated = { ...b, condition: next };
      // 0% condition → the structure FAILS: a roof falls in, a wall collapses. Collect it for removal.
      if (next <= 0) (broken ??= []).push(updated);
      return updated;
    });
    if (!changed) return gameState;
    // Common case: nothing hit 0 — just ship the decayed conditions.
    if (!broken) return { ...gameState, buildings };
    // Some buildings failed — drop them and restore any tile footprint (a wall re-opens its tile, a
    // floor clears; a passable roof is a no-op). TODO: leave rubble / damage anything caught under a
    // collapsing roof, mirroring the dangerous-collapse TODO in removeUnsupportedRoofs.
    const brokenIds = new Set((broken as PlacedBuilding[]).map((b) => b.id));
    let state: GameState = {
      ...gameState,
      buildings: buildings.filter((b) => !brokenIds.has(b.id))
    };
    for (const b of broken as PlacedBuilding[]) {
      state = this.applyBuildingFootprint(state, b, false);
      console.warn(
        `[BuildingService] ${b.type} at (${b.x},${b.y}) failed at 0% condition — removed`
      );
    }
    return state;
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
