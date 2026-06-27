// Haul job handler (ADR-017). Syncs haul jobs for loose drops when a stockpile zone exists (gated by
// free capacity) and, on completion, lifts the drop — plus N-4 same-tile top-up — into the carrying
// pawn's inventory. Extracted from JobService (P-4 handler split).
import type { GameState, Job, ItemInstance } from '../../core/types';
// Gated console shim — see core/log.ts. Silences per-tick log/debug/warn unless gameDebug(true).
import { gatedConsole as console, isGameDebug } from '../../core/log';
import { itemService } from '../ItemService';
import {
  storageTileKeys,
  tilePileCapacity,
  tileStoredPileCount,
  binFilterAt
} from '../../core/GameState';
import { itemMatchesFilter } from './filters';
import { ENC_OVERLOAD_FULL } from '../../core/needs';
import { gameLogger } from '../../dev/gameLogger';

/**
 * Would the colony's stockpile accept a drop of `resourceId`? Prefers per-instance zone filters,
 * falls back to the legacy single `zoneFilters['stockpile']`; an empty `allowedCategories` accepts
 * everything. The single source for "is this haulable into a stockpile" — used by haul `generate()`
 * AND the opportunistic sweep (pawnHauling) so a pawn never grabs items the stockpile would bounce.
 */
export function stockpileAcceptsDrop(gs: GameState, resourceId: string): boolean {
  const stockpileInstances = (gs.zoneInstances ?? []).filter((z) => z.type === 'stockpile');
  if (stockpileInstances.length > 0) {
    return stockpileInstances.some((inst) => {
      if (inst.filter.allowedCategories.length === 0) return true;
      return itemMatchesFilter(resourceId, inst.filter);
    });
  }
  const legacyFilter = gs.zoneFilters?.['stockpile'];
  if (!legacyFilter || legacyFilter.allowedCategories.length === 0) return true;
  return itemMatchesFilter(resourceId, legacyFilter);
}

/** Does a SPECIALIZED store's allow-list (categories OR explicit item ids) admit this resource? */
function resourceAllowedByList(resourceId: string, allowed: string[]): boolean {
  if (allowed.includes(resourceId)) return true; // explicit item id (e.g. hay rack accepts `hay`)
  const cat = itemService.getItemById(resourceId)?.category;
  return cat ? allowed.includes(cat) : false;
}

/**
 * Would the store on a SPECIFIC tile (x,y) take a drop of `resourceId`? A specialized bin matches its
 * own filter; a plain stockpile tile / unfiltered bin defers to the colony stockpile filter. The single
 * per-tile acceptance source — used by the deposit search and the haulability gate below.
 */
export function storageTileAcceptsDrop(
  gs: GameState,
  x: number,
  y: number,
  resourceId: string
): boolean {
  const filter = binFilterAt(gs, x, y);
  if (filter) return resourceAllowedByList(resourceId, filter);
  return stockpileAcceptsDrop(gs, resourceId);
}

/** Is `resourceId` haulable at all — does ANY existing storage tile (zone or bin) accept it? */
export function storageAcceptsDrop(gs: GameState, resourceId: string): boolean {
  for (const key of storageTileKeys(gs)) {
    const [x, y] = key.split(',').map(Number);
    if (storageTileAcceptsDrop(gs, x, y, resourceId)) return true;
  }
  return false;
}

