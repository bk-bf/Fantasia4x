/** pawn/carry — carrying a downed colonist as CARGO.
 *
 *  A rescuer carries a COLLAPSED ally by holding the real (live) pawn entity in `gs.pawns` but HIDDEN
 *  (`victim.carriedBy = carrier.id`, skipped by the renderer) and stowing a visible, capacity-counted
 *  stand-in — a `carried_pawn` ItemInstance named after the victim (the same `dynamicName` trick the
 *  carcass uses) — in the carrier's inventory. So the body "appears" in the carry list and eats the
 *  carrier's carry budget, exactly like any other cargo, while the hidden pawn stays the source of
 *  truth for its wounds. Dropping restores the pawn at the drop tile and removes the stand-in.
 *
 *  The carry itself is a drafted `rescue` order (GameEngineImpl._processDraftOrders) — drafted pawns
 *  skip the needs/jobs FSM, so the carrier can't wander off mid-carry. `reconcileCarriedPawns` is the
 *  safety net: any body whose carrier is no longer validly carrying it is set down on the spot, so a
 *  carried pawn can NEVER vanish (the bug this module replaced). */
import type { GameState, Pawn, ItemInstance } from '../../core/types';
import { itemService } from '../../services/ItemService';

/** The hidden stand-in item id (items.jsonc). */
export const CARRIED_PAWN_ITEM = 'carried_pawn';
/** Stable instance id for the body a given victim becomes while carried. */
const carriedInstanceId = (victimId: string) => `carried-${victimId}`;

/** Is this instance a carried-colonist stand-in? */
export function isCarriedPawnInstance(inst: ItemInstance): boolean {
  return inst.itemId === CARRIED_PAWN_ITEM;
}

/** Is a LIVING, non-carried pawn (other than the listed ids) standing on (x,y)? A shelter/bed holds
 *  ONE body, so a tile with someone already on it is full — both the carry destination and the set-down
 *  tile must avoid these so two pawns never glitch onto the same cell. */
export function tileHasPawn(gs: GameState, x: number, y: number, except: string[] = []): boolean {
  return gs.pawns.some(
    (p) =>
      p.isAlive !== false &&
      !p.carriedBy &&
      !except.includes(p.id) &&
      p.position?.x === x &&
      p.position?.y === y
  );
}

/** Nearest walkable, unoccupied tile to (x,y) — (x,y) itself when free, else a spiral outward. Used to
 *  set a carried colonist down without stacking it on top of another pawn. Falls back to (x,y). */
export function freeDropTileNear(
  gs: GameState,
  x: number,
  y: number,
  carrierId: string,
  victimId: string
): { x: number; y: number } {
  const except = [carrierId, victimId];
  const free = (tx: number, ty: number) =>
    gs.worldMap?.[ty]?.[tx]?.walkable && !tileHasPawn(gs, tx, ty, except);
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

/** Does this pawn validly count `victim` as carried right now? — it's drafted with the live rescue
 *  order for that victim. (The carry is drafted-only, so this is the single source of "still carrying".) */
function isActivelyCarrying(carrier: Pawn | undefined, victimId: string): boolean {
  return (
    !!carrier &&
    carrier.isAlive !== false &&
    carrier.drafted === true &&
    carrier.draftTarget?.type === 'rescue' &&
    carrier.draftTarget.victimId === victimId
  );
}

/** Pick `victim` up into `carrier`'s arms: hide the victim (carriedBy) and add the named stand-in to
 *  the carrier's inventory instances. Idempotent — a second call won't duplicate the body. */
export function pickUpPawn(gs: GameState, carrierId: string, victimId: string): GameState {
  const victim = gs.pawns.find((p) => p.id === victimId);
  if (!victim || victim.carriedBy === carrierId) return gs;
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

/** Lay the carried victim down at (x,y): restore its position, un-hide it, and strip the stand-in from
 *  the carrier's inventory. Used by a normal shelter drop AND by the reconcile safety net. */
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

/**
 * Self-healing pass: drop any carried body whose carrier stopped carrying it (un-drafted, re-ordered,
 * dead, gone) and sweep up orphaned stand-in instances. Guarantees a carried pawn re-appears on the
 * map instead of vanishing. Cheap no-op when nobody is carrying anyone (the common case).
 */
export function reconcileCarriedPawns(gs: GameState): GameState {
  const anyCarry = gs.pawns.some(
    (p) => p.carriedBy || p.inventory?.instances?.some(isCarriedPawnInstance)
  );
  if (!anyCarry) return gs;

  const byId = new Map(gs.pawns.map((p) => [p.id, p]));
  // 1. Set down victims whose carrier is no longer validly carrying them.
  for (const victim of gs.pawns) {
    if (!victim.carriedBy) continue;
    const carrier = byId.get(victim.carriedBy);
    if (!isActivelyCarrying(carrier, victim.id)) {
      const base = carrier?.position ?? victim.position ?? { x: 0, y: 0 };
      // Set down on a FREE tile near the carrier so the body never lands on top of another pawn.
      const at = freeDropTileNear(gs, base.x, base.y, victim.carriedBy, victim.id);
      gs = dropCarriedPawn(gs, victim.carriedBy, victim.id, at.x, at.y);
    }
  }
  // 2. Sweep stand-in instances no longer backed by a victim carried by THIS pawn (e.g. the victim
  //    died/was reaped while carried) so a body item can't linger in someone's pack.
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
