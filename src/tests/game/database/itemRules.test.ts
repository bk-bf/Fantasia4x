import { describe, it, expect } from 'vitest';
import itemsData from '$lib/game/database/items/items.jsonc';
import recipesData from '$lib/game/database/items/recipes.jsonc';
import creaturesData from '$lib/game/database/pawns/creatures.jsonc';
import { kingdomService } from '$lib/game/services/KingdomService';
import resourcesData from '$lib/game/database/world/resources.jsonc';
import buildingsData from '$lib/game/database/world/buildings.jsonc';
import type { Item } from '$lib/game/core/types';
import { AGE_CEILING, AGE_NAMES, blameStation, chainAgeOf } from '$lib/dev/chainAge';

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
// R8 EVERY item can be got. Recipes are one of six ways in — a map node, a carcass, a natural weapon,
//    enemy loot, decay/drying, or a caravan — and an item that matches none of them is content the
//    player can see and never hold. "A caravan" is not a flag on the item: it asks the SIM, through
//    `kingdomService.isTradeableDef`, whether a caravan could ever stock the thing. One rule, checked
//    where it actually lives, instead of a marker an author can assert about their own item.
// R6 a fastener is a real component or it is not listed at all. Sewing thread is not a line item: the
//    sinew that closes a seam comes off the animal the piece is cut from, and nobody sews leather with
//    rope. Cordage stays only where it IS the structure (wicker, wattle, bark). Rivets, nails, mail
//    rings and enchanted thread stay — those are countable manufactured parts.
// R7 hide is not leather. A name saying "hide" must be cut from something in the `hide` line, and one
//    saying "leather" from tanned leather. The steel-age sabretooth set called itself hide while being
//    made of `sabretooth_leather`; R5 waved it through because its map treats the two words as one.
// R5 a MATERIAL word in the name is a material the recipe actually uses. "Oiled Leather Cloak" with
//    no oil in it, an "Antler War Club" carved from large bones, a "Bronze Punch Dagger" cast from a
//    copper bar. R3 catches the same lie about CREATURES; nothing caught it about materials, and it
//    was found three times by eye before this rule existed.
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
const BUILDINGS = buildingsData as unknown as { id?: string; fluidCapacityL?: number }[];
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
// The walk itself lives in `$lib/dev/chainAge` so the /gear-db item tree and this assertion read the
// SAME numbers — two copies of it would drift, and the drift would be invisible.

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
      .map((i) => ({ i, age: chainAgeOf(i.id) }))
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
      return item && chainAgeOf(id) <= AGE_CEILING[Math.min(item.tier ?? 0, 4)];
    });
    expect(fixed, `fixed — drop from R4_DEBT: ${fixed.join(', ')}`).toEqual([]);
  });
});

// ── R5: a name may only claim a material the chain actually contains ────────────────────────────
// The haystack is the FULL transitive chain, not the immediate inputs: "Hippogriff-Feather Boots" are
// cut from prime hippogriff leather, tanned from a hide whose own name is "Feathered Hide". A fixed
// one- or two-hop window calls that a lie. Construction words (quilted, splint, scale, riveted, cast)
// are not materials and are deliberately absent from this map.
const CLAIMS: Record<string, string[]> = {
  oiled: ['oil', 'tallow', 'grease', 'fat'],
  waxed: ['wax'],
  tarred: ['tar', 'pitch', 'resin'],
  linen: ['linen'],
  silk: ['silk'],
  wool: ['wool'],
  woollen: ['wool'],
  cotton: ['cotton'],
  leather: ['leather', 'hide', 'buckskin'],
  hide: ['hide', 'leather', 'pelt'],
  rawhide: ['hide'],
  fur: ['fur', 'pelt'],
  iron: ['iron'],
  steel: ['steel'],
  bronze: ['bronze'],
  copper: ['copper'],
  silver: ['silver'],
  gold: ['gold'],
  bone: ['bone'],
  antler: ['antler'],
  flint: ['flint'],
  stone: ['stone', 'granite', 'rock', 'flint'],
  oak: ['oak'],
  pine: ['pine'],
  yew: ['yew'],
  wicker: ['branch', 'wicker', 'withy'],
  wattle: ['branch'],
  plank: ['plank'],
  sinew: ['sinew'],
  horn: ['horn'],
  glass: ['glass', 'sand'],
  rune: ['rune', 'enchant', 'gem', 'magic'],
  gem: ['gem'],
  feather: ['feather']
};

