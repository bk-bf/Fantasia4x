import { describe, it, expect } from 'vitest';
import itemsData from '$lib/game/database/items/items.json';
import recipesData from '$lib/game/database/items/recipes.json';
import creaturesData from '$lib/game/database/pawns/creatures.json';
import { kingdomService } from '$lib/game/services/KingdomService';
import resourcesData from '$lib/game/database/world/resources.json';
import buildingsData from '$lib/game/database/world/buildings.json';
import conditionsData from '$lib/game/database/pawns/conditions.json';
import type { Item } from '$lib/game/core/types';
import { AGE_CEILING, AGE_NAMES, blameStation, chainAgeOf } from '$lib/dev/chainAge';
import { gearClassOf } from '$lib/game/core/rules/gear/gearClass';
import { vesselAccepts } from '$lib/game/core/rules/gear/vessels';

type Recipe = {
  id: string;
  inputs?: Record<string, number>;
  outputs?: Record<string, number>;
  inputAlternatives?: Record<string, number>[];
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

const nodeItems = new Set<string>();
(function walk(o: unknown): void {
  if (Array.isArray(o)) return o.forEach(walk);
  if (o && typeof o === 'object')
    for (const [k, v] of Object.entries(o as Record<string, unknown>))
      k === 'itemId' && typeof v === 'string' ? nodeItems.add(v) : walk(v);
})(resourcesData);

type Prov = { tier: number; threat: number; name: string; species: string };
const NONE: Prov = { tier: 0, threat: 0, name: '', species: '' };

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

const ADJECTIVES = new Set([
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

const R1_DEBT = new Set<string>([]);
const R2_DEBT = new Set(['great_bone_maul']);
const R3_DEBT = new Set(['layered_boarhide_plate', 'steel_boar_spear']);

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

const R4_DEBT = new Set<string>([
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

const R5_DEBT = new Set<string>([]);

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

type ArmourItem = Item & {
  armorProperties?: { armorType?: string; equipmentSlot?: string; slot?: string };
};
const WEARABLE = (ITEMS as ArmourItem[]).filter(
  (i) => i.armorProperties?.armorType && !i.weaponProperties && recipesByOutput.has(i.id)
);
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
  const STRUCTURAL = /branch|withy|wicker|wattle|bark|hay|straw/;
  const SEAM = [
    'category:binding',
    'category:thread',
    'sinew',
    'thread',
    'enchant_thread',
    'cotton_thread',
    'spider_silk_thread'
  ];
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
    const bad: string[] = [];
    for (const i of WEARABLE) {
      const ins = (firstRecipe(i.id)!.inputs ?? {}) as Record<string, number>;
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

import lootpoolData from '$lib/game/database/items/lootpool.json';

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
  lootpoolData.pools ?? {}
))
  for (const slot of Object.values(pool?.slots ?? {}))
    for (const pick of slot?.pick ?? []) LOOTED.add(pick.id);

const TIMED = new Set<string>();
for (const i of ITEMS as (Item & { driesTo?: string | { itemId?: string }; decaysTo?: string })[]) {
  const dry = typeof i.driesTo === 'string' ? i.driesTo : i.driesTo?.itemId;
  if (dry) TIMED.add(dry);
  if (typeof i.decaysTo === 'string') TIMED.add(i.decaysTo);
}
['dried_meat', 'dried_fruit'].forEach((x) => TIMED.add(x));

const SIM_MADE = new Set(['pawn_carcass', 'carried_pawn', 'water', 'terra_preta']);

const R8_DEBT = new Set<string>(['common_carp', 'river_trout']);

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

describe('ITEM-RULES R12 — the weight class is the same axis on armour, carry aids and weapons', () => {
  const RANK: Record<string, number> = { light: 0, medium: 1, heavy: 2 };

  it('every craftable weapon and worn carry aid resolves to a class', () => {
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
        if (PLAINER[word] && !['budget', 'wallet', 'frog'].includes(word))
          bad.push(`${i.id} description says "${word}" — plainly, ${PLAINER[word]}`);
      }
    }
    expect(bad, bad.join('; ')).toEqual([]);
  });
});

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
      const carriers = VESSELS_ALL.filter((v) => vesselAccepts(v.id, m.id)).map(
        (v) => v.container?.material
      );
      expect(new Set(carriers), `${m.id} carriers`).toEqual(new Set(['fireclay', 'runed']));
    }
  });

  it('a fluid nothing can carry is only ever asked for at a station that holds it', () => {
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
    expect(v('cordage'), 'cordage is the crudest').toBeLessThan(v('sinew'));
    expect(v('sinew'), 'sinew is cruder than spun thread').toBeLessThan(v('thread'));
  });

  it('every pool whose members differ in SIZE prices them', () => {
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
    const values = new Set(pool('binding').map((i) => i.craftValue ?? 1));
    expect(values.size, 'binding members are not all worth the same').toBeGreaterThan(1);
  });
});

describe('ITEM-RULES R18 — the name says what one unit is', () => {
  const byId = new Map((ITEMS as Item[]).map((i) => [i.id, i]));
  const SINGLE = ['iron_nail', 'bronze_nail', 'copper_tack', 'steel_rivet'];
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
    const bundle = byId.get('mail_rings')!.weightKg!;
    const perCoif = (firstRecipe('mail_coif')!.inputs as Record<string, number>)['mail_rings'];
    const rings = (bundle * perCoif * 1000) / 0.7;
    expect(rings, `a coif comes to ${Math.round(rings)} rings`).toBeGreaterThan(2000);
    expect(rings, `a coif comes to ${Math.round(rings)} rings`).toBeLessThan(7000);
  });
});

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

