import type { GameState, Pawn } from '../core/types';
import { occupancyService } from './OccupancyService';
import { findPathSoftBlocked, pathfinderService } from './PathfinderService';
import { pawnService } from './PawnService';

export function assignDraftMovePath(
  gs: GameState,
  pawn: Pawn,
  tx: number,
  ty: number,
  blocked?: Set<number>
): GameState {
  if (!pawn.position) return gs;
  if (pawn.position.x === tx && pawn.position.y === ty) {
    return pawnService.assignPath(pawn.id, [], gs);
  }
  if (!pathfinderService.isReady()) return gs;
  const b = blocked ?? occupancyService.blockedTiles(gs);
  const path = findPathSoftBlocked(gs.worldMap, b, pawn.position.x, pawn.position.y, tx, ty);
  if (path && path.length > 0) return pawnService.assignPath(pawn.id, path, gs);
  return gs;
}
