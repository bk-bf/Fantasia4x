import type { GameState, Pawn } from '../../../core/types';
import { gameLogger } from '../../../debug/gameLogger';
import { perTick, ticksFromSeconds } from '../../../core/util/time';
import { consumeFromStockpiles, availableQuantityFromDrops } from '../../../core/state/stockpile';
import { PAWN_STATE, type PawnStateName } from '../pawnStates';
import { tileHasBody } from '../carry';
import {
  carriedDrinkVessel,
  hydrationOf,
  isFluidId,
  takeOut
} from '../../../core/rules/gear/vessels';
import type { ItemInstance } from '../../../core/types';
import {
  isAdjacent,
  selectFoodForMeal,
  selectFoodFromInventory,
  findNearestFoodDrops,
  mealNutrition,
  isAllowedFoodId,
  hasAvailableFood,
  applyIntoxication,
  applyFoodPoisoning,
  applyMealBuff,
  recordMealDeeds,
  SAFE_HUNGER,
  type MealPortion
} from '../pawnQueries';
import { pickUpFromTile } from '../pawnHauling';
import { pawnStatService } from '../../../services/PawnStatService';
import { socialService } from '../../../services/SocialService';
import { itemDefById } from '../../../core/defs/items';
import {
  findNearestStorageBuilding,
  tryAssignPath,
  EATING_TURNS,
  EATING_TURNS_GROUND,
  findNearestRestBuilding,
  tryAssignSleepPath,
  SLEEPING_TURNS,
  SLEEPING_TURNS_GROUND,
  getRestBuildingAtPawn,
  amenityAt,
  BUILDINGS_DB,
  FATIGUE_PER_SLEEPING_GROUND,
  HUNGER_THRESHOLD,
  ROUTE_TO_DRINK_THIRST,
  findNearestWaterTarget,
  findNearestStoredDrink,
  SLEEP_WAKE_THRESHOLD_HUNGRY,
  SLEEP_WAKE_THRESHOLD_FED,
  needsRecovery,
  transitionTo,
  goIdle,
  mutatePawn,
  advancePawnOrders,
  SOCIALISE_TURNS,
  SOCIALISE_RELAXATION_RELIEF,
  LOUNGE_TURNS,
  LOUNGE_COMFORT_RELIEF,
  buildingComfortOf,
  WASH_NEED_RELIEF,
  DRINK_TURNS,
  WASH_TURNS,
  repathStuckMover
} from '../pawnHelpers';

const BED_COMFORT_FILL = 1.5;
const WELL_RESTED_TICKS = ticksFromSeconds(240);

function fmtMeal(meal: { id: string; units: number }[]): string {
  return meal.map((m) => `${m.id}x${m.units}`).join(',') || '∅';
}
function fmtPos(pawn: Pawn): string {
  return pawn.position ? `(${pawn.position.x},${pawn.position.y})` : '(?,?)';
}

