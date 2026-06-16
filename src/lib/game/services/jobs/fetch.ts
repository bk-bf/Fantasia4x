// Fetch job handler (ADR-016 / ADR-017). Emits one fetch job per reserved input/build-material stack
// still sitting on a stockpile tile and, on completion, lifts the reserved drop into the carrying
// pawn's inventory tagged with the owning order/building so the FSM stages it on the destination
// tile. Extracted from JobService (P-4 handler split).
import type { GameState, Job } from '../../core/types';
import { itemService } from '../ItemService';
import { stationTileFor } from './staging';

export function generate(jobs: Job[], gs: GameState): Job[] {
  // Drop fetch jobs whose owner (craft order OR building) or source drop is gone / already moved.
  jobs = jobs.filter((j) => {
    if (j.type !== 'fetch') return true;
    const owner = j.craftQueueId ?? j.buildingId;
    if (!owner) return false;
    const ownerExists = j.craftQueueId
      ? (gs.craftingQueue ?? []).some((e) => e.id === j.craftQueueId)
      : (gs.buildings ?? []).some((b) => b.id === j.buildingId && b.status !== 'complete');
    if (!ownerExists) return false;
    // Match the drop reserved for THIS owner — not merely the first drop sharing the id. Reserved
    // stacks can share an id (legacy saves from the `slice(-6)` collision); keying on id alone made
    // the filter inspect a sibling wall's `reservedFor`, cull the valid job, and churn it every tick.
    const src = (gs.droppedItems ?? []).find(
      (d) => d.id === j.droppedItemId && d.reservedFor === owner
    );
    return !!src;
  });

  const addFetchJobs = (
    ownerId: string,
    dest: { x: number; y: number },
    buildingId: string | undefined,
    craftQueueId: string | undefined
  ) => {
    for (const drop of gs.droppedItems ?? []) {
      if (!drop.stored || drop.reservedFor !== ownerId) continue;
      if (drop.x === dest.x && drop.y === dest.y) continue; // already staged at the destination
      // Dedup per (drop, owner): with colliding drop ids, distinct owners must still each get a job.
      const exists = jobs.some(
        (j) =>
          j.type === 'fetch' &&
          j.droppedItemId === drop.id &&
          (j.craftQueueId ?? j.buildingId) === ownerId
      );
      if (exists) continue;
      jobs.push({
        // Deterministic + stable per (drop, owner): no `Date.now()`, so a transient filter miss
        // can no longer re-mint a new id and dangle a pawn's claim (the oscillation's amplifier).
        id: `fetch-${drop.id}-${ownerId}`,
        type: 'fetch',
        targetX: drop.x,
        targetY: drop.y,
        resourceId: drop.resourceId,
        droppedItemId: drop.id,
        craftQueueId,
        buildingId,
        stationX: dest.x,
        stationY: dest.y,
        workRequired: 1, // instant pick-up on arrival
        workDone: 0,
        claimedBy: null
      });
    }
  };

  // Craft orders: carry reserved inputs to the workstation tile.
  for (const order of gs.craftingQueue ?? []) {
    const station = stationTileFor(order, gs);
    if (!station) continue;
    addFetchJobs(order.id, station, order.stationBuildingId, order.id);
  }

  // Buildings under construction: carry reserved build materials to the build site (ADR-016).
  for (const b of gs.buildings ?? []) {
    if (b.status === 'complete') continue;
    addFetchJobs(b.id, { x: b.x, y: b.y }, b.id, undefined);
  }

  return jobs;
}

export function complete(job: Job, gs: GameState): GameState {
  // The reservation owner is a craft order (craftQueueId) OR a building (buildingId).
  const owner = job.craftQueueId ?? job.buildingId;
  if (!job.droppedItemId || !owner) return gs;
  const drop = (gs.droppedItems ?? []).find((d) => d.id === job.droppedItemId);
  if (!drop) return gs;
  const pawnId = job.claimedBy;
  if (!pawnId) return gs;
  const pawn = gs.pawns.find((p) => p.id === pawnId);
  if (!pawn) return gs;

  // R5 carry budget: take only what fits; the rest stays reserved on the stockpile tile and a
  // fresh fetch job is generated for it (another trip / another pawn).
  const taken = itemService.clampPickupQuantity(pawn, drop.resourceId, drop.quantity, gs);
  if (taken <= 0) return gs;
  const remainder = drop.quantity - taken;
  const newDropped =
    remainder > 0
      ? (gs.droppedItems ?? []).map((d) => (d.id === drop.id ? { ...d, quantity: remainder } : d))
      : (gs.droppedItems ?? []).filter((d) => d.id !== drop.id);

  const newPawns = gs.pawns.map((p) => {
    if (p.id !== pawnId) return p;
    const inv = p.inventory ?? {
      items: {},
      instances: [],
      weightKg: 0,
      maxWeightKg: 20,
      volumeL: 0,
      maxVolumeL: 20
    };
    const newItems = { ...inv.items };
    newItems[drop.resourceId] = (newItems[drop.resourceId] ?? 0) + taken;
    return { ...p, inventory: { ...inv, items: newItems }, carryingForOrder: owner };
  });
  return { ...gs, droppedItems: newDropped, pawns: newPawns };
}
