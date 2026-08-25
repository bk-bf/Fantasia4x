import type { CombatTurnEntry } from '$lib/game/core/defs/events';

export type NarrationTier = 'minor' | 'serious' | 'critical' | 'destroyed';

const TIER_ORDER: NarrationTier[] = ['minor', 'serious', 'critical', 'destroyed'];

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

function pickBySeed(list: string[], seed: number): string {
  return list[((Math.round(seed) % list.length) + list.length) % list.length];
}

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
  target: string;
  tier: NarrationTier;
  dodged: boolean;
}

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