type RecipeWithAlts = Recipe & {
  inputAlternatives?: Record<string, number>[];
  dynamicRecipe?: Record<string, { acceptsCategory?: string; variants?: Record<string, unknown> }>;
};
const ITEM_BY_ID = new Map(ITEMS.map((i) => [i.id, i]));
const firstRecipe = (id: string) => recipesByOutput.get(id)?.[0] as RecipeWithAlts | undefined;

function chainWords(k: string, seen: Set<string> = new Set()): string {
  if (seen.has(k) || seen.size > 24) return '';
  seen.add(k);
  const it = ITEM_BY_ID.get(k) as { category?: string; name?: string } | undefined;
  const sub = firstRecipe(k);
  const subIngredients = sub ? Object.keys(sub.inputs ?? {}) : [];
  return `${k} ${it?.category ?? ''} ${it?.name ?? ''} ${subIngredients
    .map((x) => chainWords(x, seen))
    .join(' ')}`;
}

const R5_DEBT = new Set<string>([
  // Empty. A name that claims a material is a promise about the recipe; keep them in step.
]);

describe('ITEM-RULES R5 — a material in the name is a material in the recipe', () => {
  const offenders = () => {
    const bad: string[] = [];
    for (const i of CRAFTABLE) {
      if (R5_DEBT.has(i.id)) continue;
      const rec = firstRecipe(i.id)!;
      const ingredients = [...Object.keys(rec.inputs ?? {})];
      for (const alt of rec.inputAlternatives ?? []) ingredients.push(...Object.keys(alt));
      for (const slot of Object.values(rec.dynamicRecipe ?? {})) {
        if (slot.acceptsCategory) ingredients.push(slot.acceptsCategory);
        ingredients.push(...Object.keys(slot.variants ?? {}));
      }
      const hay = ingredients
        .map((k) => chainWords(k))
        .join(' ')
        .toLowerCase();
      for (const word of String(i.name)
        .toLowerCase()
        .replace(/[^a-z ]/g, ' ')
        .split(/\s+/)) {
        const need = CLAIMS[word];
        if (need && !need.some((n) => hay.includes(n)))
          bad.push(`${i.id} "${i.name}" claims ${word}, recipe has [${ingredients.join(', ')}]`);
      }
    }
    return bad;
  };

  it('no name promises a material its chain never contains', () => {
    const bad = offenders();
    expect(bad, bad.join('; ')).toEqual([]);
  });
});

// ── R6/R7 shared lookups ────────────────────────────────────────────────────────────────────────
type ArmourItem = Item & {
  armorProperties?: { armorType?: string; equipmentSlot?: string; slot?: string };
};
const WEARABLE = (ITEMS as ArmourItem[]).filter(
  (i) => i.armorProperties?.armorType && recipesByOutput.has(i.id)
);
/** How much binding a piece of this size takes. A glove and a cuirass are not lashed with equal cord. */
const BINDING_SIZE: Record<string, number> = {
  head: 1,
  gloves: 1,
  boots: 1,
  bracers: 1,
  belt: 1,
  back2: 1,
  greaves: 2,
  back: 2,
  offHand: 2,
  bodyBase: 3,
  bodyMid: 3,
  bodyOuter: 3
};
const BINDINGS = ['cordage', 'thread', 'sinew', 'enchant_thread'];
const slotOf = (i: ArmourItem) => i.armorProperties?.equipmentSlot ?? i.armorProperties?.slot ?? '';

