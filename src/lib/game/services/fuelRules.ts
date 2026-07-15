// Refuel rules — when a fuel-burning building wants topping up and whether the colony stockpile can
// supply it. Extracted from JobService (P-4): fuel is a building concern, but BuildingService is at
// the god-module limit, so these live as focused free functions. JobService still owns refuel job
// generation/completion and calls in here for the rules.
import type { GameState, PlacedBuilding, Item, FuelSettings } from '../core/types';
import itemsData from '../database/items/items.jsonc';
import { buildingService } from './BuildingService';

const ITEMS_DB = itemsData as unknown as Item[];

// ── Default fuel selection ─────────────────────────────────────────────────────────────────────────
// Plenty of items are *technically* burnable (any positive `fuelValue`), but burning crafted/processed
// goods by default is a footgun — nobody wants their rope, milled planks, magic logs or tanning brine
// shovelled into a campfire. These are still selectable in the fuel panel as a manual/emergency choice;
// they're just excluded from the out-of-the-box allow-list. A building whose `fuelSettings` is untouched
// burns only this sensible default set (logs, firewood, peat, coal, kindling…).
const DEFAULT_EXCLUDED_FUEL_IDS = new Set(['cordage', 'rope', 'tanning_brine', 'beast_brine']);

/** Whether a fuel item is part of the sensible out-of-the-box burn list (excludes crafted/valuable fuels). */
export function isDefaultFuel(item: Item): boolean {
  if ((item.fuelValue ?? 0) <= 0) return false;
  if (item.category === 'magic_wood') return false; // magic logs — far too valuable to burn by default
  if (item.id.endsWith('_plank')) return false; // milled lumber is a build material, not kindling
  return !DEFAULT_EXCLUDED_FUEL_IDS.has(item.id); // cordage / rope / brine — crafted or processed
}

let _defaultAllowedFuelIds: string[] | null = null;
/** The default allow-list: every fuel item minus the crafted/valuable ones excluded above. */
export function getDefaultAllowedFuelIds(): string[] {
  if (!_defaultAllowedFuelIds)
    _defaultAllowedFuelIds = ITEMS_DB.filter(isDefaultFuel).map((item) => item.id);
  return _defaultAllowedFuelIds;
}

/**
 * Resolve the effective set of fuel item ids a building may burn. An explicit `allowedFuelItemIds`
 * (set by the fuel panel, or seeded from a building def like the tanning bucket) is honoured verbatim —
 * including an empty array, which means "burn nothing". Only when the player has never configured the
 * filter (`undefined`) do we fall back to the sensible default set.
 */
export function resolveAllowedFuelIds(settings?: FuelSettings): Set<string> {
  return new Set(settings?.allowedFuelItemIds ?? getDefaultAllowedFuelIds());
}

const DEFAULT_REFUEL_THRESHOLD_RATIO = 0.3;
const DEFAULT_REFUEL_TINDER_ITEM_ID = 'plant_fiber';
const DEFAULT_REFUEL_TINDER_AMOUNT = 2;

/** Fuel requirements resolved for a building type. A fire takes ANY single fuel — the only gate is
 *  a pinch of tinder to get it going (the old "≥N distinct fuel types" gate was removed: it blocked
 *  refuelling a hearth that had a stockpile of just firewood). Whether a STATION is hot enough to
 *  smelt is no longer a refuel filter — it's the tracked `fireHeat` vs the def's `minFuelHeat`,
 *  checked at production time (see GameEngineImpl.processPassiveProduction). */
export interface RefuelRequirements {
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

/** Resolve a building type's fuel requirements (just the tinder needed to light it), with defaults. */
export function getRefuelRequirements(buildingType: string): RefuelRequirements {
  const req = buildingService.getBuildingById(buildingType)?.fuelRequirements;
  return {
    tinderItemId: req?.tinderItemId ?? DEFAULT_REFUEL_TINDER_ITEM_ID,
    tinderAmount: Math.max(0, req?.tinderAmount ?? DEFAULT_REFUEL_TINDER_AMOUNT)
  };
}

/** The concrete plan for one refuel: which items to consume, the resulting fuel level, and the
 *  fire's new heat/longevity character derived from that fuel mix. */
export interface RefuelPlan {
  consumed: Record<string, number>;
  newFuel: number;
  /** Heat rating (fuelHeat units, ~1–5) of the loaded mix — energy-weighted. Drives smelt gating +
   *  warmth output. A hearth fed coke runs hotter than one fed green wood. */
  fireHeat: number;
  /** Burn-longevity multiplier (≥1, energy-weighted `burnDuration`): dense fuel burns slower, so the
   *  station drains `fuelConsumptionRate / burnFactor` per tick — fewer refuel trips for better fuel. */
  burnFactor: number;
}

/**
 * Plan a refuel from the colony stockpile, or `null` if one can't be performed right now.
 *
 * This is the SINGLE SOURCE OF TRUTH for refuelling: both `generate` (to decide whether to queue a
 * refuel job) and `complete` (to actually apply it) call this. Sharing one plan means a queued job
 * can never complete as a no-op — the historical bug where `generate`'s separate "can satisfy?"
 * check disagreed with what `complete` actually consumed, so a pawn looped at the fire forever with
 * no result. If `generate` queues it, `complete` will add fuel.
 *
 * Greedy fill: reserve tinder, then fill from each allowed fuel item (any fuel — there is no longer a
 * `minFuelHeat` refuel filter; a station too cold to smelt still LOADS the fuel, it just won't run)
 * in DB order until the tank is full or fuel runs out. From the consumed mix it derives the fire's
 * `fireHeat` (energy-weighted `fuelHeat`) and `burnFactor` (energy-weighted `burnDuration`). Returns
 * null only when there isn't enough tinder or no allowed fuel adds anything.
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

  const allowedFuelIds = resolveAllowedFuelIds(building.fuelSettings);

  let currentFuel = startFuel;
  // Energy-weighted accumulators for the loaded mix (weight = fuel units actually added).
  let energy = 0;
  let heatEnergy = 0;
  let burnEnergy = 0;
  for (const item of ITEMS_DB) {
    const fuelValue = item.fuelValue ?? 0;
    if (fuelValue <= 0) continue;
    if (item.id === requirements.tinderItemId) continue; // tinder starts the fire; it isn't the fuel bed
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

  if (currentFuel === startFuel) return null; // no allowed fuel actually added anything
  return {
    consumed,
    newFuel: currentFuel,
    fireHeat: energy > 0 ? heatEnergy / energy : 1,
    burnFactor: energy > 0 ? Math.max(1, burnEnergy / energy) : 1
  };
}
