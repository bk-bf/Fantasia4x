import type { DesignationType, GameState, Job } from '../../core/types';
import { gatedConsole as console } from '../../core/util/log';
import { resourceObjectService } from '../ResourceObjectService';
import { itemService } from '../ItemService';
import { buildingService } from '../BuildingService';
import {
  SUBTERRAINS,
  SUBTERRAIN_FALLBACK,
  soilTierForTile,
  SUBTYPE_BY_SOIL_TIER
} from '../../core/defs/terrains';
import { markTileDirty } from '../../core/state/tileDeltas';
import { enrolGrowth } from '../../core/rules/world/growthQueue';
import { patchPathfindingWalkable } from '../PathfinderService';
import { absorbDropIfOnStockpileTile } from '../../core/state/stockpile';
import { rng } from '../../core/util/rng';
import {
  HARVEST_DTYPES,
  meetsGrowthGate,
  resourceMatchesDesignation,
  resourceMatchesFilter
} from './filters';

export function generate(jobs: Job[], gs: GameState): Job[] {
  jobs = jobs.filter((j) => {
    if (j.type !== 'harvest') return true;
    const designationType = gs.designations?.[`${j.targetX},${j.targetY}`];
    if (!designationType || !HARVEST_DTYPES.includes(designationType)) return false;
    if (!resourceMatchesDesignation(designationType, j.resourceId ?? '')) return false;
    if (
      !resourceMatchesFilter(designationType, j.resourceId ?? '', gs, `${j.targetX},${j.targetY}`)
    )
      return false;
    const tile = gs.worldMap[j.targetY]?.[j.targetX];
    const interaction = resourceObjectService.getInteractionByDesignationType(
      j.resourceId ?? '',
      designationType
    );
    if (!meetsGrowthGate(interaction, tile?.growth?.[j.resourceId ?? ''])) return false;
    return (tile?.resources?.[j.resourceId ?? ''] ?? 0) > 0;
  });

  const harvestKeys = new Set<string>();
  for (const j of jobs) {
    if (j.type === 'harvest') harvestKeys.add(`${j.targetX},${j.targetY},${j.resourceId}`);
  }

  for (const [key, dtype] of Object.entries(gs.designations ?? {})) {
    if (!HARVEST_DTYPES.includes(dtype)) continue;
    const [x, y] = key.split(',').map(Number);
    const tile = gs.worldMap[y]?.[x];
    if (!tile) continue;

    for (const [resourceId, amount] of Object.entries(tile.resources ?? {})) {
      if ((amount ?? 0) <= 0) continue;
      if (!resourceMatchesDesignation(dtype, resourceId)) continue;
      if (!resourceMatchesFilter(dtype, resourceId, gs, key)) continue;

      const interaction = resourceObjectService.getInteractionByDesignationType(resourceId, dtype);
      if (!meetsGrowthGate(interaction, tile.growth?.[resourceId])) continue;

      const existKey = `${x},${y},${resourceId}`;
      if (harvestKeys.has(existKey)) continue;
      harvestKeys.add(existKey);

      jobs.push({
        id: `harvest-${x}-${y}-${resourceId}-t${gs.turn}-${rng.random().toString(36).slice(2, 5)}`,
        type: 'harvest',
        targetX: x,
        targetY: y,
        resourceId,
        workRequired: resourceObjectService.getWorkAmount(resourceId, dtype as DesignationType),
        workDone: 0,
        claimedBy: null
      });
    }
  }

  return jobs;
}

