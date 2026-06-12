import type { Item, GameState, DynamicIngredientSlot, DroppedItem, Recipe } from '../core/types';
import { consumeFromStockpiles, addToStockpileZone, aggregateFromDrops } from '../core/GameState';
import { recipeService } from './RecipeService';
import itemsData from '../database/items.jsonc';
import buildingsData from '../database/buildings.jsonc';
import { SECONDS_PER_TICK } from '../core/time';
import { rng } from '../core/rng';

const ITEMS_DATABASE = itemsData as unknown as Item[];
// Building defs are needed for tile-aware decay (storage multipliers, roofs).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const BUILDING_DEFS_FOR_ITEMS = buildingsData as unknown as import('../core/types').Building[];

// §B Durability defaults — every item weathers when left exposed (loose, unsheltered).
// Explicit `deteriorationRate`/`maxDurability` on an item override these. Rate 0 = weather-immune.
const DEFAULT_MAX_DURABILITY = 100;
const DEFAULT_DETERIORATION_RATE = 0.02; // per tick
// §1 wood seasoning: sim-seconds within the drying ring before green firewood turns dry.
const WOOD_DRYING_SECONDS = 1800;
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

/**
 * ItemService - Clean interface for item queries and operations
 * Separates business logic from data definitions
 */
export interface ItemService {
  // Query Methods
  getItemById(id: string): Item | undefined;
  getItemsByType(type: string): Item[];
  getItemsByCategory(category: string): Item[];
  getCraftableItems(gameState: GameState, pawnId?: string): Item[];
  getItemsByWorkType(workType: string): Item[];

  // Validation Methods
  canCraftItem(itemId: string, gameState: GameState, pawnId?: string): boolean;
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
  calculateCraftingTime(itemId: string, gameState: GameState, pawnId?: string): number;
  calculateCraftingCost(itemId: string): Record<string, number>;
  calculateItemEffects(itemId: string): Record<string, number>;

  // Display Methods
  getItemIcon(itemId: string): string;
  getItemColor(itemId: string): string;

  // Inventory Methods
  getAvailableQuantity(itemId: string, gameState: GameState): number;
  consumeItems(itemIds: Record<string, number>, gameState: GameState): GameState;
  addItems(itemIds: Record<string, number>, gameState: GameState): GameState;
  processButchery(carcassItem: Item, gameState: GameState): GameState;

  // Decay
  stepItemDecay(gameState: GameState): GameState;
  stepItemDeterioration(gameState: GameState): GameState;
  /** §B tool work-wear: spend durability on the colony's tool for `workCategory`; break at 0. */
  applyToolWear(workCategory: string, gameState: GameState): GameState;
  /** §B/§5: wear a specific tool/mold by id; it breaks (consumed) at maxDurability. */
  wearToolById(toolId: string, gameState: GameState): GameState;
  /** §5: the casting mold a recipe's station consumes wear on, or null. */
  moldForRecipeStation(station: string | null | undefined): string | null;
  /** §1 wood seasoning: green firewood within 2 tiles (not adjacent) of a lit fire dries over time. */
  stepWoodDrying(gameState: GameState): GameState;
}

/**
 * ItemService Implementation
 */
export class ItemServiceImpl implements ItemService {
  getItemById(id: string): Item | undefined {
    return ITEMS_DATABASE.find((item) => item.id === id);
  }

  getItemsByType(type: string): Item[] {
    return ITEMS_DATABASE.filter((item) => item.type === type);
  }

  getItemsByCategory(category: string): Item[] {
    return ITEMS_DATABASE.filter((item) => item.category === category);
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
    const item = this.getItemById(itemId);
    if (!item) return false;

    // Special check for butchery: carcass must have intactness > 0
    if (item.isCarcass && item.yields) {
      const intactness = gameState.carcassIntactness ?? {};
      const currentIntactness = intactness[itemId] ?? 100;
      if (currentIntactness <= 0) return false;
      // Check if we have the carcass in stockpile
      if ((gameState.stockpile?.[itemId] ?? 0) <= 0) return false;
      // Check if we have a butcher spot
      const hasButcherStation = (gameState.buildings ?? []).some(
        (b) => (b.type === 'butcher_spot' || b.type === 'dressing_stone') && b.status === 'complete'
      );
      return hasButcherStation;
    }

    // Recipe registry: all craftability flows from the producing recipe.
    const recipe = recipeService.getRecipeForItem(itemId);
    if (!recipe) return false;

    // Check materials
    if (!this.hasRequiredMaterials(itemId, gameState)) return false;

    // Check tools
    if (!this.hasRequiredTools(itemId, gameState)) return false;

    // Check building
    if (!this.hasRequiredBuilding(itemId, gameState)) return false;

    // Check research
    if (recipe.researchRequired && !gameState.completedResearch.includes(recipe.researchRequired)) {
      return false;
    }

    // Check population
    if (recipe.populationRequired && gameState.pawns.length < recipe.populationRequired) {
      return false;
    }

    // Phase 6: stew items require a clay_cooking_pot in the colony
    if (recipe.station === 'campfire' && item.id === 'stew') {
      const hasCookingPot = ((gameState.stockpile ?? {})['clay_cooking_pot'] ?? 0) > 0;
      if (!hasCookingPot) return false;
    }

    // §5 casting requires a mold: a station with `moldRequired` (forge/bloomery) needs that mold
    // in stock to cast — the clay→kiln→mold→casting gate. The mold is reusable but wears (§B).
    if (recipe.station) {
      const stationDef = BUILDING_DEFS_FOR_ITEMS.find((d) => d.id === recipe.station);
      if (stationDef?.moldRequired && (gameState.stockpile?.[stationDef.moldRequired] ?? 0) <= 0) {
        return false;
      }
    }

    return true;
  }

