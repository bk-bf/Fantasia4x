/**
 * pawnHauling — the ADR-016 reserve-and-fetch deposit pipeline, extracted from pawnHelpers
 * (hotspot follow-up). Finds the deposit point, stages a fetched craft order's inputs ON its
 * station tile, and deposits a pawn's inventory into the nearest stockpile zone. Consumed by the
 * work-state handlers; depends only on core/services + goIdle, so the import graph stays acyclic.
 */
import type { GameState, Pawn } from '../../core/types';
import {
  addToStockpileZone,
  absorbDropIfOnStockpileTile,
  aggregateFromDrops
} from '../../core/GameState';
import { occupancyService } from '../../services/OccupancyService';
import { zoneTileKeys } from '../../services/DesignationService';
import { itemService } from '../../services/ItemService';
import { gameLogger } from '../../dev/gameLogger';
import { rng } from '../../core/rng';
import { PAWN_STATE } from './pawnStates';
import { goIdle } from './pawnHelpers';

const EMPTY_INVENTORY = {
  items: {},
  instances: [],
  weightKg: 0,
  maxWeightKg: 20,
  volumeL: 0,
  maxVolumeL: 20
} as const;

/**
 * Pick up ground items at tile (x,y) into a pawn's inventory, clamped by its weight/volume carry
 * budget (belt/back containers raise it). Pure + worker-safe — used by the right-click "pick up"
 * context menu (a specific `dropId`) and the drafted "haul to stockpile" loop (every loose drop on
 * the tile). Items that don't fit stay on the ground for another trip.
 *
 * @param opts.dropId     restrict to one DroppedItem (the menu lists drops individually)
 * @param opts.resourceId restrict to one resource id
 * @param opts.maxQty     cap the TOTAL units taken across matching drops (default: all that fit)
 * @param opts.looseOnly  ignore `stored` (stockpiled) drops — used by haul so it never re-grabs stock
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
  opts: { dropId?: string; resourceId?: string; maxQty?: number; looseOnly?: boolean } = {}
): GameState {
  const pawn = gs.pawns.find((p) => p.id === pawnId);
  if (!pawn) return gs;
  const cands = (gs.droppedItems ?? []).filter(
    (d) =>
      d.x === x &&
      d.y === y &&
      d.quantity > 0 &&
      !d.reservedFor &&
      (!opts.looseOnly || !d.stored) &&
      (!opts.dropId || d.id === opts.dropId) &&
      (!opts.resourceId || d.resourceId === opts.resourceId)
  );
  if (cands.length === 0) return gs;

  const budget = itemService.getCarryBudget(pawn, gs);
  const load = itemService.getCurrentCarryLoad(pawn, gs);
  let remW = budget.maxWeightKg - load.weightKg;
  let remV = budget.maxVolumeL - load.volumeL;
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

  if (!tookAny) return gs;

  const droppedItems = (gs.droppedItems ?? [])
    .filter((d) => !removeIds.has(d.id))
    .map((d) => (reduceQty.has(d.id) ? { ...d, quantity: reduceQty.get(d.id)! } : d));
  const pawns = gs.pawns.map((p) => {
    if (p.id !== pawnId) return p;
    const inv = p.inventory ?? { ...EMPTY_INVENTORY };
    const items = { ...inv.items };
    for (const [rid, q] of Object.entries(gained)) items[rid] = (items[rid] ?? 0) + q;
    return { ...p, inventory: { ...inv, items } };
  });
  return { ...gs, droppedItems, pawns, stockpile: aggregateFromDrops(droppedItems) };
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
  const dist = (x: number, y: number) => Math.abs(x - px) + Math.abs(y - py);
  const standable = (x: number, y: number) =>
    !!gs.worldMap?.[y]?.[x]?.walkable && !occupancyService.isBlocked(gs, x, y, pawn.id);

  // ── Tier 1: stockpile zones — stand ON the nearest standable zone tile. ──
  let bestStandable: { x: number; y: number; dist: number } | null = null;
  let nearestAny: { x: number; y: number; dist: number } | null = null;
  for (const key of zoneTileKeys(gs, 'stockpile')) {
    const [x, y] = key.split(',').map(Number);
    const d = dist(x, y);
    if (!nearestAny || d < nearestAny.dist) nearestAny = { x, y, dist: d };
    if (standable(x, y) && (!bestStandable || d < bestStandable.dist))
      bestStandable = { x, y, dist: d };
  }
  if (bestStandable) return { x: bestStandable.x, y: bestStandable.y };
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
        const d = dist(x, y);
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

/** Transfer everything in pawn.inventory into the correct stockpile zone. */
export function depositInventory(pawn: Pawn, gs: GameState): GameState {
  // ADR-016: a pawn carrying fetched inputs stages them ON its order's station, not the stockpile.
  if (pawn.carryingForOrder) {
    return stageInventoryAtStation(pawn, pawn.carryingForOrder, gs);
  }
  const inv = pawn.inventory?.items ?? {};
  if (Object.keys(inv).length === 0) return goIdle(pawn, gs);

  // Pinned items are never deposited — the pawn keeps carrying them (player request). Deposit
  // everything else; the pinned subset is written back into the pawn's inventory below.
  const pinned = new Set(pawn.pinnedItems ?? []);

  // Collect all stockpile tile coordinates, ordered NEAREST-FIRST to the pawn so items land
  // where the pawn actually dropped them (its current tile / the one it walked to), not on
  // whatever tile happens to come first in designation-iteration order (the old "top row" bug).
  const px = pawn.position?.x ?? 0;
  const py = pawn.position?.y ?? 0;
  const distToPawn = (x: number, y: number) => Math.abs(x - px) + Math.abs(y - py);
  const stockpileTiles = zoneTileKeys(gs, 'stockpile')
    .map((key) => {
      const [x, y] = key.split(',').map(Number);
      return { key, x, y };
    })
    .sort((a, b) => distToPawn(a.x, a.y) - distToPawn(b.x, b.y));
  const stockpileTileKeys = new Set(stockpileTiles.map((t) => t.key));

  const newDropped = [...(gs.droppedItems ?? [])];
  // Track IDs of newly created unstored drops so we can trigger absorption below.
  const newDropIds: string[] = [];
  // Track which items landed on a physical tile (for fallback accounting).
  const placed = new Set<string>();

  for (const [resourceId, qty] of Object.entries(inv)) {
    if (qty <= 0) continue;
    if (pinned.has(resourceId)) continue; // keep pinned items — never deposited

    // Prefer the NEAREST tile already holding this resource (stack near the pawn); else the
    // nearest free tile (stockpileTiles is already sorted nearest-first).
    const existingStoredDrop = newDropped
      .filter(
        (d) => d.stored && d.resourceId === resourceId && stockpileTileKeys.has(`${d.x},${d.y}`)
      )
      .sort((a, b) => distToPawn(a.x, a.y) - distToPawn(b.x, b.y))[0];
    let tile: { x: number; y: number } | null = null;
    if (existingStoredDrop) {
      tile = { x: existingStoredDrop.x, y: existingStoredDrop.y };
    } else {
      const usedCoords = new Set(
        newDropped
          .filter((d) => d.stored && stockpileTileKeys.has(`${d.x},${d.y}`))
          .map((d) => `${d.x},${d.y}`)
      );
      const freeTile = stockpileTiles.find((t) => !usedCoords.has(t.key));
      if (freeTile) tile = { x: freeTile.x, y: freeTile.y };
    }

    if (tile) {
      // Create an UNSTORED drop at the tile — the absorption trigger below
      // will detect it, mark it stored, and credit the zone.
      const id = `deposit-${resourceId}-${Date.now()}-${rng.random().toString(36).slice(2, 5)}`;
      newDropIds.push(id);
      newDropped.push({ id, resourceId, x: tile.x, y: tile.y, quantity: qty, stored: false });
      placed.add(resourceId);
    }
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
            )
          }
        }
      : p
  );

  gameLogger.log(gs.turn, 'JOB-EVT', `${pawn.name} deposited inventory: ${JSON.stringify(inv)}`);

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
