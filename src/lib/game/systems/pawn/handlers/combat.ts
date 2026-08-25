import type { GameState, Pawn } from '../../../core/types';
import { manhattan, chebyshev } from '../../../core/util/distance';
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
import { feedOnVictim, sateBloodHunger } from '../../../core/defs/lineages';

export function handleFighting(pawn: Pawn, gameState: GameState): GameState {
  const threat = findCombatThreat(pawn, gameState);
  if (!threat || !pawn.position) {
    return threat ? haltMovement(pawn, gameState) : transitionTo(pawn, PAWN_STATE.IDLE, gameState);
  }
  const dist = Math.max(Math.abs(pawn.position.x - threat.x), Math.abs(pawn.position.y - threat.y));

  const rw = getRangedWeapon(pawn);
  if (rw) {
    if (dist <= effectiveRangedRange(pawn, rw)) return haltMovement(pawn, gameState);
    if ((pawn.path?.length ?? 0) > 0) return gameState;
    const afterPath = tryAssignPath(pawn, threat.x, threat.y, gameState);
    return afterPath ?? haltMovement(pawn, gameState);
  }

  const adjacent = dist <= 1;
  if (adjacent) {
    return haltMovement(pawn, gameState);
  }
  if ((pawn.combatStance ?? 'defensive') === 'aggressive') {
    if ((pawn.path?.length ?? 0) > 0) return gameState;
    const afterPath = tryAssignPath(pawn, threat.x, threat.y, gameState);
    if (afterPath) return afterPath;
  }
  return haltMovement(pawn, gameState);
}

export function handleFleeing(pawn: Pawn, gameState: GameState): GameState {
  const threat = findCombatThreat(pawn, gameState);
  if (!threat) {
    return transitionTo(pawn, PAWN_STATE.IDLE, gameState);
  }
  if (!pawn.position) return gameState;
  if ((pawn.path?.length ?? 0) > 0) return gameState;

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

export function handleHunting(pawn: Pawn, gameState: GameState): GameState {
  if (!pawn.position) return gameState;

  const target = (gameState.mobs ?? []).find(
    (m) =>
      m.id === pawn.huntTargetId && m.isAlive !== false && m.state !== 'Corpse' && m.markedForHunt
  );
  if (!target) return endHunt(pawn, PAWN_STATE.IDLE, gameState);

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
    return {
      ...interrupted,
      pawns: interrupted.pawns.map((p) =>
        p.id === pawn.id ? { ...p, huntTargetId: undefined } : p
      )
    };
  }

  const adjacent = chebyshev(pawn.position.x, pawn.position.y, target.x, target.y) <= 1;
  if (adjacent) {
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

  const pathEnd = pawn.path?.length ? pawn.path[pawn.path.length - 1] : null;
  const drifted = !pathEnd || chebyshev(pathEnd.x, pathEnd.y, target.x, target.y) > 1.5;
  if ((pawn.path?.length ?? 0) > 0 && !drifted) return gameState;

  const afterPath = tryAssignPath(pawn, target.x, target.y, gameState);
  if (afterPath) return afterPath;
  return haltMovement(pawn, gameState);
}

export function handleBloodHunt(pawn: Pawn, gameState: GameState): GameState {
  if (!pawn.position) return gameState;
  if ((pawn.conditionTimers?.bloodthirst ?? 0) <= 0) return haltMovement(pawn, gameState);
  const px = pawn.position.x;
  const py = pawn.position.y;

  const corpse = (gameState.mobs ?? []).find(
    (m) => m.id === pawn.huntTargetId && (m.isAlive === false || m.state === 'Corpse')
  );
  if (corpse && chebyshev(px, py, corpse.x, corpse.y) <= 1) {
    sateBloodHunger(pawn);
    return haltMovement(pawn, gameState);
  }

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
    if (!best) return haltMovement(pawn, gameState);
    pawn.huntTargetId = best.id;
    mobT = best.isMob ? (gameState.mobs ?? []).find((m) => m.id === best!.id) : undefined;
    pawnT = best.isMob ? undefined : gameState.pawns.find((p) => p.id === best!.id);
  }

  const tx = mobT ? mobT.x : pawnT!.position!.x;
  const ty = mobT ? mobT.y : pawnT!.position!.y;
  const adjacent = chebyshev(px, py, tx, ty) <= 1;

  if (adjacent) {
    if (pawn.bloodNeedKind === 'humanoid' && pawnT) {
      feedOnVictim(pawn, pawnT, gameState.turn);
      return haltMovement(pawn, gameState);
    }
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

  const pathEnd = pawn.path?.length ? pawn.path[pawn.path.length - 1] : null;
  const drifted = !pathEnd || chebyshev(pathEnd.x, pathEnd.y, tx, ty) > 1.5;
  if ((pawn.path?.length ?? 0) > 0 && !drifted) return gameState;
  const afterPath = tryAssignPath(pawn, tx, ty, gameState);
  if (afterPath) return afterPath;
  return haltMovement(pawn, gameState);
}
