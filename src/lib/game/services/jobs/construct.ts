import type { GameState, Job } from '../../core/types';
import { gatedConsole as console } from '../../core/util/log';
import { buildingService } from '../BuildingService';
import { pawnStatService } from '../PawnStatService';
import { buildingSupplied } from './staging';
import { SUBTERRAINS, SUBTERRAIN_FALLBACK, terrainBlocksSight } from '../../core/defs/terrains';
import { markTileDirty } from '../../core/state/tileDeltas';
import { patchPathfindingWalkable } from '../PathfinderService';

export function generate(jobs: Job[], gs: GameState): Job[] {
  jobs = jobs.filter((j) => {
    if (j.type !== 'construct') return true;
    const b = (gs.buildings ?? []).find((b) => b.id === j.buildingId);
    return b && b.status !== 'complete' && !b.paused;
  });

  for (const building of gs.buildings ?? []) {
    if (building.status === 'complete') continue;
    if (building.paused) continue;
    if (!building.x && !building.y && building.x !== 0 && building.y !== 0) continue;

    if ((building.workRequired ?? 1) === 0) continue;

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

  const def = buildingService.getBuildingById(building.type);
  if (def?.terraformSubType) {
    const sub = SUBTERRAINS[def.terraformSubType] ?? SUBTERRAIN_FALLBACK;
    const tile = gs.worldMap[building.y]?.[building.x];
    if (tile) {
      tile.subType = def.terraformSubType;
      tile.walkable = sub.walkable;
      tile.movementCost = sub.movementCost;
      tile.blocksSight = terrainBlocksSight(sub.walkable, def.terraformSubType);
      patchPathfindingWalkable(tile.x, tile.y, sub.walkable);
      markTileDirty(building.y, building.x, tile);
    }
    console.log(
      `[JobService] Terraform complete: ${building.type} at (${building.x},${building.y}) → subType ${def.terraformSubType}`
    );
    return {
      ...gs,
      buildings: (gs.buildings ?? []).filter((b) => b.id !== building.id),
      droppedItems: (gs.droppedItems ?? []).filter((d) => d.reservedFor !== building.id)
    };
  }

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

  const newCounts = { ...(gs.buildingCounts ?? {}) };
  newCounts[building.type] = (newCounts[building.type] ?? 0) + 1;

  const newDropped = (gs.droppedItems ?? []).filter((d) => d.reservedFor !== building.id);

  console.log(
    `[JobService] Construction complete: ${building.type} (${building.id}) quality=${qualityMult.toFixed(2)}`
  );
  return buildingService.applyBuildingFootprint(
    { ...gs, buildings: newBuildings, buildingCounts: newCounts, droppedItems: newDropped },
    { ...building, status: 'complete' },
    true
  );
}
