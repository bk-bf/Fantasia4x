import { describe, it, expect } from 'vitest';
import { isUncareable } from '$lib/game/core/defs/wounds';
import { hasUntendedWound } from '$lib/game/services/jobs/caretake';
import type { Injury, Pawn } from '$lib/game/core/types';

const wound = (over: Partial<Injury>): Injury => ({
  bodyPart: 'leftHand',
  type: 'crush',
  severity: 'destroyed',
  damage: 30,
  bleeding: 0,
  painContribution: 0,
  infected: false,
  ...over
});

const pawnWith = (w: Injury): Pawn =>
  ({
    id: 'p',
    isAlive: true,
    position: { x: 0, y: 0 },
    limbs: [
      {
        id: 'left_arm',
        health: 0,
        isMissing: false,
        bleedRate: 0,
        parts: [{ id: w.bodyPart, health: 0, maxHp: 30, isMissing: true, injuries: [w] }]
      }
    ]
  }) as unknown as Pawn;

describe('destroyed non-bleeding wounds are uncareable', () => {
  it('isUncareable: destroyed + not bleeding = true; destroyed + bleeding = false; permanent = true', () => {
    expect(isUncareable(wound({ bleeding: 0 }))).toBe(true);
    expect(isUncareable(wound({ bleeding: 5 }))).toBe(false);
    expect(isUncareable(wound({ severity: 'serious', bleeding: 0 }))).toBe(false);
    expect(isUncareable(wound({ permanent: true }))).toBe(true);
  });

  it('hasUntendedWound ignores a lost (destroyed, non-bleeding) limb — no infinite tend', () => {
    expect(hasUntendedWound(pawnWith(wound({ bleeding: 0 })), 100)).toBe(false);
    expect(hasUntendedWound(pawnWith(wound({ bleeding: 8 })), 100)).toBe(true);
  });
});
