import type { GameState, Pawn, ItemInstance } from '../../core/types';
import {
  addToStockpileZone,
  absorbDropIfOnStockpileTile,
  withDrops,
  storageTileKeys,
  tilePileCapacity,
  tileStoredPileCount
} from '../../core/state/stockpile';
import { usedWeightKg } from '../../core/rules/gear/vessels';
import { manhattan } from '../../core/util/distance';
import { occupancyService } from '../../services/OccupancyService';
import { itemService } from '../../services/ItemService';
import { storageAcceptsDrop, storageTileAcceptsDrop } from '../../services/jobs/haul';
import { zonePriorityRankAt } from '../../services/DesignationService';
import { ENC_OVERLOAD_FULL } from '../../core/rules/body/conditions';
import { gameLogger } from '../../debug/gameLogger';
import { rng } from '../../core/util/rng';
import { mergeConditions } from '../../core/rules/world/carcassCondition';
import { PAWN_STATE } from './pawnStates';
import { goIdle } from './pawnHelpers';
import { isCarriedPawnInstance } from './carry';

const EMPTY_INVENTORY = {
  items: {},
  instances: [],
  weightKg: 0,
  maxWeightKg: 20,
  volumeL: 0,
  maxVolumeL: 20
} as const;

export const REHAUL_COOLDOWN_TICKS = 600;

export function pickUpFromTile(
  gs: GameState,
  pawnId: string,
  x: number,
  y: number,
  opts: {
    dropId?: string;
    resourceId?: string;
    maxQty?: number;
    looseOnly?: boolean;
    radius?: number;
    capFactor?: number;
    skipForbidden?: boolean;
    skipCooling?: boolean;
    acceptTest?: (resourceId: string) => boolean;
  } = {}
): GameState {
  const pawn = gs.pawns.find((p) => p.id === pawnId);
  if (!pawn) return gs;
  const radius = opts.radius ?? 0;
  const cands = (gs.droppedItems ?? []).filter(
    (d) =>
      Math.abs(d.x - x) <= radius &&
      Math.abs(d.y - y) <= radius &&
      d.quantity > 0 &&
      !d.reservedFor &&
      (!opts.looseOnly || !d.stored) &&
      (!opts.skipForbidden || !d.forbidden) &&
      (!opts.skipCooling || !(d.rehaulCooldownUntil != null && d.rehaulCooldownUntil > gs.turn)) &&
      (!opts.dropId || d.id === opts.dropId) &&
      (!opts.resourceId || d.resourceId === opts.resourceId) &&
      (!opts.acceptTest || opts.acceptTest(d.resourceId))
  );
  if (cands.length === 0) return gs;

  const capFactor = opts.capFactor ?? 1;
  const budget = itemService.getCarryBudget(pawn, gs);
  const load = itemService.getCurrentCarryLoad(pawn, gs);
  let remW = budget.maxWeightKg * capFactor - load.weightKg;
  let remV = budget.maxVolumeL * capFactor - load.volumeL;
  let remCap = opts.maxQty ?? Infinity;

  const reduceQty = new Map<string, number>();
  const removeIds = new Set<string>();
  const gained: Record<string, number> = {};
  const takenInstances: ItemInstance[] = [];
  let tookAny = false;

  for (const d of cands) {
    if (remCap <= 0) break;
    const def = itemService.getItemById(d.resourceId);
    const perW = def?.weightKg ?? 0.1;
    const perV = def?.volumeL ?? 0.2;
    const byW = perW > 0 ? Math.floor(remW / perW) : d.quantity;
    const byV = perV > 0 ? Math.floor(remV / perV) : d.quantity;
    let take = Math.min(d.quantity, byW, byV, remCap);
    if (take <= 0 && !tookAny && remCap >= 1) take = 1;
    if (take <= 0) continue;
    if (d.instance) {
      if (take < d.quantity) continue;
      tookAny = true;
      takenInstances.push(d.instance);
      remW -= usedWeightKg(d.instance) + take * perW;
      remV -= take * perV;
      remCap -= take;
      removeIds.add(d.id);
      continue;
    }
    tookAny = true;
    gained[d.resourceId] = (gained[d.resourceId] ?? 0) + take;
    remW -= take * perW;
    remV -= take * perV;
    remCap -= take;
    const rem = d.quantity - take;
    if (rem > 0) reduceQty.set(d.id, rem);
    else removeIds.add(d.id);
  }

  if (!tookAny) {
    gameLogger.log(
      gs.turn,
      'ITEM-DBG',
      `pickUpFromTile: ${pawn.name} took NOTHING at (${x},${y}) r${radius} ` +
        `(cands=${cands.map((c) => `${c.id}:${c.resourceId}×${c.quantity}`).join(',')})`
    );
    return gs;
  }

  const droppedItems = (gs.droppedItems ?? [])
    .filter((d) => !removeIds.has(d.id))
    .map((d) => (reduceQty.has(d.id) ? { ...d, quantity: reduceQty.get(d.id)! } : d));
  const beforeItems = pawn.inventory?.items ?? {};
  const pawns = gs.pawns.map((p) => {
    if (p.id !== pawnId) return p;
    const inv = p.inventory ?? { ...EMPTY_INVENTORY };
    const items = { ...inv.items };
    for (const [rid, q] of Object.entries(gained)) items[rid] = (items[rid] ?? 0) + q;
    const instances = takenInstances.length
      ? [...(inv.instances ?? []), ...takenInstances]
      : inv.instances;
    return { ...p, inventory: { ...inv, items, instances } };
  });
  const after = pawns.find((p) => p.id === pawnId)?.inventory?.items ?? {};
  gameLogger.log(
    gs.turn,
    'ITEM-DBG',
    `pickUpFromTile: ${pawn.name} gained ${JSON.stringify(gained)} ` +
      `removed=[${[...removeIds].join(',')}] reduced=[${[...reduceQty].map(([id, q]) => `${id}→${q}`).join(',')}] ` +
      `inv ${JSON.stringify(beforeItems)} → ${JSON.stringify(after)}`
  );
  return { ...withDrops(gs, droppedItems), pawns };
}

