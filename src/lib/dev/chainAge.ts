import itemsData from '../game/database/items/items.jsonc';
import recipesData from '../game/database/items/recipes.jsonc';
import buildingsData from '../game/database/world/buildings.jsonc';
import resourcesData from '../game/database/world/resources.jsonc';
import creaturesData from '../game/database/pawns/creatures.jsonc';

/* eslint-disable @typescript-eslint/no-explicit-any */

export const AGE_NAMES = ['primitive', 'copper', 'bronze', 'iron', 'steel', 'runed'] as const;
export type ChainAge = number;

export const AGE_CEILING = [0, 2, 3, 4, 5];

const items = itemsData as any[];
const recipes = recipesData as any[];

const itemById = new Map<string, any>(items.map((i: any) => [i.id, i]));

export const BUILDING_AGE = new Map<string, number>();
for (const b of buildingsData as any[]) {
  const age = AGE_NAMES.indexOf(String(b?.ageTier ?? 'primitive').split(':')[0] as never);
  if (b?.id) BUILDING_AGE.set(b.id, age < 0 ? 0 : age);
}

export const NODE_TOOL_AGE = new Map<string, number>();
{
  const TOOL_AGE = [0, 1, 3, 4, 5];
  (function scan(o: unknown): void {
    if (Array.isArray(o)) return o.forEach(scan);
    if (!o || typeof o !== 'object') return;
    const n = o as Record<string, any>;
    const inter = n.interaction;
    const tier = inter?.toolRequirement?.minTier;
    if (typeof tier === 'number')
      for (const y of inter.yields ?? [])
        if (typeof y?.itemId === 'string') {
          const age = TOOL_AGE[Math.min(Math.max(tier, 0), 4)];
          const seen = NODE_TOOL_AGE.get(y.itemId);
          if (seen === undefined || age < seen) NODE_TOOL_AGE.set(y.itemId, age);
        }
    for (const v of Object.values(n)) scan(v);
  })(resourcesData);
}

export const nodeItems = new Set<string>();
(function walk(o: unknown): void {
  if (Array.isArray(o)) return o.forEach(walk);
  if (o && typeof o === 'object')
    for (const [k, v] of Object.entries(o as Record<string, unknown>))
      k === 'itemId' && typeof v === 'string' ? nodeItems.add(v) : walk(v);
})(resourcesData);

export const carcassItems = new Set<string>();
for (const c of creaturesData as any[]) if (c?.carcassItemId) carcassItems.add(c.carcassItemId);

export const CARCASS_TIER = new Map<string, number>();
for (const c of creaturesData as any[]) {
  if (!c?.carcassItemId) continue;
  const t = Number(c.tier ?? 1);
  const seen = CARCASS_TIER.get(c.carcassItemId);
  if (seen === undefined || t < seen) CARCASS_TIER.set(c.carcassItemId, t);
}

const recipesByOutput = new Map<string, any[]>();
for (const r of recipes)
  for (const o of Object.keys(r?.outputs ?? {}))
    recipesByOutput.set(o, [...(recipesByOutput.get(o) ?? []), r]);

const byCategory = new Map<string, string[]>();
for (const i of items)
  if (i?.category) byCategory.set(i.category, [...(byCategory.get(i.category) ?? []), i.id]);
const poolMembers = (key: string): string[] => {
  const cat = key.replace(/^category:/, '');
  if (cat === 'plank' || cat === 'log')
    return items.filter((i: any) => String(i?.id ?? '').endsWith(`_${cat}`)).map((i: any) => i.id);
  if (cat === 'fastener')
    return items
      .filter((i: any) => /_nail$|_rivet$|_tack$/.test(String(i?.id ?? '')))
      .map((i: any) => i.id);
  return (byCategory.get(cat) ?? []).filter((id) => {
    const t = itemById.get(id)?.type;
    return t !== 'armor' && t !== 'weapon' && t !== 'tool';
  });
};

export const ingredientsOf = (r: any): string[] => {
  const out = Object.keys(r?.inputs ?? {});
  for (const slot of Object.values<any>(r?.dynamicRecipe ?? {}))
    if (slot?.acceptsCategory) out.push(`category:${slot.acceptsCategory}`);
  return out;
};

const chain = new Map<string, number>();
const ageOfPool = (key: string) => {
  const members = poolMembers(key);
  return members.length ? Math.min(...members.map((m) => chain.get(m) ?? 0)) : 0;
};
const ageOfInput = (k: string) => (k.startsWith('category:') ? ageOfPool(k) : (chain.get(k) ?? 0));
const recipeAge = (r: any) =>
  Math.max(
    r?.station ? (BUILDING_AGE.get(r.station) ?? 0) : 0,
    ...ingredientsOf(r).map(ageOfInput),
    0
  );

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

export const hasRecipe = (id: string): boolean => recipesByOutput.has(id);

export const BOSS_PARTS = new Set([
  'great_fang',
  'great_tusk',
  'great_bone',
  'alpha_heart',
  'alpha_ichor',
  'direwolf_hackles',
  'owlbear_pineal',
  'sabretooth_glands'
]);

export const usesBossPart = (id: string, seen = new Set<string>()): boolean => {
  if (BOSS_PARTS.has(id)) return true;
  if (seen.has(id)) return false;
  seen.add(id);
  for (const r of recipesByOutput.get(id) ?? [])
    for (const k of ingredientsOf(r)) {
      if (k.startsWith('category:')) continue;
      if (usesBossPart(k, seen)) return true;
    }
  return false;
};

export const chainAgeOf = (id: string): ChainAge => chain.get(id) ?? 0;

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
