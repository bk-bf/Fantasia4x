import { describe, it, expect } from 'vitest';
import buildingsData from '$lib/game/database/world/buildings.json';
import { AGE_NAMES, BUILDING_AGE, blameStation, chainAgeOf } from '$lib/dev/chainAge';

type Building = {
  id: string;
  ageTier?: string;
  buildingCost?: Record<string, number>;
};
const BUILDINGS = buildingsData as unknown as Building[];

const AGES = ['primitive', 'copper', 'bronze', 'iron', 'steel', 'runed'] as const;
const ENFORCED_AGES = new Set(['iron', 'steel', 'runed']);

const PRIMITIVE_RAW = new Set([
  'branch',
  'plant_fiber',
  'cordage',
  'rope',
  'beam',
  'hay',
  'pine_log',
  'oak_log',
  'birch_log',
  'ash_log',
  'yew_log',
  'mud_brick',
  'blue_clay',
  'granite',
  'small_stone',
  'dirt',
  'flint',
  'straw'
]);

const BRIDGE_STATIONS = new Set([
  'makers_bench',
  'pottery_kiln',
  'advanced_kiln',
  'masons_bench',
  'sawtable',
  'casting_hearth',
  'bloomery',
  'finery_forge',
  'heartwood_joiner',
  'stone_forge',
  'anvil',
  'charcoal_pit'
]);

describe('building ageTier audit', () => {
  it('every building has a valid ageTier ("age:tier")', () => {
    const bad: string[] = [];
    for (const b of BUILDINGS) {
      const m = b.ageTier?.match(/^([a-z]+):(\d+)$/);
      if (!m || !AGES.includes(m[1] as (typeof AGES)[number])) bad.push(`${b.id}=${b.ageTier}`);
    }
    expect(bad, `buildings with missing/invalid ageTier: ${bad.join(', ')}`).toEqual([]);
  });

  it('no iron+ building uses primitive raw filler (bridge stations exempt)', () => {
    const violations: string[] = [];
    for (const b of BUILDINGS) {
      const age = b.ageTier?.split(':')[0];
      if (!age || !ENFORCED_AGES.has(age)) continue;
      if (BRIDGE_STATIONS.has(b.id)) continue;
      for (const mat of Object.keys(b.buildingCost ?? {})) {
        if (PRIMITIVE_RAW.has(mat)) violations.push(`${b.id} (${b.ageTier}) ← ${mat}`);
      }
    }
    expect(
      violations,
      `advanced buildings using primitive raw filler:\n  ${violations.join('\n  ')}`
    ).toEqual([]);
  });
});

describe('a building is at least as late as its own materials', () => {
  it('no building declares an age earlier than what it is built from', () => {
    const bad: string[] = [];
    for (const b of BUILDINGS) {
      if (!b.id || !b.buildingCost) continue;
      const declared = BUILDING_AGE.get(b.id) ?? 0;
      for (const k of Object.keys(b.buildingCost)) {
        if (k.startsWith('category:')) continue;
        const needed = chainAgeOf(k);
        if (needed > declared)
          bad.push(
            `${b.id} is ${AGE_NAMES[declared]} but needs ${k} — ${AGE_NAMES[needed]} work ` +
              `(${blameStation(k) || 'no station'}). Raise its ageTier or build it from something earlier.`
          );
      }
    }
    expect(bad, bad.join('; ')).toEqual([]);
  });
});
