/**
 * pawnHauling — the ADR-016 reserve-and-fetch deposit pipeline, extracted from pawnHelpers
 * (hotspot follow-up). Finds the deposit point, stages a fetched craft order's inputs ON its
 * station tile, and deposits a pawn's inventory into the nearest stockpile zone. Consumed by the
 * work-state handlers; depends only on core/services + goIdle, so the import graph stays acyclic.
 */
import type { GameState, Pawn, ItemInstance } from '../../core/types';
import {
  addToStockpileZone,
  absorbDropIfOnStockpileTile,
  aggregateFromDrops,
  storageTileKeys,
  tilePileCapacity,
  tileStoredPileCount
} from '../../core/GameState';
import { manhattan } from '../../core/distance';
import { occupancyService } from '../../services/OccupancyService';
import { itemService } from '../../services/ItemService';
import { storageAcceptsDrop, storageTileAcceptsDrop } from '../../services/jobs/haul';
import { zonePriorityRankAt } from '../../services/DesignationService';
import { ENC_OVERLOAD_FULL } from '../../core/needs';
import { gameLogger } from '../../dev/gameLogger';
import { rng } from '../../core/rng';
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

/**
 * Ticks a load set DOWN loose by `dropLooseAtPawn` (stockpile unreachable) is skipped by `haul.generate`
 * before it may be re-targeted. Without it the same unreachable pawn re-grabs the pile and drops it again
 * every tick — the floor-shuffle. Long enough to break the per-tick storm, short enough that the goods
 * resume hauling soon after a route opens. ~10 in-game seconds at 60 TPS.
 */
export const REHAUL_COOLDOWN_TICKS = 600;

/**
 * Pick up ground items at tile (x,y) into a pawn's inventory, clamped by its weight/volume carry
 * budget (belt/back containers raise it). Pure + worker-safe — used by the right-click "pick up"
 * context menu (a specific `dropId`) and the drafted "haul to stockpile" loop (every loose drop on
 * the tile). Items that don't fit stay on the ground for another trip.
 *
 * @param opts.dropId       restrict to one DroppedItem (the menu lists drops individually)
 * @param opts.resourceId   restrict to one resource id
 * @param opts.maxQty       cap the TOTAL units taken across matching drops (default: all that fit)
 * @param opts.looseOnly    ignore `stored` (stockpiled) drops — used by haul so it never re-grabs stock
 * @param opts.radius       Chebyshev radius around (x,y) to sweep (default 0 = the tile itself)
 * @param opts.capFactor    carry-budget multiplier (default 1; haul passes ENC_OVERLOAD_FULL to overfill)
 * @param opts.skipForbidden ignore player-forbidden drops (auto-haul respects the lock; right-click doesn't)
 * @param opts.skipCooling  ignore drops on a re-haul cooldown (auto-haul respects it; right-click doesn't)
 * @param opts.acceptTest   predicate gating which resourceIds may be taken (e.g. stockpileAcceptsDrop)
 *
 * Always lets the pawn take at least ONE unit (mirrors `itemService.clampPickupQuantity`'s floor) so
 * a single over-budget item is never un-pickable. Recomputes `stockpile` since a picked-up `stored`
 * drop reduces colony stock.
 */
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
  let tookAny = false;

  for (const d of cands) {
    if (remCap <= 0) break;
    const def = itemService.getItemById(d.resourceId);
    const perW = def?.weightKg ?? 0.1;
    const perV = def?.volumeL ?? 0.2;
    const byW = perW > 0 ? Math.floor(remW / perW) : d.quantity;
    const byV = perV > 0 ? Math.floor(remV / perV) : d.quantity;
    let take = Math.min(d.quantity, byW, byV, remCap);
    // Floor of one: never let capacity block picking up a single (possibly heavy) unit.
    if (take <= 0 && !tookAny && remCap >= 1) take = 1;
    if (take <= 0) continue;
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
    return { ...p, inventory: { ...inv, items } };
  });
  const after = pawns.find((p) => p.id === pawnId)?.inventory?.items ?? {};
  // ITEM-DBG: a pickup happened — log which drop ids were consumed, what was gained, and the pawn's
  // inventory BEFORE and AFTER so we can confirm the item physically entered the worker's inventory.
  gameLogger.log(
    gs.turn,
    'ITEM-DBG',
    `pickUpFromTile: ${pawn.name} gained ${JSON.stringify(gained)} ` +
      `removed=[${[...removeIds].join(',')}] reduced=[${[...reduceQty].map(([id, q]) => `${id}→${q}`).join(',')}] ` +
      `inv ${JSON.stringify(beforeItems)} → ${JSON.stringify(after)}`
  );
  return { ...gs, droppedItems, pawns, stockpile: aggregateFromDrops(droppedItems) };
}

