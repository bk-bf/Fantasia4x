/**
 * Built-in scenario presets (HEADLESS-SIM / ADR-033) — the eras you can't reach by playing an hour.
 * Pure data: both the `/api/sim` driver and the in-game DebugMenu pick from this one list, so the
 * two fronts can never drift. Ids are backend-only; the `label` is what a UI shows.
 */
import type { ScenarioSpec } from '../Scenario';

export interface ScenarioPreset {
  id: string;
  label: string;
  description: string;
  spec: ScenarioSpec;
}

export const SCENARIO_PRESETS: ScenarioPreset[] = [
  {
    id: 'empty-flat-8x8',
    label: 'Empty flat 8×8',
    description:
      'Uniform walkable grass, no pawns, no wildlife — the micro fixture for API smoke tests.',
    spec: {
      seed: 0xf1a7,
      map: { w: 8, h: 8, preset: 'flat' },
      pawns: [],
      seedEntities: false
    }
  },
  {
    id: 'bronze-colony',
    label: 'Bronze colony',
    description:
      'Eight practised colonists with tier-1 research done, a casting yard, and bronze-age stock.',
    spec: {
      seed: 0xb407e,
      map: { w: 96, h: 96 },
      pawns: [{ count: 8, skillLevel: 12 }],
      researchMaxTier: 1,
      buildings: [
        { id: 'campfire' },
        { id: 'well' },
        { id: 'craft_spot' },
        { id: 'makers_bench' },
        { id: 'charcoal_pit' },
        { id: 'casting_hearth' },
        { id: 'stone_forge' },
        { id: 'drying_rack' },
        { id: 'storage_chest' },
        { id: 'hay_bed' },
        { id: 'hay_bed' },
        { id: 'hay_bed' },
        { id: 'hay_bed' }
      ],
      items: {
        bread: 60,
        spit_meat: 40,
        water: 120,
        branch: 200,
        small_stone: 120,
        pine_plank: 60,
        limestone_block: 40,
        flint_shard: 30,
        hide: 20,
        bronze_bar: 30,
        stone_axe: 2,
        stone_pick: 2,
        stone_hammer: 2,
        cast_bronze_hatchet: 2
      }
    }
  },
  {
    id: 'iron-colony',
    label: 'Iron colony',
    description:
      'Ten seasoned colonists with tier-2 research done, a bloomery-and-anvil yard, and iron stock.',
    spec: {
      seed: 0x140c0,
      map: { w: 96, h: 96 },
      pawns: [{ count: 10, skillLevel: 20 }],
      researchMaxTier: 2,
      buildings: [
        { id: 'campfire' },
        { id: 'hearth' },
        { id: 'well' },
        { id: 'makers_bench' },
        { id: 'charcoal_pit' },
        { id: 'stone_forge' },
        { id: 'bloomery' },
        { id: 'anvil' },
        { id: 'finery_forge' },
        { id: 'oven' },
        { id: 'storage_chest' },
        { id: 'hay_bed' },
        { id: 'hay_bed' },
        { id: 'hide_bed' },
        { id: 'hide_bed' }
      ],
      items: {
        bread: 80,
        salted_meat: 60,
        water: 150,
        branch: 200,
        small_stone: 120,
        oak_plank: 80,
        limestone_block: 60,
        hide: 30,
        buckskin: 20,
        iron_bar: 30,
        iron_axe: 2,
        iron_hammer: 2,
        iron_shovel: 1,
        iron_hoe: 1
      }
    }
  },
  {
    id: 'war-party',
    label: 'War party',
    description:
      'Six drafted, armed veterans on a quiet map against a goblin pack — needs frozen so only the fight matters.',
    spec: {
      seed: 0xa47a5,
      map: { w: 64, h: 64 },
      pawns: [
        {
          count: 6,
          skillLevel: 15,
          stats: { strength: 14, dexterity: 13, constitution: 14 },
          drafted: true,
          equip: ['iron_mace', 'boiled_leather_jerkin', 'leather_coif']
        }
      ],
      researchMaxTier: 2,
      seedEntities: false,
      spawnMobs: [{ count: 8, creatureId: 'goblin' }],
      needsDisabled: ['hunger', 'thirst', 'fatigue', 'hygiene', 'relaxation']
    }
  },
  {
    id: 'full-tech',
    label: 'Full tech',
    description:
      'Twelve master colonists with the entire research tree complete — the late-game surface, reachable in seconds.',
    spec: {
      seed: 0xf011,
      map: { w: 96, h: 96 },
      pawns: [{ count: 12, skillLevel: 35 }],
      researchMaxTier: 99,
      buildings: [
        { id: 'campfire' },
        { id: 'hearth' },
        { id: 'well' },
        { id: 'makers_bench' },
        { id: 'carpenter_bench' },
        { id: 'stone_forge' },
        { id: 'bloomery' },
        { id: 'anvil' },
        { id: 'blast_furnace' },
        { id: 'crucible_steelworks' },
        { id: 'alchemy_lab' },
        { id: 'manaforge' },
        { id: 'oven' },
        { id: 'storage_chest' },
        { id: 'feather_bed' },
        { id: 'feather_bed' },
        { id: 'feather_bed' }
      ],
      items: {
        bread: 100,
        salted_meat: 80,
        water: 200,
        branch: 300,
        small_stone: 150,
        oak_plank: 120,
        limestone_block: 80,
        oxhide: 30,
        iron_bar: 60,
        bronze_bar: 30,
        steel_axe: 2,
        steel_hammer: 2,
        iron_axe: 2
      }
    }
  }
];

export function getScenarioPreset(id: string): ScenarioPreset | undefined {
  return SCENARIO_PRESETS.find((p) => p.id === id);
}
