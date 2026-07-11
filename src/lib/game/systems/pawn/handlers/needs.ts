/** pawn/handlers/needs — needs state handlers, extracted from PawnStateMachine (hotspot step 2). Each
 *  is a plain (pawn, gameState) => GameState function; the dispatcher wires them into the table.
 *  M2-core (ENGINE-PERFORMANCE ★ ACTIVE): single-pawn updates go through `mutatePawn` (mutate the
 *  live array element in place, no per-call `pawns.map` array allocation). Safe — see mutatePawn. */
import type { GameState, Pawn } from '../../../core/types';
import { gameLogger } from '../../../dev/gameLogger';
import { perTick } from '../../../core/time';
import { consumeFromStockpiles, availableQuantityFromDrops } from '../../../core/GameState';
import { PAWN_STATE, type PawnStateName } from '../pawnStates';
import { tileHasBody } from '../carry';
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
  SLEEP_WAKE_THRESHOLD_HUNGRY,
  SLEEP_WAKE_THRESHOLD_FED,
  needsRecovery,
  transitionTo,
  goIdle,
  mutatePawn,
  advancePawnOrders,
  DRINK_NEED_RELIEF,
  WASH_NEED_RELIEF,
  DRINK_TURNS,
  WASH_TURNS,
  repathStuckMover
} from '../pawnHelpers';

/** Debug helpers — compact need-event formatting (only built when LOG_VERBOSE; logs use thunks). */
function fmtMeal(meal: { id: string; units: number }[]): string {
  return meal.map((m) => `${m.id}x${m.units}`).join(',') || '∅';
}
function fmtPos(pawn: Pawn): string {
  return pawn.position ? `(${pawn.position.x},${pawn.position.y})` : '(?,?)';
}

