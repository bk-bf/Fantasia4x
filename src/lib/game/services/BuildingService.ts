import type { Building, GameState, PlacedBuilding } from '../core/types';
import buildingsData from '../database/world/buildings.jsonc';
import itemsData from '../database/items/items.jsonc';
import resourcesData from '../database/world/resources.jsonc';
import type { Item } from '../core/types';
import { resolveCharSpans } from '../core/defs/terrains';
import { buildingDefById } from '../core/defs/buildings';
import { itemMatchesCostCategory } from '../core/defs/items';
import { markTileDirty } from '../core/state/tileDeltas';
import { patchPathfindingWalkable } from './PathfinderService';
import type { CharSpan } from '../core/defs/terrains';
import { rng } from '../core/util/rng';
import { perTick } from '../core/util/time';
import { aggregateMaterialMods } from '../core/defs/materials';
import {
  consumeFromStockpiles,
  addToStockpileZone,
  availableAggregateFromDrops,
  colonyToolTier,
  reserveForOrder,
  releaseReservation
} from '../core/state/stockpile';

/** Legacy per-family effect keys, read so an un-migrated building keeps working. New stations use
 *  `effects.family` + `effects.rung`. */
const LEGACY_LADDER: [string, string][] = [
  ['cookingTier', 'cooking'],
  ['butcheryTier', 'butchery'],
  ['lapidaryTier', 'lapidary'],
  ['tailoringTier', 'tailoring'],
  ['tier', 'crafting']
];

const AVAILABLE_BUILDINGS = buildingsData as unknown as Building[];
const ITEMS_DB = itemsData as unknown as Item[];

export const MAX_ROOF_SPAN = 6;

const ROOF_SUPPORT_RESOURCE_IDS: Set<string> = new Set(
  (resourcesData as unknown as Array<{ id: string; roofSupport?: boolean }>)
    .filter((r) => r.roofSupport)
    .map((r) => r.id)
);

export function weatherExposureFactor(weather: GameState['weather']): number {
  if (!weather) return 1;
  const type = weather.type ?? 'clear';
  const intensity = weather.intensity ?? 0;
  let severity: number;
  if (type === 'clear' || type === 'heat_wave') severity = 0.12;
  else if (type === 'fog') severity = 0.4;
  else if (type === 'drizzle') severity = 0.8;
  else if (type === 'rain' || type === 'snow' || type === 'foggy_rain') severity = 1.6;
  else if (type === 'heavy_rain' || type === 'storm' || type === 'blizzard') severity = 3;
  else severity = 1;
  return Math.max(0.1, severity * (0.5 + 0.5 * intensity));
}

const DEFAULT_CONDITION_DECAY = 0.15;
const SHELTERED_EXPOSURE = 0.12;

export interface BuildingService {
  getBuildingById(id: string): Building | undefined;
  getBuildingsByCategory(category: string): Building[];
  getBuildingsByTier(tier: number): Building[];
  getBuildingsByRarity(rarity: string): Building[];
  getAvailableBuildings(gameState: GameState, category?: string): Building[];

  canBuildBuilding(buildingId: string, gameState: GameState): boolean;
  hasRequiredResources(buildingId: string, gameState: GameState): boolean;
  resolveBuildingCost(
    buildingId: string,
    gameState: GameState,
    materialOverride?: Record<string, string>
  ): Record<string, number> | null;
  hasRequiredResearch(buildingId: string, gameState: GameState): boolean;
  hasRequiredPopulation(buildingId: string, gameState: GameState): boolean;
  hasRequiredTools(buildingId: string, gameState: GameState): boolean;
  meetsStateRestrictions(buildingId: string, gameState: GameState): boolean;

  calculateBuildingCost(buildingId: string): Record<string, number>;
  calculateBuildingEffects(buildingId: string): Record<string, number>;
  calculateConstructionTime(buildingId: string, gameState: GameState): number;
  calculateBuildingEfficiency(buildingId: string, gameState: GameState): number;

  getBuildingDependencies(buildingId: string): string[];
  getBuildingUnlocks(buildingId: string): Building[];
  getBuildingMaintenanceNeeds(buildingId: string): {
    upkeep: Record<string, number>;
    requirements: string[];
  };

