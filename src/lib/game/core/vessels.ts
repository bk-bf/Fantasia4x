// vessels.ts — CONTAINERS-AND-FLUIDS. The one place that knows what is inside a thing.
//
// Three separate concepts wore the same word before this file existed:
//
//   carry aid  — worn gear that raises what a pawn can shoulder (`inventoryBonus`). Holds nothing.
//   vessel     — an ITEM that holds other items and is itself carried, hauled and stored (`container`).
//   fixture    — a placed building that stores. Not an item at all.
//
// An item is exactly one of the three. A vessel's capacity lives on the DEFINITION (`Item.container`)
// and what it is holding lives on the INSTANCE (`ItemInstance.contents`), because two jugs stop being
// interchangeable the moment one has water in it.
//
// Two rules are enforced here rather than by convention, because both are the kind that rots the
// moment a callsite forgets:
//
//   ONE LEVEL OF NESTING. A jug in a crate is fine. A jug in a crate in a cart is a recursion nobody
//   can debug and a save-size problem, so `putIn` refuses to nest a vessel that is itself holding
//   something.
//
//   A FLUID CANNOT EXIST LOOSE. `type: 'fluid'` is a type and not merely a category precisely so the
//   sim can refuse it structurally: a fluid may only sit inside a vessel that accepts it. Anything
//   that would place one on the ground, in a stockpile or in a pawn's bare hands spills it — see
//   `spillsIfLoose`, which every DroppedItem/stockpile entry point asks before writing.

import type { Item, ItemInstance, Pawn, PawnEquipment, VesselContent } from './types';
import { allItemDefs, itemDefById } from './itemDefs';

/** Density fallback when a fluid def gives no weight — water, near enough, for everything. */
const DEFAULT_FLUID_KG_PER_L = 1;

/**
 * A FLUID IS COUNTED IN LITRES, everywhere: recipes, loot tables, craft outputs, stockpile totals and
 * vessel contents all speak the same number, so there is no conversion to get wrong.
 *
 * Two fields on a fluid definition carry that:
 *
 *   `weightKg`  kilograms of ONE LITRE — its density. Water 1, molten bronze 8.8, molten gold 19.3.
 *   `volumeL`   litres in one SERVING — the phial a pawn drinks, the flask a coating is applied from.
 *               Effects (`conditionDurationTurns`, `poisonChance`, `medicineQuality`…) are per serving.
 *
 * Litres, not doses, because pouring is volumetric: a mould cavity, a crucible and a waterskin are all
 * measured in litres, and counting a fluid in per-item doses made the same integer mean a different
 * volume in every metal.
 */

/** Litres in one serving — a drink, a dose, one application. Bulk fluids simply pour by the litre. */
export function servingL(itemId: string): number {
  return itemDefById(itemId)?.volumeL || 1;
}

/** Kilograms per litre of a fluid. */
function fluidDensity(itemId: string): number {
  return itemDefById(itemId)?.weightKg || DEFAULT_FLUID_KG_PER_L;
}

// ── what a thing IS ─────────────────────────────────────────────────────────

/** A fluid: pourable, measured in litres, and unable to exist outside a vessel. */
export function isFluidId(itemId: string): boolean {
  return itemDefById(itemId)?.type === 'fluid';
}

/** Every vessel a pawn has to hand: the tracked items in its pack, and anything it is wearing. */
function carriedInstances(pawn: Pawn): ItemInstance[] {
  const out: ItemInstance[] = [];
  for (const inst of pawn.inventory?.instances ?? []) if (inst) out.push(inst);
  for (const inst of Object.values(pawn.equipment ?? {})) if (inst) out.push(inst);
  return out;
}

/**
 * Everything this pawn has to hand, by item id — the bulk stacks in its pack PLUS whatever is inside
 * the vessels it carries or wears, one nested level down (`putIn` refuses to go deeper).
 *
 * A fluid is NEVER a bulk stack: `spillsIfLoose` means it only exists inside a vessel. So anything
 * that searches only `inventory.items` for a carried potion, tonic or coating concludes the pawn has
 * none — which is how the antivenins came to be invisible to the medicine panel. Solids in a vessel
 * count too: woundwort in a pouch is still woundwort. Fluids answer in litres, solids in units.
 */
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