  /** §5: the mold a recipe consumes wear on (from its station's `moldRequired`), or null. */
  moldForRecipeStation(station: string | null | undefined): string | null {
    if (!station) return null;
    return BUILDING_DEFS_FOR_ITEMS.find((d) => d.id === station)?.moldRequired ?? null;
  }

  hasRequiredMaterials(itemId: string, gameState: GameState): boolean {
    if (!recipeService.getRecipeForItem(itemId)) return true;
    return this.resolveActiveCost(itemId, gameState) !== null;
  }

  autoSelectIngredients(itemId: string, gameState: GameState): Record<string, string> | null {
    const recipe = recipeService.getRecipeForItem(itemId);
    if (!recipe?.dynamicRecipe) return {};
    const selected: Record<string, string> = {};
    for (const [slotKey, slot] of Object.entries(recipe.dynamicRecipe)) {
      const candidates = ITEMS_DATABASE.filter(
        (i) =>
          i.category === slot.acceptsCategory &&
          this.getAvailableQuantity(i.id, gameState) >= slot.quantity
      );
      if (!candidates.length) return null;
      // Pick the first available (lowest index = most common)
      selected[slotKey] = candidates[0].id;
    }
    return selected;
  }

  resolveActiveCost(
    itemId: string,
    gameState: GameState,
    selectedIngredients?: Record<string, string>
  ): Record<string, number> | null {
    const recipe = recipeService.getRecipeForItem(itemId);
    if (!recipe) return null;
    const satisfies = (cost: Record<string, number>) =>
      Object.entries(cost).every(([id, qty]) => this.getAvailableQuantity(id, gameState) >= qty);

    // Resolve base crafting cost (empty inputs {} is valid — no base materials needed)
    let baseCost: Record<string, number> | null = satisfies(recipe.inputs) ? recipe.inputs : null;
    if (baseCost === null && recipe.inputAlternatives?.length) {
      baseCost = recipe.inputAlternatives.find(satisfies) ?? null;
    }
    if (baseCost === null) return null;

    // No dynamic recipe — return base cost (original behaviour)
    if (!recipe.dynamicRecipe) return baseCost;

    // Resolve dynamic ingredient slots
    const selected = selectedIngredients ?? this.autoSelectIngredients(itemId, gameState);
    if (!selected) return null;

    const dynamicCosts: Record<string, number> = {};
    for (const [slotKey, slot] of Object.entries(recipe.dynamicRecipe)) {
      const chosenId = selected[slotKey];
      if (!chosenId || this.getAvailableQuantity(chosenId, gameState) < slot.quantity) return null;
      dynamicCosts[chosenId] = slot.quantity;
    }

    return { ...baseCost, ...dynamicCosts };
  }

  hasRequiredTools(itemId: string, gameState: GameState): boolean {
    const tier = recipeService.getRecipeForItem(itemId)?.toolTierRequired;
    if (!tier) return true;
    return gameState.currentToolLevel >= tier;
  }

  hasRequiredBuilding(itemId: string, gameState: GameState): boolean {
    const recipe = recipeService.getRecipeForItem(itemId);
    const item: { workshopType?: string | null; buildingRequired?: string | null } = {
      workshopType: recipe?.station ?? null,
      buildingRequired: recipe?.buildingRequired ?? null
    };

    // All crafting requires at minimum a craft_spot — pawns need a designated safe location
    if (!item?.workshopType) {
      const hasCraftSpot = (gameState.buildings ?? []).some(
        (b) => b.type === 'craft_spot' && b.status === 'complete'
      );
      if (!hasCraftSpot) return false;
    }

    // Check Phase 5d workshopType (e.g. 'campfire', 'makers_bench', 'craft_spot')
    if (item?.workshopType) {
      const workshopOk = (gameState.buildings ?? []).some(
        (b) => b.type === item.workshopType && b.status === 'complete'
      );
      if (!workshopOk) return false;
    }

    // Check legacy buildingRequired field
    if (!item?.buildingRequired) return true;

    // Phase 5d fix: check buildings[] instead of deprecated buildingCounts
    return (gameState.buildings ?? []).some(
      (b) => b.type === item.buildingRequired && b.status === 'complete'
    );
  }

