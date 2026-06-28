import type {
  Item,
  GameState,
  DynamicIngredientSlot,
  DroppedItem,
  Recipe,
  Pawn,
  ItemQuality
} from '../core/types';
import { qualityPrefix } from '../core/itemQuality';
import {
  decayAll,
  normalizeConditions,
  carcassConditionByType as computeCarcassConditionByType
} from '../core/carcassCondition';
import {
  consumeFromStockpiles,
  addToStockpileZone,
  aggregateFromDrops,
  availableQuantityFromDrops,
  colonyToolTier
} from '../core/GameState';
import { recipeService } from './RecipeService';
import { buildingService } from './BuildingService';
import {
  thermalAt,
  computeThermalAt,
  seasonBakedTemp,
  effectiveTemperature,
  tileWetness,
  weatherEffects,
  diurnalTempDelta,
  WET_TILE_THRESHOLD
} from './EnvironmentService';
import itemsData from '../database/items.jsonc';
import buildingsData from '../database/buildings.jsonc';
import { SECONDS_PER_TICK } from '../core/time';
import { chebyshev } from '../core/distance';
import { sizeFromHeight } from '../core/Race';
// Gated console shim (ADR-011): per-tick/per-action log/debug/info/warn are silent unless
// gameDebug(true); console.error still surfaces.
import { gatedConsole as console } from '../core/log';

const ITEMS_DATABASE = itemsData as unknown as Item[];

// O(1) id lookup over the static item DB. `getItemById` was a per-call `.find()` and showed up
// hot in the sim worker profile; the DB never mutates at runtime, so index once.
let _itemById: Map<string, Item> | null = null;
function itemIndex(): Map<string, Item> {
  return (_itemById ??= new Map(ITEMS_DATABASE.map((i) => [i.id, i])));
}
// Building defs are needed for tile-aware decay (storage multipliers, roofs).
const BUILDING_DEFS_FOR_ITEMS = buildingsData as unknown as import('../core/types').Building[];

/**
 * `category:<cat>` cost/slot match. Real item categories match by `item.category`; the special
 * pseudo-category **`plank`** matches ANY sawn plank (pine/oak/birch/ash/yew + magic-wood planks),
 * so a building cost (`category:plank`) or recipe slot can ask for "any plank" rather than hardcoding
 * `pine_plank`. Add further pseudo-categories here as the single chokepoint.
 */
export function itemMatchesCostCategory(item: { id: string; category?: string }, cat: string): boolean {
  if (cat === 'plank') return item.id.endsWith('_plank');
  if (cat === 'log') return item.id.endsWith('_log');
  return item.category === cat;
}

// §B Durability defaults — every item weathers when left exposed (loose, unsheltered).
// Explicit `deteriorationRate`/`maxDurability` on an item override these. Rate 0 = weather-immune.
const DEFAULT_MAX_DURABILITY = 100;
const DEFAULT_DETERIORATION_RATE = 0.02; // per tick (before the global scale below)
/**
 * Global lifespan scale applied to ALL deterioration rates. The per-item/category rates below set
 * the RELATIVE durability (stone/metal slowest → organics fastest); this single factor stretches
 * the absolute timescale to real-feeling lifespans without editing ~200 item rows. A day = 300
 * in-game s × 60 = 18,000 ticks; week ≈ 126k; month ≈ 540k. At 0.02 (≈1/50): most items
 * (wood/construction ~0.01–0.04) last ~1 week, metal/ingot/bar (0.008) ~1+ months, stone ~2 months,
 * organics/food (0.07–0.08) ~3–4 days (raw food also spoils separately via stepItemDecay).
 */
export const DETERIORATION_GLOBAL_SCALE = 0.02;
// §1 wood seasoning: sim-seconds within the drying ring before green firewood turns dry.
const WOOD_DRYING_SECONDS = 1800;
// Hay-making: cut grass (plant_fiber) cures into hay in the open ONLY where it is warm AND dry — laid
// out on a tile that's wet (rain / near water / a bog) instead reverses the cure. A hay rack
// (effects.dryingBonus) multiplies the rate; a nearby fire warms the tile (via thermalAt) so it clears
// the temperature gate faster — the two stack. The fuel-fired kiln is a later tier: an actual furnace
// that simply carries a larger dryingBonus, no special-casing here.
const HAY_DRYING_SECONDS = 1200; // open-air seconds at full warmth before plant_fiber turns to hay
const HAY_DRY_TEMP_FLOOR = 12; // °C below which the cut grass does not dry at all
const HAY_DRY_TEMP_REF = 28; // °C at/above which drying runs at full (open-air) speed
const HAY_WET_DECAY = 2; // drying seconds lost per real second while the stack sits on a wet tile

/**
 * Cut-grass drying rate at a spot: drying-seconds gained per second of exposure. >0 cures, 0 = too
 * cold to dry, <0 = reversing (the tile is wet — rain ruins drying hay). `bonus` is the tile's
 * building dryingBonus (1 = open ground). The SINGLE formula stepDrying + the UI dryness readout
 * share so they can't drift. Open-ground full-warmth rate = 1.
 */
