import type { GameState, Pawn, ItemInstance } from '../../core/types';

import ITEMS_DATABASE from '../../database/items/items.json';
import RARITIES from '../../database/items/rarities.json';
import { consumeFromStockpiles } from '../../core/state/stockpile';
import { manhattan } from '../../core/util/distance';
import { ticksFromSeconds } from '../../core/util/time';
import { rng } from '../../core/util/rng';
import { edibleNutrition, resolveAllowedFoodIds, isCarcass } from '../../services/foodRules';

const INTOX_SEVERITY_PER_MOOD = 1 / 40;

const POISON_BY_CATEGORY: Record<string, number> = { meat: 0.16, food: 0.05, drink: 0.01 };
const RARITY_POISON_MULT = new Map<string, number>(
  (RARITIES as Array<{ id: string; poisonMult?: number }>).map((r) => [r.id, r.poisonMult ?? 1])
);
const NUTRITION_PER_POISON_ROLL = 40;
const DYSENTERY_SHARE = 0.2;
const NAUSEA_TICKS = ticksFromSeconds(180);
const DYSENTERY_TICKS = ticksFromSeconds(900);

export const ITEM_DEF_BY_ID: Map<string, any> = new Map(
  (ITEMS_DATABASE as any[]).map((d) => [d.id, d])
);

export const SAFE_HUNGER = 10;

export function isAdjacent(ax: number, ay: number, bx: number, by: number): boolean {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return dx <= 1 && dy <= 1 && dx + dy > 0;
}

