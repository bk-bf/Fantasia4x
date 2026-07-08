// Vague, non-numeric ability descriptions for a pawn (migrant-wave modal). Thresholds come from
// core/Race.ts's `statBucket` — single source.

import type { Pawn } from '$lib/game/core/types';
import { statBucket } from '$lib/game/core/Race';

const STATS = [
  'strength',
  'dexterity',
  'constitution',
  'intelligence',
  'perception',
  'charisma'
] as const;
type StatKey = (typeof STATS)[number];

/** Flattering phrase for a notably-high stat (`strong` vs the stronger `mighty` wording). */
const POSITIVE: Record<StatKey, { strong: string; mighty: string }> = {
  strength: { strong: 'strong-armed', mighty: 'immensely powerful' },
  dexterity: { strong: 'deft-handed', mighty: 'remarkably nimble' },
  constitution: { strong: 'hardy', mighty: 'tireless and tough' },
  intelligence: { strong: 'sharp-witted', mighty: 'brilliant of mind' },
  perception: { strong: 'keen-eyed', mighty: 'preternaturally observant' },
  charisma: { strong: 'personable', mighty: 'magnetic in company' }
};

/** Caveat phrase for a notably-low (`frail`) stat. */
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

/** Up to three standout strengths (highest first) and any glaring frailties. Never exposes numbers. */
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
