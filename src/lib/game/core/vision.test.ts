import { describe, it, expect } from 'vitest';
import {
  baseVisionRange,
  lightVisionMultiplier,
  effectiveVisionRange,
  getNightVision
} from './vision';
import type { Pawn, Mob } from './types';

// Shared §G vision: one perception-based range for pawns AND mobs, scaled by tile light and dampened
// by night_vision. baseVisionRange matches the old creature formula, so daytime entity vision is
// unchanged; darkness shortens it; night_vision restores it.

const pawn = (per: number, traits: Array<{ effects: { nightVision?: number } }> = []): Pawn =>
  ({ stats: { perception: per }, racialTraits: traits }) as unknown as Pawn;

describe('shared vision model', () => {
  it('baseVisionRange is the doubled sight formula round(4 + per*1.3)', () => {
    expect(baseVisionRange(10)).toBe(17);
    expect(baseVisionRange(15)).toBe(24);
  });

  it('lightVisionMultiplier: dark shrinks to the floor, day is full, night_vision restores', () => {
    expect(lightVisionMultiplier(1, 0)).toBe(1); // daylight
    expect(lightVisionMultiplier(0.15, 0)).toBeCloseTo(0.35); // pitch dark → floor
    expect(lightVisionMultiplier(0.15, 1)).toBe(1); // full night vision → unaffected
    expect(lightVisionMultiplier(0.15, 0.5)).toBeGreaterThan(0.35); // partial helps
  });

  it('never extends beyond base (bright firelight caps at 1)', () => {
    expect(lightVisionMultiplier(1.6, 0)).toBe(1);
  });

  it('effectiveVisionRange shrinks a pawn in the dark and night_vision saves it', () => {
    const day = effectiveVisionRange(pawn(10), 1);
    const night = effectiveVisionRange(pawn(10), 0.15);
    const nightOwl = effectiveVisionRange(pawn(10, [{ effects: { nightVision: 1 } }]), 0.15);
    expect(night).toBeLessThan(day);
    expect(nightOwl).toBe(day);
  });

  it('getNightVision: pawn sums racial traits (clamped 0–1)', () => {
    expect(getNightVision(pawn(10))).toBe(0);
    expect(getNightVision(pawn(10, [{ effects: { nightVision: 0.4 } }]))).toBeCloseTo(0.4);
    expect(
      getNightVision(pawn(10, [{ effects: { nightVision: 0.8 } }, { effects: { nightVision: 0.5 } }]))
    ).toBe(1); // clamped
  });

  it('pawns and mobs use the SAME range at full light (unified)', () => {
    const p = effectiveVisionRange(pawn(12), 1);
    const m = effectiveVisionRange({ creatureId: 'nope', stats: { perception: 12 } } as unknown as Mob, 1);
    expect(p).toBe(m);
    expect(p).toBe(baseVisionRange(12));
  });
});
