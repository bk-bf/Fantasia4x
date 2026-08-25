import { itemService } from '../services/ItemService';
import { buildingService } from '../services/BuildingService';

class GameCoordinator {
  getItemById(itemId: string): any {
    return itemService.getItemById(itemId);
  }

  getBuildingById(buildingId: string): any {
    return buildingService.getBuildingById(buildingId);
  }
}

export const gameCoordinator = new GameCoordinator();
