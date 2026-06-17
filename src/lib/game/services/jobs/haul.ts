// Haul job handler (ADR-017). Syncs haul jobs for loose drops when a stockpile zone exists (gated by
// free capacity) and, on completion, lifts the drop — plus N-4 same-tile top-up — into the carrying
// pawn's inventory. Extracted from JobService (P-4 handler split).
import type { GameState, Job, ItemInstance } from '../../core/types';
// Gated console shim — see core/log.ts. Silences per-tick log/debug/warn unless gameDebug(true).
import { gatedConsole as console, isGameDebug } from '../../core/log';
import { itemService } from '../ItemService';
import { zoneTileKeys } from '../DesignationService';
import { itemMatchesFilter } from './filters';

export function generate(jobs: Job[], gs: GameState): Job[] {
  // Only consider non-stored drops (stored = already in stockpile)
  const allDrops = (gs.droppedItems ?? []).filter((d) => !d.stored);
  // Apply stockpile zone filter — prefer per-instance filters, fall back to legacy zoneFilters.
  const stockpileInstances = (gs.zoneInstances ?? []).filter((z) => z.type === 'stockpile');
  const drops = allDrops.filter((d) => {
    if (stockpileInstances.length > 0) {
      return stockpileInstances.some((inst) => {
        if (inst.filter.allowedCategories.length === 0) return true;
        return itemMatchesFilter(d.resourceId, inst.filter);
      });
    }
    const legacyFilter = gs.zoneFilters?.['stockpile'];
    if (!legacyFilter || legacyFilter.allowedCategories.length === 0) return true;
    return itemMatchesFilter(d.resourceId, legacyFilter);
  });
  // Heavy per-tick string building guarded behind the debug flag (see core/log.ts):
  // gatedConsole suppresses output, but the drops.map() would still run every tick.
  if (isGameDebug()) {
    console.log(
      `[HAUL-SYNC] drops on ground: ${drops.length}`,
      drops.map((d) => `${d.id}(${d.resourceId}×${d.quantity})`)
    );
  }

  // Haul jobs only make sense when there is a stockpile zone to deliver to.
  const stockpileTiles = zoneTileKeys(gs, 'stockpile');
  if (stockpileTiles.length === 0) {
    // Remove any leftover haul jobs and skip creation
    const pruned = jobs.filter((j) => j.type !== 'haul');
    if (pruned.length !== jobs.length)
      console.log('[HAUL-SYNC] no stockpile zone — removed all haul jobs');
    return pruned;
  }

  // Count free stockpile tiles (not occupied by a stored item)
  const usedCoords = new Set(
    (gs.droppedItems ?? []).filter((d) => d.stored).map((d) => `${d.x},${d.y}`)
  );
  // A tile is "available" if it's free OR already holds the same resource (can stack)
  const storedResourceIds = new Set(
    (gs.droppedItems ?? []).filter((d) => d.stored).map((d) => d.resourceId)
  );
  const freeTileCount = stockpileTiles.filter(([key]) => !usedCoords.has(key)).length;
  // Total capacity = free tiles + tiles that can accept more of an already-stored type
  const canAccept = freeTileCount + storedResourceIds.size;

  // Remove haul jobs whose dropped item no longer exists
  jobs = jobs.filter((j) => {
    if (j.type !== 'haul') return true;
    const stillExists = drops.some((d) => d.id === j.droppedItemId);
    if (!stillExists) console.log(`[HAUL-SYNC] pruned stale haul job ${j.id}`);
    return stillExists;
  });

  // Count active haul jobs to avoid scheduling more than we have capacity for
  const activeHaulCount = jobs.filter((j) => j.type === 'haul').length;

  // Add haul jobs for dropped items that have no job yet, up to available capacity
  for (const drop of drops) {
    if (activeHaulCount >= canAccept) break; // stockpile full
    const exists = jobs.some((j) => j.type === 'haul' && j.droppedItemId === drop.id);
    if (!exists) {
      console.log(
        `[HAUL-SYNC] creating haul job for drop ${drop.id} (${drop.resourceId}×${drop.quantity})`
      );
      jobs.push({
        id: `haul-${drop.id}-${Date.now()}`,
        type: 'haul',
        targetX: drop.x,
        targetY: drop.y,
        resourceId: drop.resourceId,
        droppedItemId: drop.id,
        workRequired: 1, // instant pick-up on arrival
        workDone: 0,
        claimedBy: null
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
    const taken = pawn
      ? itemService.clampPickupQuantity(pawn, drop.resourceId, drop.quantity, gs)
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

    // N-4: top up the remaining carry budget with OTHER loose, unreserved drops of the same
    // resource on the same tile, so a harvested tile of many small drops clears in one trip
    // instead of one item per round-trip. (Opportunistic en-route pickup is a future extension.)
    let total = taken;
    const removeIds = new Set<string>();
    const reduceQty = new Map<string, number>();
    const targetRem = drop.quantity - taken;
    if (targetRem > 0) reduceQty.set(drop.id, targetRem);
    else removeIds.add(drop.id);

    if (pawn) {
      const def = itemService.getItemById(drop.resourceId);
      const perW = def?.weightKg ?? 0.1;
      const perV = def?.volumeL ?? 0.2;
      const budget = itemService.getCarryBudget(pawn, gs);
      const load = itemService.getCurrentCarryLoad(pawn, gs);
      let remW = budget.maxWeightKg - load.weightKg - taken * perW;
      let remV = budget.maxVolumeL - load.volumeL - taken * perV;
      for (const cand of gs.droppedItems ?? []) {
        if (remW <= 0 || remV <= 0) break;
        if (cand.id === drop.id || cand.stored || cand.reservedFor) continue;
        if (cand.resourceId !== drop.resourceId || cand.x !== drop.x || cand.y !== drop.y) continue;
        const byW = perW > 0 ? Math.floor(remW / perW) : cand.quantity;
        const byV = perV > 0 ? Math.floor(remV / perV) : cand.quantity;
        const take = Math.min(cand.quantity, byW, byV);
        if (take <= 0) continue;
        total += take;
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
      newItems[drop.resourceId] = (newItems[drop.resourceId] ?? 0) + total;
      return { ...p, inventory: { ...inv, items: newItems } };
    });
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
