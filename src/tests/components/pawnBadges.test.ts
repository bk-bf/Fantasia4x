import { describe, expect, it } from 'vitest';
import type { ConditionView } from '$lib/components/util/conditionInfo';
import type { Trait } from '$lib/game/core/types';
import {
  conditionBadge,
  conditionKind,
  modifierLean,
  traitBadge
} from '$lib/components/pawn/badges';

const view = (id: string, modifiers: ConditionView['modifiers'], lifeThreatening = false) =>
  ({
    id,
    name: id,
    color: '#fff',
    description: '',
    kind: 'transient',
    sources: [],
    effects: [],
    modifiers,
    lifeThreatening
  }) as ConditionView;

describe('condition badges', () => {
  it('reads lower rates and pain as relief, and lower multipliers as harm', () => {
    expect(modifierLean({ hungerRate: 0.94, workEfficiency: 1.05 })).toBe(2);
    expect(modifierLean({ pain: 0.85, dodge: 0.97 })).toBe(0);
    expect(modifierLean({ melee_damage: -0.1, moveSpeed: 0.9 })).toBe(-2);
  });

  it('sorts conditions into the mockup kinds', () => {
    expect(conditionKind(view('well_fed', { hungerRate: 0.94, workEfficiency: 1.05 }))).toBe(
      'good'
    );
    expect(conditionKind(view('wet', { moveSpeed: 0.9 }))).toBe('cold');
    expect(conditionKind(view('tired', { moveSpeed: 0.5 }))).toBe('warn');
    expect(conditionKind(view('bleeding', {}, true))).toBe('neg');
  });

  it('gives cold and feeding conditions their own glyphs', () => {
    expect(conditionBadge(view('hypothermia', { moveSpeed: 0.9 }))).toEqual({
      glyph: 'snow',
      kind: 'cold'
    });
    expect(conditionBadge(view('well_fed', { workEfficiency: 1.05 })).glyph).toBe('bowl');
  });
});

describe('trait badges', () => {
  it('marks a negative trait and picks a glyph by kind', () => {
    expect(traitBadge({ name: 'Frail', description: '', rarity: 'negative' } as Trait).kind).toBe(
      'neg'
    );
    expect(traitBadge({ name: 'Sharp', description: '', kind: 'attribute' } as Trait)).toEqual({
      glyph: 'eye',
      kind: 'trait'
    });
  });
});
