import { describe, it, expect } from 'vitest';
import recipesData from '$lib/game/database/items/recipes.jsonc';
import { chainAgeOf, hasRecipe, blameStation } from '$lib/dev/chainAge';
import { GEAR, AGES, DROPPED, UNAFFILIATED } from '$lib/dev/gearDb';

// Guards the gear tables' SORTING, which is invisible from inside the sim and has silently broken
// three times. Every failure had the same shape: `ageOf` guessed an item's age from KEYWORDS IN ITS
// ID, so a piece named for the animal it came off got filed by its material word instead of its data.
// `boarhide_jerkin` is tier 1 and bronze-age; the word "hide" put it in the stone age. A test that
// only reads items.jsonc cannot catch this — it has to go through the same derivation the page uses.

const ROWS = GEAR;
const ARMOUR = ROWS.filter((r) => r.kind === 'armor');
const AGE_BY_TIER = ['Primitive', 'Bronze', 'Iron', 'Steel', 'Runed'];
/** Which age a research gate implies, when one is present. */
const AGE_BY_RESEARCH: Record<string, string> = {
  copper_smelting: 'Copper',
  bronze_working: 'Bronze',
  iron_smelting: 'Iron',
  iron_working: 'Iron',
  steel_making: 'Steel',
  runic_inscription: 'Runed',
  attunement: 'Runed',
  arcane_lapidary: 'Runed',
  mythic_attunement: 'Runed'
};

describe('gear tables sort by DATA, not by words in the id', () => {
  // AGE IS DERIVED, TIER IS NOT AGE. This test used to assert `age === AGE_BY_TIER[tier]`, which made
  // the hand-written tier the definition of the age and so could never catch a wrong one — a flint
  // arrow declared T1 was "correctly" bronze-age, and a knapped stone axe sat beside cast bronze.
  // The age of a craftable is what its CHAIN costs: the latest workshop in it and the ages of
  // everything it consumes. Tier keeps its own column and its own meaning.
  it('every craftable armour row lands in the age its own chain can build', () => {
    const AGE_OF_CHAIN = ['Primitive', 'Copper', 'Bronze', 'Iron', 'Steel', 'Runed'];
    const wrong = ARMOUR.filter((r) => {
      if (r.age === 'Boss') return false; // loot band, decided by craftability not by a chain
      if (!hasRecipe(r.id)) return false; // a drop has no chain to read
      // a declared research gate wins over the chain — read it off the RECIPE, because the row's own
      // `research` field is not populated for every kind of gear
      const rec = (
        recipesData as { id: string; outputs?: Record<string, number>; researchRequired?: string }[]
      ).find((x) => x.outputs && r.id in x.outputs);
      if (rec?.researchRequired && AGE_BY_RESEARCH[rec.researchRequired]) return false;
      return r.age !== AGE_OF_CHAIN[chainAgeOf(r.id)];
    }).map(
      (r) =>
        `${r.id} (T${r.tier}) filed under ${r.age}, but its chain builds at ` +
        `${AGE_OF_CHAIN[chainAgeOf(r.id)]} (${blameStation(r.id) || 'no station'})`
    );
    expect(wrong, wrong.join('\n')).toEqual([]);
  });

  it('a set never straddles two ages', () => {
    // A kit is one thing: if half of it files under Primitive and half under Bronze, the table is
    // lying about when the player can field it. This is what the boar line did.
    const bySet = new Map<string, Set<string>>();
    for (const r of ARMOUR) {
      if (!r.armorSet || r.armorSet === DROPPED || r.armorSet === UNAFFILIATED) continue;
      const s = bySet.get(r.armorSet) ?? new Set<string>();
      s.add(r.age);
      bySet.set(r.armorSet, s);
    }
    const split = [...bySet.entries()]
      .filter(([, ages]) => ages.size > 1)
      .map(([set, ages]) => `${set} spans ${[...ages].join(' + ')}`);
    expect(split, split.join('; ')).toEqual([]);
  });

  it('every armour row carries a set bucket, and the two setless buckets stay distinct', () => {
    const naked = ARMOUR.filter((r) => !r.armorSet).map((r) => r.id);
    expect(naked, `armour with no set bucket at all: ${naked.join(', ')}`).toEqual([]);

    // drop-only means NO recipe; unaffiliated means craftable but in no kit. Conflating them hides
    // the only thing that matters: whether a colony can choose to have the piece.
    const misfiled = ARMOUR.filter(
      (r) =>
        (r.armorSet === DROPPED && r.craftable) || (r.armorSet === UNAFFILIATED && !r.craftable)
    ).map((r) => `${r.id} craftable=${r.craftable} bucket=${r.armorSet}`);
    expect(misfiled, misfiled.join('; ')).toEqual([]);
  });

  it('every age label the rows use is a real age', () => {
    const bad = [...new Set(ROWS.map((r) => r.age))].filter(
      (a) => !(AGES as readonly string[]).includes(a)
    );
    expect(bad, `unknown age labels: ${bad.join(', ')}`).toEqual([]);
  });
});
