import type {
  GameState,
  Building,
  Item,
  PlacedBuilding,
  StockpileZone,
  DroppedItem,
  ItemInstance
} from '../types';
import { rng } from '../util/rng';
import { mergeConditions } from '../rules/world/carcassCondition';
import {
  heldQuantity,
  isFluidId,
  pickVesselFor,
  putIn,
  takeOut,
  vesselAccepts,
  vesselAllows,
  vesselOf
} from '../rules/gear/vessels';
import { allItemDefs, itemDefById } from '../defs/items';
import buildingsData from '../../database/world/buildings.json';
import itemsData from '../../database/items/items.json';

const TOOL_TIER_BY_ID: Map<string, number> = new Map(
  (itemsData as unknown as Item[])
    .filter((i) => i.type === 'tool' && typeof i.tier === 'number')
    .map((i) => [i.id, i.tier as number])
);

const BUILDING_DEFS = buildingsData as unknown as Building[];

const STORAGE_BIN_STACKS = new Map<string, number>(
  BUILDING_DEFS.filter((d) => (d.effects?.storageStacks ?? 0) > 0).map((d) => [
    d.id,
    d.effects.storageStacks
  ])
);
function binStacksForType(type: string): number {
  return STORAGE_BIN_STACKS.get(type) ?? 0;
}
const STORAGE_BIN_FILTER = new Map<string, string[]>(
  BUILDING_DEFS.filter((d) => (d.storageFilter?.length ?? 0) > 0).map((d) => [
    d.id,
    d.storageFilter!
  ])
);

export const GENERAL_ZONE_ID = 'zone-general';

export function computeAggregate(zones: StockpileZone[]): Record<string, number> {
  const agg: Record<string, number> = {};
  for (const zone of zones ?? []) {
    for (const [id, amt] of Object.entries(zone.inventory)) {
      if (amt > 0) agg[id] = (agg[id] ?? 0) + amt;
    }
  }
  return agg;
}

export const BASE_TILE_CAPACITY = 200;

export function aggregateFromDrops(drops: DroppedItem[] | undefined): Record<string, number> {
  const agg: Record<string, number> = {};
  for (const d of drops ?? []) {
    if (!d.stored || (d.quantity ?? 0) <= 0) continue;
    agg[d.resourceId] = (agg[d.resourceId] ?? 0) + d.quantity;
    creditVesselContents(agg, d);
  }
  return agg;
}

export function withDrops(state: GameState, drops: DroppedItem[]): GameState {
  let spilled = false;
  for (const d of drops) {
    if (isFluidId(d.resourceId)) {
      spilled = true;
      break;
    }
  }
  const kept = spilled ? drops.filter((d) => !isFluidId(d.resourceId)) : drops;
  return { ...state, droppedItems: kept, stockpile: colonyStock(kept, state.buildings) };
}

export function colonyStock(
  drops: DroppedItem[] | undefined,
  buildings: PlacedBuilding[] | undefined
): Record<string, number> {
  const agg = aggregateFromDrops(drops);
  for (const b of buildings ?? []) {
    if (!b.fluidContents?.length) continue;
    for (const e of b.fluidContents) {
      const qty = e.litres ?? e.amount ?? 0;
      if (qty > 0) agg[e.itemId] = (agg[e.itemId] ?? 0) + qty;
    }
  }
  return agg;
}

function creditVesselContents(agg: Record<string, number>, d: DroppedItem): void {
  const contents = d.instance?.contents;
  if (!contents?.length) return;
  for (const e of contents) {
    const qty = e.litres ?? e.amount ?? 0;
    if (qty > 0) agg[e.itemId] = (agg[e.itemId] ?? 0) + qty;
  }
}

export function availableQuantityFromDrops(
  drops: DroppedItem[] | undefined,
  itemId: string
): number {
  let total = 0;
  for (const d of drops ?? []) {
    if (!d.stored || d.reservedFor || (d.quantity ?? 0) <= 0) continue;
    if (d.resourceId === itemId) total += d.quantity;
    const held = heldQuantity(d.instance, itemId);
    if (held > 0) total += held;
  }
  return total;
}

