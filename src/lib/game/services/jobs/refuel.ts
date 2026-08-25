import type { GameState, Job } from '../../core/types';
import { gatedConsole as console } from '../../core/util/log';
import { buildingService } from '../BuildingService';
import { consumeFromStockpiles } from '../../core/state/stockpile';
import * as fuelRules from '../fuelRules';

export function generate(jobs: Job[], gs: GameState): Job[] {
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

  const plan = fuelRules.planRefuel(gs, building);
  if (!plan) return gs;

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
