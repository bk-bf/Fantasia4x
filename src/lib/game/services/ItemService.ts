import type {
  Item,
  GameState,
  DynamicIngredientSlot,
  DroppedItem,
  Recipe,
  Pawn,
  ItemQuality,
  ItemInstance
} from '../core/types';
import { qualityPrefix } from '../core/rules/gear/itemQuality';
import { itemDefById, itemMatchesCostCategory } from '../core/defs/items';
import { usedCapacityL, usedWeightKg, vesselOf } from '../core/rules/gear/vessels';
import {
  decayAll,
  normalizeConditions,
  carcassConditionByType as computeCarcassConditionByType
} from '../core/rules/world/carcassCondition';
import {
  consumeFromStockpiles,
  addToStockpileZone,
  withDrops,
  availableQuantityFromDrops,
  colonyToolTier
} from '../core/state/stockpile';
import { recipeService } from './RecipeService';
import { buildingService, weatherExposureFactor } from './BuildingService';
import {
  thermalAt,
  computeThermalAt,
  seasonBakedTemp,
  effectiveTemperature,
  tileWetness,
  weatherEffects,
  diurnalTempDelta
} from './EnvironmentService';
import itemsData from '../database/items/items.json';
import buildingsData from '../database/world/buildings.json';
import { SECONDS_PER_TICK } from '../core/util/time';
import { chebyshev } from '../core/util/distance';
import { sizeFromHeight } from '../core/gen/culture';
import { gatedConsole as console } from '../core/util/log';

const ITEMS_DATABASE = itemsData as unknown as Item[];

const BUILDING_DEFS_FOR_ITEMS = buildingsData as unknown as import('../core/types').Building[];

export { itemMatchesCostCategory } from '../core/defs/items';

function craftValueOf(item: { craftValue?: number } | undefined | null): number {
  const v = item?.craftValue;
  return typeof v === 'number' && v > 0 ? v : 1;
}

const DEFAULT_MAX_DURABILITY = 100;
const DEFAULT_DETERIORATION_RATE = 0.02;
export const DETERIORATION_GLOBAL_SCALE = 0.02;
const DRY_TEMP_FLOOR = 12;
const DRY_TEMP_REF = 28;
const DRY_WET_DECAY = 2;
const DRY_WET_DAMP = 45;
const DRY_WET_SOAK = 95;
const DRY_HEAT_DEWATER = 0.5;

function dryingWetness(wetness: number, warmth: number): number {
  return Math.max(0, wetness - warmth * DRY_HEAT_DEWATER);
}

type DryingRule = { itemId: string; seconds: number; mode: 'ambient' | 'fire-ring' };
const CATEGORY_DRYING: Record<string, DryingRule> = {
  meat: { itemId: 'dried_meat', seconds: 600, mode: 'ambient' },
  fruit: { itemId: 'dried_fruit', seconds: 700, mode: 'ambient' }
};

function ambientDryRate(temp: number, wetness: number, bonus: number, warmth = 0): number {
  const wet = dryingWetness(wetness, warmth);
  const wetF = Math.max(
    -1,
    Math.min(1, 1 - (2 * (wet - DRY_WET_DAMP)) / (DRY_WET_SOAK - DRY_WET_DAMP))
  );
  if (wetF < 0) return wetF * DRY_WET_DECAY;
  const tempF = Math.max(0, Math.min(1, (temp - DRY_TEMP_FLOOR) / (DRY_TEMP_REF - DRY_TEMP_FLOOR)));
  return tempF * wetF * bonus;
}

function dryingRuleFor(resourceId: string): DryingRule | null {
  const def = itemDefById(resourceId);
  if (def?.driesTo !== undefined) return def.driesTo ? { mode: 'ambient', ...def.driesTo } : null;
  const rule = def?.category ? CATEGORY_DRYING[def.category] : undefined;
  return rule && rule.itemId !== resourceId ? rule : null;
}

type DryingCtx = {
  fires: { x: number; y: number }[];
  dryRacks: Map<string, number>;
  weatherTemp: number;
};
function dryingContext(gameState: GameState): DryingCtx {
  const fires: { x: number; y: number }[] = [];
  const dryRacks = new Map<string, number>();
  for (const b of gameState.buildings ?? []) {
    if (b.status !== 'complete') continue;
    if (b.lit) fires.push({ x: b.x, y: b.y });
    const bonus = buildingService.getBuildingById(b.type)?.effects?.dryingBonus ?? 0;
    if (bonus > 0) {
      const key = b.y + ',' + b.x;
      dryRacks.set(key, Math.max(dryRacks.get(key) ?? 0, bonus));
    }
  }
  const weatherTemp =
    weatherEffects(gameState.weather).tempDelta +
    diurnalTempDelta(gameState.turn, gameState.season);
  return { fires, dryRacks, weatherTemp };
}

