import type { GameState, PlacedBuilding, Item, FuelSettings } from '../core/types';
import itemsData from '../database/items/items.json';
import { buildingService } from './BuildingService';

const ITEMS_DB = itemsData as unknown as Item[];

const DEFAULT_EXCLUDED_FUEL_IDS = new Set(['cordage', 'rope', 'tanning_brine', 'beast_brine']);

export function isDefaultFuel(item: Item): boolean {
  if ((item.fuelValue ?? 0) <= 0) return false;
  if (item.category === 'magic_wood') return false;
  if (item.id.endsWith('_plank')) return false;
  return !DEFAULT_EXCLUDED_FUEL_IDS.has(item.id);
}

let _defaultAllowedFuelIds: string[] | null = null;
export function getDefaultAllowedFuelIds(): string[] {
  if (!_defaultAllowedFuelIds)
    _defaultAllowedFuelIds = ITEMS_DB.filter(isDefaultFuel).map((item) => item.id);
  return _defaultAllowedFuelIds;
}

export function resolveAllowedFuelIds(settings?: FuelSettings): Set<string> {
  return new Set(settings?.allowedFuelItemIds ?? getDefaultAllowedFuelIds());
}

const DEFAULT_REFUEL_THRESHOLD_RATIO = 0.3;
const DEFAULT_REFUEL_TINDER_ITEM_ID = 'plant_fiber';
const DEFAULT_REFUEL_TINDER_AMOUNT = 2;

export interface RefuelRequirements {
  tinderItemId: string;
  tinderAmount: number;
}

export function getRefuelThresholdRatio(building: PlacedBuilding): number {
  const rawPct = building.fuelSettings?.refuelThresholdPct;
  if (rawPct === undefined || Number.isNaN(rawPct)) return DEFAULT_REFUEL_THRESHOLD_RATIO;
  const clampedPct = Math.max(0, Math.min(100, rawPct));
  return clampedPct / 100;
}

export function getRefuelRequirements(buildingType: string): RefuelRequirements {
  const req = buildingService.getBuildingById(buildingType)?.fuelRequirements;
  return {
    tinderItemId: req?.tinderItemId ?? DEFAULT_REFUEL_TINDER_ITEM_ID,
    tinderAmount: Math.max(0, req?.tinderAmount ?? DEFAULT_REFUEL_TINDER_AMOUNT)
  };
}

export interface RefuelPlan {
  consumed: Record<string, number>;
  newFuel: number;
  fireHeat: number;
  burnFactor: number;
}

export function planRefuel(gs: GameState, building: PlacedBuilding): RefuelPlan | null {
  const def = buildingService.getBuildingById(building.type);
  const maxFuel = def?.maxFuel ?? 60;
  const startFuel = building.fuel ?? 0;
  if (maxFuel - startFuel <= 0) return null;

  const requirements = getRefuelRequirements(building.type);
  const stockpile = gs.stockpile ?? {};
  if ((stockpile[requirements.tinderItemId] ?? 0) < requirements.tinderAmount) return null;

  const consumed: Record<string, number> = {};
  if (requirements.tinderAmount > 0)
    consumed[requirements.tinderItemId] = requirements.tinderAmount;

  const allowedFuelIds = resolveAllowedFuelIds(building.fuelSettings);

  let currentFuel = startFuel;
  let energy = 0;
  let heatEnergy = 0;
  let burnEnergy = 0;
  for (const item of ITEMS_DB) {
    const fuelValue = item.fuelValue ?? 0;
    if (fuelValue <= 0) continue;
    if (item.id === requirements.tinderItemId) continue;
    if (!allowedFuelIds.has(item.id)) continue;
    while (currentFuel < maxFuel) {
      const available = (stockpile[item.id] ?? 0) - (consumed[item.id] ?? 0);
      if (available <= 0) break;
      consumed[item.id] = (consumed[item.id] ?? 0) + 1;
      const added = Math.min(fuelValue, maxFuel - currentFuel);
      currentFuel += added;
      energy += added;
      heatEnergy += added * (item.fuelHeat ?? 1);
      burnEnergy += added * (item.burnDuration ?? 1);
    }
  }

  if (currentFuel === startFuel) return null;
  return {
    consumed,
    newFuel: currentFuel,
    fireHeat: energy > 0 ? heatEnergy / energy : 1,
    burnFactor: energy > 0 ? Math.max(1, burnEnergy / energy) : 1
  };
}
