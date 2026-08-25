import type { GameState, Pawn, ItemInstance } from '../../core/types';
import { itemService } from '../../services/ItemService';
import { socialService } from '../../services/SocialService';
import { PAWN_STATE } from './pawnStates';

export const CARRIED_PAWN_ITEM = 'carried_pawn';
const carriedInstanceId = (victimId: string) => `carried-${victimId}`;

export function isCarriedPawnInstance(inst: ItemInstance): boolean {
  return inst.itemId === CARRIED_PAWN_ITEM;
}

export function tileHasBody(gs: GameState, x: number, y: number, except: string[] = []): boolean {
  const onPawn = gs.pawns.some(
    (p) =>
      p.isAlive !== false &&
      !p.carriedBy &&
      !except.includes(p.id) &&
      p.position?.x === x &&
      p.position?.y === y
  );
  if (onPawn) return true;
  return (gs.mobs ?? []).some(
    (m) => m.state !== 'Corpse' && !except.includes(m.id) && m.x === x && m.y === y
  );
}

export function freeDropTileNear(
  gs: GameState,
  x: number,
  y: number,
  victimId: string
): { x: number; y: number } {
  const except = [victimId];
  const free = (tx: number, ty: number) =>
    gs.worldMap?.[ty]?.[tx]?.walkable && !tileHasBody(gs, tx, ty, except);
  if (free(x, y)) return { x, y };
  for (let r = 1; r <= 6; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (free(x + dx, y + dy)) return { x: x + dx, y: y + dy };
      }
    }
  }
  return { x, y };
}

function isActivelyCarrying(carrier: Pawn | undefined, victimId: string): boolean {
  if (!carrier || carrier.isAlive === false) return false;
  if (
    carrier.drafted === true &&
    carrier.draftTarget?.type === 'rescue' &&
    carrier.draftTarget.victimId === victimId
  )
    return true;
  return carrier.currentState === PAWN_STATE.RESCUING && carrier.activeJob?.patientId === victimId;
}

export function pickUpPawn(gs: GameState, carrierId: string, victimId: string): GameState {
  const victim = gs.pawns.find((p) => p.id === victimId);
  if (!victim || victim.carriedBy === carrierId) return gs;
  const carrier = gs.pawns.find((p) => p.id === carrierId);
  if (carrier && !victim.carriedBy) gs = socialService.onRescue(gs, carrier, victim);
  const inst: ItemInstance = {
    instanceId: carriedInstanceId(victimId),
    itemId: CARRIED_PAWN_ITEM,
    durability: 1,
    name: itemService.makeDynamicName(CARRIED_PAWN_ITEM, victim.name)
  };
  return {
    ...gs,
    pawns: gs.pawns.map((p) => {
      if (p.id === victimId) return { ...p, carriedBy: carrierId, path: [], isMoving: false };
      if (p.id === carrierId) {
        const instances = (p.inventory?.instances ?? []).filter(
          (i) => i.instanceId !== inst.instanceId
        );
        return {
          ...p,
          inventory: {
            ...(p.inventory ?? { items: {}, instances: [] }),
            instances: [...instances, inst]
          }
        };
      }
      return p;
    })
  };
}

export function dropCarriedPawn(
  gs: GameState,
  carrierId: string,
  victimId: string,
  x: number,
  y: number
): GameState {
  const st: string = carriedInstanceId(victimId);
  return {
    ...gs,
    pawns: gs.pawns.map((p) => {
      if (p.id === victimId)
        return { ...p, position: { x, y }, path: [], isMoving: false, carriedBy: undefined };
      if (p.id === carrierId && p.inventory?.instances?.length) {
        return {
          ...p,
          inventory: {
            ...p.inventory,
            instances: p.inventory.instances.filter((i) => i.instanceId !== st)
          }
        };
      }
      return p;
    })
  };
}

export function reconcileCarriedPawns(gs: GameState): GameState {
  const anyCarry = gs.pawns.some(
    (p) => p.carriedBy || p.inventory?.instances?.some(isCarriedPawnInstance)
  );
  if (!anyCarry) return gs;

  const byId = new Map(gs.pawns.map((p) => [p.id, p]));
  for (const victim of gs.pawns) {
    if (!victim.carriedBy) continue;
    const carrier = byId.get(victim.carriedBy);
    if (!isActivelyCarrying(carrier, victim.id)) {
      const base = carrier?.position ?? victim.position ?? { x: 0, y: 0 };
      const at = freeDropTileNear(gs, base.x, base.y, victim.id);
      gs = dropCarriedPawn(gs, victim.carriedBy, victim.id, at.x, at.y);
    }
  }
  const carriedToCarrier = new Map<string, string>();
  for (const v of gs.pawns) if (v.carriedBy) carriedToCarrier.set(v.id, v.carriedBy);
  gs = {
    ...gs,
    pawns: gs.pawns.map((p) => {
      const insts = p.inventory?.instances;
      if (!insts?.some(isCarriedPawnInstance)) return p;
      const kept = insts.filter(
        (i) =>
          !isCarriedPawnInstance(i) ||
          carriedToCarrier.get(i.instanceId.replace(/^carried-/, '')) === p.id
      );
      return kept.length === insts.length
        ? p
        : { ...p, inventory: { ...p.inventory!, instances: kept } };
    })
  };
  return gs;
}

export function separateStackedBodies(gs: GameState): GameState {
  const seen = new Set<string>();
  for (const p of gs.pawns) {
    if (p.isAlive === false || p.carriedBy || !p.position) continue;
    const k = `${p.position.x},${p.position.y}`;
    if (!seen.has(k)) {
      seen.add(k);
      continue;
    }
    const at = freeDropTileNear(gs, p.position.x, p.position.y, p.id);
    if (at.x === p.position.x && at.y === p.position.y) continue;
    return {
      ...gs,
      pawns: gs.pawns.map((q) =>
        q.id === p.id
          ? { ...q, position: { x: at.x, y: at.y }, path: [], pathIndex: 0, isMoving: false }
          : q
      )
    };
  }
  for (const m of gs.mobs ?? []) {
    if (m.state === 'Corpse') continue;
    const k = `${m.x},${m.y}`;
    if (!seen.has(k)) {
      seen.add(k);
      continue;
    }
    const at = freeDropTileNear(gs, m.x, m.y, m.id);
    if (at.x === m.x && at.y === m.y) continue;
    return {
      ...gs,
      mobs: (gs.mobs ?? []).map((q) =>
        q.id === m.id ? { ...q, x: at.x, y: at.y, path: [], pathIndex: 0 } : q
      )
    };
  }
  return gs;
}
