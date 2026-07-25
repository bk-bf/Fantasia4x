/** pawn/handlers/rescue — shelter lookup for the carry-to-shelter order.
 *
 *  Carrying a downed colonist is now a drafted `rescue` order driven by GameEngineImpl._processDraftOrders
 *  (the carry/drop cargo logic lives in systems/pawn/carry.ts). All that remains here is the shared
 *  "where do I take them?" query — the nearest complete rest building. */
import type { GameState, Pawn } from '../../../core/types';
import { manhattan } from '../../../core/distance';
import { isRestBuildingType, tryAssignPath, goIdle, mutatePawn } from '../pawnHelpers';
import { tileHasBody, pickUpPawn, dropCarriedPawn, freeDropTileNear } from '../carry';
import { isAdjacent } from '../pawnQueries';
import { PAWN_STATE } from '../pawnStates';
import { pawnById } from '../../../core/pawnIndex';
import { jobService } from '../../../services/JobService';

/** Nearest COMPLETE rest building (bed/shelter) tile to (x,y) that is NOT already occupied by another
 *  pawn — a shelter holds one body, so a carrier never delivers onto an occupied bed (which glitched
 *  two pawns onto one tile). Returns null when the colony has no FREE shelter. */
export function nearestShelterTile(
  gs: GameState,
  x: number,
  y: number
): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (const b of gs.buildings ?? []) {
    if (b.status !== 'complete' || !isRestBuildingType(b.type)) continue;
    if (tileHasBody(gs, b.x, b.y)) continue; // bed taken (pawn or mob) — one body per shelter
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
  return (gs.buildings ?? []).some((b) => b.status === 'complete' && isRestBuildingType(b.type));
}

/**
 * FSM handler for the `Rescuing` state — the auto CARETAKING rescue job (jobs/rescue.ts), the non-drafted
 * twin of the drafted `rescue` order (GameEngineImpl._processDraftOrders). Same carry shape as hauling:
 * walk to the downed colonist → lift it (`pickUpPawn` — a `carried_pawn` in the pack) → carry to the
 * nearest FREE shelter → lay it down (`dropCarriedPawn`), then release the job and stand back to Idle.
 * `reconcileCarriedPawns` is the safety net if this pawn is pulled off mid-carry (combat/collapse).
 */
export function handleRescuing(pawn: Pawn, gs: GameState): GameState {
  const aj = pawn.activeJob;
  const victimId = aj?.patientId;
  const here = pawn.position;

  // Release the claimed rescue job and stand back to Idle (carry finished or aborted).
  const finish = (state: GameState): GameState => {
    const s = aj?.jobId ? jobService.releaseJob(pawn.id, aj.jobId, state) : state;
    return goIdle(pawnById(s.pawns, pawn.id) ?? pawn, s);
  };
  // Set the carried body down on a free tile beside the carrier (never on it).
  const setDownBeside = (state: GameState, x: number, y: number): GameState => {
    const t = freeDropTileNear(state, x, y, victimId!);
    return dropCarriedPawn(state, pawn.id, victimId!, t.x, t.y);
  };
  const halt = (state: GameState): GameState =>
    mutatePawn(state, pawn.id, (p) => {
      p.path = [];
      p.isMoving = false;
    });

  if (!victimId || !here) return finish(gs);
  const victim = gs.pawns.find((p) => p.id === victimId);
  const carrying = victim?.carriedBy === pawn.id;

  if (!victim || victim.isAlive === false || !victim.position) {
    return finish(carrying ? setDownBeside(gs, here.x, here.y) : gs);
  }

  if (!carrying) {
    // Reach phase — recovered before we arrived → release; adjacent → lift; else walk to the victim.
    if (victim.currentState !== PAWN_STATE.COLLAPSED) return finish(gs);
    if (
      isAdjacent(here.x, here.y, victim.position.x, victim.position.y) ||
      (here.x === victim.position.x && here.y === victim.position.y)
    ) {
      return pickUpPawn(halt(gs), pawn.id, victimId); // stays Rescuing → carry phase next tick
    }
    const afterPath = tryAssignPath(pawn, victim.position.x, victim.position.y, gs);
    return afterPath ?? finish(gs); // unreachable → give the job back to the pool
  }

  // Carry phase — head to the nearest free shelter and lay the body down on arrival.
  const dest = nearestShelterTile(gs, here.x, here.y);
  if (!dest) return finish(setDownBeside(gs, here.x, here.y)); // no free shelter → set down where we are
  if ((here.x === dest.x && here.y === dest.y) || isAdjacent(here.x, here.y, dest.x, dest.y)) {
    return finish(dropCarriedPawn(halt(gs), pawn.id, victimId, dest.x, dest.y));
  }
  const afterPath = tryAssignPath(pawn, dest.x, dest.y, gs);
  return afterPath ?? finish(setDownBeside(gs, here.x, here.y));
}
