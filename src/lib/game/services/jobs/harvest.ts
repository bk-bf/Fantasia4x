// Harvest job handler (ADR-017). Syncs harvest jobs from harvest/woodcut/forage designations and,
// on completion, depletes the tile (in place — ADR-002 amendment), spawns the yield drops, clears
// the action order, and applies tool wear. Extracted from JobService (P-4 handler split).
import type { DesignationType, GameState, Job } from '../../core/types';
// Gated console shim — see core/log.ts. Silences per-tick log/debug/warn unless gameDebug(true).
import { gatedConsole as console } from '../../core/log';
import { resourceObjectService } from '../ResourceObjectService';
import { itemService } from '../ItemService';
import {
  SUBTERRAINS,
  SUBTERRAIN_FALLBACK,
  soilTierForTile,
  SUBTYPE_BY_SOIL_TIER
} from '../../core/Terrains';
import { markTileDirty } from '../../core/tileDeltas';
import { patchPathfindingWalkable } from '../PathfinderService';
import { absorbDropIfOnStockpileTile } from '../../core/GameState';
import { ticksFromSeconds } from '../../core/time';
import { seasonRegrowthMultiplier } from '../EnvironmentService';
import { rng } from '../../core/rng';
import { HARVEST_DTYPES, resourceMatchesDesignation, resourceMatchesFilter } from './filters';

// §F anti-spam: a forage (persistent, non-depleting) node can't be foraged again until it has
// REGROWN past this growth floor — each forage strips `harvestGrowthCost` (~20%), so a stripped
// tree/bush must recover (its yield cooldown restores growth → 100%) before the next gather. Felling,
// digging and mining (harvestDepletes) are never gated; a crop reap only fires at full maturity.
const MIN_FORAGE_GROWTH = 60;

