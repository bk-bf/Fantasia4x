import { rng } from '../util/rng';

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

export function generateBossName(species?: string): string {
  const nouns = (species && EPITHET_NOUN[species]) || GENERIC_NOUN;
  return `${pick(PERSONAL)}, the ${pick(EPITHET_ADJ)} ${pick(nouns)}`;
}
