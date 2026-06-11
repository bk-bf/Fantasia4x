import type { Item, GameState, DynamicIngredientSlot, DroppedItem } from '../core/types';
import { consumeFromStockpiles, addToStockpileZone } from '../core/GameState';
import itemsData from '../database/items.jsonc';
import { SECONDS_PER_TICK } from '../core/time';
import { rng } from '../core/rng';

const ITEMS_DATABASE = itemsData as unknown as Item[];

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
      // Must have crafting cost (primary, alternative, or dynamic recipe)
      if (!item.craftingCost && !item.craftingCostAlternatives?.length && !item.dynamicRecipe)
        return false;
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

    if (!item.craftingCost && !item.craftingCostAlternatives?.length && !item.dynamicRecipe)
      return false;

    // Check materials
    if (!this.hasRequiredMaterials(itemId, gameState)) return false;

    // Check tools
    if (!this.hasRequiredTools(itemId, gameState)) return false;

    // Check building
    if (!this.hasRequiredBuilding(itemId, gameState)) return false;

    // Check research
    if (item.researchRequired && !gameState.completedResearch.includes(item.researchRequired)) {
      return false;
    }

    // Check population
    if (item.populationRequired && gameState.pawns.length < item.populationRequired) {
      return false;
    }

    // Phase 6: stew items require a clay_cooking_pot in the colony
    if (item.workshopType === 'campfire' && item.id === 'stew') {
      const hasCookingPot = ((gameState.stockpile ?? {})['clay_cooking_pot'] ?? 0) > 0;
      if (!hasCookingPot) return false;
    }

    return true;
  }

  hasRequiredMaterials(itemId: string, gameState: GameState): boolean {
    const item = this.getItemById(itemId);
    if (!item?.craftingCost && !item?.craftingCostAlternatives?.length && !item?.dynamicRecipe)
      return true;
    return this.resolveActiveCost(itemId, gameState) !== null;
  }

  autoSelectIngredients(itemId: string, gameState: GameState): Record<string, string> | null {
    const item = this.getItemById(itemId);
    if (!item?.dynamicRecipe) return {};
    const selected: Record<string, string> = {};
    for (const [slotKey, slot] of Object.entries(item.dynamicRecipe)) {
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
    const item = this.getItemById(itemId);
    if (!item) return null;
    const satisfies = (cost: Record<string, number>) =>
      Object.entries(cost).every(([id, qty]) => this.getAvailableQuantity(id, gameState) >= qty);

    // Resolve base crafting cost
    let baseCost: Record<string, number> | null = null;
    if (item.craftingCost !== undefined) {
      // Empty craftingCost ({}) is valid — no base materials needed
      baseCost = satisfies(item.craftingCost) ? item.craftingCost : null;
    }
    if (baseCost === null && item.craftingCostAlternatives?.length) {
      baseCost = item.craftingCostAlternatives.find(satisfies) ?? null;
    }
    if (baseCost === null) return null;

    // No dynamic recipe — return base cost (original behaviour)
    if (!item.dynamicRecipe) return baseCost;

    // Resolve dynamic ingredient slots
    const selected = selectedIngredients ?? this.autoSelectIngredients(itemId, gameState);
    if (!selected) return null;

    const dynamicCosts: Record<string, number> = {};
    for (const [slotKey, slot] of Object.entries(item.dynamicRecipe)) {
      const chosenId = selected[slotKey];
      if (!chosenId || this.getAvailableQuantity(chosenId, gameState) < slot.quantity) return null;
      dynamicCosts[chosenId] = slot.quantity;
    }

    return { ...baseCost, ...dynamicCosts };
  }

  hasRequiredTools(itemId: string, gameState: GameState): boolean {
    const item = this.getItemById(itemId);
    if (!item?.toolTierRequired) return true;

    return gameState.currentToolLevel >= item.toolTierRequired;
  }

  hasRequiredBuilding(itemId: string, gameState: GameState): boolean {
    const item = this.getItemById(itemId);

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
    const item = this.getItemById(itemId);
    if (!item?.craftingTime) return 0;

    let time = item.craftingTime;

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
    const item = this.getItemById(itemId);
    return item?.craftingCost ?? item?.craftingCostAlternatives?.[0] ?? {};
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

  stepItemDecay(gameState: GameState): GameState {
    const stockpile = gameState.stockpile ?? {};
    const decayAcc: Record<string, number> = { ...(gameState.stockpileDecaySeconds ?? {}) };
    let state: GameState = gameState;

    for (const [itemId, qty] of Object.entries(stockpile)) {
      if ((qty as number) <= 0) continue;
      const def = this.getItemById(itemId);
      if (!def?.decaySeconds) continue;

      decayAcc[itemId] = (decayAcc[itemId] ?? 0) + SECONDS_PER_TICK;
      if (decayAcc[itemId] >= def.decaySeconds) {
        decayAcc[itemId] -= def.decaySeconds;
        if ((state.stockpile[itemId] ?? 0) > 0) {
          state = this.consumeItems({ [itemId]: 1 }, state);
          if (def.decaysTo) {
            state = this.addItems({ [def.decaysTo]: 1 }, state);
          }
        } else {
          delete decayAcc[itemId];
        }
      }
    }

    return { ...state, stockpileDecaySeconds: decayAcc };
  }

  /**
   * §B Durable-goods deterioration. Items left loose on the ground (DroppedItem with
   * `stored !== true`) accrue elemental wear at their def's `deteriorationRate`. At 100
   * the stack is ruined and removed. Items in the stockpile or on a stockpile tile
   * (`stored`) take no exposure damage — storage/enclosure halts it entirely (per spec §F).
   * Organic spoilage is handled separately by stepItemDecay; this is durables only.
   */
  stepItemDeterioration(gameState: GameState): GameState {
    const dropped = gameState.droppedItems;
    if (!dropped || dropped.length === 0) return gameState;

    let changed = false;
    const next: DroppedItem[] = [];
    for (const di of dropped) {
      if (di.stored) {
        next.push(di);
        continue;
      }
      const rate = this.getItemById(di.resourceId)?.deteriorationRate;
      if (!rate) {
        next.push(di);
        continue;
      }
      const wear = (di.deterioration ?? 0) + rate;
      changed = true;
      if (wear >= 100) {
        // ruined — the stack crumbles away (drop the DroppedItem)
        continue;
      }
      next.push({ ...di, deterioration: wear });
    }

    return changed ? { ...gameState, droppedItems: next } : gameState;
  }
}

// Export singleton instance
export const itemService = new ItemServiceImpl();
