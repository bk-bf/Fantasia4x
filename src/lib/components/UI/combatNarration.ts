// combatNarration.ts — turns a raw CombatTurnEntry into an immersive blow-by-blow line for
// the Chronicle's expandable combat breakdown. Picks a vivid verb from the swing's damage
// family (cut / pierce / bludgeon / burn) and its severity tier, so a brawl reads like a
// saga ("Wren shattered the goblin's skull") rather than a debug dump ("kicked → −5").
import type { CombatTurnEntry } from '$lib/game/core/Events';

export type NarrationTier = 'minor' | 'serious' | 'critical' | 'destroyed';

const TIER_ORDER: NarrationTier[] = ['minor', 'serious', 'critical', 'destroyed'];

// Vivid hit verbs, keyed by damage family then escalating tier. The harder the blow, the
// uglier the word.
const HIT_VERBS: Record<string, Record<NarrationTier, string[]>> = {
  cutting: {
    minor: ['grazed', 'nicked', 'cut'],
    serious: ['slashed', 'gashed', 'lacerated'],
    critical: ['carved', 'mangled', 'rent'],
    destroyed: ['cleaved', 'severed', 'hacked apart']
  },
  piercing: {
    minor: ['pricked', 'jabbed', 'nicked'],
    serious: ['stabbed', 'pierced', 'punctured'],
    critical: ['skewered', 'impaled', 'gored'],
    destroyed: ['ran through', 'spitted', 'transfixed']
  },
  blunt: {
    minor: ['bruised', 'battered', 'clubbed'],
    serious: ['smashed', 'pummelled', 'hammered'],
    critical: ['crushed', 'shattered', 'mangled'],
    destroyed: ['pulverised', 'caved in', 'obliterated']
  },
  fire: {
    minor: ['scorched', 'singed', 'blistered'],
    serious: ['seared', 'burned', 'scalded'],
    critical: ['charred', 'roasted', 'cooked'],
    destroyed: ['incinerated', 'immolated', 'reduced to ash']
  }
};

const MISS_VERBS = ['swung at', 'lunged at', 'lashed out at', 'struck at', 'thrust at'];

/** camelCase body-part id → readable name, e.g. rightUpperLeg → "right upper leg". */
export function bodyPartName(id?: string): string {
  if (!id) return '';
  return id
    .replace(/([A-Z])/g, ' $1')
    .toLowerCase()
    .trim();
}

function bumpTier(tier: NarrationTier, by: number): NarrationTier {
  const i = Math.min(TIER_ORDER.length - 1, Math.max(0, TIER_ORDER.indexOf(tier) + by));
  return TIER_ORDER[i];
}

/** Stable pick so wording doesn't flicker between re-renders (seeded by the swing itself). */
function pickBySeed(list: string[], seed: number): string {
  return list[((Math.round(seed) % list.length) + list.length) % list.length];
}

/**
 * Severity tier driving the verb's nastiness — the *injury level dealt* (wound severity),
 * escalated when the blow was a crit OR when it ate a big chunk of the struck part in one
 * hit (so "damage amount" lifts the wording too, not just accrued wound class).
 */
export function narrationTier(t: CombatTurnEntry): NarrationTier {
  let tier: NarrationTier = TIER_ORDER.includes(t.woundSeverity as NarrationTier)
    ? (t.woundSeverity as NarrationTier)
    : 'minor';
  if (t.crit) tier = bumpTier(tier, 1);
  if (t.partMaxHp && (t.damage ?? 0) / t.partMaxHp >= 0.5) tier = bumpTier(tier, 1);
  return tier;
}

export interface SwingNarration {
  attacker: string;
  verb: string;
  /** "the goblin's left leg" on a hit, or just the defender name on a miss. */
  target: string;
  tier: NarrationTier;
  dodged: boolean;
}

/** Compose the narrated swing: who, the vivid verb, and what they struck. */
export function describeSwing(t: CombatTurnEntry): SwingNarration {
  const seed = (t.turn ?? 0) + Math.round(t.damage ?? 0) + (t.bodyPart?.length ?? 0);
  if (!t.hit) {
    return {
      attacker: t.attackerName,
      verb: pickBySeed(MISS_VERBS, seed),
      target: t.defenderName,
      tier: 'minor',
      dodged: true
    };
  }
  const tier = narrationTier(t);
  const family = t.damageType && t.damageType in HIT_VERBS ? t.damageType : 'blunt';
  const part = bodyPartName(t.bodyPart);
  return {
    attacker: t.attackerName,
    verb: pickBySeed(HIT_VERBS[family][tier], seed),
    target: part ? `${t.defenderName}'s ${part}` : t.defenderName,
    tier,
    dodged: false
  };
}