export function findAdjacentApproach(
  tx: number,
  ty: number,
  worldMap: GameState['worldMap'],
  occupied?: Set<string>,
  fromX?: number,
  fromY?: number,
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

export function hasAvailableFood(gs: GameState): boolean {
  const allowed = resolveAllowedFoodIds(gs.foodSettings);
  return Object.entries(gs.stockpile ?? {}).some(([id, amount]) => {
    if (amount <= 0 || !allowed.has(id)) return false;
    const def = ITEM_DEF_BY_ID.get(id);
    return !!def && (def.category === 'food' || edibleNutrition(def) > 0);
  });
}

export type MealPortion = { id: string; units: number };

export function isAllowedFoodId(gs: GameState, id: string): boolean {
  if (!resolveAllowedFoodIds(gs.foodSettings).has(id)) return false;
  const def = ITEM_DEF_BY_ID.get(id);
  return !!def && (def.category === 'food' || edibleNutrition(def) > 0);
}

export function selectFoodForMeal(
  pawn: Pawn,
  gs: GameState,
  supply: Record<string, number> = gs.stockpile ?? {}
): MealPortion[] {
  const hungerToSatisfy = Math.max(0, (pawn.needs?.hunger ?? 0) - SAFE_HUNGER);
  if (hungerToSatisfy <= 0) return [];

  const allowed = resolveAllowedFoodIds(gs.foodSettings);
  type FoodOption = { id: string; available: number; nutrition: number };
  const options: FoodOption[] = [];
  for (const [id, amount] of Object.entries(supply)) {
    if (amount <= 0 || !allowed.has(id)) continue;
    const def = ITEM_DEF_BY_ID.get(id);
    const nutrition = edibleNutrition(def);
    if (def?.category !== 'food' && nutrition <= 0) continue;
    if (!pawnDietAllows(pawn, def)) continue;
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

export function selectFoodFromInventory(pawn: Pawn, gs: GameState): MealPortion[] {
  return selectFoodForMeal(pawn, gs, carriedEdibles(pawn));
}

export function carriedEdibles(pawn: Pawn): Record<string, number> {
  const items = { ...(pawn.inventory?.items ?? {}) };
  const sip = (inst: ItemInstance | undefined) => {
    for (const e of inst?.contents ?? []) {
      if (e.litres == null) continue;
      items[e.itemId] = (items[e.itemId] ?? 0) + e.litres;
    }
  };
  for (const inst of pawn.inventory?.instances ?? []) sip(inst);
  for (const inst of Object.values(pawn.equipment ?? {})) sip(inst);
  for (const [id, q] of Object.entries(items)) if (q <= 0) delete items[id];
  return items;
}

const MAX_FOOD_DROP_CANDIDATES = 8;
export function findNearestFoodDrops(
  pawn: Pawn,
  gs: GameState
): { id: string; x: number; y: number; resourceId: string }[] {
  const pos = pawn.position;
  if (!pos) return [];
  const cands = (gs.droppedItems ?? []).filter(
    (d) =>
      d.stored &&
      d.quantity > 0 &&
      !d.reservedFor &&
      !d.forbidden &&
      isAllowedFoodId(gs, d.resourceId) &&
      pawnDietAllows(pawn, ITEM_DEF_BY_ID.get(d.resourceId))
  );
  cands.sort((a, b) => manhattan(a.x, a.y, pos.x, pos.y) - manhattan(b.x, b.y, pos.x, pos.y));
  return cands
    .slice(0, MAX_FOOD_DROP_CANDIDATES)
    .map((d) => ({ id: d.id, x: d.x, y: d.y, resourceId: d.resourceId }));
}

export function mealNutrition(meal: MealPortion[]): {
  hungerRecovered: number;
  intoxication: number;
} {
  let hungerRecovered = 0;
  let intoxication = 0;
  for (const { id, units } of meal) {
    const def = ITEM_DEF_BY_ID.get(id);
    hungerRecovered += edibleNutrition(def) * units;
    intoxication += (def?.intoxication ?? 0) * units;
  }
  return { hungerRecovered, intoxication };
}

export function consumeMeal(
  meal: MealPortion[],
  gs: GameState
): { state: GameState; hungerRecovered: number; intoxication: number } {
  let state = gs;
  let hungerRecovered = 0;
  let intoxication = 0;
  for (const { id, units } of meal) {
    const def = ITEM_DEF_BY_ID.get(id);
    hungerRecovered += edibleNutrition(def) * units;
    intoxication += (def?.intoxication ?? 0) * units;
    state = consumeFromStockpiles(state, { [id]: units });
  }
  return { state, hungerRecovered, intoxication };
}

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

function itemPoisonChance(def: {
  poisonChance?: number;
  category?: string;
  rarity?: string;
}): number {
  const base = def.poisonChance ?? POISON_BY_CATEGORY[def.category ?? ''] ?? 0;
  const mult = def.rarity ? (RARITY_POISON_MULT.get(def.rarity) ?? 1) : 1;
  return Math.max(0, Math.min(1, base * mult));
}

export function mealPoisonChance(meal: MealPortion[]): number {
  let safe = 1;
  for (const { id, units } of meal) {
    const def = ITEM_DEF_BY_ID.get(id);
    const p = itemPoisonChance(def ?? {});
    if (p <= 0) continue;
    const rolls = (units * Math.max(1, edibleNutrition(def))) / NUTRITION_PER_POISON_ROLL;
    safe *= Math.pow(1 - p, rolls);
  }
  return 1 - safe;
}

export function applyFoodPoisoning(p: Pawn, meal: MealPortion[], poisonResistance: number): void {
  const base = mealPoisonChance(meal);
  if (base <= 0) return;
  const res = Math.max(-0.5, Math.min(1, poisonResistance));
  if (!rng.chance(base * (1 - res))) return;
  const id = rng.chance(DYSENTERY_SHARE) ? 'dysentery' : 'nausea';
  const dur = id === 'dysentery' ? DYSENTERY_TICKS : NAUSEA_TICKS;
  p.conditionTimers = {
    ...(p.conditionTimers ?? {}),
    [id]: Math.max(p.conditionTimers?.[id] ?? 0, dur)
  };
}

export function applyMealBuff(p: Pawn, meal: MealPortion[]): void {
  for (const { id } of meal) {
    const buff = ITEM_DEF_BY_ID.get(id)?.mealBuff;
    if (!buff) continue;
    const dur = ticksFromSeconds(buff.seconds);
    p.conditionTimers = {
      ...(p.conditionTimers ?? {}),
      [buff.condition]: Math.max(p.conditionTimers?.[buff.condition] ?? 0, dur)
    };
  }
}

export function pawnDietAllows(
  pawn: Pawn,
  def: { id?: string; category?: string } | undefined
): boolean {
  const restriction = (pawn.traits ?? []).find((t) => t.dietRestriction)?.dietRestriction;
  if (!restriction || !def) return true;
  if (restriction === 'aquatic') return def.category === 'fish';
  return def.category === 'meat' || isCarcass(def);
}

const CANINE_MEAT_IDS = new Set(['wolf_meat', 'worg_meat']);
const VERMIN_IDS = new Set([
  'rat_meat',
  'giant_rat_carcass',
  'stirge_carcass',
  'thornwood_spider_carcass'
]);
export function recordMealDeeds(p: Pawn, meal: MealPortion[]): void {
  for (const { id, units } of meal) {
    const def = ITEM_DEF_BY_ID.get(id);
    if (!def) continue;
    const deeds = (p.deeds ??= {});
    if (isCarcass(def)) deeds.ateCarcass = (deeds.ateCarcass ?? 0) + units;
    else if (def.category === 'meat') deeds.ateRawMeat = (deeds.ateRawMeat ?? 0) + units;
    if (CANINE_MEAT_IDS.has(id)) deeds.ateCanineMeat = (deeds.ateCanineMeat ?? 0) + units;
    if (def.category === 'fish') deeds.ateFish = (deeds.ateFish ?? 0) + units;
    if (VERMIN_IDS.has(id)) deeds.ateInsect = (deeds.ateInsect ?? 0) + units;
    if (p.bloodNeedKind === 'carcass' && p.needs?.bloodHunger !== undefined) {
      const relief = isCarcass(def) ? 80 * units : def.category === 'meat' ? 20 * units : 0;
      if (relief > 0) {
        p.needs.bloodHunger = Math.max(0, p.needs.bloodHunger - relief);
        if (p.needs.bloodHunger < 100 && p.conditionTimers?.bloodthirst)
          delete p.conditionTimers.bloodthirst;
      }
    }
  }
}