function dryRateFor(
  d: DroppedItem,
  gameState: GameState,
  ctx: DryingCtx,
  ruleOverride?: DryingRule | null
): number {
  const rule = ruleOverride ?? dryingRuleFor(d.resourceId);
  if (!rule) return 0;
  if (rule.mode === 'fire-ring') {
    if (ctx.fires.length === 0) return 0;
    let nearest = Infinity;
    for (const f of ctx.fires) nearest = Math.min(nearest, chebyshev(d.x, d.y, f.x, f.y));
    return nearest === 2 ? 1 : 0;
  }
  const tile = gameState.worldMap?.[d.y]?.[d.x];
  if (!tile) return 0;
  const thermal = thermalAt(d.x, d.y);
  const temp = effectiveTemperature(
    seasonBakedTemp(tile.terrainType, gameState.season),
    ctx.weatherTemp,
    thermal
  );
  const wet = tileWetness(tile.moisture ?? 0, gameState.weather, thermal);
  return ambientDryRate(temp, wet, ctx.dryRacks.get(d.y + ',' + d.x) ?? 1, thermal.warmth);
}

export interface DryingStatus {
  target: number;
  progress: number;
  rate: number;
  reason?: 'wet' | 'cold' | 'no-fire';
  temp?: number;
  wetness?: number;
  bonus: number;
}
const DETERIORATION_RATE_BY_CATEGORY: Record<string, number> = {
  stone: 0.004,
  primitive: 0.01,
  metal: 0.008,
  ingot: 0.008,
  bar: 0.008,
  construction: 0.01,
  wood: 0.04,
  fuel: 0.04,
  organic: 0.07,
  hide: 0.07,
  food: 0.08,
  meat: 0.08,
  storage: 0.02,
  natural_weapon: 0
};

const CARRY_BASE_KG = 11;
const CARRY_KG_PER_STRENGTH = 0.19;
const CARRY_FRAME_REF_KG = 80;
const CARRY_FRAME_MIN = 0.85;
const CARRY_FRAME_MAX = 1.15;

export interface CarryCapacityBreakdown {
  size: string;
  height: number;
  bodyWeight: number;
  strength: number;
  weight: {
    bodyWeight: number;
    loadFraction: number;
    capacity: number;
    gear: number;
    total: number;
  };
  volume: { bodyWeight: number; fraction: number; capacity: number; gear: number; total: number };
  gearSources: { name: string; weightKg: number; volumeL: number }[];
}

export interface ItemService {
  getItemById(id: string): Item | undefined;
  makeDynamicName(itemId: string, subjectName: string): string;
  getItemDisplayName(drop: { resourceId: string; name?: string; quality?: ItemQuality }): string;
  composeDynamicDishName(itemId: string, selected?: Record<string, string>): string | undefined;
  getItemsByType(type: string): Item[];
  getItemsByCategory(category: string): Item[];
  getAllCategories(): string[];
  getCraftableItems(gameState: GameState, pawnId?: string): Item[];
  getItemsByWorkType(workType: string): Item[];

  canCraftItem(itemId: string, gameState: GameState, pawnId?: string): boolean;
  canQueueCraft(itemId: string, gameState: GameState): boolean;
  canQueueCraftRecipe(recipe: Recipe | undefined, gameState: GameState): boolean;
  resolveCarcassRecipe(carcassId: string, gameState: GameState): Recipe | undefined;
  hasRequiredMaterials(itemId: string, gameState: GameState): boolean;
  hasRequiredTools(itemId: string, gameState: GameState): boolean;
  hasRequiredBuilding(itemId: string, gameState: GameState): boolean;
  resolveActiveCost(
    itemId: string,
    gameState: GameState,
    selectedIngredients?: Record<string, string>
  ): Record<string, number> | null;
  autoSelectIngredients(itemId: string, gameState: GameState): Record<string, string> | null;

  calculateCraftingCost(itemId: string): Record<string, number>;
  calculateItemEffects(itemId: string): Record<string, number>;

  getItemIcon(itemId: string): string;
  getItemColor(itemId: string): string;

  getAvailableQuantity(itemId: string, gameState: GameState): number;
  consumeItems(itemIds: Record<string, number>, gameState: GameState): GameState;
  addItems(itemIds: Record<string, number>, gameState: GameState): GameState;

  getCarryBudget(pawn: Pawn, state: GameState): { maxWeightKg: number; maxVolumeL: number };
  getCarryCapacityBreakdown(pawn: Pawn): CarryCapacityBreakdown;
  canAddToInventory(pawn: Pawn, itemId: string, qty: number, state: GameState): boolean;
  clampPickupQuantity(
    pawn: Pawn,
    itemId: string,
    qty: number,
    state: GameState,
    capFactor?: number
  ): number;
  getCurrentCarryLoad(pawn: Pawn, state: GameState): { weightKg: number; volumeL: number };

