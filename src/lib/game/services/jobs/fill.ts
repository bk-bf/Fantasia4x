import type { DroppedItem, GameState, ItemInstance, Job } from '../../core/types';
import { itemService } from '../ItemService';
import {
  consumeFromStockpiles,
  withDrops,
  availableQuantityFromDrops
} from '../../core/state/stockpile';
import {
  isFluidId,
  orphanedContents,
  putIn,
  roomFor,
  servingL,
  vesselAccepts,
  vesselFilterOf,
  vesselOf
} from '../../core/rules/gear/vessels';
import { manhattan } from '../../core/util/distance';

const FILL_WORK = 0.4;

interface FoundVessel {
  inst: ItemInstance;
  x: number;
  y: number;
  pawnId?: string;
  drop?: DroppedItem;
}

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

  for (const b of gs.buildings ?? []) {
    if (b.status !== 'complete') continue;
    if ((b.fluidContents ?? []).some((e) => e.itemId === itemId && (e.litres ?? 0) > 0))
      consider({ kind: 'station', x: b.x, y: b.y, buildingId: b.id });
  }

  for (const d of gs.droppedItems ?? []) {
    if (!d.stored || d.reservedFor || (d.quantity ?? 0) <= 0 || !d.instance) continue;
    if (d.instance.instanceId === exceptInstanceId) continue;
    if (orphanedContents(d.instance).some((e) => e.itemId === itemId))
      consider({ kind: 'vessel', x: d.x, y: d.y, instanceId: d.instance.instanceId });
  }

  return best;
}

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
  if (!hasAnyVessel(gs) && !jobs.some((j) => j.type === 'fill')) return jobs;

  const vessels = findVessels(gs);
  const demand = orderDemand(gs);
  const byInstance = new Map(vessels.map((v) => [v.inst.instanceId, v]));
  jobs = jobs.filter((j) => {
    if (j.type !== 'fill') return true;
    const v = j.vesselInstanceId ? byInstance.get(j.vesselInstanceId) : undefined;
    if (!v) return false;
    if (j.manual) return roomFor(v.inst, j.resourceId!, 0.001) > 0;
    return wantOf(v.inst, demand) === j.resourceId;
  });

  const manualVessels = new Set(
    jobs.filter((j) => j.type === 'fill' && j.manual).map((j) => j.vesselInstanceId)
  );
  for (const v of vessels) {
    if (v.drop?.reservedFor || manualVessels.has(v.inst.instanceId)) continue;
    const itemId = wantOf(v.inst, demand);
    if (!itemId) continue;
    const id = `fill-${v.inst.instanceId}-${itemId}`;
    if (jobs.some((j) => j.id === id)) continue;

    if (!v.pawnId) {
      if (!sourceFor(itemId, v, gs, v.inst.instanceId)) continue;
      jobs.push({
        id,
        type: 'fill',
        targetX: v.x,
        targetY: v.y,
        resourceId: itemId,
        droppedItemId: v.drop?.id,
        vesselInstanceId: v.inst.instanceId,
        workRequired: 0.02,
        workDone: 0,
        claimedBy: null
      });
      continue;
    }

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

  const src = sourceFor(itemId, { x: job.targetX, y: job.targetY }, gs, carried.instanceId);
  if (!src) return gs;
  const fluid = isFluidId(itemId);
  const wantNative = roomFor(carried, itemId, fluid ? Infinity : Number.MAX_SAFE_INTEGER);
  if (wantNative <= 0) return gs;

  let next = gs;
  let gotNative = wantNative;

  if (src.kind === 'station') {
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
    const wantUnits = wantNative;
    const have = availableQuantityFromDrops(gs.droppedItems, itemId);
    const takeUnits = Math.min(wantUnits, have);
    if (takeUnits <= 0) return gs;
    next = consumeFromStockpiles(gs, { [itemId]: takeUnits });
    gotNative = takeUnits;
  }

  const pawns = next.pawns.map((p) => {
    if (p.id !== pawnId) return p;
    const instances = (p.inventory?.instances ?? []).map((i) => {
      if (i.instanceId !== job.vesselInstanceId) return i;
      const copy: ItemInstance = { ...i, contents: i.contents?.map((e) => ({ ...e })) };
      putIn(copy, itemId, gotNative);
      copy.filter = [...new Set([...(copy.filter ?? []), itemId])];
      return copy;
    });
    return { ...p, inventory: { ...(p.inventory ?? { items: {} }), instances } };
  });
  void itemService;
  return { ...next, pawns };
}
