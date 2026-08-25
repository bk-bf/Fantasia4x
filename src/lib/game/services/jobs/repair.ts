import type { GameState, Job } from '../../core/types';
import { gatedConsole as console } from '../../core/util/log';
import { buildingService } from '../BuildingService';
import { consumeFromStockpiles } from '../../core/state/stockpile';
import * as repairRules from '../repairRules';

export function generate(jobs: Job[], gs: GameState): Job[] {
  jobs = jobs.filter((j) => {
    if (j.type !== 'repair') return true;
    const b = (gs.buildings ?? []).find((b) => b.id === j.buildingId);
    if (!b || b.status !== 'complete') return false;
    if (b.repairSettings?.paused) return false;
    if ((b.condition ?? 100) >= repairRules.getRepairThresholdPct(b)) return false;
    return repairRules.planRepair(gs, b) !== null;
  });

  for (const b of gs.buildings ?? []) {
    if (b.status !== 'complete') continue;
    if (b.repairSettings?.paused) continue;
    if (!buildingService.deterioratingRate(b.type)) continue;
    if ((b.condition ?? 100) >= repairRules.getRepairThresholdPct(b)) continue;
    if (repairRules.planRepair(gs, b) === null) continue;
    const exists = jobs.some((j) => j.type === 'repair' && j.buildingId === b.id);
    if (!exists) {
      jobs.push({
        id: `repair-${b.id}`,
        type: 'repair',
        targetX: b.x,
        targetY: b.y,
        buildingId: b.id,
        workRequired: 8,
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

  const plan = repairRules.planRepair(gs, building);
  if (!plan) return gs;

  const newBuildings = (gs.buildings ?? []).map((b) =>
    b.id === job.buildingId ? { ...b, condition: plan.newCondition } : b
  );
  console.log(`[JobService] ${building.type} repaired to ${plan.newCondition}%: ${job.buildingId}`);
  const afterConsume = consumeFromStockpiles(gs, plan.consumed);
  return { ...afterConsume, buildings: newBuildings };
}