export function complete(job: Job, gs: GameState): GameState {
  if (!job.resourceId) return gs;

  const tile = gs.worldMap[job.targetY]?.[job.targetX];
  const available = tile?.resources?.[job.resourceId] ?? 0;
  if (available <= 0) return gs;

  const def = resourceObjectService.getById(job.resourceId);
  const designationType = (gs.designations ?? {})[`${job.targetX},${job.targetY}`] as
    | DesignationType
    | undefined;
  const interaction = def
    ? (resourceObjectService.getInteractionByDesignationType(
        job.resourceId,
        designationType ?? 'harvest'
      ) ?? def.interaction)
    : undefined;

  const pawn = gs.pawns.find((p) => p.id === job.claimedBy);
  const growthPct = tile.growth?.[job.resourceId] ?? 100;
  const yields = resourceObjectService.calculateYield(
    job.resourceId,
    pawn,
    designationType,
    growthPct
  );
  const yieldEntries = Object.entries(yields);

  if (pawn?.lineagePaths?.length) {
    const caughtFish = yieldEntries.some(
      ([itemId, qty]) => qty > 0 && itemService.getItemById(itemId)?.category === 'fish'
    );
    if (caughtFish) {
      const deeds = (pawn.deeds ??= {});
      deeds.fishedCount = (deeds.fishedCount ?? 0) + 1;
    }
  }

  const col = gs.worldMap[job.targetY][job.targetX];
  const growthAfter = interaction?.growthAfter;
  const clearsTile = growthAfter === undefined;
  if (clearsTile) {
    col.resources = { ...col.resources, [job.resourceId]: 0 };
    if (interaction?.harvestSubType && SUBTERRAINS[interaction.harvestSubType]) {
      col.subType = interaction.harvestSubType;
    }
    const baseSub = SUBTERRAINS[col.subType] ?? SUBTERRAIN_FALLBACK;
    col.walkable = baseSub.walkable;
    col.blocksSight = baseSub.blocksSight ?? false;
    col.movementCost = baseSub.movementCost;
    patchPathfindingWalkable(col.x, col.y, baseSub.walkable);
    if (col.growth && job.resourceId in col.growth) {
      const g = { ...col.growth };
      delete g[job.resourceId];
      col.growth = g;
    }
  } else {
    col.growth = { ...(col.growth ?? {}), [job.resourceId]: growthAfter };
    if (growthAfter <= 0) col.resources = { ...col.resources, [job.resourceId]: 0 };
    enrolGrowth(col, gs.turn);
  }

  if (def?.crop) {
    const WEAR_PER_TIER = 100;
    let wear = (col.fertilityWear ?? 0) + def.crop.fertilityCost;
    while (wear >= WEAR_PER_TIER) {
      const tier = soilTierForTile(col);
      if (tier <= 0) {
        wear = 0;
        break;
      }
      col.subType = SUBTYPE_BY_SOIL_TIER[(tier - 1) as 0 | 1 | 2 | 3];
      wear -= WEAR_PER_TIER;
    }
    col.fertilityWear = wear;
    const sub = SUBTERRAINS[col.subType] ?? SUBTERRAIN_FALLBACK;
    col.walkable = sub.walkable;
    col.movementCost = sub.movementCost;
  }
  markTileDirty(job.targetY, job.targetX, col);

  const newDropped = [...(gs.droppedItems ?? [])];
  const newDropIds: string[] = [];
  for (const [dropResourceId, dropAmount] of yieldEntries) {
    const id = `drop-${dropResourceId}-${job.targetX}-${job.targetY}-t${gs.turn}-${rng.random().toString(36).slice(2, 5)}`;
    newDropped.push({
      id,
      resourceId: dropResourceId,
      x: job.targetX,
      y: job.targetY,
      quantity: dropAmount
    });
    newDropIds.push(id);
    console.log(
      `[JobService] Harvest complete: ${job.resourceId} at (${job.targetX},${job.targetY}) → ${dropResourceId} x${dropAmount} (growth ${growthPct.toFixed(0)}% → ${growthAfter ?? 'cleared'})`
    );
  }
  const newDesignations = { ...(gs.designations ?? {}) };
  delete newDesignations[`${job.targetX},${job.targetY}`];

  let state: GameState = {
    ...gs,
    droppedItems: newDropped,
    designations: newDesignations
  };
  for (const id of newDropIds) {
    state = absorbDropIfOnStockpileTile(state, id);
  }

  if (interaction?.toolRequirement && interaction.workCategory && job.claimedBy) {
    state = wearWorkingPawnTool(job.claimedBy, interaction.workCategory, state);
  }

  if (clearsTile && def?.overheadRoof) {
    state = buildingService.placeBuilding('mountain_roof', job.targetX, job.targetY, state);
    state = buildingService.removeUnsupportedRoofs(state, job.targetX, job.targetY);
  }
  return state;
}

export function wearWorkingPawnTool(
  pawnId: string,
  workCategory: string,
  gs: GameState
): GameState {
  const pawn = gs.pawns.find((p) => p.id === pawnId);
  if (!pawn) return gs;
  const matchesCategory = (itemId: string): boolean => {
    const def = itemService.getItemById(itemId);
    return (
      def?.type === 'tool' &&
      (def.processingType?.includes(workCategory) || def.category === workCategory)
    );
  };
  const nextDurability = (inst: { itemId: string; durability?: number }): number => {
    const def = itemService.getItemById(inst.itemId);
    return (inst.durability ?? def?.maxDurability ?? 40) - (def?.durabilityLossPerAction ?? 2);
  };

  const slot =
    pawn.equipment &&
    (Object.keys(pawn.equipment) as (keyof typeof pawn.equipment)[]).find((s) => {
      const inst = pawn.equipment[s];
      return inst && matchesCategory(inst.itemId);
    });
  if (slot) {
    const inst = pawn.equipment[slot]!;
    const nextDur = nextDurability(inst);
    return {
      ...gs,
      pawns: gs.pawns.map((p) => {
        if (p.id !== pawnId) return p;
        const equipment = { ...p.equipment };
        if (nextDur <= 0) delete equipment[slot];
        else equipment[slot] = { ...inst, durability: nextDur };
        return { ...p, equipment };
      })
    };
  }

  const instances = pawn.inventory?.instances ?? [];
  const invIdx = instances.findIndex((i) => matchesCategory(i.itemId));
  if (invIdx < 0) return gs;
  const inst = instances[invIdx];
  const nextDur = nextDurability(inst);
  return {
    ...gs,
    pawns: gs.pawns.map((p) => {
      if (p.id !== pawnId) return p;
      const next = [...(p.inventory?.instances ?? [])];
      if (nextDur <= 0) next.splice(invIdx, 1);
      else next[invIdx] = { ...inst, durability: nextDur };
      return { ...p, inventory: { ...p.inventory, instances: next } };
    })
  };
}
