// Harvest job handler (ADR-017). Syncs harvest jobs from harvest/woodcut/forage designations and,
// on completion, depletes the tile (in place — ADR-002 amendment), spawns the yield drops, clears
// the action order, and applies tool wear. Extracted from JobService (P-4 handler split).
import type { DesignationType, GameState, Job } from '../../core/types';
// Gated console shim — see core/log.ts. Silences per-tick log/debug/warn unless gameDebug(true).
import { gatedConsole as console } from '../../core/log';
import { resourceObjectService } from '../ResourceObjectService';
import { itemService } from '../ItemService';
import { SUBTERRAINS, SUBTERRAIN_FALLBACK } from '../../core/Terrains';
import { markTileDirty } from '../../core/tileDeltas';
import { absorbDropIfOnStockpileTile } from '../../core/GameState';
import { ticksFromSeconds } from '../../core/time';
import { rng } from '../../core/rng';
import { HARVEST_DTYPES, resourceMatchesDesignation, resourceMatchesFilter } from './filters';

export function generate(jobs: Job[], gs: GameState): Job[] {
  // Remove harvest jobs whose exact designated tile no longer permits harvesting,
  // or whose resource is gone.
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
    return (tile?.resources?.[j.resourceId ?? ''] ?? 0) > 0;
  });

  // Index existing harvest jobs by "x,y,resourceId" so the per-yield existence check below is O(1).
  // The old `jobs.some(...)` scan per designated yield was O(designations × jobs) every tick — with
  // hundreds of designations and a deep harvest pool it was a top steady-state cost (~8% of worker
  // CPU; the `some` hot line in the profiler).
  const harvestKeys = new Set<string>();
  for (const j of jobs) {
    if (j.type === 'harvest') harvestKeys.add(`${j.targetX},${j.targetY},${j.resourceId}`);
  }

  // Add harvest jobs only for designated tiles that currently hold matching resources.
  for (const [key, dtype] of Object.entries(gs.designations ?? {})) {
    if (!HARVEST_DTYPES.includes(dtype)) continue;
    const [x, y] = key.split(',').map(Number);
    const tile = gs.worldMap[y]?.[x];
    if (!tile) continue;

    for (const [resourceId, amount] of Object.entries(tile.resources ?? {})) {
      if ((amount ?? 0) <= 0) continue;
      if (!resourceMatchesDesignation(dtype, resourceId)) continue;
      if (!resourceMatchesFilter(dtype, resourceId, gs, key)) continue;

      const existKey = `${x},${y},${resourceId}`;
      if (harvestKeys.has(existKey)) continue;
      harvestKeys.add(existKey);

      jobs.push({
        id: `harvest-${x}-${y}-${resourceId}-${Date.now()}-${rng.random().toString(36).slice(2, 5)}`,
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

  // Pick the interaction matching the current designation type on this tile.
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

  // A persistent node stays on the map after harvesting (yields regrow via cooldown).
  // A node with harvestDepletes:true is removed permanently when cut (e.g. woodcut).
  const shouldPersist = interaction?.persistent === true && interaction?.harvestDepletes !== true;

  // Determine which yields are currently available (their per-yield cooldowns may be active).
  // Compound cooldown keys are formatted as "resourceId:itemId".
  let availableItemIds: Set<string> | undefined;
  if (shouldPersist && def && interaction) {
    const currentCooldowns = tile.resourceCooldowns ?? {};
    const yieldHasPerItemCooldowns = interaction.yields.some((y) => y.regrowthTurns !== undefined);
    if (yieldHasPerItemCooldowns) {
      availableItemIds = new Set<string>();
      for (const y of interaction.yields) {
        const key = `${job.resourceId}:${y.itemId}`;
        if (!(key in currentCooldowns)) {
          availableItemIds.add(y.itemId);
        }
      }
    }
  }

  const pawn = gs.pawns.find((p) => p.id === job.claimedBy);
  const yields = resourceObjectService.calculateYield(
    job.resourceId,
    pawn,
    availableItemIds,
    designationType
  );
  const yieldEntries = Object.entries(yields);

  // Update the harvested tile IN PLACE + mark it dirty (§D — ADR-002 amendment, mirroring §C
  // regrowth). Harvest completion is per-tick-hot during mass harvest; the old code rebuilt the
  // ENTIRE 38k-tile worldMap via `.map()` to change this one tile, flipping the worldMap ref every
  // completion → a full worldMap re-clone across the worker boundary AND a full terrain rebuild,
  // several times a second (the dip-correlated trace's `worldMapRef` trigger). Now only the changed
  // tile ships as a `worldMapDelta`, and the worldMap ref stays stable.
  const col = gs.worldMap[job.targetY][job.targetX];
  col.resources = { ...col.resources, [job.resourceId!]: 0 };
  if (!shouldPersist) {
    // Resource removed permanently — restore tile walkability to base subterrain.
    const baseSub = SUBTERRAINS[col.subType] ?? SUBTERRAIN_FALLBACK;
    col.walkable = baseSub.walkable;
    col.movementCost = baseSub.movementCost;
  } else {
    const newCooldowns = { ...(col.resourceCooldowns ?? {}) };
    const yieldHasPerItemCooldowns = interaction!.yields.some((y) => y.regrowthTurns !== undefined);
    if (yieldHasPerItemCooldowns) {
      // Per-yield compound keys: "resourceId:itemId" → turn
      for (const y of interaction!.yields) {
        if (y.regrowthTurns && (availableItemIds?.has(y.itemId) ?? true)) {
          newCooldowns[`${job.resourceId!}:${y.itemId}`] =
            gs.turn + ticksFromSeconds(y.regrowthTurns);
        }
      }
    } else if (interaction?.regrowthTurns) {
      // Simple whole-resource cooldown
      newCooldowns[job.resourceId!] = gs.turn + ticksFromSeconds(interaction.regrowthTurns);
    }
    col.resourceCooldowns = newCooldowns;
  }
  markTileDirty(job.targetY, job.targetX, col);

  // Spawn one DroppedItem per yield type.
  const newDropped = [...(gs.droppedItems ?? [])];
  const newDropIds: string[] = [];
  for (const [dropResourceId, dropAmount] of yieldEntries) {
    const id = `drop-${dropResourceId}-${job.targetX}-${job.targetY}-${Date.now()}-${rng.random().toString(36).slice(2, 5)}`;
    newDropped.push({
      id,
      resourceId: dropResourceId,
      x: job.targetX,
      y: job.targetY,
      quantity: dropAmount
    });
    newDropIds.push(id);
    console.log(
      `[JobService] Harvest complete: ${job.resourceId} at (${job.targetX},${job.targetY}) → ${dropResourceId} x${dropAmount}${shouldPersist ? ' (persistent)' : ''}`
    );
  }
  // Clear the action order for this tile now that the harvest is complete. This only touches
  // `designations` (action orders); a stockpile on the same tile lives in `zoneTiles` and is
  // left untouched — so harvesting a bush growing on a stockpile no longer wipes the zone.
  const newDesignations = { ...(gs.designations ?? {}) };
  delete newDesignations[`${job.targetX},${job.targetY}`];

  // Trigger-based absorption: if any drop landed on a stockpile tile, absorb immediately.
  // The stockpile zone survives the harvest above, so a drop harvested onto a tile that is
  // ALSO a stockpile is correctly absorbed.
  // worldMap is mutated in place above (no ref flip) → NOT spread here, so it ships as a delta.
  let state: GameState = {
    ...gs,
    droppedItems: newDropped,
    designations: newDesignations
  };
  for (const id of newDropIds) {
    state = absorbDropIfOnStockpileTile(state, id);
  }

  // §B tool work-wear: a tool-gated harvest spends durability on the colony's tool for
  // that work category (stone axe ≈ 8 fells, then it breaks).
  if (interaction?.toolRequirement && interaction.workCategory) {
    state = itemService.applyToolWear(interaction.workCategory, state);
  }
  return state;
}
