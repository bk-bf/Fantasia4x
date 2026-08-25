import type { Item, ItemInstance, Pawn, PawnEquipment, VesselContent } from '../../types';
import { allItemDefs, itemDefById } from '../../defs/items';

const DEFAULT_FLUID_KG_PER_L = 1;

export function servingL(itemId: string): number {
  return itemDefById(itemId)?.volumeL || 1;
}

function fluidDensity(itemId: string): number {
  return itemDefById(itemId)?.weightKg || DEFAULT_FLUID_KG_PER_L;
}

export function isFluidId(itemId: string): boolean {
  return itemDefById(itemId)?.type === 'fluid';
}

function carriedInstances(pawn: Pawn): ItemInstance[] {
  const out: ItemInstance[] = [];
  for (const inst of pawn.inventory?.instances ?? []) if (inst) out.push(inst);
  for (const inst of Object.values(pawn.equipment ?? {})) if (inst) out.push(inst);
  return out;
}

export function carriedQuantities(pawn: Pawn): Record<string, number> {
  const out: Record<string, number> = { ...(pawn.inventory?.items ?? {}) };
  const add = (e: VesselContent) => {
    const qty = e.litres ?? e.amount ?? 0;
    if (qty > 0) out[e.itemId] = (out[e.itemId] ?? 0) + qty;
  };
  for (const inst of carriedInstances(pawn)) {
    for (const e of inst.contents ?? []) {
      add(e);
      for (const nested of e.instance?.contents ?? []) add(nested);
    }
  }
  for (const [id, q] of Object.entries(out)) if (q <= 0) delete out[id];
  return out;
}

export function carrierOf(pawn: Pawn, itemId: string): ItemInstance | null {
  let best: ItemInstance | null = null;
  let most = 0;
  for (const inst of carriedInstances(pawn)) {
    const held = heldQuantity(inst, itemId);
    if (held > most) {
      most = held;
      best = inst;
    }
  }
  return best;
}

export function vesselOf(itemId: string): NonNullable<Item['container']> | null {
  return itemDefById(itemId)?.container ?? null;
}

export function isVesselId(itemId: string): boolean {
  return !!vesselOf(itemId);
}

export function spillsIfLoose(itemId: string): boolean {
  return isFluidId(itemId);
}

export function vesselAccepts(vesselItemId: string, itemId: string): boolean {
  const v = vesselOf(vesselItemId);
  if (!v) return false;
  const def = itemDefById(itemId);
  if (def?.heldBy?.length && !def.heldBy.includes(v.material ?? '')) return false;
  const accepts = v.accepts;
  if (!accepts || accepts.length === 0) return true;
  return accepts.some(
    (a) => a === itemId || a === def?.category || (a === 'fluid' && def?.type === 'fluid')
  );
}

export function contentVolumeL(entry: VesselContent): number {
  if (entry.litres != null) return entry.litres;
  const def = itemDefById(entry.itemId);
  return (def?.volumeL ?? 0.2) * (entry.amount ?? 0);
}

export function contentWeightKg(entry: VesselContent): number {
  if (entry.litres != null) return entry.litres * fluidDensity(entry.itemId);
  const def = itemDefById(entry.itemId);
  const per = (def?.weightKg ?? 0.5) * (entry.instance?.matWeight ?? 1);
  return per * (entry.amount ?? 0);
}

export function usedCapacityL(inst: Pick<ItemInstance, 'contents'> | null | undefined): number {
  let used = 0;
  for (const e of inst?.contents ?? []) used += contentVolumeL(e);
  return used;
}

export function usedWeightKg(inst: Pick<ItemInstance, 'contents'> | null | undefined): number {
  let kg = 0;
  for (const e of inst?.contents ?? []) {
    kg += contentWeightKg(e);
    if (e.instance?.contents?.length) kg += usedWeightKg(e.instance);
  }
  return kg;
}

export function freeCapacityL(inst: ItemInstance): number {
  const v = vesselOf(inst.itemId);
  if (!v) return 0;
  return Math.max(0, v.capacityL - usedCapacityL(inst));
}

export function roomFor(inst: ItemInstance, itemId: string, qty: number): number {
  const v = vesselOf(inst.itemId);
  if (!v || qty <= 0) return 0;
  if (!vesselAccepts(inst.itemId, itemId)) return 0;
  const def = itemDefById(itemId);
  const fluid = def?.type === 'fluid';

  const perVolume = fluid ? 1 : (def?.volumeL ?? 0.2);
  let room = perVolume > 0 ? (v.capacityL - usedCapacityL(inst)) / perVolume : qty;

  if (v.capacityKg != null) {
    const perKg = fluid ? fluidDensity(itemId) : (def?.weightKg ?? 0.5);
    const byKg = perKg > 0 ? (v.capacityKg - usedWeightKg(inst)) / perKg : qty;
    room = Math.min(room, byKg);
  }

  room = Math.min(room, qty);
  if (room <= 0) return 0;
  return fluid ? Math.round(room * 1000) / 1000 : Math.floor(room);
}

export function vesselFilterOf(inst: Pick<ItemInstance, 'filter'>): string[] {
  return inst.filter ?? [];
}

export function vesselAllows(inst: ItemInstance, itemId: string): boolean {
  return vesselAccepts(inst.itemId, itemId) && vesselFilterOf(inst).includes(itemId);
}

export function orphanedContents(inst: ItemInstance): VesselContent[] {
  const allowed = vesselFilterOf(inst);
  return (inst.contents ?? []).filter((e) => !allowed.includes(e.itemId));
}

