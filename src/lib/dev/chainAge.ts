// chainAge.ts — DEV/AUDIT helper (no sim code imports this). How deep in the WORKSHOP ladder an
// item's materials actually sit.
//
// An item's tier is a promise that a colony at that age can build it, and the promise is broken by
// INGREDIENTS, not by the item's own recipe. `padded_cap` was a tier-0 piece of the stone-age hide
// set whose linen came back through `thread` to the spinning wheel — a bronze-age building. Buildings
// already declare `ageTier` ("bronze:1"), so the chain can be priced in ages without inventing a
// second source of truth.
//
// Shared deliberately: `itemRules.test.ts` R4 asserts on it and the /gear-db item tree displays it.
// Two copies of this walk would drift, and the drift would be invisible.

import itemsData from '../game/database/items/items.jsonc';
import recipesData from '../game/database/items/recipes.jsonc';
import buildingsData from '../game/database/world/buildings.jsonc';
import resourcesData from '../game/database/world/resources.jsonc';
import creaturesData from '../game/database/pawns/creatures.jsonc';

/* eslint-disable @typescript-eslint/no-explicit-any */

export const AGE_NAMES = ['primitive', 'copper', 'bronze', 'iron', 'steel', 'runed'] as const;
export type ChainAge = number; // index into AGE_NAMES

/** Item tiers run 0..4 and building ages 0..5 — the item ladder has no separate copper rung, so a
 *  tier-1 piece may legitimately be made at a copper OR a bronze station. */
export const AGE_CEILING = [0, 2, 3, 4, 5];

const items = itemsData as any[];
const recipes = recipesData as any[];

export const BUILDING_AGE = new Map<string, number>();
for (const b of buildingsData as any[]) {
  const age = AGE_NAMES.indexOf(String(b?.ageTier ?? 'primitive').split(':')[0] as never);
  if (b?.id) BUILDING_AGE.set(b.id, age < 0 ? 0 : age);
}

/** Everything a map node yields — foraged or mined, so no workshop stands behind it. */
const nodeItems = new Set<string>();
(function walk(o: unknown): void {
  if (Array.isArray(o)) return o.forEach(walk);
  if (o && typeof o === 'object')
    for (const [k, v] of Object.entries(o as Record<string, unknown>))
      k === 'itemId' && typeof v === 'string' ? nodeItems.add(v) : walk(v);
})(resourcesData);

/** Carcasses come off a corpse, not out of a building. */
const carcassItems = new Set<string>();
for (const c of creaturesData as any[]) if (c?.carcassItemId) carcassItems.add(c.carcassItemId);

const recipesByOutput = new Map<string, any[]>();
for (const r of recipes)
  for (const o of Object.keys(r?.outputs ?? {}))
    recipesByOutput.set(o, [...(recipesByOutput.get(o) ?? []), r]);

const byCategory = new Map<string, string[]>();
for (const i of items)
  if (i?.category) byCategory.set(i.category, [...(byCategory.get(i.category) ?? []), i.id]);
const poolMembers = (key: string) => byCategory.get(key.replace(/^category:/, '')) ?? [];

/** Every ingredient a recipe names, with `category:` and dynamic slots folded in as pool keys. */
export const ingredientsOf = (r: any): string[] => {
  const out = Object.keys(r?.inputs ?? {});
  for (const slot of Object.values<any>(r?.dynamicRecipe ?? {}))
    if (slot?.acceptsCategory) out.push(`category:${slot.acceptsCategory}`);
  return out;
};

const chain = new Map<string, number>();
const ageOfPool = (key: string) => {
  const members = poolMembers(key);
  // a pool nothing fills constrains nothing; otherwise it costs what its CHEAPEST member costs,
  // because a `category:` slot takes whatever is nearest to hand
  return members.length ? Math.min(...members.map((m) => chain.get(m) ?? 0)) : 0;
};
const ageOfInput = (k: string) => (k.startsWith('category:') ? ageOfPool(k) : (chain.get(k) ?? 0));
const recipeAge = (r: any) =>
  Math.max(
    r?.station ? (BUILDING_AGE.get(r.station) ?? 0) : 0,
    ...ingredientsOf(r).map(ageOfInput),
    0
  );

// Fixed point rather than recursion: an item costs the CHEAPEST recipe that makes it, a recipe costs
// the latest station in it or in anything it consumes. Relaxing until stable also means a cycle
// settles instead of recursing forever.
for (let pass = 0; pass < 30; pass++) {
  let changed = false;
  for (const [out, rs] of recipesByOutput) {
    if (nodeItems.has(out) || carcassItems.has(out)) continue;
    const age = Math.min(...rs.map(recipeAge));
    if (age !== (chain.get(out) ?? 0)) {
      chain.set(out, age);
      changed = true;
    }
  }
  if (!changed) break;
}

/** The latest station age anywhere in this item's production chain (0 = needs no workshop at all). */
export const chainAgeOf = (id: string): ChainAge => chain.get(id) ?? 0;

/** Which building set that age — for a failure message or a tooltip. */
export function blameStation(id: string, seen: Set<string> = new Set()): string {
  const rs = recipesByOutput.get(id) ?? [];
  if (!rs.length || seen.has(id)) return '';
  const target = chainAgeOf(id);
  const r = rs.find((x) => recipeAge(x) === target) ?? rs[0];
  if (r.station && (BUILDING_AGE.get(r.station) ?? 0) === target) return r.station;
  const next = new Set(seen).add(id);
  for (const k of ingredientsOf(r)) {
    if (ageOfInput(k) !== target) continue;
    if (!k.startsWith('category:')) return blameStation(k, next);
    const worst = poolMembers(k).find((m) => chainAgeOf(m) === target);
    if (worst) return blameStation(worst, next);
  }
  return r.station ?? '';
}
