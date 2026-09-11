import { describe, it, expect } from 'vitest';
import { computeAptitudeView } from '$lib/components/util/statView';
import { APTITUDE_IDS, APTITUDE_MIN, APTITUDE_MAX } from '$lib/game/core/rules/body/aptitudes';
import type { Pawn } from '$lib/game/core/types';

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
    expect(v.id).toBe('hit_chance');
    expect(v.name).toBe('accuracy');
    expect(v.value).toBe(1.12);
    expect(v.unit).toBe('×');
    expect(v.base).toBe(1);
    expect(v.formula).toBe('triangular roll at generation');
    expect(v.description).toBe('blurb');
    expect(v.trend.glyph).toBe('▲');
    expect(v.trend.color).toBe('#9ccc65');
    expect(v.vars.find((x) => x.name === 'rolled')?.value).toBe('1.120');
    expect(v.vars.find((x) => x.name === 'band')?.value).toBe(
      `${APTITUDE_MIN.toFixed(2)}–${APTITUDE_MAX.toFixed(2)}`
    );
  });

  it('names body mass only for the aptitudes the size tilt actually touches, and picks the tilted formula', () => {
    const tilted = computeAptitudeView('dodge', pawn({ dodge: 0.9 }), 'evasion', '', true);
    expect(tilted.formula).toBe('triangular roll, tilted by body mass');
    expect(tilted.vars.map((x) => x.name)).toContain('body mass');
    expect(tilted.vars.find((x) => x.name === 'body mass')?.value).toBe('82 kg');
    const plain = computeAptitudeView('hit_chance', pawn({ hit_chance: 1 }), 'accuracy', '', false);
    expect(plain.vars.map((x) => x.name)).not.toContain('body mass');
  });

  it('defaults body mass to 70kg for a pawn with no recorded weight', () => {
    const noWeight = { aptitudes: { dodge: 0.9 }, physicalTraits: {} } as unknown as Pawn;
    const v = computeAptitudeView('dodge', noWeight, 'evasion', '', true);
    expect(v.vars.find((x) => x.name === 'body mass')?.value).toBe('70 kg');
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

  it('colors the trend by which band the roll lands in, above and below average', () => {
    expect(computeAptitudeView('dodge', pawn({ dodge: 1.14 }), 'e', '', false).trend.color).toBe(
      '#9ccc65'
    );
    expect(computeAptitudeView('dodge', pawn({ dodge: 0.86 }), 'e', '', false).trend.color).toBe(
      '#e0a64a'
    );
    expect(computeAptitudeView('dodge', pawn({ dodge: 1 }), 'e', '', false).trend.color).toBe(
      'var(--text-dim)'
    );
    expect(computeAptitudeView('dodge', pawn({ dodge: 1.5 }), 'e', '', false).trend.color).toBe(
      '#43a047'
    );
    expect(computeAptitudeView('dodge', pawn({ dodge: 2.0 }), 'e', '', false).trend.color).toBe(
      '#2196f3'
    );
    expect(computeAptitudeView('dodge', pawn({ dodge: 0.5 }), 'e', '', false).trend.color).toBe(
      '#e04f4f'
    );
  });

  it('reads 1.00 for a pawn with no roll — an old save, not an error', () => {
    for (const id of APTITUDE_IDS) {
      const v = computeAptitudeView(id, pawn(undefined), id, '', false);
      expect(v.value, `${id} should default to average`).toBe(1);
    }
  });
});
