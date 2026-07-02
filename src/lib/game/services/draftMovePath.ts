/**
 * draftMovePath — the single A* path-assignment for a drafted pawn's MOVE order.
 *
 * Shared by the per-tick draft-order pass (`GameEngineImpl._processDraftOrders`) and the draft-move
 * commands (`setPawnDraftTarget` / `movePawnsFormation` in sim/commands.ts). Computing the path at
 * COMMAND time — not only on a sim tick — is what lets the move-preview line trace the real route the
 * instant the order is issued, including while the game is PAUSED (commands apply regardless of pause,
 * the tick does not run). The per-tick pass remains and recomputes once the sim advances; this is
 * idempotent with it.
 *
 * Worker-safe (pure transform over the service interfaces; no DOM/Svelte) so it runs in the sim worker.
 */
import type { GameState, Pawn } from '../core/types';
import { occupancyService } from './OccupancyService';
import { buildPathfindingGridsSoftBlocked, pathfinderService } from './PathfinderService';
import { pawnService } from './PawnService';

/**
 * Assign `pawn`'s A* path toward (tx,ty) and return the updated state. `blocked` (solid-body
 * occupancy) can be precomputed once when pathing many pawns in a loop. No-op (returns `gs`) if the
 * pawn has no position, the pathfinder isn't ready yet, or no route exists; clears the path when the
 * pawn already stands on the target.
 */
export function assignDraftMovePath(
  gs: GameState,
  pawn: Pawn,
  tx: number,
  ty: number,
  blocked?: Set<string>
): GameState {
  if (!pawn.position) return gs;
  if (pawn.position.x === tx && pawn.position.y === ty) {
    return pawnService.assignPath(pawn.id, [], gs);
  }
  if (!pathfinderService.isReady()) return gs;
  const b = blocked ?? occupancyService.blockedTiles(gs);
  const { walkable, costs, width, height } = buildPathfindingGridsSoftBlocked(
    gs.worldMap,
    b,
    pawn.position.x,
    pawn.position.y,
    tx,
    ty
  );
  const path = pathfinderService.findPath(
    walkable,
    costs,
    width,
    height,
    pawn.position.x,
    pawn.position.y,
    tx,
    ty
  );
  if (path && path.length > 0) return pawnService.assignPath(pawn.id, path, gs);
  return gs;
}
