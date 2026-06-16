// Refuel job handler (ADR-017). Queues a refuel job when a fuel-burning building drops below its
// threshold and the stockpile can fully top it up, and on completion consumes tinder + fuel (honoring
// per-building fuel filters and the station's heat gate) to refill the tank. Refuel *rules* live in
// services/fuelRules.ts. Extracted from JobService (P-4 handler split).
import type { GameState, Item, Job } from '../../core/types';
// Gated console shim — see core/log.ts. Silences per-tick log/debug/warn unless gameDebug(true).
import { gatedConsole as console } from '../../core/log';
import itemsData from '../../database/items.jsonc';
import { buildingService } from '../BuildingService';
import { consumeFromStockpiles } from '../../core/GameState';
import * as fuelRules from '../fuelRules';

const ITEMS_DATABASE = itemsData as unknown as Item[];

export function generate(jobs: Job[], gs: GameState): Job[] {
  // Remove refuel jobs whose building is gone, at max, or stockpile no longer
  // has enough fuel to fill to max (prevents partial top-ups).
  jobs = jobs.filter((j) => {
    if (j.type !== 'refuel') return true;
    const b = (gs.buildings ?? []).find((b) => b.id === j.buildingId);
    if (!b || b.status !== 'complete') return false;
    if (b.fuelSettings?.paused) return false;
    const maxFuel = buildingService.getBuildingById(b.type)?.maxFuel ?? 60;
    const fuelRatio = (b.fuel ?? 0) / Math.max(maxFuel, 1);
    if (fuelRatio >= fuelRules.getRefuelThresholdRatio(b)) return false;
    const needed = maxFuel - (b.fuel ?? 0);
    return needed > 0 && fuelRules.canSatisfyRefuelRequirements(gs, b, needed);
  });

  for (const b of gs.buildings ?? []) {
    if (b.status !== 'complete') continue;
    const bDef = buildingService.getBuildingById(b.type);
    if (!bDef?.maxFuel) continue;
    if (b.fuelSettings?.paused) continue;
    const fuelRatio = (b.fuel ?? 0) / Math.max(bDef.maxFuel, 1);
    if (fuelRatio >= fuelRules.getRefuelThresholdRatio(b)) continue;
    const needed = bDef.maxFuel - (b.fuel ?? 0);
    if (needed <= 0) continue;
    // Only queue refuel when stockpile can fully top up the tank.
    if (!fuelRules.canSatisfyRefuelRequirements(gs, b, needed)) continue;
    const exists = jobs.some((j) => j.type === 'refuel' && j.buildingId === b.id);
    if (!exists) {
      jobs.push({
        id: `refuel-${b.id}`,
        type: 'refuel',
        targetX: b.x,
        targetY: b.y,
        buildingId: b.id,
        workRequired: 5,
        workDone: 0,
        claimedBy: null
      });
    }
  }
  return jobs;
}

export function complete(job: Job, gs: GameState): GameState {
  if (!job.buildingId) return gs;
  const building = (gs.buildings ?? []).find((b) => b.id === job.buildingId);
  if (!building) return gs;
  const maxFuel = buildingService.getBuildingById(building.type)?.maxFuel ?? 60;
  const stockpile = gs.stockpile ?? {};
  const consumed: Record<string, number> = {};
  const allowedFuelIds = new Set(building.fuelSettings?.allowedFuelItemIds ?? []);
  const hasFuelFilter = allowedFuelIds.size > 0;
  const requirements = fuelRules.getRefuelRequirements(building.type);

  if ((stockpile[requirements.tinderItemId] ?? 0) < requirements.tinderAmount) return gs;
  if (requirements.tinderAmount > 0) {
    consumed[requirements.tinderItemId] = requirements.tinderAmount;
  }

  let currentFuel = building.fuel ?? 0;
  // §2 fuel-heat gate: a station only accepts fuel hot enough for it (minFuelHeat) — a
  // bloomery won't light on green wood; charcoal/coal are needed for smelting heat.
  const minHeat = buildingService.getBuildingById(building.type)?.minFuelHeat ?? 0;
  // Track which items to consume (read-only from aggregate; apply via consumeFromStockpiles)
  for (const item of ITEMS_DATABASE) {
    if ((item.fuelValue ?? 0) <= 0) continue;
    if ((item.fuelHeat ?? 1) < minHeat) continue;
    if (hasFuelFilter && !allowedFuelIds.has(item.id)) continue;
    while (currentFuel < maxFuel) {
      const available = (stockpile[item.id] ?? 0) - (consumed[item.id] ?? 0);
      if (available <= 0) break;
      consumed[item.id] = (consumed[item.id] ?? 0) + 1;
      currentFuel = Math.min(currentFuel + item.fuelValue!, maxFuel);
    }
  }
  if (currentFuel === (building.fuel ?? 0)) return gs; // nothing added
  if (!fuelRules.hasRequiredFuelTypesForRefuel(consumed, requirements)) return gs;
  const newBuildings = (gs.buildings ?? []).map((b) =>
    b.id === job.buildingId ? { ...b, fuel: currentFuel, lit: currentFuel > 0 } : b
  );
  console.log(`[JobService] Campfire refuelled to ${currentFuel}/${maxFuel}: ${job.buildingId}`);
  const afterConsume = consumeFromStockpiles(gs, consumed);
  return { ...afterConsume, buildings: newBuildings };
}
