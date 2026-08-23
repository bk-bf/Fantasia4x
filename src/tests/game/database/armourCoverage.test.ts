import { describe, it, expect } from 'vitest';
import itemsData from '$lib/game/database/items/items.jsonc';
import recipesData from '$lib/game/database/items/recipes.jsonc';
import type { EquipmentSlot, Item } from '$lib/game/core/types';
import { SLOT_COVERAGE } from '$lib/game/core/armorCoverage';

// The armour DB's structural guarantees. Every one of these failed silently at some point: fifteen
// limb pieces (pauldrons/bracers/greaves at EVERY age) shipped as item definitions with no recipe,
// so arms and legs were unprotectable in actual play while the combat probes — which force-equip by
// id — happily measured them. A circlet carried a slot outside the EquipmentSlot union, so it could
// never be worn at all. Those are invisible from inside the sim.

const ITEMS = itemsData as unknown as Item[];
const RECIPES = recipesData as unknown as {
  outputs?: Record<string, number>;
  researchRequired?: string | null;
}[];

const craftable = new Set(RECIPES.flatMap((r) => Object.keys(r.outputs ?? {})));
// `armorType` is the shared weight class now — worn carry aids and (derived) weapons answer to it too,
// so the coverage audit filters on the TYPE as well. A knapsack is classed medium and still protects
// nothing; asserting slot coverage over it would be asserting a promise it never made.
const armour = ITEMS.filter((i) => i.type === 'armor' && i.armorProperties?.armorType);
const wearable = armour.filter((i) => i.armorProperties?.armorType !== 'shield');

/** Enemy-faction gear: found on a corpse, never forged in the colony. */
const LOOT_ONLY = new Set([
  // Orc
  'orc_scrap_plate',
  'orc_warplate',
  'orc_iron_slab',
  'orc_horned_helm',
  'orc_iron_greaves',
  'orc_warhelm',
  'orc_plate_greaves',
  // Goblin
  'goblin_scrap_vest',
  'goblin_scrap_cap',
  'goblin_bark_bracers',
  'goblin_ring_vest',
  'goblin_pot_helm',
  // Kobold
  'kobold_scale_vest',
  'kobold_dig_cap',
  'kobold_bone_bracers',
  // Gnoll
  'gnoll_bone_harness',
  'gnoll_skull_helm',
  'gnoll_hide_greaves'
]);

/** Every slot a worn piece may claim. Mirrors the `EquipmentSlot` union; a value outside it is
 *  stored under a key the mitigation walk never visits, so the piece soaks nothing. */
const SLOTS: EquipmentSlot[] = [
  'mainHand',
  'offHand',
  'head',
  'bodyBase',
  'bodyMid',
  'bodyOuter',
  'gloves',
  'boots',
  'socks',
  'bracers',
  'greaves',
  'ring',
  'ring2',
  'amulet',
  'belt',
  'back',
  'back2'
];

describe('armour is reachable through play', () => {
  it('every non-loot armour piece has a recipe', () => {
    const orphans = armour
      .filter((i) => !craftable.has(i.id) && !LOOT_ONLY.has(i.id))
      .map((i) => i.id);
    expect(
      orphans,
      `armour with an items.jsonc entry but no recipe (unequippable in play; add a recipe, or ` +
        `LOOT_ONLY it here if it is enemy gear): ${orphans.join(', ')}`
    ).toEqual([]);
  });
});

