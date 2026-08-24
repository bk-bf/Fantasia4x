import { describe, it, expect } from 'vitest';
import itemsData from '$lib/game/database/items/items.jsonc';
import recipesData from '$lib/game/database/items/recipes.jsonc';
import creaturesData from '$lib/game/database/pawns/creatures.jsonc';
import { kingdomService } from '$lib/game/services/KingdomService';
import resourcesData from '$lib/game/database/world/resources.jsonc';
import buildingsData from '$lib/game/database/world/buildings.jsonc';
import conditionsData from '$lib/game/database/pawns/conditions.jsonc';
import type { Item } from '$lib/game/core/types';
import { AGE_CEILING, AGE_NAMES, blameStation, chainAgeOf } from '$lib/dev/chainAge';
import { gearClassOf } from '$lib/game/core/gearClass';
import { vesselAccepts } from '$lib/game/core/vessels';

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
  // Not a species — a GROUP noun, and the only reason it reaches this set is that `pack_alpha` and
  // `kingdom_pack_beast` are creature ids. Left in, every backpack in the game reads as beast-named
  // and R3 demands a creature the recipe was never going to name.
  'pack',
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
// Anything with a weight class that a pawn WEARS: armour, and now the worn carry aids. Weapons derive
// their class instead of authoring it, and they are not sewn, so they stay out of the fastener rules.
const WEARABLE = (ITEMS as ArmourItem[]).filter(
  (i) => i.armorProperties?.armorType && !i.weaponProperties && recipesByOutput.has(i.id)
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

describe('ITEM-RULES R6 — a sewn piece lists the binding that holds it together', () => {
  // This rule used to say the opposite, and its stated reason was that listing a fastener "made the
  // player stockpile bookkeeping". That was true when one cordage was 200g and one nail was 200g — a
  // fastener was a heavy, annoying thing to haul, so banning it from 122 recipes bought something.
  // The unit is fixed now (a nail is 10g, a bar draws to 300), the bookkeeping objection is gone, and
  // what the ban left behind was a hide cap made of two hides and nothing else.
  //
  // What survives from the old rule: you do not sew leather with ROPE. Cordage is a lashing, not a
  // seam, and it belongs only where it IS the structure.
  const STRUCTURAL = /branch|withy|wicker|wattle|bark|hay|straw/;
  const SEAM = ['category:binding', 'sinew', 'thread', 'enchant_thread', 'cotton_thread'];
  const FASTENER = [
    ...SEAM,
    'cordage',
    'rope',
    'iron_nail',
    'bronze_nail',
    'steel_rivet',
    'copper_tack',
    'mail_rings'
  ];
  /** How much binding a piece of this size takes. A glove and a cuirass are not sewn with equal thread. */
  const BINDING_SIZE: Record<string, number> = {
    head: 1,
    gloves: 1,
    boots: 1,
    socks: 1,
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

  it('every sewn piece names what holds it together', () => {
    const bad: string[] = [];
    for (const i of WEARABLE) {
      const rec = firstRecipe(i.id)!;
      const ins = (rec.inputs ?? {}) as Record<string, number>;
      const slot = slotOf(i);
      if (!BINDING_SIZE[slot]) continue;
      const keys = [
        ...Object.keys(ins),
        ...Object.values(rec.dynamicRecipe ?? {}).map((d) => d.acceptsCategory ?? '')
      ].join(' ');
      // Wood and metal pieces are pegged, riveted or forged rather than stitched.
      if (
        !/leather|hide|pelt|fur|buckskin|kidskin|cloth|linen|wool|silk|cotton|sackcloth/.test(keys)
      )
        continue;
      if (!FASTENER.some((f) => ins[f] !== undefined))
        bad.push(`${i.id} is cut from ${keys.trim()} and nothing holds it together`);
    }
    expect(bad, bad.join('; ')).toEqual([]);
  });

  it('ROPE appears only where it is the structure — a seam is not lashed with rope', () => {
    const bad: string[] = [];
    for (const i of WEARABLE) {
      const rec = firstRecipe(i.id)!;
      const ins = (rec.inputs ?? {}) as Record<string, number>;
      // Cordage moved INTO the binding pool when its unit shrank to a thong; `rope` at 1.1kg is
      // still rope, and nothing is sewn with it.
      if (ins['rope'] === undefined) continue;
      const keys = [
        ...Object.keys(ins),
        ...Object.values(rec.dynamicRecipe ?? {}).map((d) => d.acceptsCategory ?? '')
      ];
      if (!keys.some((k) => STRUCTURAL.test(k)))
        bad.push(`${i.id} is lashed with rope but nothing about it is lashed`);
    }
    expect(bad, bad.join('; ')).toEqual([]);
  });

  it('a binding slot names the CATEGORY, so any threading will do', () => {
    // A cured hood does not become impossible to craft because the colony has linen thread and no
    // sinew. Naming one material in a seam slot is the same mistake as a `category:leather` piece
    // demanding one species.
    const bad: string[] = [];
    for (const i of WEARABLE) {
      const ins = (firstRecipe(i.id)!.inputs ?? {}) as Record<string, number>;
      // A RUNED piece is woven WITH enchanted thread; that is what its name claims and R5 enforces,
      // so naming the material there is the point rather than a mistake.
      if (/rune/.test(i.id)) continue;
      for (const k of ['sinew', 'thread', 'enchant_thread', 'cotton_thread'])
        if (ins[k] !== undefined)
          bad.push(`${i.id} demands ${k} by name — a seam takes \`category:binding\``);
    }
    expect(bad, bad.join('; ')).toEqual([]);
  });

  it('every piece still costs SOMETHING', () => {
    const bad = WEARABLE.filter((i) => {
      const rec = firstRecipe(i.id)!;
      return !Object.keys(rec.inputs ?? {}).length && !Object.keys(rec.dynamicRecipe ?? {}).length;
    }).map((i) => `${i.id} has no inputs at all`);
    expect(bad, bad.join('; ')).toEqual([]);
  });
});

// R7 asks whether a NAME tells the truth about its material, which has nothing to do with whether the
// piece soaks damage — so it runs over every craftable, not just `WEARABLE`.
const NAMED_MATERIAL = CRAFTABLE.filter((i) => recipesByOutput.has(i.id)) as ArmourItem[];

describe('ITEM-RULES R7 — hide is not leather', () => {
  it('a name saying hide is cut from hide, and leather from leather', () => {
    const bad: string[] = [];
    for (const i of NAMED_MATERIAL) {
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
  'waterskin',
  'crucible'
];

describe('ITEM-RULES R11 — a container item and a storage building never share a noun', () => {
  it('no building that holds anything is named after a vessel a pawn could pick up', () => {
    // Every building that STORES or holds FLUID, not just the storage bins — the first pass only
    // checked `storageStacks` and let "Tanning Bucket" (a building) sit next to "Tanning Bucket" (an
    // item) and "Brewing Barrel" next to "Barrel". Pit, vat, trough, rack and larder name no item and
    // never will, because they are fixed by definition; those are a fixture's vocabulary.
    const bad = (
      BUILDINGS as {
        id?: string;
        name?: string;
        effects?: Record<string, number>;
        fluidCapacityL?: number;
      }[]
    )
      .filter((b) => (b.effects?.storageStacks ?? 0) > 0 || (b.fluidCapacityL ?? 0) > 0)
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

  it('no building name is a word-for-word copy of an item name', () => {
    const itemNames = new Map<string, string>();
    for (const i of ITEMS) if (i.name) itemNames.set(i.name.toLowerCase(), i.id);
    const bad = (BUILDINGS as { id?: string; name?: string }[])
      .filter((b) => b.name && itemNames.has(b.name.toLowerCase()))
      .map(
        (b) =>
          `the building "${b.name}" (${b.id}) is named exactly like the item ` +
          `\`${itemNames.get((b.name ?? '').toLowerCase())}\` — one name, two things`
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

// ── R12: light / medium / heavy means the same thing on every piece of gear ─────────────────────
// The class used to live on armour alone, so a loadout could only be read a piece at a time and
// nothing said that a frame pack and a greatsword are the same KIND of choice. Now every worn or held
// item answers to it — armour and carry aids author it, weapons derive it from mass and grip.
//
// Authoring a label is only worth anything if the numbers under it agree, so the second assertion is
// the real one: inside one slot at one age, a heavier class must actually cost more to wear AND carry
// more for it. That is what stops a "heavy" pack that is lighter and roomier than the light one.
describe('ITEM-RULES R12 — the weight class is the same axis on armour, carry aids and weapons', () => {
  const RANK: Record<string, number> = { light: 0, medium: 1, heavy: 2 };

  it('every craftable weapon and worn carry aid resolves to a class', () => {
    // Regalia is deliberately outside the axis: a ring is not a light/medium/heavy choice, it soaks
    // nothing and costs nothing to wear, which is why it files under its own branch in /gear-db.
    const bad = CRAFTABLE.filter((i) => i.weaponProperties || i.inventoryBonus)
      .filter((i) => !gearClassOf(i as Item))
      .map((i) => `${i.id} is worn or held and has no weight class`);
    expect(bad, bad.join('; ')).toEqual([]);
  });

  it('a carry aid states a class, and does not borrow the shield label', () => {
    const bad = (ITEMS as Item[])
      .filter((i) => i.inventoryBonus && recipesByOutput.has(i.id))
      .filter((i) => !['light', 'medium', 'heavy'].includes(i.armorProperties?.armorType ?? ''))
      .map((i) => `${i.id} is a carry aid with no light/medium/heavy class`);
    expect(bad, bad.join('; ')).toEqual([]);
  });

  it('within one slot and age, a heavier class costs more to wear and buys more for it', () => {
    // The class is a PRICE: what the piece costs to have on you. So the invariant is cost-side, and it
    // holds across both belt lines — a plated war-belt is heavy because there is steel on it, even
    // though a tool-belt out-carries it. What the extra cost buys may be capacity OR protection, but it
    // has to buy something, or the class is a label with nothing under it.
    //
    // Quivers sit out: their job is draw speed, their capacity is incidental, and ranking a war quiver
    // against a rucksack compares two things that were never alternatives.
    const aids = (ITEMS as Item[]).filter(
      (i) =>
        i.inventoryBonus &&
        !i.quiver &&
        recipesByOutput.has(i.id) &&
        i.armorProperties?.equipmentSlot
    );
    const bucket = new Map<string, Item[]>();
    for (const i of aids) {
      const key = `${i.armorProperties!.equipmentSlot}@tier${i.tier ?? 0}`;
      bucket.set(key, [...(bucket.get(key) ?? []), i]);
    }
    const cls = (i: Item) => i.armorProperties!.armorType as string;
    // What a worn aid buys is VOLUME (see R14) or protection — never weight, which is the body's.
    const buys = (i: Item) =>
      Math.max(i.inventoryBonus?.volumeL ?? 0, (i.armorProperties?.defense ?? 0) * 10);
    const bad: string[] = [];
    for (const [key, group] of bucket) {
      for (const lower of ['light', 'medium'] as const) {
        const upper = lower === 'light' ? 'medium' : 'heavy';
        const lo = group.filter((i) => cls(i) === lower);
        const hi = group.filter((i) => cls(i) === upper);
        if (!lo.length || !hi.length) continue;
        const loCost = Math.max(...lo.map((i) => i.weightKg ?? 0));
        const hiCost = Math.min(...hi.map((i) => i.weightKg ?? 0));
        if (hiCost <= loCost)
          bad.push(
            `${key}: the ${upper} pieces start at ${hiCost}kg, no heavier than the ${lower} ones ` +
              `at ${loCost}kg — a heavier class that costs nothing to wear is a free upgrade`
          );
        const loBuys = Math.max(...lo.map(buys));
        const hiBuys = Math.min(...hi.map(buys));
        if (hiBuys <= loBuys)
          bad.push(
            `${key}: the ${upper} pieces buy no more than the ${lower} ones (${hiBuys} vs ${loBuys} ` +
              `on volume-or-defence) — the extra bulk has to be worth something`
          );
      }
    }
    expect(bad, bad.join('; ')).toEqual([]);
  });

  it('a belt never out-holds the crudest backpack', () => {
    // A belt is a small load that costs nothing and stays on while a quiver owns the back; a pack is
    // where bulk actually goes. Pinned to the smallest pack in the game rather than a typed constant,
    // so the two ladders cannot drift past each other unnoticed.
    const packFloor = Math.min(
      ...(ITEMS as Item[])
        .filter(
          (i) => i.armorProperties?.equipmentSlot === 'back2' && i.inventoryBonus && !i.quiver
        )
        .map((i) => i.inventoryBonus?.volumeL ?? 0)
    );
    const bad = (ITEMS as Item[])
      .filter((i) => i.armorProperties?.equipmentSlot === 'belt' && i.inventoryBonus)
      .filter((i) => (i.inventoryBonus?.volumeL ?? 0) > packFloor)
      .map(
        (i) =>
          `${i.id} holds ${i.inventoryBonus?.volumeL}L, more than the crudest pack at ${packFloor}L`
      );
    expect(bad, bad.join('; ')).toEqual([]);
  });
});

// ── R13: the plainest accurate word wins ────────────────────────────────────────────────────────
// This is NOT a ban on period vocabulary. `greaves`, `bracers`, `cuirass`, `coif` and `jerkin` are the
// genre's shared language — used across dozens of pieces, learned once, and there is no plain synonym
// that says the same thing. What this catches is the one-off obscurity in a slot where an ordinary word
// already exists: a "scrip" is a pouch, a "girdle" is a belt, a "snapsack" is a satchel. Reaching for
// the antique word there costs the player comprehension and buys nothing.
describe('ITEM-RULES R13 — a one-off antique word where a plain one exists', () => {
  const PLAINER: Record<string, string> = {
    scrip: 'pouch',
    girdle: 'belt',
    snapsack: 'satchel',
    withy: 'wicker or bent wood',
    pannier: 'carry-basket',
    chape: 'the tip of the scabbard',
    locket: 'the mouth of the scabbard',
    frog: 'a belt loop',
    budget: 'pouch',
    wallet: 'pouch',
    creel: 'basket'
  };

  it('no item name reaches for an antique word a plain one already covers', () => {
    const bad: string[] = [];
    for (const i of ITEMS as Item[]) {
      for (const word of String(i.name ?? '')
        .toLowerCase()
        .replace(/[^a-z ]/g, ' ')
        .split(/\s+/)) {
        if (PLAINER[word])
          bad.push(`${i.id} "${i.name}" says "${word}" where the plain word is "${PLAINER[word]}"`);
      }
    }
    expect(bad, bad.join('; ')).toEqual([]);
  });

  it('and neither does a description, which the player reads in full', () => {
    const bad: string[] = [];
    for (const i of ITEMS as Item[]) {
      for (const word of String(i.description ?? '')
        .toLowerCase()
        .replace(/[^a-z ]/g, ' ')
        .split(/\s+/)) {
        // `budget`/`wallet` are ordinary English in a sentence; only their ITEM-NAME sense is antique.
        if (PLAINER[word] && !['budget', 'wallet', 'frog'].includes(word))
          bad.push(`${i.id} description says "${word}" — plainly, ${PLAINER[word]}`);
      }
    }
    expect(bad, bad.join('; ')).toEqual([]);
  });
});

// ── R14: a carry aid gives you somewhere to put things, not stronger shoulders ──────────────────
// Weight capacity is the BODY's — `(11 + 0.19 x strength) x frameFactor`, and nothing you strap on
// changes how much mass a pawn can bear. A pack that raised it was quietly saying a rucksack makes you
// stronger. What a pack actually does is give bulk somewhere to ride, so worn aids grant VOLUME only.
//
// The single exception is a load carried IN HAND that puts its weight on the ground instead of on the
// wearer: a barrow, a handcart. Those really do raise what one person can move, and they cost a hand
// to do it. That is also what keeps carts necessary — dense goods (bars, ore) bind on weight, which no
// pack will ever help with, while bulky goods (timber, pelts, food) bind on volume.
describe('ITEM-RULES R14 — worn carry aids grant volume, never weight', () => {
  it('nothing worn raises what a pawn can bear', () => {
    const bad = (ITEMS as Item[])
      .filter((i) => i.inventoryBonus)
      .filter((i) => {
        const slot = i.armorProperties?.equipmentSlot ?? i.armorProperties?.slot;
        return slot !== 'mainHand' && slot !== 'offHand' && slot !== undefined;
      })
      .filter((i) => (i.inventoryBonus?.weightKg ?? 0) > 0)
      .map(
        (i) =>
          `${i.id} is worn on the ${i.armorProperties?.equipmentSlot} and grants ` +
          `+${i.inventoryBonus?.weightKg}kg — weight capacity comes from the body, not from gear`
      );
    expect(bad, bad.join('; ')).toEqual([]);
  });

  it('every worn carry aid still grants SOMETHING', () => {
    // Stripping the weight must not leave a piece that does nothing at all.
    const bad = (ITEMS as Item[])
      .filter((i) => i.inventoryBonus && recipesByOutput.has(i.id))
      .filter((i) => (i.inventoryBonus?.volumeL ?? 0) <= 0 && !(i.armorProperties?.defense ?? 0))
      .map((i) => `${i.id} grants neither volume nor protection`);
    expect(bad, bad.join('; ')).toEqual([]);
  });

  it('a hand-hauled cart DOES raise it — that is what a wheel is for', () => {
    const carts = (ITEMS as Item[]).filter((i) => i.inventoryBonus && /barrow|cart/.test(i.id));
    expect(carts.length, 'the wheeled line still exists').toBeGreaterThan(0);
    for (const c of carts)
      expect(
        c.inventoryBonus?.weightKg ?? 0,
        `${c.id} puts its load on wheels, so it raises carry weight`
      ).toBeGreaterThan(0);
  });
});

// ── R15: a fluid says what may hold it, by MATERIAL ────────────────────────────────────────────
// The allow-list used to run one way only — a vessel said what it accepted — so a leather waterskin
// declaring `accepts: ['fluid']` would take molten copper at 1085C, and a basket with no list at all
// took anything. A fluid now names the vessel MATERIALS that can hold it (`heldBy`) and every vessel
// says what it is made of (`container.material`), so the rule reads as the physical fact it is rather
// than as a tag someone invented. A new vessel is safe by default.
describe('ITEM-RULES R15 — a fluid states what material may hold it', () => {
  const FLUIDS = (ITEMS as Item[]).filter((i) => i.type === 'fluid');
  const VESSELS_ALL = (ITEMS as Item[]).filter((i) => i.container);

  it('every vessel says what it is made of', () => {
    const bad = VESSELS_ALL.filter((v) => !v.container?.material).map(
      (v) => `${v.id} is a vessel with no \`container.material\` — a fluid cannot judge it`
    );
    expect(bad, bad.join('; ')).toEqual([]);
  });

  it('a fluid only names materials some vessel could actually be made of, or none at all', () => {
    // Naming a material nothing is made of is fine and deliberate (fireclay is the crucible that does
    // not exist yet) — but it must be a real material word, not a typo that silently allows nothing.
    const KNOWN = new Set([
      'wood',
      'leather',
      'hide',
      'clay',
      'fireclay',
      'porcelain',
      'glass',
      'wicker',
      'stone',
      'metal',
      'runed'
    ]);
    const bad: string[] = [];
    for (const f of FLUIDS)
      for (const m of f.heldBy ?? [])
        if (!KNOWN.has(m))
          bad.push(`${f.id} may be held by "${m}", which is not a vessel material`);
    expect(bad, bad.join('; ')).toEqual([]);
  });

  it('no vessel of the wrong material will hold a fluid that names its own', () => {
    const bad: string[] = [];
    for (const f of FLUIDS) {
      if (!f.heldBy?.length) continue;
      for (const v of VESSELS_ALL) {
        if (f.heldBy.includes(v.container?.material ?? '')) continue;
        if (vesselAccepts(v.id, f.id))
          bad.push(
            `${v.id} (${v.container?.material}) would hold ${f.id}, which only ${f.heldBy.join('/')} may`
          );
      }
    }
    expect(bad, bad.join('; ')).toEqual([]);
  });

  it('molten metal needs a crucible or a runed flask, and nothing else will do', () => {
    const melts = FLUIDS.filter((f) => f.id.startsWith('molten_'));
    expect(melts.length, 'the cast line exists').toBeGreaterThan(0);
    for (const m of melts) {
      expect(m.heldBy, `${m.id} must say what can hold it`).toEqual(['fireclay', 'runed']);
      // Exactly the two that exist for it — a fireclay crucible, and the runed flask that holds
      // anything. Nothing made of wood, leather, glass or ordinary earthenware may take a melt.
      const carriers = VESSELS_ALL.filter((v) => vesselAccepts(v.id, m.id)).map(
        (v) => v.container?.material
      );
      expect(new Set(carriers), `${m.id} carriers`).toEqual(new Set(['fireclay', 'runed']));
    }
  });

  it('a fluid nothing can carry is only ever asked for at a station that holds it', () => {
    // If no vessel can bring it, the only way it reaches a craft is by already being in that station's
    // body. Asking for one anywhere else is an order that can never be supplied — the deadlock the
    // melt/cast pair hit before station-held fluid counted as staged.
    const holds = new Set(
      (BUILDINGS as { id?: string; fluidCapacityL?: number }[])
        .filter((b) => b.id && (b.fluidCapacityL ?? 0) > 0)
        .map((b) => b.id as string)
    );
    const uncarryable = new Set(
      FLUIDS.filter(
        (f) => f.heldBy?.length && !VESSELS_ALL.some((v) => vesselAccepts(v.id, f.id))
      ).map((f) => f.id)
    );
    const bad: string[] = [];
    for (const r of RECIPES as {
      id: string;
      station?: string | null;
      inputs?: Record<string, number>;
    }[])
      for (const k of Object.keys(r.inputs ?? {}))
        if (uncarryable.has(k) && !(r.station && holds.has(r.station)))
          bad.push(
            `${r.id} asks for ${k} at ${r.station ?? 'nowhere'}, which cannot hold it and nothing can carry it there`
          );
    expect(bad, bad.join('; ')).toEqual([]);
  });
});

// ── R16: what holds a thing together is a believable share of the thing ─────────────────────────
// One law for BOTH families, because they failed the same way. A nail was 0.2 kg, so a 3 kg chest
// carried 1.2 kg of nails; a seam was picked off a hand-written size table, so a cap took the same
// binding as an 18 kg plate took three of. In both cases the COUNT looked plausible and the MASS was
// nonsense, and nothing was checking the mass.
//
// The band is deliberately wide — a mail hauberk really is mostly rings, a frame pack really is mostly
// leather. What it catches is the order-of-magnitude error: fastenings that outweigh the object, or
// that round down to a token.
describe('ITEM-RULES R16 — a fastening is a believable share of what it fastens', () => {
  const UNIT: Record<string, number> = {};
  for (const i of ITEMS as Item[]) if (i.weightKg) UNIT[i.id] = i.weightKg;
  const bindingUnit = Math.min(
    ...(ITEMS as Item[])
      .filter((i) => i.category === 'binding' && i.weightKg)
      .map((i) => i.weightKg!)
  );
  const massOf = (k: string, q: number) =>
    (k === 'category:binding' ? bindingUnit : (UNIT[k] ?? 0)) * q;
  const FASTENERS = [
    'category:binding',
    'sinew',
    'thread',
    'enchant_thread',
    'cotton_thread',
    'iron_nail',
    'bronze_nail',
    'steel_rivet',
    'copper_tack',
    'mail_rings'
  ];
  // Mail is not FASTENED with rings, it is MADE of them; a bow's sinew backing is the same.
  const IS_THE_PIECE = /mail_|_backed_bow|weave_|spin_|reel_|dry_sinew/;

  it('no fastening outweighs a third of the thing it holds together', () => {
    const bad: string[] = [];
    for (const r of RECIPES as unknown as {
      id: string;
      inputs?: Record<string, number>;
      outputs?: Record<string, number>;
    }[]) {
      if (IS_THE_PIECE.test(r.id)) continue;
      const ins = r.inputs ?? {};
      const fast = FASTENERS.filter((f) => ins[f] !== undefined);
      if (!fast.length) continue;
      const fm = fast.reduce((n, f) => n + massOf(f, ins[f]), 0);
      const om = Object.entries(r.outputs ?? {}).reduce((n, [o, q]) => n + massOf(o, q), 0);
      if (om <= 0) continue;
      if (fm > om * 0.34)
        bad.push(`${r.id}: ${fm.toFixed(2)}kg of fastening on a ${om.toFixed(2)}kg product`);
    }
    expect(bad, bad.join('; ')).toEqual([]);
  });

  it('every binding material weighs what a thread weighs', () => {
    // The moment one of them is four times the others, every recipe that uses it is silently wrong —
    // which is exactly what `enchant_thread` at 0.2kg did to the whole rune-woven line.
    const units = (ITEMS as Item[])
      .filter((i) => i.category === 'binding')
      .map((i) => i.weightKg ?? 0);
    expect(units.length, 'the binding pool exists').toBeGreaterThan(2);
    expect(
      Math.max(...units) / Math.min(...units),
      'binding units are all the same size'
    ).toBeLessThanOrEqual(1.5);
  });
});

// ── R17: a category pool spanning ages must price its members ───────────────────────────────────
// A `category:` slot takes whatever is cheapest to hand. That is fair when the members cost the same
// to produce and a lie when they do not: `cordage` is plaited at a craft spot on turn one, `sinew`
// needs a carcass and a drying rack, `thread` a bronze-age wheel, `enchant_thread` five steps ending
// at a runed loom. Priced one-for-one the cheapest always wins and the slot is free — which is exactly
// what a hide hood costing "1 binding" meant when that binding could be a single cord.
describe('ITEM-RULES R17 — a category pool prices its members by what they cost to have', () => {
  const pool = (cat: string) => (ITEMS as Item[]).filter((i) => i.category === cat);

  it('every binding material states what a unit of it is worth', () => {
    const bad = pool('binding')
      .filter((i) => !(typeof i.craftValue === 'number' && i.craftValue > 0))
      .map(
        (i) => `${i.id} is in a category slot with no \`craftValue\` — it will win every slot free`
      );
    expect(bad, bad.join('; ')).toEqual([]);
  });

  it('the crude material is worth less than the worked one', () => {
    const v = (id: string) => (ITEMS as Item[]).find((i) => i.id === id)?.craftValue ?? 1;
    // turn-one cord < carcass-and-rack sinew < bronze-age spun thread
    expect(v('cordage'), 'cordage is the crudest').toBeLessThan(v('sinew'));
    expect(v('sinew'), 'sinew is cruder than spun thread').toBeLessThan(v('thread'));
  });

  it('every pool whose members differ in SIZE prices them', () => {
    // The leather pool ran 0.08kg (coney fur) to 2.86kg (mammoth) — a 36x spread — and a slot asking
    // for "3 leather" took three scraps of vermin fur for a jerkin. Size has to propagate down the
    // chain or a category slot quietly becomes the cheapest thing in it.
    const CATS = ['leather', 'cured_hide', 'meat', 'vegetable', 'wood', 'plank', 'log', 'wool'];
    const bad: string[] = [];
    for (const cat of CATS) {
      const members = (ITEMS as Item[]).filter(
        (i) =>
          (cat === 'plank' || cat === 'log' ? i.id.endsWith(`_${cat}`) : i.category === cat) &&
          i.weightKg &&
          !['armor', 'weapon', 'tool'].includes(i.type as string)
      );
      if (members.length < 2) continue;
      const ws = members.map((i) => i.weightKg!);
      if (Math.max(...ws) / Math.min(...ws) < 1.5) continue;
      const values = new Set(members.map((i) => i.craftValue ?? 1));
      if (values.size < 2)
        bad.push(
          `category:${cat} spans ${(Math.max(...ws) / Math.min(...ws)).toFixed(0)}x in size and is priced flat`
        );
    }
    expect(bad, bad.join('; ')).toEqual([]);
  });

  it('a pool whose members span more than one age is not priced flat', () => {
    // The failure this catches is subtle: someone adds a late-age material to an early-age pool and
    // every recipe using that slot silently gets cheaper, because the new member is never chosen but
    // the old cheap one is still worth a full unit.
    const values = new Set(pool('binding').map((i) => i.craftValue ?? 1));
    expect(values.size, 'binding members are not all worth the same').toBeGreaterThan(1);
  });
});

// ── R18: a material's NAME says what ONE unit is ────────────────────────────────────────────────
// The unit and the name have to agree or every count in every recipe is misread. Both directions have
// already shipped: `iron_nail` weighed 0.2 kg and was called "Iron Nails" (a keg — honest), then the
// unit shrank to a single 10 g nail and the plural stayed, so "25x Iron Nails" read as 25 kegs.
// `mail_rings` is the opposite — one unit really is ~290 rings, and calling it "Mail Rings" made a
// coif look like it took ten rings when it takes nearly three thousand.
describe('ITEM-RULES R18 — the name says what one unit is', () => {
  const byId = new Map((ITEMS as Item[]).map((i) => [i.id, i]));
  /** One unit is ONE object: the name must be singular. */
  const SINGLE = ['iron_nail', 'bronze_nail', 'copper_tack', 'steel_rivet'];
  /** One unit is MANY objects: the name must say so. */
  const BATCH = [
    'mail_rings',
    'small_bones',
    'medium_bones',
    'large_bones',
    'huge_bones',
    'feathers'
  ];
  const BATCH_WORD = /bundle|hank|sheaf|bones|feathers|remains|pips|cuttings|dust|meal/i;

  it('a single-piece fastener is named in the singular', () => {
    const bad = SINGLE.filter((id) => /s$/i.test(byId.get(id)?.name ?? '')).map(
      (id) => `${id} is one ${byId.get(id)!.weightKg}kg piece but is called "${byId.get(id)!.name}"`
    );
    expect(bad, bad.join('; ')).toEqual([]);
  });

  it('a unit that is really a batch says so in its name', () => {
    const bad = BATCH.filter((id) => !BATCH_WORD.test(byId.get(id)?.name ?? '')).map(
      (id) =>
        `${id} is a batch (${byId.get(id)!.weightKg}kg) but "${byId.get(id)!.name}" reads as one of them`
    );
    expect(bad, bad.join('; ')).toEqual([]);
  });

  it('the ring bundle is priced so a coif takes a historical number of rings', () => {
    // ~0.7g a riveted ring; a coif is 3,000-6,000 of them. This is the check that would have caught
    // "10x Mail Rings" if anyone had asked what ten of them actually WAS.
    const bundle = byId.get('mail_rings')!.weightKg!;
    const perCoif = (firstRecipe('mail_coif')!.inputs as Record<string, number>)['mail_rings'];
    const rings = (bundle * perCoif * 1000) / 0.7;
    expect(rings, `a coif comes to ${Math.round(rings)} rings`).toBeGreaterThan(2000);
    expect(rings, `a coif comes to ${Math.round(rings)} rings`).toBeLessThan(7000);
  });
});

// ── R19: a worn garment is never a component of another worn garment ────────────────────────────
// The three torso layers ARE the combination mechanic — bodyBase under bodyMid under bodyOuter — so
// building one into another destroys the piece the pawn is supposed to be wearing underneath and
// charges them twice for it. `make_mail_hauberk` ate a linen gambeson, and `make_mail_coif` ate a
// TORSO garment to make a head piece.
describe('ITEM-RULES R19 — armour layers stack on the pawn, not inside the recipe', () => {
  it('no recipe consumes a wearable piece to build another one', () => {
    const worn = new Set(
      (ITEMS as Item[])
        .filter((i) => i.type === 'armor' && i.armorProperties?.armorType)
        .map((i) => i.id)
    );
    const bad: string[] = [];
    for (const r of RECIPES as unknown as { id: string; inputs?: Record<string, number> }[])
      for (const k of Object.keys(r.inputs ?? {}))
        if (worn.has(k))
          bad.push(
            `${r.id} consumes ${k}, which is a garment a pawn wears — layer it, do not eat it`
          );
    expect(bad, bad.join('; ')).toEqual([]);
  });
});

// ── Voidshard: the one thing a colony might never see ───────────────────────────────────────────
describe('voidshard — every way in is a hard one', () => {
  const shard = (ITEMS as Item[]).find((i) => i.id === 'voidshard')!;

  it('awakens a bloodline and nothing else — no gamble, no flaw', () => {
    expect(shard.grantsLineage, 'the shard grants a lineage').toBe(true);
    expect(shard.traitGamble, 'not a gamble — the finding was the gamble').toBeUndefined();
    expect(shard.rawConsumeRisk, 'no downside; it is pure reward').toBeUndefined();
  });

  it('is consumable, not a crafting material', () => {
    expect(shard.type).toBe('consumable');
    const eaten = (RECIPES as unknown as { inputs?: Record<string, number> }[]).filter(
      (r) => r.inputs?.voidshard
    );
    expect(eaten, 'nothing grinds it up').toEqual([]);
  });

  it('a caravan only brings one for a kingdom that trusts you, at a fortune', () => {
    expect(shard.tradeRelationsMin ?? 0).toBeGreaterThanOrEqual(75);
    const bars = (ITEMS as Item[]).find((i) => i.id === 'gold_bar')?.value ?? 1;
    expect(shard.value ?? 0, 'absurdly priced next to a gold bar').toBeGreaterThan(bars * 10);
  });
});

// ── R20: an early consumable buys its effect; a runed one is handed it ──────────────────────────
// A dose that removes something the colony would otherwise have to wait out is the strongest thing a
// consumable can do, and in the early ages it has to be paid for — the medicine of a stone or bronze
// age worked by making the patient sicker on the way to making them better. Charcoal Purge described
// exactly that ("brings the poison back up with it") while clearing nausea AND envenom for nothing,
// which is the shape this catches: prose that promises a trade the effects never charge.
//
// What counts as PAYMENT is a downside the sim actually applies — a `grantsConditions` window naming
// a condition that is a net penalty, or a `rawConsumeRisk`. A grim description is not payment, and
// neither is a low `medicineQuality` (the tend path skips condition medicine outright, so that number
// is never read on one of these).
//
// The exemption is the RUNED age and only the runed age. A clean, instant, costless cure is what the
// last age is FOR — it is the reward for reaching it, and an earlier one that acts the same way has
// quietly handed the player the endgame answer at bronze.
describe('ITEM-RULES R20 — a cure below the runed age costs the patient something', () => {
  const RUNED = AGE_NAMES.indexOf('runed');
  /** Modifier keys where a number BELOW 1 is a benefit, not a penalty (a slower hunger clock is good). */
  const LOWER_IS_BETTER = new Set(['hungerRate', 'fatigueRate', 'thirstRate', 'pain']);
  type CondDef = { id: string; modifiers?: Record<string, number> };
  const CONDS = conditionsData as unknown as CondDef[];
  const COND_BY_ID = new Map(CONDS.map((c) => [c.id, c]));

  /** Does this condition leave the pawn worse off overall? Counted rather than all-or-nothing: nausea
   *  slows the hunger clock while wrecking six other things, and it is plainly not a reward. */
  const isPenalty = (id: string): boolean => {
    const m = COND_BY_ID.get(id)?.modifiers ?? {};
    let bad = 0;
    let good = 0;
    for (const [k, v] of Object.entries(m)) {
      if (typeof v !== 'number' || v === 1) continue;
      const worse = LOWER_IS_BETTER.has(k) ? v > 1 : v < 1;
      if (worse) bad++;
      else good++;
    }
    return bad > good;
  };

  /** Anything eaten, drunk or administered — the whole consumable surface, not just the medicine shelf. */
  const CONSUMABLES = (ITEMS as Item[]).filter(
    (i) =>
      i.type === 'consumable' ||
      i.type === 'fluid' ||
      i.medicineQuality != null ||
      i.curesConditions?.length ||
      i.mendsWounds?.length
  );
  /** A dose that REMOVES something outright, rather than adding a timed effect on top. */
  const cures = (i: Item) => [...(i.curesConditions ?? []), ...(i.mendsWounds ?? [])];
  const pays = (i: Item) =>
    !!(i as { rawConsumeRisk?: unknown }).rawConsumeRisk ||
    !!(i.conditionDurationTurns && (i.grantsConditions ?? []).some(isPenalty));

  // Named rather than silently tolerated, exactly like R1/R2/R4's lists. Six of these declare a cure
  // that lands on nothing — see the audit in the R20 notes — and charging a price for an effect that
  // does not happen makes the item worse than free. The cure has to work before it can cost anything,
  // so they wait on that, not on a one-line data edit. This list may only ever SHRINK.
  const R20_DEBT = new Set([
    // Cure never fires: `bleeding` is re-derived from the limb tree every tick and is never written to
    // `conditionTimers`, which is the only place `curesConditions` reaches.
    'styptic_pack',
    'field_surgeons_kit',
    // Cure never fires: `infection` and `hypothermia` are graded persistent conditions on
    // `pawn.conditions`; `feverburn`/`frostbrittle` are racial triggers re-derived from the pawn's own
    // traits — and feverburn is a BENEFIT, so clearing it would be a downgrade if it worked.
    'fever_draught',
    'warming_liniment',
    // Partly fires: `concussed` is a real timer, `pain_shock` is derived from the pain meter and
    // `pain_maddened` is another racial benefit.
    'poppy_draught',
    // Fires, and is genuinely free: a bronze-age burn dressing puts the fire out at no cost.
    'burn_dressing',
    // Fires, and is genuinely free: the first two rungs of the antidote ladder clear the venom AND hand
    // out a timed immunity. What they should charge is a balance decision about venom counterplay.
    'antivenin_tonic',
    'greater_antivenin_tonic'
  ]);

  it('no early-age dose clears a condition or a wound for nothing', () => {
    const bad = CONSUMABLES.filter((i) => !R20_DEBT.has(i.id))
      .filter((i) => cures(i).length > 0)
      .filter((i) => chainAgeOf(i.id) < RUNED)
      .filter((i) => !pays(i))
      .map(
        (i) =>
          `${i.id} clears [${cures(i).join(', ')}] at the ${AGE_NAMES[chainAgeOf(i.id)]} age and charges nothing`
      );
    expect(bad, bad.join('; ')).toEqual([]);
  });

  it('the debt list has no stale entries', () => {
    const fixed = [...R20_DEBT].filter((id) => {
      const i = (ITEMS as Item[]).find((x) => x.id === id);
      return i && (!cures(i).length || chainAgeOf(id) >= RUNED || pays(i));
    });
    expect(fixed, `fixed — drop from R20_DEBT: ${fixed.join(', ')}`).toEqual([]);
  });

  it('the runed age is the one that gets its cure clean', () => {
    const bad = CONSUMABLES.filter((i) => cures(i).length > 0 && chainAgeOf(i.id) >= RUNED)
      .filter((i) => (i.grantsConditions ?? []).some(isPenalty))
      .map((i) => `${i.id} is a runed cure and still charges a price — that is what the age buys`);
    expect(bad, bad.join('; ')).toEqual([]);
  });

  it('a downside condition is one the sim can actually apply', () => {
    // A `grantsConditions` id that matches no condition def is a cost that never lands, and it looks
    // identical to a real one in the data.
    const bad = CONSUMABLES.flatMap((i) =>
      (i.grantsConditions ?? [])
        .filter((c) => !COND_BY_ID.has(c))
        .map((c) => `${i.id} grants "${c}", which is not a condition`)
    );
    expect(bad, bad.join('; ')).toEqual([]);
  });
});