export function opportunisticHaulPickup(gs: GameState, pawnId: string): GameState {
  if (storageTileKeys(gs).length === 0) return gs;
  const pawn = gs.pawns.find((p) => p.id === pawnId);
  if (!pawn?.position) return gs;
  return pickUpFromTile(gs, pawnId, pawn.position.x, pawn.position.y, {
    radius: 1,
    looseOnly: true,
    skipForbidden: true,
    skipCooling: true,
    capFactor: ENC_OVERLOAD_FULL,
    acceptTest: (rid) => storageAcceptsDrop(gs, rid)
  });
}

const NEIGHBORS8: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1]
];

export const DEPOSIT_TYPES = [
  'storage_rack',
  'campfire',
  'lean_to_shelter',
  'woodland_shelter',
  'stone_hut',
  'sleeping_spot',
  'hay_bed'
];

export function findNearestDepositPoint(
  pawn: Pawn,
  gs: GameState
): { x: number; y: number } | null {
  if (!pawn.position) return null;
  const { x: px, y: py } = pawn.position;
  const distHere = (x: number, y: number) => manhattan(x, y, px, py);
  const standable = (x: number, y: number) =>
    !!gs.worldMap?.[y]?.[x]?.walkable && !occupancyService.isBlocked(gs, x, y, pawn.id);

  type Cand = { x: number; y: number; dist: number; prio: number; room: boolean };
  let best: Cand | null = null;
  let nearestAny: { x: number; y: number; dist: number } | null = null;
  const better = (a: Cand, b: Cand | null): boolean => {
    if (!b) return true;
    if (a.room !== b.room && a.prio === b.prio) return a.room;
    if (a.room !== b.room) {
      if (a.room && !b.room) return true;
      if (!a.room && b.room) return false;
    }
    if (a.prio !== b.prio) return a.prio > b.prio;
    return a.dist < b.dist;
  };
  for (const key of storageTileKeys(gs)) {
    const [x, y] = key.split(',').map(Number);
    const d = distHere(x, y);
    if (!nearestAny || d < nearestAny.dist) nearestAny = { x, y, dist: d };
    if (!standable(x, y)) continue;
    const cand: Cand = {
      x,
      y,
      dist: d,
      prio: zonePriorityRankAt(gs, x, y),
      room: tileStoredPileCount(gs, x, y) < tilePileCapacity(gs, x, y)
    };
    if (better(cand, best)) best = cand;
  }
  if (best) return { x: best.x, y: best.y };
  if (nearestAny) return { x: nearestAny.x, y: nearestAny.y };

  const approach = (buildings: typeof gs.buildings) => {
    let best: { x: number; y: number; dist: number } | null = null;
    for (const b of buildings ?? []) {
      if (b.status !== 'complete') continue;
      for (const [dx, dy] of NEIGHBORS8) {
        const x = b.x + dx;
        const y = b.y + dy;
        if (!standable(x, y)) continue;
        const d = distHere(x, y);
        if (!best || d < best.dist) best = { x, y, dist: d };
      }
    }
    return best ? { x: best.x, y: best.y } : null;
  };

  const storage = approach((gs.buildings ?? []).filter((b) => DEPOSIT_TYPES.includes(b.type)));
  if (storage) return storage;
  return approach(gs.buildings);
}

