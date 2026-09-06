import type { Pawn, StatKey } from '$lib/game/core/types';
import { CORE_STAT_KEYS } from '$lib/game/core/types';
import { statBucket } from '$lib/game/core/gen/culture';

const STATS = CORE_STAT_KEYS;

const POSITIVE: Record<StatKey, { strong: string; mighty: string }> = {
  strength: { strong: 'strong-armed', mighty: 'immensely powerful' },
  dexterity: { strong: 'deft-handed', mighty: 'remarkably nimble' },
  constitution: { strong: 'hardy', mighty: 'tireless and tough' },
  intelligence: { strong: 'sharp-witted', mighty: 'brilliant of mind' },
  perception: { strong: 'keen-eyed', mighty: 'preternaturally observant' },
  charisma: { strong: 'personable', mighty: 'magnetic in company' }
};

const FRAIL: Record<StatKey, string> = {
  strength: 'weak-limbed',
  dexterity: 'clumsy',
  constitution: 'sickly',
  intelligence: 'slow-witted',
  perception: 'oblivious to their surroundings',
  charisma: 'graceless with others'
};

export interface PawnBlurb {
  strengths: string[];
  weaknesses: string[];
}

export function describePawnAbilities(pawn: Pawn): PawnBlurb {
  const stats = pawn.stats;
  const ranked = STATS.map((k) => {
    const v = stats?.[k] ?? 10;
    return { k, v, b: statBucket(v) };
  }).sort((a, b) => b.v - a.v);

  const strengths = ranked
    .filter((s) => s.b === 'strong' || s.b === 'mighty')
    .slice(0, 3)
    .map((s) => POSITIVE[s.k][s.b as 'strong' | 'mighty']);

  const weaknesses = ranked
    .filter((s) => s.b === 'frail')
    .slice(0, 2)
    .map((s) => FRAIL[s.k]);

  return { strengths, weaknesses };
}
