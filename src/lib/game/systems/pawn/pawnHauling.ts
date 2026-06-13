/**
 * pawnHauling — the ADR-016 reserve-and-fetch deposit pipeline, extracted from pawnHelpers
 * (hotspot follow-up). Finds the deposit point, stages a fetched craft order's inputs ON its
 * station tile, and deposits a pawn's inventory into the nearest stockpile zone. Consumed by the
 * work-state handlers; depends only on core/services + goIdle, so the import graph stays acyclic.
 */
import type { GameState, Pawn } from '../../core/types';
import { addToStockpileZone, absorbDropIfOnStockpileTile } from '../../core/GameState';
import { gameLogger } from '../../dev/gameLogger';
import { rng } from '../../core/rng';
import { PAWN_STATE } from './pawnStates';
import { goIdle } from './pawnHelpers';

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
 * Find the nearest complete storage building to deposit hauled items.
 * Falls back to any complete building if no storage type found.
 * Returns null if no buildings exist (pawn will deposit in-place).
 */
export function findNearestDepositPoint(pawn: Pawn, gs: GameState): { x: number; y: number } | null {
  if (!pawn.position) return null;
  const { x: px, y: py } = pawn.position;

  let best: { x: number; y: number; dist: number } | null = null;

  // First priority: stockpile zones designated on the map
  for (const [key, type] of Object.entries(gs.designations ?? {})) {
    if (type !== 'stockpile') continue;
    const [x, y] = key.split(',').map(Number);
    const dist = Math.abs(x - px) + Math.abs(y - py);
    if (!best || dist < best.dist) best = { x, y, dist };
  }
  if (best) return { x: best.x, y: best.y };

  // Second priority: designated storage building types
  for (const b of gs.buildings ?? []) {
    if (b.status !== 'complete') continue;
    if (!DEPOSIT_TYPES.includes(b.type)) continue;
    const dist = Math.abs(b.x - px) + Math.abs(b.y - py);
    if (!best || dist < best.dist) best = { x: b.x, y: b.y, dist };
  }
  if (best) return { x: best.x, y: best.y };

  // Fallback: any complete building
  for (const b of gs.buildings ?? []) {
    if (b.status !== 'complete') continue;
    const dist = Math.abs(b.x - px) + Math.abs(b.y - py);
    if (!best || dist < best.dist) best = { x: b.x, y: b.y, dist };
  }
  return best ? { x: best.x, y: best.y } : null;
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

  // Collect all stockpile tile coordinates, ordered NEAREST-FIRST to the pawn so items land
  // where the pawn actually dropped them (its current tile / the one it walked to), not on
  // whatever tile happens to come first in designation-iteration order (the old "top row" bug).
  const px = pawn.position?.x ?? 0;
  const py = pawn.position?.y ?? 0;
  const distToPawn = (x: number, y: number) => Math.abs(x - px) + Math.abs(y - py);
  const stockpileTiles = Object.entries(gs.designations ?? {})
    .filter(([, t]) => t === 'stockpile')
    .map(([key]) => {
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
            items: {}
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
