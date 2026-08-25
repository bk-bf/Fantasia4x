import type { CraftingInProgress, GameState, PlacedBuilding } from '../../core/types';
import { heldQuantity, isFluidId } from '../../core/rules/gear/vessels';

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

export function stagedQty(
  order: CraftingInProgress,
  itemId: string,
  station: { x: number; y: number },
  gs: GameState
): number {
  let q = 0;
  if (isFluidId(itemId)) {
    const body = (gs.buildings ?? []).find(
      (b) => b.id === order.stationBuildingId && b.x === station.x && b.y === station.y
    );
    const litres = (body?.fluidContents ?? []).find((e) => e.itemId === itemId)?.litres ?? 0;
    if (litres > 0) q += litres;
  }
  for (const d of gs.droppedItems ?? []) {
    if (!d.stored || d.reservedFor !== order.id) continue;
    if (d.x !== station.x || d.y !== station.y) continue;
    if (d.resourceId === itemId) q += d.quantity;
    const held = heldQuantity(d.instance, itemId);
    if (held > 0) q += held;
  }
  return q;
}

export function orderSupplied(
  order: CraftingInProgress,
  station: { x: number; y: number },
  gs: GameState
): boolean {
  return Object.entries(order.inputs ?? {}).every(
    ([itemId, need]) => stagedQty(order, itemId, station, gs) >= need
  );
}

export function isOrderSupplied(order: CraftingInProgress, gs: GameState): boolean {
  const station = stationTileFor(order, gs);
  return station ? orderSupplied(order, station, gs) : false;
}

export function buildingSupplied(b: PlacedBuilding, gs: GameState): boolean {
  return !(gs.droppedItems ?? []).some(
    (d) => d.stored && d.reservedFor === b.id && !(d.x === b.x && d.y === b.y)
  );
}