/**
 * The vessel this pawn is carrying that holds `itemId`, or null when it is a plain stack in the pack.
 * Fullest first, so a dose comes out of the phial that can spare it rather than the one with a
 * splash left.
 */
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

/** The vessel block of an item id, or null when the item holds nothing (most items). */
export function vesselOf(itemId: string): NonNullable<Item['container']> | null {
  return itemDefById(itemId)?.container ?? null;
}

/** True when this item is a vessel — it holds things. Carry aids and fixtures are not vessels. */
export function isVesselId(itemId: string): boolean {
  return !!vesselOf(itemId);
}

/**
 * Would placing this item loose — on the ground, on a stockpile tile, in a pawn's bulk inventory —
 * spill it? True only for fluids. The one predicate every loose-placement path asks.
 */
export function spillsIfLoose(itemId: string): boolean {
  return isFluidId(itemId);
}

// ── what fits ───────────────────────────────────────────────────────────────

/**
 * Does this vessel accept that item? `accepts` entries match an item **id** (`water`), a **category**
 * (`arrow`, `grain`), or the bare word `fluid` for any fluid at all. Empty or omitted = anything fits,
 * which is deliberate for worn quivers and packs: restricting a quiver to arrows was rejected before
 * as unrealistic — a hunter stuffs whatever they like down a hide tube.
 */
export function vesselAccepts(vesselItemId: string, itemId: string): boolean {
  const v = vesselOf(vesselItemId);
  if (!v) return false;
  const def = itemDefById(itemId);
  // What the vessel is MADE OF comes first, and it overrides an open allow-list. A fluid that names
  // the materials able to hold it can go nowhere else — otherwise `accepts: ['fluid']` on a leather
  // waterskin would take molten copper, and a vessel with no allow-list at all would take anything at
  // any temperature.
  if (def?.heldBy?.length && !def.heldBy.includes(v.material ?? '')) return false;
  const accepts = v.accepts;
  if (!accepts || accepts.length === 0) return true;
  return accepts.some(
    (a) => a === itemId || a === def?.category || (a === 'fluid' && def?.type === 'fluid')
  );
}

/** Litres one content entry occupies: a fluid spends its litres, a solid `def.volumeL × amount`. */
export function contentVolumeL(entry: VesselContent): number {
  if (entry.litres != null) return entry.litres;
  const def = itemDefById(entry.itemId);
  return (def?.volumeL ?? 0.2) * (entry.amount ?? 0);
}

/** Kilograms one content entry weighs. A fluid's litres × its density (water 1 kg/L). */
export function contentWeightKg(entry: VesselContent): number {
  if (entry.litres != null) return entry.litres * fluidDensity(entry.itemId);
  const def = itemDefById(entry.itemId);
  const per = (def?.weightKg ?? 0.5) * (entry.instance?.matWeight ?? 1);
  return per * (entry.amount ?? 0);
  // A nested vessel's own contents are added by usedWeightKg's recursion, not here.
}

/** Total litres in use inside this instance (0 when empty or not a vessel). */
export function usedCapacityL(inst: Pick<ItemInstance, 'contents'> | null | undefined): number {
  let used = 0;
  for (const e of inst?.contents ?? []) used += contentVolumeL(e);
  return used;
}

/** Total kilograms of what is inside — including one nested level's own contents. */
export function usedWeightKg(inst: Pick<ItemInstance, 'contents'> | null | undefined): number {
  let kg = 0;
  for (const e of inst?.contents ?? []) {
    kg += contentWeightKg(e);
    if (e.instance?.contents?.length) kg += usedWeightKg(e.instance);
  }
  return kg;
}

/** Litres still free in this instance. Non-vessels report 0. */
export function freeCapacityL(inst: ItemInstance): number {
  const v = vesselOf(inst.itemId);
  if (!v) return 0;
  return Math.max(0, v.capacityL - usedCapacityL(inst));
}