function startEatingFromInventory(
  pawn: Pawn,
  gameState: GameState,
  meal: MealPortion[],
  where: string,
  duration: number = EATING_TURNS_GROUND
): GameState {
  const { hungerRecovered, intoxication } = mealNutrition(meal);
  const poisonRes = pawnStatService.evaluateStat('poison_resistance', pawn);
  gameLogger.log(
    gameState.turn,
    'NEED-CHECK',
    () =>
      `${pawn.name} starts eating [${fmtMeal(meal)}] hunger=${(pawn.needs?.hunger ?? 0).toFixed(1)} at ${fmtPos(pawn)} (${where})`
  );
  let next = mutatePawn(gameState, pawn.id, (p) => {
    const items = { ...(p.inventory?.items ?? {}) };
    for (const m of meal) {
      if (isFluidId(m.id)) {
        let litres = m.units;
        for (const inst of p.inventory?.instances ?? []) {
          if (litres <= 0) break;
          litres -= takeOut(inst, m.id, litres);
        }
        for (const inst of Object.values(p.equipment ?? {})) {
          if (litres <= 0) break;
          if (inst) litres -= takeOut(inst, m.id, litres);
        }
        continue;
      }
      const left = (items[m.id] ?? 0) - m.units;
      if (left > 0) items[m.id] = left;
      else delete items[m.id];
    }
    if (p.inventory) p.inventory = { ...p.inventory, items };
    p.path = [];
    p.isMoving = false;
    p.hasReachedDestination = false;
    p.currentState = PAWN_STATE.EATING;
    applyIntoxication(p, intoxication);
    applyFoodPoisoning(p, meal, poisonRes);
    applyMealBuff(p, meal);
    recordMealDeeds(p, meal);
    if (meal.some((m) => itemDefById(m.id)?.mealBuff)) {
      socialService.onAteHotMeal(p, gameState.turn);
    }
    p.activeJob = {
      type: 'need' as const,
      targetX: p.position?.x ?? 0,
      targetY: p.position?.y ?? 0,
      progress: 0,
      timeRequired: duration,
      turnsInState: 0,
      hungerToRecover: hungerRecovered
    };
  });
  if (pawn.position) {
    const px = pawn.position.x;
    const py = pawn.position.y;
    for (const q of next.pawns) {
      if (q.id === pawn.id || q.isAlive === false || !q.position) continue;
      if (q.currentState !== PAWN_STATE.EATING) continue;
      if (Math.max(Math.abs(q.position.x - px), Math.abs(q.position.y - py)) > 2) continue;
      next = socialService.onSharedMeal(next, pawn, q);
    }
  }
  return next;
}

function grabFoodAt(gameState: GameState, pawn: Pawn, x: number, y: number): GameState | null {
  const reachable: Record<string, number> = {};
  for (const d of gameState.droppedItems ?? []) {
    if (!d.stored || d.reservedFor || (d.quantity ?? 0) <= 0) continue;
    if (Math.abs(d.x - x) > 1 || Math.abs(d.y - y) > 1) continue;
    if (isAllowedFoodId(gameState, d.resourceId))
      reachable[d.resourceId] = (reachable[d.resourceId] ?? 0) + d.quantity;
  }
  const meal = selectFoodForMeal(pawn, gameState, reachable);
  const cap = meal.reduce((s, m) => s + m.units, 0) || 1;
  const before = { ...(pawn.inventory?.items ?? {}) };
  let grabbed = gameState;
  for (const m of meal) {
    grabbed = pickUpFromTile(grabbed, pawn.id, x, y, {
      radius: 1,
      resourceId: m.id,
      maxQty: m.units
    });
  }
  const p2 = grabbed.pawns.find((p) => p.id === pawn.id);
  gameLogger.log(gameState.turn, 'NEED-CHECK', () => {
    const after = p2?.inventory?.items ?? {};
    const gained = Object.fromEntries(
      Object.keys(after)
        .map((k) => [k, (after[k] ?? 0) - (before[k] ?? 0)] as const)
        .filter(([, d]) => d > 0)
    );
    const mealStr = meal.map((m) => `${m.id}×${m.units}`).join(',') || '(none)';
    const ids = [...new Set([...meal.map((m) => m.id), ...Object.keys(gained)])];
    const supply = ids
      .map((id) => {
        const agg = gameState.stockpile?.[id] ?? 0;
        const avail = availableQuantityFromDrops(gameState.droppedItems, id);
        const nearR1 = (gameState.droppedItems ?? [])
          .filter(
            (d) =>
              d.resourceId === id &&
              d.stored &&
              !d.reservedFor &&
              (d.quantity ?? 0) > 0 &&
              Math.abs(d.x - x) <= 1 &&
              Math.abs(d.y - y) <= 1
          )
          .reduce((s, d) => s + d.quantity, 0);
        return `${id}{agg:${agg} avail:${avail} nearR1:${nearR1}}`;
      })
      .join(' ');
    return (
      `EAT-DBG ${pawn.name} H:${(pawn.needs?.hunger ?? 0).toFixed(1)} ` +
      `wantMeal=[${mealStr}] cap=${cap} grabAt=(${x},${y}) gained=${JSON.stringify(gained)} | ${supply}`
    );
  });
  if (!p2 || selectFoodFromInventory(p2, grabbed).length === 0) return null;
  return mutatePawn(grabbed, pawn.id, (p) => {
    p.currentState = PAWN_STATE.HUNGRY;
    p.path = [];
    p.isMoving = false;
    p.hasReachedDestination = false;
    p.activeJob = undefined;
  });
}

