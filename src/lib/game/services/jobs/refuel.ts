// Refuel job handler (ADR-017). Queues a refuel job when a fuel-burning building drops below its
// threshold AND the stockpile can actually refuel it, and on completion consumes the planned tinder +
// fuel to refill the tank. The plan (which items, honoring per-building fuel filters + the station's
// heat gate) is computed once in services/fuelRules.ts (`planRefuel`) and shared by both halves so a
// queued job can never complete as a no-op. Extracted from JobService (P-4 handler split).
import type { GameState, Job } from '../../core/types';
// Gated console shim — see core/log.ts. Silences per-tick log/debug/warn unless gameDebug(true).
import { gatedConsole as console } from '../../core/log';
import { buildingService } from '../BuildingService';
import { consumeFromStockpiles } from '../../core/GameState';
import * as fuelRules from '../fuelRules';

export function generate(jobs: Job[], gs: GameState): Job[] {
  // Remove refuel jobs whose building is gone, paused, at threshold, or that the stockpile can no
  // longer actually refuel. `planRefuel` is the SAME logic `complete` runs, so a queued job can never
  // be a no-op — which is what made pawns loop at the fire forever working with no result (a high-heat
  // station with only low-heat fuel passed the old gate but consumed nothing on completion).
  jobs = jobs.filter((j) => {
    if (j.type !== 'refuel') return true;
    const b = (gs.buildings ?? []).find((b) => b.id === j.buildingId);
    if (!b || b.status !== 'complete') return false;
    if (b.fuelSettings?.paused) return false;
    const maxFuel = buildingService.getBuildingById(b.type)?.maxFuel ?? 60;
    const fuelRatio = (b.fuel ?? 0) / Math.max(maxFuel, 1);
    if (fuelRatio >= fuelRules.getRefuelThresholdRatio(b)) return false;
    return fuelRules.planRefuel(gs, b) !== null;
  });

  for (const b of gs.buildings ?? []) {
    if (b.status !== 'complete') continue;
    const bDef = buildingService.getBuildingById(b.type);
    if (!bDef?.maxFuel) continue;
    if (b.fuelSettings?.paused) continue;
    const fuelRatio = (b.fuel ?? 0) / Math.max(bDef.maxFuel, 1);
    if (fuelRatio >= fuelRules.getRefuelThresholdRatio(b)) continue;
    // Only queue when an actual refuel is possible (tinder + any allowed fuel in stock).
    if (fuelRules.planRefuel(gs, b) === null) continue;
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

  // Single source of truth (shared with generate): if a refuel can't actually be performed now
  // (stockpile drained since the job was queued, etc.) this returns null and the job is just dropped.
  const plan = fuelRules.planRefuel(gs, building);
  if (!plan) return gs;

  // The fresh batch sets the fire's character: its heat (smelt gate + warmth) and burn-longevity.
  // Refuelling fires at <30% tank, so the new fuel dominates — overwrite rather than blend.
  // The loaded fuel ids (tinder excluded), dominant first — display-only ("what's burning").
  const tinderId = fuelRules.getRefuelRequirements(building.type).tinderItemId;
  const fuelItemIds = Object.entries(plan.consumed)
    .filter(([id]) => id !== tinderId)
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);
  const newBuildings = (gs.buildings ?? []).map((b) =>
    b.id === job.buildingId
      ? {
          ...b,
          fuel: plan.newFuel,
          lit: plan.newFuel > 0,
          fireHeat: plan.fireHeat,
          burnFactor: plan.burnFactor,
          fuelItemIds
        }
      : b
  );
  const maxFuel = buildingService.getBuildingById(building.type)?.maxFuel ?? 60;
  console.log(
    `[JobService] ${building.type} refuelled to ${plan.newFuel}/${maxFuel}: ${job.buildingId}`
  );
  const afterConsume = consumeFromStockpiles(gs, plan.consumed);
  return { ...afterConsume, buildings: newBuildings };
}
