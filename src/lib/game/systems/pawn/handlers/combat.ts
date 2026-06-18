/** pawn/handlers/combat — combat state handlers, extracted from PawnStateMachine (hotspot step 2). Each
 *  is a plain (pawn, gameState) => GameState function; the dispatcher wires them into the table. */
import type { GameState, Pawn } from '../../../core/types';
import { PAWN_STATE } from '../pawnStates';
import {
  findCombatThreat,
  haltMovement,
  transitionTo,
  tryAssignPath,
  tryAssignSleepPath,
  FLEE_DISTANCE,
  endHunt,
  laborLevel
} from '../pawnHelpers';
import { getRangedWeapon } from '../../rangedCombat';
import { checkNeedInterrupts } from '../needSelection';

/**
 * FIGHTING: engage the hostile. Defensive pawns stand their ground (the threat is
 * adjacent by definition); aggressive pawns close the distance first. Pawns fight
 * until knocked down — there is no automatic pain-based retreat (that caused pawns
 * to break off fights they could win / disrupt crowd control). Exits to IDLE once
 * no hostile remains in range.
 */
export function handleFighting(pawn: Pawn, gameState: GameState): GameState {
  const threat = findCombatThreat(pawn, gameState);
  if (!threat || !pawn.position) {
    return threat ? haltMovement(pawn, gameState) : transitionTo(pawn, PAWN_STATE.IDLE, gameState);
  }
  const dist = Math.max(
    Math.abs(pawn.position.x - threat.x),
    Math.abs(pawn.position.y - threat.y)
  );

  // RANGED-COMBAT: a ranged pawn stands and shoots once the threat is within weapon range (combatService
  // resolves the shot); only when the target is beyond range does it close to get into range.
  const rw = getRangedWeapon(pawn);
  if (rw) {
    if (dist <= rw.range) return haltMovement(pawn, gameState); // in range (or cornered → bow-butt): hold and fire
    if ((pawn.path?.length ?? 0) > 0) return gameState; // already closing
    const afterPath = tryAssignPath(pawn, threat.x, threat.y, gameState);
    return afterPath ?? haltMovement(pawn, gameState);
  }

  const adjacent = dist <= 1;
  if (adjacent) {
    // Stand and trade blows — combatService.tickCombat() resolves Fighting-pawn swings.
    return haltMovement(pawn, gameState);
  }
  // Not adjacent: only aggressive pawns chase a hostile down (defensive pawns only
  // ever see adjacent threats, so this is the aggressive-approach path).
  if ((pawn.combatStance ?? 'defensive') === 'aggressive') {
    if ((pawn.path?.length ?? 0) > 0) return gameState; // already approaching
    const afterPath = tryAssignPath(pawn, threat.x, threat.y, gameState);
    if (afterPath) return afterPath;
  }
  return haltMovement(pawn, gameState);
}

/**
 * FLEEING (flee stance only): break contact, pathing away from the nearest threat.
 * Stands down to IDLE once no hostile remains in vision range.
 */
export function handleFleeing(pawn: Pawn, gameState: GameState): GameState {
  const threat = findCombatThreat(pawn, gameState);
  if (!threat) {
    return transitionTo(pawn, PAWN_STATE.IDLE, gameState);
  }
  if (!pawn.position) return gameState;
  // Already retreating — let processMovement carry it along the path.
  if ((pawn.path?.length ?? 0) > 0) return gameState;

  // Path to a tile away from the threat. Clamp to map bounds; if unreachable,
  // hold and fight rather than freeze uselessly.
  const mapH = gameState.worldMap.length;
  const mapW = mapH > 0 ? gameState.worldMap[0].length : 0;
  const dx = Math.sign(pawn.position.x - threat.x) || 1;
  const dy = Math.sign(pawn.position.y - threat.y) || 1;
  const fleeX = Math.max(0, Math.min(mapW - 1, pawn.position.x + dx * FLEE_DISTANCE));
  const fleeY = Math.max(0, Math.min(mapH - 1, pawn.position.y + dy * FLEE_DISTANCE));
  const afterPath = tryAssignSleepPath(pawn, fleeX, fleeY, gameState);
  if (afterPath) return afterPath;
  return haltMovement(pawn, gameState);
}

/**
 * HUNTING: chase a marked mob and stand in melee so combatService.tickCombat() lands swings.
 * Re-paths as the quarry moves (mirrors the predator-mob hunt circuit). Survival needs still
 * interrupt the hunt; the kill itself, carcass drop, and butchery are handled downstream.
 */
export function handleHunting(pawn: Pawn, gameState: GameState): GameState {
  if (!pawn.position) return gameState;

  const target = (gameState.mobs ?? []).find(
    (m) =>
      m.id === pawn.huntTargetId && m.isAlive !== false && m.state !== 'Corpse' && m.markedForHunt
  );
  // Target dead, butchered, or un-marked — hunt over.
  if (!target) return endHunt(pawn, PAWN_STATE.IDLE, gameState);

  // R9 / ADR-010: weigh need urgency against PROXIMITY rather than a flat threshold — the "job
  // distance" is the distance to the quarry, so a pawn about to corner its prey resists breaking
  // off for distant food/rest (and still bolts when a need is critical or food/rest is close).
  const jobDist = Math.abs(pawn.position.x - target.x) + Math.abs(pawn.position.y - target.y);
  const interrupted = checkNeedInterrupts(
    pawn,
    gameState,
    'Hunting',
    jobDist,
    pawn.jobQueue ?? [],
    laborLevel(pawn, 'hunting', gameState)
  );
  if (interrupted) {
    // checkNeedInterrupts moved the pawn to its need state; also drop the hunt target.
    return {
      ...interrupted,
      pawns: interrupted.pawns.map((p) =>
        p.id === pawn.id ? { ...p, huntTargetId: undefined } : p
      )
    };
  }

  const adjacent =
    Math.max(Math.abs(pawn.position.x - target.x), Math.abs(pawn.position.y - target.y)) <= 1;
  if (adjacent) {
    // Corner the quarry into the shared prey "fight back" state — the exact hand-off the
    // predator→prey circuit performs (EntityService.stepHunting) — so the animal retaliates
    // through combatService.tickCombat instead of standing inert. Then plant and trade blows.
    const halted = haltMovement(pawn, gameState);
    return {
      ...halted,
      mobs: (halted.mobs ?? []).map((m) =>
        m.id === target.id && m.state !== 'Attacking'
          ? {
              ...m,
              state: 'Attacking',
              stateSince: gameState.turn,
              huntTargetId: pawn.id,
              path: []
            }
          : m
      )
    };
  }

  // Chase: re-path when we have no route or the quarry has drifted off the path's end tile.
  const pathEnd = pawn.path?.length ? pawn.path[pawn.path.length - 1] : null;
  const drifted =
    !pathEnd || Math.max(Math.abs(pathEnd.x - target.x), Math.abs(pathEnd.y - target.y)) > 1.5;
  if ((pawn.path?.length ?? 0) > 0 && !drifted) return gameState; // keep following

  const afterPath = tryAssignPath(pawn, target.x, target.y, gameState);
  if (afterPath) return afterPath;
  return haltMovement(pawn, gameState); // unreachable this tick — hold; needs will free it
}