const DRINK_LITRES = 1;

const CLEAN_TICKS = ticksFromSeconds(300);

function atNaturalWater(pawn: Pawn, gs: GameState): boolean {
  const target = findNearestWaterTarget(pawn, gs, 'drink');
  if (!target || !pawn.position) return false;
  return isAdjacent(pawn.position.x, pawn.position.y, target.x, target.y);
}

export function handleDrinking(pawn: Pawn, gameState: GameState): GameState {
  const activeJob = pawn.activeJob;
  const turnsInState = (activeJob?.turnsInState ?? 0) + 1;
  const duration = DRINK_TURNS;
  let state = gameState;
  let relief = activeJob?.drinkRelief ?? 0;
  if (turnsInState === 1) {
    relief = 0;
    const skin = carriedDrinkVessel(pawn);
    if (skin) {
      const litres = Math.min(DRINK_LITRES, skin.litres);
      relief = litres * hydrationOf(skin.itemId);
      state = mutatePawn(state, pawn.id, (p) => {
        const drink = (inst: ItemInstance | undefined) => {
          if (inst?.instanceId === skin.inst.instanceId) takeOut(inst, skin.itemId, litres);
        };
        for (const inst of p.inventory?.instances ?? []) drink(inst);
        for (const inst of Object.values(p.equipment ?? {})) drink(inst);
      });
    } else if (atNaturalWater(pawn, state)) {
      relief = DRINK_LITRES * hydrationOf('water');
    } else {
      const stored = findNearestStoredDrink(pawn, state);
      const available = stored ? (state.stockpile?.[stored.itemId] ?? 0) : 0;
      if (stored && available > 0) {
        const litres = Math.min(DRINK_LITRES, available);
        relief = litres * hydrationOf(stored.itemId);
        state = consumeFromStockpiles(state, { [stored.itemId]: litres });
      }
    }
  }
  const reliefPerTurn = relief / duration;
  const done = turnsInState >= duration || relief <= 0;
  if (turnsInState === 1)
    gameLogger.log(
      state.turn,
      'NEED-CHECK',
      () =>
        `${pawn.name} starts drinking thirst=${(pawn.needs?.thirst ?? 0).toFixed(1)} at ${fmtPos(pawn)}`
    );
  if (done)
    gameLogger.log(
      state.turn,
      'NEED-CHECK',
      () =>
        `${pawn.name} finished drinking thirst=${Math.max(0, (pawn.needs?.thirst ?? 0) - reliefPerTurn).toFixed(1)} at ${fmtPos(pawn)}`
    );
  return mutatePawn(state, pawn.id, (p) => {
    p.path = [];
    p.isMoving = false;
    p.needs.thirst = Math.max(0, (p.needs.thirst ?? 0) - reliefPerTurn);
    p.needs.lastDrink = state.turn;
    p.currentState = done ? PAWN_STATE.IDLE : PAWN_STATE.DRINKING;
    p.activeJob = done
      ? undefined
      : {
          type: 'need' as const,
          targetX: p.position?.x ?? activeJob?.targetX ?? 0,
          targetY: p.position?.y ?? activeJob?.targetY ?? 0,
          progress: turnsInState / duration,
          timeRequired: duration,
          turnsInState,
          drinkRelief: relief
        };
  });
}