describe('ITEM-RULES R20 — a cure below the runed age costs the patient something', () => {
  const RUNED = AGE_NAMES.indexOf('runed');
  const LOWER_IS_BETTER = new Set(['hungerRate', 'fatigueRate', 'thirstRate', 'pain']);
  type CondDef = { id: string; modifiers?: Record<string, number> };
  const CONDS = conditionsData as unknown as CondDef[];
  const COND_BY_ID = new Map(CONDS.map((c) => [c.id, c]));

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

  const CONSUMABLES = (ITEMS as Item[]).filter(
    (i) =>
      i.type === 'consumable' ||
      i.type === 'fluid' ||
      i.medicineQuality != null ||
      i.curesConditions?.length ||
      i.mendsWounds?.length
  );
  const cures = (i: Item) => [...(i.curesConditions ?? []), ...(i.mendsWounds ?? [])];
  const pays = (i: Item) =>
    !!(i as { rawConsumeRisk?: unknown }).rawConsumeRisk ||
    !!(i.conditionDurationTurns && (i.grantsConditions ?? []).some(isPenalty));

  const R20_DEBT = new Set([
    'styptic_pack',
    'field_surgeons_kit',
    'fever_draught',
    'warming_liniment',
    'poppy_draught',
    'burn_dressing',
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
    const bad = CONSUMABLES.flatMap((i) =>
      (i.grantsConditions ?? [])
        .filter((c) => !COND_BY_ID.has(c))
        .map((c) => `${i.id} grants "${c}", which is not a condition`)
    );
    expect(bad, bad.join('; ')).toEqual([]);
  });
});

describe('ITEM-RULES R21 — a round trip through the crafting graph never gains mass', () => {
  const OPS = RECIPES.flatMap((r) =>
    [r.inputs, ...(r.inputAlternatives ?? [])]
      .filter(Boolean)
      .map((inp) => ({ id: r.id, inp: inp as Record<string, number>, out: r.outputs ?? {} }))
  );

  const byCat = new Map<string, string[]>();
  for (const i of ITEMS)
    if (i.category) byCat.set(i.category, [...(byCat.get(i.category) ?? []), i.id]);
  const members = (key: string) =>
    key.startsWith('category:') ? (byCat.get(key.slice('category:'.length)) ?? []) : [key];

  it('no two recipes turn N of an item into more than N', () => {
    const gains: string[] = [];
    for (const seed of ITEMS.map((i) => i.id)) {
      for (const a of OPS) {
        const spent = Object.entries(a.inp)
          .filter(([k]) => members(k).includes(seed))
          .reduce((s, [, q]) => s + q, 0);
        if (!spent) continue;
        for (const b of OPS) {
          if (!(seed in b.out)) continue;
          const bridges = Object.keys(a.out).filter((o) =>
            Object.keys(b.inp).some((k) => members(k).includes(o))
          );
          if (!bridges.length) continue;
          const runs = Math.min(
            ...bridges.map((o) => {
              const need = Object.entries(b.inp).find(([k]) => members(k).includes(o))?.[1] ?? 1;
              return a.out[o] / need;
            })
          );
          const back = runs * b.out[seed];
          if (back > spent + 1e-9)
            gains.push(
              `${a.id} + ${b.id} turns ${spent}x ${seed} into ${back.toFixed(2)}x — an unbounded supply`
            );
        }
      }
    }
    expect([...new Set(gains)], [...new Set(gains)].join('; ')).toEqual([]);
  });
});

describe('ITEM-RULES R22 — a fluid states a density and a serving, and its batch fits its station', () => {
  const FLUIDS = ITEMS.filter((i) => i.type === 'fluid');

  it('every fluid weighs a believable amount per litre', () => {
    const bad = FLUIDS.filter((i) => !(i.weightKg && i.weightKg >= 0.5 && i.weightKg <= 20)).map(
      (i) =>
        `${i.id} has weightKg ${i.weightKg} — for a fluid that is kilograms per LITRE, so this reads as ` +
        `${(i.weightKg ?? 0) < 0.5 ? 'lighter than any real liquid' : 'denser than molten gold'}. ` +
        `A per-serving weight belongs in volumeL's serving, not here.`
    );
    expect(bad, bad.join('; ')).toEqual([]);
  });

  it('every fluid states a serving a vessel could actually pour', () => {
    const bad = FLUIDS.filter((i) => !(i.volumeL && i.volumeL > 0 && i.volumeL <= 2)).map(
      (i) =>
        `${i.id} has volumeL ${i.volumeL} — one serving, and nothing drinks or doses 2 L at once`
    );
    expect(bad, bad.join('; ')).toEqual([]);
  });

  it('a batch of fluid fits the station it is poured into', () => {
    const capacity = new Map(
      (BUILDINGS as { id?: string; fluidCapacityL?: number }[])
        .filter((b) => b.id)
        .map((b) => [b.id as string, b.fluidCapacityL ?? 0])
    );
    const isFluid = new Set(FLUIDS.map((i) => i.id));
    const bad: string[] = [];
    for (const r of RECIPES as (Recipe & { station?: string })[]) {
      const litres = Object.entries(r.outputs ?? {})
        .filter(([o]) => isFluid.has(o))
        .reduce((s, [, q]) => s + q, 0);
      if (litres <= 0) continue;
      const cap = capacity.get(r.station ?? '') ?? 0;
      if (cap > 0 && litres > cap)
        bad.push(
          `${r.id} pours ${litres} L into ${r.station}, which holds ${cap} L — the overflow spills`
        );
    }
    expect(bad, bad.join('; ')).toEqual([]);
  });
});
