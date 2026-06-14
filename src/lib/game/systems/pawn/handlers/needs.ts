/** pawn/handlers/needs — needs state handlers, extracted from PawnStateMachine (hotspot step 2). Each
 *  is a plain (pawn, gameState) => GameState function; the dispatcher wires them into the table. */
import type { GameState, Pawn } from '../../../core/types';
import { gameLogger } from '../../../dev/gameLogger';
import { perTick } from '../../../core/time';
import { consumeFromStockpiles } from '../../../core/GameState';
import { PAWN_STATE, type PawnStateName } from '../pawnStates';
import { isAdjacent, selectFoodForMeal, consumeMeal } from '../pawnQueries';
import {
  findNearestStorageBuilding, tryAssignPath, EATING_TURNS, EATING_TURNS_GROUND,
  findNearestRestBuilding, tryAssignSleepPath, SLEEPING_TURNS, SLEEPING_TURNS_GROUND,
  getRestBuildingAtPawn, BUILDINGS_DB, FATIGUE_PER_SLEEPING_GROUND, HUNGER_THRESHOLD,
  SLEEP_WAKE_THRESHOLD_HUNGRY, SLEEP_WAKE_THRESHOLD_FED, transitionTo, goIdle, DRINK_NEED_RELIEF,
  WASH_NEED_RELIEF, repathStuckMover
} from '../pawnHelpers';

/** §D: drink at the reached target — relieve thirst (consume stored water if any), then idle. */
export function handleDrinking(pawn: Pawn, gameState: GameState): GameState {
  let state = gameState;
  if ((state.stockpile?.['water'] ?? 0) > 0) {
    state = consumeFromStockpiles(state, { water: 1 });
  }
  state = {
    ...state,
    pawns: state.pawns.map((p) =>
      p.id === pawn.id
        ? {
            ...p,
            needs: {
              ...p.needs,
              thirst: Math.max(0, (p.needs.thirst ?? 0) - DRINK_NEED_RELIEF),
              lastDrink: state.turn
            }
          }
        : p
    )
  };
  return goIdle(state.pawns.find((p) => p.id === pawn.id)!, state);
}

/** §D: wash at the reached target — relieve hygiene, then idle. */
export function handleWashing(pawn: Pawn, gameState: GameState): GameState {
  const state = {
    ...gameState,
    pawns: gameState.pawns.map((p) =>
      p.id === pawn.id
        ? {
            ...p,
            needs: {
              ...p.needs,
              hygiene: Math.max(0, (p.needs.hygiene ?? 0) - WASH_NEED_RELIEF),
              lastWash: gameState.turn
            }
          }
        : p
    )
  };
  return goIdle(state.pawns.find((p) => p.id === pawn.id)!, state);
}

export function handleHungry(pawn: Pawn, gameState: GameState): GameState {
  const meal = selectFoodForMeal(pawn, gameState);
  if (meal.length === 0) {
    return transitionTo(pawn, PAWN_STATE.IDLE, gameState);
  }

  // Phase 6: try to pathfind to the nearest campfire — eat there for better recovery speed
  const storageBuilding = findNearestStorageBuilding(pawn, gameState);
  if (
    storageBuilding &&
    pawn.position &&
    !isAdjacent(pawn.position.x, pawn.position.y, storageBuilding.x, storageBuilding.y)
  ) {
    const afterPath = tryAssignPath(pawn, storageBuilding.x, storageBuilding.y, gameState);
    if (afterPath) {
      // Food is NOT consumed yet — it will be taken on arrival at the campfire.
      return {
        ...afterPath,
        pawns: afterPath.pawns.map((p) =>
          p.id === pawn.id
            ? {
                ...p,
                currentState: PAWN_STATE.MOVING_TO_NEED,
                activeJob: {
                  type: 'need' as const,
                  targetX: storageBuilding.x,
                  targetY: storageBuilding.y,
                  progress: 0,
                  timeRequired: EATING_TURNS,
                  turnsInState: 0,
                  targetState: PAWN_STATE.EATING
                }
              }
            : p
        )
      };
    }
  }

  // Eat in place: consume all selected food now, then sit and eat for EATING_TURNS_GROUND turns.
  const { state: afterMeal, hungerRecovered } = consumeMeal(meal, gameState);
  return {
    ...afterMeal,
    pawns: afterMeal.pawns.map((p) =>
      p.id === pawn.id
        ? {
            ...p,
            currentState: PAWN_STATE.EATING,
            activeJob: {
              type: 'need' as const,
              targetX: p.position?.x ?? 0,
              targetY: p.position?.y ?? 0,
              progress: 0,
              timeRequired: EATING_TURNS_GROUND,
              turnsInState: 0,
              hungerToRecover: hungerRecovered
            }
          }
        : p
    )
  };
}

