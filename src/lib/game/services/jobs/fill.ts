// Fill job handler (CONTAINERS-AND-FLUIDS §1, ADR-016 / ADR-017). Filling a vessel is a HAULING
// chore, not a new verb: it rides the `hauling` work category, competes for the same pawns, and ends
// the way every haul ends — with the pawn carrying something back to a stockpile.
//
// The job is self-sequencing in two legs, and which leg is generated depends only on where the vessel
// currently is, so there is no multi-stage state to keep in sync:
//
//   leg 1  the vessel is lying in the colony  → job at the VESSEL's tile; completing it picks the
//          vessel up into the pawn's pack as a tracked instance.
//   leg 2  the vessel is in a pawn's pack     → job at the SOURCE tile; completing it pours.
//
// WHAT gets filled is never guessed. A vessel is filled only with what its own allow-list
// (`ItemInstance.filter`) names — empty by default, opened up by the player, optionally promoted to a
// colony default for that vessel type. That is the whole trigger: allowing water on a waterskin is
// what queues the job that fills it.
//
// Nothing is ever poured away to make room. If a jug full of honey is re-filtered to water, the honey
// only leaves once some OTHER vessel that allows honey has room to take it — which happens naturally
// here, because that other vessel generates its own fill job with this jug as the source. When no such
// vessel exists the jug simply stays as it is. Tipping a vessel out on the ground destroys what is in
// it and is therefore a deliberate player order (`emptyVessel`), never something a job does.

import type { DroppedItem, GameState, ItemInstance, Job } from '../../core/types';
import { itemService } from '../ItemService';
import { consumeFromStockpiles, withDrops, availableQuantityFromDrops } from '../../core/GameState';
import {
  isFluidId,
  orphanedContents,
  putIn,
  roomFor,
  servingL,
  vesselAccepts,
  vesselFilterOf,
  vesselOf
} from '../../core/vessels';
import { manhattan } from '../../core/distance';

/** A pour is a real chore — slower than a scoop, far quicker than a craft. */
const FILL_WORK = 0.4;

/** Every vessel the colony can act on right now, with where it is and who (if anyone) holds it. */
interface FoundVessel {
  inst: ItemInstance;
  x: number;
  y: number;
  /** Set when a pawn is carrying it — that is leg 2. */
  pawnId?: string;
  /** Set when it is lying as a drop — that is leg 1. */
  drop?: DroppedItem;
}

/** Allocation-free "is there anything to fill at all" test — the per-tick early-out. */
function hasAnyVessel(gs: GameState): boolean {
  for (const d of gs.droppedItems ?? []) if (d.instance && vesselOf(d.resourceId)) return true;
  for (const p of gs.pawns ?? []) {
    if (p.isAlive === false) continue;
    for (const inst of p.inventory?.instances ?? []) if (vesselOf(inst.itemId)) return true;
  }
  return false;
}

function findVessels(gs: GameState): FoundVessel[] {
  const out: FoundVessel[] = [];
  for (const d of gs.droppedItems ?? []) {
    if (!d.instance || !vesselOf(d.resourceId)) continue;
    out.push({ inst: d.instance, x: d.x, y: d.y, drop: d });
  }
  for (const p of gs.pawns ?? []) {
    if (p.isAlive === false || !p.position) continue;
    for (const inst of p.inventory?.instances ?? []) {
      if (!vesselOf(inst.itemId)) continue;
      out.push({ inst, x: p.position.x, y: p.position.y, pawnId: p.id });
    }
  }
  return out;
}

