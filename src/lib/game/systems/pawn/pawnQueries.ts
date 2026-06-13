/**
 * pawnQueries — stateless predicates and selectors extracted from `PawnStateMachine`.
 *
 * These are pure-ish read helpers (no GameState mutation beyond returning new state via the
 * GameStateManager helpers): adjacency math, approach-tile search, and food availability /
 * meal selection / consumption. They were the high-fan-in, side-effect-free functions trapped
 * in the AI god-file (hotspot report, step 4). Kept as plain functions so the layered
 * architecture is unchanged and so each is trivially unit-testable.
 */
import type { GameState, Pawn } from '../../core/types';
import ITEMS_DATABASE from '../../database/items.jsonc';
import { consumeFromStockpiles } from '../../core/GameState';

// Index items by id once at module load — avoids an ITEMS_DATABASE.find(...) per stockpile entry
// per call for every needy pawn each tick.
export const ITEM_DEF_BY_ID: Map<string, any> = new Map(
  (ITEMS_DATABASE as any[]).map((d) => [d.id, d])
);

/** Target hunger level after a full meal. */
export const SAFE_HUNGER = 10;

/** 8-neighbour adjacency (Chebyshev ≤ 1), excluding the same tile. */
export function isAdjacent(ax: number, ay: number, bx: number, by: number): boolean {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return dx <= 1 && dy <= 1 && dx + dy > 0;
}

/**
 * Nearest walkable tile adjacent to (tx,ty) — the approach square for working/eating at a target.
 * `occupied` is the shared occupancy set (tiles held by any solid body, per ADR-014); occupied or
 * non-walkable neighbours are skipped, and the nearest of the rest to (fromX,fromY) is returned.
 */
export function findAdjacentApproach(
  tx: number,
  ty: number,
  worldMap: GameState['worldMap'],
  occupied?: Set<string>,
  fromX?: number,
  fromY?: number
): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestDist = Infinity;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = tx + dx;
      const ny = ty + dy;
      if (!worldMap[ny]?.[nx]?.walkable || occupied?.has(`${nx},${ny}`)) continue;
      const dist =
        fromX !== undefined && fromY !== undefined
          ? Math.abs(nx - fromX) + Math.abs(ny - fromY)
          : 0;
      if (dist < bestDist) {
        bestDist = dist;
        best = { x: nx, y: ny };
      }
    }
  }
  return best;
}

/** Quick check: is there any food available at all (no allocation). ADR-016: food is physical
 *  stock — the stored-drop `stockpile` aggregate, no legacy `gs.item` pool. */
export function hasAvailableFood(gs: GameState): boolean {
  return Object.entries(gs.stockpile ?? {}).some(([id, amount]) => {
    if (amount <= 0) return false;
    const def = ITEM_DEF_BY_ID.get(id);
    return def?.category === 'food' || (def?.nutrition ?? 0) > 0;
  });
}

export type MealPortion = { id: string; units: number };

/**
 * Select a meal that brings the pawn to SAFE_HUNGER from physical stockpile stock. Takes the
 * most nutritious food first and eats as many units as needed (an item's `nutrition` IS the
 * hunger it removes per unit — no scaling, no per-type cap), then supplements with less
 * nutritious options.
 */
export function selectFoodForMeal(pawn: Pawn, gs: GameState): MealPortion[] {
  const hungerToSatisfy = Math.max(0, (pawn.needs?.hunger ?? 0) - SAFE_HUNGER);
  if (hungerToSatisfy <= 0) return [];

  type FoodOption = { id: string; available: number; nutrition: number };
  const options: FoodOption[] = [];
  for (const [id, amount] of Object.entries(gs.stockpile ?? {})) {
    if (amount <= 0) continue;
    const def = ITEM_DEF_BY_ID.get(id);
    const nutrition = def?.nutrition ?? 0;
    if (def?.category !== 'food' && nutrition <= 0) continue;
    options.push({ id, available: amount, nutrition });
  }

  options.sort((a, b) => b.nutrition - a.nutrition);

  const meal: MealPortion[] = [];
  let remaining = hungerToSatisfy;
  for (const food of options) {
    if (remaining <= 0) break;
    const hungerPerUnit = food.nutrition;
    if (hungerPerUnit <= 0) continue;
    const unitsNeeded = Math.ceil(remaining / hungerPerUnit);
    const unitsTaken = Math.min(unitsNeeded, food.available);
    if (unitsTaken <= 0) continue;
    meal.push({ id: food.id, units: unitsTaken });
    remaining -= unitsTaken * hungerPerUnit;
  }
  return meal;
}

/** Consume a pre-selected meal from physical stockpile stock, returning updated state and total
 *  hunger to recover. */
export function consumeMeal(
  meal: MealPortion[],
  gs: GameState
): { state: GameState; hungerRecovered: number } {
  let state = gs;
  let hungerRecovered = 0;
  for (const { id, units } of meal) {
    const def = ITEM_DEF_BY_ID.get(id);
    hungerRecovered += (def?.nutrition ?? 0) * units;
    // consumeFromStockpiles keeps the stored-drop authority and aggregate in sync.
    state = consumeFromStockpiles(state, { [id]: units });
  }
  return { state, hungerRecovered };
}