export function stampForeignVessel(inst: ItemInstance): ItemInstance {
  if (!vesselOf(inst.itemId)) return inst;
  return { ...inst, filter: [...new Set((inst.contents ?? []).map((e) => e.itemId))] };
}

export function defaultFilterFor(
  vesselItemId: string,
  defaults: Record<string, string[]> | undefined
): string[] {
  return [...(defaults?.[vesselItemId] ?? [])];
}

export function heldQuantity(inst: ItemInstance | null | undefined, itemId: string): number {
  let held = 0;
  for (const e of inst?.contents ?? []) {
    if (e.itemId !== itemId) continue;
    held += e.litres ?? e.amount ?? 0;
  }
  return held;
}

export function putIn(
  inst: ItemInstance,
  itemId: string,
  qty: number,
  instance?: ItemInstance
): number {
  if (instance?.contents?.length) return 0;
  const room = roomFor(inst, itemId, qty);
  if (room <= 0) return 0;
  const fluid = isFluidId(itemId);
  inst.contents ??= [];

  if (instance) {
    inst.contents.push({ itemId, amount: 1, instance });
    return 1;
  }
  const existing = inst.contents.find((e) => e.itemId === itemId && !e.instance);
  if (existing) {
    if (fluid) existing.litres = (existing.litres ?? 0) + room;
    else existing.amount = (existing.amount ?? 0) + room;
  } else {
    inst.contents.push(fluid ? { itemId, litres: room } : { itemId, amount: room });
  }
  return room;
}

export function takeOut(inst: ItemInstance, itemId: string, qty: number): number {
  if (!inst.contents?.length || qty <= 0) return 0;
  let want = qty;
  let got = 0;
  for (const e of inst.contents) {
    if (e.itemId !== itemId || want <= 0) continue;
    const have = e.litres ?? e.amount ?? 0;
    const take = Math.min(have, want);
    if (take <= 0) continue;
    if (e.litres != null) e.litres = Math.round((e.litres - take) * 1000) / 1000;
    else e.amount = (e.amount ?? 0) - take;
    want -= take;
    got += take;
  }
  inst.contents = inst.contents.filter((e) => (e.litres ?? e.amount ?? 0) > 0);
  if (!inst.contents.length) delete inst.contents;
  return got;
}

export function emptyOut(inst: ItemInstance): VesselContent[] {
  const out = inst.contents ?? [];
  delete inst.contents;
  return out;
}

export function carriedWaterVessel(pawn: {
  inventory?: { instances?: ItemInstance[] };
  equipment?: PawnEquipment;
}): ItemInstance | null {
  return carriedDrinkVessel(pawn)?.inst ?? null;
}

export function hydrationOf(itemId: string): number {
  const def = itemDefById(itemId);
  return def?.type === 'fluid' ? (def.hydration ?? 0) : 0;
}

export function isDrinkId(itemId: string): boolean {
  return hydrationOf(itemId) > 0;
}

export function carriedDrinkVessel(pawn: {
  inventory?: { instances?: ItemInstance[] };
  equipment?: PawnEquipment;
}): { inst: ItemInstance; itemId: string; litres: number } | null {
  let best: { inst: ItemInstance; itemId: string; litres: number } | null = null;
  let bestWorth = 0;
  const consider = (inst: ItemInstance | undefined) => {
    if (!inst) return;
    for (const e of inst.contents ?? []) {
      const litres = e.litres ?? 0;
      const worth = litres * hydrationOf(e.itemId);
      if (worth > bestWorth) {
        best = { inst, itemId: e.itemId, litres };
        bestWorth = worth;
      }
    }
  };
  for (const inst of pawn.inventory?.instances ?? []) consider(inst);
  for (const inst of Object.values(pawn.equipment ?? {})) consider(inst);
  return best;
}

export function pickVesselFor(itemId: string, litres: number): string | null {
  let smallestFitting: { id: string; cap: number } | null = null;
  let largest: { id: string; cap: number } | null = null;
  for (const def of allItemDefs()) {
    const cap = def.container?.capacityL;
    if (!cap || !vesselAccepts(def.id, itemId)) continue;
    if (!largest || cap > largest.cap) largest = { id: def.id, cap };
    if (cap >= litres && (!smallestFitting || cap < smallestFitting.cap))
      smallestFitting = { id: def.id, cap };
  }
  return (smallestFitting ?? largest)?.id ?? null;
}

export function fluidLitres(inst: Pick<ItemInstance, 'contents'> | null | undefined): number {
  let l = 0;
  for (const e of inst?.contents ?? []) if (e.litres != null) l += e.litres;
  return Math.round(l * 100) / 100;
}

export function heldFluidId(
  inst: Pick<ItemInstance, 'contents'> | null | undefined
): string | null {
  let best: VesselContent | null = null;
  for (const e of inst?.contents ?? [])
    if (e.litres != null && (!best || e.litres > (best.litres ?? 0))) best = e;
  return best?.itemId ?? null;
}

export function contentsLabel(inst: ItemInstance): string | null {
  const v = vesselOf(inst.itemId);
  if (!v) return null;
  const parts: string[] = [];
  for (const e of inst.contents ?? []) {
    const name = itemDefById(e.itemId)?.name ?? e.itemId;
    parts.push(e.litres != null ? `${name} ${e.litres} L` : `${name} ×${e.amount}`);
  }
  return parts.length ? parts.join(', ') : null;
}