export function orderStationTile(ownerId: string, gs: GameState): { x: number; y: number } | null {
  const order = (gs.craftingQueue ?? []).find((o) => o.id === ownerId);
  if (order) {
    if (!order.stationBuildingId) return null;
    const b = (gs.buildings ?? []).find(
      (b) => b.id === order.stationBuildingId && b.status === 'complete'
    );
    return b ? { x: b.x, y: b.y } : null;
  }
  const bld = (gs.buildings ?? []).find((b) => b.id === ownerId);
  return bld ? { x: bld.x, y: bld.y } : null;
}

function orderInputs(ownerId: string, gs: GameState): Record<string, number> {
  return (gs.craftingQueue ?? []).find((o) => o.id === ownerId)?.inputs ?? {};
}

export function stageInventoryAtStation(pawn: Pawn, orderId: string, gs: GameState): GameState {
  const station = orderStationTile(orderId, gs);
  const inv = pawn.inventory?.items ?? {};
  if (!station) {
    const cleared = {
      ...gs,
      pawns: gs.pawns.map((p) => (p.id === pawn.id ? { ...p, carryingForOrder: undefined } : p))
    };
    const self = cleared.pawns.find((p) => p.id === pawn.id)!;
    return depositInventory(self, cleared);
  }

  const drops = [...(gs.droppedItems ?? [])];
  for (const [resourceId, qty] of Object.entries(inv)) {
    if (qty <= 0) continue;
    const idx = drops.findIndex(
      (d) =>
        d.stored &&
        d.reservedFor === orderId &&
        d.resourceId === resourceId &&
        d.x === station.x &&
        d.y === station.y
    );
    const carried = pawn.carriedUnitConditions?.[resourceId];
    const conds = carried?.slice(0, qty);
    if (idx >= 0) {
      drops[idx] = {
        ...drops[idx],
        quantity: drops[idx].quantity + qty,
        ...(conds || drops[idx].unitConditions
          ? {
              unitConditions: mergeConditions(
                drops[idx].unitConditions,
                drops[idx].quantity,
                conds,
                qty
              )
            }
          : {})
      };
    } else {
      drops.push({
        id: `staged-${orderId.slice(-6)}-${resourceId}-${station.x}-${station.y}`,
        resourceId,
        x: station.x,
        y: station.y,
        quantity: qty,
        stored: true,
        reservedFor: orderId,
        ...(conds ? { unitConditions: conds } : {})
      });
    }
  }

  const wantedHere = new Set(Object.keys(orderInputs(orderId, gs)));
  const stagedVesselIds = new Set<string>();
  for (const inst of pawn.inventory?.instances ?? []) {
    if (!inst.contents?.length && !wantedHere.has(inst.itemId)) continue;
    stagedVesselIds.add(inst.instanceId);
    drops.push({
      id: `staged-${orderId.slice(-6)}-${inst.instanceId}-${station.x}-${station.y}`,
      resourceId: inst.itemId,
      x: station.x,
      y: station.y,
      quantity: 1,
      stored: true,
      reservedFor: orderId,
      instance: inst
    });
  }

  gameLogger.log(gs.turn, 'JOB-EVT', `${pawn.name} staged inputs at station for order ${orderId}`);
  const next: GameState = {
    ...gs,
    droppedItems: drops,
    pawns: gs.pawns.map((p) =>
      p.id === pawn.id
        ? {
            ...p,
            carryingForOrder: undefined,
            carriedUnitConditions: undefined,
            currentState: PAWN_STATE.IDLE,
            activeJob: undefined,
            inventory: {
              ...(p.inventory ?? {
                items: {},
                instances: [],
                weightKg: 0,
                maxWeightKg: 20,
                volumeL: 0,
                maxVolumeL: 20
              }),
              items: {},
              instances: (p.inventory?.instances ?? []).filter(
                (i) => !stagedVesselIds.has(i.instanceId)
              )
            }
          }
        : p
    )
  };
  return next;
}

