import type { GameState, Job } from '../../core/types';
import { gatedConsole as console } from '../../core/util/log';
import { buildingService } from '../BuildingService';
import { addToStockpileZone } from '../../core/state/stockpile';

export function generate(jobs: Job[], gs: GameState): Job[] {
  jobs = jobs.filter((j) => {
    if (j.type !== 'deconstruct') return true;
    const b = (gs.buildings ?? []).find((b) => b.id === j.buildingId);
    return b && b.deconstructQueued === true;
  });

  for (const building of gs.buildings ?? []) {
    if (!building.deconstructQueued) continue;
    const exists = jobs.some((j) => j.type === 'deconstruct' && j.buildingId === building.id);
    if (!exists) {
      jobs.push({
        id: `deconstruct-${building.id}`,
        type: 'deconstruct',
        targetX: building.x,
        targetY: building.y,
        buildingId: building.id,
        workRequired: building.deconstructWorkRequired ?? 1,
        workDone: building.deconstructWorkDone ?? 0,
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

  const def = buildingService.getBuildingById(building.type);
  const refunds: Record<string, number> = {};
  if (def?.buildingCost) {
    for (const [itemId, cost] of Object.entries(def.buildingCost)) {
      if (itemId.startsWith('category:')) continue;
      const refund = Math.floor(Number(cost) * 0.5);
      if (refund > 0) refunds[itemId] = (refunds[itemId] ?? 0) + refund;
    }
  }

  const newCounts = { ...(gs.buildingCounts ?? {}) };
  if (newCounts[building.type]) {
    newCounts[building.type] = Math.max(0, newCounts[building.type] - 1);
  }

  console.log(`[JobService] Deconstruction complete: ${building.type} (${building.id})`);
  const afterRestore = buildingService.applyBuildingFootprint(
    {
      ...gs,
      buildingCounts: newCounts,
      buildings: (gs.buildings ?? []).filter((b) => b.id !== job.buildingId)
    },
    building,
    false
  );
  return addToStockpileZone(afterRestore, null, refunds);
}
