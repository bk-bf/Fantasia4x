import { itemService } from '../services/ItemService';
import { buildingService } from '../services/BuildingService';

/**
 * UI-facing cross-service lookup facade — read-only. State mutations are dispatched as
 * commands via `gameState.command(...)` (sim/commands.ts), never through this class.
 */
class GameCoordinator {
  getItemById(itemId: string): any {
    return itemService.getItemById(itemId);
  }

  getBuildingById(buildingId: string): any {
    return buildingService.getBuildingById(buildingId);
  }
}

export const gameCoordinator = new GameCoordinator();