/**
 * Begin EATING from the food the pawn CARRIES: deduct the meal from its pack (ADR-002 in place), apply
 * intoxication/poisoning/meal-buff, and spread the hunger recovery over `duration`. The food is consumed
 * from the pawn's own inventory — NOT the ethereal colony aggregate — so a pawn only eats what it
 * physically fetched and is holding. Shared by the eat-in-place and arrived-at-campfire paths.
 */
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
  return mutatePawn(gameState, pawn.id, (p) => {
    // Eat from the pack: deduct the consumed units (drop the key once a stack is finished).
    const items = { ...(p.inventory?.items ?? {}) };
    for (const m of meal) {
      const left = (items[m.id] ?? 0) - m.units;
      if (left > 0) items[m.id] = left;
      else delete items[m.id];
    }
    if (p.inventory) p.inventory = { ...p.inventory, items };
    p.path = [];
    p.isMoving = false;
    p.hasReachedDestination = false;
    p.currentState = PAWN_STATE.EATING;
    applyIntoxication(p, intoxication); // §F8: a drink in the meal lifts mood + makes the pawn tipsy
    applyFoodPoisoning(p, meal, poisonRes); // §F8: a tainted serving may bring on nausea/dysentery
    applyMealBuff(p, meal); // §F8: a cooked dish grants its meal buff (well_fed/hearty_meal/…)
    recordMealDeeds(p, meal); // LINEAGES §4: carnivore eating feeds Beast/Werewolf awakening deeds
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
}

/**
 * Pick up stockpiled food at (x,y) into the pawn's pack, then drop it back to HUNGRY to re-evaluate
 * (eat now / carry to a campfire). Returns null when nothing grabbable is there (the stack vanished
 * before the pawn arrived) so the caller can try the next stack or idle. The pickup cap mirrors the
 * colony-optimal meal size so a pawn grabs a serving, not the whole larder.
 */
function grabFoodAt(gameState: GameState, pawn: Pawn, x: number, y: number): GameState | null {
  // Size the pickup to a meal made from the food ACTUALLY reachable at this tile — NOT the idealised
  // colony-wide meal. selectFoodForMeal over the whole stockpile plans the highest-NUTRITION food
  // anywhere (e.g. apple×3), but the pawn then physically grabs whatever is HERE (berries): 3 units of
  // berries ≠ 3 units of apple in nutrition, so it nibbled 9 hunger off an 80 deficit and walked off
  // still starving. Planning from the radius-1 reachable supply (matching pickUpFromTile's own scan)
  // sizes the cap to the food it will really pick up.
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
  // Grab the PLANNED meal items, not an arbitrary `maxQty` of whatever food sits first in the drop
  // array. The old single capped pickup sized the cap to the most-NUTRITIOUS reachable food (e.g.
  // peas×2) but then physically took `cap` units of whatever pickUpFromTile scanned first — at a
  // basket dominated by berry stacks that's 2 berries (~6 nutrition) against a 60+ deficit, so the
  // pawn nibbled and walked off still starving, re-tripping the hunger interrupt a few tiles later.
  // Picking up per planned `resourceId` makes the nutrition grabbed match the deficit the meal was
  // planned for (the most nutritious food first, then less nutritious ones as the plan's supplement).
  let grabbed = gameState;
  for (const m of meal) {
    grabbed = pickUpFromTile(grabbed, pawn.id, x, y, {
      radius: 1,
      resourceId: m.id,
      maxQty: m.units
    });
  }
  const p2 = grabbed.pawns.find((p) => p.id === pawn.id);
  // EAT-DBG: pinpoint why a meal is small. Logs the meal the pawn WANTS (cap), the colony aggregate
  // (gs.stockpile, reserved-INCLUSIVE) vs the unreserved-available stock (what pickUpFromTile can take),
  // the unreserved food physically within radius 1 of the grab tile (fragmentation), and what actually
  // entered the pack. cap≈3 ⇒ the meal sizing is the cause; cap big but gained≈3 ⇒ reserved/fragmented.
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
  if (!p2 || selectFoodFromInventory(p2, grabbed).length === 0) return null; // nothing entered the pack
  return mutatePawn(grabbed, pawn.id, (p) => {
    p.currentState = PAWN_STATE.HUNGRY;
    p.path = [];
    p.isMoving = false;
    p.hasReachedDestination = false;
    p.activeJob = undefined;
  });
}

/** §D: drink at the reached target over DRINK_TURNS (not instant — mirrors eating). Consumes one
 *  unit of stored water on the first sip; the thirst relief is spread evenly across the duration. */
export function handleDrinking(pawn: Pawn, gameState: GameState): GameState {
  const activeJob = pawn.activeJob;
  const turnsInState = (activeJob?.turnsInState ?? 0) + 1;
  const duration = DRINK_TURNS;
  let state = gameState;
  // Consume one unit of stored water on the first sip (if any is stocked).
  if (turnsInState === 1 && (state.stockpile?.['water'] ?? 0) > 0) {
    state = consumeFromStockpiles(state, { water: 1 });
  }
  const reliefPerTurn = DRINK_NEED_RELIEF / duration;
  const done = turnsInState >= duration;
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
    // Gate the pawn at the water tile for the whole task — clear any residual path so a pawn that
    // entered DRINKING while still moving can't walk off before it finishes.
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
          turnsInState
        };
  });
}

/** §D: wash at the reached target over WASH_TURNS (not instant). Hygiene relief is spread evenly
 *  across the duration; washing is a longer chore than drinking. */
/** DRAFTED-JOB-ORDERS §8: force-eat a SPECIFIC dropped item NOW (an undrafted manual order, run
 *  regardless of hunger). Walk to the drop's tile (IDLE arrival re-enters handleIdle); on adjacency
 *  grab that item into the pack, clear the order, and start eating it as a normal timed meal. If the
 *  drop is gone or unreachable, just drop the order and let the queue advance. */
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
          targetState: PAWN_STATE.IDLE // arrive → IDLE → handleIdle re-runs the order (now adjacent)
        };
      });
    }
    return mutatePawn(gameState, pawn.id, advancePawnOrders); // unreachable — abandon
  }

  // Adjacent: grab this item (budget-limited), then eat whatever serving that yields.
  const grabbed = pickUpFromTile(gameState, pawn.id, drop.x, drop.y, {
    dropId: order.dropId,
    radius: 1
  });
  const p2 = grabbed.pawns.find((p) => p.id === pawn.id);
  const meal = p2 ? selectFoodFromInventory(p2, grabbed) : [];
  if (meal.length === 0) return mutatePawn(grabbed, pawn.id, advancePawnOrders); // nothing edible grabbed
  const cleared = mutatePawn(grabbed, pawn.id, advancePawnOrders); // one-shot order — drop it before eating
  const eater = cleared.pawns.find((p) => p.id === pawn.id)!;
  return startEatingFromInventory(eater, cleared, meal, 'forced');
}

