// Reserve-and-fetch staging helpers (ADR-016) shared by the construct, fetch, and craft job
// handlers. Extracted from JobService (P-4, ADR-017 handler split): these resolve where an order's
// workstation is and whether the inputs / build materials reserved for an owner are staged on it.
import type { CraftingInProgress, GameState, PlacedBuilding } from '../../core/types';
import { heldQuantity, isFluidId, litresToUnits } from '../../core/vessels';

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

/**
 * Quantity of an order's reserved input `itemId` already staged ON its station tile.
 *
 * CONTAINERS-AND-FLUIDS §2: an input that is a FLUID never arrives as a stack of its own — it arrives
 * inside the vessel reserved to carry it. A barrel of brine standing on the tanning bucket IS staged
 * brine, so what the vessel holds counts here or the order would sit "unsupplied" forever with its
 * input parked on the station.
 */
export function stagedQty(
  order: CraftingInProgress,
  itemId: string,
  station: { x: number; y: number },
  gs: GameState
): number {
  let q = 0;
  // A fluid the STATION ITSELF is already holding is staged where it stands. Nobody ladles molten
  // copper out of a crucible into a bucket and back into the same crucible to pour it — the metal is
  // in the hearth, and the mould is at the hearth. Without this a melt-then-cast pair deadlocks: the
  // fluid exists, the order can never see it, and no vessel would sensibly carry it anyway. Same
  // shape as a vat fermenting its own wort or a pit tanning in its own brine.
  if (isFluidId(itemId)) {
    const body = (gs.buildings ?? []).find(
      (b) => b.id === order.stationBuildingId && b.x === station.x && b.y === station.y
    );
    const litres = (body?.fluidContents ?? []).find((e) => e.itemId === itemId)?.litres ?? 0;
    if (litres > 0) q += litresToUnits(itemId, litres);
  }
  for (const d of gs.droppedItems ?? []) {
    if (!d.stored || d.reservedFor !== order.id) continue;
    if (d.x !== station.x || d.y !== station.y) continue;
    if (d.resourceId === itemId) q += d.quantity;
    const held = heldQuantity(d.instance, itemId);
    if (held > 0) q += isFluidId(itemId) ? litresToUnits(itemId, held) : held;
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
