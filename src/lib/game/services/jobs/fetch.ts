import type { GameState, Job } from '../../core/types';
import { itemService } from '../ItemService';
import { stationTileFor } from './staging';

export function generate(jobs: Job[], gs: GameState): Job[] {
  jobs = jobs.filter((j) => {
    if (j.type !== 'fetch') return true;
    const owner = j.craftQueueId ?? j.buildingId;
    if (!owner) return false;
    const ownerExists = j.craftQueueId
      ? (gs.craftingQueue ?? []).some((e) => e.id === j.craftQueueId)
      : (gs.buildings ?? []).some((b) => b.id === j.buildingId && b.status !== 'complete');
    if (!ownerExists) return false;
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
      if (drop.x === dest.x && drop.y === dest.y) continue;
      const exists = jobs.some(
        (j) =>
          j.type === 'fetch' &&
          j.droppedItemId === drop.id &&
          (j.craftQueueId ?? j.buildingId) === ownerId
      );
      if (exists) continue;
      jobs.push({
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
        workRequired: 0.02,
        workDone: 0,
        claimedBy: null
      });
    }
  };

  for (const order of gs.craftingQueue ?? []) {
    const station = stationTileFor(order, gs);
    if (!station) continue;
    addFetchJobs(order.id, station, order.stationBuildingId, order.id);
  }

  for (const b of gs.buildings ?? []) {
    if (b.status === 'complete') continue;
    addFetchJobs(b.id, { x: b.x, y: b.y }, b.id, undefined);
  }

  return jobs;
}

export function complete(job: Job, gs: GameState): GameState {
  const owner = job.craftQueueId ?? job.buildingId;
  if (!job.droppedItemId || !owner) return gs;
  const drop = (gs.droppedItems ?? []).find((d) => d.id === job.droppedItemId);
  if (!drop) return gs;
  const pawnId = job.claimedBy;
  if (!pawnId) return gs;
  const pawn = gs.pawns.find((p) => p.id === pawnId);
  if (!pawn) return gs;

  const taken = itemService.clampPickupQuantity(pawn, drop.resourceId, drop.quantity, gs);
  if (taken <= 0) return gs;
  const remainder = drop.quantity - taken;
  const carcassConds = drop.unitConditions?.length ? drop.unitConditions : undefined;
  const takenConds = carcassConds?.slice(0, taken);
  const newDropped =
    remainder > 0
      ? (gs.droppedItems ?? []).map((d) =>
          d.id === drop.id
            ? {
                ...d,
                quantity: remainder,
                ...(carcassConds ? { unitConditions: carcassConds.slice(taken) } : {})
              }
            : d
        )
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
    const instances = drop.instance
      ? [...(inv.instances ?? []), drop.instance]
      : (inv.instances ?? []);
    if (!drop.instance) newItems[drop.resourceId] = (newItems[drop.resourceId] ?? 0) + taken;
    const carriedUnitConditions = takenConds
      ? {
          ...(p.carriedUnitConditions ?? {}),
          [drop.resourceId]: [...(p.carriedUnitConditions?.[drop.resourceId] ?? []), ...takenConds]
        }
      : p.carriedUnitConditions;
    return {
      ...p,
      inventory: { ...inv, items: newItems, instances },
      carryingForOrder: owner,
      carriedUnitConditions
    };
  });
  return { ...gs, droppedItems: newDropped, pawns: newPawns };
}
