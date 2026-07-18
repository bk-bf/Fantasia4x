/** pawn/handlers/combat — combat state handlers, extracted from PawnStateMachine (hotspot step 2). Each
 *  is a plain (pawn, gameState) => GameState function; the dispatcher wires them into the table. */
import type { GameState, Pawn } from '../../../core/types';
import { manhattan, chebyshev } from '../../../core/distance';
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
import { getRangedWeapon, effectiveRangedRange } from '../../rangedCombat';
import { checkNeedInterrupts } from '../needSelection';
import { feedOnVictim, sateBloodHunger } from '../../../core/Lineages';

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
  const dist = Math.max(Math.abs(pawn.position.x - threat.x), Math.abs(pawn.position.y - threat.y));

  // RANGED-COMBAT: a ranged pawn stands and shoots once the threat is within weapon range (combatService
  // resolves the shot); only when the target is beyond range does it close to get into range.
  const rw = getRangedWeapon(pawn);
  if (rw) {
    if (dist <= effectiveRangedRange(pawn, rw)) return haltMovement(pawn, gameState); // in range (or cornered → bow-butt): hold and fire
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
  const jobDist = manhattan(pawn.position.x, pawn.position.y, target.x, target.y);
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

  const adjacent = chebyshev(pawn.position.x, pawn.position.y, target.x, target.y) <= 1;
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
  const drifted = !pathEnd || chebyshev(pathEnd.x, pathEnd.y, target.x, target.y) > 1.5;
  if ((pawn.path?.length ?? 0) > 0 && !drifted) return gameState; // keep following

  const afterPath = tryAssignPath(pawn, target.x, target.y, gameState);
  if (afterPath) return afterPath;
  return haltMovement(pawn, gameState); // unreachable this tick — hold; needs will free it
}

/**
 * BLOOD HUNT (LINEAGES-II): bloodthirst has the body — an UNCONTROLLABLE hunt the conditions pass
 * forces the pawn into (and out of) via the `bloodthirst` condition's `fsmState`; the draft is refused
 * while it holds. The pawn chases the NEAREST living thing — colonist or beast — and:
 *   • vampiric (`bloodNeedKind: 'humanoid'`) + a pawn victim in reach → FEEDS (neck puncture + blood
 *     drain, victim survives), sated, control returns next tick;
 *   • otherwise stands in melee and lets combatService.tickCombat land swings (its BloodHunt branch
 *     targets the quarry); a quarry that drops is DEVOURED on the spot — sated the same way.
 * No need interrupts here: the hunger outranks hunger.
 */
export function handleBloodHunt(pawn: Pawn, gameState: GameState): GameState {
  if (!pawn.position) return gameState;
  // The conditions pass releases us when bloodthirst lifts; hold still if it already has this tick.
  if ((pawn.conditionTimers?.bloodthirst ?? 0) <= 0) return haltMovement(pawn, gameState);
  const px = pawn.position.x;
  const py = pawn.position.y;

  // Devour a quarry that just dropped (werewolf's satisfaction — the vampire feeds on the living).
  const corpse = (gameState.mobs ?? []).find(
    (m) => m.id === pawn.huntTargetId && (m.isAlive === false || m.state === 'Corpse')
  );
  if (corpse && chebyshev(px, py, corpse.x, corpse.y) <= 1) {
    sateBloodHunger(pawn); // mutates the live pawn (FSM convention); released next tick
    return haltMovement(pawn, gameState);
  }

  // Current quarry, else acquire the NEAREST living thing (mob or another pawn) within 30 tiles.
  let mobT = (gameState.mobs ?? []).find(
    (m) => m.id === pawn.huntTargetId && m.isAlive !== false && m.state !== 'Corpse'
  );
  let pawnT = gameState.pawns.find(
    (p) => p.id === pawn.huntTargetId && p.id !== pawn.id && p.isAlive !== false
  );
  if (!mobT && !pawnT) {
    let best: { x: number; y: number; id: string; isMob: boolean } | undefined;
    let bestD = 31;
    for (const m of gameState.mobs ?? []) {
      if (m.isAlive === false || m.state === 'Corpse') continue;
      const d = chebyshev(px, py, m.x, m.y);
      if (d < bestD) {
        bestD = d;
        best = { x: m.x, y: m.y, id: m.id, isMob: true };
      }
    }
    for (const p of gameState.pawns) {
      if (p.id === pawn.id || p.isAlive === false || !p.position) continue;
      const d = chebyshev(px, py, p.position.x, p.position.y);
      if (d < bestD) {
        bestD = d;
        best = { x: p.position.x, y: p.position.y, id: p.id, isMob: false };
      }
    }
    if (!best) return haltMovement(pawn, gameState); // nothing alive in range — pace and rage
    pawn.huntTargetId = best.id; // live-pawn mutation (FSM convention)
    mobT = best.isMob ? (gameState.mobs ?? []).find((m) => m.id === best!.id) : undefined;
    pawnT = best.isMob ? undefined : gameState.pawns.find((p) => p.id === best!.id);
  }

  const tx = mobT ? mobT.x : pawnT!.position!.x;
  const ty = mobT ? mobT.y : pawnT!.position!.y;
  const adjacent = chebyshev(px, py, tx, ty) <= 1;

  if (adjacent) {
    // A vampiric hunter DRINKS from a pawn victim rather than beating it down.
    if (pawn.bloodNeedKind === 'humanoid' && pawnT) {
      feedOnVictim(pawn, pawnT, gameState.turn);
      return haltMovement(pawn, gameState);
    }
    // Otherwise plant and trade blows (tickCombat's BloodHunt branch swings at the quarry); a mob
    // quarry is cornered into fighting back, exactly as the work-driven hunt does.
    const halted = haltMovement(pawn, gameState);
    if (mobT && mobT.state !== 'Attacking') {
      return {
        ...halted,
        mobs: (halted.mobs ?? []).map((m) =>
          m.id === mobT!.id
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
    return halted;
  }

  // Chase — re-path when the quarry drifts off the current path's end.
  const pathEnd = pawn.path?.length ? pawn.path[pawn.path.length - 1] : null;
  const drifted = !pathEnd || chebyshev(pathEnd.x, pathEnd.y, tx, ty) > 1.5;
  if ((pawn.path?.length ?? 0) > 0 && !drifted) return gameState;
  const afterPath = tryAssignPath(pawn, tx, ty, gameState);
  if (afterPath) return afterPath;
  return haltMovement(pawn, gameState);
}