describe('ITEM-RULES R6 — a fastener is a real component or it is not listed', () => {
  // You do not sew a jerkin with ROPE, and the few metres of sinew or thread that close a seam come
  // off the same animal or the same fibre the piece is cut from — listing them made the player
  // stockpile and haul bookkeeping. A fastener earns a line in the recipe only when it is either the
  // STRUCTURE (withies lashed into a shell, bark tied to a foot) or a countable manufactured part
  // (rivets, nails, mail rings, enchanted thread).
  const STRUCTURAL = /branch|withy|wicker|wattle|bark|hay|straw/;
  const SEWING = ['sinew', 'thread'];

  it('no sewn garment lists its sewing thread', () => {
    const bad: string[] = [];
    for (const i of WEARABLE) {
      const rec = firstRecipe(i.id)!;
      const ins = (rec.inputs ?? {}) as Record<string, number>;
      for (const b of SEWING) if (ins[b] !== undefined) bad.push(`${i.id} lists ${ins[b]}x ${b}`);
    }
    expect(bad, bad.join('; ')).toEqual([]);
  });

  it('cordage appears only where it is the structure', () => {
    const bad: string[] = [];
    for (const i of WEARABLE) {
      const rec = firstRecipe(i.id)!;
      const ins = (rec.inputs ?? {}) as Record<string, number>;
      if (ins['cordage'] === undefined) continue;
      const keys = [
        ...Object.keys(ins),
        ...Object.values(rec.dynamicRecipe ?? {}).map((d) => d.acceptsCategory ?? '')
      ];
      if (!keys.some((k) => STRUCTURAL.test(k)))
        bad.push(`${i.id} is lashed with cordage but nothing about it is lashed`);
    }
    expect(bad, bad.join('; ')).toEqual([]);
  });

  it('every piece still costs SOMETHING', () => {
    // Stripping the fastener must never leave a recipe that produces armour out of thin air.
    const bad = WEARABLE.filter((i) => {
      const rec = firstRecipe(i.id)!;
      return !Object.keys(rec.inputs ?? {}).length && !Object.keys(rec.dynamicRecipe ?? {}).length;
    }).map((i) => `${i.id} has no inputs at all`);
    expect(bad, bad.join('; ')).toEqual([]);
  });
});

describe('ITEM-RULES R7 — hide is not leather', () => {
  it('a name saying hide is cut from hide, and leather from leather', () => {
    const bad: string[] = [];
    for (const i of WEARABLE) {
      const rec = firstRecipe(i.id)!;
      const keys = [
        ...Object.keys(rec.inputs ?? {}),
        ...Object.values(rec.dynamicRecipe ?? {}).map((s) => s.acceptsCategory ?? '')
      ];
      // `boarhide`/`oxhide` are LEATHERS whose own name carries "hide" — a piece named for them is
      // telling the truth, so the material's name counts, not just its category.
      const words = keys
        .map((k) => `${k} ${ITEM_BY_ID.get(k)?.category ?? ''} ${ITEM_BY_ID.get(k)?.name ?? ''}`)
        .join(' ')
        .toLowerCase();
      const name = String(i.name).toLowerCase();
      if (/\bhide\b|-hide/.test(name) && !/hide|pelt/.test(words))
        bad.push(`${i.id} "${i.name}" says hide, made from [${keys.join(', ')}]`);
      if (/leather/.test(name) && !/leather/.test(words))
        bad.push(`${i.id} "${i.name}" says leather, made from [${keys.join(', ')}]`);
    }
    expect(bad, bad.join('; ')).toEqual([]);
  });
});

// ── R8: nothing is unobtainable ─────────────────────────────────────────────────────────────────
import lootpoolData from '$lib/game/database/items/lootpool.jsonc';

const NODE_ITEMS = new Set<string>();
(function walk(o: unknown): void {
  if (Array.isArray(o)) return o.forEach(walk);
  if (o && typeof o === 'object')
    for (const [k, v] of Object.entries(o as Record<string, unknown>))
      k === 'itemId' && typeof v === 'string' ? NODE_ITEMS.add(v) : walk(v);
})(resourcesData);

