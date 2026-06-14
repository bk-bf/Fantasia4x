// Refuel rules — when a fuel-burning building wants topping up and whether the colony stockpile can
// supply it. Extracted from JobService (P-4): fuel is a building concern, but BuildingService is at
// the god-module limit, so these live as focused free functions. JobService still owns refuel job
// generation/completion and calls in here for the rules.
import type { GameState, PlacedBuilding, Item } from '../core/types';
import itemsData from '../database/items.jsonc';
import { buildingService } from './BuildingService';

const ITEMS_DB = itemsData as unknown as Item[];

const DEFAULT_REFUEL_THRESHOLD_RATIO = 0.3;
const DEFAULT_REFUEL_REQUIRED_FUEL_TYPES = 2;
const DEFAULT_REFUEL_TINDER_ITEM_ID = 'plant_fiber';
const DEFAULT_REFUEL_TINDER_AMOUNT = 2;

/** Fuel requirements resolved for a building type. */
export interface RefuelRequirements {
  requiredFuelTypes: number;
  tinderItemId: string;
  tinderAmount: number;
}

/** Fuel fraction (0–1) below which a building wants refuelling (per-building override or default). */
export function getRefuelThresholdRatio(building: PlacedBuilding): number {
  const rawPct = building.fuelSettings?.refuelThresholdPct;
  if (rawPct === undefined || Number.isNaN(rawPct)) return DEFAULT_REFUEL_THRESHOLD_RATIO;
  const clampedPct = Math.max(0, Math.min(100, rawPct));
  return clampedPct / 100;
}

/** Resolve a building type's fuel requirements (required distinct fuel types + tinder), with defaults. */
export function getRefuelRequirements(buildingType: string): RefuelRequirements {
  const req = buildingService.getBuildingById(buildingType)?.fuelRequirements;
  return {
    requiredFuelTypes: Math.max(1, req?.requiredFuelTypes ?? DEFAULT_REFUEL_REQUIRED_FUEL_TYPES),
    tinderItemId: req?.tinderItemId ?? DEFAULT_REFUEL_TINDER_ITEM_ID,
    tinderAmount: Math.max(0, req?.tinderAmount ?? DEFAULT_REFUEL_TINDER_AMOUNT)
  };
}

/** Whether the colony stockpile can satisfy a refuel of `neededFuel` units for this building. */
export function canSatisfyRefuelRequirements(
  gs: GameState,
  building: PlacedBuilding,
  neededFuel: number
): boolean {
  const stockpile = gs.stockpile ?? {};
  const requirements = getRefuelRequirements(building.type);
  const tinderStock = stockpile[requirements.tinderItemId] ?? 0;
  if (tinderStock < requirements.tinderAmount) return false;

  const allowedFuelIds = new Set(building.fuelSettings?.allowedFuelItemIds ?? []);
  const hasFuelFilter = allowedFuelIds.size > 0;
  let totalFuel = 0;
  const availableFuelTypes = new Set<string>();

  for (const item of ITEMS_DB) {
    if ((item.fuelValue ?? 0) <= 0) continue;
    if (hasFuelFilter && !allowedFuelIds.has(item.id)) continue;
    let available = stockpile[item.id] ?? 0;
    if (item.id === requirements.tinderItemId) {
      available -= requirements.tinderAmount;
    }
    if (available <= 0) continue;
    totalFuel += available * item.fuelValue!;
    availableFuelTypes.add(item.id);
  }

  if (totalFuel < neededFuel) return false;

  if (requirements.requiredFuelTypes <= 1) {
    return availableFuelTypes.size > 0;
  }

  const nonTinderTypeCount = Array.from(availableFuelTypes).filter(
    (id) => id !== requirements.tinderItemId
  ).length;

  return nonTinderTypeCount >= Math.max(1, requirements.requiredFuelTypes - 1);
}

/** Whether an actually-consumed fuel set meets the building's required fuel-type diversity + tinder. */
export function hasRequiredFuelTypesForRefuel(
  consumed: Record<string, number>,
  requirements: RefuelRequirements
): boolean {
  if ((consumed[requirements.tinderItemId] ?? 0) < requirements.tinderAmount) return false;

  const consumedFuelTypes = Object.keys(consumed).filter((id) => (consumed[id] ?? 0) > 0);
  if (requirements.requiredFuelTypes <= 1) return consumedFuelTypes.length > 0;

  const nonTinderTypeCount = consumedFuelTypes.filter(
    (id) => id !== requirements.tinderItemId
  ).length;

  return nonTinderTypeCount >= Math.max(1, requirements.requiredFuelTypes - 1);
}
