import { describe, it, expect } from 'vitest';
import { computeAptitudeView } from '$lib/components/util/statView';
import { APTITUDE_IDS } from '$lib/game/core/aptitudes';
import type { Pawn } from '$lib/game/core/types';

/**
 * The rolled aptitudes render through the SAME attributes cell and `StatTooltip` as every other stat,
 * which means `computeAptitudeView` has to return a complete `StatView` — a bespoke widget beside the
 * table was the thing this replaced. Every field the tooltip reads is checked here, because a missing
 * one degrades silently to a blank line rather than an error.
 */
const pawn = (apt?: Record<string, number>) =>
  ({
    aptitudes: apt,
    physicalTraits: { weight: 82, height: 175 }
  }) as unknown as Pawn;

describe('aptitude stat view', () => {
  it('produces every field StatTooltip renders', () => {
    const v = computeAptitudeView(
      'hit_chance',
      pawn({ hit_chance: 1.12 }),
      'accuracy',
      'blurb',
      false
    );
    expect(v.name).toBe('accuracy'); // a label, never the raw id
    expect(v.value).toBe(1.12);
    expect(v.unit).toBe('×');
    expect(v.base).toBe(1); // the band is fixed, so "average" is exactly 1.00
    expect(v.formula).toBeTruthy();
    expect(v.description).toBe('blurb');
    expect(v.trend.glyph).toBeTruthy();
    expect(v.trend.color).toBeTruthy();
    // The roll and the band it came from — the "where" line of the tooltip.
    expect(v.vars.map((x) => x.name)).toContain('rolled');
    expect(v.vars.map((x) => x.name)).toContain('band');
  });

  it('names body mass only for the aptitudes the size tilt actually touches', () => {
    const tilted = computeAptitudeView('dodge', pawn({ dodge: 0.9 }), 'evasion', '', true);
    expect(tilted.vars.map((x) => x.name)).toContain('body mass');
    expect(tilted.vars.find((x) => x.name === 'body mass')?.value).toContain('82');
    const plain = computeAptitudeView('hit_chance', pawn({ hit_chance: 1 }), 'accuracy', '', false);
    expect(plain.vars.map((x) => x.name)).not.toContain('body mass');
  });

  it('points the trend arrow by whether the roll beat average, and is neutral at exactly average', () => {
    expect(computeAptitudeView('dodge', pawn({ dodge: 1.14 }), 'e', '', false).trend.glyph).toBe(
      '▲'
    );
    expect(computeAptitudeView('dodge', pawn({ dodge: 0.86 }), 'e', '', false).trend.glyph).toBe(
      '▼'
    );
    expect(computeAptitudeView('dodge', pawn({ dodge: 1 }), 'e', '', false).trend.glyph).toBe('–');
  });

  it('reads 1.00 for a pawn with no roll — an old save, not an error', () => {
    for (const id of APTITUDE_IDS) {
      const v = computeAptitudeView(id, pawn(undefined), id, '', false);
      expect(v.value, `${id} should default to average`).toBe(1);
    }
  });
});
