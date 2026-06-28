// Repair job handler (ADR-017). Queues a repair when a worn building drops below its threshold AND the
// colony stock can supply the proportional material, and on completion restores condition to 100% and
// consumes the planned material. The plan (which items, honoring the per-building material allow-list)
// is computed once in services/repairRules.ts (`planRepair`) and shared by both halves, so a queued
// job can never complete as a no-op (mirrors refuel.ts).
import type { GameState, Job } from '../../core/types';
// Gated console shim — see core/log.ts. Silences per-tick log/debug/warn unless gameDebug(true).
import { gatedConsole as console } from '../../core/log';
import { buildingService } from '../BuildingService';
import { consumeFromStockpiles } from '../../core/GameState';
import * as repairRules from '../repairRules';

export function generate(jobs: Job[], gs: GameState): Job[] {
  // Drop repair jobs whose building is gone, paused, back at/above threshold, or that stock can no
  // longer actually repair. `planRepair` is the SAME logic `complete` runs (no queued no-ops).
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
    // Only buildings that actually wear (not the immune tile/mountain roofs, not free markers).
    if (!buildingService.deterioratingRate(b.type)) continue;
    if ((b.condition ?? 100) >= repairRules.getRepairThresholdPct(b)) continue;
    if (repairRules.planRepair(gs, b) === null) continue; // stock can't cover it yet
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

  // Shared with generate: if the repair can't be performed now (stock drained since queued), drop it.
  const plan = repairRules.planRepair(gs, building);
  if (!plan) return gs;

  const newBuildings = (gs.buildings ?? []).map((b) =>
    b.id === job.buildingId ? { ...b, condition: plan.newCondition } : b
  );
  console.log(`[JobService] ${building.type} repaired to ${plan.newCondition}%: ${job.buildingId}`);
  const afterConsume = consumeFromStockpiles(gs, plan.consumed);
  return { ...afterConsume, buildings: newBuildings };
}
