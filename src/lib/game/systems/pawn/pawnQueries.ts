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
import RARITIES from '../../database/rarities.jsonc';
import { consumeFromStockpiles } from '../../core/GameState';
import { manhattan } from '../../core/distance';
import { ticksFromSeconds } from '../../core/time';
import { rng } from '../../core/rng';
import { edibleNutrition, resolveAllowedFoodIds } from '../../services/foodRules';

// ── §F8 alcohol (mood good) ──────────────────────────────────────────────────────────────────────
/** Drink intoxication → `intoxicated` severity: each point of mood-lift adds 1/40 severity (an ale ≈
 *  +0.2 → tipsy/merry, a mead ≈ +0.35). It decays via needs.ts `decayIntoxication`. */
const INTOX_SEVERITY_PER_MOOD = 1 / 40;

// ── §F8 food poisoning ───────────────────────────────────────────────────────────────────────────
/** Base per-serving poison chance by category when an item declares no explicit `poisonChance`. */
const POISON_BY_CATEGORY: Record<string, number> = { meat: 0.16, food: 0.05, drink: 0.01 };
/** rarities.jsonc `poisonMult` per tier — a low-grade COOKED dish is dicier (only applied to rated items). */
const RARITY_POISON_MULT = new Map<string, number>(
  (RARITIES as Array<{ id: string; poisonMult?: number }>).map((r) => [r.id, r.poisonMult ?? 1])
);
/** Nutrition that constitutes one "serving" for the poison roll. `poisonChance` is the risk PER SERVING
 *  of nutrition, NOT per item — so a meal's risk scales with how much food (nutrition) was eaten, not how
 *  many pieces. Set near a typical food item's nutrition (carp 48, oats 39) so high-nutrition foods keep
 *  ~their authored per-item chance, while low-nutrition ones (berries: nutrition 3) stop being double-
 *  punished — needing ~14 berries to fill hunger no longer compounds a 3% per-berry roll to a near-certain
 *  ~53%; it's now ~one serving's worth ≈ the authored 3%. */