/**
 * Opportunistic hauling: when a pawn finishes a job standing next to loose goods (e.g. a woodcutter
 * on the tile it just felled), it grabs the stockpile-bound drops on its tile + the 8 neighbours and
 * carries them off (overfilling to the encumbrance ceiling) instead of leaving them for a separate
 * later haul trip. No-op (returns the state unchanged) when there's no stockpile to deliver to or
 * nothing qualifying within reach — the caller checks whether the pawn ended up carrying anything.
 * Cheap: bails before the pickup scan if no stockpile zone exists.
 */
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

/** Storage building types that accept deposited resources. */
export const DEPOSIT_TYPES = [
  'storage_rack',
  'campfire',
  'lean_to_shelter',
  'woodland_shelter',
  'stone_hut',
  'sleeping_spot',
  'hay_bed'
];

/**
 * Find where a hauling pawn should walk to deposit its load. Priority: stockpile zones →
 * designated storage buildings → any complete building.
 *
 * PT-1 fix: within each tier we return the nearest **standable** tile (walkable terrain, not
 * occupied by another body) — for a stockpile that's the zone tile itself (the pawn stands on
 * it), for a building it's a free tile adjacent to it (you can't stand on the building). The old
 * code returned the nearest tile by Manhattan distance regardless of whether the pawn could
 * actually stand there, so the path ended 1–2 tiles short on a blocked/occupied tile and the
 * pawn "deposited in place" every run — a visible stutter. If nothing in the chosen tier is
 * standable we fall back to the nearest tile anyway (deposit-in-place beats stranding the goods).
 * Returns null only when there's nowhere at all (depositInventory then credits the general zone).
 */