function fiberDryRate(temp: number, wetness: number, bonus: number): number {
  if (wetness >= WET_TILE_THRESHOLD) return -HAY_WET_DECAY;
  const f = Math.max(0, Math.min(1, (temp - HAY_DRY_TEMP_FLOOR) / (HAY_DRY_TEMP_REF - HAY_DRY_TEMP_FLOOR)));
  return f * bonus;
}

/** Live drying readout for one stack, for the UI dryness meter + speed arrow (null = doesn't dry). */
export interface DryingStatus {
  /** Total drying-seconds the stack needs before it cures. */
  target: number;
  /** Accrued drying-seconds so far. */
  progress: number;
  /** Drying-seconds gained per second now: >0 curing, 0 stalled, <0 reversing (wet). */
  rate: number;
  /** Why it isn't progressing (only when rate <= 0). */
  reason?: 'wet' | 'cold' | 'no-fire';
  /** Effective tile temperature (°C) — present for the temperature/wetness cure (plant_fiber). */
  temp?: number;
  /** Effective tile wetness (0–100%) — present for the temperature/wetness cure. */
  wetness?: number;
  /** Building drying multiplier in play (1 = open ground / no rack). */
  bonus: number;
}
const DETERIORATION_RATE_BY_CATEGORY: Record<string, number> = {
  stone: 0.004, // rock barely weathers
  primitive: 0.01,
  metal: 0.008,
  ingot: 0.008,
  bar: 0.008,
  construction: 0.01,
  wood: 0.04,
  fuel: 0.04,
  organic: 0.07,
  food: 0.08,
  meat: 0.08,
  storage: 0.02,
  natural_weapon: 0 // innate attacks: never real dropped items, but immune for safety
};

/** Itemised carry-budget breakdown for the UI (see ItemService.getCarryCapacityBreakdown). */
export interface CarryCapacityBreakdown {
  /** Size category derived from the pawn's actual height (a description of height, not the race box). */
  size: string;
  /** Height in cm (shown for context — carry is driven by body mass, not height). */
  height: number;
  /** Body mass in kg — the realistic driver of carry capacity. */
  bodyWeight: number;
  strength: number;
  /** Realistic carry weight = bodyWeight × loadFraction (a STR-dependent % of body mass) + gear. */
  weight: {
    bodyWeight: number;
    loadFraction: number;
    capacity: number;
    gear: number;
    total: number;
  };
  /** Carry volume = bodyWeight × a frame fraction (strength-independent bulk) + gear. */
  volume: { bodyWeight: number; fraction: number; capacity: number; gear: number; total: number };
  gearSources: { name: string; weightKg: number; volumeL: number }[];
}

/**
 * ItemService - Clean interface for item queries and operations
 * Separates business logic from data definitions
 */
export interface ItemService {
  // Query Methods
  getItemById(id: string): Item | undefined;
  /** R10: build a `dynamicName` item's per-instance name from a subject (e.g. "Bjorn's Corpse"). */
  makeDynamicName(itemId: string, subjectName: string): string;
  /** R10: display name for a dropped item — honours a `dynamicName` item's per-drop `name` override. */
  getItemDisplayName(drop: { resourceId: string; name?: string; quality?: ItemQuality }): string;
  /** §F8: compose a mixed-ingredient dish's per-instance name from the chosen ingredients
   *  ("Venison & Cabbage Stew"). Returns undefined unless the item is a `dynamicName` dynamicRecipe. */
  composeDynamicDishName(
    itemId: string,
    selected?: Record<string, string>
  ): string | undefined;
  getItemsByType(type: string): Item[];
  getItemsByCategory(category: string): Item[];
  /** Distinct item categories (sorted), across the whole item DB. */
  getAllCategories(): string[];
  getCraftableItems(gameState: GameState, pawnId?: string): Item[];
  getItemsByWorkType(workType: string): Item[];

  // Validation Methods
  canCraftItem(itemId: string, gameState: GameState, pawnId?: string): boolean;
  /** Non-material craftability gates (station/tools/research/population/mold). Materials may be
   *  absent — a queued order then waits as `pending` until they're stocked. */
  canQueueCraft(itemId: string, gameState: GameState): boolean;
  hasRequiredMaterials(itemId: string, gameState: GameState): boolean;
  hasRequiredTools(itemId: string, gameState: GameState): boolean;
  hasRequiredBuilding(itemId: string, gameState: GameState): boolean;
  /** Returns the cost set to consume (primary or first matching alternative), or null if nothing is satisfied. */
  resolveActiveCost(
    itemId: string,
    gameState: GameState,
    selectedIngredients?: Record<string, string>
  ): Record<string, number> | null;
  /**
   * For items with a dynamicRecipe: auto-picks the first available item per slot
   * whose `category` matches `acceptsCategory`.
   * Returns {} for items with no dynamicRecipe, or null if a slot cannot be satisfied.
   */
  autoSelectIngredients(itemId: string, gameState: GameState): Record<string, string> | null;

  // Calculation Methods
  calculateCraftingCost(itemId: string): Record<string, number>;
  calculateItemEffects(itemId: string): Record<string, number>;