  calculateCraftingTime(itemId: string, gameState: GameState, pawnId?: string): number {
    const recipe = recipeService.getRecipeForItem(itemId);
    if (!recipe?.workAmount) return 0;

    let time = recipe.workAmount;

    // Apply pawn-specific bonuses if provided
    if (pawnId) {
      const pawn = gameState.pawns.find((p) => p.id === pawnId);
      if (pawn) {
        // Apply stat bonuses (dexterity affects crafting speed)
        const dexterityBonus = (pawn.stats.dexterity - 10) / 20;
        time *= 1 - Math.max(-0.5, Math.min(0.5, dexterityBonus));
      }
    }

    return Math.max(1, Math.round(time));
  }

  calculateCraftingCost(itemId: string): Record<string, number> {
    const recipe = recipeService.getRecipeForItem(itemId);
    if (recipe) return Object.keys(recipe.inputs).length ? recipe.inputs : (recipe.inputAlternatives?.[0] ?? {});
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
    return (gameState.stockpile ?? {})[itemId] ?? 0;
  }

  consumeItems(itemIds: Record<string, number>, gameState: GameState): GameState {
    return consumeFromStockpiles(gameState, itemIds);
  }

  addItems(itemIds: Record<string, number>, gameState: GameState): GameState {
    // Route through addToStockpileZone so zone inventories and aggregate stay in sync.
    return addToStockpileZone(gameState, null, itemIds);
  }

  /**
   * Butchery: process a carcass into all its outputs at once (D10 — moved here from the
   * engine so the engine stays a coordinator). Output quantities scale by current carcass
   * intactness × tool (bone_cleaver) × building (dressing_stone) bonuses. Returns the new
   * state (immutable); a no-op state when the carcass can't be processed.
   */
  processButchery(carcassItem: Item, gameState: GameState): GameState {
    if (!carcassItem.isCarcass || !carcassItem.yields) return gameState;

    const intactness = gameState.carcassIntactness ?? {};
    const currentIntactness = intactness[carcassItem.id] ?? 100;
    if (currentIntactness <= 0) return gameState;

    if (!this.canCraftItem(carcassItem.id, gameState)) return gameState;

    const intactnessFraction = currentIntactness / 100;
    const hasBoneCleaver = (gameState.stockpile?.['bone_cleaver'] ?? 0) > 0;
    const hasDressingStone = (gameState.buildings ?? []).some(
      (b) => b.type === 'dressing_stone' && b.status === 'complete'
    );
    const yieldMult = intactnessFraction * (hasBoneCleaver ? 1.25 : 1.0) * (hasDressingStone ? 1.25 : 1.0);

    const outputs: Record<string, number> = {};
    for (const output of carcassItem.yields) {
      const baseQty = Math.floor(rng.random() * (output.max - output.min + 1)) + output.min;
      const scaledQty = Math.max(1, Math.round(baseQty * yieldMult));
      outputs[output.item] = (outputs[output.item] ?? 0) + scaledQty;
    }

    const newIntactnessMap = { ...intactness };
    delete newIntactnessMap[carcassItem.id];

    let state = gameState;
    const carcassQty = state.stockpile[carcassItem.id] ?? 0;
    if (carcassQty > 0) state = this.consumeItems({ [carcassItem.id]: carcassQty }, state);
    state = this.addItems(outputs, state);
    return { ...state, carcassIntactness: newIntactnessMap };
  }