export function findNearestDepositPoint(
  pawn: Pawn,
  gs: GameState
): { x: number; y: number } | null {
  if (!pawn.position) return null;
  const { x: px, y: py } = pawn.position;
  const distHere = (x: number, y: number) => manhattan(x, y, px, py);
  const standable = (x: number, y: number) =>
    !!gs.worldMap?.[y]?.[x]?.walkable && !occupancyService.isBlocked(gs, x, y, pawn.id);

  // ── Tier 1: stockpile zones + storage bins. Walk to the highest-PRIORITY zone that still has room,
  // nearest tile within it; only spill to a lower-priority zone once the higher ones are full (zone
  // fill-priority — the player's low/normal/preferred/urgent setting). `hasRoom` is item-agnostic here
  // (free pile slot); the exact per-item placement is re-checked in depositInventory. ──
  type Cand = { x: number; y: number; dist: number; prio: number; room: boolean };
  let best: Cand | null = null;
  let nearestAny: { x: number; y: number; dist: number } | null = null;
  // Higher priority wins; among equal priority prefer a tile with room; then nearest.
  const better = (a: Cand, b: Cand | null): boolean => {
    if (!b) return true;
    if (a.room !== b.room && a.prio === b.prio) return a.room; // same zone-prio → room breaks ties
    if (a.room !== b.room) {
      // A roomy lower-prio tile still loses to a roomy higher-prio one; a full higher-prio tile loses
      // to a roomy lower-prio one (don't strand goods at a full preferred zone).
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
  if (nearestAny) return { x: nearestAny.x, y: nearestAny.y }; // occupied stockpile — deposit in place

  // ── Tier 2 + 3: storage buildings, then any complete building — stand ADJACENT. ──
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

/**
 * ADR-016: destination tile for a reservation owner — a craft order's chosen workstation, or
 * (when the owner is a building under construction) the build site itself. Null if it's gone.
 */
export function orderStationTile(ownerId: string, gs: GameState): { x: number; y: number } | null {
  const order = (gs.craftingQueue ?? []).find((o) => o.id === ownerId);
  if (order) {
    if (!order.stationBuildingId) return null;
    const b = (gs.buildings ?? []).find(
      (b) => b.id === order.stationBuildingId && b.status === 'complete'
    );
    return b ? { x: b.x, y: b.y } : null;
  }
  // Building-material owner: stage at the build site (any not-yet-complete building).
  const bld = (gs.buildings ?? []).find((b) => b.id === ownerId);
  return bld ? { x: bld.x, y: bld.y } : null;
}

/**
 * ADR-016: stage everything the pawn is carrying for a craft order as `stored reservedFor` drops
 * ON the order's station tile (merging with any input stack already staged there), clear the
 * pawn's inventory + carry marker, and idle. Once every input is staged the craft job opens
 * (JobService._orderSupplied). Falls back to a normal stockpile deposit if the station vanished.
 */
export function stageInventoryAtStation(pawn: Pawn, orderId: string, gs: GameState): GameState {
  const station = orderStationTile(orderId, gs);
  const inv = pawn.inventory?.items ?? {};
  if (!station) {
    // Order/station gone — don't strand the goods: clear the marker and deposit normally.
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
    if (idx >= 0) {
      drops[idx] = { ...drops[idx], quantity: drops[idx].quantity + qty };
    } else {
      drops.push({
        id: `staged-${orderId.slice(-6)}-${resourceId}-${station.x}-${station.y}`,
        resourceId,
        x: station.x,
        y: station.y,
        quantity: qty,
        stored: true,
        reservedFor: orderId
      });
    }
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
              items: {}
            }
          }
        : p
    )
  };
  return next;
}

/**
 * Set a carried load DOWN on the pawn's own tile as LOOSE drops (re-haulable), keeping pinned bulk
 * goods and non-depositable instances (tools, a carried colonist) in hand. Used when a pawn must
 * release its load but is NOT physically at a stockpile — so the goods stay real objects in the world
 * instead of teleporting into a pile the pawn never reached (the ethereal-stockpile bug). The dropped
 * stacks get a fresh haul job like any other loose drop once a reachable stockpile exists.
 */
