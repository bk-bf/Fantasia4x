/** pawn/needSelection — P-4b: the "which need (if any) should this pawn act on" decision, lifted
 *  out of the FSM handlers (`handleIdle`, `checkNeedInterrupts`) so the handlers only *apply* the
 *  decision. Lives in the pawn system (not PawnService) because the distance/threshold helpers it
 *  needs sit in this layer — keeping the decision here avoids a services→systems back-edge.
 *
 *  `selectIdleNeed` uses raw thresholds (an idle pawn with no job). `selectInterruptNeed` is the
 *  distance-weighted version (a pawn mid-job that may yield to a need). `applyNeed` turns a decision
 *  into the state transition; `checkNeedInterrupts` is the thin select+apply wrapper the handlers
 *  call (behaviour-identical to the previous inline version, logging included). */
import type { GameState, Pawn } from '../../core/types';
import { gameLogger } from '../../dev/gameLogger';
import { jobService } from '../../services/JobService';
import { PAWN_STATE } from './pawnStates';
import { hasAvailableFood } from './pawnQueries';
import {
  HUNGER_THRESHOLD,
  FATIGUE_THRESHOLD,
  ROUTE_TO_DRINK_THIRST,
  ROUTE_TO_WASH_HYGIENE,
  transitionTo,
  tryRouteToWaterNeed,
  distToNearestFoodSource,
  distToNearestRestSource,
  computeMinQueueFoodDist,
  computeMinQueueRestDist,
  computeAdjustedNeedThreshold,
  shouldInterruptForNeed
} from './pawnHelpers';

/**
 * A resolved need decision. `water` carries the already-routed state (the route is computed during
 * selection, exactly as before, so deciding and routing aren't double-done).
 */
export type NeedChoice =
  | { kind: 'eat' }
  | { kind: 'sleep' }
  | { kind: 'water'; need: 'drink' | 'wash'; routedState: GameState }
  | null;

/** Raw-threshold need decision for an IDLE pawn (no active job). Priority: hunger → thirst →
 *  hygiene → fatigue (thirst before hygiene; dehydration is lethal). */
export function selectIdleNeed(pawn: Pawn, gameState: GameState): NeedChoice {
  if ((pawn.needs?.hunger ?? 0) >= HUNGER_THRESHOLD && hasAvailableFood(gameState)) {
    return { kind: 'eat' };
  }
  if (
    (pawn.needs?.thirst ?? 0) >= ROUTE_TO_DRINK_THIRST &&
    (gameState.stockpile?.['water'] ?? 0) <= 0
  ) {
    const routed = tryRouteToWaterNeed(pawn, gameState, 'drink');
    if (routed) return { kind: 'water', need: 'drink', routedState: routed };
  }
  if ((pawn.needs?.hygiene ?? 0) >= ROUTE_TO_WASH_HYGIENE) {
    const routed = tryRouteToWaterNeed(pawn, gameState, 'wash');
    if (routed) return { kind: 'water', need: 'wash', routedState: routed };
  }
  if ((pawn.needs?.fatigue ?? 0) >= FATIGUE_THRESHOLD) {
    return { kind: 'sleep' };
  }
  return null;
}

/**
 * Distance-weighted need decision for a pawn mid-job (en route or working). Weighs need urgency
 * against proximity to food/rest vs the job target, adjusted by labor level + job-queue lookahead.
 * Hygiene is intentionally NOT interrupting (mood-only; handled from Idle / passive auto-wash).
 */
