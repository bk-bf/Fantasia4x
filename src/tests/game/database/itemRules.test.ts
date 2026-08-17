import { describe, it, expect } from 'vitest';
import itemsData from '$lib/game/database/items/items.jsonc';
import recipesData from '$lib/game/database/items/recipes.jsonc';
import creaturesData from '$lib/game/database/pawns/creatures.jsonc';
import resourcesData from '$lib/game/database/world/resources.jsonc';
import type { Item } from '$lib/game/core/types';

// The machine-checkable subset of docs/game/ITEM-RULES.md.
//
// R1 every craftable equipment item declares a `tier`. A missing one is not "unset" — `gearDb.ageOf`
//    falls back to `tier ?? 0`, so an untiered late-game piece files itself into the STONE AGE. That
//    is how `cave_bear_plate`, which demands a tier-3 Cave Bear's hide, came to read as Primitive.
// R2 an item's tier is >= the tier of the hardest creature its recipe DEMANDS BY NAME. Otherwise the
//    player is shown a piece whose materials are a hundred turns out of reach.
// R3 a species noun in the id means the recipe requires that species' material, and vice versa.
//
// A `category:`/dynamic slot gates NOTHING (it takes the cheapest member of the pool), and a material
// that also drops off a map node is available from turn one — `plant_fiber` is foraged AND butchered
// off a Bog Ooze. Both were false-positive factories in the first pass of this audit.

type Recipe = {
  id: string;
  inputs?: Record<string, number>;
  outputs?: Record<string, number>;
  dynamicRecipe?: Record<string, { acceptsCategory?: string; acceptsCategories?: string[] }>;
};
type Creature = {
  id: string;
  name?: string;
  species?: string;
  tier?: number;
  threatLevel?: number;
  carcassItemId?: string;
};

const ITEMS = itemsData as unknown as Item[];
const RECIPES = recipesData as unknown as Recipe[];
const CREATURES = (creaturesData as unknown as Creature[]).filter((c) => c && c.id);

const recipesByOutput = new Map<string, Recipe[]>();
for (const r of RECIPES)
  for (const o of Object.keys(r.outputs ?? {}))
    recipesByOutput.set(o, [...(recipesByOutput.get(o) ?? []), r]);

/** Everything a map node yields — obtainable from turn one, whatever else also drops it. */
const nodeItems = new Set<string>();
(function walk(o: unknown): void {
  if (Array.isArray(o)) return o.forEach(walk);
  if (o && typeof o === 'object')
    for (const [k, v] of Object.entries(o as Record<string, unknown>))
      k === 'itemId' && typeof v === 'string' ? nodeItems.add(v) : walk(v);
})(resourcesData);

type Prov = { tier: number; threat: number; name: string; species: string };
const NONE: Prov = { tier: 0, threat: 0, name: '', species: '' };

/** carcass id → the EASIEST creature that drops it. */
const carcass = new Map<string, Prov>();
for (const c of CREATURES) {
  if (!c.carcassItemId) continue;
  const e: Prov = {
    tier: c.tier ?? 0,
    threat: c.threatLevel ?? 0,
    name: c.name ?? c.id,
    species: c.species ?? c.id
  };
  const cur = carcass.get(c.carcassItemId);
  if (!cur || e.tier < cur.tier) carcass.set(c.carcassItemId, e);
}

const concreteInputs = (r: Recipe) =>
  Object.keys(r.inputs ?? {}).filter((k) => !k.startsWith('category:'));

/** Fixed point: the hardest creature an item's CONCRETE ingredient chain demands. */
const prov = new Map<string, Prov>();
for (const i of ITEMS) prov.set(i.id, nodeItems.has(i.id) ? NONE : (carcass.get(i.id) ?? NONE));
for (let pass = 0; pass < 30; pass++) {
  let changed = false;
  for (const [out, rs] of recipesByOutput) {
    if (nodeItems.has(out) || carcass.has(out)) continue;
    let best: Prov | null = null;
    for (const r of rs) {
      let worst = NONE;
      for (const k of concreteInputs(r)) {
        const p = prov.get(k) ?? NONE;
        if (p.tier > worst.tier) worst = p;
      }
      if (!best || worst.tier < best.tier) best = worst;
    }
    if (best && best.tier !== (prov.get(out) ?? NONE).tier) {
      prov.set(out, best);
      changed = true;
    }
  }
  if (!changed) break;
}

/** Size and place words are not species — `great_helm` and `bearded_axe` are not beast-named. */
const ADJECTIVES = new Set([
  'great',
  'giant',
  'wild',
  'woolly',
  'bog',
  'cave',
  'dire',
  'mountain',
  'marsh',
  'golden',
  'red',
  'thornwood',
  'shadow',
  'ambush',
  'colossus',
  'skulker',
  'marauder',
  'cutter',
  'netter',
  'weaver',
  'olm',
  'raider'
]);
const SPECIES = new Set([
  ...CREATURES.flatMap((c) => (c.species ?? c.id).split('_')).filter(
    (t) => t.length > 2 && !ADJECTIVES.has(t)
  ),
  'beast'
]);
const tokens = (s: string) => new Set(s.split('_'));