const CARCASS_ITEMS = new Set(
  (CREATURES as { carcassItemId?: string }[])
    .map((c) => c.carcassItemId)
    .filter(Boolean) as string[]
);
const LOOTED = new Set<string>();
for (const pool of Object.values<{ slots?: Record<string, { pick?: { id: string }[] }> }>(
  (lootpoolData as { pools?: Record<string, never> }).pools ?? {}
))
  for (const slot of Object.values(pool?.slots ?? {}))
    for (const pick of slot?.pick ?? []) LOOTED.add(pick.id);

const TIMED = new Set<string>();
for (const i of ITEMS as (Item & { driesTo?: string | { itemId?: string }; decaysTo?: string })[]) {
  const dry = typeof i.driesTo === 'string' ? i.driesTo : i.driesTo?.itemId;
  if (dry) TIMED.add(dry);
  if (typeof i.decaysTo === 'string') TIMED.add(i.decaysTo);
}
// category-level drying lives in ItemService, not in the item defs
['dried_meat', 'dried_fruit'].forEach((x) => TIMED.add(x));

/** Produced by the sim itself, not by the player: a corpse, a colonist over a shoulder, water. */
const SIM_MADE = new Set(['pawn_carcass', 'carried_pawn', 'water', 'terra_preta']);

const R8_DEBT = new Set<string>([
  // Fresh fish: a caravan will not haul it (R8 asks the sim, and `isTradeableDef` refuses perishable
  // food), and there is no fishing system to catch it. Obtainable the day fishing lands, not before.
  'common_carp',
  'river_trout'
]);

describe('ITEM-RULES R8 — every item has a way in', () => {
  it('nothing is visible in the tables and impossible to hold', () => {
    const bad = (ITEMS as (Item & { category?: string })[])
      .filter(
        (i) =>
          !recipesByOutput.has(i.id) &&
          !NODE_ITEMS.has(i.id) &&
          !CARCASS_ITEMS.has(i.id) &&
          !LOOTED.has(i.id) &&
          !TIMED.has(i.id) &&
          !SIM_MADE.has(i.id) &&
          !R8_DEBT.has(i.id) &&
          i.category !== 'natural_weapon' &&
          // the top tier cap a caravan can ever reach, so this asks "could ANY caravan carry it"
          !kingdomService.isTradeableDef(i as Item, 5)
      )
      .map(
        (i) =>
          `${i.id} has no recipe, no node, no carcass, no drop, no decay, and no caravan would ` +
          `ever stock it — give it a source or name it in R8_DEBT with the feature it waits on`
      );
    expect(bad, bad.join('; ')).toEqual([]);
  });
});

// ── CONTAINERS-AND-FLUIDS ───────────────────────────────────────────────────
//
// R9  a VESSEL states a real capacity, and is not simultaneously a carry aid. Three different things
//     wore the word "container" before this pass — a carry aid raises what a pawn can shoulder, a
//     vessel holds items, a fixture is a building — and an item is exactly one of them. A `container`
//     block with no `capacityL` is a jug that holds nothing, which is the same lie as armour claiming
//     a material it never uses.
// R10 a fluid recipe OUTPUT has somewhere to be poured. A fluid cannot lie on the ground, so a recipe
//     that makes one at a station with no body of its own is producing something the sim will refuse
//     to place — the batch is silently lost. Every fluid-output recipe must name a station that
//     declares a `fluidCapacityL`.

const VESSELS = (ITEMS as (Item & { inventoryBonus?: unknown })[]).filter((i) => i.container);

