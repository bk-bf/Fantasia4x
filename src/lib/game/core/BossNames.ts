// Procedural T5 boss names (CREATURE-COMBAT-OVERHAUL §2e) — mirrors the pawn name system
// (entities/Pawns.ts generatePawnName: flat lists + seeded rng picks), but builds a legend's style:
//   "<personal>, the <epithet-adjective> <epithet-noun>"  →  "Skarn, the Old Fang"
// The noun list is keyed by `species` so a wolf king is a Fang/Howl and a spider queen a Weaver/Silk;
// unknown species fall back to the generic list. Rolled ONCE at spawn (makeMob, seeded rng) onto
// `Mob.name`; the creature DEF keeps a generic name ("Great Wolf") for menus/threat table/fallbacks.

import { rng } from './rng';

/** Personal names — beast-legend flavour, deliberately distinct from the pawn first-name list. */
const PERSONAL: string[] = [
  'Skarn',
  'Ghorza',
  'Vrak',
  'Ashmaw',
  'Korgul',
  'Ulfrik',
  'Morgh',
  'Ragnvald',
  'Sharn',
  'Duskar',
  'Ymir',
  'Karrash',
  'Old Bess',
  'Hrogar',
  'Velka',
  'Thrun',
  'Grimnir',
  'Sella',
  'Vorash',
  'Khazrak',
  'Munda',
  'Orlok',
  'Tazha',
  'Brannoc',
  'Ishka',
  'Ferrun',
  'Nagra',
  'Sorrel',
  'Vex',
  'Harrow',
  'Malla',
  'Drusk'
];

/** Epithet adjectives — the "Old" of "the Old Fang". */
const EPITHET_ADJ: string[] = [
  'Old',
  'Grey',
  'Black',
  'Pale',
  'Red',
  'White',
  'Silent',
  'Hungry',
  'Broken',
  'Crooked',
  'Dread',
  'Bloody',
  'Long',
  'Cold',
  'Grim',
  'Scarred',
  'Twisted',
  'Sombre',
  'Rimed',
  'Burning',
  'Hollow',
  'Vast',
  'Wicked',
  'Elder'
];

/** Epithet nouns by `species` (the "Fang" of "the Old Fang"); GENERIC backs any unkeyed species. */
const EPITHET_NOUN: Record<string, string[]> = {
  wolf: ['Fang', 'Howl', 'Pelt', 'Winter', 'Hunt', 'Shadow', 'Maw'],
  bear: ['Claw', 'Hide', 'Mountain', 'Maul', 'Sleep', 'Cave', 'Paw'],
  boar: ['Tusk', 'Gouge', 'Bristle', 'Furrow', 'Rage', 'Mire'],
  goblin: ['Throne', 'Skull', 'Knife', 'Warren', 'Ember', 'Grin'],
  orc: ['Tide', 'Iron', 'War', 'Ruin', 'Anvil', 'Wrath'],
  thornwood_spider: ['Weaver', 'Silk', 'Venom', 'Thorn', 'Web', 'Whisper']
};
const GENERIC_NOUN: string[] = ['Terror', 'Doom', 'Scourge', 'Shadow', 'Bane', 'Hunger'];

const pick = <T>(arr: T[]): T => arr[Math.floor(rng.random() * arr.length)];

/** Roll a boss name — "Skarn, the Old Fang". Seeded (core/rng), one roll per spawn. */
export function generateBossName(species?: string): string {
  const nouns = (species && EPITHET_NOUN[species]) || GENERIC_NOUN;
  return `${pick(PERSONAL)}, the ${pick(EPITHET_ADJ)} ${pick(nouns)}`;
}