/**
 * Where a pawn can draw `itemId` from, nearest first, or null when the colony has no source.
 *
 * Three kinds of source, and the list is deliberately short:
 *
 *   1. the WORLD — a drink designation or a well, for water. Free and endless.
 *   2. a STATION holding it in its own body — draining a finished batch out of a brewing cask into
 *      proper vessels is the obvious chore, and a station is never a fill target, so it cannot loop.
 *   3. another VESSEL, but ONLY when that vessel is holding it as an ORPHAN — something its own
 *      allow-list no longer permits, waiting to be rehomed. This is the rule that makes a filter edit
 *      safe: the honey moves out of the re-filtered jug exactly when a jug that allows honey has room
 *      for it, and never otherwise.
 *
 * Vessel-to-vessel top-ups are excluded on purpose. Two half-full barrels that each "want" brine would
 * otherwise pour into one another for the rest of the game — and in the first colony that shipped this,
 * a hauler picked up the only barrel of brine to top it up from itself and carried it around forever.
 */
type FillSource =
  | { kind: 'world'; x: number; y: number }
  | { kind: 'station'; x: number; y: number; buildingId: string }
  | { kind: 'vessel'; x: number; y: number; instanceId: string };

function sourceFor(
  itemId: string,
  from: { x: number; y: number },
  gs: GameState,
  exceptInstanceId?: string
): FillSource | null {
  let best: FillSource | null = null;
  let bestDist = Infinity;
  const consider = (src: FillSource) => {
    const dist = manhattan(src.x, src.y, from.x, from.y);
    if (dist < bestDist) {
      best = src;
      bestDist = dist;
    }
  };

  if (itemId === 'water') {
    for (const [key, type] of Object.entries(gs.designations ?? {})) {
      if (type !== 'drink') continue;
      const [x, y] = key.split(',').map(Number);
      consider({ kind: 'world', x, y });
    }
    for (const b of gs.buildings ?? []) {
      if (b.status === 'complete' && b.type === 'well') consider({ kind: 'world', x: b.x, y: b.y });
    }
    if (best) return best;
  }

  // A station holding a batch in its own body.
  for (const b of gs.buildings ?? []) {
    if (b.status !== 'complete') continue;
    if ((b.fluidContents ?? []).some((e) => e.itemId === itemId && (e.litres ?? 0) > 0))
      consider({ kind: 'station', x: b.x, y: b.y, buildingId: b.id });
  }

  // Another vessel, but only one holding this as an orphan its own list no longer allows.
  for (const d of gs.droppedItems ?? []) {
    if (!d.stored || d.reservedFor || (d.quantity ?? 0) <= 0 || !d.instance) continue;
    if (d.instance.instanceId === exceptInstanceId) continue;
    if (orphanedContents(d.instance).some((e) => e.itemId === itemId))
      consider({ kind: 'vessel', x: d.x, y: d.y, instanceId: d.instance.instanceId });
  }

  return best;
}

/**
 * Fluids a queued craft order needs and the colony's stored stock cannot cover — the fluid exists, but
 * it is standing in a station's own body (bile in the butchery's catch, ale in the cask) where no
 * reservation can reach it. Somebody has to go and dip a vessel in it.
 *
 * This is the second trigger for filling, alongside the player's allow-lists. A standing allow-list
 * says "keep this jug topped up with water"; a queued order says "I need two measures of bile and it
 * is in the flensing table". Both end in the same job.
 */
function orderDemand(gs: GameState): Set<string> {
  const wanted = new Set<string>();
  for (const order of gs.craftingQueue ?? []) {
    for (const [itemId, need] of Object.entries(order.inputs ?? {})) {
      if (!isFluidId(itemId) || need <= 0) continue;
      if (availableQuantityFromDrops(gs.droppedItems, itemId) >= need) continue;
      wanted.add(itemId);
    }
  }
  return wanted;
}

/**
 * The one item this vessel still wants. Its own allow-list first — that is the player's standing
 * instruction. Failing that, an EMPTY vessel volunteers for whatever a queued order is short of, so a
 * colony does not deadlock waiting for someone to tick a box on a flask before it can brew.
 *
 * Only EMPTY vessels volunteer, which is what stops two half-full barrels deciding they each need what
 * the other is holding and pouring back and forth forever.
 */