const EQUIPMENT = ITEMS.filter(
  (i) => (i.armorProperties || i.weaponProperties) && i.category !== 'natural_weapon'
);
const CRAFTABLE = EQUIPMENT.filter((i) => recipesByOutput.has(i.id));

const hardestCreature = (id: string): { p: Prov; via: string | null } => {
  const rs = recipesByOutput.get(id);
  if (!rs) return { p: NONE, via: null };
  let p = NONE;
  let via: string | null = null;
  for (const k of concreteInputs(rs[0])) {
    const q = prov.get(k) ?? NONE;
    if (q.tier > p.tier) {
      p = q;
      via = k;
    }
  }
  return { p, via };
};

// ── Pre-existing debt, named rather than silently tolerated. Each entry is a decision waiting on the
//    designer (re-tier it, rename it, or accept it as Boss-tier), NOT an approved exemption. This list
//    must only ever SHRINK — a new item may not join it.
const R1_DEBT = new Set([
  // Jewellery and containers: the missing tier is a display wart, no material lie behind it.
  'woven_basket',
  'hide_tool_roll',
  'hide_scrip',
  'linen_snapsack',
  'wicker_frame',
  'ruby_ring',
  'ruby_amulet',
  'sapphire_ring',
  'sapphire_amulet',
  'emerald_ring',
  'emerald_amulet',
  'topaz_ring',
  'topaz_amulet',
  'amethyst_ring',
  'amethyst_amulet',
  'citrine_ring',
  'citrine_amulet',
  'moonstone_ring',
  'moonstone_amulet',
  'scholars_circlet',
  'champions_crown',
  'sovereign_crown',
  'wardens_circlet',
  'gold_torc',
  'champions_torc',
  'wayfarers_pendant',
  'sages_pendant',
  // These four DO carry a material lie: untiered ⇒ read as Primitive, while demanding a tier 3–5 beast.
  'cave_bear_plate',
  'direwolf_warcloak',
  'stargazer_circlet',
  'fang_charm'
]);
const R2_DEBT = new Set([
  'cave_bear_plate',
  'direwolf_warcloak',
  'stargazer_circlet',
  'fang_charm', // untiered, see R1_DEBT
  'fang_reaver', // tier 4, demands a tier-5 Great Wolf's fang
  'great_bone_maul' // tier 2, demands a tier-5 Great Bear's bone
]);
const R3_DEBT = new Set([
  'beast_leather_plate', // "beast leather" but the recipe takes any leather
  'steel_boar_spear' // named for its quarry, not its material — historically fine, confirm and comment
]);

describe('ITEM-RULES R1 — every craftable equipment item declares a tier', () => {
  it('no new untiered equipment', () => {
    const bad = CRAFTABLE.filter((i) => i.tier === undefined && !R1_DEBT.has(i.id)).map(
      (i) => i.id
    );
    expect(
      bad,
      `missing \`tier\` ⇒ reads as 0 ⇒ files into the Primitive age (gearDb.ageOf): ${bad.join(', ')}`
    ).toEqual([]);
  });

  it('the debt list has no stale entries', () => {
    const fixed = [...R1_DEBT].filter((id) => {
      const item = ITEMS.find((x) => x.id === id);
      return item && item.tier !== undefined;
    });
    expect(fixed, `fixed — drop from R1_DEBT: ${fixed.join(', ')}`).toEqual([]);
  });
});

describe('ITEM-RULES R2 — tier is not below the creature the recipe demands', () => {
  it('no new item is gated behind a creature above its own tier', () => {
    const bad = CRAFTABLE.filter((i) => {
      if (R2_DEBT.has(i.id)) return false;
      return hardestCreature(i.id).p.tier > (i.tier ?? 0);
    }).map((i) => {
      const { p, via } = hardestCreature(i.id);
      return `${i.id} (tier ${i.tier ?? 'MISSING'}) needs ${via} from ${p.name} (tier ${p.tier})`;
    });
    expect(bad, bad.join('; ')).toEqual([]);
  });

  it('the debt list has no stale entries', () => {
    const fixed = [...R2_DEBT].filter((id) => {
      const item = ITEMS.find((x) => x.id === id);
      return item && hardestCreature(id).p.tier <= (item.tier ?? -1);
    });
    expect(fixed, `fixed — drop from R2_DEBT: ${fixed.join(', ')}`).toEqual([]);
  });
});

describe('ITEM-RULES R3 — a species in the name means that species in the recipe', () => {
  it('no new beast-named item has a generic recipe', () => {
    const bad: string[] = [];
    for (const i of CRAFTABLE) {
      if (R3_DEBT.has(i.id)) continue;
      const named = [...tokens(i.id)].filter((t) => SPECIES.has(t));
      if (!named.length) continue;
      const ings = concreteInputs(recipesByOutput.get(i.id)![0]);
      const { p } = hardestCreature(i.id);
      const consistent =
        ings.some((k) => named.some((n) => tokens(k).has(n))) ||
        (p.species && named.some((n) => tokens(p.species).has(n)));
      if (!consistent) bad.push(`${i.id} named [${named}] but requires [${ings}]`);
    }
    expect(bad, bad.join('; ')).toEqual([]);
  });
});
