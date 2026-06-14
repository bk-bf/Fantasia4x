import type { CraftingInProgress } from '../core/types';
import { reserveForOrder, releaseReservation } from '../core/GameState';
import { gameEngine } from './GameEngineImpl';
import { itemService } from '../services/ItemService';
import { buildingService } from '../services/BuildingService';
import { recipeService } from '../services/RecipeService';
import { gatedConsole } from '../core/log';

/**
 * UI-facing coordination facade (P-2b).
 *
 * Components issue commands and cross-service queries here instead of piling UI passthroughs onto
 * the turn coordinator (`GameEngineImpl`), which keeps that class focused on `processGameTurn` and
 * state ownership. Mutations route through the engine's single-writer command channel
 * (`applyCommand`, P-2); pure lookups delegate straight to the static service databases.
 *
 * This is where future Living-World UI coordination (issuing player intents that the next tick
 * acts on) should live, so the engine class does not grow back past the god-module threshold.
 */
class GameCoordinator {
  /** Item definition lookup (static DB; no game state). */
  getItemById(itemId: string): any {
    return itemService.getItemById(itemId);
  }

  /** Building definition lookup (static DB; no game state). */
  getBuildingById(buildingId: string): any {
    return buildingService.getBuildingById(buildingId);
  }

  /**
   * Queue a crafting order. ADR-016 reserve-and-fetch: materials are NOT consumed here — the
   * inputs are locked to this order, a workstation is chosen, and the order is queued. Pawns
   * then fetch the reserved inputs to the station and craft there (see JobService).
   */
  craftItem(
    itemId: string,
    quantity: number = 1,
    selectedIngredients?: Record<string, string>
  ): void {
    gatedConsole.log(`[Coordinator] Queue craft: ${quantity}x ${itemId}`);
    gameEngine.applyCommand((state) => {
      const item = itemService.getItemById(itemId);
      if (!item) return state;
      if (!itemService.canCraftItem(itemId, state)) return state;

      const resolved =
        selectedIngredients ?? itemService.autoSelectIngredients(itemId, state) ?? {};
      const activeCost = itemService.resolveActiveCost(item.id, state, resolved);
      if (!activeCost) return state;

      const recipe = recipeService.getRecipeForItem(item.id);
      // Inputs scale by quantity (one recipe run per queued unit).
      const inputs: Record<string, number> = {};
      for (const [id, q] of Object.entries(activeCost)) inputs[id] = q * quantity;

      const stationType = recipe?.station ?? null;
      // ADR-016 station tiers: craft at the best available workshop (highest tier that can do this
      // recipe). A higher-tier station (Crude Workbench, craftingBonus) crafts shared recipes faster.
      const station = buildingService.bestCraftStation(stationType ?? 'craft_spot', state);
      const stationBuildingId = station?.id;
      const craftBonus = station ? buildingService.craftingBonusOf(station.type) : 0;
      const workRequired = Math.max(
        1,
        Math.ceil(((recipe?.workAmount ?? 1) * quantity) / (1 + craftBonus))
      );

      // Reserve every input from available stock (does not delete it). If anything is short,
      // release what we reserved and abort — affordability was checked but stock can race.
      const orderId = crypto.randomUUID();
      let gs = state;
      let allReserved = true;
      for (const [id, q] of Object.entries(inputs)) {
        const res = reserveForOrder(gs, id, q, orderId);
        gs = res.state;
        if (res.reserved < q) {
          allReserved = false;
          break;
        }
      }
      if (!allReserved) return releaseReservation(gs, orderId);

      const order: CraftingInProgress = {
        id: orderId,
        item,
        quantity,
        workRequired,
        workDone: 0,
        inputs,
        stationType,
        stationBuildingId,
        startedAt: gs.turn,
        selectedIngredients: Object.keys(resolved).length > 0 ? resolved : undefined
      };

      return { ...gs, craftingQueue: [...(gs.craftingQueue ?? []), order] };
    }, true);
  }
}

/** Singleton — import this, never instantiate `GameCoordinator` directly. */
export const gameCoordinator = new GameCoordinator();