/**
 * How much of `qty` this vessel could actually take — the smaller of what it accepts, what fits by
 * volume, and (when the vessel states one) what fits by weight. Fluids answer in litres, solids in
 * whole units.
 */
export function roomFor(inst: ItemInstance, itemId: string, qty: number): number {
  const v = vesselOf(inst.itemId);
  if (!v || qty <= 0) return 0;
  if (!vesselAccepts(inst.itemId, itemId)) return 0;
  const def = itemDefById(itemId);
  const fluid = def?.type === 'fluid';

  // Fluids are asked for in LITRES — the same number the caller already holds; solids in units.
  const perVolume = fluid ? 1 : (def?.volumeL ?? 0.2);
  let room = perVolume > 0 ? (v.capacityL - usedCapacityL(inst)) / perVolume : qty;

  if (v.capacityKg != null) {
    const perKg = fluid ? fluidDensity(itemId) : (def?.weightKg ?? 0.5);
    const byKg = perKg > 0 ? (v.capacityKg - usedWeightKg(inst)) / perKg : qty;
    room = Math.min(room, byKg);
  }

  room = Math.min(room, qty);
  if (room <= 0) return 0;
  // Fluids pour in fractions; solids do not half-exist.
  return fluid ? Math.round(room * 1000) / 1000 : Math.floor(room);
}

// ── the vessel's own allow-list ─────────────────────────────────────────────

/**
 * What this vessel instance is permitted to be filled with. Undefined reads as EMPTY — nothing — so a
 * vessel nobody has configured is inert rather than a magnet for whatever a hauler is holding.
 */
export function vesselFilterOf(inst: Pick<ItemInstance, 'filter'>): string[] {
  return inst.filter ?? [];
}

/**
 * May a pawn put this item into this vessel? Both gates must pass: the DEFINITION has to accept the
 * kind of thing (a jug takes fluids, not logs) and the INSTANCE's own allow-list has to name it (the
 * player said this jug is for water). Definition first, player second — the player can never open a
 * vessel up to something it physically cannot hold.
 */
export function vesselAllows(inst: ItemInstance, itemId: string): boolean {
  return vesselAccepts(inst.itemId, itemId) && vesselFilterOf(inst).includes(itemId);
}

/**
 * Contents this vessel is holding that its CURRENT filter no longer permits — what a filter edit
 * orphaned. Nothing is ever poured away to satisfy a filter change: these entries only move once
 * somewhere else that allows them has room, which is why this returns the list rather than acting on
 * it. Tipping a vessel out is a separate, deliberate order.
 */
export function orphanedContents(inst: ItemInstance): VesselContent[] {
  const allowed = vesselFilterOf(inst);
  return (inst.contents ?? []).filter((e) => !allowed.includes(e.itemId));
}

/**
 * Stamp the allow-list of a vessel arriving from OUTSIDE the colony — loot off a corpse, a barrel off
 * a caravan. It gets exactly what it is already carrying and nothing else, deliberately ignoring the
 * colony's default for its kind: otherwise a hauler would read a bought cask of somebody else's wine
 * as "a barrel, and barrels are for water round here", tip the wine into the nearest ditch and go and
 * fill it at the river. What came in stays in until the player says otherwise.
 */
export function stampForeignVessel(inst: ItemInstance): ItemInstance {
  if (!vesselOf(inst.itemId)) return inst;
  return { ...inst, filter: [...new Set((inst.contents ?? []).map((e) => e.itemId))] };
}

/** The allow-list a newly made vessel is born with — the colony default for its kind, or nothing. */
export function defaultFilterFor(
  vesselItemId: string,
  defaults: Record<string, string[]> | undefined
): string[] {
  return [...(defaults?.[vesselItemId] ?? [])];
}

// ── putting in and taking out ───────────────────────────────────────────────

