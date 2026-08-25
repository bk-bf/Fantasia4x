import { describe, it, expect } from 'vitest';
import recipesData from '$lib/game/database/items/recipes.jsonc';
import { chainAgeOf, hasRecipe, blameStation } from '$lib/dev/chainAge';
import { GEAR, AGES, DROPPED, UNAFFILIATED } from '$lib/dev/gearDb';

const ROWS = GEAR;
const ARMOUR = ROWS.filter((r) => r.kind === 'armor');
const AGE_BY_TIER = ['Primitive', 'Bronze', 'Iron', 'Steel', 'Runed'];
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
  it('every craftable armour row lands in the age its own chain can build', () => {
    const AGE_OF_CHAIN = ['Primitive', 'Copper', 'Bronze', 'Iron', 'Steel', 'Runed'];
    const wrong = ARMOUR.filter((r) => {
      if (r.age === 'Boss') return false;
      if (!hasRecipe(r.id)) return false;
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
