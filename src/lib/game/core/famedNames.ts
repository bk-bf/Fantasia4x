// PRODUCTION-CHAIN-III §I — Famed Items: procedural identity + roll math.
//
// A Famed item is a named legend sitting ABOVE the §Q quality scale (Crude→…→Legendary). This
// module owns the *pure, deterministic* core of that feature — given a `rand: () => number` it
// rolls whether an item becomes Famed, generates its name + short history, picks its enchantments,
// and gives the ×2–5 stat-explosion multiplier. It allocates nothing on the hot path and is fully
// seed-testable (see famedNames.test.ts).
//
// WIRING (deferred): the craft-completion stamp (jobs/craft.ts), the per-hit stat-explosion read in
// Combat/scaleWeaponQuality, the item-card/getItemDisplayName override, and the boss-drop hook are a
// scoped follow-up — this is the tested foundation they build on.

/** The condition pool a Famed item draws its 1–3 enchantments from — the §M passive-buff ids plus
 *  the on-hit elemental/debuff ids (both already ride `grantsConditions` / the on-hit timer). */
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

const SMITHS = ['Hálfdan', 'Mira the Grey', 'old Bröccan', 'the Pale Smith', 'Yara Ironhand', 'a forgotten hand'];
const FOES = ['the Bone Tyrant', 'a mountain wyrm', 'the Reaver-King', 'the Owlbear of the Fen', 'three hundred orcs', 'the Sorrow-Wraith'];
const PLACES = ['Blackmere', 'the Sundered Vale', 'Karrowfell', 'the Drowned Hall', 'Hollow Crag', 'the Ashen Reach'];
const AGES = ['an elder age', 'the long winter', 'the first founding', 'a year of war', 'the time before names'];

const pick = <T>(arr: readonly T[], rand: () => number): T => arr[Math.floor(rand() * arr.length) % arr.length];

/**
 * Whether a qualifying equipment craft rolls Famed — the extreme tail ABOVE Legendary. Vanishingly
 * small and skill/station-scaled: a master (high `craftingQualityAxis`) at an arcane/infused station
 * (`arcaneStation`) has a tiny chance; a journeyman ≈ 0. Returns false below a skill floor so Famed
 * is never targetable, only a once-in-a-colony jackpot. Mirrors the Legendary long-tail, one notch
 * further out.
 */
export function rollFamed(
  craftingQualityAxis: number,
  arcaneStation: boolean,
  rand: () => number
): boolean {
  // Skill floor: only genuine masters can hit the tail at all.
  if (craftingQualityAxis < 1.7) return false;
  const skill = craftingQualityAxis - 1.7; // 0 at the floor
  const base = 0.0008 + skill * 0.004; // ~0.08%→ up at the very top
  const chance = base * (arcaneStation ? 2.5 : 1);
  return rand() < chance;
}

/** The ×2–5 stat-explosion multiplier layered OVER the item's §Q tier multiplier. */
export function rollFamedStatMult(rand: () => number): number {
  return 2 + rand() * 3;
}

/** 1–3 distinct enchant condition ids drawn from {@link FAMED_ENCHANT_POOL} (or a passed pool). */
export function rollFamedEnchants(rand: () => number, pool: readonly string[] = FAMED_ENCHANT_POOL): string[] {
  const count = 1 + Math.floor(rand() * 3); // 1–3
  const chosen: string[] = [];
  const avail = [...pool];
  for (let i = 0; i < count && avail.length > 0; i++) {
    const idx = Math.floor(rand() * avail.length) % avail.length;
    chosen.push(avail.splice(idx, 1)[0]);
  }
  return chosen;
}

/** A generated legend name, e.g. "Bittermourn, the Widow's Answer". */
export function generateFamedName(rand: () => number): string {
  const root = pick(NAME_ROOTS, rand);
  const suffix = pick(NAME_SUFFIXES, rand);
  const epithet = pick(EPITHETS, rand);
  return `${root}${suffix}, ${epithet}`;
}

/** A short generated history (forged-by / slew / lost-at), 2–3 lines joined into one string. */
export function generateFamedHistory(rand: () => number): string {
  const lines = [
    `Forged by ${pick(SMITHS, rand)} in ${pick(AGES, rand)}.`,
    `It slew ${pick(FOES, rand)} at ${pick(PLACES, rand)}.`
  ];
  if (rand() < 0.6) lines.push(`Lost for an age beneath ${pick(PLACES, rand)}.`);
  return lines.join(' ');
}

/** Bundle the full procedural identity of a newly-Famed item in one call (name/history/mult/enchants). */
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