/** How much of a given item id this instance is holding (litres for fluids, units for solids). */
export function heldQuantity(inst: ItemInstance | null | undefined, itemId: string): number {
  let held = 0;
  for (const e of inst?.contents ?? []) {
    if (e.itemId !== itemId) continue;
    held += e.litres ?? e.amount ?? 0;
  }
  return held;
}

/**
 * Pour/stuff `qty` of `itemId` into the vessel, mutating `inst.contents`. **Fluids are asked for in
 * LITRES, solids in units** — a caller holding recipe doses converts with `unitsToLitres` first.
 * Returns how much actually went in — the caller must subtract exactly that, never the amount it
 * asked for. A tracked solid passes its own `instance` so the nested item keeps its durability,
 * quality and famed history.
 *
 * Refuses outright when the nested item is a vessel that is ITSELF holding something: that is the
 * second level of nesting, and one level is the whole rule.
 */
export function putIn(
  inst: ItemInstance,
  itemId: string,
  qty: number,
  instance?: ItemInstance
): number {
  if (instance?.contents?.length) return 0; // one level only
  const room = roomFor(inst, itemId, qty);
  if (room <= 0) return 0;
  const fluid = isFluidId(itemId);
  inst.contents ??= [];

  // A tracked solid is its own entry — two swords are two swords, not "sword ×2".
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

/**
 * Draw `qty` of `itemId` back out, mutating `inst.contents`. Returns how much came out (may be less
 * than asked). Emptied entries are dropped so an empty vessel carries no contents array clutter.
 */
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

/** Tip the whole vessel out and hand back what was in it. The vessel survives; its contents leave. */
export function emptyOut(inst: ItemInstance): VesselContent[] {
  const out = inst.contents ?? [];
  delete inst.contents;
  return out;
}

/**
 * The water a pawn is carrying on its own person — pack or worn slot — as the vessel holding the most
 * of it, or null. A filled waterskin means no trip: the pawn drinks where it stands.
 *
 * Lives HERE rather than in `pawn/pawnHelpers` on purpose: PawnService needs it for the auto-drink
 * pass, and pawnHelpers already imports PawnService, so putting it there closes a module cycle. It is
 * a pure question about a vessel anyway.
 */
export function carriedWaterVessel(pawn: {
  inventory?: { instances?: ItemInstance[] };
  equipment?: PawnEquipment;
}): ItemInstance | null {
  let best: ItemInstance | null = null;
  let bestL = 0;
  const consider = (inst: ItemInstance | undefined) => {
    if (!inst) return;
    const held = heldQuantity(inst, 'water');
    if (held > bestL) {
      best = inst;
      bestL = held;
    }
  };
  for (const inst of pawn.inventory?.instances ?? []) consider(inst);
  for (const inst of Object.values(pawn.equipment ?? {})) consider(inst);
  return best;
}

/**
 * The vessel the colony would reach for to hold `litres` of `itemId`: the smallest one that takes the
 * lot in a single container, or failing that the biggest there is (the caller pours what fits and asks
 * again). Deterministic — DB order, no rng — so a replayed scenario mints the same vessels (ADR-033).
 * Returns null when no vessel in the game accepts this at all.
 */
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

// ── readouts ────────────────────────────────────────────────────────────────

/** Litres of FLUID held, for the fill bar. Solids do not register on it. */
export function fluidLitres(inst: Pick<ItemInstance, 'contents'> | null | undefined): number {
  let l = 0;
  for (const e of inst?.contents ?? []) if (e.litres != null) l += e.litres;
  return Math.round(l * 100) / 100;
}

/** The fluid a vessel is currently holding (the largest, if somehow mixed), or null when dry. */
export function heldFluidId(
  inst: Pick<ItemInstance, 'contents'> | null | undefined
): string | null {
  let best: VesselContent | null = null;
  for (const e of inst?.contents ?? [])
    if (e.litres != null && (!best || e.litres > (best.litres ?? 0))) best = e;
  return best?.itemId ?? null;
}

/** A one-line "Water 2.5/3 L" style readout, or null when there is nothing to say. */
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