function dropLooseAtPawn(
  pawn: Pawn,
  gs: GameState,
  inv: Record<string, number>,
  carriedInstances: ItemInstance[],
  pinned: Set<string>
): GameState {
  const px = pawn.position?.x ?? 0;
  const py = pawn.position?.y ?? 0;
  const rehaulCooldownUntil = gs.turn + REHAUL_COOLDOWN_TICKS;
  const newDropped = [...(gs.droppedItems ?? [])];
  for (const [resourceId, qty] of Object.entries(inv)) {
    if (qty <= 0 || pinned.has(resourceId)) continue;
    newDropped.push({
      id: `loose-${resourceId}-${px}-${py}-t${gs.turn}-${rng.random().toString(36).slice(2, 5)}`,
      resourceId,
      x: px,
      y: py,
      quantity: qty,
      stored: false,
      rehaulCooldownUntil
    });
  }
  const keptInstances: ItemInstance[] = [];
  for (const instance of carriedInstances) {
    if (isCarriedPawnInstance(instance) || !itemService.getItemById(instance.itemId)?.dynamicName) {
      keptInstances.push(instance);
      continue;
    }
    newDropped.push({
      id: `loose-${instance.instanceId}`,
      resourceId: instance.itemId,
      x: px,
      y: py,
      quantity: 1,
      name: instance.name,
      instance,
      stored: false,
      rehaulCooldownUntil
    });
  }
  gameLogger.log(
    gs.turn,
    'ITEM-DBG',
    `depositInventory: ${pawn.name} NOT at a stockpile (pos ${px},${py}) — set load DOWN loose ${JSON.stringify(inv)} (no teleport)`
  );
  return {
    ...gs,
    droppedItems: newDropped,
    pawns: gs.pawns.map((p) =>
      p.id === pawn.id
        ? {
            ...p,
            currentState: PAWN_STATE.IDLE,
            activeJob: undefined,
            inventory: {
              ...(p.inventory ?? { ...EMPTY_INVENTORY }),
              items: Object.fromEntries(
                Object.entries(inv).filter(([rid, q]) => pinned.has(rid) && q > 0)
              ),
              instances: keptInstances
            }
          }
        : p
    )
  };
}