export function handleSocialising(pawn: Pawn, gameState: GameState): GameState {
  const activeJob = pawn.activeJob;
  const turnsInState = (activeJob?.turnsInState ?? 0) + 1;
  const duration = SOCIALISE_TURNS;
  const reliefPerTurn = SOCIALISE_RELAXATION_RELIEF / duration;
  const done = turnsInState >= duration || (pawn.needs?.relaxation ?? 100) >= 100;
  return mutatePawn(gameState, pawn.id, (p) => {
    p.path = [];
    p.isMoving = false;
    p.needs.relaxation = Math.min(100, (p.needs.relaxation ?? 100) + reliefPerTurn);
    p.needs.lastSocialise = gameState.turn;
    p.currentState = done ? PAWN_STATE.IDLE : PAWN_STATE.SOCIALISING;
    p.activeJob = done
      ? undefined
      : {
          type: 'need' as const,
          targetX: p.position?.x ?? activeJob?.targetX ?? 0,
          targetY: p.position?.y ?? activeJob?.targetY ?? 0,
          progress: turnsInState / duration,
          timeRequired: duration,
          turnsInState
        };
  });
}

export function handleLounging(pawn: Pawn, gameState: GameState): GameState {
  const activeJob = pawn.activeJob;
  const turnsInState = (activeJob?.turnsInState ?? 0) + 1;
  const duration = LOUNGE_TURNS;
  const pos0 = pawn.position;
  const seat = pos0
    ? (gameState.buildings ?? []).find(
        (b) =>
          b.status === 'complete' &&
          Math.abs(b.x - pos0.x) <= 1 &&
          Math.abs(b.y - pos0.y) <= 1 &&
          BUILDINGS_DB.find((d) => d.id === b.type)?.buildingProperties?.seat
      )
    : undefined;
  const spotComfort = buildingComfortOf(seat);
  const reliefPerTurn = (LOUNGE_COMFORT_RELIEF / duration) * (0.5 + spotComfort);
  const done = turnsInState >= duration || (pawn.needs?.comfort ?? 100) >= 100;
  return mutatePawn(gameState, pawn.id, (p) => {
    p.path = [];
    p.isMoving = false;
    p.needs.comfort = Math.min(100, (p.needs.comfort ?? 100) + reliefPerTurn);
    p.needs.lastLounge = gameState.turn;
    p.currentState = done ? PAWN_STATE.IDLE : PAWN_STATE.LOUNGING;
    p.activeJob = done
      ? undefined
      : {
          type: 'need' as const,
          targetX: p.position?.x ?? activeJob?.targetX ?? 0,
          targetY: p.position?.y ?? activeJob?.targetY ?? 0,
          progress: turnsInState / duration,
          timeRequired: duration,
          turnsInState
        };
  });
}

export function handleForcedConsume(
  pawn: Pawn,
  gameState: GameState,
  order: { dropId: string; x: number; y: number }
): GameState {
  const drop = (gameState.droppedItems ?? []).find(
    (d) => d.id === order.dropId && (d.quantity ?? 0) > 0
  );
  if (!drop || !pawn.position) return mutatePawn(gameState, pawn.id, advancePawnOrders);

  const onOrAdjacent =
    (pawn.position.x === drop.x && pawn.position.y === drop.y) ||
    isAdjacent(pawn.position.x, pawn.position.y, drop.x, drop.y);
  if (!onOrAdjacent) {
    const afterPath = tryAssignPath(pawn, drop.x, drop.y, gameState);
    if (afterPath) {
      return mutatePawn(afterPath, pawn.id, (p) => {
        p.currentState = PAWN_STATE.MOVING_TO_NEED;
        p.activeJob = {
          type: 'need' as const,
          targetX: drop.x,
          targetY: drop.y,
          progress: 0,
          timeRequired: EATING_TURNS,
          turnsInState: 0,
          targetState: PAWN_STATE.IDLE
        };
      });
    }
    return mutatePawn(gameState, pawn.id, advancePawnOrders);
  }

  const grabbed = pickUpFromTile(gameState, pawn.id, drop.x, drop.y, {
    dropId: order.dropId,
    radius: 1
  });
  const p2 = grabbed.pawns.find((p) => p.id === pawn.id);
  const meal = p2 ? selectFoodFromInventory(p2, grabbed) : [];
  if (meal.length === 0) return mutatePawn(grabbed, pawn.id, advancePawnOrders);
  const cleared = mutatePawn(grabbed, pawn.id, advancePawnOrders);
  const eater = cleared.pawns.find((p) => p.id === pawn.id)!;
  return startEatingFromInventory(eater, cleared, meal, 'forced');
}

