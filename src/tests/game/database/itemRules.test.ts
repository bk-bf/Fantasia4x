import { describe, it, expect } from 'vitest';
import itemsData from '$lib/game/database/items/items.jsonc';
import recipesData from '$lib/game/database/items/recipes.jsonc';
import creaturesData from '$lib/game/database/pawns/creatures.jsonc';
import resourcesData from '$lib/game/database/world/resources.jsonc';
import buildingsData from '$lib/game/database/world/buildings.jsonc';
import type { Item } from '$lib/game/core/types';

// The machine-checkable subset of docs/game/ITEM-RULES.md.
//
// R1 every craftable equipment item declares a `tier`. A missing one is not "unset" — `gearDb.ageOf`
//    falls back to `tier ?? 0`, so an untiered late-game piece files itself into the STONE AGE. That
//    is how `cave_bear_plate`, which demands a tier-3 Cave Bear's hide, came to read as Primitive.
// R2 an item's tier is >= the BAND of the hardest creature its recipe DEMANDS BY NAME. Otherwise the
//    player is shown a piece whose materials are a hundred turns out of reach. Creature `tier` runs
//    0..5 and item `tier` runs 0..4 — one band wider — so the two go through `bandOf` instead of being
//    compared directly, which is what made the first pass of this rule over-report.
// R3 a species noun in the id means the recipe requires that species' material, and vice versa.
// R4 an item's tier is >= the age of the LATEST STATION its whole ingredient chain needs. R2 catches
//    a beast that is out of reach; nothing caught a *workshop* that is. A tier-0 linen cap looked
//    innocent until you followed linen back through thread to the SPINNING WHEEL, a bronze-age
//    building — so the stone-age hide set's head piece could not be made in the stone age. The whole
//    bronze boarhide line had the same shape, hanging off an iron-age tanning bucket.
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

/** A creature's tier expressed on the ITEM tier scale. Creature tiers run 0..5 (a fawn at 1, a Great
 *  Bear at 5); item tiers run 0..4 (primitive..runed), so the beast band sits one step lower. */
