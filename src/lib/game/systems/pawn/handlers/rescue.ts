/** pawn/handlers/rescue — the RESCUING state: a colonist fetches a COLLAPSED ally and carries it to
 *  shelter so it recovers somewhere safe/dry instead of dying exposed or in danger. A plain
 *  (pawn, gameState) => GameState handler, wired into the dispatcher like the others.
 *
 *  Two phases (pawn.rescue.carrying):
 *    • reach — walk to the downed pawn; on arrival pick a shelter destination and flip `carrying`.
 *    • carry — head to that shelter; the victim's position MIRRORS the carrier each tick (no separate
 *      "carried" entity), and it's laid down on the destination tile. If the victim wakes up en route,
 *      or the shelter/victim becomes unreachable, it's set down where the carrier stands. */
import type { GameState, Pawn } from '../../../core/types';
import { manhattan } from '../../../core/distance';
import { pawnById } from '../../../core/pawnIndex';
import { PAWN_STATE } from '../pawnStates';
import { isAdjacent } from '../pawnQueries';
import { tryAssignPath, mutatePawn, goIdle, REST_TYPES } from '../pawnHelpers';

/** Nearest COMPLETE rest building (bed/shelter) tile to (x,y), or null when the colony has none. */
function nearestShelterTile(gs: GameState, x: number, y: number): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (const b of gs.buildings ?? []) {
    if (b.status !== 'complete' || !REST_TYPES.includes(b.type)) continue;
    const d = manhattan(b.x, b.y, x, y);
    if (d < bestD) {
      bestD = d;
      best = { x: b.x, y: b.y };
    }
  }
  return best;
}

/** Does the colony have anywhere to carry a rescued pawn? The `rescuePawn` command refuses early when not. */
export function hasShelter(gs: GameState): boolean {
  return (gs.buildings ?? []).some((b) => b.status === 'complete' && REST_TYPES.includes(b.type));
}

/** End the rescue: set down any carried victim where the carrier stands, clear the order, go idle. */
function abortRescue(pawn: Pawn, gs: GameState): GameState {
  const r = pawn.rescue;
  if (r?.carrying && pawn.position) {
    const at = { x: pawn.position.x, y: pawn.position.y };
    gs = mutatePawn(gs, r.victimId, (v) => {
      v.position = at;
    });
  }
  gs = mutatePawn(gs, pawn.id, (p) => {
    p.rescue = undefined;
  });
  return goIdle(pawn, gs);
}

export function handleRescuing(pawn: Pawn, gameState: GameState): GameState {
  const r = pawn.rescue;
  if (!r || !pawn.position) return abortRescue(pawn, gameState);
  const victim = pawnById(gameState.pawns, r.victimId);
  if (!victim || !victim.position || victim.isAlive === false) return abortRescue(pawn, gameState);

  const here = pawn.position;

  if (!r.carrying) {
    // Victim recovered before we reached it → nothing left to rescue.
    if (victim.currentState !== PAWN_STATE.COLLAPSED) return abortRescue(pawn, gameState);
    const atVictim =
      isAdjacent(here.x, here.y, victim.position.x, victim.position.y) ||
      (here.x === victim.position.x && here.y === victim.position.y);
    if (atVictim) {
      const dest = nearestShelterTile(gameState, victim.position.x, victim.position.y);
      if (!dest) return abortRescue(pawn, gameState); // shelter gone since dispatch
      return mutatePawn(gameState, pawn.id, (p) => {
        p.rescue = { victimId: r.victimId, carrying: true, destX: dest.x, destY: dest.y };
        p.path = [];
        p.isMoving = false;
      });
    }
    // Walk to the (stationary) downed pawn; abort if it can't be reached.
    if (!pawn.isMoving || (pawn.path?.length ?? 0) === 0) {
      return (
        tryAssignPath(pawn, victim.position.x, victim.position.y, gameState) ??
        abortRescue(pawn, gameState)
      );
    }
    return gameState;
  }

  // Carrying. Lay the victim down once we reach the shelter — or wherever we stand if it woke up.
  const atDest =
    (here.x === r.destX && here.y === r.destY) || isAdjacent(here.x, here.y, r.destX, r.destY);
  if (atDest || victim.currentState !== PAWN_STATE.COLLAPSED) {
    const lx = atDest ? r.destX : here.x;
    const ly = atDest ? r.destY : here.y;
    let gs = mutatePawn(gameState, r.victimId, (v) => {
      v.position = { x: lx, y: ly };
      v.path = [];
      v.isMoving = false;
    });
    gs = mutatePawn(gs, pawn.id, (p) => {
      p.rescue = undefined;
    });
    return goIdle(pawn, gs);
  }
  // Mirror the victim onto the carrier and advance toward the shelter.
  const gs = mutatePawn(gameState, r.victimId, (v) => {
    v.position = { x: here.x, y: here.y };
  });
  if (!pawn.isMoving || (pawn.path?.length ?? 0) === 0) {
    return tryAssignPath(pawn, r.destX, r.destY, gs) ?? abortRescue(pawn, gs);
  }
  return gs;
}