export function availableAggregateFromDrops(
  drops: DroppedItem[] | undefined
): Record<string, number> {
  const agg: Record<string, number> = {};
  for (const d of drops ?? []) {
    if (!d.stored || d.reservedFor || (d.quantity ?? 0) <= 0) continue;
    agg[d.resourceId] = (agg[d.resourceId] ?? 0) + d.quantity;
  }
  return agg;
}

export function colonyToolTier(state: GameState): number {
  let tier = state.currentToolLevel ?? 0;
  for (const d of state.droppedItems ?? []) {
    if (!d.stored || (d.quantity ?? 0) <= 0) continue;
    const t = TOOL_TIER_BY_ID.get(d.resourceId);
    if (t != null && t > tier) tier = t;
  }
  return tier;
}

export function reserveForOrder(
  state: GameState,
  itemId: string,
  qty: number,
  orderId: string
): { state: GameState; reserved: number } {
  if (qty <= 0) return { state, reserved: 0 };
  let remaining = qty;
  const drops: DroppedItem[] = [];
  for (const d of state.droppedItems ?? []) {
    if (remaining <= 0 || !d.stored || d.reservedFor || d.quantity <= 0) {
      drops.push(d);
      continue;
    }
    if (d.resourceId !== itemId) {
      const held = heldQuantity(d.instance, itemId);
      if (held > 0) {
        drops.push({ ...d, reservedFor: orderId });
        remaining -= held;
      } else {
        drops.push(d);
      }
      continue;
    }
    if (d.quantity <= remaining) {
      drops.push({ ...d, reservedFor: orderId });
      remaining -= d.quantity;
    } else {
      drops.push({
        ...d,
        quantity: d.quantity - remaining,
        ...(d.unitConditions ? { unitConditions: d.unitConditions.slice(remaining) } : {})
      });
      drops.push({
        ...(d.unitConditions ? { unitConditions: d.unitConditions.slice(0, remaining) } : {}),
        id: `${d.id}-resv-${orderId}`,
        resourceId: d.resourceId,
        x: d.x,
        y: d.y,
        quantity: remaining,
        stored: true,
        reservedFor: orderId
      });
      remaining = 0;
    }
  }
  return { state: { ...state, droppedItems: drops }, reserved: qty - remaining };
}

export function releaseReservation(state: GameState, orderId: string): GameState {
  let changed = false;
  const drops = (state.droppedItems ?? []).map((d) => {
    if (d.reservedFor !== orderId) return d;
    changed = true;
    const { reservedFor, ...rest } = d;
    return rest;
  });
  return changed ? { ...state, droppedItems: drops } : state;
}

export function tileStoredQuantity(state: GameState, x: number, y: number): number {
  let total = 0;
  for (const d of state.droppedItems ?? []) {
    if (d.stored && d.x === x && d.y === y) total += d.quantity ?? 0;
  }
  return total;
}

export function tileCapacity(state: GameState, x: number, y: number): number {
  let cap = BASE_TILE_CAPACITY;
  for (const b of state.buildings ?? []) {
    if (b.status !== 'complete' || b.x !== x || b.y !== y) continue;
    const def = BUILDING_DEFS.find((d) => d.id === b.type);
    if (def?.tileCapacityBonus) cap += def.tileCapacityBonus;
  }
  return cap;
}

export function tileFreeCapacity(state: GameState, x: number, y: number): number {
  return Math.max(0, tileCapacity(state, x, y) - tileStoredQuantity(state, x, y));
}

export function tilePileCapacity(state: GameState, x: number, y: number): number {
  let cap = 1;
  for (const b of state.buildings ?? []) {
    if (b.status !== 'complete' || b.x !== x || b.y !== y) continue;
    const stacks = binStacksForType(b.type);
    if (stacks > cap) cap = stacks;
  }
  return cap;
}

