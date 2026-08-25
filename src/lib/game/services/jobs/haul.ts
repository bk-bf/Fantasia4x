import type { GameState, Job, ItemInstance } from '../../core/types';
import { gatedConsole as console, isGameDebug } from '../../core/util/log';
import { itemService } from '../ItemService';
import { vesselOf } from '../../core/rules/gear/vessels';
import {
  storageTileKeys,
  tilePileCapacity,
  tileStoredPileCount,
  binFilterAt,
  isStorageTile,
  tileVesselCount,
  withDrops
} from '../../core/state/stockpile';
import { zoneInstanceIdAt } from '../DesignationService';
import { itemMatchesFilter } from './filters';
import { ENC_OVERLOAD_FULL } from '../../core/rules/body/conditions';
import { gameLogger } from '../../debug/gameLogger';

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

function resourceAllowedByList(resourceId: string, allowed: string[]): boolean {
  if (allowed.includes(resourceId)) return true;
  const cat = itemService.getItemById(resourceId)?.category;
  return cat ? allowed.includes(cat) : false;
}

export function storageTileAcceptsDrop(
  gs: GameState,
  x: number,
  y: number,
  resourceId: string
): boolean {
  if (vesselOf(resourceId) && !zoneAcceptsAnotherVessel(gs, x, y)) return false;
  const filter = binFilterAt(gs, x, y);
  if (filter) return resourceAllowedByList(resourceId, filter);
  return stockpileAcceptsDrop(gs, resourceId);
}

function zoneAcceptsAnotherVessel(gs: GameState, x: number, y: number): boolean {
  const instId = zoneInstanceIdAt(gs, `${x},${y}`, 'stockpile');
  if (!instId) return true;
  const budget = (gs.zoneInstances ?? []).find((z) => z.id === instId)?.containerBudget ?? 0;
  if (budget <= 0) return true;
  let held = 0;
  for (const key of zoneTileKeys(gs, instId)) {
    const [zx, zy] = key.split(',').map(Number);
    held += tileVesselCount(gs, zx, zy);
    if (held >= budget) return false;
  }
  return true;
}

function zoneTileKeys(gs: GameState, instanceId: string): string[] {
  const out: string[] = [];
  for (const [key] of Object.entries(gs.zoneTiles ?? {}))
    if (zoneInstanceIdAt(gs, key, 'stockpile') === instanceId) out.push(key);
  return out;
}

export function storageAcceptsDrop(gs: GameState, resourceId: string): boolean {
  for (const key of storageTileKeys(gs)) {
    const [x, y] = key.split(',').map(Number);
    if (storageTileAcceptsDrop(gs, x, y, resourceId)) return true;
  }
  return false;
}

function storedTileStillAccepts(gs: GameState, x: number, y: number, resourceId: string): boolean {
  if (!isStorageTile(gs, x, y)) return false;
  const binFilter = binFilterAt(gs, x, y);
  if (binFilter) return resourceAllowedByList(resourceId, binFilter);
  const instId = zoneInstanceIdAt(gs, `${x},${y}`, 'stockpile');
  const inst = instId ? (gs.zoneInstances ?? []).find((z) => z.id === instId) : undefined;
  if (inst) {
    if (inst.filter.allowedCategories.length === 0) return true;
    return itemMatchesFilter(resourceId, inst.filter);
  }
  return stockpileAcceptsDrop(gs, resourceId);
}

export function reconcileEvictedDrops(gs: GameState): GameState {
  let changed = false;
  const drops = (gs.droppedItems ?? []).map((d) => {
    if (!d.stored || d.reservedFor) return d;
    if (storedTileStillAccepts(gs, d.x, d.y, d.resourceId)) return d;
    changed = true;
    return { ...d, stored: false };
  });
  if (!changed) return gs;
  return withDrops(gs, drops);
}

export function generate(jobs: Job[], gs: GameState): Job[] {
  const allDrops = (gs.droppedItems ?? []).filter(
    (d) =>
      !d.stored &&
      !d.forbidden &&
      !(d.rehaulCooldownUntil != null && d.rehaulCooldownUntil > gs.turn)
  );
  const drops = allDrops.filter((d) => storageAcceptsDrop(gs, d.resourceId));
  if (isGameDebug()) {
    console.log(
      `[HAUL-SYNC] drops on ground: ${drops.length}`,
      drops.map((d) => `${d.id}(${d.resourceId}×${d.quantity})`)
    );
  }

  const stockpileTiles = storageTileKeys(gs);
  if (stockpileTiles.length === 0) {
    const pruned = jobs.filter((j) => j.type !== 'haul');
    if (pruned.length !== jobs.length)
      console.log('[HAUL-SYNC] no stockpile — removed all haul jobs');
    return pruned;
  }

  let freeSlots = 0;
  for (const key of stockpileTiles) {
    const [x, y] = key.split(',').map(Number);
    freeSlots += Math.max(0, tilePileCapacity(gs, x, y) - tileStoredPileCount(gs, x, y));
  }
  const storedResourceIds = new Set(
    (gs.droppedItems ?? []).filter((d) => d.stored).map((d) => d.resourceId)
  );
  const canAccept = freeSlots + storedResourceIds.size;

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

  const activeHaulCount = jobs.filter((j) => j.type === 'haul').length;
  const atCapacity = activeHaulCount >= canAccept;

  const ordered = drops.some((d) => d.urgent)
    ? [...drops].sort((a, b) => (b.urgent ? 1 : 0) - (a.urgent ? 1 : 0))
    : drops;
  for (const drop of ordered) {
    if (atCapacity && !drop.urgent) continue;
    const exists = jobs.some((j) => j.type === 'haul' && j.droppedItemId === drop.id);
    if (!exists) {
      console.log(
        `[HAUL-SYNC] creating ${drop.urgent ? 'URGENT ' : ''}haul job for drop ${drop.id} (${drop.resourceId}×${drop.quantity})`
      );
      jobs.push({
        id: `haul-${drop.id}-t${gs.turn}`,
        type: 'haul',
        targetX: drop.x,
        targetY: drop.y,
        resourceId: drop.resourceId,
        droppedItemId: drop.id,
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

  const pawnId = job.claimedBy;
  if (pawnId) {
    const pawn = gs.pawns.find((p) => p.id === pawnId);
    const taken = pawn
      ? itemService.clampPickupQuantity(pawn, drop.resourceId, drop.quantity, gs, ENC_OVERLOAD_FULL)
      : drop.quantity;
    if (taken <= 0) return gs;

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

  const newDropped = (gs.droppedItems ?? []).filter((d) => d.id !== drop.id);
  console.warn(
    `[HAUL-COMPLETE] no claimedBy on haul job ${job.id} — dropping straight to stockpile`
  );

  const newStockpile = { ...(gs.stockpile ?? {}) };
  newStockpile[drop.resourceId] = (newStockpile[drop.resourceId] ?? 0) + drop.quantity;
  const baseState = { ...gs, droppedItems: newDropped, stockpile: newStockpile };
  return itemService.addItems({ [drop.resourceId]: drop.quantity }, baseState);
}
