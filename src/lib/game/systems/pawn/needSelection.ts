import type { GameState, Pawn } from '../../core/types';
import { gameLogger } from '../../debug/gameLogger';
import { jobService } from '../../services/JobService';
import { PAWN_STATE } from './pawnStates';
import { hasAvailableFood } from './pawnQueries';
import {
  HUNGER_THRESHOLD,
  FATIGUE_THRESHOLD,
  ROUTE_TO_DRINK_THIRST,
  ROUTE_TO_WASH_HYGIENE,
  RELAXATION_THRESHOLD,
  COMFORT_THRESHOLD,
  needsRecovery,
  findNearestRestBuilding,
  transitionTo,
  tryRouteToWaterNeed,
  tryRouteToSocialise,
  tryRouteToLounge,
  distToNearestFoodSource,
  distToNearestFoodFetch,
  distToNearestDrinkTarget,
  distToNearestRestSource,
  computeMinQueueFoodDist,
  computeMinQueueRestDist,
  computeAdjustedNeedThreshold,
  shouldInterruptForNeed
} from './pawnHelpers';

export type NeedChoice =
  | { kind: 'eat' }
  | { kind: 'sleep' }
  | { kind: 'water'; need: 'drink' | 'wash'; routedState: GameState }
  | { kind: 'social'; routedState: GameState }
  | { kind: 'comfort'; routedState: GameState }
  | null;

function recoveryChoice(pawn: Pawn, gameState: GameState): NeedChoice {
  const policy = pawn.restPolicy ?? 'always';
  if (policy === 'never' || !needsRecovery(pawn)) return null;
  if ((pawn.needs?.hunger ?? 0) >= HUNGER_THRESHOLD && hasAvailableFood(gameState)) return null;
  if (policy === 'shelter' && !findNearestRestBuilding(pawn, gameState)) return null;
  return { kind: 'sleep' };
}

function thirstNeedsRouting(pawn: Pawn, _gameState: GameState): boolean {
  return (pawn.needs?.thirst ?? 0) >= ROUTE_TO_DRINK_THIRST;
}

function shouldDrinkBeforeEating(pawn: Pawn, gameState: GameState): boolean {
  return distToNearestDrinkTarget(pawn, gameState) <= distToNearestFoodFetch(pawn, gameState);
}

export function selectIdleNeed(pawn: Pawn, gameState: GameState): NeedChoice {
  if (pawn.forceWork) return null;
  const hungerActive = (pawn.needs?.hunger ?? 0) >= HUNGER_THRESHOLD && hasAvailableFood(gameState);
  const thirstActive = thirstNeedsRouting(pawn, gameState);
  if (thirstActive && (!hungerActive || shouldDrinkBeforeEating(pawn, gameState))) {
    const routed = tryRouteToWaterNeed(pawn, gameState, 'drink');
    if (routed) return { kind: 'water', need: 'drink', routedState: routed };
  }
  if (hungerActive) {
    return { kind: 'eat' };
  }
  const recover = recoveryChoice(pawn, gameState);
  if (recover) return recover;
  if ((pawn.needs?.hygiene ?? 0) >= ROUTE_TO_WASH_HYGIENE) {
    const routed = tryRouteToWaterNeed(pawn, gameState, 'wash');
    if (routed) return { kind: 'water', need: 'wash', routedState: routed };
  }
  if ((pawn.needs?.fatigue ?? 0) >= FATIGUE_THRESHOLD) {
    return { kind: 'sleep' };
  }
  if ((pawn.needs?.relaxation ?? 100) < RELAXATION_THRESHOLD) {
    const routed = tryRouteToSocialise(pawn, gameState);
    if (routed) return { kind: 'social', routedState: routed };
  }
  if ((pawn.needs?.comfort ?? 100) < COMFORT_THRESHOLD) {
    const routed = tryRouteToLounge(pawn, gameState);
    if (routed) return { kind: 'comfort', routedState: routed };
  }
  return null;
}

export function selectInterruptNeed(
  pawn: Pawn,
  gameState: GameState,
  label: 'EnRoute' | 'Working' | 'Hunting',
  jobDist: number,
  queue: string[],
  laborLevel: number
): NeedChoice {
  if (pawn.forceWork) return null;
  if (thirstNeedsRouting(pawn, gameState) && shouldDrinkBeforeEating(pawn, gameState)) {
    const routed = tryRouteToWaterNeed(pawn, gameState, 'drink');
    if (routed) {
      gameLogger.log(
        gameState.turn,
        'NEED-CHECK',
        () =>
          `[${label}] ${pawn.name} T:${(pawn.needs?.thirst ?? 0).toFixed(1)} → INTERRUPT→DRINK (nearer than food)`
      );
      return { kind: 'water', need: 'drink', routedState: routed };
    }
  }
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
  if (thirst >= ROUTE_TO_DRINK_THIRST) {
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

  const recover = recoveryChoice(pawn, gameState);
  if (recover) {
    gameLogger.log(
      gameState.turn,
      'NEED-CHECK',
      () => `[${label}] ${pawn.name} wounded → INTERRUPT→REST`
    );
    return recover;
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
      return jobId ? jobService.releaseJob(pawn.id, jobId, choice.routedState) : choice.routedState;
    case 'social':
      return jobId ? jobService.releaseJob(pawn.id, jobId, choice.routedState) : choice.routedState;
    case 'comfort':
      return jobId ? jobService.releaseJob(pawn.id, jobId, choice.routedState) : choice.routedState;
  }
}

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
