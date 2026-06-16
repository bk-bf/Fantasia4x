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

/** The concrete plan for one refuel: exactly which items to consume and the resulting fuel level. */
export interface RefuelPlan {
  consumed: Record<string, number>;
  newFuel: number;
}

/**
 * Plan a refuel from the colony stockpile, or `null` if one can't be performed right now.
 *
 * This is the SINGLE SOURCE OF TRUTH for refuelling: both `generate` (to decide whether to queue a
 * refuel job) and `complete` (to actually apply it) call this. Previously `generate` used a separate
 * "can satisfy?" check that ignored the station's `minFuelHeat` gate and the diversity the consume
 * step actually achieves — so a high-heat station (e.g. bloomery, minFuelHeat 4) with only low-heat
 * fuel (green wood) in the stockpile would queue a job whose `complete` consumed nothing, get the job
 * removed, then re-queued next reconcile → the pawn looped at the fire forever working with no result.
 * Sharing one plan makes that impossible: if `generate` queues it, `complete` will add fuel.
 *
 * Mirrors the old greedy fill: reserve tinder, then fill from each eligible fuel item (passes the
 * `minFuelHeat` gate + the per-building fuel filter) in DB order until the tank is full or fuel runs
 * out. Returns null when there isn't enough tinder, no eligible fuel adds anything, or the consumed
 * set doesn't meet the building's required fuel-type diversity.
 */
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

  const minHeat = def?.minFuelHeat ?? 0;
  const allowedFuelIds = new Set(building.fuelSettings?.allowedFuelItemIds ?? []);
  const hasFuelFilter = allowedFuelIds.size > 0;

  let currentFuel = startFuel;
  for (const item of ITEMS_DB) {
    if ((item.fuelValue ?? 0) <= 0) continue;
    if ((item.fuelHeat ?? 1) < minHeat) continue; // §2 heat gate — same as the consume step
    if (hasFuelFilter && !allowedFuelIds.has(item.id)) continue;
    while (currentFuel < maxFuel) {
      const available = (stockpile[item.id] ?? 0) - (consumed[item.id] ?? 0);
      if (available <= 0) break;
      consumed[item.id] = (consumed[item.id] ?? 0) + 1;
      currentFuel = Math.min(currentFuel + item.fuelValue!, maxFuel);
    }
  }

  if (currentFuel === startFuel) return null; // no eligible fuel actually added anything
  if (!hasRequiredFuelTypesForRefuel(consumed, requirements)) return null;
  return { consumed, newFuel: currentFuel };
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
