// Reserve-and-fetch staging helpers (ADR-016) shared by the construct, fetch, and craft job
// handlers. Extracted from JobService (P-4, ADR-017 handler split): these resolve where an order's
// workstation is and whether the inputs / build materials reserved for an owner are staged on it.
import type { CraftingInProgress, GameState, PlacedBuilding } from '../../core/types';

/** ADR-016: tile coords of an order's chosen workstation, or null if it's gone. */
export function stationTileFor(
  order: CraftingInProgress,
  gs: GameState
): { x: number; y: number } | null {
  if (!order.stationBuildingId) return null;
  const b = (gs.buildings ?? []).find(
    (b) => b.id === order.stationBuildingId && b.status === 'complete'
  );
  return b ? { x: b.x, y: b.y } : null;
}

/** Quantity of an order's reserved input `itemId` already staged ON its station tile. */
export function stagedQty(
  order: CraftingInProgress,
  itemId: string,
  station: { x: number; y: number },
  gs: GameState
): number {
  let q = 0;
  for (const d of gs.droppedItems ?? []) {
    if (
      d.stored &&
      d.reservedFor === order.id &&
      d.resourceId === itemId &&
      d.x === station.x &&
      d.y === station.y
    ) {
      q += d.quantity;
    }
  }
  return q;
}

/** True when every input of an order is fully staged on its station tile. */
export function orderSupplied(
  order: CraftingInProgress,
  station: { x: number; y: number },
  gs: GameState
): boolean {
  return Object.entries(order.inputs ?? {}).every(
    ([itemId, need]) => stagedQty(order, itemId, station, gs) >= need
  );
}

/** Is this craft order's station present and all inputs staged on it? (Passive furnaces.) */
export function isOrderSupplied(order: CraftingInProgress, gs: GameState): boolean {
  const station = stationTileFor(order, gs);
  return station ? orderSupplied(order, station, gs) : false;
}

/** True when no build material reserved for this building is still off the build tile. */
export function buildingSupplied(b: PlacedBuilding, gs: GameState): boolean {
  return !(gs.droppedItems ?? []).some(
    (d) => d.stored && d.reservedFor === b.id && !(d.x === b.x && d.y === b.y)
  );
}