describe('ITEM-RULES R9 — a vessel holds a stated amount, and is only one kind of container', () => {
  it('every vessel declares a positive capacityL', () => {
    const bad = VESSELS.filter((i) => !((i.container?.capacityL ?? 0) > 0)).map(
      (i) =>
        `${i.id} is a vessel with no capacityL — say how much it holds or drop the container block`
    );
    expect(bad, bad.join('; ')).toEqual([]);
  });

  it('nothing is both a vessel and a carry aid', () => {
    // A worn quiver is the one place these two ideas meet, and they are kept apart in TIME rather than
    // in the data: its `container` is what it holds when it is set down, its `inventoryBonus` what it
    // grants when it is worn, and equipping it moves the contents into the pack. Anything else
    // carrying both fields is an author conflating the two.
    const bad = VESSELS.filter((i) => i.inventoryBonus && !i.quiver).map(
      (i) =>
        `${i.id} is both a vessel (container) and a carry aid (inventoryBonus) — pick one; ` +
        `only a quiver legitimately does both, and only because worn and set-down are different states`
    );
    expect(bad, bad.join('; ')).toEqual([]);
  });
});

describe('ITEM-RULES R10 — a fluid output is always caught', () => {
  it('every recipe that makes a fluid works at a station that can hold one', () => {
    const fluids = new Set(ITEMS.filter((i) => i.type === 'fluid').map((i) => i.id));
    const holds = new Set(
      (BUILDINGS as { id?: string; fluidCapacityL?: number }[])
        .filter((b) => b.id && (b.fluidCapacityL ?? 0) > 0)
        .map((b) => b.id as string)
    );
    const bad = (RECIPES as (Recipe & { station?: string })[])
      .filter((r) => Object.keys(r.outputs ?? {}).some((o) => fluids.has(o)))
      .filter((r) => !r.station || !holds.has(r.station))
      .map(
        (r) =>
          `${r.id} pours out ${Object.keys(r.outputs ?? {})
            .filter((o) => fluids.has(o))
            .join('/')} at "${r.station ?? '(no station)'}", which has no fluidCapacityL — ` +
          `the batch would spill. Give the station a body, or stage a vessel there.`
      );
    expect(bad, bad.join('; ')).toEqual([]);
  });
});

// R11 a container ITEM and a storage BUILDING never share a noun. Three pairs used to collide —
//     `storage_chest`/`wooden_chest`, `salting_barrel`/`wooden_barrel`, `wicker_basket`/`woven_basket` —
//     and "put it in the chest" meant two different things depending on which panel you were in. The
//     rule that settles it: an ITEM you can pick up takes the bare vessel noun (Bucket, Barrel, Bin,
//     Crate, Basket, Chest, Jug, Urn); a BUILDING you cannot takes a fitted place-name that says so
//     (Larder Cupboard, Meat Hooks, Rope-Hung Granary, Root Clamp, Drying Rack, Hay Rack).

const VESSEL_NOUNS = [
  'bucket',
  'barrel',
  'bin',
  'crate',
  'basket',
  'chest',
  'jug',
  'urn',
  'flask',
  'phial',
  'cask',
  'sack',
  'jar',
  'waterskin'
];

describe('ITEM-RULES R11 — a container item and a storage building never share a noun', () => {
  it('no storage building is named after a vessel a pawn could pick up', () => {
    const bad = (BUILDINGS as { id?: string; name?: string; effects?: Record<string, number> }[])
      .filter((b) => (b.effects?.storageStacks ?? 0) > 0)
      .filter((b) =>
        VESSEL_NOUNS.some((n) => (b.name ?? '').toLowerCase().split(/\W+/).includes(n))
      )
      .map(
        (b) =>
          `the building "${b.name}" (${b.id}) is named after a portable vessel — either make it an ` +
          `ITEM, or give it a fitted place-name that says it cannot be carried`
      );
    expect(bad, bad.join('; ')).toEqual([]);
  });

  it('every container item reads as the bare vessel it is', () => {
    const bad = VESSELS.filter((i) => !i.quiver && i.category === 'storage')
      .filter(
        (i) => !VESSEL_NOUNS.some((n) => (i.name ?? '').toLowerCase().split(/\W+/).includes(n))
      )
      .map(
        (i) =>
          `the vessel "${i.name}" (${i.id}) does not name a vessel — a container item takes the plain ` +
          `noun for the thing it is, so the player never has to guess which "chest" a panel means`
      );
    expect(bad, bad.join('; ')).toEqual([]);
  });
});