export function handleForcedDrink(
  pawn: Pawn,
  gameState: GameState,
  order: { x: number; y: number }
): GameState {
  if (!pawn.position) return mutatePawn(gameState, pawn.id, advancePawnOrders);
  const onOrAdjacent =
    (pawn.position.x === order.x && pawn.position.y === order.y) ||
    isAdjacent(pawn.position.x, pawn.position.y, order.x, order.y);
  if (!onOrAdjacent) {
    const afterPath = tryAssignPath(pawn, order.x, order.y, gameState);
    if (afterPath) {
      return mutatePawn(afterPath, pawn.id, (p) => {
        p.currentState = PAWN_STATE.MOVING_TO_NEED;
        p.activeJob = {
          type: 'need' as const,
          targetX: order.x,
          targetY: order.y,
          progress: 0,
          timeRequired: DRINK_TURNS,
          turnsInState: 0,
          targetState: PAWN_STATE.IDLE
        };
      });
    }
    return mutatePawn(gameState, pawn.id, advancePawnOrders);
  }
  const cleared = mutatePawn(gameState, pawn.id, advancePawnOrders);
  const drinker = cleared.pawns.find((p) => p.id === pawn.id)!;
  return handleDrinking(drinker, cleared);
}

export function handleWashing(pawn: Pawn, gameState: GameState): GameState {
  const activeJob = pawn.activeJob;
  const turnsInState = (activeJob?.turnsInState ?? 0) + 1;
  const duration = WASH_TURNS;
  const reliefPerTurn = WASH_NEED_RELIEF / duration;
  let state = gameState;
  let soaped = false;
  if (turnsInState === 1 && (gameState.stockpile?.['soap'] ?? 0) >= 1) {
    state = consumeFromStockpiles(gameState, { soap: 1 });
    soaped = true;
  }
  const done = turnsInState >= duration;
  if (turnsInState === 1)
    gameLogger.log(
      state.turn,
      'NEED-CHECK',
      () =>
        `${pawn.name} starts washing${soaped ? ' with soap' : ''} hygiene=${(pawn.needs?.hygiene ?? 0).toFixed(1)} at ${fmtPos(pawn)}`
    );
  if (done)
    gameLogger.log(
      state.turn,
      'NEED-CHECK',
      () =>
        `${pawn.name} finished washing hygiene=${Math.max(0, (pawn.needs?.hygiene ?? 0) - reliefPerTurn).toFixed(1)} at ${fmtPos(pawn)}`
    );
  return mutatePawn(state, pawn.id, (p) => {
    p.path = [];
    p.isMoving = false;
    p.needs.hygiene = Math.max(0, (p.needs.hygiene ?? 0) - reliefPerTurn);
    p.needs.lastWash = state.turn;
    if (soaped)
      p.conditionTimers = {
        ...(p.conditionTimers ?? {}),
        clean: Math.max(p.conditionTimers?.clean ?? 0, CLEAN_TICKS)
      };
    p.currentState = done ? PAWN_STATE.IDLE : PAWN_STATE.WASHING;
    p.activeJob = done
      ? undefined
      : {
          type: 'need' as const,
          targetX: p.position?.x ?? activeJob?.targetX ?? 0,
          targetY: p.position?.y ?? activeJob?.targetY ?? 0,
          progress: turnsInState / duration,
          timeRequired: duration,
          turnsInState
        };
  });
}

