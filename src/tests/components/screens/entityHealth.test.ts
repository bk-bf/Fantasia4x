import { describe, it, expect } from 'vitest';
import type { LimbState } from '$lib/game/core/types';
import { wholeLimbsLine } from '$lib/components/screens/entity/entityHealth';

const body = (...ids: string[]): LimbState[] =>
  ids.map((id) => ({ id, health: 100, isMissing: false, bleedRate: 0, parts: [] }));

const AVIAN = body('head', 'torso', 'left_wing', 'right_wing', 'left_leg', 'right_leg', 'tail');
const QUADRUPED = body(
  'head',
  'torso',
  'front_left_leg',
  'front_right_leg',
  'hind_left_leg',
  'hind_right_leg',
  'tail'
);

describe('wholeLimbsLine', () => {
  it('names paired limbs once when both sides are whole', () => {
    expect(wholeLimbsLine(AVIAN, new Set(['torso', 'tail']))).toBe(
      'Head, wings and legs are whole.'
    );
  });

  it('keeps the whole side of a pair whose other side is hurt', () => {
    expect(wholeLimbsLine(AVIAN, new Set(['torso', 'left_wing', 'tail']))).toBe(
      'Head, right wing and legs are whole.'
    );
  });

  it('folds front and hind pairs into one when all four legs are whole', () => {
    expect(wholeLimbsLine(QUADRUPED, new Set(['torso']))).toBe('Head, legs and tail are whole.');
  });

  it('keeps front and hind apart when one leg is hurt', () => {
    expect(wholeLimbsLine(QUADRUPED, new Set(['torso', 'tail', 'hind_left_leg']))).toBe(
      'Head, front legs and hind right leg are whole.'
    );
  });

  it('uses the singular for one limb', () => {
    expect(wholeLimbsLine(body('head', 'torso'), new Set(['torso']))).toBe('Head is whole.');
  });

  it('says nothing when every limb is hurt', () => {
    expect(wholeLimbsLine(body('head'), new Set(['head']))).toBeNull();
  });
});