export function tileStoredPileCount(state: GameState, x: number, y: number): number {
  let n = 0;
  for (const d of state.droppedItems ?? []) if (d.stored && d.x === x && d.y === y) n++;
  return n;
}

export function isStorageBinTile(state: GameState, x: number, y: number): boolean {
  for (const b of state.buildings ?? [])
    if (b.status === 'complete' && b.x === x && b.y === y && binStacksForType(b.type) > 0)
      return true;
  return false;
}

export function storageTileKeys(state: GameState): string[] {
  const seen = new Set<string>();
  const zt = state.zoneTiles ?? {};
  for (const k in zt) if (zt[k]?.includes('stockpile')) seen.add(k);
  for (const b of state.buildings ?? [])
    if (b.status === 'complete' && binStacksForType(b.type) > 0) seen.add(`${b.x},${b.y}`);
  return [...seen];
}

export function isStorageTile(state: GameState, x: number, y: number): boolean {
  if (state.zoneTiles?.[`${x},${y}`]?.includes('stockpile')) return true;
  return isStorageBinTile(state, x, y);
}

export function binFilterAt(state: GameState, x: number, y: number): string[] | null {
  for (const b of state.buildings ?? []) {
    if (b.status !== 'complete' || b.x !== x || b.y !== y) continue;
    if (binStacksForType(b.type) <= 0) continue;
    const override = b.storageSettings?.allowedItemIds;
    if (override !== undefined) return override;
    return STORAGE_BIN_FILTER.get(b.type) ?? null;
  }
  return null;
}

export function isFilteredBinTile(state: GameState, x: number, y: number): boolean {
  return binFilterAt(state, x, y) !== null;
}

function pickStorageTile(state: GameState, tileKey: string | null): { x: number; y: number } {
  if (tileKey) {
    const [x, y] = tileKey.split(',').map(Number);
    if (Number.isFinite(x) && Number.isFinite(y)) return { x, y };
  }
  let fallback: { x: number; y: number } | null = null;
  for (const key of storageTileKeys(state)) {
    const [x, y] = key.split(',').map(Number);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (isFilteredBinTile(state, x, y)) continue;
    if (!fallback) fallback = { x, y };
    if (tileStoredPileCount(state, x, y) < tilePileCapacity(state, x, y)) return { x, y };
  }
  if (fallback) return fallback;
  const sd = (state.droppedItems ?? []).find((d) => d.stored);
  if (sd) return { x: sd.x, y: sd.y };
  for (const z of state.stockpileZones ?? []) {
    if (z.tiles[0]) {
      const [x, y] = z.tiles[0].split(',').map(Number);
      if (Number.isFinite(x) && Number.isFinite(y)) return { x, y };
    }
  }
  return { x: 0, y: 0 };
}

export function addToStockpileZone(
  state: GameState,
  tileKey: string | null,
  items: Record<string, number>
): GameState {
  const { x, y } = pickStorageTile(state, tileKey);
  const drops = (state.droppedItems ?? []).map((d) => ({ ...d }));

  for (const [itemId, amount] of Object.entries(items)) {
    if (amount <= 0) continue;
    if (isFluidId(itemId)) {
      creditFluid(drops, itemId, amount, x, y);
      continue;
    }
    if (vesselOf(itemId)) {
      for (let n = 0; n < amount; n++) {
        const seq = drops.length;
        drops.push({
          id: `stored-${itemId}-${x}-${y}-${seq}`,
          resourceId: itemId,
          x,
          y,
          quantity: 1,
          stored: true,
          instance: {
            instanceId: `vessel-${itemId}-${x}-${y}-${seq}`,
            itemId,
            durability: itemDefById(itemId)?.maxDurability ?? 100,
            filter: []
          }
        });
      }
      continue;
    }
    const idx = drops.findIndex(
      (d) => d.stored && d.resourceId === itemId && d.x === x && d.y === y
    );
    if (idx >= 0) {
      drops[idx].quantity += amount;
    } else {
      drops.push({
        id: `stored-${itemId}-${x}-${y}`,
        resourceId: itemId,
        x,
        y,
        quantity: amount,
        stored: true
      });
    }
  }

  return withDrops(state, drops);
}

