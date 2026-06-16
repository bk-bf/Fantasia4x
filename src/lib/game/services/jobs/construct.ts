// Construct job handler (ADR-017). Opens a construct job for an incomplete building once its reserved
// build materials are staged on the site (ADR-016) and, on completion, marks the building complete,
// wires construction quality into durability, consumes the staged materials, and blocks the tile if
// the building is solid. Extracted from JobService (P-4 handler split).
import type { GameState, Job } from '../../core/types';
// Gated console shim — see core/log.ts. Silences per-tick log/debug/warn unless gameDebug(true).
import { gatedConsole as console } from '../../core/log';
import { buildingService } from '../BuildingService';
import { pawnStatService } from '../PawnStatService';
import { buildingSupplied } from './staging';

export function generate(jobs: Job[], gs: GameState): Job[] {
  // Remove construct jobs for buildings that no longer exist or are complete
  jobs = jobs.filter((j) => {
    if (j.type !== 'construct') return true;
    const b = (gs.buildings ?? []).find((b) => b.id === j.buildingId);
    return b && b.status !== 'complete';
  });

  // Add new construct jobs for incomplete buildings
  for (const building of gs.buildings ?? []) {
    if (building.status === 'complete') continue;
    if (!building.x && !building.y && building.x !== 0 && building.y !== 0) continue;

    // Phase 6: zero-workRequired buildings were already completed by BuildingService.placeBuilding
    // (buildTime === 0 → status 'complete' on placement), so they won't reach here.
    // Extra guard just in case:
    if ((building.workRequired ?? 1) === 0) continue;

    // ADR-016: don't open the construct job until all reserved build materials are staged on
    // the site (pawns fetch them first). The materials are consumed on completion.
    if (!buildingSupplied(building, gs)) continue;

    const exists = jobs.some((j) => j.type === 'construct' && j.buildingId === building.id);
    if (!exists) {
      jobs.push({
        id: `construct-${building.id}`,
        type: 'construct',
        targetX: building.x,
        targetY: building.y,
        buildingId: building.id,
        workRequired: building.workRequired ?? 50,
        workDone: building.workDone ?? 0,
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

  // Wire stats.jsonc construction quality into building durability
  const pawn = gs.pawns.find((p) => p.id === job.claimedBy);
  const qualityMult = pawn
    ? (pawnStatService.getWorkModifiers(pawn, 'construction').quality ?? 1)
    : 1;

  const newBuildings = (gs.buildings ?? []).map((b) =>
    b.id === job.buildingId
      ? {
          ...b,
          status: 'complete' as const,
          progress: 1,
          workDone: b.workRequired ?? 50,
          quality: qualityMult
        }
      : b
  );

  // Keep buildingCounts in sync for legacy compatibility
  const newCounts = { ...(gs.buildingCounts ?? {}) };
  newCounts[building.type] = (newCounts[building.type] ?? 0) + 1;

  // ADR-016: the build materials staged on the site (reserved to this building) are consumed
  // by completing the construction.
  const newDropped = (gs.droppedItems ?? []).filter((d) => d.reservedFor !== building.id);

  console.log(
    `[JobService] Construction complete: ${building.type} (${building.id}) quality=${qualityMult.toFixed(2)}`
  );
  // A solid building (def.walkable === false) now blocks its tile — pathfinding routes around it.
  return buildingService.applyBuildingFootprint(
    { ...gs, buildings: newBuildings, buildingCounts: newCounts, droppedItems: newDropped },
    { ...building, status: 'complete' },
    true
  );
}