  stationTier(buildingType: string): number | undefined;
  butcheryTier(buildingType: string): number | undefined;
  cookingTier(buildingType: string): number | undefined;
  lapidaryTier(buildingType: string): number | undefined;
  tailoringTier(buildingType: string): number | undefined;
  /** Which LADDER a station is on and how far up — one lookup for every family there is. */
  stationLadders(buildingType: string): { family: string; rung: number }[];
  craftingBonusOf(buildingType: string): number;
  butcheryYieldBonusOf(buildingType: string): number;
  stationFulfills(haveType: string, recipeStation: string): boolean;
  bestCraftStation(recipeStation: string, gameState: GameState): PlacedBuilding | null;

  placeBuilding(
    type: string,
    x: number,
    y: number,
    gameState: GameState,
    materialOverride?: Record<string, string>
  ): GameState;
  makeRoofSupportLookup(
    buildings: PlacedBuilding[],
    worldMap: GameState['worldMap']
  ): (x: number, y: number) => boolean;
  roofTileSupported(x: number, y: number, isSupport: (x: number, y: number) => boolean): boolean;
  removeUnsupportedRoofs(state: GameState, cx: number, cy: number): GameState;
  hasCompletedBuilding(type: string, gameState: GameState): boolean;
  countCompletedBuildings(type: string, gameState: GameState): number;
  applyBuildingFootprint(state: GameState, building: PlacedBuilding, blocking: boolean): GameState;

  getBuildingIcon(buildingId: string): string;
  getBuildingColor(buildingId: string): string;
  hasBuildings(buildingCounts: Record<string, number>, category: string): boolean;
  getBuildingGlyph(buildingId: string): string;
  cancelBuilding(instanceId: string, gameState: GameState): GameState;
  togglePausedBuilding(instanceId: string, gameState: GameState): GameState;
  deconstructBuilding(instanceId: string, gameState: GameState): GameState;
  cancelDeconstructBuilding(instanceId: string, gameState: GameState): GameState;
  processDeconstructionQueue(gameState: GameState): GameState;
  assignShelterPawn(instanceId: string, pawnId: string | null, gameState: GameState): GameState;

  stepTraps(gameState: GameState): GameState;

  deterioratingRate(buildingType: string): number;
  stepBuildingCondition(gameState: GameState): GameState;
  repairBuilding(instanceId: string, gameState: GameState): GameState;
}

export class BuildingServiceImpl implements BuildingService {
  getBuildingById(id: string): Building | undefined {
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

    if (category) {
      buildings = buildings.filter((building) => building.category === category);
    }

    return buildings.filter((building) => this.canBuildBuilding(building.id, gameState));
  }