function creditFluid(
  drops: DroppedItem[],
  itemId: string,
  units: number,
  x: number,
  y: number
): void {
  let remainingL = units;

  for (let i = 0; i < drops.length && remainingL > 0; i++) {
    const d = drops[i];
    if (!d.stored || d.x !== x || d.y !== y || !d.instance) continue;
    if (!vesselAccepts(d.resourceId, itemId)) continue;
    const inst = { ...d.instance, contents: d.instance.contents?.map((e) => ({ ...e })) };
    const poured = putIn(inst, itemId, remainingL);
    if (poured <= 0) continue;
    inst.filter = [...new Set([...(inst.filter ?? []), itemId])];
    drops[i] = { ...d, instance: inst };
    remainingL -= poured;
  }

  let guard = 0;
  while (remainingL > 0 && guard++ < 64) {
    const vesselId = pickVesselFor(itemId, remainingL);
    if (!vesselId) return;
    const n = drops.length;
    const inst: ItemInstance = {
      instanceId: `vessel-${vesselId}-${x}-${y}-${n}`,
      itemId: vesselId,
      durability: itemDefById(vesselId)?.maxDurability ?? 100,
      filter: [itemId]
    };
    const poured = putIn(inst, itemId, remainingL);
    if (poured <= 0) return;
    drops.push({
      id: `stored-${vesselId}-${x}-${y}-${n}`,
      resourceId: vesselId,
      x,
      y,
      quantity: 1,
      stored: true,
      instance: inst
    });
    remainingL -= poured;
  }
}

export function consumeFromStockpiles(state: GameState, items: Record<string, number>): GameState {
  const newDropped = (state.droppedItems ?? []).map((d) => ({ ...d }));

  for (const [itemId, amount] of Object.entries(items)) {
    if (amount <= 0) continue;
    let remaining = amount;
    for (let i = 0; i < newDropped.length && remaining > 0; i++) {
      const d = newDropped[i];
      if (!d.stored || d.reservedFor || (d.quantity ?? 0) <= 0) continue;
      if (d.resourceId === itemId) {
        const take = Math.min(d.quantity, remaining);
        newDropped[i] = { ...d, quantity: d.quantity - take };
        remaining -= take;
        continue;
      }
      remaining = drawFromVessel(newDropped, i, itemId, remaining);
    }
  }

  const kept = newDropped.filter((d) => !d.stored || d.quantity > 0);
  return withDrops(state, kept);
}

function drawFromVessel(
  drops: DroppedItem[],
  i: number,
  itemId: string,
  remaining: number
): number {
  const d = drops[i];
  const held = heldQuantity(d.instance, itemId);
  if (held <= 0 || !d.instance) return remaining;
  const fluid = isFluidId(itemId);
  const wantNative = remaining;
  const inst = { ...d.instance, contents: d.instance.contents?.map((e) => ({ ...e })) };
  const got = takeOut(inst, itemId, Math.min(held, wantNative));
  if (got <= 0) return remaining;
  drops[i] = { ...d, instance: inst };
  return remaining - got;
}

function zoneSeedFilter(state: GameState, x: number, y: number): string[] {
  if (!(state.zoneTiles?.[`${x},${y}`] ?? []).includes('stockpile')) return [];
  const zone = (state.zoneInstances ?? []).find(
    (z) => z.type === 'stockpile' && z.filter.allowedCategories.length > 0
  );
  if (!zone) return [];
  const allowed = new Set(zone.filter.allowedCategories);
  const blocked = new Set(zone.filter.blockedItems);
  const ids: string[] = [];
  for (const def of allItemDefs())
    if (allowed.has(def.category) && !blocked.has(def.id)) ids.push(def.id);
  return ids;
}

