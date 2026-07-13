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
import { socialService } from '../../services/SocialService';

/** The hidden stand-in item id (items.jsonc). */
export const CARRIED_PAWN_ITEM = 'carried_pawn';
/** Stable instance id for the body a given victim becomes while carried. */
const carriedInstanceId = (victimId: string) => `carried-${victimId}`;

/** Is this instance a carried-colonist stand-in? */
export function isCarriedPawnInstance(inst: ItemInstance): boolean {
  return inst.itemId === CARRIED_PAWN_ITEM;
}

/** Is a solid BODY — a living, non-carried pawn OR a non-corpse mob — standing on (x,y), other than the
 *  listed ids? A tile holds at most ONE body (the same rule OccupancyService enforces for movement), so
 *  any set-down/destination tile must avoid these so a pawn or mob never glitches onto a cell another
 *  body already holds. The mob arm is what was missing: a tile under a downed/sleeping wolf used to read
 *  as free, so a carried colonist got laid down on top of it. */
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

/** Nearest walkable tile with NO body to (x,y) — (x,y) itself when clear, else a spiral outward. Used to
 *  set a carried colonist down without stacking it on another body. The carrier is NOT excluded (it
 *  occupies its own tile), so the body always lands BESIDE the carrier, never under it. Falls back to
 *  (x,y) only when nothing free is found within the search radius. */
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
  // SOCIAL-LAYER: being carried out of danger forges a bond (+relationship, a gratitude mood).
  // Fires on the FIRST pickup only, not a mid-haul carrier swap.
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
      // Set down on a FREE tile near the carrier so the body never lands on top of another body.
      const at = freeDropTileNear(gs, base.x, base.y, victim.id);
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

/**
 * De-overlap safety net — enforce the one-body-per-tile invariant at runtime. The set-down rules
 * (freeDropTileNear/tileHasBody) and movement (OccupancyService) prevent NEW stacks, but a pre-existing
 * save (the wolf-on-colonist the player reported) or any future slip could still leave two bodies on one
 * tile. Each call finds the first overcrowded tile and nudges ONE intruder onto the nearest free walkable
 * tile. Pawns are scanned before mobs, so the first body on a tile keeps its spot (a resting colonist
 * stays) and the wandering/downed mob is the one moved; the moved body drops its path so its FSM re-plans.
 * One nudge per call keeps it collision-free (a stack of N clears over N−1 calls) and cheap. Returns the
 * state unchanged when nothing overlaps — the common case — so the caller can throttle it freely.
 */
export function separateStackedBodies(gs: GameState): GameState {
  const seen = new Set<string>();
  // Pawns first: a body already on a tile stays; a later body on the same tile is the one relocated.
  for (const p of gs.pawns) {
    if (p.isAlive === false || p.carriedBy || !p.position) continue;
    const k = `${p.position.x},${p.position.y}`;
    if (!seen.has(k)) {
      seen.add(k);
      continue;
    }
    const at = freeDropTileNear(gs, p.position.x, p.position.y, p.id);
    if (at.x === p.position.x && at.y === p.position.y) continue; // boxed in — leave rather than churn
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