export function handleHungry(pawn: Pawn, gameState: GameState): GameState {
  const carried = selectFoodFromInventory(pawn, gameState);
  if (carried.length > 0) {
    const campfire = findNearestStorageBuilding(pawn, gameState);
    if (
      campfire &&
      pawn.position &&
      !isAdjacent(pawn.position.x, pawn.position.y, campfire.x, campfire.y)
    ) {
      const afterPath = tryAssignPath(pawn, campfire.x, campfire.y, gameState);
      if (afterPath) {
        return mutatePawn(afterPath, pawn.id, (p) => {
          p.currentState = PAWN_STATE.MOVING_TO_NEED;
          p.activeJob = {
            type: 'need' as const,
            targetX: campfire.x,
            targetY: campfire.y,
            progress: 0,
            timeRequired: EATING_TURNS,
            turnsInState: 0,
            targetState: PAWN_STATE.EATING
          };
        });
      }
    }
    return startEatingFromInventory(pawn, gameState, carried, 'in place');
  }

  if (selectFoodForMeal(pawn, gameState).length === 0)
    return transitionTo(pawn, PAWN_STATE.IDLE, gameState);

  for (const d of findNearestFoodDrops(pawn, gameState)) {
    if (!pawn.position) break;
    const onOrAdjacent =
      (pawn.position.x === d.x && pawn.position.y === d.y) ||
      isAdjacent(pawn.position.x, pawn.position.y, d.x, d.y);
    if (onOrAdjacent) {
      const grabbed = grabFoodAt(gameState, pawn, d.x, d.y);
      if (grabbed) return grabbed;
      continue;
    }
    const afterPath = tryAssignPath(pawn, d.x, d.y, gameState);
    if (afterPath) {
      return mutatePawn(afterPath, pawn.id, (p) => {
        p.currentState = PAWN_STATE.MOVING_TO_NEED;
        p.activeJob = {
          type: 'need' as const,
          targetX: d.x,
          targetY: d.y,
          progress: 0,
          timeRequired: EATING_TURNS,
          turnsInState: 0,
          targetState: PAWN_STATE.HUNGRY
        };
      });
    }
  }
  return transitionTo(pawn, PAWN_STATE.IDLE, gameState);
}

export function handleTired(pawn: Pawn, gameState: GameState): GameState {
  const restBuilding = findNearestRestBuilding(pawn, gameState);
  let onBed = false;
  if (restBuilding && pawn.position) {
    const atBed = pawn.position.x === restBuilding.x && pawn.position.y === restBuilding.y;
    if (atBed) {
      onBed = true;
    } else {
      const afterPath = tryAssignSleepPath(pawn, restBuilding.x, restBuilding.y, gameState);
      if (afterPath) {
        return mutatePawn(afterPath, pawn.id, (p) => {
          p.currentState = PAWN_STATE.MOVING_TO_NEED;
          p.activeJob = {
            type: 'need' as const,
            targetX: restBuilding.x,
            targetY: restBuilding.y,
            progress: 0,
            timeRequired: SLEEPING_TURNS,
            turnsInState: 0,
            targetState: PAWN_STATE.SLEEPING
          };
        });
      }
      gameLogger.log(
        gameState.turn,
        'NEED-CHECK',
        `${pawn.name} TIRED: bed at (${restBuilding.x},${restBuilding.y}) unreachable, sleeping on the ground`
      );
    }
  }

  const sleepTargetX = onBed ? restBuilding!.x : (pawn.position?.x ?? 0);
  const sleepTargetY = onBed ? restBuilding!.y : (pawn.position?.y ?? 0);
  gameLogger.log(
    gameState.turn,
    'NEED-CHECK',
    () =>
      `${pawn.name} goes to sleep at ${fmtPos(pawn)} fatigue=${(pawn.needs?.fatigue ?? 0).toFixed(1)} (${onBed ? 'on bed' : 'on ground'})`
  );
  return mutatePawn(gameState, pawn.id, (p) => {
    p.currentState = PAWN_STATE.SLEEPING;
    p.path = [];
    p.isMoving = false;
    p.activeJob = {
      type: 'need' as const,
      targetX: sleepTargetX,
      targetY: sleepTargetY,
      progress: 0,
      timeRequired: SLEEPING_TURNS,
      turnsInState: 0
    };
  });
}