  // Display Methods
  getItemIcon(itemId: string): string;
  getItemColor(itemId: string): string;

  // Inventory Methods
  getAvailableQuantity(itemId: string, gameState: GameState): number;
  consumeItems(itemIds: Record<string, number>, gameState: GameState): GameState;
  addItems(itemIds: Record<string, number>, gameState: GameState): GameState;

  // Carry capacity
  getCarryBudget(pawn: Pawn, state: GameState): { maxWeightKg: number; maxVolumeL: number };
  /** Itemised carry-budget breakdown (body mass × strength-scaled load fraction + gear) — single
   *  source of truth for the CAPACITIES panel and the CARRYING header so the UI can show the maths. */
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

  // Decay
  /** Spoil perishables. `elapsedTicks` = ticks since the last call (the caller throttles this to run
   *  every N ticks, not every tick — spoilage clocks are days-long, so per-tick re-referencing of the
   *  whole `droppedItems` array is waste that churns the snapshot diff). */
  stepItemDecay(gameState: GameState, elapsedTicks?: number): GameState;
  /** Average carcass CONDITION (0–100) per carcass item type across stored stacks — the readout the
   *  sidebar/butchery panel show (replaces the old `carcassIntactness` map). No stock → 100 (fresh). */
  carcassConditionByType(gameState: GameState): Record<string, number>;
  /** Weather loose items. `elapsedTicks` = ticks since the last call (the caller throttles this to
   *  run every N ticks, not every tick — durability lifespans are days/weeks, so per-tick is waste). */
  stepItemDeterioration(gameState: GameState, elapsedTicks?: number): GameState;
  /** §B tool work-wear: spend durability on the colony's tool for `workCategory`; break at 0. */
  applyToolWear(workCategory: string, gameState: GameState): GameState;
  /** §B: wear a specific tool by id; it breaks (consumed) at maxDurability. */
  wearToolById(toolId: string, gameState: GameState): GameState;
  /** Passive drying (every tick): green firewood seasons near a lit fire; plant_fiber (cut grass)
   *  cures into hay where warm & dry, faster on a hay rack (effects.dryingBonus). */
  stepDrying(gameState: GameState): GameState;
  /** Drying seconds a stack of this resource needs before it cures (firewood → dry_firewood,
   *  plant_fiber → hay), for the UI dryness meter; null when the resource doesn't dry. */
  dryingTargetSeconds(resourceId: string): number | null;
  /** Live drying readout for a stack — progress, current rate, and the temperature/wetness/bonus
   *  driving it — for the UI dryness meter + speed arrow. null when the resource doesn't dry. */
  dryingStatus(d: DroppedItem, gameState: GameState): DryingStatus | null;
}

/**
 * ItemService Implementation
 */
export class ItemServiceImpl implements ItemService {
  getItemById(id: string): Item | undefined {
    return itemIndex().get(id);
  }

  makeDynamicName(itemId: string, subjectName: string): string {
    const def = this.getItemById(itemId);
    if (!def?.dynamicName) return def?.name ?? itemId;
    return `${subjectName}'s ${def.name}`;
  }