  /**
   * §C organic spoilage — per-stack, tile-aware (Stage 4). Every stack (stored or loose) of a
   * perishable item accrues a spoilage clock; at the def's decaySeconds one unit rots into
   * `decaysTo`. Storage SLOWS (never halts) the clock: a stored stack on a tile with a storage
   * building uses that building's `storageDecayMultiplier` (clay cellar 0.3 …). A building with
   * `requiresEnclosure` grants its full multiplier only when its tile is roofed; unenclosed it
   * works at half effect. Loose stacks on open ground rot at full speed (1.0).
   */
  stepItemDecay(gameState: GameState): GameState {
    const drops = gameState.droppedItems;
    if (!drops || drops.length === 0) return gameState;

    // Per-tile storage multiplier from complete storage buildings (and roof presence).
    const storageMult = new Map<string, number>();
    const roofed = new Set<string>();
    const enclosureNeeded = new Set<string>();
    for (const b of gameState.buildings ?? []) {
      if (b.status !== 'complete') continue;
      const key = `${b.x},${b.y}`;
      const def = BUILDING_DEFS_FOR_ITEMS.find((d) => d.id === b.type);
      if (!def) continue;
      if ((def.effects as Record<string, number> | undefined)?.['roof']) roofed.add(key);
      if (def.storageDecayMultiplier !== undefined) {
        const cur = storageMult.get(key);
        const entry = { mult: def.storageDecayMultiplier, requiresEnclosure: def.requiresEnclosure };
        // keep the best (lowest) multiplier on the tile
        if (cur === undefined || entry.mult < cur) {
          storageMult.set(key, entry.mult);
          if (entry.requiresEnclosure) enclosureNeeded.add(key);
          else enclosureNeeded.delete(key);
        }
      }
    }

    let changed = false;
    const next: DroppedItem[] = [];
    const rotted: { resourceId: string; x: number; y: number; stored?: boolean; qty: number }[] = [];

    for (const d of drops) {
      const def = this.getItemById(d.resourceId);
      if (!def?.decaySeconds || (d.quantity ?? 0) <= 0) {
        next.push(d);
        continue;
      }
      const key = `${d.x},${d.y}`;
      let mult = 1.0;
      if (d.stored && storageMult.has(key)) {
        mult = storageMult.get(key)!;
        // requiresEnclosure: full benefit only when the tile is roofed; else half effect.
        if (enclosureNeeded.has(key) && !roofed.has(key)) {
          mult = Math.min(1, mult * 2);
        }
      }
      let acc = (d.decayAcc ?? 0) + SECONDS_PER_TICK * mult;
      let qty = d.quantity;
      while (acc >= def.decaySeconds && qty > 0) {
        acc -= def.decaySeconds;
        qty -= 1;
        if (def.decaysTo) {
          rotted.push({ resourceId: def.decaysTo, x: d.x, y: d.y, stored: d.stored, qty: 1 });
        }
      }
      changed = true;
      if (qty > 0) next.push({ ...d, quantity: qty, decayAcc: acc });
      // qty 0 → stack fully rotted away; drop it
    }

    if (!changed) return gameState;

    // Merge rotted output into stacks at the same tile.
    for (const r of rotted) {
      const idx = next.findIndex(
        (d) => d.resourceId === r.resourceId && d.x === r.x && d.y === r.y && !!d.stored === !!r.stored
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
  stepItemDeterioration(gameState: GameState): GameState {
    const dropped = gameState.droppedItems;
    if (!dropped || dropped.length === 0) return gameState;

    // §G: a roof shelters the tile — loose items under it take no weather damage.
    const roofed = new Set<string>();
    for (const b of gameState.buildings ?? []) {
      if (b.status !== 'complete') continue;
      const def = BUILDING_DEFS_FOR_ITEMS.find((x) => x.id === b.type);
      if ((def?.effects as Record<string, number> | undefined)?.['roof']) roofed.add(`${b.x},${b.y}`);
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
      const left = (di.durability ?? max) - rate;
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
   * §1 wood seasoning. A stack of green_firewood (or peat, conceptually) stored/lying within
   * 2 tiles — but NOT directly adjacent — of a lit fire (campfire/hearth) accrues drying time;
   * after WOOD_DRYING_SECONDS it converts to dry_firewood (the best wood fuel). Direct adjacency
   * doesn't season (and later carries fire-spread risk — Living World).
   */
  stepWoodDrying(gameState: GameState): GameState {
    const drops = gameState.droppedItems;
    if (!drops || drops.length === 0) return gameState;

    // Lit fires: complete buildings that require lighting and are currently lit.
    const fires: { x: number; y: number }[] = [];
    for (const b of gameState.buildings ?? []) {
      if (b.status === 'complete' && b.lit) fires.push({ x: b.x, y: b.y });
    }
    if (fires.length === 0) return gameState;

    let changed = false;
    const next = drops.map((d) => {
      if (d.resourceId !== 'green_firewood' || (d.quantity ?? 0) <= 0) return d;
      // Chebyshev distance to the nearest fire; seasoning ring is exactly 2 (not adjacent).
      let nearest = Infinity;
      for (const f of fires) {
        nearest = Math.min(nearest, Math.max(Math.abs(d.x - f.x), Math.abs(d.y - f.y)));
      }
      if (nearest !== 2) return d;
      const drying = (d.drying ?? 0) + SECONDS_PER_TICK;
      changed = true;
      if (drying >= WOOD_DRYING_SECONDS) {
        return { ...d, resourceId: 'dry_firewood', drying: undefined };
      }
      return { ...d, drying };
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