export function generate(jobs: Job[], gs: GameState): Job[] {
  // Only consider non-stored, non-forbidden drops (stored = already in stockpile; forbidden = the
  // player has locked it out of hauling — e.g. a wild carcass left where it fell). Excluding
  // forbidden here also makes the stale-job prune below drop any in-flight haul for a stack that was
  // just forbidden, so a pawn already walking to it abandons the trip. Drops on a re-haul cooldown
  // (just set down loose because the stockpile was unreachable, dropLooseAtPawn) are skipped until the
  // cooldown lapses — otherwise the same unreachable pawn re-grabs and re-drops them every tick (the
  // floor-shuffle). The cooldown expires, so the goods resume hauling once a route opens.
  const allDrops = (gs.droppedItems ?? []).filter(
    (d) =>
      !d.stored &&
      !d.forbidden &&
      !(d.rehaulCooldownUntil != null && d.rehaulCooldownUntil > gs.turn)
  );
  // Only haul a drop some store will actually take — a zone/general store (its filter) OR a specialized
  // bin whose category/item list admits it. Stops a meat-only larder from attracting grain it can't hold.
  const drops = allDrops.filter((d) => storageAcceptsDrop(gs, d.resourceId));
  // Heavy per-tick string building guarded behind the debug flag (see core/log.ts):
  // gatedConsole suppresses output, but the drops.map() would still run every tick.
  if (isGameDebug()) {
    console.log(
      `[HAUL-SYNC] drops on ground: ${drops.length}`,
      drops.map((d) => `${d.id}(${d.resourceId}×${d.quantity})`)
    );
  }

  // Haul jobs only make sense when there is somewhere to deliver to — a drawn stockpile zone OR a
  // standalone storage-bin building (a wicker basket stores without a zone).
  const stockpileTiles = storageTileKeys(gs);
  if (stockpileTiles.length === 0) {
    // Remove any leftover haul jobs and skip creation
    const pruned = jobs.filter((j) => j.type !== 'haul');
    if (pruned.length !== jobs.length)
      console.log('[HAUL-SYNC] no stockpile — removed all haul jobs');
    return pruned;
  }

  // Free pile-slots across all storage tiles: each tile holds `tilePileCapacity` distinct piles
  // (1 for a plain stockpile tile, more for a dense bin), minus the piles already stored on it.
  let freeSlots = 0;
  for (const key of stockpileTiles) {
    const [x, y] = key.split(',').map(Number);
    freeSlots += Math.max(0, tilePileCapacity(gs, x, y) - tileStoredPileCount(gs, x, y));
  }
  // An already-stored resource type can always absorb more (a haul tops up its existing pile without
  // claiming a new slot), so total acceptance = free slots + distinct stored types.
  const storedResourceIds = new Set(
    (gs.droppedItems ?? []).filter((d) => d.stored).map((d) => d.resourceId)
  );
  const canAccept = freeSlots + storedResourceIds.size;

  // Remove haul jobs whose dropped item no longer exists, and keep each surviving job's `urgent` flag
  // in sync with its source stack (so toggling urgency on an already-queued stack takes effect). The
  // ref is preserved when nothing changed, so we don't churn job refs every tick (perf).
  jobs = jobs.flatMap((j) => {
    if (j.type !== 'haul') return [j];
    const d = drops.find((x) => x.id === j.droppedItemId);
    if (!d) {
      console.log(`[HAUL-SYNC] pruned stale haul job ${j.id}`);
      return [];
    }
    const urgent = d.urgent || undefined;
    return [(j.urgent ?? undefined) === urgent ? j : { ...j, urgent }];
  });

  // Count active haul jobs to avoid scheduling more than we have capacity for
  const activeHaulCount = jobs.filter((j) => j.type === 'haul').length;
  const atCapacity = activeHaulCount >= canAccept;

  // Add haul jobs for dropped items that have no job yet. Urgent stacks are scheduled FIRST (so they
  // win scarce stockpile capacity) and bypass the capacity cap entirely — the player explicitly
  // flagged them. Normal stacks are skipped once the stockpile is full.
  const ordered = drops.some((d) => d.urgent)
    ? [...drops].sort((a, b) => (b.urgent ? 1 : 0) - (a.urgent ? 1 : 0))
    : drops;
  for (const drop of ordered) {
    if (atCapacity && !drop.urgent) continue; // stockpile full — non-urgent stacks wait
    const exists = jobs.some((j) => j.type === 'haul' && j.droppedItemId === drop.id);
    if (!exists) {
      console.log(
        `[HAUL-SYNC] creating ${drop.urgent ? 'URGENT ' : ''}haul job for drop ${drop.id} (${drop.resourceId}×${drop.quantity})`
      );
      jobs.push({
        id: `haul-${drop.id}-${Date.now()}`,
        type: 'haul',
        targetX: drop.x,
        targetY: drop.y,
        resourceId: drop.resourceId,
        droppedItemId: drop.id,
        // Near-instant pick-up: ~1 tick of "work" on arrival (was 1 work-point ≈ ⅓–1 s). The WALK to
        // and from the stockpile is the real cost of hauling — scooping a stack off the ground should
        // not. (BASE_WORK_RATE=1/s × TICKS_PER_SECOND=60 → 0.02 ≈ a single tick for a normal pawn.)
        workRequired: 0.02,
        workDone: 0,
        claimedBy: null,
        ...(drop.urgent ? { urgent: true } : {})
      });
    }
  }

  return jobs;
}

