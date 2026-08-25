export const FAMED_ENCHANT_POOL: readonly string[] = [
  'might',
  'vigor',
  'grace',
  'fortitude',
  'envenomed',
  'disoriented',
  'ensnared',
  'bloodletting'
];

const NAME_ROOTS = [
  'Bitter',
  'Grim',
  'Dawn',
  'Doom',
  'Sorrow',
  'Iron',
  'Ash',
  'Storm',
  'Blood',
  'Frost',
  'Wyrm',
  'Star',
  'Night',
  'Ember',
  'Gloom',
  'Thorn'
];

const NAME_SUFFIXES = [
  'mourn',
  'bane',
  'fang',
  'song',
  'rend',
  'guard',
  'reaver',
  'light',
  'fall',
  'wail',
  'bite',
  'ward'
];

const EPITHETS = [
  "the Widow's Answer",
  'Kingsfall',
  'the Last Word',
  'Oathkeeper',
  'the Pale Edge',
  "Sorrow's End",
  'the Dawnbreaker',
  'Wolfsbane',
  'the Quiet Death',
  'Ruin of Kings',
  'the Long Vigil',
  "Winter's Due"
];

const SMITHS = [
  'Hálfdan',
  'Mira the Grey',
  'old Bröccan',
  'the Pale Smith',
  'Yara Ironhand',
  'a forgotten hand'
];
const FOES = [
  'the Bone Tyrant',
  'a mountain wyrm',
  'the Reaver-King',
  'the Owlbear of the Fen',
  'three hundred orcs',
  'the Sorrow-Wraith'
];
const PLACES = [
  'Blackmere',
  'the Sundered Vale',
  'Karrowfell',
  'the Drowned Hall',
  'Hollow Crag',
  'the Ashen Reach'
];
const AGES = [
  'an elder age',
  'the long winter',
  'the first founding',
  'a year of war',
  'the time before names'
];

const pick = <T>(arr: readonly T[], rand: () => number): T =>
  arr[Math.floor(rand() * arr.length) % arr.length];

export function rollFamed(
  craftingQualityAxis: number,
  arcaneStation: boolean,
  rand: () => number
): boolean {
  if (craftingQualityAxis < 1.7) return false;
  const skill = craftingQualityAxis - 1.7;
  const base = 0.0008 + skill * 0.004;
  const chance = base * (arcaneStation ? 2.5 : 1);
  return rand() < chance;
}

export function rollFamedStatMult(rand: () => number): number {
  return 2 + rand() * 3;
}

export function rollFamedEnchants(
  rand: () => number,
  pool: readonly string[] = FAMED_ENCHANT_POOL
): string[] {
  const count = 1 + Math.floor(rand() * 3);
  const chosen: string[] = [];
  const avail = [...pool];
  for (let i = 0; i < count && avail.length > 0; i++) {
    const idx = Math.floor(rand() * avail.length) % avail.length;
    chosen.push(avail.splice(idx, 1)[0]);
  }
  return chosen;
}

export function generateFamedName(rand: () => number): string {
  const root = pick(NAME_ROOTS, rand);
  const suffix = pick(NAME_SUFFIXES, rand);
  const epithet = pick(EPITHETS, rand);
  return `${root}${suffix}, ${epithet}`;
}

export function generateFamedHistory(rand: () => number): string {
  const lines = [
    `Forged by ${pick(SMITHS, rand)} in ${pick(AGES, rand)}.`,
    `It slew ${pick(FOES, rand)} at ${pick(PLACES, rand)}.`
  ];
  if (rand() < 0.6) lines.push(`Lost for an age beneath ${pick(PLACES, rand)}.`);
  return lines.join(' ');
}

export function rollFamedIdentity(rand: () => number): {
  famedName: string;
  famedHistory: string;
  famedStatMult: number;
  famedEnchants: string[];
} {
  return {
    famedName: generateFamedName(rand),
    famedHistory: generateFamedHistory(rand),
    famedStatMult: rollFamedStatMult(rand),
    famedEnchants: rollFamedEnchants(rand)
  };
}