const NUTRITION_PER_POISON_ROLL = 40;
/** Share of poisoning events that become the serious `dysentery` rather than passing `nausea`. */
const DYSENTERY_SHARE = 0.2;
const NAUSEA_TICKS = ticksFromSeconds(180); // ~14 in-game hr (180 real-sec basis) — queasy, passes
const DYSENTERY_TICKS = ticksFromSeconds(900); // ~3 in-game days — a multi-day gut illness

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
  fromY?: number,
  // Confinement: when a restrict-zone pawn is the mover, the approach tile it walks to must also lie
  // INSIDE its zone — otherwise the confined pathfinding grid can't reach the picked neighbour and the
  // path fails, wrongly marking the job (e.g. a build inside the zone) unreachable. null = no filter.
  allowed?: Set<string> | null
): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestDist = Infinity;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = tx + dx;
      const ny = ty + dy;
      if (!worldMap[ny]?.[nx]?.walkable || occupied?.has(`${nx},${ny}`)) continue;
      if (allowed && !allowed.has(`${nx},${ny}`)) continue;
      const dist = fromX !== undefined && fromY !== undefined ? manhattan(nx, ny, fromX, fromY) : 0;
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
  const allowed = resolveAllowedFoodIds(gs.foodSettings);
  return Object.entries(gs.stockpile ?? {}).some(([id, amount]) => {
    if (amount <= 0 || !allowed.has(id)) return false;
    const def = ITEM_DEF_BY_ID.get(id);
    return !!def && (def.category === 'food' || edibleNutrition(def) > 0);
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

  const allowed = resolveAllowedFoodIds(gs.foodSettings); // colony food filter (panel) gates the eat-list
  type FoodOption = { id: string; available: number; nutrition: number };
  const options: FoodOption[] = [];
  for (const [id, amount] of Object.entries(gs.stockpile ?? {})) {
    if (amount <= 0 || !allowed.has(id)) continue;
    const def = ITEM_DEF_BY_ID.get(id);
    const nutrition = edibleNutrition(def); // carcass-aware (raw carcasses derive nutrition from mass)
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

/** Consume a pre-selected meal from physical stockpile stock, returning updated state, total hunger
 *  to recover, and the total alcohol mood-lift (§F8 `intoxication`) — applied via {@link applyIntoxication}
 *  by the eat handlers when the meal included a drink. */
export function consumeMeal(
  meal: MealPortion[],
  gs: GameState
): { state: GameState; hungerRecovered: number; intoxication: number } {
  let state = gs;
  let hungerRecovered = 0;
  let intoxication = 0;
  for (const { id, units } of meal) {
    const def = ITEM_DEF_BY_ID.get(id);
    hungerRecovered += edibleNutrition(def) * units; // carcass-aware (raw carcasses derive from mass)
    intoxication += (def?.intoxication ?? 0) * units;
    // consumeFromStockpiles keeps the stored-drop authority and aggregate in sync.
    state = consumeFromStockpiles(state, { [id]: units });
  }
  return { state, hungerRecovered, intoxication };
}

/** §F8: apply an alcohol mood-good to a pawn draft (in place — ADR-002). A one-shot mood lift (capped
 *  at 100) plus raising the staged, persistent `intoxicated` condition's severity (tipsy → merry →
 *  drunk → blackout) — which decays over time (needs.ts `decayIntoxication`). No-op for a sober meal. */
export function applyIntoxication(p: Pawn, moodLift: number): void {
  if (moodLift <= 0) return;
  if (p.state) p.state.mood = Math.min(100, (p.state.mood ?? 50) + moodLift);
  const conditions = (p.conditions ??= []);
  const idx = conditions.findIndex((c) => c.id === 'intoxicated');
  const add = moodLift * INTOX_SEVERITY_PER_MOOD;
  if (idx === -1) conditions.push({ id: 'intoxicated', severity: Math.min(1, add) });
  else
    conditions[idx] = { ...conditions[idx], severity: Math.min(1, conditions[idx].severity + add) };
}

/** §F8: resolve one food's per-serving poison chance — explicit `poisonChance` (else a category
 *  default), scaled by the item's `rarity` poison multiplier (cooked dishes only; raw/unrated = 1×). */
function itemPoisonChance(def: {
  poisonChance?: number;
  category?: string;
  rarity?: string;
}): number {
  const base = def.poisonChance ?? POISON_BY_CATEGORY[def.category ?? ''] ?? 0;
  const mult = def.rarity ? (RARITY_POISON_MULT.get(def.rarity) ?? 1) : 1;
  return Math.max(0, Math.min(1, base * mult));
}

/** §F8: combined probability a meal carries at least one tainted serving. The roll count scales with
 *  NUTRITION eaten (units × per-unit nutrition ÷ NUTRITION_PER_POISON_ROLL), NOT raw item count — so
 *  filling hunger on low-nutrition food (e.g. a fistful of berries) isn't compounded into near-certain
 *  poisoning. `poisonChance` is the risk per serving's worth of nutrition. */
export function mealPoisonChance(meal: MealPortion[]): number {
  let safe = 1;
  for (const { id, units } of meal) {
    const def = ITEM_DEF_BY_ID.get(id);
    const p = itemPoisonChance(def ?? {});
    if (p <= 0) continue;
    // Rolls scale with the FOOD MATTER eaten (units × per-unit nutrition), floored at 1 nutrition/unit so
    // a ~0-nutrition tainted item can still roll once and a stray non-positive value can't flip the
    // exponent negative. (Rotten food carries a small POSITIVE nutrition; its 0.85 poisonChance — not a
    // negative nutrition — is what makes it the worst offender.)
    const rolls = (units * Math.max(1, edibleNutrition(def))) / NUTRITION_PER_POISON_ROLL;
    safe *= Math.pow(1 - p, rolls);
  }
  return 1 - safe;
}

/** §F8: roll food poisoning for a just-eaten meal and, on a hit, stamp `nausea` (usual) or the serious
 *  `dysentery` onto the pawn draft (in place). `poisonResistance` (the eater's CON-based `poison_resistance`
 *  stat) lowers the odds — frail pawns are more susceptible, hardy ones individually immune. */
export function applyFoodPoisoning(p: Pawn, meal: MealPortion[], poisonResistance: number): void {
  const base = mealPoisonChance(meal);
  if (base <= 0) return;
  // Resistance lowers the odds: a frail pawn (negative res) is up to 1.5× as likely, a hardy/immune
  // one (res → 1) shrugs it off entirely. This is the per-pawn "individual immunity" the CON-based
  // poison_resistance stat buys.
  const res = Math.max(-0.5, Math.min(1, poisonResistance));
  if (!rng.chance(base * (1 - res))) return;
  const id = rng.chance(DYSENTERY_SHARE) ? 'dysentery' : 'nausea';
  const dur = id === 'dysentery' ? DYSENTERY_TICKS : NAUSEA_TICKS;
  p.conditionTimers = {
    ...(p.conditionTimers ?? {}),
    [id]: Math.max(p.conditionTimers?.[id] ?? 0, dur)
  };
}