  composeDynamicDishName(
    itemId: string,
    selected?: Record<string, string>
  ): string | undefined {
    const def = this.getItemById(itemId);
    const recipe = recipeService.getRecipeForItem(itemId);
    if (!def?.dynamicName || !recipe?.dynamicRecipe || !selected) return undefined;
    // Unique ingredient display names in slot order → "A", "A & B", "A, B & C".
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
    // §Q: prepend the craft-quality prefix ("Masterwork Iron Sword"); Standard/undefined adds nothing.
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
      // Must have a producing recipe (authored in recipes.jsonc or synthesised from inline fields)
      if (!recipeService.getRecipeForItem(item.id)) return false;
      return this.canCraftItem(item.id, gameState, pawnId);
    });
  }

  canCraftItem(itemId: string, gameState: GameState, pawnId?: string): boolean {
    // Materials gate first; the remaining (non-material) gates live in canQueueCraft so an order
    // can be QUEUED without stock and wait as `pending` until the materials are stocked.
    if (!this.hasRequiredMaterials(itemId, gameState)) return false;
    return this.canQueueCraft(itemId, gameState);
  }

  canQueueCraft(itemId: string, gameState: GameState): boolean {
    const item = this.getItemById(itemId);
    if (!item) return false;

    // Recipe registry: all craftability flows from the producing recipe. (Butchery is just a
    // butcher_spot recipe — carcass in, meat/pelt out, one carcass per run; ADR-016.)
    const recipe = recipeService.getRecipeForItem(itemId);
    if (!recipe) return false;

    // Check tools
    if (!this.hasRequiredTools(itemId, gameState)) return false;

    // Check building
    if (!this.hasRequiredBuilding(itemId, gameState)) return false;

    // Check research (DEBUG: `_devResearchGateOff` turns this gate off — see gamestate.ts)
    if (
      !gameState._devResearchGateOff &&
      recipe.researchRequired &&
      !gameState.completedResearch.includes(recipe.researchRequired)
    ) {
      return false;
    }

    // Check population
    if (recipe.populationRequired && gameState.pawns.length < recipe.populationRequired) {
      return false;
    }

    // Stews require the clay cooking pot — now wired through the ADR-009 craft-tool gate (the recipes
    // declare a `cooking` toolRequirement + the Cooking work category lists clay_cooking_pot), so a cook
    // fetches/holds the pot to claim the job and it wears with use. No ad-hoc stockpile check needed.

    // §5 casting molds are ordinary single-use inputs now: a casting recipe lists `clay_mold` in
    // its inputs, so the generic material check below already gates on having one in stock.

    return true;
  }

  hasRequiredMaterials(itemId: string, gameState: GameState): boolean {
    if (!recipeService.getRecipeForItem(itemId)) return true;
    return this.resolveActiveCost(itemId, gameState) !== null;
  }

  autoSelectIngredients(itemId: string, gameState: GameState): Record<string, string> | null {
    const recipe = recipeService.getRecipeForItem(itemId);
    if (!recipe?.dynamicRecipe) return {};
    const selected: Record<string, string> = {};
    // DISTINCT across slots: a mixed-ingredient dish (e.g. a 3-ingredient stew) auto-fills each slot
    // with a DIFFERENT in-stock item so it composes a varied meal, not three of the same. Tracks both
    // the chosen ids AND the running per-id demand so two slots landing on the same item still verify
    // the COMBINED quantity is in stock (the resolveActiveCost sum-path mirrors this).
    const demand: Record<string, number> = {};
    for (const [slotKey, slot] of Object.entries(recipe.dynamicRecipe)) {
      const cats = recipeService.slotCategories(slot);
      const candidates = ITEMS_DATABASE.filter(
        (i) =>
          cats.some((c) => itemMatchesCostCategory(i, c)) &&
          this.getAvailableQuantity(i.id, gameState) >= (demand[i.id] ?? 0) + slot.quantity
      );
      if (!candidates.length) return null;
      // Prefer an item not already chosen by another slot (variety); fall back to the first that still
      // has enough combined stock if every candidate is already taken.
      const chosen = candidates.find((c) => !(c.id in demand)) ?? candidates[0];
      selected[slotKey] = chosen.id;
      demand[chosen.id] = (demand[chosen.id] ?? 0) + slot.quantity;
    }
    return selected;
  }

  /**
   * Expand a cost map's `category:<cat>` slots (e.g. `category:plank` = "any plank") into concrete item
   * ids, paid greedily from AVAILABLE stock. Concrete keys are checked against stock too. Returns the
   * concrete `{itemId: qty}` map, or null if any slot can't be covered — the recipe analogue of
   * BuildingService.resolveBuildingCost.
   */
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
          if (need <= 0) break;
          if (!itemMatchesCostCategory(item, cat)) continue;
          const avail = this.getAvailableQuantity(item.id, gameState) - (used[item.id] ?? 0);
          if (avail <= 0) continue;
          const take = Math.min(avail, need);
          out[item.id] = (out[item.id] ?? 0) + take;
          used[item.id] = (used[item.id] ?? 0) + take;
          need -= take;
        }
        if (need > 0) return null;
      } else {
        const avail = this.getAvailableQuantity(key, gameState) - (used[key] ?? 0);
        if (avail < qty) return null;
        out[key] = (out[key] ?? 0) + qty;
        used[key] = (used[key] ?? 0) + qty;
      }
    }
    return out;
  }

  /** Stock-agnostic expansion: map each `category:<cat>` slot to a REPRESENTATIVE concrete item (the
   *  first match) so a pending/display cost never carries a raw `category:` key. */
  expandCategoryCostLoose(cost: Record<string, number>): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [key, qty] of Object.entries(cost)) {
      if (key.startsWith('category:')) {
        const cat = key.slice('category:'.length);
        const rep = ITEMS_DATABASE.find((i) => itemMatchesCostCategory(i, cat))?.id ?? key;
        out[rep] = (out[rep] ?? 0) + qty;
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

    // Resolve base crafting cost (empty inputs {} is valid — no base materials needed). Expands any
    // `category:` slots from stock; an unaffordable base falls through to the alternatives.
    let baseCost = this.expandCategoryCost(recipe.inputs, gameState);
    if (baseCost === null && recipe.inputAlternatives?.length) {
      for (const alt of recipe.inputAlternatives) {
        baseCost = this.expandCategoryCost(alt, gameState);
        if (baseCost) break;
      }
    }
    if (baseCost === null) return null;

    // No dynamic recipe — return base cost (original behaviour)
    if (!recipe.dynamicRecipe) return baseCost;

    // Resolve dynamic ingredient slots
    const selected = selectedIngredients ?? this.autoSelectIngredients(itemId, gameState);
    if (!selected) return null;

    // SUM per id across slots (two slots may legitimately pick the same item) — never overwrite, or a
    // 2× pick would only charge once. Verify the COMBINED demand against stock.
    const dynamicCosts: Record<string, number> = {};
    for (const [slotKey, slot] of Object.entries(recipe.dynamicRecipe)) {
      const chosenId = selected[slotKey];
      if (!chosenId) return null;
      dynamicCosts[chosenId] = (dynamicCosts[chosenId] ?? 0) + slot.quantity;
    }
    for (const [id, qty] of Object.entries(dynamicCosts)) {
      if (this.getAvailableQuantity(id, gameState) < qty) return null;
    }

    // Merge base + dynamic by SUMMING (a dish could also list a base input that overlaps a slot pick).
    const total: Record<string, number> = { ...baseCost };
    for (const [id, qty] of Object.entries(dynamicCosts)) total[id] = (total[id] ?? 0) + qty;
    return total;
  }

  hasRequiredTools(itemId: string, gameState: GameState): boolean {
    const tier = recipeService.getRecipeForItem(itemId)?.toolTierRequired;
    if (!tier) return true;
    // ADR-009: a crafted/owned tool of the required tier satisfies the gate, not only research.
    return colonyToolTier(gameState) >= tier;
  }

  hasRequiredBuilding(itemId: string, gameState: GameState): boolean {
    const recipe = recipeService.getRecipeForItem(itemId);
    // null station → at minimum a craft_spot. ADR-016 station tiers: a higher generic workshop
    // (Crude Workbench) supersedes a lower one (craft_spot), so it can fulfill the requirement.
    const station = recipe?.station ?? 'craft_spot';
    if (!buildingService.bestCraftStation(station, gameState)) return false;

    // Legacy buildingRequired field (exact-type, separate from the crafting station).
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
    // ADR-016: spendable stock = stored drops NOT reserved for a craft order. `stockpile`
    // still counts reserved stacks (physically present, shown in the UI); affordability must
    // not, or two orders could double-spend the same stock.
    return availableQuantityFromDrops(gameState.droppedItems, itemId);
  }

  consumeItems(itemIds: Record<string, number>, gameState: GameState): GameState {
    return consumeFromStockpiles(gameState, itemIds);
  }

  addItems(itemIds: Record<string, number>, gameState: GameState): GameState {
    // Route through addToStockpileZone so zone inventories and aggregate stay in sync.
    return addToStockpileZone(gameState, null, itemIds);
  }

  // ── Carry capacity ───────────────────────────────────────────────────────────────────────

  /**
   * Carry weight/volume budget for this pawn — physically grounded:
   *   maxWeightKg = bodyWeight × loadFraction      (loadFraction = clamp(STR × 0.012, 0.05, 0.30))
   *   maxVolumeL  = bodyWeight × 0.13
   * Carry capacity scales with BODY MASS and STRENGTH (a porter bears a higher fraction of their own
   * weight than a weakling), not a flat base or a distance-from-10 term — so doubling STR ~doubles the
   * load fraction instead of swinging a low-STR pawn to near-zero. Belt/back containers (inventoryBonus)
   * add on top.
   */
  getCarryBudget(pawn: Pawn, _state: GameState): { maxWeightKg: number; maxVolumeL: number } {
    const b = this.getCarryCapacityBreakdown(pawn);
    return { maxWeightKg: b.weight.total, maxVolumeL: b.volume.total };
  }

  getCarryCapacityBreakdown(pawn: Pawn): CarryCapacityBreakdown {
    const height = pawn.physicalTraits?.height ?? 170;
    const bodyWeight = pawn.physicalTraits?.weight ?? 70;
    const size = sizeFromHeight(height);
    const str = pawn.stats.strength ?? 10;

    // A pawn bears a STRENGTH-dependent fraction of its OWN body mass — ~1.2% per STR point, clamped to
    // a realistic 5%–30% of body weight (STR 10 ≈ 12%; a strong porter ~25%). Volume (bulk) tracks the
    // frame, ~13% of body mass, independent of strength.
    const loadFraction = Math.min(0.3, Math.max(0.05, str * 0.012));
    const VOLUME_FRACTION = 0.13;
    const weight = {
      bodyWeight,
      loadFraction,
      capacity: bodyWeight * loadFraction,
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

    // Any equipped item with an inventoryBonus raises the budget — belt/back pouches and baskets, and
    // (§L) a wheelbarrow/handcart held in hand. Only containers and carts carry the field, so scanning
    // every slot is safe and means a cart grants capacity from the mainHand slot it occupies.
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

    // Unified load model: worn ARMOUR adds VOLUME capacity (belt pouches / strap points) even as its
    // weight fills the weight budget — so armour isn't a pure carry sink. ~0.5 L per kg of armour.
    // Excludes containers (their inventoryBonus is already counted above) and shields.
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

    weight.total = Math.max(1, weight.capacity + weight.gear);
    volume.total = Math.max(1, volume.capacity + volume.gear);

    return { size, height, bodyWeight, strength: str, weight, volume, gearSources };
  }

  /**
   * Current weight and volume load for this pawn. The pack (bulk `inventory.items` +
   * tracked `inventory.instances`) costs both weight AND volume. Equipped gear costs WEIGHT
   * ONLY — the pawn bears its mass (so an armoured pawn hauls less), but worn gear isn't in the
   * pack, so it doesn't consume pack volume. Belt/back containers separately RAISE the budget
   * via getCarryBudget's inventoryBonus.
   */
  getCurrentCarryLoad(pawn: Pawn, _state: GameState): { weightKg: number; volumeL: number } {
    let weightKg = 0;
    let volumeL = 0;

    // Bulk items (pack) — weight + volume
    for (const [itemId, qty] of Object.entries(pawn.inventory?.items ?? {})) {
      if (qty <= 0) continue;
      const def = this.getItemById(itemId);
      weightKg += (def?.weightKg ?? 0.1) * qty;
      volumeL += (def?.volumeL ?? 0.2) * qty;
    }

    // Tracked instances in inventory (pack) — weight + volume
    for (const inst of pawn.inventory?.instances ?? []) {
      const def = this.getItemById(inst.itemId);
      weightKg += def?.weightKg ?? 0.5;
      volumeL += def?.volumeL ?? 0.5;
    }

    // Equipped gear — weight only (worn, not packed; see method doc).
    for (const inst of Object.values(pawn.equipment ?? {})) {
      if (!inst) continue;
      const def = this.getItemById(inst.itemId);
      weightKg += def?.weightKg ?? 0.5;
    }

    return { weightKg, volumeL };
  }

  /** Returns true if adding `qty` of `itemId` would not exceed weight or volume budget. */
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

  /**
   * R5: how many units of `itemId` the pawn can pick up without exceeding its weight/volume
   * budget (belt/back containers raise it). A pawn that can't fit a whole stack takes what fits
   * and leaves the rest for another trip. **Always floors at 1**: a single item is carried in the
   * hands, so capacity never blocks picking up ONE of it — a pawn must be able to haul a heavy
   * carcass (or, later, carry a downed pawn to shelter) even when it exceeds the budget. In
   * practice haulers are empty at pickup anyway (they deposit before taking new work), so this
   * only relaxes the genuinely-over-budget single-unit case.
   */
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
    // capFactor > 1 lets haulers load past full capacity into the `encumbered` band (ENC_OVERLOAD_FULL).
    const maxW = budget.maxWeightKg * capFactor;
    const maxV = budget.maxVolumeL * capFactor;
    const byW = perW > 0 ? Math.floor((maxW - load.weightKg) / perW) : qty;
    const byV = perV > 0 ? Math.floor((maxV - load.volumeL) / perV) : qty;
    return Math.max(1, Math.min(qty, byW, byV));
  }

  /**
   * §C organic spoilage — per-stack. Every stack (stored or loose) of a perishable item accrues a
   * spoilage clock; at the def's decaySeconds one unit rots into `decaysTo`. Containers stored on
   * the same tile modestly slow a stored stack's clock by their `preservationBonus` (woven basket
   * −10%, clay urn −20%, wooden chest −30%; best one wins). Deeper preservation (cold/freezing) is
   * owned by the temperature system (Living World), not containers.
   */
  stepItemDecay(gameState: GameState, elapsedTicks = 1): GameState {
    const drops = gameState.droppedItems;
    if (!drops || drops.length === 0) return gameState;

    // Best preservation per tile — the larger of any stored container stack's `preservationBonus`
    // (woven basket item −10%, clay urn −20%…) and any storage-bin BUILDING's `effects.preservation`
    // on the same tile (the wicker-basket store keeps its food fresher). Best one wins.
    const tilePreserve = new Map<string, number>();
    const bump = (key: string, bonus: number | undefined) => {
      if (bonus === undefined || bonus <= 0) return;
      if (bonus > (tilePreserve.get(key) ?? 0)) tilePreserve.set(key, bonus);
    };
    for (const d of drops) {
      if (!d.stored || (d.quantity ?? 0) <= 0) continue;
      bump(`${d.x},${d.y}`, this.getItemById(d.resourceId)?.preservationBonus);
    }
    for (const b of gameState.buildings ?? []) {
      if (b.status !== 'complete') continue;
      bump(`${b.x},${b.y}`, BUILDING_DEFS_FOR_ITEMS.find((def) => def.id === b.type)?.effects?.preservation);
    }

    let changed = false;
    const next: DroppedItem[] = [];
    const rotted: { resourceId: string; x: number; y: number; stored?: boolean; qty: number }[] =
      [];

    for (const d of drops) {
      const def = this.getItemById(d.resourceId);
      if (!def?.decaySeconds || (d.quantity ?? 0) <= 0) {
        next.push(d);
        continue;
      }
      const mult = d.stored ? 1 - (tilePreserve.get(`${d.x},${d.y}`) ?? 0) : 1;
      changed = true;

      // Carcasses (per-unit `unitConditions`): the environment rots the WHOLE pile, so erode EVERY
      // unit's condition this tick (a unit fully erodes over the def's decaySeconds). Units that reach 0
      // are stripped → `decaysTo`. This is distinct from CONSUMPTION, which only touches the top unit.
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
        // length 0 → whole pile rotted away; drop it
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
      // qty 0 → stack fully rotted away; drop it
    }

    if (!changed) return gameState;

    // Merge rotted output into stacks at the same tile.
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

    return { ...gameState, droppedItems: next, stockpile: aggregateFromDrops(next) };
  }

  carcassConditionByType(gameState: GameState): Record<string, number> {
    return computeCarcassConditionByType(gameState.droppedItems);
  }

  /**
   * §B Durability — the elements (wind/rain) physically wearing an item apart. EVERY item has a
   * durability pool: a loose stack (DroppedItem with `stored !== true`) loses `deteriorationRate`
   * durability per tick from its `maxDurability` pool; at 0 the stack is destroyed. Items in a
   * container / on a stockpile tile (`stored`) are sheltered — no exposure damage (spec §F).
   *
   * This is SEPARATE from spoilage (`stepItemDecay`/`decaySeconds`), which rots food into
   * `rotten_food` on a clock. A berry left out both weathers (durability) and rots (spoilage);
   * a plank only weathers. Rate/pool default by category and can be overridden per item; a rate
   * of 0 means weather-immune.
   */
  stepItemDeterioration(gameState: GameState, elapsedTicks = 1): GameState {
    const dropped = gameState.droppedItems;
    if (!dropped || dropped.length === 0) return gameState;

    // §G: a roof shelters the tile — loose items under it take no weather damage.
    const roofed = new Set<string>();
    for (const b of gameState.buildings ?? []) {
      if (b.status !== 'complete') continue;
      const def = BUILDING_DEFS_FOR_ITEMS.find((x) => x.id === b.type);
      if ((def?.effects as Record<string, number> | undefined)?.['roof'])
        roofed.add(`${b.x},${b.y}`);
    }

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
        next.push(di); // weather-immune
        continue;
      }
      const max = def.maxDurability ?? DEFAULT_MAX_DURABILITY;
      const left = (di.durability ?? max) - rate * DETERIORATION_GLOBAL_SCALE * elapsedTicks;
      changed = true;
      if (left <= 0) {
        // destroyed by the elements — the stack is removed
        continue;
      }
      next.push({ ...di, durability: left });
    }

    return changed ? { ...gameState, droppedItems: next } : gameState;
  }

  /**
   * Per-tick durability lost to weather when exposed. Uses the item's explicit `deteriorationRate`
   * if set, else a sensible default by category so EVERY item weathers (stone barely; organics
   * fast). Return 0 to make an item weather-immune.
   */
  private deteriorationRateFor(def: Item): number {
    if (def.deteriorationRate !== undefined) return def.deteriorationRate;
    return DETERIORATION_RATE_BY_CATEGORY[def.category] ?? DEFAULT_DETERIORATION_RATE;
  }

  /**
   * Passive drying, run every tick over loose/stored stacks. Two cures share the pass:
   *
   * §1 wood seasoning — a stack of green_firewood lying within 2 tiles (but NOT directly adjacent) of
   * a lit fire accrues drying time and after WOOD_DRYING_SECONDS becomes dry_firewood (the best fuel).
   *
   * Hay-making — plant_fiber (cut grass) cures into hay where it is warm AND dry: it accrues only when
   * the tile's effective temperature is above HAY_DRY_TEMP_FLOOR and its wetness is below the wet
   * threshold, scaled by warmth up to HAY_DRY_TEMP_REF. A wet tile (rain / near water / bog) instead
   * decays the progress (rain ruins drying hay). A hay rack (effects.dryingBonus) multiplies the rate;
   * a nearby fire raises the tile's temperature (folded in by thermalAt) so it stacks with the rack.
   */
  /** Drying seconds before a stack cures, for the UI dryness meter (null = doesn't dry). */
  dryingTargetSeconds(resourceId: string): number | null {
    if (resourceId === 'green_firewood') return WOOD_DRYING_SECONDS;
    if (resourceId === 'plant_fiber') return HAY_DRYING_SECONDS;
    return null;
  }

  /** Live drying readout for one stack (mirrors stepDrying via the shared fiberDryRate / fire-ring
   *  rules). Uses computeThermalAt so the HUD on the main thread samples fire warmth correctly. */
  dryingStatus(d: DroppedItem, gameState: GameState): DryingStatus | null {
    const target = this.dryingTargetSeconds(d.resourceId);
    if (target === null) return null;
    const progress = d.drying ?? 0;

    if (d.resourceId === 'green_firewood') {
      // Seasons only inside the lit-fire ring (Chebyshev exactly 2), at a fixed rate.
      let nearest = Infinity;
      for (const b of gameState.buildings ?? []) {
        if (b.status === 'complete' && b.lit) nearest = Math.min(nearest, chebyshev(d.x, d.y, b.x, b.y));
      }
      const inRing = nearest === 2;
      return { target, progress, rate: inRing ? 1 : 0, reason: inRing ? undefined : 'no-fire', bonus: 1 };
    }

    // plant_fiber → hay: temperature/wetness cure, multiplied by a hay rack's dryingBonus.
    const tile = gameState.worldMap?.[d.y]?.[d.x];
    if (!tile) return { target, progress, rate: 0, reason: 'cold', bonus: 1 };
    const thermal = computeThermalAt(d.x, d.y, gameState.buildings, gameState.worldMap);
    const weatherTemp =
      weatherEffects(gameState.weather).tempDelta + diurnalTempDelta(gameState.turn, gameState.season);
    const temp = effectiveTemperature(seasonBakedTemp(tile.terrainType, gameState.season), weatherTemp, thermal);
    const wetness = tileWetness(tile.moisture ?? 0, gameState.weather, thermal);
    let bonus = 1;
    for (const b of gameState.buildings ?? []) {
      if (b.status !== 'complete' || b.x !== d.x || b.y !== d.y) continue;
      bonus = Math.max(bonus, buildingService.getBuildingById(b.type)?.effects?.dryingBonus ?? 0);
    }
    const rate = fiberDryRate(temp, wetness, bonus);
    return {
      target,
      progress,
      rate,
      reason: rate < 0 ? 'wet' : rate === 0 ? 'cold' : undefined,
      temp,
      wetness,
      bonus
    };
  }

  stepDrying(gameState: GameState): GameState {
    const drops = gameState.droppedItems;
    if (!drops || drops.length === 0) return gameState;

    // Cheap pre-scan: skip the whole (allocating) pass unless something dryable is on the ground.
    let hasDryable = false;
    for (const d of drops) {
      if (
        (d.resourceId === 'green_firewood' || d.resourceId === 'plant_fiber') &&
        (d.quantity ?? 0) > 0
      ) {
        hasDryable = true;
        break;
      }
    }
    if (!hasDryable) return gameState;

    // Lit fires (for §1 firewood seasoning ring) and hay-rack tiles (effects.dryingBonus multiplier).
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

    // Per-tick env scalars for hay-making (cheap, once — mirrors the needs sim).
    const worldMap = gameState.worldMap;
    const weather = gameState.weather;
    const weatherTemp =
      weatherEffects(weather).tempDelta + diurnalTempDelta(gameState.turn, gameState.season);

    let changed = false;
    const next = drops.map((d) => {
      if ((d.quantity ?? 0) <= 0) return d;

      if (d.resourceId === 'green_firewood') {
        if (fires.length === 0) return d;
        // Chebyshev distance to the nearest fire; seasoning ring is exactly 2 (not adjacent).
        let nearest = Infinity;
        for (const f of fires) nearest = Math.min(nearest, chebyshev(d.x, d.y, f.x, f.y));
        if (nearest !== 2) return d;
        const drying = (d.drying ?? 0) + SECONDS_PER_TICK;
        changed = true;
        if (drying >= WOOD_DRYING_SECONDS) return { ...d, resourceId: 'dry_firewood', drying: undefined };
        return { ...d, drying };
      }

      if (d.resourceId === 'plant_fiber') {
        const tile = worldMap?.[d.y]?.[d.x];
        if (!tile) return d; // no tile context (e.g. tests) — can't judge temp/wetness
        const thermal = thermalAt(d.x, d.y);
        const temp = effectiveTemperature(
          seasonBakedTemp(tile.terrainType, gameState.season),
          weatherTemp,
          thermal
        );
        const wet = tileWetness(tile.moisture ?? 0, weather, thermal);
        const have = d.drying ?? 0;
        const mult = dryRacks.get(d.y + ',' + d.x) ?? 1;
        const rate = fiberDryRate(temp, wet, mult);
        if (rate === 0) return d; // too cold to dry; just sits
        if (rate < 0 && have <= 0) return d; // wet, but nothing to lose
        const drying = Math.max(0, have + SECONDS_PER_TICK * rate);
        changed = true;
        if (rate > 0 && drying >= HAY_DRYING_SECONDS) return { ...d, resourceId: 'hay', drying: undefined };
        return { ...d, drying };
      }

      return d;
    });

    if (!changed) return gameState;
    return { ...gameState, droppedItems: next, stockpile: aggregateFromDrops(next) };
  }

  /**
   * §B tool work-wear. Each completed work action spends `durabilityLossPerAction` from the
   * colony's tool stock for that work category (tracked in gameState.toolWear). When the
   * accumulated wear reaches the tool's maxDurability, one tool breaks — consumed from the
   * stockpile — and the counter resets. Beginner stone tools are deliberately fragile
   * (stone_axe: 40/5 → ~8 fells per axe).
   */
  applyToolWear(workCategory: string, gameState: GameState): GameState {
    const stockpile = gameState.stockpile ?? {};
    // The tool in stock that serves this work category (e.g. stone_axe → woodcutting).
    const tool = ITEMS_DATABASE.find(
      (i) =>
        i.type === 'tool' &&
        (i.processingType?.includes(workCategory) || i.category === workCategory) &&
        (stockpile[i.id] ?? 0) > 0
    );
    if (!tool) return gameState; // bare hands — nothing to wear
    return this.wearToolById(tool.id, gameState);
  }

  /**
   * §B/§5: spend one action's wear on a specific tool/mold by id (tracked in gameState.toolWear);
   * when accumulated wear reaches its maxDurability, one unit breaks (consumed) and the counter
   * resets. Used for work-tool wear and per-cast casting-mold wear.
   */
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

// Export singleton instance
export const itemService = new ItemServiceImpl();