function wantOf(inst: ItemInstance, demand: Set<string>): string | null {
  const v = vesselOf(inst.itemId);
  if (!v) return null;
  for (const itemId of vesselFilterOf(inst)) {
    if (!vesselAccepts(inst.itemId, itemId)) continue;
    const want = isFluidId(itemId) ? servingL(itemId) : 1;
    if (roomFor(inst, itemId, want) > 0) return itemId;
  }
  if (inst.contents?.length) return null;
  for (const itemId of demand) {
    if (!vesselAccepts(inst.itemId, itemId)) continue;
    if (roomFor(inst, itemId, isFluidId(itemId) ? servingL(itemId) : 1) > 0) return itemId;
  }
  return null;
}

export function generate(jobs: Job[], gs: GameState): Job[] {
  // PERF (ENGINE-PERFORMANCE — no new per-tick allocation on the common path): `generateJobs` runs
  // every tick, and most colonies own no vessels for a long while. A cheap scan first, and the arrays
  // and Maps below are only built once there is actually something to fill.
  if (!hasAnyVessel(gs) && !jobs.some((j) => j.type === 'fill')) return jobs;

  // Drop fill jobs whose vessel has gone, filled up, or been re-filtered away from what it wanted.
  const vessels = findVessels(gs);
  const demand = orderDemand(gs);
  const byInstance = new Map(vessels.map((v) => [v.inst.instanceId, v]));
  jobs = jobs.filter((j) => {
    if (j.type !== 'fill') return true;
    const v = j.vesselInstanceId ? byInstance.get(j.vesselInstanceId) : undefined;
    if (!v) return false; // the vessel is gone
    // A hand-ordered draw is kept until it is done: the player asked for THIS fluid in THIS vessel,
    // which by definition is not on the vessel's standing allow-list.
    if (j.manual) return roomFor(v.inst, j.resourceId!, 0.001) > 0;
    return wantOf(v.inst, demand) === j.resourceId;
  });

  const manualVessels = new Set(
    jobs.filter((j) => j.type === 'fill' && j.manual).map((j) => j.vesselInstanceId)
  );
  for (const v of vessels) {
    // A vessel already reserved for a craft order is on its way to a station — leave it alone, and
    // likewise one the player has hand-ordered to go and fetch something.
    if (v.drop?.reservedFor || manualVessels.has(v.inst.instanceId)) continue;
    const itemId = wantOf(v.inst, demand);
    if (!itemId) continue;
    const id = `fill-${v.inst.instanceId}-${itemId}`;
    if (jobs.some((j) => j.id === id)) continue;

    // Leg 1 — the vessel is lying about: fetch it into a pack first.
    if (!v.pawnId) {
      // No point sending anyone for it if there is nowhere to fill it from.
      if (!sourceFor(itemId, v, gs, v.inst.instanceId)) continue;
      jobs.push({
        id,
        type: 'fill',
        targetX: v.x,
        targetY: v.y,
        resourceId: itemId,
        droppedItemId: v.drop?.id,
        vesselInstanceId: v.inst.instanceId,
        // Picking a jug up is a scoop, same as a fetch — the walk is the cost.
        workRequired: 0.02,
        workDone: 0,
        claimedBy: null
      });
      continue;
    }

    // Leg 2 — a pawn already carries it: walk to the source and pour. Only that pawn can do this
    // one, so it is pre-claimed rather than thrown into the open pool.
    const src = sourceFor(itemId, v, gs, v.inst.instanceId);
    if (!src) continue;
    jobs.push({
      id,
      type: 'fill',
      targetX: src.x,
      targetY: src.y,
      resourceId: itemId,
      vesselInstanceId: v.inst.instanceId,
      workRequired: FILL_WORK,
      workDone: 0,
      claimedBy: v.pawnId
    });
  }
  return jobs;
}