export function handleMovingToNeed(pawn: Pawn, gameState: GameState): GameState {
  const activeJob = pawn.activeJob;
  if (!activeJob) return goIdle(pawn, gameState);

  const recovered = repathStuckMover(pawn, gameState);
  if (recovered === 'unreachable') return goIdle(pawn, gameState);
  if (recovered) return recovered;

  if (pawn.hasReachedDestination && pawn.position) {
    const targetState = (activeJob.targetState ?? PAWN_STATE.EATING) as PawnStateName;
    if (targetState === PAWN_STATE.HUNGRY) {
      return (
        grabFoodAt(gameState, pawn, activeJob.targetX, activeJob.targetY) ?? goIdle(pawn, gameState)
      );
    }
    if (targetState === PAWN_STATE.EATING) {
      const meal = selectFoodFromInventory(pawn, gameState);
      if (meal.length === 0) return goIdle(pawn, gameState);
      return startEatingFromInventory(pawn, gameState, meal, 'at campfire', EATING_TURNS);
    }
    if (targetState === PAWN_STATE.SLEEPING) {
      const onBed =
        pawn.position?.x === activeJob.targetX && pawn.position?.y === activeJob.targetY;
      if (!onBed && tileHasBody(gameState, activeJob.targetX, activeJob.targetY, [pawn.id])) {
        return transitionTo(pawn, PAWN_STATE.TIRED, gameState);
      }
      if (!onBed) {
        const retried = tryAssignSleepPath(pawn, activeJob.targetX, activeJob.targetY, gameState);
        if (retried) {
          return mutatePawn(retried, pawn.id, (p) => {
            p.hasReachedDestination = false;
          });
        }
      }
      gameLogger.log(
        gameState.turn,
        'NEED-CHECK',
        () =>
          `${pawn.name} goes to sleep at ${fmtPos(pawn)} fatigue=${(pawn.needs?.fatigue ?? 0).toFixed(1)} (${onBed ? 'on bed' : 'off-spot, bed unreachable'})`
      );
    }
    return mutatePawn(gameState, pawn.id, (p) => {
      p.currentState = targetState;
      p.hasReachedDestination = false;
      p.path = [];
      p.isMoving = false;
    });
  }
  return gameState;
}

export function handleEating(pawn: Pawn, gameState: GameState): GameState {
  const activeJob = pawn.activeJob;
  const turnsInState = (activeJob?.turnsInState ?? 0) + 1;
  const eatDuration = activeJob?.timeRequired ?? EATING_TURNS_GROUND;
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
    const stillHungry = newHunger > SAFE_HUNGER && hasAvailableFood(gameState);
    gameLogger.log(
      gameState.turn,
      'NEED-CHECK',
      () =>
        `${pawn.name} finished eating ate=${turnsInState} turns hunger=${newHunger.toFixed(1)} at ${fmtPos(pawn)}` +
        (stillHungry ? ' → still hungry, fetching more' : '')
    );
    return mutatePawn(gameState, pawn.id, (p) => {
      p.path = [];
      p.isMoving = false;
      p.needs = updatedNeeds;
      p.state = updatedState;
      p.currentState = stillHungry ? PAWN_STATE.HUNGRY : PAWN_STATE.IDLE;
      p.activeJob = undefined;
    });
  }

  return mutatePawn(gameState, pawn.id, (p) => {
    p.path = [];
    p.isMoving = false;
    p.needs = updatedNeeds;
    p.state = updatedState;
    p.activeJob = activeJob
      ? { ...activeJob, turnsInState, progress: turnsInState / eatDuration }
      : undefined;
  });
}