  canBuildBuilding(buildingId: string, gameState: GameState): boolean {
    const building = this.getBuildingById(buildingId);
    if (!building) return false;

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

  resolveBuildingCost(
    buildingId: string,
    gameState: GameState,
    materialOverride?: Record<string, string>
  ): Record<string, number> | null {
    const building = this.getBuildingById(buildingId);
    if (!building?.buildingCost) return {};
    const viaMain = this.payCost(building.buildingCost, gameState, materialOverride);
    if (viaMain) return viaMain;
    for (const alt of building.buildingCostAlternatives ?? []) {
      const viaAlt = this.payCost(alt, gameState, materialOverride);
      if (viaAlt) return viaAlt;
    }
    return null;
  }

  private payCost(
    cost0: Record<string, number>,
    gameState: GameState,
    materialOverride?: Record<string, string>
  ): Record<string, number> | null {
    const stock = availableAggregateFromDrops(gameState.droppedItems);
    const resolved: Record<string, number> = {};
    const used: Record<string, number> = {};

    for (const [key, cost] of Object.entries(cost0)) {
      if (key.startsWith('category:')) {
        const cat = key.slice('category:'.length);
        let need = cost as number;
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
        if (need > 0) return null;
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
    if (gameState._devResearchGateOff) return true;
    const building = this.getBuildingById(buildingId);
    if (!building?.researchRequired) return true;

    return gameState.completedResearch.includes(building.researchRequired);
  }

  hasRequiredPopulation(buildingId: string, gameState: GameState): boolean {
    const building = this.getBuildingById(buildingId);
    if (!building) return false;

    const currentPop = gameState.pawns.length;

    if (currentPop < building.populationRequired) return false;

    return true;
  }

  hasRequiredTools(buildingId: string, gameState: GameState): boolean {
    const building = this.getBuildingById(buildingId);
    if (!building?.toolTierRequired) return true;

    return colonyToolTier(gameState) >= building.toolTierRequired;
  }

  meetsStateRestrictions(buildingId: string, gameState: GameState): boolean {
    const building = this.getBuildingById(buildingId);
    if (!building?.buildingState) return true;

    const currentCount = (gameState.buildings ?? []).filter(
      (b) => b.type === buildingId && b.status === 'complete'
    ).length;

    if (building.buildingState.isUnique && currentCount > 0) return false;

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

    const availableWorkers = Math.min(gameState.pawns.length, building.populationRequired * 2);
    const workerBonus = Math.max(0.5, availableWorkers / building.populationRequired);
    time = Math.round(time / workerBonus);

    return Math.max(1, time);
  }

  calculateBuildingEfficiency(buildingId: string, gameState: GameState): number {
    let efficiency = 1.0;

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
      if (building.researchRequired === buildingId) return true;

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
   * A station LADDER: `effects.family` names it and `effects.rung` places the station on it. Every
   * family behaves identically — a higher rung runs every lower rung's recipes, faster — so there is
   * one lookup rather than one per family. Nine of them written out by hand is nine places to forget
   * a `return true`, and adding milling or brewing should be a data change, not a code change.
   *
   * The older per-family keys (`cookingTier`, `tailoringTier`, …) are still read so a building that
   * has not been migrated keeps working; the named accessors below are thin readers over this.
   */
  stationLadders(buildingType: string): { family: string; rung: number }[] {
    const e = this.getBuildingById(buildingType)?.effects as Record<string, unknown> | undefined;
    if (!e) return [];
    const out: { family: string; rung: number }[] = [];
    if (typeof e.family === 'string' && typeof e.rung === 'number')
      out.push({ family: e.family, rung: e.rung });
    for (const [key, family] of LEGACY_LADDER)
      if (typeof e[key] === 'number' && !out.some((l) => l.family === family))
        out.push({ family, rung: e[key] as number });
    return out;
  }

  stationTier(buildingType: string): number | undefined {
    return this.getBuildingById(buildingType)?.effects?.tier;
  }

  butcheryTier(buildingType: string): number | undefined {
    return this.getBuildingById(buildingType)?.effects?.butcheryTier;
  }

  cookingTier(buildingType: string): number | undefined {
    return this.getBuildingById(buildingType)?.effects?.cookingTier;
  }

  lapidaryTier(buildingType: string): number | undefined {
    return this.getBuildingById(buildingType)?.effects?.lapidaryTier;
  }

  tailoringTier(buildingType: string): number | undefined {
    return this.getBuildingById(buildingType)?.effects?.tailoringTier;
  }

  craftingBonusOf(buildingType: string): number {
    return this.getBuildingById(buildingType)?.effects?.craftingBonus ?? 0;
  }

  butcheryYieldBonusOf(buildingType: string): number {
    return this.getBuildingById(buildingType)?.effects?.butcheryYieldBonus ?? 0;
  }

  private stationRank(buildingType: string): number {
    const l = this.stationLadders(buildingType);
    return l.length ? Math.max(...l.map((x) => x.rung)) : -1;
  }

  stationFulfills(haveType: string, recipeStation: string): boolean {
    if (haveType === recipeStation) return true;
    // A station can sit on TWO ladders at once — a maker's bench is tailoring rung 0 AND generic
    // crafting tier 1 — so any shared family with a high enough rung fulfils. Reporting only the
    // first one silently dropped the generic tier and broke bootstrap.
    const need = this.stationLadders(recipeStation);
    const have = this.stationLadders(haveType);
    return need.some((n) => have.some((h) => h.family === n.family && h.rung >= n.rung));
  }

  bestCraftStation(recipeStation: string, gameState: GameState): PlacedBuilding | null {
    const eligible = (gameState.buildings ?? []).filter(
      (b) => b.status === 'complete' && this.stationFulfills(b.type, recipeStation)
    );
    if (eligible.length === 0) return null;
    return eligible.reduce((best, b) =>
      this.stationRank(b.type) > this.stationRank(best.type) ? b : best
    );
  }

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

  roofTileSupported(x: number, y: number, isSupport: (x: number, y: number) => boolean): boolean {
    for (let dy = -MAX_ROOF_SPAN; dy <= MAX_ROOF_SPAN; dy++) {
      for (let dx = -MAX_ROOF_SPAN; dx <= MAX_ROOF_SPAN; dx++) {
        if ((dx !== 0 || dy !== 0) && isSupport(x + dx, y + dy)) return true;
      }
    }
    return false;
  }

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
        collapsed = true;
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
    if (gameState.worldMap?.[y]?.[x]?.walkable === false) return gameState;
    if (building.effects?.roof) {
      const isSupport = this.makeRoofSupportLookup(gameState.buildings ?? [], gameState.worldMap);
      if (!this.roofTileSupported(x, y, isSupport)) return gameState;
    }
    const instant = building.workAmount === 0;
    const placed: PlacedBuilding = {
      id: `${type}-${x}-${y}-t${gameState.turn}`,
      type,
      status: instant ? 'complete' : 'planned',
      progress: instant ? 1 : 0,
      x,
      y,
      workRequired: building.workAmount,
      workDone: instant ? building.workAmount : 0,
      materialsDelivered: false,
      ...(materialOverride && Object.keys(materialOverride).length > 0
        ? { materials: { ...materialOverride } }
        : {}),
      ...(building.defaultAllowedFuelItemIds && building.defaultAllowedFuelItemIds.length > 0
        ? { fuelSettings: { allowedFuelItemIds: [...building.defaultAllowedFuelItemIds] } }
        : {})
    };
    let state: GameState = { ...gameState, buildings: [...(gameState.buildings ?? []), placed] };

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
    if (instant) state = this.applyBuildingFootprint(state, placed, true);
    return state;
  }

  applyBuildingFootprint(state: GameState, building: PlacedBuilding, blocking: boolean): GameState {
    const def = this.getBuildingById(building.type);
    const { x, y } = building;
    const row = state.worldMap?.[y];
    const tile = row?.[x];
    if (!tile) return state;

    const floorSpeed = def?.effects?.floorSpeed;
    const floorDryness = def?.effects?.floorDryness;
    if (floorSpeed != null || floorDryness != null) {
      if (blocking) tile.floor = { speed: floorSpeed ?? 1, dryness: floorDryness ?? 0 };
      else delete tile.floor;
      markTileDirty(y, x, tile);
      return { ...state };
    }

    if (def?.walkable !== false) return state;
    const nextWalkable = !blocking;
    if (tile.walkable === nextWalkable) return state;
    tile.walkable = nextWalkable;
    tile.blocksSight = blocking && def.blocksSight === true;
    patchPathfindingWalkable(x, y, nextWalkable);
    markTileDirty(y, x, tile);
    return { ...state };
  }

  hasCompletedBuilding(type: string, gameState: GameState): boolean {
    return (gameState.buildings ?? []).some((b) => b.type === type && b.status === 'complete');
  }

  countCompletedBuildings(type: string, gameState: GameState): number {
    return (gameState.buildings ?? []).filter((b) => b.type === type && b.status === 'complete')
      .length;
  }

  getBuildingIcon(buildingId: string): string {
    const building = this.getBuildingById(buildingId);
    if (building?.emoji) return building.emoji;

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
    const buildingCounts: Record<string, number> =
      'buildings' in buildingCountsOrGameState
        ? {}
        : (buildingCountsOrGameState as Record<string, number>);

    if ('buildings' in buildingCountsOrGameState) {
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

  deterioratingRate(buildingType: string): number {
    const def = this.getBuildingById(buildingType);
    if (!def) return 0;
    const raw = def.conditionDecayPerTurn;
    if (raw === 0) return 0;
    if (raw && raw > 0) return raw;
    return Object.keys(def.buildingCost ?? {}).length > 0 ? DEFAULT_CONDITION_DECAY : 0;
  }

  stepBuildingCondition(gameState: GameState): GameState {
    if (gameState._devFreezeDeterioration) return gameState;
    const weatherFactor = weatherExposureFactor(gameState.weather);
    const buildings0 = gameState.buildings ?? [];
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
      const durMul = b.materials
        ? aggregateMaterialMods(Object.values(b.materials), 'building').durability
        : 1;
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
      if (next <= 0) (broken ??= []).push(updated);
      return updated;
    });
    if (!changed) return gameState;
    if (!broken) return { ...gameState, buildings };
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

    const cost: Record<string, number> = {};
    for (const [item, qty] of Object.entries(def.buildingCost ?? {})) {
      cost[item] = Math.max(1, Math.ceil((qty as number) * 0.25));
    }
    const stock = gameState.stockpile ?? {};
    for (const [item, qty] of Object.entries(cost)) {
      if ((stock[item] ?? 0) < qty) return gameState;
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

export const buildingService = new BuildingServiceImpl();
