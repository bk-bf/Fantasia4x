import { describe, it, expect } from 'vitest';
import itemsData from '$lib/game/database/items/items.jsonc';
import recipesData from '$lib/game/database/items/recipes.jsonc';
import type { EquipmentSlot, Item } from '$lib/game/core/types';
import { SLOT_COVERAGE } from '$lib/game/core/rules/gear/armorCoverage';

const ITEMS = itemsData as unknown as Item[];
const RECIPES = recipesData as unknown as {
  outputs?: Record<string, number>;
  researchRequired?: string | null;
}[];

const craftable = new Set(RECIPES.flatMap((r) => Object.keys(r.outputs ?? {})));
const armour = ITEMS.filter((i) => i.type === 'armor' && i.armorProperties?.armorType);
const wearable = armour.filter((i) => i.armorProperties?.armorType !== 'shield');

const LOOT_ONLY = new Set([
  'orc_scrap_plate',
  'orc_warplate',
  'orc_iron_slab',
  'orc_horned_helm',
  'orc_iron_greaves',
  'orc_warhelm',
  'orc_plate_greaves',
  'orc_plate_vambraces',
  'orc_plate_gauntlets',
  'orc_plate_sabatons',
  'goblin_scrap_vest',
  'goblin_scrap_cap',
  'goblin_bark_bracers',
  'goblin_ring_vest',
  'goblin_pot_helm',
  'kobold_scale_vest',
  'kobold_dig_cap',
  'kobold_bone_bracers',
  'gnoll_bone_harness',
  'gnoll_skull_helm',
  'gnoll_hide_greaves'
]);

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
        if (['back', 'back2', 'ring', 'ring2', 'amulet'].includes(slot)) return false;
        return !i.armorProperties!.covers?.length && !SLOT_COVERAGE[slot]?.length;
      })
      .map((i) => `${i.id} → ${i.armorProperties!.equipmentSlot}`);
    expect(bad, `piece protects no body part: ${bad.join(', ')}`).toEqual([]);
  });

  it('the shoulders and the neck are still covered, now that their slots are gone', () => {
    const covers = (slot: EquipmentSlot, part: string) =>
      (SLOT_COVERAGE[slot] ?? []).includes(part);
    expect(covers('bodyOuter', 'leftShoulder'), 'torso-outer covers shoulders').toBe(true);
    expect(covers('bodyMid', 'rightShoulder'), 'torso-mid covers shoulders').toBe(true);
    expect(covers('head', 'neck'), 'the head piece covers the neck').toBe(true);
  });
});

describe('every tech age can dress a pawn', () => {
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
