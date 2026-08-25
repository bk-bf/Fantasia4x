import type { GameState, Pawn } from '../../../core/types';
import { manhattan } from '../../../core/util/distance';
import { isRestBuildingType, tryAssignPath, goIdle, mutatePawn } from '../pawnHelpers';
import { tileHasBody, pickUpPawn, dropCarriedPawn, freeDropTileNear } from '../carry';
import { isAdjacent } from '../pawnQueries';
import { PAWN_STATE } from '../pawnStates';
import { pawnById } from '../../../core/state/pawnIndex';
import { jobService } from '../../../services/JobService';

export function nearestShelterTile(
  gs: GameState,
  x: number,
  y: number
): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (const b of gs.buildings ?? []) {
    if (b.status !== 'complete' || !isRestBuildingType(b.type)) continue;
    if (tileHasBody(gs, b.x, b.y)) continue;
    const d = manhattan(b.x, b.y, x, y);
    if (d < bestD) {
      bestD = d;
      best = { x: b.x, y: b.y };
    }
  }
  return best;
}

export function hasShelter(gs: GameState): boolean {
  return (gs.buildings ?? []).some((b) => b.status === 'complete' && isRestBuildingType(b.type));
}

export function handleRescuing(pawn: Pawn, gs: GameState): GameState {
  const aj = pawn.activeJob;
  const victimId = aj?.patientId;
  const here = pawn.position;

  const finish = (state: GameState): GameState => {
    const s = aj?.jobId ? jobService.releaseJob(pawn.id, aj.jobId, state) : state;
    return goIdle(pawnById(s.pawns, pawn.id) ?? pawn, s);
  };
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
    if (victim.currentState !== PAWN_STATE.COLLAPSED) return finish(gs);
    if (
      isAdjacent(here.x, here.y, victim.position.x, victim.position.y) ||
      (here.x === victim.position.x && here.y === victim.position.y)
    ) {
      return pickUpPawn(halt(gs), pawn.id, victimId);
    }
    const afterPath = tryAssignPath(pawn, victim.position.x, victim.position.y, gs);
    return afterPath ?? finish(gs);
  }

  const dest = nearestShelterTile(gs, here.x, here.y);
  if (!dest) return finish(setDownBeside(gs, here.x, here.y));
  if ((here.x === dest.x && here.y === dest.y) || isAdjacent(here.x, here.y, dest.x, dest.y)) {
    return finish(dropCarriedPawn(halt(gs), pawn.id, victimId, dest.x, dest.y));
  }
  const afterPath = tryAssignPath(pawn, dest.x, dest.y, gs);
  return afterPath ?? finish(setDownBeside(gs, here.x, here.y));
}