/** DRAFTED-JOB-ORDERS §8: force-drink at a water tile NOW (undrafted manual order, regardless of
 *  thirst). Walk to the tile; on adjacency clear the order and start the timed DRINKING need. */
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
  const cleared = mutatePawn(gameState, pawn.id, advancePawnOrders); // one-shot — drop before drinking
  const drinker = cleared.pawns.find((p) => p.id === pawn.id)!;
  return handleDrinking(drinker, cleared);
}

export function handleWashing(pawn: Pawn, gameState: GameState): GameState {
  const activeJob = pawn.activeJob;
  const turnsInState = (activeJob?.turnsInState ?? 0) + 1;
  const duration = WASH_TURNS;
  const reliefPerTurn = WASH_NEED_RELIEF / duration;
  const done = turnsInState >= duration;
  if (turnsInState === 1)
    gameLogger.log(
      gameState.turn,
      'NEED-CHECK',
      () =>
        `${pawn.name} starts washing hygiene=${(pawn.needs?.hygiene ?? 0).toFixed(1)} at ${fmtPos(pawn)}`
    );
  if (done)
    gameLogger.log(
      gameState.turn,
      'NEED-CHECK',
      () =>
        `${pawn.name} finished washing hygiene=${Math.max(0, (pawn.needs?.hygiene ?? 0) - reliefPerTurn).toFixed(1)} at ${fmtPos(pawn)}`
    );
  return mutatePawn(gameState, pawn.id, (p) => {
    // Gate the pawn at the water tile for the whole task (see handleDrinking).
    p.path = [];
    p.isMoving = false;
    p.needs.hygiene = Math.max(0, (p.needs.hygiene ?? 0) - reliefPerTurn);
    p.needs.lastWash = gameState.turn;
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
  // Eat from the PACK first. If the pawn already carries allowed food (it just fetched it, below, or was
  // hauling some), eat it — walking to a campfire for the faster recovery if one's reachable, else right
  // where it stands. Food is consumed from the pawn's own inventory, never the ethereal aggregate.
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
        // Carry the food to the fire; it's eaten on arrival (handleMovingToNeed, EATING target).
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

  // Empty pack: the pawn must FETCH physical food before it can eat (ADR-016 — no consuming the ethereal
  // aggregate). Walk to the nearest reachable stockpiled food and pick it up; eating happens next tick
  // via the carried-food branch above.
  if (selectFoodForMeal(pawn, gameState).length === 0)
    return transitionTo(pawn, PAWN_STATE.IDLE, gameState); // no food anywhere in the colony

  for (const d of findNearestFoodDrops(pawn, gameState)) {
    if (!pawn.position) break;
    const onOrAdjacent =
      (pawn.position.x === d.x && pawn.position.y === d.y) ||
      isAdjacent(pawn.position.x, pawn.position.y, d.x, d.y);
    if (onOrAdjacent) {
      const grabbed = grabFoodAt(gameState, pawn, d.x, d.y);
      if (grabbed) return grabbed; // got food → re-evaluate as HUNGRY next tick (eat / carry to fire)
      continue; // nothing grabbable here — try the next nearest stack
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
          targetState: PAWN_STATE.HUNGRY // arrival = pick the food up, then re-evaluate
        };
      });
    }
  }
  // Food exists in the colony but none is physically reachable right now — wait it out as IDLE rather
  // than teleport-eat (strictly physical food, per design). Hunger keeps climbing; starvation still bites.
  return transitionTo(pawn, PAWN_STATE.IDLE, gameState);
}