function dropLooseAtPawn(
  pawn: Pawn,
  gs: GameState,
  inv: Record<string, number>,
  carriedInstances: ItemInstance[],
  pinned: Set<string>
): GameState {
  const px = pawn.position?.x ?? 0;
  const py = pawn.position?.y ?? 0;
  // Cool the set-down stack so haul.generate doesn't re-target it next tick (the floor-shuffle loop):
  // the pawn that just failed to reach a stockpile from this tile can't reach it next tick either.
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
  // Identity instances (named carcasses) drop as their own loose named stacks; tools / carried pawns stay.
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

/** Transfer everything in pawn.inventory into the correct stockpile zone. */
export function depositInventory(pawn: Pawn, gs: GameState): GameState {
  // ADR-016: a pawn carrying fetched inputs stages them ON its order's station, not the stockpile.
  if (pawn.carryingForOrder) {
    return stageInventoryAtStation(pawn, pawn.carryingForOrder, gs);
  }
  const inv = pawn.inventory?.items ?? {};
  // Identity-tracked carried items (dynamicName instances, e.g. carcasses) are deposited too — so a
  // pawn hauling ONLY a carcass (empty `items` map) must not short-circuit to idle.
  const carriedInstances = pawn.inventory?.instances ?? [];
  const hasDepositableInstance = carriedInstances.some(
    (i) => !isCarriedPawnInstance(i) && itemService.getItemById(i.itemId)?.dynamicName
  );
  if (Object.keys(inv).length === 0 && !hasDepositableInstance) return goIdle(pawn, gs);

  // Pinned items are never deposited — the pawn keeps carrying them (player request). Deposit
  // everything else; the pinned subset is written back into the pawn's inventory below.
  const pinned = new Set(pawn.pinnedItems ?? []);

  // Collect all stockpile tile coordinates, ordered NEAREST-FIRST to the pawn so items land
  // where the pawn actually dropped them (its current tile / the one it walked to), not on
  // whatever tile happens to come first in designation-iteration order (the old "top row" bug).
  const px = pawn.position?.x ?? 0;
  const py = pawn.position?.y ?? 0;
  const distToPawn = (x: number, y: number) => manhattan(x, y, px, py);
  // Zone fill-priority: higher-priority stockpile tiles are tried first (firstTileFor picks the first
  // accepting tile with a free slot), so a roomy preferred zone fills before a normal/low one; distance
  // breaks ties within a priority. Falls back to pure distance when all zones share the default.
  const stockpileTiles = storageTileKeys(gs)
    .map((key) => {
      const [x, y] = key.split(',').map(Number);
      return { key, x, y, cap: tilePileCapacity(gs, x, y), prio: zonePriorityRankAt(gs, x, y) };
    })
    .sort((a, b) => b.prio - a.prio || distToPawn(a.x, a.y) - distToPawn(b.x, b.y));
  const stockpileTileKeys = new Set(stockpileTiles.map((t) => t.key));
  // Distinct stored piles already on each storage tile — incremented as we lay new piles below so a
  // dense bin (capacity > 1) accepts several stacks while a plain tile fills after one.
  const pileCount = new Map<string, number>();
  for (const d of gs.droppedItems ?? [])
    if (d.stored && stockpileTileKeys.has(`${d.x},${d.y}`))
      pileCount.set(`${d.x},${d.y}`, (pileCount.get(`${d.x},${d.y}`) ?? 0) + 1);
  // Nearest storage tile that has a free pile slot AND whose store accepts this resource (a specialized
  // bin only takes its category; a general store/zone takes anything). Used for both the counted items
  // and the named instances below so neither lands in a bin that would reject it.
  const firstTileFor = (resourceId: string) =>
    stockpileTiles.find(
      (t) => (pileCount.get(t.key) ?? 0) < t.cap && storageTileAcceptsDrop(gs, t.x, t.y, resourceId)
    );

  // THE STOCKPILE IS PHYSICAL — a pawn may only deposit into a stockpile it is standing ON or directly
  // ADJACENT to (Chebyshev ≤ 1). Crediting the globally-NEAREST stockpile tile from a distance was the
  // "ethereal stockpile" bug: a pawn picked an item up and the goods teleported into the pile with no
  // visible carry. When a stockpile zone EXISTS but the pawn hasn't physically reached it, we DON'T
  // touch the stockpile — the carried load is set down LOOSE on the pawn's own tile (a real, re-haulable
  // object) so it stays in the world and gets hauled properly. The no-zone early-game path falls through.
  const atStockpile =
    stockpileTiles.length > 0 &&
    stockpileTiles.some((t) => Math.max(Math.abs(t.x - px), Math.abs(t.y - py)) <= 1);
  if (stockpileTiles.length > 0 && !atStockpile) {
    return dropLooseAtPawn(pawn, gs, inv, carriedInstances, pinned);
  }

  const newDropped = [...(gs.droppedItems ?? [])];
  // Track IDs of newly created unstored drops so we can trigger absorption below.
  const newDropIds: string[] = [];
  // Track which items landed on a physical tile (for fallback accounting).
  const placed = new Set<string>();

  for (const [resourceId, qty] of Object.entries(inv)) {
    if (qty <= 0) continue;
    if (pinned.has(resourceId)) continue; // keep pinned items — never deposited

    // Existing pile of this resource — highest zone-priority first, then nearest (stacking avoids a
    // new slot); and the best free accepting tile (stockpileTiles is priority-then-distance sorted).
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
    // Zone fill-priority: top up the existing pile UNLESS a free tile sits in a strictly HIGHER-priority
    // zone — then start a fresh pile there so the preferred zone fills first. Equal priority prefers the
    // existing pile (no new slot consumed).
    const exPrio = existingStoredDrop
      ? zonePriorityRankAt(gs, existingStoredDrop.x, existingStoredDrop.y)
      : -1;
    const freePrio = freeTile ? zonePriorityRankAt(gs, freeTile.x, freeTile.y) : -1;
    let tile: { x: number; y: number } | null = null;
    if (existingStoredDrop && exPrio >= freePrio) {
      tile = { x: existingStoredDrop.x, y: existingStoredDrop.y };
    } else if (freeTile) {
      tile = { x: freeTile.x, y: freeTile.y };
      pileCount.set(freeTile.key, (pileCount.get(freeTile.key) ?? 0) + 1); // claim the slot
    } else if (existingStoredDrop) {
      tile = { x: existingStoredDrop.x, y: existingStoredDrop.y };
    }

    if (tile) {
      // Create an UNSTORED drop at the tile — the absorption trigger below
      // will detect it, mark it stored, and credit the zone.
      const id = `deposit-${resourceId}-t${gs.turn}-${rng.random().toString(36).slice(2, 5)}`;
      newDropIds.push(id);
      newDropped.push({ id, resourceId, x: tile.x, y: tile.y, quantity: qty, stored: false });
      placed.add(resourceId);
    }
  }

  // Identity-tracked instances (dynamicName, e.g. named carcasses) are laid into the stockpile as
  // individual, NON-stacking stored drops so each keeps its per-pawn name. Ordinary tracked items
  // (tools/weapons the pawn keeps) stay in hand. A carcass with nowhere to go also stays in hand.
  // Reuses the same `pileCount`/`firstTileWithRoom` slot accounting so each named pile takes one slot.
  const keptInstances: ItemInstance[] = [];
  for (const instance of carriedInstances) {
    // A carried colonist is a LIVE pawn riding in the pack — never lay a person into a stockpile.
    // It's set down as a restored pawn by the rescue order / reconcile, not deposited (pawn/carry.ts).
    if (isCarriedPawnInstance(instance)) {
      keptInstances.push(instance);
      continue;
    }
    if (!itemService.getItemById(instance.itemId)?.dynamicName) {
      keptInstances.push(instance);
      continue;
    }
    const freeTile = firstTileFor(instance.itemId);
    if (!freeTile) {
      keptInstances.push(instance); // no room / no accepting store — keep carrying it
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
            // Keep pinned items in hand; everything else was just deposited.
            items: Object.fromEntries(
              Object.entries(inv).filter(([rid, qty]) => pinned.has(rid) && qty > 0)
            ),
            instances: keptInstances
          }
        }
      : p
  );

  gameLogger.log(gs.turn, 'JOB-EVT', `${pawn.name} deposited inventory: ${JSON.stringify(inv)}`);
  // ITEM-DBG: deposit — the pawn's position (must be ON/ADJACENT to the stockpile now), what left its
  // hands, and the NEW stored-drop ids on the stockpile tiles. If `pos` is ever >1 tile from every
  // stored drop id below, the adjacency gate leaked (it shouldn't — non-adjacent deposits drop loose).
  gameLogger.log(
    gs.turn,
    'ITEM-DBG',
    `depositInventory: ${pawn.name} @ (${px},${py}) laid down ${JSON.stringify(inv)} → new drop ids [${newDropIds.join(',')}] ` +
      `(pinned kept: ${JSON.stringify(Object.fromEntries(Object.entries(inv).filter(([rid]) => pinned.has(rid))))})`
  );

  // Trigger-based absorption: each new drop sitting on a stockpile tile is absorbed
  // immediately — marked stored and credited to the zone — without a separate scan.
  let state: GameState = { ...gs, pawns: newPawns, droppedItems: newDropped };
  for (const id of newDropIds) {
    state = absorbDropIfOnStockpileTile(state, id);
  }

  // Fallback for items that had no available tile (rare): credit directly to the general zone.
  const unplaced: Record<string, number> = {};
  for (const [resourceId, qty] of Object.entries(inv)) {
    if (qty > 0 && !placed.has(resourceId)) unplaced[resourceId] = qty;
  }
  if (Object.keys(unplaced).length > 0) {
    state = addToStockpileZone(state, null, unplaced);
  }

  return state;
}