  stepItemDecay(gameState: GameState, elapsedTicks?: number): GameState;
  carcassConditionByType(gameState: GameState): Record<string, number>;
  stepItemDeterioration(gameState: GameState, elapsedTicks?: number): GameState;
  applyToolWear(workCategory: string, gameState: GameState): GameState;
  wearToolById(toolId: string, gameState: GameState): GameState;
  stepDrying(gameState: GameState, elapsedTicks?: number): GameState;
  dryingTargetSeconds(resourceId: string): number | null;
  dryingStatus(d: DroppedItem, gameState: GameState): DryingStatus | null;
}

export class ItemServiceImpl implements ItemService {
  getItemById(id: string): Item | undefined {
    return itemDefById(id);
  }

  makeDynamicName(itemId: string, subjectName: string): string {
    const def = this.getItemById(itemId);
    if (!def?.dynamicName) return def?.name ?? itemId;
    return `${subjectName}'s ${def.name}`;
  }

  composeDynamicDishName(itemId: string, selected?: Record<string, string>): string | undefined {
    const def = this.getItemById(itemId);
    const recipe = recipeService.getRecipeForItem(itemId);
    if (!def?.dynamicName || !recipe?.dynamicRecipe || !selected) return undefined;
    const names: string[] = [];
    for (const slotKey of Object.keys(recipe.dynamicRecipe)) {
      const ingId = selected[slotKey];
      if (!ingId) continue;
      const n = this.getItemById(ingId)?.name ?? ingId;
      if (!names.includes(n)) names.push(n);
    }
    if (names.length === 0) return def.name;
    const list =
      names.length === 1
        ? names[0]
        : `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
    return `${list} ${def.name}`;
  }

  getItemDisplayName(drop: { resourceId: string; name?: string; quality?: ItemQuality }): string {
    const def = this.getItemById(drop.resourceId);
    if (def?.dynamicName && drop.name) return drop.name;
    const base = def?.name ?? drop.resourceId.replace(/_/g, ' ');
    const prefix = qualityPrefix(drop.quality);
    return prefix ? `${prefix} ${base}` : base;
  }

  getItemsByType(type: string): Item[] {
    return ITEMS_DATABASE.filter((item) => item.type === type);
  }

  getItemsByCategory(category: string): Item[] {
    return ITEMS_DATABASE.filter((item) => itemMatchesCostCategory(item, category));
  }

  getAllCategories(): string[] {
    return [
      ...new Set(
        ITEMS_DATABASE.filter((item) => !item.hidden)
          .map((item) => item.category)
          .filter(Boolean)
      )
    ].sort();
  }

  getItemsByWorkType(workType: string): Item[] {
    return ITEMS_DATABASE.filter(
      (item) => item.gatheringTypes && item.gatheringTypes.includes(workType)
    );
  }

  getCraftableItems(gameState: GameState, pawnId?: string): Item[] {
    return ITEMS_DATABASE.filter((item) => {
      if (!recipeService.getRecipeForItem(item.id)) return false;
      return this.canCraftItem(item.id, gameState, pawnId);
    });
  }

  canCraftItem(itemId: string, gameState: GameState, pawnId?: string): boolean {
    if (!this.hasRequiredMaterials(itemId, gameState)) return false;
    return this.canQueueCraft(itemId, gameState);
  }

  canQueueCraft(itemId: string, gameState: GameState): boolean {
    const item = this.getItemById(itemId);
    if (!item) return false;
    const recipe = item.isCarcass
      ? this.resolveCarcassRecipe(itemId, gameState)
      : recipeService.getRecipeForItem(itemId);
    return this.canQueueCraftRecipe(recipe, gameState);
  }

  canQueueCraftRecipe(recipe: Recipe | undefined, gameState: GameState): boolean {
    if (!recipe) return false;
    if ((recipe.toolTierRequired ?? 0) > colonyToolTier(gameState)) return false;
    if (!buildingService.bestCraftStation(recipe.station ?? 'craft_spot', gameState)) return false;
    if (
      recipe.buildingRequired &&
      !(gameState.buildings ?? []).some(
        (b) => b.type === recipe.buildingRequired && b.status === 'complete'
      )
    )
      return false;
    if (
      !gameState._devResearchGateOff &&
      recipe.researchRequired &&
      !gameState.completedResearch.includes(recipe.researchRequired)
    )
      return false;
    if (recipe.populationRequired && gameState.pawns.length < recipe.populationRequired)
      return false;
    return true;
  }

  resolveCarcassRecipe(carcassId: string, gameState: GameState): Recipe | undefined {
    const recipes = recipeService
      .getRecipesUsing(carcassId)
      .filter((r) => (r.inputs?.[carcassId] ?? 0) > 0);
    if (recipes.length === 0) return undefined;
    const builtRank = (r: Recipe): number => {
      const b = buildingService.bestCraftStation(r.station ?? 'craft_spot', gameState);
      return b
        ? (buildingService.butcheryTier(b.type) ?? buildingService.stationTier(b.type) ?? 0)
        : -1;
    };
    let best = recipes[0];
    let bestRank = builtRank(best);
    for (const r of recipes.slice(1)) {
      const rank = builtRank(r);
      if (rank > bestRank) {
        bestRank = rank;
        best = r;
      }
    }
    if (bestRank < 0) {
      const bt = (r: Recipe) => buildingService.butcheryTier(r.station ?? '') ?? 99;
      best = recipes.reduce((lo, r) => (bt(r) < bt(lo) ? r : lo), recipes[0]);
    }
    return best;
  }

  hasRequiredMaterials(itemId: string, gameState: GameState): boolean {
    if (!recipeService.getRecipeForItem(itemId)) return true;
    return this.resolveActiveCost(itemId, gameState) !== null;
  }

  autoSelectIngredients(itemId: string, gameState: GameState): Record<string, string> | null {
    const recipe = recipeService.getRecipeForItem(itemId);
    if (!recipe?.dynamicRecipe) return {};
    const selected: Record<string, string> = {};
    const demand: Record<string, number> = {};
    for (const [slotKey, slot] of Object.entries(recipe.dynamicRecipe)) {
      const candidates = ITEMS_DATABASE.filter(
        (i) =>
          recipeService.slotAccepts(slot, i) &&
          this.getAvailableQuantity(i.id, gameState) >= (demand[i.id] ?? 0) + slot.quantity
      );
      if (!candidates.length) return null;
      const chosen = candidates.find((c) => !(c.id in demand)) ?? candidates[0];
      selected[slotKey] = chosen.id;
      demand[chosen.id] = (demand[chosen.id] ?? 0) + slot.quantity;
    }
    return selected;
  }

  expandCategoryCost(
    cost: Record<string, number>,
    gameState: GameState
  ): Record<string, number> | null {
    const out: Record<string, number> = {};
    const used: Record<string, number> = {};
    for (const [key, qty] of Object.entries(cost)) {
      if (key.startsWith('category:')) {
        const cat = key.slice('category:'.length);
        let need = qty;
        for (const item of ITEMS_DATABASE) {
          if (need <= 1e-9) break;
          if (!itemMatchesCostCategory(item, cat)) continue;
          const avail = this.getAvailableQuantity(item.id, gameState) - (used[item.id] ?? 0);
          if (avail <= 0) continue;
          const worth = craftValueOf(item);
          const take = Math.min(avail, Math.ceil(need / worth));
          out[item.id] = (out[item.id] ?? 0) + take;
          used[item.id] = (used[item.id] ?? 0) + take;
          need -= take * worth;
        }
        if (need > 1e-9) return null;
      } else {
        const avail = this.getAvailableQuantity(key, gameState) - (used[key] ?? 0);
        if (avail < qty) return null;
        out[key] = (out[key] ?? 0) + qty;
        used[key] = (used[key] ?? 0) + qty;
      }
    }
    return out;
  }

  expandCategoryCostLoose(cost: Record<string, number>): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [key, qty] of Object.entries(cost)) {
      if (key.startsWith('category:')) {
        const cat = key.slice('category:'.length);
        const repItem = ITEMS_DATABASE.find((i) => itemMatchesCostCategory(i, cat));
        const rep = repItem?.id ?? key;
        out[rep] = (out[rep] ?? 0) + Math.ceil(qty / craftValueOf(repItem));
      } else {
        out[key] = (out[key] ?? 0) + qty;
      }
    }
    return out;
  }

  resolveActiveCost(
    itemId: string,
    gameState: GameState,
    selectedIngredients?: Record<string, string>
  ): Record<string, number> | null {
    const recipe = recipeService.getRecipeForItem(itemId);
    if (!recipe) return null;

    let baseCost = this.expandCategoryCost(recipe.inputs, gameState);
    if (baseCost === null && recipe.inputAlternatives?.length) {
      for (const alt of recipe.inputAlternatives) {
        baseCost = this.expandCategoryCost(alt, gameState);
        if (baseCost) break;
      }
    }
    if (baseCost === null) return null;

    if (!recipe.dynamicRecipe) return baseCost;

    const selected = selectedIngredients ?? this.autoSelectIngredients(itemId, gameState);
    if (!selected) return null;

    const dynamicCosts: Record<string, number> = {};
    for (const [slotKey, slot] of Object.entries(recipe.dynamicRecipe)) {
      const chosenId = selected[slotKey];
      if (!chosenId) return null;
      dynamicCosts[chosenId] = (dynamicCosts[chosenId] ?? 0) + slot.quantity;
    }
    for (const [id, qty] of Object.entries(dynamicCosts)) {
      if (this.getAvailableQuantity(id, gameState) < qty) return null;
    }

    const total: Record<string, number> = { ...baseCost };
    for (const [id, qty] of Object.entries(dynamicCosts)) total[id] = (total[id] ?? 0) + qty;
    return total;
  }

  hasRequiredTools(itemId: string, gameState: GameState): boolean {
    const tier = recipeService.getRecipeForItem(itemId)?.toolTierRequired;
    if (!tier) return true;
    return colonyToolTier(gameState) >= tier;
  }

  hasRequiredBuilding(itemId: string, gameState: GameState): boolean {
    const recipe = recipeService.getRecipeForItem(itemId);
    const station = recipe?.station ?? 'craft_spot';
    if (!buildingService.bestCraftStation(station, gameState)) return false;

    if (!recipe?.buildingRequired) return true;
    return (gameState.buildings ?? []).some(
      (b) => b.type === recipe.buildingRequired && b.status === 'complete'
    );
  }

  calculateCraftingCost(itemId: string): Record<string, number> {
    const recipe = recipeService.getRecipeForItem(itemId);
    if (recipe)
      return this.expandCategoryCostLoose(
        Object.keys(recipe.inputs).length ? recipe.inputs : (recipe.inputAlternatives?.[0] ?? {})
      );
    return {};
  }

  calculateItemEffects(itemId: string): Record<string, number> {
    const item = this.getItemById(itemId);
    return item?.effects || {};
  }

  getItemIcon(itemId: string): string {
    const item = this.getItemById(itemId);
    return item?.emoji || '📦';
  }

  getItemColor(itemId: string): string {
    const item = this.getItemById(itemId);
    return item?.color || '#4CAF50';
  }

  getAvailableQuantity(itemId: string, gameState: GameState): number {
    return availableQuantityFromDrops(gameState.droppedItems, itemId);
  }

  consumeItems(itemIds: Record<string, number>, gameState: GameState): GameState {
    return consumeFromStockpiles(gameState, itemIds);
  }

  addItems(itemIds: Record<string, number>, gameState: GameState): GameState {
    return addToStockpileZone(gameState, null, itemIds);
  }

  getCarryBudget(pawn: Pawn, _state: GameState): { maxWeightKg: number; maxVolumeL: number } {
    const b = this.getCarryCapacityBreakdown(pawn);
    return { maxWeightKg: b.weight.total, maxVolumeL: b.volume.total };
  }

  getCarryCapacityBreakdown(pawn: Pawn): CarryCapacityBreakdown {
    const height = pawn.physicalTraits?.height ?? 170;
    const bodyWeight = pawn.physicalTraits?.weight ?? 70;
    const size = sizeFromHeight(height);
    const str = pawn.stats.strength ?? 10;

    const carried = CARRY_BASE_KG + str * CARRY_KG_PER_STRENGTH;
    const frameFactor = Math.min(
      CARRY_FRAME_MAX,
      Math.max(CARRY_FRAME_MIN, bodyWeight / CARRY_FRAME_REF_KG)
    );
    const capacity = carried * frameFactor;
    const loadFraction = bodyWeight > 0 ? capacity / bodyWeight : 0;
    const VOLUME_FRACTION = 0.13;
    const weight = {
      bodyWeight,
      loadFraction,
      capacity,
      gear: 0,
      total: 0
    };
    const volume = {
      bodyWeight,
      fraction: VOLUME_FRACTION,
      capacity: bodyWeight * VOLUME_FRACTION,
      gear: 0,
      total: 0
    };

    const gearSources: CarryCapacityBreakdown['gearSources'] = [];
    for (const inst of Object.values(pawn.equipment ?? {})) {
      if (!inst) continue;
      const def = this.getItemById(inst.itemId);
      if (def?.inventoryBonus) {
        weight.gear += def.inventoryBonus.weightKg;
        volume.gear += def.inventoryBonus.volumeL;
        gearSources.push({
          name: def.name,
          weightKg: def.inventoryBonus.weightKg,
          volumeL: def.inventoryBonus.volumeL
        });
      }
    }

    let armorPocketL = 0;
    for (const inst of Object.values(pawn.equipment ?? {})) {
      if (!inst) continue;
      const def = this.getItemById(inst.itemId);
      const ap = def?.armorProperties;
      if (!ap || ap.armorType === 'shield' || def?.inventoryBonus) continue;
      armorPocketL += (def?.weightKg ?? 0) * 0.5;
    }
    if (armorPocketL > 0.05) {
      volume.gear += armorPocketL;
      gearSources.push({
        name: 'armour pockets',
        weightKg: 0,
        volumeL: Math.round(armorPocketL * 10) / 10
      });
    }

    let carryPenalty = 0;
    for (const t of pawn.traits ?? []) carryPenalty += t.carryPenalty ?? 0;
    const carryMult = Math.max(0.4, 1 - carryPenalty);
    if (carryMult < 1) {
      weight.gear -= weight.capacity * (1 - carryMult);
      gearSources.push({
        name: 'natural armour',
        weightKg: -Math.round(weight.capacity * (1 - carryMult) * 10) / 10,
        volumeL: 0
      });
    }

    weight.total = Math.max(1, weight.capacity + weight.gear);
    volume.total = Math.max(1, volume.capacity + volume.gear);

    return { size, height, bodyWeight, strength: str, weight, volume, gearSources };
  }

  getCurrentCarryLoad(pawn: Pawn, _state: GameState): { weightKg: number; volumeL: number } {
    let weightKg = 0;
    let volumeL = 0;

    for (const [itemId, qty] of Object.entries(pawn.inventory?.items ?? {})) {
      if (qty <= 0) continue;
      const def = this.getItemById(itemId);
      weightKg += (def?.weightKg ?? 0.1) * qty;
      volumeL += (def?.volumeL ?? 0.2) * qty;
    }

    for (const inst of pawn.inventory?.instances ?? []) {
      const def = this.getItemById(inst.itemId);
      weightKg += (def?.weightKg ?? 0.5) * (inst.matWeight ?? 1);
      volumeL += def?.volumeL ?? 0.5;
      if (inst.contents?.length) {
        weightKg += usedWeightKg(inst);
        volumeL += usedCapacityL(inst);
      }
    }

    for (const inst of Object.values(pawn.equipment ?? {})) {
      if (!inst) continue;
      const def = this.getItemById(inst.itemId);
      weightKg += (def?.weightKg ?? 0.5) * (inst.matWeight ?? 1);
      if (inst.contents?.length) weightKg += usedWeightKg(inst);
    }

    return { weightKg, volumeL };
  }

  canAddToInventory(pawn: Pawn, itemId: string, qty: number, state: GameState): boolean {
    const budget = this.getCarryBudget(pawn, state);
    const current = this.getCurrentCarryLoad(pawn, state);
    const def = this.getItemById(itemId);
    const addW = (def?.weightKg ?? 0.1) * qty;
    const addV = (def?.volumeL ?? 0.2) * qty;
    return (
      current.weightKg + addW <= budget.maxWeightKg && current.volumeL + addV <= budget.maxVolumeL
    );
  }

  clampPickupQuantity(
    pawn: Pawn,
    itemId: string,
    qty: number,
    state: GameState,
    capFactor = 1
  ): number {
    if (qty <= 0) return 0;
    const budget = this.getCarryBudget(pawn, state);
    const load = this.getCurrentCarryLoad(pawn, state);
    const def = this.getItemById(itemId);
    const perW = def?.weightKg ?? 0.1;
    const perV = def?.volumeL ?? 0.2;
    const maxW = budget.maxWeightKg * capFactor;
    const maxV = budget.maxVolumeL * capFactor;
    const byW = perW > 0 ? Math.floor((maxW - load.weightKg) / perW) : qty;
    const byV = perV > 0 ? Math.floor((maxV - load.volumeL) / perV) : qty;
    return Math.max(1, Math.min(qty, byW, byV));
  }

  stepItemDecay(gameState: GameState, elapsedTicks = 1): GameState {
    if (gameState._devFreezeSpoilage) return gameState;
    const drops = gameState.droppedItems;
    if (!drops || drops.length === 0) return gameState;

    const tilePreserve = new Map<string, number>();
    const bump = (key: string, bonus: number | undefined) => {
      if (bonus === undefined || bonus <= 0) return;
      if (bonus > (tilePreserve.get(key) ?? 0)) tilePreserve.set(key, bonus);
    };
    for (const b of gameState.buildings ?? []) {
      if (b.status !== 'complete') continue;
      bump(
        `${b.x},${b.y}`,
        BUILDING_DEFS_FOR_ITEMS.find((def) => def.id === b.type)?.effects?.preservation
      );
    }

    const dryCtx = dryingContext(gameState);

    let changed = false;
    const next: DroppedItem[] = [];
    const rotted: { resourceId: string; x: number; y: number; stored?: boolean; qty: number }[] =
      [];

    for (const d of drops) {
      const def = this.getItemById(d.resourceId);
      if (d.instance?.contents?.length) {
        const spoiled = this.stepVesselContents(d.instance, elapsedTicks, rotted, d);
        if (spoiled) changed = true;
      }
      if (!def?.decaySeconds || (d.quantity ?? 0) <= 0) {
        next.push(d);
        continue;
      }
      if (d.reservedFor || dryRateFor(d, gameState, dryCtx) > 0) {
        next.push(d);
        continue;
      }
      const fTile = gameState.worldMap?.[d.y]?.[d.x];
      if (
        fTile &&
        effectiveTemperature(
          seasonBakedTemp(fTile.terrainType, gameState.season),
          dryCtx.weatherTemp,
          thermalAt(d.x, d.y)
        ) < 0
      ) {
        next.push(d);
        continue;
      }
      const mult = d.stored ? 1 - (tilePreserve.get(`${d.x},${d.y}`) ?? 0) : 1;
      changed = true;

      if (d.unitConditions) {
        const conds = normalizeConditions(d.unitConditions, d.quantity);
        const erosion = (100 * SECONDS_PER_TICK * elapsedTicks * mult) / def.decaySeconds;
        const { conditions, removed } = decayAll(conds, erosion);
        for (let r = 0; r < removed; r++) {
          if (def.decaysTo) {
            rotted.push({ resourceId: def.decaysTo, x: d.x, y: d.y, stored: d.stored, qty: 1 });
          }
        }
        if (conditions.length > 0)
          next.push({ ...d, quantity: conditions.length, unitConditions: conditions });
        continue;
      }

      let acc = (d.decayAcc ?? 0) + SECONDS_PER_TICK * elapsedTicks * mult;
      let qty = d.quantity;
      while (acc >= def.decaySeconds && qty > 0) {
        acc -= def.decaySeconds;
        qty -= 1;
        if (def.decaysTo) {
          rotted.push({ resourceId: def.decaysTo, x: d.x, y: d.y, stored: d.stored, qty: 1 });
        }
      }
      if (qty > 0) next.push({ ...d, quantity: qty, decayAcc: acc });
    }

    if (!changed) return gameState;

    for (const r of rotted) {
      const idx = next.findIndex(
        (d) =>
          d.resourceId === r.resourceId && d.x === r.x && d.y === r.y && !!d.stored === !!r.stored
      );
      if (idx >= 0) next[idx] = { ...next[idx], quantity: next[idx].quantity + r.qty };
      else {
        next.push({
          id: `rot-${r.resourceId}-${r.x}-${r.y}`,
          resourceId: r.resourceId,
          x: r.x,
          y: r.y,
          quantity: r.qty,
          stored: r.stored
        });
      }
    }

    return withDrops(gameState, next);
  }

  carcassConditionByType(gameState: GameState): Record<string, number> {
    return computeCarcassConditionByType(gameState.droppedItems);
  }

  private stepVesselContents(
    inst: ItemInstance,
    elapsedTicks: number,
    rotted: { resourceId: string; x: number; y: number; stored?: boolean; qty: number }[],
    at: { x: number; y: number; stored?: boolean }
  ): boolean {
    if (vesselOf(inst.itemId)?.sealed) return false;
    let changed = false;
    const kept: NonNullable<ItemInstance['contents']> = [];
    for (const e of inst.contents ?? []) {
      const def = this.getItemById(e.itemId);
      if (!def?.decaySeconds || e.amount == null) {
        kept.push(e);
        continue;
      }
      let acc = (e.decayAcc ?? 0) + SECONDS_PER_TICK * elapsedTicks;
      let qty = e.amount;
      while (acc >= def.decaySeconds && qty > 0) {
        acc -= def.decaySeconds;
        qty -= 1;
        if (def.decaysTo)
          rotted.push({ resourceId: def.decaysTo, x: at.x, y: at.y, stored: at.stored, qty: 1 });
      }
      changed = true;
      if (qty > 0) kept.push({ ...e, amount: qty, decayAcc: acc });
    }
    if (changed) inst.contents = kept.length ? kept : undefined;
    return changed;
  }

  stepItemDeterioration(gameState: GameState, elapsedTicks = 1): GameState {
    if (gameState._devFreezeDeterioration) return gameState;
    const dropped = gameState.droppedItems;
    if (!dropped || dropped.length === 0) return gameState;

    const roofed = new Set<string>();
    for (const b of gameState.buildings ?? []) {
      if (b.status !== 'complete') continue;
      const def = BUILDING_DEFS_FOR_ITEMS.find((x) => x.id === b.type);
      if ((def?.effects as Record<string, number> | undefined)?.['roof'])
        roofed.add(`${b.x},${b.y}`);
    }
    const weatherMul = weatherExposureFactor(gameState.weather);

    let changed = false;
    const next: DroppedItem[] = [];
    for (const di of dropped) {
      if (di.stored || roofed.has(`${di.x},${di.y}`)) {
        next.push(di);
        continue;
      }
      const def = this.getItemById(di.resourceId);
      if (!def) {
        next.push(di);
        continue;
      }
      const rate = this.deteriorationRateFor(def);
      if (rate <= 0) {
        next.push(di);
        continue;
      }
      const max = def.maxDurability ?? DEFAULT_MAX_DURABILITY;
      const left =
        (di.durability ?? max) - rate * DETERIORATION_GLOBAL_SCALE * elapsedTicks * weatherMul;
      changed = true;
      if (left <= 0) {
        continue;
      }
      next.push({ ...di, durability: left });
    }

    return changed ? { ...gameState, droppedItems: next } : gameState;
  }

  private deteriorationRateFor(def: Item): number {
    if (def.deteriorationRate !== undefined) return def.deteriorationRate;
    return DETERIORATION_RATE_BY_CATEGORY[def.category] ?? DEFAULT_DETERIORATION_RATE;
  }

  dryingTargetSeconds(resourceId: string): number | null {
    return dryingRuleFor(resourceId)?.seconds ?? null;
  }

  dryingStatus(d: DroppedItem, gameState: GameState): DryingStatus | null {
    if (d.reservedFor) return null;
    const rule = dryingRuleFor(d.resourceId);
    if (!rule) return null;
    const target = rule.seconds;
    const progress = d.drying ?? 0;

    if (rule.mode === 'fire-ring') {
      let nearest = Infinity;
      for (const b of gameState.buildings ?? []) {
        if (b.status === 'complete' && b.lit)
          nearest = Math.min(nearest, chebyshev(d.x, d.y, b.x, b.y));
      }
      const inRing = nearest === 2;
      return {
        target,
        progress,
        rate: inRing ? 1 : 0,
        reason: inRing ? undefined : 'no-fire',
        bonus: 1
      };
    }

    const tile = gameState.worldMap?.[d.y]?.[d.x];
    if (!tile) return { target, progress, rate: 0, reason: 'cold', bonus: 1 };
    const thermal = computeThermalAt(d.x, d.y, gameState.buildings, gameState.worldMap);
    const weatherTemp =
      weatherEffects(gameState.weather).tempDelta +
      diurnalTempDelta(gameState.turn, gameState.season);
    const temp = effectiveTemperature(
      seasonBakedTemp(tile.terrainType, gameState.season),
      weatherTemp,
      thermal
    );
    let bonus = 1;
    for (const b of gameState.buildings ?? []) {
      if (b.status !== 'complete' || b.x !== d.x || b.y !== d.y) continue;
      bonus = Math.max(bonus, buildingService.getBuildingById(b.type)?.effects?.dryingBonus ?? 0);
    }
    const rate = ambientDryRate(
      temp,
      tileWetness(tile.moisture ?? 0, gameState.weather, thermal),
      bonus,
      thermal.warmth
    );
    const wetness = dryingWetness(
      tileWetness(tile.moisture ?? 0, gameState.weather, thermal),
      thermal.warmth
    );
    const reason = rate > 0 ? undefined : wetness >= DRY_WET_DAMP ? 'wet' : 'cold';
    return { target, progress, rate, reason, temp, wetness, bonus };
  }

  stepDrying(gameState: GameState, elapsedTicks = 1): GameState {
    const drops = gameState.droppedItems;
    if (!drops || drops.length === 0) return gameState;

    let hasDryable = false;
    for (const d of drops) {
      if ((d.quantity ?? 0) <= 0 || d.reservedFor) continue;
      if (dryingRuleFor(d.resourceId)) {
        hasDryable = true;
        break;
      }
      if (
        d.instance?.contents?.length &&
        !vesselOf(d.resourceId)?.sealed &&
        d.instance.contents.some((e) => e.amount != null && dryingRuleFor(e.itemId))
      ) {
        hasDryable = true;
        break;
      }
    }
    if (!hasDryable) return gameState;

    const ctx = dryingContext(gameState);
    const dt = SECONDS_PER_TICK * elapsedTicks;

    let changed = false;
    const next = drops.map((d) => {
      if ((d.quantity ?? 0) <= 0 || d.reservedFor) return d;
      const rule = dryingRuleFor(d.resourceId);
      if (!rule) {
        if (!d.instance?.contents?.length || vesselOf(d.resourceId)?.sealed) return d;
        let touched = false;
        const contents = d.instance.contents.map((e) => {
          const r = e.amount != null ? dryingRuleFor(e.itemId) : null;
          if (!r) return e;
          const rate = dryRateFor(d, gameState, ctx, r);
          if (rate <= 0) return e;
          const drying = Math.max(0, (e.drying ?? 0) + dt * rate);
          touched = true;
          return drying >= r.seconds
            ? { ...e, itemId: r.itemId, drying: undefined }
            : { ...e, drying };
        });
        if (!touched) return d;
        changed = true;
        return { ...d, instance: { ...d.instance, contents } };
      }
      const rate = dryRateFor(d, gameState, ctx);
      if (rate === 0) return d;
      const have = d.drying ?? 0;
      if (rate < 0 && have <= 0) return d;
      const drying = Math.max(0, have + dt * rate);
      changed = true;
      if (rate > 0 && drying >= rule.seconds)
        return { ...d, resourceId: rule.itemId, drying: undefined };
      return { ...d, drying };
    });

    if (!changed) return gameState;
    return withDrops(gameState, next);
  }

  applyToolWear(workCategory: string, gameState: GameState): GameState {
    const stockpile = gameState.stockpile ?? {};
    const tool = ITEMS_DATABASE.find(
      (i) =>
        i.type === 'tool' &&
        (i.processingType?.includes(workCategory) || i.category === workCategory) &&
        (stockpile[i.id] ?? 0) > 0
    );
    if (!tool) return gameState;
    return this.wearToolById(tool.id, gameState);
  }

  wearToolById(toolId: string, gameState: GameState): GameState {
    if ((gameState.stockpile?.[toolId] ?? 0) <= 0) return gameState;
    const def = this.getItemById(toolId);
    const loss = def?.durabilityLossPerAction ?? 2;
    const max = def?.maxDurability ?? 40;
    const wear = { ...(gameState.toolWear ?? {}) };
    wear[toolId] = (wear[toolId] ?? 0) + loss;
    if (wear[toolId] >= max) {
      wear[toolId] = 0;
      console.log(`[ItemService] ${def?.name ?? toolId} broke/cracked from use`);
      return { ...this.consumeItems({ [toolId]: 1 }, gameState), toolWear: wear };
    }
    return { ...gameState, toolWear: wear };
  }
}

export const itemService = new ItemServiceImpl();