export function handleTired(pawn: Pawn, gameState: GameState): GameState {
  // Seek the assigned/nearest bed and walk ON to its tile to sleep.
  // Only one pawn can occupy a bed at a time (findNearestRestBuilding skips occupied ones).
  const restBuilding = findNearestRestBuilding(pawn, gameState);
  let onBed = false;
  if (restBuilding && pawn.position) {
    const atBed = pawn.position.x === restBuilding.x && pawn.position.y === restBuilding.y;
    if (atBed) {
      onBed = true; // already standing on the bed tile — sleep here.
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
      // Bed exists but there's no path to it (walled off / across water / blocked). Don't freeze in
      // TIRED forever waiting for a route that won't appear — lie down and sleep on the ground where
      // we stand. Falls through to the ground-sleep block below (onBed stays false).
      gameLogger.log(
        gameState.turn,
        'NEED-CHECK',
        `${pawn.name} TIRED: bed at (${restBuilding.x},${restBuilding.y}) unreachable, sleeping on the ground`
      );
    }
  }

  // Sleep at the current position (no bed, or the bed was unreachable). Only when actually on the
  // bed tile do we store the bed's coords as the job target so the UI and handleSleeping can identify
  // which bed the pawn is using — otherwise record where the pawn collapsed.
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

  // Recover from a path dropped after being blocked too long; if the need target (food
  // tile / well / bed) is now unreachable, drop back to Idle to re-evaluate.
  const recovered = repathStuckMover(pawn, gameState);
  if (recovered === 'unreachable') return goIdle(pawn, gameState);
  if (recovered) return recovered;

  if (pawn.hasReachedDestination && pawn.position) {
    const targetState = (activeJob.targetState ?? PAWN_STATE.EATING) as PawnStateName;
    if (targetState === PAWN_STATE.HUNGRY) {
      // Arrived at the food stockpile — pick a serving up into the pack, then re-evaluate as HUNGRY
      // (eat here / carry to a campfire). If the stack vanished before arrival, drop to Idle to re-pick.
      return (
        grabFoodAt(gameState, pawn, activeJob.targetX, activeJob.targetY) ?? goIdle(pawn, gameState)
      );
    }
    if (targetState === PAWN_STATE.EATING) {
      // Arrived at the campfire carrying food — eat it from the pack (the campfire's faster recovery).
      const meal = selectFoodFromInventory(pawn, gameState);
      if (meal.length === 0) return goIdle(pawn, gameState); // lost the food en route
      return startEatingFromInventory(pawn, gameState, meal, 'at campfire', EATING_TURNS);
    }
    if (targetState === PAWN_STATE.SLEEPING) {
      // Sleep ONLY when actually standing ON the bed tile. If movement stopped us short (a blocked
      // final step, a path truncated to an adjacent tile), re-route onto the spot instead of
      // collapsing one tile away. Sleep in place only when the bed is genuinely unreachable right now
      // (the exhaustion guard still backstops a pawn that can never reach it).
      const onBed =
        pawn.position?.x === activeJob.targetX && pawn.position?.y === activeJob.targetY;
      // The chosen bed got occupied by a body since we set out (e.g. a pawn collapsed into it — the
      // one we just tended). Don't loop re-routing toward a tile we can never step onto: drop back to
      // TIRED to RE-SELECT a different bed (findNearestRestBuilding now skips body-occupied beds) or
      // sleep on the ground. This is what unfreezes a pawn stuck "MovingToNeed" beside a downed ally.
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
        // Unreachable this tick — fall through and sleep where we are (last resort).
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
      // Arrived — stop any residual movement so we don't sleepwalk past the tile.
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
    // Keep eating until satiated. If one serving didn't reach SAFE_HUNGER — the tile/basket ran short,
    // the food was spread across stacks/types, or the carry budget capped the grab — and there's still
    // food to get, drop back to HUNGRY to fetch + eat another serving rather than returning to work
    // under-fed and re-tripping the hunger interrupt a few tiles later (the walk-back-and-forth this
    // fixes). Re-entry eats leftover pack food first (no trip), else fetches the next stack — across
    // food types and tiles — until hunger ≤ SAFE_HUNGER or no food is reachable. Self-terminating:
    // selectFoodForMeal returns an empty meal once hunger ≤ SAFE_HUNGER, so handleHungry then idles.
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
    // Gate the pawn in place while eating — a pawn that ate in place while still wandering
    // (or otherwise entered EATING with a residual path) must not drift off mid-meal.
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
  // Recovery = base ground rate + building's quality bonus.
  // sleeping_spot (sleepQuality:0.1) → 0.58+0.10=0.68; hay_bed (fatigueRecovery:0.3) → 0.58+0.30=0.88.
  const shelterBonus = restBuilding
    ? (def?.effects?.fatigueRecovery ?? def?.effects?.sleepQuality ?? 0)
    : 0;
  // §M room amenity: a comfortable, beautiful, finely-built bedroom (couch/cushioned chair/feather bed,
  // silk/wool/cotton material) rests a pawn faster. Scaled small + capped so it tops up the bed's rest
  // quality without dwarfing it. Material choice feeds in via amenityAt (the building's `materials`).
  const pos = pawn.position;
  const amenityBonus = pos
    ? Math.min(
        0.4,
        (() => {
          const a = amenityAt(gameState.buildings, pos.x, pos.y);
          return (a.comfort + a.beauty) * 0.15;
        })()
      )
    : 0;
  const fatigueRecovery = FATIGUE_PER_SLEEPING_GROUND + shelterBonus + amenityBonus;
  const sleepDuration = restBuilding ? SLEEPING_TURNS : SLEEPING_TURNS_GROUND; // for progress bar only
  // fatigueRecovery is a per-second rate; apply one tick's worth each step.
  const newFatigue = Math.max(0, (pawn.needs?.fatigue ?? 50) - perTick(fatigueRecovery));
  const newSleep = Math.max(0, (pawn.needs?.sleep ?? 50) - perTick(fatigueRecovery));

  // Wake when fatigue drops to the threshold for the pawn's current hunger/thirst.
  // Fed+watered pawns sleep to 0 (full rest). A HUNGRY or THIRSTY pawn wakes early (at 30) so it can
  // go eat/drink instead of sleeping through it — won't immediately re-sleep since 30 < FATIGUE (72).
  // Thirst only forces a wake when the pawn must WALK to drink (a reachable drink zone/well): stored
  // water and adjacent rivers are handled by processAutoDrink even while asleep, so they never reach
  // this threshold; gating on a reachable target avoids an Idle↔Sleeping ping-pong when there's no
  // water to go to at all (the hasAvailableFood analogue for thirst). Dehydration is lethal — this is
  // the fix for pawns sleeping through rising thirst.
  const thirsty =
    (pawn.needs?.thirst ?? 0) >= ROUTE_TO_DRINK_THIRST &&
    !!findNearestWaterTarget(pawn, gameState, 'drink');
  const wakeThreshold =
    (pawn.needs?.hunger ?? 0) >= HUNGER_THRESHOLD || thirsty
      ? SLEEP_WAKE_THRESHOLD_HUNGRY
      : SLEEP_WAKE_THRESHOLD_FED;
  // A wounded pawn keeps resting even at zero fatigue — it stays down until its wounds clear (wounds
  // only mend at full rate while resting), unless hunger/thirst forces it up first or its restPolicy
  // is 'never' (then it wakes and goes back to work, accepting the slow active heal rate). Hunger only
  // wakes it when there's actually food to GO eat — with an empty stockpile, getting up is pointless
  // (and ping-pongs Idle↔Sleeping against recoveryChoice), so it stays down and heals. MUST mirror
  // recoveryChoice's gate (same hunger && hasAvailableFood condition); thirst mirrors it via `thirsty`.
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