export function selectInterruptNeed(
  pawn: Pawn,
  gameState: GameState,
  label: 'EnRoute' | 'Working' | 'Hunting',
  jobDist: number,
  queue: string[],
  laborLevel: number
): NeedChoice {
  const hunger = pawn.needs?.hunger ?? 0;
  if (hunger >= HUNGER_THRESHOLD && hasAvailableFood(gameState)) {
    const minQueueFood = computeMinQueueFoodDist(queue, pawn, gameState);
    const hungerThreshold = computeAdjustedNeedThreshold(
      HUNGER_THRESHOLD,
      laborLevel,
      minQueueFood
    );
    const foodDist = distToNearestFoodSource(pawn, gameState);
    const willInterrupt = shouldInterruptForNeed(hunger, hungerThreshold, foodDist, jobDist);
    gameLogger.log(
      gameState.turn,
      'NEED-CHECK',
      () =>
        `[${label}] ${pawn.name} H:${hunger.toFixed(1)}` +
        ` adjThr:${hungerThreshold.toFixed(1)} foodDist:${foodDist === Infinity ? '∞' : foodDist}` +
        ` jobDist:${jobDist} labor:${laborLevel} minQueueFood:${minQueueFood ?? 'null'}` +
        ` → ${willInterrupt ? 'INTERRUPT→EAT' : 'continue'}`
    );
    if (willInterrupt) return { kind: 'eat' };
  }

  const thirst = pawn.needs?.thirst ?? 0;
  if (thirst >= ROUTE_TO_DRINK_THIRST && (gameState.stockpile?.['water'] ?? 0) <= 0) {
    const routed = tryRouteToWaterNeed(pawn, gameState, 'drink');
    if (routed) {
      gameLogger.log(
        gameState.turn,
        'NEED-CHECK',
        () => `[${label}] ${pawn.name} T:${thirst.toFixed(1)} → INTERRUPT→DRINK`
      );
      return { kind: 'water', need: 'drink', routedState: routed };
    }
  }

  const fatigue = pawn.needs?.fatigue ?? 0;
  if (fatigue >= FATIGUE_THRESHOLD) {
    const minQueueRest = computeMinQueueRestDist(queue, pawn, gameState);
    const fatigueThreshold = computeAdjustedNeedThreshold(
      FATIGUE_THRESHOLD,
      laborLevel,
      minQueueRest
    );
    const restDist = distToNearestRestSource(pawn, gameState);
    const willInterrupt = shouldInterruptForNeed(fatigue, fatigueThreshold, restDist, jobDist);
    gameLogger.log(
      gameState.turn,
      'NEED-CHECK',
      () =>
        `[${label}] ${pawn.name} F:${fatigue.toFixed(1)}` +
        ` adjThr:${fatigueThreshold.toFixed(1)} restDist:${restDist === Infinity ? '∞' : restDist}` +
        ` jobDist:${jobDist} labor:${laborLevel}` +
        ` → ${willInterrupt ? 'INTERRUPT→SLEEP' : 'continue'}`
    );
    if (willInterrupt) return { kind: 'sleep' };
  }

  return null;
}

/**
 * Apply a need decision: transition the pawn to the matching state. When `jobId` is set (a mid-job
 * interrupt), the held job is released first so it returns to the pool with its accumulated work.
 */
export function applyNeed(
  pawn: Pawn,
  gameState: GameState,
  choice: NonNullable<NeedChoice>,
  jobId?: string | null
): GameState {
  switch (choice.kind) {
    case 'eat': {
      const gs = jobId ? jobService.releaseJob(pawn.id, jobId, gameState) : gameState;
      return transitionTo(pawn, PAWN_STATE.HUNGRY, gs);
    }
    case 'sleep': {
      const gs = jobId ? jobService.releaseJob(pawn.id, jobId, gameState) : gameState;
      return transitionTo(pawn, PAWN_STATE.TIRED, gs);
    }
    case 'water':
      // tryRouteToWaterNeed already set the MOVING_TO_NEED state on routedState.
      return jobId ? jobService.releaseJob(pawn.id, jobId, choice.routedState) : choice.routedState;
  }
}

/**
 * Select + apply, for a pawn mid-job. Returns the new state if a need won, else null (continue the
 * job). Thin wrapper kept so the work/combat handlers' call sites are unchanged.
 */
export function checkNeedInterrupts(
  pawn: Pawn,
  gameState: GameState,
  label: 'EnRoute' | 'Working' | 'Hunting',
  jobDist: number,
  queue: string[],
  laborLevel: number
): GameState | null {
  const choice = selectInterruptNeed(pawn, gameState, label, jobDist, queue, laborLevel);
  if (!choice) return null;
  return applyNeed(pawn, gameState, choice, pawn.activeJob?.jobId ?? null);
}
