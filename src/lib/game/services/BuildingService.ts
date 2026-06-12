import type { Building, GameState, PlacedBuilding } from '../core/types';
import buildingsData from '../database/buildings.jsonc';
import { resolveCharSpans } from '../core/Terrains';
import type { CharSpan } from '../core/Terrains';
import { rng } from '../core/rng';
import { perTick } from '../core/time';
import { consumeFromStockpiles, addToStockpileZone } from '../core/GameState';

const AVAILABLE_BUILDINGS = buildingsData as unknown as Building[];

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

  // Building Queue Processing
  processBuildingQueue(gameState: GameState): GameState;

  // Phase 4d: Tile-placed buildings
  placeBuilding(type: string, x: number, y: number, gameState: GameState): GameState;
  hasCompletedBuilding(type: string, gameState: GameState): boolean;
  countCompletedBuildings(type: string, gameState: GameState): number;

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
    return AVAILABLE_BUILDINGS.find((building) => building.id === id);
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
    const building = this.getBuildingById(buildingId);
    if (!building?.buildingCost) return true;

    return Object.entries(building.buildingCost).every(([resourceId, cost]) => {
      const available = (gameState.stockpile ?? {})[resourceId] ?? 0;
      return available >= cost;
    });
  }

  hasRequiredResearch(buildingId: string, gameState: GameState): boolean {
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

  processBuildingQueue(gameState: GameState): GameState {
    console.log('[BuildingService] Processing building queue');

    if (gameState.buildingQueue.length === 0) return gameState;

    let newBuildings = [...(gameState.buildings ?? [])];
    const newBuildingCounts = { ...(gameState.buildingCounts ?? {}) };

    const updatedBuildingQueue = gameState.buildingQueue
      .map((entry) => ({ ...entry, turnsRemaining: entry.turnsRemaining - 1 }))
      .filter((entry) => {
        if (entry.turnsRemaining <= 0) {
          // Building completed — push into buildings[] as a complete PlacedBuilding
          const placed: PlacedBuilding = {
            id: `${entry.building.id}-${Date.now()}-${rng.random().toString(36).slice(2, 7)}`,
            type: entry.building.id,
            x: 0, // abstract queue buildings have no tile coords
            y: 0,
            status: 'complete',
            progress: 1
          };
          newBuildings = [...newBuildings, placed];
          // Keep buildingCounts in sync for backward compat
          newBuildingCounts[entry.building.id] = (newBuildingCounts[entry.building.id] ?? 0) + 1;
          console.log('[BuildingService] Building completed:', entry.building.id);
          return false;
        }
        return true;
      });

    return {
      ...gameState,
      buildingQueue: updatedBuildingQueue,
      buildings: newBuildings,
      buildingCounts: newBuildingCounts
    };
  }

  /**
   * Phase 4d / Phase 5c: Place a building at specific tile coordinates with status 'planned'.
   * Sets workRequired = workAmount so that JobService can generate a construct job.
   */
  placeBuilding(type: string, x: number, y: number, gameState: GameState): GameState {
    const building = this.getBuildingById(type);
    if (!building) {
      console.warn(`[BuildingService] Unknown building type: ${type}`);
      return gameState;
    }
    const placed: PlacedBuilding = {
      id: `${type}-${x}-${y}-${Date.now()}`,
      type,
      x,
      y,
      // zero-workAmount buildings (craft_spot) are complete immediately
      status: building.workAmount === 0 ? 'complete' : 'planned',
      progress: building.workAmount === 0 ? 1 : 0,
      // work-point model: workRequired = workAmount directly
      workRequired: building.workAmount,
      workDone: building.workAmount === 0 ? building.workAmount : 0,
      materialsDelivered: false
    };
    return {
      ...gameState,
      buildings: [...(gameState.buildings ?? []), placed]
    };
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
    return {
      ...gameState,
      buildings: (gameState.buildings ?? []).filter((b) => b.id !== instanceId)
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
      const next = Math.max(0, cur - perTick(rate));
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
