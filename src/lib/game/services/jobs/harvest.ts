// Harvest job handler (ADR-017). Syncs harvest jobs from harvest/woodcut/forage designations and,
// on completion, depletes the tile (in place — ADR-002 amendment), spawns the yield drops, clears
// the action order, and applies tool wear. Extracted from JobService (P-4 handler split).
import type { DesignationType, GameState, Job } from '../../core/types';
// Gated console shim — see core/log.ts. Silences per-tick log/debug/warn unless gameDebug(true).
import { gatedConsole as console } from '../../core/log';
import { resourceObjectService } from '../ResourceObjectService';
import { itemService } from '../ItemService';
import { buildingService } from '../BuildingService';
import {
  SUBTERRAINS,
  SUBTERRAIN_FALLBACK,
  soilTierForTile,
  SUBTYPE_BY_SOIL_TIER
} from '../../core/Terrains';
import { markTileDirty } from '../../core/tileDeltas';
import { addWildGrowth } from '../../core/wildGrowth';
import { pushRegrowth, minCooldownExpiry } from '../../core/regrowthQueue';
import { patchPathfindingWalkable } from '../PathfinderService';
import { absorbDropIfOnStockpileTile } from '../../core/GameState';
import { ticksFromSeconds } from '../../core/time';
import { seasonRegrowthMultiplier } from '../EnvironmentService';
import { rng } from '../../core/rng';
import {
  HARVEST_DTYPES,
  MIN_FORAGE_GROWTH,
  isForageGated,
  resourceMatchesDesignation,
  resourceMatchesFilter
} from './filters';

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
    if (
      isForageGated(interaction) &&
      (tile?.growth?.[j.resourceId ?? ''] ?? 100) < MIN_FORAGE_GROWTH
    )
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

  // LINEAGES §4 — a harvest that lands FISH is a fishing action: it feeds the amphibian awakening
  // ("the angler"). Gated on the pawn actually carrying a meter (rare).
  if (pawn?.lineagePaths?.length) {
    const caughtFish = yieldEntries.some(
      ([itemId, qty]) => qty > 0 && itemService.getItemById(itemId)?.category === 'fish'
    );
    if (caughtFish) {
      const deeds = (pawn.deeds ??= {});
      deeds.fishedCount = (deeds.fishedCount ?? 0) + 1;
    }
  }

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
  } else if (interaction?.regrowsFromZero) {
    // Wild ground cover (berry bush, wild grain, grass): a harvest RESETS the node — growth → 0% so the
    // tile reveals the bare soil under it (its subType is untouched, so it's the SAME soil tier, never
    // forced to barren dirt). It then climbs 0→100 GRADUALLY via processWildGrowth (fading the plant
    // back in past RESOURCE_VISIBLE_GROWTH) and restores its count at maturity — no binary cooldown.
    col.growth = { ...(col.growth ?? {}), [job.resourceId!]: 0 };
    addWildGrowth(col.x, col.y);
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
      const yieldHasPerItemCooldowns = interaction!.yields.some(
        (y) => y.regrowthTurns !== undefined
      );
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
      // ENGINE-PERFORMANCE-II §S2: schedule this tile's soonest cooldown so the engine drains only due
      // tiles instead of rescanning the whole worldMap every tick. (worldMap ref is stable in play, so
      // a rescan would never see this in-place write.)
      pushRegrowth(minCooldownExpiry(newCooldowns), col.x, col.y);
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

  // ROOF-SUPPORT: mining OUT overhead rock (a mountain/cliff wall) leaves a natural rock roof over the
  // now-open tile, and may orphan nearby roofs whose support was the rock just removed. Place the
  // mountain roof (placeBuilding only keeps it if the cleared tile is still within span of support),
  // then drop any roof that's now unsupported. See BuildingService for the dangerous-collapse TODO.
  if (!shouldPersist && def?.overheadRoof) {
    state = buildingService.placeBuilding('mountain_roof', job.targetX, job.targetY, state);
    state = buildingService.removeUnsupportedRoofs(state, job.targetX, job.targetY);
  }
  return state;
}

/** Decrement the working pawn's tool for `workCategory` and drop it (broke) at ≤0 durability. The tool
 *  may be EQUIPPED or just CARRIED in the pack (`inventory.instances`) — both pass the tool gate and
 *  boost work (PawnStatService.heldToolBoost reads both), so both must wear. A carried axe used to fell
 *  trees forever without ever dulling because only the equipment slot was checked here.
 *  Shared with craft jobs (ADR-009 step 2 — craft-tool wear). */
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

  // Prefer an equipped tool (the belt/main-hand path); when broken it's unequipped → the per-pawn gate
  // sees no tool → the pawn auto-grabs a replacement from stock.
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

  // Else wear a tool CARRIED in the pack. When it breaks, remove the instance so the gate re-fires and
  // a fresh tool is fetched (same lifecycle as the unequip-on-break above).
  const instances = pawn.inventory?.instances ?? [];
  const invIdx = instances.findIndex((i) => matchesCategory(i.itemId));
  if (invIdx < 0) return gs; // bare hands / no matching tool — nothing to wear
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