export function complete(job: Job, gs: GameState): GameState {
  const pawnId = job.claimedBy;
  const itemId = job.resourceId;
  if (!pawnId || !itemId || !job.vesselInstanceId) return gs;
  const pawn = gs.pawns.find((p) => p.id === pawnId);
  if (!pawn) return gs;

  const carried = (pawn.inventory?.instances ?? []).find(
    (i) => i.instanceId === job.vesselInstanceId
  );

  // ── leg 1: lift the vessel off the ground into the pawn's pack, contents and all ──
  if (!carried) {
    const drop = (gs.droppedItems ?? []).find((d) => d.id === job.droppedItemId);
    if (!drop?.instance || drop.instance.instanceId !== job.vesselInstanceId) return gs;
    const rest = (gs.droppedItems ?? []).filter((d) => d.id !== drop.id);
    const pawns = gs.pawns.map((p) => {
      if (p.id !== pawnId) return p;
      const inv = p.inventory ?? { items: {}, instances: [] };
      return { ...p, inventory: { ...inv, instances: [...(inv.instances ?? []), drop.instance!] } };
    });
    return { ...withDrops(gs, rest), pawns };
  }

  // ── leg 2: pour ──
  const src = sourceFor(itemId, { x: job.targetX, y: job.targetY }, gs, carried.instanceId);
  if (!src) return gs;
  const fluid = isFluidId(itemId);
  // Take as much as fits in one visit — a pawn does not walk to the river for a mouthful.
  const wantNative = roomFor(carried, itemId, fluid ? Infinity : Number.MAX_SAFE_INTEGER);
  if (wantNative <= 0) return gs;

  let next = gs;
  let gotNative = wantNative;

  if (src.kind === 'station') {
    // Dip into the station's own body: a vat, a cask, the butchery's catch. It empties by exactly
    // what the vessel takes, and the colony's ledger follows because station fluid is counted stock.
    const b = gs.buildings?.find((x) => x.id === src.buildingId);
    const entry = b?.fluidContents?.find((e) => e.itemId === itemId);
    const held = entry?.litres ?? 0;
    if (held <= 0) return gs;
    gotNative = Math.min(wantNative, held);
    const buildings = (gs.buildings ?? []).map((x) =>
      x.id === src.buildingId
        ? {
            ...x,
            fluidContents: (x.fluidContents ?? [])
              .map((e) =>
                e.itemId === itemId
                  ? { ...e, litres: Math.round((e.litres ?? 0) - gotNative) / 1 }
                  : e
              )
              .filter((e) => (e.litres ?? 0) > 0.0001)
          }
        : x
    );
    next = withDrops({ ...gs, buildings }, gs.droppedItems ?? []);
  } else if (src.kind === 'vessel') {
    // Rehoming an orphan out of another vessel — it is colony stock, so it is paid for out of stock.
    const wantUnits = wantNative;
    const have = availableQuantityFromDrops(gs.droppedItems, itemId);
    const takeUnits = Math.min(wantUnits, have);
    if (takeUnits <= 0) return gs;
    next = consumeFromStockpiles(gs, { [itemId]: takeUnits });
    gotNative = takeUnits;
  }
  // 'world' costs the colony nothing — that is what a river is.

  const pawns = next.pawns.map((p) => {
    if (p.id !== pawnId) return p;
    const instances = (p.inventory?.instances ?? []).map((i) => {
      if (i.instanceId !== job.vesselInstanceId) return i;
      const copy: ItemInstance = { ...i, contents: i.contents?.map((e) => ({ ...e })) };
      putIn(copy, itemId, gotNative);
      // What the colony deliberately put in stays on the vessel's list, so the next hauler does not
      // read it as an orphan and immediately start looking for somewhere else to pour it.
      copy.filter = [...new Set([...(copy.filter ?? []), itemId])];
      return copy;
    });
    return { ...p, inventory: { ...(p.inventory ?? { items: {} }), instances } };
  });
  void itemService; // carry budget is enforced when the pawn next picks anything up
  return { ...next, pawns };
}