export function complete(job: Job, gs: GameState): GameState {
  if (!job.droppedItemId) return gs;

  const drop = (gs.droppedItems ?? []).find((d) => d.id === job.droppedItemId);
  if (!drop) return gs;

  // Add to carrying pawn's inventory
  const pawnId = job.claimedBy;
  if (pawnId) {
    const pawn = gs.pawns.find((p) => p.id === pawnId);
    // R5 carry budget: take only what fits; the rest stays on the ground for another trip.
    // Haulers load up to the encumbrance ceiling (ENC_OVERLOAD_FULL = 1.4×) — they deliberately
    // overfill into the `encumbered` band so a felled tree clears in fewer trips.
    const taken = pawn
      ? itemService.clampPickupQuantity(pawn, drop.resourceId, drop.quantity, gs, ENC_OVERLOAD_FULL)
      : drop.quantity;
    if (taken <= 0) return gs;

    // Identity-tracked drop (R10): a `dynamicName` item (e.g. a pawn carcass "Vale's Carcass")
    // must keep its per-instance name through the haul. Carry it as a named ItemInstance — never
    // folded into the counted `items` map and never N-4-merged with other carcasses — so deposit
    // can lay it into the stockpile as its own distinct, named pile.
    const dropDef = itemService.getItemById(drop.resourceId);
    if (dropDef?.dynamicName) {
      const newDropped = (gs.droppedItems ?? []).filter((d) => d.id !== drop.id);
      const newPawns = gs.pawns.map((p) => {
        if (p.id !== pawnId) return p;
        const inv = p.inventory ?? {
          items: {},
          instances: [],
          weightKg: 0,
          maxWeightKg: 20,
          volumeL: 0,
          maxVolumeL: 20
        };
        const instance: ItemInstance = {
          instanceId: drop.instance?.instanceId ?? drop.id,
          itemId: drop.resourceId,
          durability: drop.instance?.durability ?? 0,
          name: drop.name
        };
        return { ...p, inventory: { ...inv, instances: [...inv.instances, instance] } };
      });
      return { ...gs, droppedItems: newDropped, pawns: newPawns };
    }

    // Top up the remaining (1.4×) carry budget with OTHER loose, unreserved, unforbidden,
    // stockpile-accepted drops of ANY resource on the drop tile OR its 8 neighbours, so a felled
    // tree's mixed pile (logs + branches + bark + fiber, possibly spilled onto adjacent tiles)
    // clears in ONE trip instead of one resource per round-trip. Gains accumulate per-resource.
    const gained: Record<string, number> = { [drop.resourceId]: taken };
    const removeIds = new Set<string>();
    const reduceQty = new Map<string, number>();
    const targetRem = drop.quantity - taken;
    if (targetRem > 0) reduceQty.set(drop.id, targetRem);
    else removeIds.add(drop.id);

    if (pawn) {
      const firstDef = itemService.getItemById(drop.resourceId);
      const budget = itemService.getCarryBudget(pawn, gs);
      const load = itemService.getCurrentCarryLoad(pawn, gs);
      let remW =
        budget.maxWeightKg * ENC_OVERLOAD_FULL -
        load.weightKg -
        taken * (firstDef?.weightKg ?? 0.1);
      let remV =
        budget.maxVolumeL * ENC_OVERLOAD_FULL - load.volumeL - taken * (firstDef?.volumeL ?? 0.2);
      for (const cand of gs.droppedItems ?? []) {
        if (remW <= 0 || remV <= 0) break;
        if (cand.id === drop.id || cand.stored || cand.reservedFor || cand.forbidden) continue;
        if (cand.rehaulCooldownUntil != null && cand.rehaulCooldownUntil > gs.turn) continue;
        if (Math.abs(cand.x - drop.x) > 1 || Math.abs(cand.y - drop.y) > 1) continue;
        if (!stockpileAcceptsDrop(gs, cand.resourceId)) continue;
        const def = itemService.getItemById(cand.resourceId);
        const perW = def?.weightKg ?? 0.1;
        const perV = def?.volumeL ?? 0.2;
        const byW = perW > 0 ? Math.floor(remW / perW) : cand.quantity;
        const byV = perV > 0 ? Math.floor(remV / perV) : cand.quantity;
        const take = Math.min(cand.quantity, byW, byV);
        if (take <= 0) continue;
        gained[cand.resourceId] = (gained[cand.resourceId] ?? 0) + take;
        remW -= take * perW;
        remV -= take * perV;
        const rem = cand.quantity - take;
        if (rem > 0) reduceQty.set(cand.id, rem);
        else removeIds.add(cand.id);
      }
    }

    const newDropped = (gs.droppedItems ?? [])
      .filter((d) => !removeIds.has(d.id))
      .map((d) => (reduceQty.has(d.id) ? { ...d, quantity: reduceQty.get(d.id)! } : d));
    const newPawns = gs.pawns.map((p) => {
      if (p.id !== pawnId) return p;
      const inv = p.inventory ?? {
        items: {},
        instances: [],
        weightKg: 0,
        maxWeightKg: 20,
        volumeL: 0,
        maxVolumeL: 20
      };
      const newItems = { ...inv.items };
      for (const [rid, q] of Object.entries(gained)) newItems[rid] = (newItems[rid] ?? 0) + q;
      return { ...p, inventory: { ...inv, items: newItems } };
    });
    // ITEM-DBG: haul-job pickup — the drop `id` we completed, what was lifted (incl. the 3×3 sweep),
    // and the pawn's inventory before → after. Confirms the stack physically entered the inventory.
    gameLogger.log(
      gs.turn,
      'ITEM-DBG',
      `haul.complete: ${pawn?.name ?? pawnId} job-drop=${job.droppedItemId} gained ${JSON.stringify(gained)} ` +
        `inv ${JSON.stringify(pawn?.inventory?.items ?? {})} → ${JSON.stringify(
          newPawns.find((p) => p.id === pawnId)?.inventory?.items ?? {}
        )}`
    );
    return { ...gs, droppedItems: newDropped, pawns: newPawns };
  }

  // No pawn claimed it (fallback path below uses the whole drop).
  const newDropped = (gs.droppedItems ?? []).filter((d) => d.id !== drop.id);
  console.warn(
    `[HAUL-COMPLETE] no claimedBy on haul job ${job.id} — dropping straight to stockpile`
  );

  // No pawn claimed it (shouldn't happen) — fall back to stockpile and item
  const newStockpile = { ...(gs.stockpile ?? {}) };
  newStockpile[drop.resourceId] = (newStockpile[drop.resourceId] ?? 0) + drop.quantity;
  const baseState = { ...gs, droppedItems: newDropped, stockpile: newStockpile };
  return itemService.addItems({ [drop.resourceId]: drop.quantity }, baseState);
}