const bandOf = (creatureTier: number) => Math.max(0, creatureTier - 1);

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
const R1_DEBT = new Set<string>([
  // Empty. Every craftable equipment item now declares a tier; the 31 that did not were all filing
  // themselves into the Primitive age off the `tier ?? 0` fallback.
]);
const R2_DEBT = new Set([
  // A tier-2 maul demanding a Great Bear's bone (creature tier 5 ⇒ item band 4). Genuinely mis-tiered:
  // either it belongs at tier 4, or it should be built from ordinary large bones.
  'great_bone_maul'
]);
const R3_DEBT = new Set([
  'layered_boarhide_plate', // "beast leather" but the recipe takes any leather
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
      return bandOf(hardestCreature(i.id).p.tier) > (i.tier ?? 0);
    }).map((i) => {
      const { p, via } = hardestCreature(i.id);
      return (
        `${i.id} (tier ${i.tier ?? 'MISSING'}) needs ${via} from ${p.name} ` +
        `(creature tier ${p.tier} ⇒ item band ${bandOf(p.tier)})`
      );
    });
    expect(bad, bad.join('; ')).toEqual([]);
  });

  it('the debt list has no stale entries', () => {
    const fixed = [...R2_DEBT].filter((id) => {
      const item = ITEMS.find((x) => x.id === id);
      return item && bandOf(hardestCreature(id).p.tier) <= (item.tier ?? -1);
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

// ── R4: how deep in the workshop ladder an item's materials actually sit ────────────────────────
// Buildings already declare an `ageTier` ("bronze:1"), so the chain can be priced in ages without a
// second source of truth. The walk takes the CHEAPEST recipe for each ingredient and the cheapest
// member of a `category:`/dynamic pool, exactly like R2 — a pool gates nothing, it takes what is
// nearest to hand.
type Building = { id: string; ageTier?: string };
const BUILDING_AGE = new Map<string, number>();
const AGE_NAMES = ['primitive', 'copper', 'bronze', 'iron', 'steel', 'runed'];
for (const b of buildingsData as unknown as Building[]) {
  const age = AGE_NAMES.indexOf((b.ageTier ?? 'primitive').split(':')[0]);
  BUILDING_AGE.set(b.id, age < 0 ? 0 : age);
}
// Item tiers run 0..4 and building ages 0..5 — the item ladder has no separate copper rung, so a
// tier-1 piece may legitimately be made at a copper OR a bronze station.
const AGE_CEILING = [0, 2, 3, 4, 5];

const byCategory = new Map<string, Item[]>();
for (const i of ITEMS) {
  const c = (i as { category?: string }).category;
  if (c) byCategory.set(c, [...(byCategory.get(c) ?? []), i]);
}
const poolMembers = (cat: string) => byCategory.get(cat.replace(/^category:/, '')) ?? [];

type RecipeWithStation = Recipe & {
  station?: string;
  dynamicRecipe?: Record<string, { acceptsCategory?: string; acceptsCategories?: string[] }>;
};
/** Every ingredient a recipe names, with `category:` and dynamic slots folded in as pool keys. */
const ingredientsOf = (r: RecipeWithStation): string[] => {
  const out = Object.keys(r.inputs ?? {});
  for (const slot of Object.values(r.dynamicRecipe ?? {}))
    if (slot.acceptsCategory) out.push(`category:${slot.acceptsCategory}`);
  return out;
};

// Fixed point, the same shape R2 uses: an item costs the CHEAPEST recipe that makes it, a recipe
// costs the latest station in it or in anything it consumes, and a pool costs its cheapest member.
// Relaxing until stable also means a cycle settles instead of recursing forever.
const chainAge = new Map<string, number>();
const ageOfPool = (key: string) => {
  const members = poolMembers(key);
  if (!members.length) return 0; // a pool nothing fills constrains nothing
  return Math.min(...members.map((m) => chainAge.get(m.id) ?? 0));
};
const ageOfInput = (k: string) =>
  k.startsWith('category:') ? ageOfPool(k) : (chainAge.get(k) ?? 0);
const recipeAge = (r: RecipeWithStation) =>
  Math.max(
    r.station ? (BUILDING_AGE.get(r.station) ?? 0) : 0,
    ...ingredientsOf(r).map(ageOfInput),
    0
  );

for (let pass = 0; pass < 30; pass++) {
  let changed = false;
  for (const [out, rs] of recipesByOutput) {
    // Foraged, mined or butchered off a corpse: no workshop stands behind it, whatever else makes it.
    if (nodeItems.has(out) || carcass.has(out)) continue;
    const age = Math.min(...(rs as RecipeWithStation[]).map(recipeAge));
    if (age !== (chainAge.get(out) ?? 0)) {
      chainAge.set(out, age);
      changed = true;
    }
  }
  if (!changed) break;
}

/** Which building in the chain set the age — for the failure message, computed only when one fails. */
function blameStation(id: string, seen = new Set<string>()): string {
  const rs = (recipesByOutput.get(id) ?? []) as RecipeWithStation[];
  if (!rs.length || seen.has(id)) return '';
  const target = chainAge.get(id) ?? 0;
  const r = rs.find((x) => recipeAge(x) === target) ?? rs[0];
  if (r.station && (BUILDING_AGE.get(r.station) ?? 0) === target) return r.station;
  for (const k of ingredientsOf(r)) {
    if (ageOfInput(k) !== target) continue;
    if (!k.startsWith('category:')) return blameStation(k, new Set(seen).add(id));
    const worst = poolMembers(k).find((m) => (chainAge.get(m.id) ?? 0) === target);
    if (worst) return blameStation(worst.id, new Set(seen).add(id));
  }
  return r.station ?? '';
}

const R4_DEBT = new Set<string>([
  // THE CASTER WEAPON LINE IS THE SAME LIE `arcane_robe` TOLD, thirteen times over: every staff, rod
  // and scepter is carved on a RUNED bench or altar while claiming tier 1-3, so a caster's whole
  // "progression" is one age wearing four hats. Fixing it is a design decision, not a data edit —
  // the line has to move up to the age it is actually made in, and the tiers it vacates need real
  // early staves (a carved wooden rod, a bone-topped stave) to replace it. Until then, named here.
  'cinder_rod',
  'hoarfrost_rod',
  'storm_rod',
  'ember_staff',
  'frost_staff',
  'spark_staff',
  'emberglass_scepter',
  'rimeglass_scepter',
  'stormglass_scepter',
  'pyre_staff',
  'rime_staff',
  'tempest_staff',
  'manaforge_greatstaff',
  // Already on R2_DEBT for demanding a Great Bear's bone; the sanguinary altar says the same thing
  // twice. Both go away together when it is re-tiered.
  'great_bone_maul'
]);

describe('ITEM-RULES R4 — tier is not below the workshop its materials need', () => {
  it('no item is gated behind a station later than its own age', () => {
    const bad = CRAFTABLE.filter((i) => !R4_DEBT.has(i.id))
      .map((i) => ({ i, age: chainAge.get(i.id) ?? 0 }))
      .filter(({ i, age }) => age > AGE_CEILING[Math.min(i.tier ?? 0, 4)])
      .map(
        ({ i, age }) =>
          `${i.id} (tier ${i.tier ?? 'MISSING'}) needs ${blameStation(i.id)} — ` +
          `a ${AGE_NAMES[age]}-age station`
      );
    expect(bad, bad.join('; ')).toEqual([]);
  });

  it('the debt list has no stale entries', () => {
    const fixed = [...R4_DEBT].filter((id) => {
      const item = ITEMS.find((x) => x.id === id);
      return item && (chainAge.get(id) ?? 0) <= AGE_CEILING[Math.min(item.tier ?? 0, 4)];
    });
    expect(fixed, `fixed — drop from R4_DEBT: ${fixed.join(', ')}`).toEqual([]);
  });
});
