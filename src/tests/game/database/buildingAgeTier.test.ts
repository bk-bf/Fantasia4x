import { describe, it, expect } from 'vitest';
import buildingsData from '$lib/game/database/world/buildings.jsonc';
import { AGE_NAMES, BUILDING_AGE, blameStation, chainAgeOf } from '$lib/dev/chainAge';

/**
 * §F age-tier audit — every building carries an `ageTier` ("age:tier", e.g. "runed:3"), and a building
 * of an advanced age must not be built from PRIMITIVE RAW filler (branch/hay/cordage/rope/beam/raw
 * log/raw stone/raw clay). The rule the user set: "a runed:2 building should absolutely not have
 * branches, hay or anything that isn't representative of its age."
 *
 * Enforced for IRON and above (copper/bronze may still lash with cordage/rope — "rope in the bronze age
 * is acceptable"). BRIDGE stations — the first forge/kiln/saw of an age, which must be built from the
 * PRIOR age's materials because you can't smelt the first bloomery from steel — are exempt.
 */
type Building = {
  id: string;
  ageTier?: string;
  buildingCost?: Record<string, number>;
};
const BUILDINGS = buildingsData as unknown as Building[];

const AGES = ['primitive', 'copper', 'bronze', 'iron', 'steel', 'runed'] as const;
const ENFORCED_AGES = new Set(['iron', 'steel', 'runed']);

// Raw / lowest-tier filler that has no place in an advanced building (it should use the worked
// equivalent: planks not logs/beam, blocks not rubble, nails/rivets not cordage, magic planks for runed).
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

// Bridge stations: built from prior-age mats by necessity (can't require their own output).
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

// ── the other direction: a building cannot be older than what it is built from ──────────────────
// The rule above stops an advanced building being lashed together from branches. Nothing stopped the
// reverse, which is the one that actually broke the tables: the Clay Oven declared `primitive:1` and
// cost 25 FIRED BRICKS, which come out of a copper-age kiln. Everything baked in it — every pie, the
// bread — then inherited "primitive" from a station a stone-age colony could never lay. Six other
// buildings had the same shape, including the Apothecary, which called itself iron while needing gem
// dust off a RUNED bench, and so filed the whole grand-coating line two ages early.
describe('a building is at least as late as its own materials', () => {
  it('no building declares an age earlier than what it is built from', () => {
    const bad: string[] = [];
    for (const b of BUILDINGS) {
      if (!b.id || !b.buildingCost) continue;
      const declared = BUILDING_AGE.get(b.id) ?? 0;
      for (const k of Object.keys(b.buildingCost)) {
        if (k.startsWith('category:')) continue; // a pool takes its cheapest member; it gates nothing
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
