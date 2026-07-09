import { describe, it, expect } from 'vitest';
import {
  baseVisionRange,
  lightVisionMultiplier,
  effectiveVisionRange,
  getNightVision,
  isWitnessedByColony
} from './vision';
import type { Pawn, Mob } from './types';

// Shared §G vision: one perception-based range for pawns AND mobs, scaled by tile light and dampened
// by night_vision. baseVisionRange matches the old creature formula, so daytime entity vision is
// unchanged; darkness shortens it; night_vision restores it.

const pawn = (per: number, traits: Array<{ effects: { nightVision?: number } }> = []): Pawn =>
  ({ stats: { perception: per }, traits: traits }) as unknown as Pawn;

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

  it('getNightVision: pawn sums cultural traits (clamped 0–1)', () => {
    expect(getNightVision(pawn(10))).toBe(0);
    expect(getNightVision(pawn(10, [{ effects: { nightVision: 0.4 } }]))).toBeCloseTo(0.4);
    expect(
      getNightVision(pawn(10, [{ effects: { nightVision: 0.8 } }, { effects: { nightVision: 0.5 } }]))
    ).toBe(1); // clamped
  });

  it('Spider Eyes: grafted arachnid eyes grant night vision from the PART, self-gating on damage', () => {
    // spider-eyes-greater grafts 4 eyes @ 0.15 each → 0.6 night vision, sourced from the parts (no
    // trait effect). Losing eyes removes the sight; all eyes gone → 0.
    const eye = (id: string, hp = 4) => ({ id, health: hp, maxHp: 4, isMissing: false, injuries: [] });
    const spiderEyed = (parts: ReturnType<typeof eye>[]) =>
      ({ stats: { perception: 10 }, traits: [], limbs: [{ id: 'extra_eyes', parts }] }) as unknown as Pawn;
    const fourEyes = ['anteriorMedianLeftEye', 'anteriorMedianRightEye', 'anteriorLateralLeftEye', 'anteriorLateralRightEye'];
    expect(getNightVision(spiderEyed(fourEyes.map((id) => eye(id))))).toBeCloseTo(0.6);
    // Two eyes destroyed → only the two living ones count (0.3).
    const halfBlind = fourEyes.map((id, i) => (i < 2 ? { ...eye(id), isMissing: true } : eye(id)));
    expect(getNightVision(spiderEyed(halfBlind))).toBeCloseTo(0.3);
    // All eyes gone → blind in the dark.
    expect(getNightVision(spiderEyed(fourEyes.map((id) => ({ ...eye(id), isMissing: true }))))).toBe(0);
  });

  it('pawns and mobs use the SAME range at full light (unified)', () => {
    const p = effectiveVisionRange(pawn(12), 1);
    const m = effectiveVisionRange({ creatureId: 'nope', stats: { perception: 12 } } as unknown as Mob, 1);
    expect(p).toBe(m);
    expect(p).toBe(baseVisionRange(12));
  });
});

// Chronicle scoping: only log combat/deaths a colonist could see (range only — walls don't gate it).
const atPawn = (x: number, y: number, over: Partial<Pawn> = {}): Pawn =>
  ({ id: `p${x}_${y}`, isAlive: true, position: { x, y }, stats: { perception: 10 }, ...over }) as Pawn;

describe('isWitnessedByColony', () => {
  const DAY = 1.0;
  const range = effectiveVisionRange(atPawn(0, 0), DAY); // per 10 → 17 tiles in daylight

  it('an event within a pawn’s sight range is witnessed; one beyond it is not', () => {
    expect(isWitnessedByColony([atPawn(0, 0)], range, 0, DAY)).toBe(true); // at the edge
    expect(isWitnessedByColony([atPawn(0, 0)], range + 1, 0, DAY)).toBe(false); // one tile past
  });

  it('uses Chebyshev (diagonal counts as one); ANY pawn seeing it is enough', () => {
    expect(isWitnessedByColony([atPawn(0, 0)], range, range, DAY)).toBe(true); // diagonal edge
    expect(isWitnessedByColony([atPawn(0, 0), atPawn(99, 99)], 99, 99, DAY)).toBe(true);
  });

  it('ignores dead / position-less pawns, and an empty or undefined colony witnesses nothing', () => {
    expect(isWitnessedByColony([atPawn(5, 5, { isAlive: false })], 5, 5, DAY)).toBe(false);
    expect(isWitnessedByColony([atPawn(5, 5, { position: undefined })], 5, 5, DAY)).toBe(false);
    expect(isWitnessedByColony([], 5, 5, DAY)).toBe(false);
    expect(isWitnessedByColony(undefined, 5, 5, DAY)).toBe(false);
  });

  it('darkness shrinks the witnessed radius', () => {
    const far = Math.round(range * 0.7); // inside daytime range
    expect(isWitnessedByColony([atPawn(0, 0)], far, 0, DAY)).toBe(true);
    expect(isWitnessedByColony([atPawn(0, 0)], far, 0, 0.0)).toBe(false); // same tile, pitch dark
  });
});