export function handleSleeping(pawn: Pawn, gameState: GameState): GameState {
  const activeJob = pawn.activeJob;
  const turnsInState = (activeJob?.turnsInState ?? 0) + 1;
  const restBuilding = getRestBuildingAtPawn(pawn, gameState);
  const def = restBuilding ? BUILDINGS_DB.find((d) => d.id === restBuilding.type) : null;
  const shelterBonus = restBuilding
    ? (def?.effects?.fatigueRecovery ?? def?.effects?.sleepQuality ?? 0)
    : 0;
  const pos = pawn.position;
  const amenityBonus = pos
    ? Math.min(0.4, amenityAt(gameState.buildings, pos.x, pos.y).beauty * 0.15)
    : 0;
  const bedComfort = buildingComfortOf(restBuilding);
  const fatigueRecovery = FATIGUE_PER_SLEEPING_GROUND + shelterBonus + amenityBonus;
  const sleepDuration = restBuilding ? SLEEPING_TURNS : SLEEPING_TURNS_GROUND;
  const newFatigue = Math.max(0, (pawn.needs?.fatigue ?? 50) - perTick(fatigueRecovery));
  const newSleep = Math.max(0, (pawn.needs?.sleep ?? 50) - perTick(fatigueRecovery));

  const thirsty =
    (pawn.needs?.thirst ?? 0) >= ROUTE_TO_DRINK_THIRST &&
    !!findNearestWaterTarget(pawn, gameState, 'drink');
  const wakeThreshold =
    (pawn.needs?.hunger ?? 0) >= HUNGER_THRESHOLD || thirsty
      ? SLEEP_WAKE_THRESHOLD_HUNGRY
      : SLEEP_WAKE_THRESHOLD_FED;
  const recovering =
    (pawn.restPolicy ?? 'always') !== 'never' &&
    needsRecovery(pawn) &&
    ((pawn.needs?.hunger ?? 0) < HUNGER_THRESHOLD || !hasAvailableFood(gameState)) &&
    !thirsty;
  const shouldWake = newFatigue <= wakeThreshold && !recovering;

  const updatedNeeds = {
    ...(pawn.needs ?? { hunger: 0, fatigue: 0, sleep: 0, lastSleep: 0, lastMeal: 0 }),
    fatigue: newFatigue,
    sleep: newSleep,
    lastSleep: gameState.turn,
    comfort: Math.min(100, (pawn.needs?.comfort ?? 100) + perTick(bedComfort * BED_COMFORT_FILL))
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
    isEating: false
  };

  if (shouldWake) {
    gameLogger.log(
      gameState.turn,
      'NEED-CHECK',
      () =>
        `${pawn.name} wakes up slept=${turnsInState} turns at ${fmtPos(pawn)} fatigue=${newFatigue.toFixed(1)} hunger=${(pawn.needs?.hunger ?? 0).toFixed(1)}`
    );
    return mutatePawn(gameState, pawn.id, (p) => {
      p.needs = updatedNeeds;
      p.state = updatedState;
      p.currentState = PAWN_STATE.IDLE;
      p.activeJob = undefined;
      if (restBuilding) {
        p.conditionTimers = {
          ...(p.conditionTimers ?? {}),
          well_rested: Math.max(p.conditionTimers?.well_rested ?? 0, WELL_RESTED_TICKS)
        };
      }
      if (restBuilding) {
        socialService.onSleptInBed(p, gameState.turn);
      } else {
        const deeds = (p.deeds ??= {});
        deeds.sleptUnsheltered = (deeds.sleptUnsheltered ?? 0) + 1;
      }
    });
  }

  return mutatePawn(gameState, pawn.id, (p) => {
    p.needs = updatedNeeds;
    p.state = updatedState;
    p.activeJob = activeJob
      ? { ...activeJob, turnsInState, progress: turnsInState / sleepDuration }
      : undefined;
  });
}
