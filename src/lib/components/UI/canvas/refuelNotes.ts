import { itemService } from '$lib/game/services/ItemService';
import { buildingService } from '$lib/game/services/BuildingService';
import {
  getRefuelRequirements,
  planRefuel,
  getRefuelThresholdRatio
} from '$lib/game/services/fuelRules';
import type { PlacedBuilding, GameState } from '$lib/game/core/types';

export function refuelNotes(
  building: PlacedBuilding,
  gameState: GameState | null
): { needs: string; warn: string | null } | null {
  const maxFuel = buildingService.getBuildingById(building.type)?.maxFuel;
  if (building.status !== 'complete' || building.deconstructQueued || maxFuel === undefined)
    return null;
  const req = getRefuelRequirements(building.type);
  const tinderName =
    itemService.getItemById(req.tinderItemId)?.name ?? req.tinderItemId.replace(/_/g, ' ');
  const needs = `needs: ${req.tinderAmount}× ${tinderName} + any fuel`;
  const wantsFuel = (building.fuel ?? 0) / Math.max(maxFuel, 1) < getRefuelThresholdRatio(building);
  let warn: string | null = null;
  if (gameState && wantsFuel && planRefuel(gameState, building) === null) {
    const tinderStock = (gameState.stockpile ?? {})[req.tinderItemId] ?? 0;
    warn =
      tinderStock < req.tinderAmount
        ? `⚠ won't refuel — need ${req.tinderAmount}× ${tinderName} (have ${tinderStock})`
        : `⚠ won't refuel — no fuel in stock`;
  }
  return { needs, warn };
}
