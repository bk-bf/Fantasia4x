import { itemService } from '../services/ItemService';
import { buildingService } from '../services/BuildingService';

/**
 * UI-facing coordination facade (P-2b) — pure cross-service LOOKUPS only.
 *
 * Components read item/building definitions here instead of piling UI passthroughs onto the turn
 * coordinator (`GameEngineImpl`). State MUTATIONS no longer live here: under the sim worker (ADR-021)
 * the worker owns canonical state, so every player/dev action is a serializable command dispatched
 * via `gameState.command({ type, payload })` (logic in `sim/commands.ts`). `craftItem` moved there.
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
}

/** Singleton — import this, never instantiate `GameCoordinator` directly. */
export const gameCoordinator = new GameCoordinator();