/** True when this interaction is a regrow-gated forage (persistent, not a depleting cut/dig/mine). */
function isForageGated(interaction: { persistent?: boolean; harvestDepletes?: boolean } | undefined) {
  return interaction?.persistent === true && interaction.harvestDepletes !== true;
}

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
    // Drop a forage job whose node has dropped below the regrow floor (§F anti-spam).
    const interaction = resourceObjectService.getInteractionByDesignationType(
      j.resourceId ?? '',
      designationType
    );
    if (isForageGated(interaction) && (tile?.growth?.[j.resourceId ?? ''] ?? 100) < MIN_FORAGE_GROWTH)
      return false;
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

      // §F anti-spam: don't queue a forage on a still-recovering node (growth below the regrow floor).
      const interaction = resourceObjectService.getInteractionByDesignationType(resourceId, dtype);
      if (isForageGated(interaction) && (tile.growth?.[resourceId] ?? 100) < MIN_FORAGE_GROWTH)
        continue;

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
  // §F: an under-grown node yields proportionally less (growth 50–100% on wild plants, 100% on a
  // matured crop). Read before the tile is mutated below.
  const growthPct = tile.growth?.[job.resourceId] ?? 100;
  const yields = resourceObjectService.calculateYield(
    job.resourceId,
    pawn,
    availableItemIds,
    designationType,
    growthPct
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
    // §F dig: a `dig` interaction strips the tile to bare dirt (subType → harvestSubType) after
    // yielding its soil — fertility drops to 0 (the topsoil is now in the colony's stock).
    if (interaction?.harvestSubType && SUBTERRAINS[interaction.harvestSubType]) {
      col.subType = interaction.harvestSubType;
    }
    // Resource removed permanently — restore tile walkability to base subterrain.
    const baseSub = SUBTERRAINS[col.subType] ?? SUBTERRAIN_FALLBACK;
    col.walkable = baseSub.walkable;
    // Mining out a rock node restores the BASE subterrain's sight flag (Part VII): a rocky tile re-opens,
    // a bare cliff stays opaque — same data-driven flag, just the terrain layer.
    col.blocksSight = baseSub.blocksSight ?? false;
    col.movementCost = baseSub.movementCost;
    // Keep the memoized A* grid in sync — the worldMap ref is unchanged, so the pathfinding cache
    // would otherwise keep treating the now-cleared tile as a blocking node (pawns route around it).
    patchPathfindingWalkable(col.x, col.y, baseSub.walkable);
    // §F: a dug/cut node is gone — drop its growth entry too.
    if (col.growth && job.resourceId! in col.growth) {
      const g = { ...col.growth };
      delete g[job.resourceId!];
      col.growth = g;
    }
  } else {
    // §F: a persistent harvest only STRIPS a little growth — `harvestGrowthCost` (a tree/bush forage
    // takes ~20% for branches/berries; 0 = no loss). The node stays STANDING (growth > 0 ⇒ still drawn
    // and named in the inspector); only felling/digging (harvestDepletes) removes it. Yield was already
    // scaled by the pre-harvest growth above.
    const prevGrowth = col.growth?.[job.resourceId!] ?? 100;
    col.growth = {
      ...(col.growth ?? {}),
      [job.resourceId!]: Math.max(0, prevGrowth - (interaction?.harvestGrowthCost ?? 0))
    };
    // CROPS re-mature via the conditional growth pass (processCropGrowth), NOT a flat cooldown — so a
    // perennial crop only regrows while its tile still meets fertility/temp/wetness/light. Wild plants
    // keep the timed-cooldown regrowth.
    const def = resourceObjectService.getById(job.resourceId!);
    if (!def?.crop) {
      const newCooldowns = { ...(col.resourceCooldowns ?? {}) };
      // SEASONS_WEATHER Subsystem 2: scale regrowth duration by the season rate (spring fast, winter
      // slow). Higher rate ⇒ cooldown divided ⇒ shorter wait.
      const regrowthRate = seasonRegrowthMultiplier(gs.season);
      const cooldownTicks = (turns: number) =>
        gs.turn + Math.round(ticksFromSeconds(turns) / regrowthRate);
      const yieldHasPerItemCooldowns = interaction!.yields.some((y) => y.regrowthTurns !== undefined);
      if (yieldHasPerItemCooldowns) {
        // Per-yield compound keys: "resourceId:itemId" → turn
        for (const y of interaction!.yields) {
          if (y.regrowthTurns && (availableItemIds?.has(y.itemId) ?? true)) {
            newCooldowns[`${job.resourceId!}:${y.itemId}`] = cooldownTicks(y.regrowthTurns);
          }
        }
      } else if (interaction?.regrowthTurns) {
        // Simple whole-resource cooldown
        newCooldowns[job.resourceId!] = cooldownTicks(interaction.regrowthTurns);
      }
      col.resourceCooldowns = newCooldowns;
    }
  }

  // §F soil exhaustion: a HARVESTED crop draws fertility from the soil (crop.fertilityCost of 25 per
  // tier). When the tile's accumulated wear fills a tier it degrades one step down the soil ladder
  // (terra preta → rich → loam → poor → barren dirt) — over-farming a plot eventually exhausts it,
  // and higher-tier crops draw faster. Only HARVESTED crops charge this (a crop that died is reset to
  // 1% and never reaches here); wild plants never wear soil.
  if (def?.crop) {
    // WEAR_PER_TIER is decoupled from the 25-point fertility scale and set generous on purpose:
    // planting is gated by `minSoil`, so a crop is blocked the instant its tile drops ONE tier below
    // it — the meaningful budget is "harvests before that first drop" = WEAR_PER_TIER / fertilityCost
    // (≈20 for staple crops, ≈10 for a prize crop). Keep this high or expensive soils give too few runs.
    const WEAR_PER_TIER = 100;
    let wear = (col.fertilityWear ?? 0) + def.crop.fertilityCost;
    while (wear >= WEAR_PER_TIER) {
      const tier = soilTierForTile(col);
      if (tier <= 0) {
        wear = 0; // already barren — nothing left to exhaust
        break;
      }
      col.subType = SUBTYPE_BY_SOIL_TIER[(tier - 1) as 0 | 1 | 2 | 3];
      wear -= WEAR_PER_TIER;
    }
    col.fertilityWear = wear;
    // subType may have dropped a tier → refresh the tile's physics from the new (barer) subterrain.
    const sub = SUBTERRAINS[col.subType] ?? SUBTERRAIN_FALLBACK;
    col.walkable = sub.walkable;
    col.movementCost = sub.movementCost;
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

  // §B tool work-wear (ADR-009 step 2): a tool-gated harvest spends durability on the WORKING
  // PAWN's equipped tool (it's on the pawn now, not in colony stock). When it breaks it's unequipped
  // → the per-pawn gate sees no tool → the pawn auto-grabs a replacement from stock.
  if (interaction?.toolRequirement && interaction.workCategory && job.claimedBy) {
    state = wearWorkingPawnTool(job.claimedBy, interaction.workCategory, state);
  }
  return state;
}

/** Decrement the working pawn's equipped tool for `workCategory`; unequip it (broke) at ≤0 durability.
 *  Shared with craft jobs (ADR-009 step 2 — craft-tool wear). */
export function wearWorkingPawnTool(
  pawnId: string,
  workCategory: string,
  gs: GameState
): GameState {
  const pawn = gs.pawns.find((p) => p.id === pawnId);
  if (!pawn?.equipment) return gs;
  const slot = (Object.keys(pawn.equipment) as (keyof typeof pawn.equipment)[]).find((s) => {
    const inst = pawn.equipment[s];
    if (!inst) return false;
    const def = itemService.getItemById(inst.itemId);
    return (
      def?.type === 'tool' &&
      (def.processingType?.includes(workCategory) || def.category === workCategory)
    );
  });
  if (!slot) return gs; // bare hands / tool not equipped — nothing to wear
  const inst = pawn.equipment[slot]!;
  const def = itemService.getItemById(inst.itemId);
  const loss = def?.durabilityLossPerAction ?? 2;
  const nextDur = (inst.durability ?? def?.maxDurability ?? 40) - loss;
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