export function handleTired(pawn: Pawn, gameState: GameState): GameState {
  // Seek the assigned/nearest bed and walk ON to its tile to sleep.
  // Only one pawn can occupy a bed at a time (findNearestRestBuilding skips occupied ones).
  const restBuilding = findNearestRestBuilding(pawn, gameState);
  if (restBuilding && pawn.position) {
    const atBed = pawn.position.x === restBuilding.x && pawn.position.y === restBuilding.y;
    if (!atBed) {
      const afterPath = tryAssignSleepPath(pawn, restBuilding.x, restBuilding.y, gameState);
      if (afterPath) {
        return {
          ...afterPath,
          pawns: afterPath.pawns.map((p) =>
            p.id === pawn.id
              ? {
                  ...p,
                  currentState: PAWN_STATE.MOVING_TO_NEED,
                  activeJob: {
                    type: 'need' as const,
                    targetX: restBuilding.x,
                    targetY: restBuilding.y,
                    progress: 0,
                    timeRequired: SLEEPING_TURNS,
                    turnsInState: 0,
                    targetState: PAWN_STATE.SLEEPING
                  }
                }
              : p
          )
        };
      }
      // Bed unreachable this tick — hold in TIRED and retry next tick.
      // Exhaustion-collapse guard in tick() will force sleep at fatigue=100.
      gameLogger.log(
        gameState.turn,
        'NEED-CHECK',
        `${pawn.name} TIRED: bed at (${restBuilding.x},${restBuilding.y}) unreachable this tick, retrying`
      );
      return gameState;
    }
    // Already standing on the bed tile — sleep here.
  }

  // No bed available, or already on the bed tile: sleep at current position.
  // When sleeping on a bed, store the bed's coordinates as the job target so
  // the UI and handleSleeping can identify which bed the pawn is using.
  const sleepTargetX = restBuilding?.x ?? pawn.position?.x ?? 0;
  const sleepTargetY = restBuilding?.y ?? pawn.position?.y ?? 0;
  return {
    ...gameState,
    pawns: gameState.pawns.map((p) =>
      p.id === pawn.id
        ? {
            ...p,
            currentState: PAWN_STATE.SLEEPING,
            path: [],
            isMoving: false,
            activeJob: {
              type: 'need' as const,
              targetX: sleepTargetX,
              targetY: sleepTargetY,
              progress: 0,
              timeRequired: SLEEPING_TURNS,
              turnsInState: 0
            }
          }
        : p
    )
  };
}

export function handleMovingToNeed(pawn: Pawn, gameState: GameState): GameState {
  const activeJob = pawn.activeJob;
  if (!activeJob) return goIdle(pawn, gameState);

  // Recover from a path dropped after being blocked too long; if the need target (food
  // tile / well / bed) is now unreachable, drop back to Idle to re-evaluate.
  const recovered = repathStuckMover(pawn, gameState);
  if (recovered === 'unreachable') return goIdle(pawn, gameState);
  if (recovered) return recovered;

  if (pawn.hasReachedDestination && pawn.position) {
    const targetState = (activeJob.targetState ?? PAWN_STATE.EATING) as PawnStateName;
    if (targetState === PAWN_STATE.EATING) {
      // Arrived at campfire — now select and consume the full meal, then start eating.
      const meal = selectFoodForMeal(pawn, gameState);
      if (meal.length === 0) return goIdle(pawn, gameState);
      const { state: afterMeal, hungerRecovered } = consumeMeal(meal, gameState);
      return {
        ...afterMeal,
        pawns: afterMeal.pawns.map((p) =>
          p.id === pawn.id
            ? {
                ...p,
                currentState: PAWN_STATE.EATING,
                hasReachedDestination: false,
                activeJob: {
                  ...activeJob,
                  timeRequired: EATING_TURNS,
                  turnsInState: 0,
                  hungerToRecover: hungerRecovered
                }
              }
            : p
        )
      };
    }
    return {
      ...gameState,
      pawns: gameState.pawns.map((p) =>
        p.id === pawn.id
          ? {
              ...p,
              currentState: targetState,
              hasReachedDestination: false,
              // Arrived — stop any residual movement so we don't sleepwalk past the tile.
              path: [],
              isMoving: false
            }
          : p
      )
    };
  }
  return gameState;
}

