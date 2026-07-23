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

/**
 * A resolved need decision. `water` carries the already-routed state (the route is computed during
 * selection, exactly as before, so deciding and routing aren't double-done).
 */
export type NeedChoice =
  | { kind: 'eat' }
  | { kind: 'sleep' }
  | { kind: 'water'; need: 'drink' | 'wash'; routedState: GameState }
  | { kind: 'social'; routedState: GameState }
  | { kind: 'comfort'; routedState: GameState }
  | null;

/**
 * The wound-recovery rest decision, gated by the pawn's `restPolicy` toggle (PawnRestPolicy UI):
 *  - 'never'   → never auto-rests (accept the slow active heal rate).
 *  - 'shelter' → only rests when a bed/roofed shelter is reachable; else keeps working.
 *  - 'always'  → rests freely (handleTired falls back to the bare ground).
 * Reuses the sleep→rest pipeline; returns null when the pawn shouldn't recovery-rest right now.
 */
function recoveryChoice(pawn: Pawn, gameState: GameState): NeedChoice {
  const policy = pawn.restPolicy ?? 'always';
  if (policy === 'never' || !needsRecovery(pawn)) return null;
  // Hunger takes precedence over recovery-rest ONLY when there's food to actually go eat — waking a
  // wounded pawn to "get food" when the stockpile is empty is pointless and ping-pongs it Idle↔Sleeping
  // (recoveryChoice→rest, handleSleeping→wake-for-hunger). With no food, the pawn stays down and heals.
  // MUST mirror handleSleeping's recovery-hold (same hunger && hasAvailableFood gate).
  if ((pawn.needs?.hunger ?? 0) >= HUNGER_THRESHOLD && hasAvailableFood(gameState)) return null;
  if (policy === 'shelter' && !findNearestRestBuilding(pawn, gameState)) return null;
  return { kind: 'sleep' };
}

/** True when a pawn must seek water from a zone/well (thirst urgent AND no stockpiled water to sip). */
function thirstNeedsRouting(pawn: Pawn, gameState: GameState): boolean {
  return (
    (pawn.needs?.thirst ?? 0) >= ROUTE_TO_DRINK_THIRST && (gameState.stockpile?.['water'] ?? 0) <= 0
  );
}

/**
 * Distance check between the two lethal needs: when a pawn is both hungry and thirsty, drink first
 * whenever the drink target is no farther than the food it would walk to fetch. Thirst wins on ties
 * (dehydration kills sooner than starvation), so a pawn standing next to a drink zone drinks instead
 * of marching off to a distant stockpile to eat and dying of thirst. Only when food is *strictly*
 * closer does it eat first — and it drinks on the next decision cycle once fed.
 */
function shouldDrinkBeforeEating(pawn: Pawn, gameState: GameState): boolean {
  return distToNearestDrinkTarget(pawn, gameState) <= distToNearestFoodFetch(pawn, gameState);
}

/** Raw-threshold need decision for an IDLE pawn (no active job). Priority: (thirst|hunger by
 *  proximity, thirst-first on ties) → hygiene → fatigue (dehydration is lethal). */
export function selectIdleNeed(pawn: Pawn, gameState: GameState): NeedChoice {
  // FORCE WORK: neglect every need and go straight to work (the FSM finds a job when no need wins).
  if (pawn.forceWork) return null;
  const hungerActive = (pawn.needs?.hunger ?? 0) >= HUNGER_THRESHOLD && hasAvailableFood(gameState);
  const thirstActive = thirstNeedsRouting(pawn, gameState);
  // Thirst before hunger when its source is at least as close (or hunger isn't active at all).
  if (thirstActive && (!hungerActive || shouldDrinkBeforeEating(pawn, gameState))) {
    const routed = tryRouteToWaterNeed(pawn, gameState, 'drink');
    if (routed) return { kind: 'water', need: 'drink', routedState: routed };
  }
  // Hunger only wins here when food is strictly closer than water (else the thirst block above took
  // it); a failed drink route also falls through to eating rather than stalling.
  if (hungerActive) {
    return { kind: 'eat' };
  }
  // Wound recovery (restPolicy-gated): a meaningfully wounded pawn lies down to heal. Above
  // hygiene/fatigue, below the lethal hunger/thirst needs — handleSleeping holds it until wounds clear.
  const recover = recoveryChoice(pawn, gameState);
  if (recover) return recover;
  if ((pawn.needs?.hygiene ?? 0) >= ROUTE_TO_WASH_HYGIENE) {
    const routed = tryRouteToWaterNeed(pawn, gameState, 'wash');
    if (routed) return { kind: 'water', need: 'wash', routedState: routed };
  }
  if ((pawn.needs?.fatigue ?? 0) >= FATIGUE_THRESHOLD) {
    return { kind: 'sleep' };
  }
  // SOCIAL (lowest priority — a mood need, not survival): a bored idle pawn heads to the fire to
  // socialise instead of loafing. Only from Idle, so it never interrupts real work.
  if ((pawn.needs?.relaxation ?? 100) < RELAXATION_THRESHOLD) {
    const routed = tryRouteToSocialise(pawn, gameState);
    if (routed) return { kind: 'social', routedState: routed };
  }
  // COMFORT (also a mood need, from Idle only): an uncomfortable idle pawn seeks a seat to lounge.
  if ((pawn.needs?.comfort ?? 100) < COMFORT_THRESHOLD) {
    const routed = tryRouteToLounge(pawn, gameState);
    if (routed) return { kind: 'comfort', routedState: routed };
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
  // FORCE WORK: never interrupt a job for a need — the pawn works through hunger/thirst/fatigue.
  if (pawn.forceWork) return null;
  // Thirst before hunger when the drink target is at least as close as the food the pawn would fetch
  // (dehydration kills sooner). Keeps a thirsty pawn from interrupting work to march to a distant
  // stockpile to eat while a drink zone is right next to it. Food-strictly-closer falls through to the
  // hunger block below, then the thirst fallback after it.
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

  // Wound recovery interrupts (restPolicy-gated) — a real wound means stop and rest NOW; the job
  // returns to the pool. Below lethal hunger/thirst, above fatigue. 'never'/unreachable-shelter skip.
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
    case 'social':
      // tryRouteToSocialise already set MOVING_TO_NEED (or SOCIALISING if adjacent) on routedState.
      return jobId ? jobService.releaseJob(pawn.id, jobId, choice.routedState) : choice.routedState;
    case 'comfort':
      // tryRouteToLounge already set MOVING_TO_NEED (or LOUNGING if adjacent) on routedState.
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