export function depositInventory(pawn: Pawn, gs: GameState): GameState {
  if (pawn.carryingForOrder) {
    return stageInventoryAtStation(pawn, pawn.carryingForOrder, gs);
  }
  const inv = pawn.inventory?.items ?? {};
  const carriedInstances = pawn.inventory?.instances ?? [];
  const hasDepositableInstance = carriedInstances.some(
    (i) =>
      !isCarriedPawnInstance(i) &&
      (itemService.getItemById(i.itemId)?.dynamicName || !!i.contents?.length)
  );
  if (Object.keys(inv).length === 0 && !hasDepositableInstance) return goIdle(pawn, gs);

  const pinned = new Set(pawn.pinnedItems ?? []);

  const px = pawn.position?.x ?? 0;
  const py = pawn.position?.y ?? 0;
  const distToPawn = (x: number, y: number) => manhattan(x, y, px, py);
  const stockpileTiles = storageTileKeys(gs)
    .map((key) => {
      const [x, y] = key.split(',').map(Number);
      return { key, x, y, cap: tilePileCapacity(gs, x, y), prio: zonePriorityRankAt(gs, x, y) };
    })
    .sort((a, b) => b.prio - a.prio || distToPawn(a.x, a.y) - distToPawn(b.x, b.y));
  const stockpileTileKeys = new Set(stockpileTiles.map((t) => t.key));
  const pileCount = new Map<string, number>();
  for (const d of gs.droppedItems ?? [])
    if (d.stored && stockpileTileKeys.has(`${d.x},${d.y}`))
      pileCount.set(`${d.x},${d.y}`, (pileCount.get(`${d.x},${d.y}`) ?? 0) + 1);
  const firstTileFor = (resourceId: string) =>
    stockpileTiles.find(
      (t) => (pileCount.get(t.key) ?? 0) < t.cap && storageTileAcceptsDrop(gs, t.x, t.y, resourceId)
    );

  const atStockpile =
    stockpileTiles.length > 0 &&
    stockpileTiles.some((t) => Math.max(Math.abs(t.x - px), Math.abs(t.y - py)) <= 1);
  if (stockpileTiles.length > 0 && !atStockpile) {
    return dropLooseAtPawn(pawn, gs, inv, carriedInstances, pinned);
  }

  const newDropped = [...(gs.droppedItems ?? [])];
  const newDropIds: string[] = [];
  const placed = new Set<string>();

  for (const [resourceId, qty] of Object.entries(inv)) {
    if (qty <= 0) continue;
    if (pinned.has(resourceId)) continue;

    const existingStoredDrop = newDropped
      .filter(
        (d) => d.stored && d.resourceId === resourceId && stockpileTileKeys.has(`${d.x},${d.y}`)
      )
      .sort(
        (a, b) =>
          zonePriorityRankAt(gs, b.x, b.y) - zonePriorityRankAt(gs, a.x, a.y) ||
          distToPawn(a.x, a.y) - distToPawn(b.x, b.y)
      )[0];
    const freeTile = firstTileFor(resourceId);
    const exPrio = existingStoredDrop
      ? zonePriorityRankAt(gs, existingStoredDrop.x, existingStoredDrop.y)
      : -1;
    const freePrio = freeTile ? zonePriorityRankAt(gs, freeTile.x, freeTile.y) : -1;
    let tile: { x: number; y: number } | null = null;
    if (existingStoredDrop && exPrio >= freePrio) {
      tile = { x: existingStoredDrop.x, y: existingStoredDrop.y };
    } else if (freeTile) {
      tile = { x: freeTile.x, y: freeTile.y };
      pileCount.set(freeTile.key, (pileCount.get(freeTile.key) ?? 0) + 1);
    } else if (existingStoredDrop) {
      tile = { x: existingStoredDrop.x, y: existingStoredDrop.y };
    }

    if (tile) {
      const id = `deposit-${resourceId}-t${gs.turn}-${rng.random().toString(36).slice(2, 5)}`;
      newDropIds.push(id);
      newDropped.push({ id, resourceId, x: tile.x, y: tile.y, quantity: qty, stored: false });
      placed.add(resourceId);
    }
  }

  const keptInstances: ItemInstance[] = [];
  for (const instance of carriedInstances) {
    if (isCarriedPawnInstance(instance)) {
      keptInstances.push(instance);
      continue;
    }
    const depositable =
      itemService.getItemById(instance.itemId)?.dynamicName || !!instance.contents?.length;
    if (!depositable) {
      keptInstances.push(instance);
      continue;
    }
    const freeTile = firstTileFor(instance.itemId);
    if (!freeTile) {
      keptInstances.push(instance);
      continue;
    }
    pileCount.set(freeTile.key, (pileCount.get(freeTile.key) ?? 0) + 1);
    const id = `stored-${instance.instanceId}`;
    newDropIds.push(id);
    newDropped.push({
      id,
      resourceId: instance.itemId,
      x: freeTile.x,
      y: freeTile.y,
      quantity: 1,
      name: instance.name,
      instance,
      stored: false
    });
  }

  const newPawns = gs.pawns.map((p) =>
    p.id === pawn.id
      ? {
          ...p,
          currentState: PAWN_STATE.IDLE,
          activeJob: undefined,
          inventory: {
            ...(p.inventory ?? {
              items: {},
              instances: [],
              weightKg: 0,
              maxWeightKg: 20,
              volumeL: 0,
              maxVolumeL: 20
            }),
            items: Object.fromEntries(
              Object.entries(inv).filter(([rid, qty]) => pinned.has(rid) && qty > 0)
            ),
            instances: keptInstances
          }
        }
      : p
  );

  gameLogger.log(gs.turn, 'JOB-EVT', `${pawn.name} deposited inventory: ${JSON.stringify(inv)}`);
  gameLogger.log(
    gs.turn,
    'ITEM-DBG',
    `depositInventory: ${pawn.name} @ (${px},${py}) laid down ${JSON.stringify(inv)} → new drop ids [${newDropIds.join(',')}] ` +
      `(pinned kept: ${JSON.stringify(Object.fromEntries(Object.entries(inv).filter(([rid]) => pinned.has(rid))))})`
  );

  let state: GameState = { ...gs, pawns: newPawns, droppedItems: newDropped };
  for (const id of newDropIds) {
    state = absorbDropIfOnStockpileTile(state, id);
  }

  const unplaced: Record<string, number> = {};
  for (const [resourceId, qty] of Object.entries(inv)) {
    if (qty > 0 && !placed.has(resourceId)) unplaced[resourceId] = qty;
  }
  if (Object.keys(unplaced).length > 0) {
    state = addToStockpileZone(state, null, unplaced);
  }

  return state;
}