export function tileVesselCount(state: GameState, x: number, y: number): number {
  let n = 0;
  for (const d of state.droppedItems ?? [])
    if (d.stored && d.x === x && d.y === y && d.instance && vesselOf(d.resourceId)) n++;
  return n;
}

function packIntoVesselOnTile(drops: DroppedItem[], idx: number, x: number, y: number): number {
  const d = drops[idx];
  if (!d || d.instance || (d.quantity ?? 0) <= 0) return 0;
  if (d.unitConditions?.length) return 0;
  let packed = 0;
  for (let i = 0; i < drops.length && packed < d.quantity; i++) {
    const v = drops[i];
    if (i === idx || !v.stored || v.x !== x || v.y !== y || !v.instance) continue;
    if (!vesselAllows(v.instance, d.resourceId)) continue;
    const inst = { ...v.instance, contents: v.instance.contents?.map((e) => ({ ...e })) };
    const took = putIn(inst, d.resourceId, d.quantity - packed);
    if (took <= 0) continue;
    drops[i] = { ...v, instance: inst };
    packed += took;
  }
  return packed;
}

export function absorbDropIfOnStockpileTile(state: GameState, dropId: string): GameState {
  const drop = (state.droppedItems ?? []).find((d) => d.id === dropId);
  if (!drop || drop.stored) return state;

  if (!isStorageTile(state, drop.x, drop.y)) return state;

  if (drop.name == null && drop.instance == null && drop.quality == null) {
    const packing = (state.droppedItems ?? []).map((d) => ({ ...d }));
    const idx = packing.findIndex((d) => d.id === dropId);
    const packed = idx >= 0 ? packIntoVesselOnTile(packing, idx, drop.x, drop.y) : 0;
    if (packed > 0) {
      const left = drop.quantity - packed;
      const kept = packing.filter((d) => d.id !== dropId || left > 0);
      const j = kept.findIndex((d) => d.id === dropId);
      if (j >= 0) kept[j] = { ...kept[j], quantity: left, stored: true };
      return withDrops(state, kept);
    }
  }

  if (drop.name != null || drop.instance != null || drop.quality != null) {
    const seeded =
      drop.instance && vesselOf(drop.resourceId) && !(drop.instance.filter ?? []).length
        ? zoneSeedFilter(state, drop.x, drop.y)
        : null;
    const newDropped = (state.droppedItems ?? []).map((d) =>
      d.id === dropId
        ? {
            ...d,
            stored: true,
            ...(seeded?.length ? { instance: { ...d.instance!, filter: seeded } } : {})
          }
        : d
    );
    return withDrops(state, newDropped);
  }

  const existingIdx = (state.droppedItems ?? []).findIndex(
    (d) => d.stored && d.resourceId === drop.resourceId && d.x === drop.x && d.y === drop.y
  );

  let newDropped: DroppedItem[];
  if (existingIdx >= 0) {
    const existing = (state.droppedItems ?? [])[existingIdx];
    const mergedConditions =
      existing.unitConditions || drop.unitConditions
        ? mergeConditions(
            existing.unitConditions,
            existing.quantity,
            drop.unitConditions,
            drop.quantity
          )
        : undefined;
    newDropped = (state.droppedItems ?? [])
      .map((d, i) =>
        i === existingIdx
          ? {
              ...d,
              quantity: d.quantity + drop.quantity,
              ...(mergedConditions ? { unitConditions: mergedConditions } : {})
            }
          : d
      )
      .filter((d) => d.id !== dropId);
  } else {
    newDropped = (state.droppedItems ?? []).map((d) =>
      d.id === dropId ? { ...d, stored: true } : d
    );
  }

  return withDrops(state, newDropped);
}