export function handleEating(pawn: Pawn, gameState: GameState): GameState {
  const activeJob = pawn.activeJob;
  const turnsInState = (activeJob?.turnsInState ?? 0) + 1;
  const eatDuration = activeJob?.timeRequired ?? EATING_TURNS_GROUND;
  // Distribute the pre-paid hunger recovery evenly over the eating duration.
  const totalHunger = activeJob?.hungerToRecover ?? 0;
  const hungerRecoveryThisTurn = totalHunger / eatDuration;
  const newHunger = Math.max(0, (pawn.needs?.hunger ?? 50) - hungerRecoveryThisTurn);

  const updatedNeeds = {
    ...(pawn.needs ?? { hunger: 0, fatigue: 0, sleep: 0, lastSleep: 0, lastMeal: 0 }),
    hunger: newHunger,
    lastMeal: gameState.turn
  };
  const updatedState = {
    ...(pawn.state ?? {
      mood: 50,
      health: 100,
      isWorking: false,
      isSleeping: false,
      isEating: false
    }),
    isEating: turnsInState < eatDuration
  };

  if (turnsInState >= eatDuration) {
    return {
      ...gameState,
      pawns: gameState.pawns.map((p) =>
        p.id === pawn.id
          ? {
              ...p,
              needs: updatedNeeds,
              state: updatedState,
              currentState: PAWN_STATE.IDLE,
              activeJob: undefined
            }
          : p
      )
    };
  }

  return {
    ...gameState,
    pawns: gameState.pawns.map((p) =>
      p.id === pawn.id
        ? {
            ...p,
            needs: updatedNeeds,
            state: updatedState,
            activeJob: activeJob
              ? { ...activeJob, turnsInState, progress: turnsInState / eatDuration }
              : undefined
          }
        : p
    )
  };
}

export function handleSleeping(pawn: Pawn, gameState: GameState): GameState {
  const activeJob = pawn.activeJob;
  const turnsInState = (activeJob?.turnsInState ?? 0) + 1;
  const restBuilding = getRestBuildingAtPawn(pawn, gameState);
  const def = restBuilding ? BUILDINGS_DB.find((d) => d.id === restBuilding.type) : null;
  // Recovery = base ground rate + building's quality bonus.
  // sleeping_spot (sleepQuality:0.1) → 0.58+0.10=0.68; hay_bed (fatigueRecovery:0.3) → 0.58+0.30=0.88.
  const shelterBonus = restBuilding
    ? (def?.effects?.fatigueRecovery ?? def?.effects?.sleepQuality ?? 0)
    : 0;
  const fatigueRecovery = FATIGUE_PER_SLEEPING_GROUND + shelterBonus;
  const sleepDuration = restBuilding ? SLEEPING_TURNS : SLEEPING_TURNS_GROUND; // for progress bar only
  // fatigueRecovery is a per-second rate; apply one tick's worth each step.
  const newFatigue = Math.max(0, (pawn.needs?.fatigue ?? 50) - perTick(fatigueRecovery));
  const newSleep = Math.max(0, (pawn.needs?.sleep ?? 50) - perTick(fatigueRecovery));

  // Wake when fatigue drops to the threshold for current hunger level.
  // Fed pawns sleep to 0 (full rest). Hungry pawns wake at 30 so they can eat,
  // but won't immediately re-sleep since 30 < FATIGUE_THRESHOLD (72).
  const wakeThreshold =
    (pawn.needs?.hunger ?? 0) >= HUNGER_THRESHOLD
      ? SLEEP_WAKE_THRESHOLD_HUNGRY
      : SLEEP_WAKE_THRESHOLD_FED;
  const shouldWake = newFatigue <= wakeThreshold;

  const updatedNeeds = {
    ...(pawn.needs ?? { hunger: 0, fatigue: 0, sleep: 0, lastSleep: 0, lastMeal: 0 }),
    fatigue: newFatigue,
    sleep: newSleep,
    lastSleep: gameState.turn
  };
  const updatedState = {
    ...(pawn.state ?? {
      mood: 50,
      health: 100,
      isWorking: false,
      isSleeping: false,
      isEating: false
    }),
    isSleeping: !shouldWake,
    isEating: false // can't be eating while sleeping
  };

  if (shouldWake) {
    return {
      ...gameState,
      pawns: gameState.pawns.map((p) =>
        p.id === pawn.id
          ? {
              ...p,
              needs: updatedNeeds,
              state: updatedState,
              currentState: PAWN_STATE.IDLE,
              activeJob: undefined
            }
          : p
      )
    };
  }

  return {
    ...gameState,
    pawns: gameState.pawns.map((p) =>
      p.id === pawn.id
        ? {
            ...p,
            needs: updatedNeeds,
            state: updatedState,
            activeJob: activeJob
              ? { ...activeJob, turnsInState, progress: turnsInState / sleepDuration }
              : undefined
          }
        : p
    )
  };
}