describe('armour slots resolve', () => {
  it('every equipmentSlot is a real EquipmentSlot', () => {
    const bad = wearable
      .filter((i) => !SLOTS.includes(i.armorProperties!.equipmentSlot as EquipmentSlot))
      .map((i) => `${i.id} → ${i.armorProperties!.equipmentSlot}`);
    expect(bad, `unworkable equipmentSlot: ${bad.join(', ')}`).toEqual([]);
  });

  it('`slot` and `equipmentSlot` agree', () => {
    // Two spellings for one slot drifted apart once already (`hands` vs `gloves`), leaving a piece
    // classified in the dev tables under a slot it does not actually occupy.
    const bad = wearable
      .filter(
        (i) =>
          i.armorProperties!.slot && i.armorProperties!.slot !== i.armorProperties!.equipmentSlot
      )
      .map(
        (i) =>
          `${i.id} (slot ${i.armorProperties!.slot} ≠ equipmentSlot ${i.armorProperties!.equipmentSlot})`
      );
    expect(bad, bad.join('; ')).toEqual([]);
  });

  it('every body-armour slot protects at least one body part', () => {
    const bad = wearable
      .filter((i) => {
        const slot = i.armorProperties!.equipmentSlot as EquipmentSlot;
        // back/back2/jewellery legitimately protect nothing (warmth and carry only).
        if (['back', 'back2', 'ring', 'ring2', 'amulet'].includes(slot)) return false;
        return !i.armorProperties!.covers?.length && !SLOT_COVERAGE[slot]?.length;
      })
      .map((i) => `${i.id} → ${i.armorProperties!.equipmentSlot}`);
    expect(bad, `piece protects no body part: ${bad.join(', ')}`).toEqual([]);
  });

  it('the shoulders and the neck are still covered, now that their slots are gone', () => {
    // Removing a slot must not create a permanent free-damage window: both are real hit locations.
    // Shoulders ride on the two rigid torso layers, the neck on the head piece.
    const covers = (slot: EquipmentSlot, part: string) =>
      (SLOT_COVERAGE[slot] ?? []).includes(part);
    expect(covers('bodyOuter', 'leftShoulder'), 'torso-outer covers shoulders').toBe(true);
    expect(covers('bodyMid', 'rightShoulder'), 'torso-mid covers shoulders').toBe(true);
    expect(covers('head', 'neck'), 'the head piece covers the neck').toBe(true);
  });
});

describe('every tech age can dress a pawn', () => {
  // The eight protectable regions. A gap here is a body part no craftable piece covers at that age,
  // which the combat walk turns into free damage for any weapon that aims well.
  const REGION_OF: Partial<Record<EquipmentSlot, string>> = {
    head: 'head',
    bodyOuter: 'torso-outer',
    bodyMid: 'torso-mid',
    bodyBase: 'torso-skin',
    bracers: 'arms',
    gloves: 'hands',
    greaves: 'legs',
    boots: 'feet'
  };
  // Torso counts as THREE cells, one per layer: a tier that can only fill the skin layer is not
  // dressed. Cloak/pack are carry slots, not protection, so they are not coverage requirements.
  const REGIONS = [
    'head',
    'torso-outer',
    'torso-mid',
    'torso-skin',
    'arms',
    'hands',
    'legs',
    'feet'
  ];

  // Age = the metal research a piece is gated behind; ungated leather/cloth is available from the
  // start. Kept deliberately simple (the research id, not gearDb's display heuristic) so the test
  // asserts the PROGRESSION GATE rather than a naming convention.
  const AGE_BY_RESEARCH: Record<string, number> = {
    copper_smelting: 1,
    bronze_working: 2,
    iron_smelting: 3,
    iron_working: 3,
    steel_making: 4,
    runic_inscription: 5,
    attunement: 5,
    arcane_lapidary: 5,
    mythic_attunement: 5
  };
  const AGE_NAMES = ['ungated', 'copper', 'bronze', 'iron', 'steel', 'runed'];

  /** The research gate lives on the RECIPE, never on the item. */
  const gateOf = (id: string) =>
    RECIPES.find((r) => Object.keys(r.outputs ?? {}).includes(id))?.researchRequired ?? '';

  const reachableBy = (age: number): Set<string> => {
    const covered = new Set<string>();
    for (const i of wearable) {
      if (!craftable.has(i.id)) continue;
      const gate = AGE_BY_RESEARCH[gateOf(i.id)] ?? 0;
      if (gate > age) continue;
      const region = REGION_OF[i.armorProperties!.equipmentSlot as EquipmentSlot];
      if (region) covered.add(region);
    }
    return covered;
  };

  for (let age = 0; age < AGE_NAMES.length; age++) {
    it(`${AGE_NAMES[age]}: a craftable piece exists for all eight regions`, () => {
      const covered = reachableBy(age);
      const gaps = REGIONS.filter((r) => !covered.has(r));
      expect(gaps, `no craftable armour covers: ${gaps.join(', ')}`).toEqual([]);
    });
  }
});
