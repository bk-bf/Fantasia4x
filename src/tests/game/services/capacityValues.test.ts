import { describe, it, expect } from 'vitest';
import { pawnStatService } from '$lib/game/services/PawnStatService';
import { createBodyPlanLimbs, DEFAULT_PLAN } from '$lib/game/core/defs/bodyParts';
import type { BodyPartState, Injury, LimbState, Mob } from '$lib/game/core/types';

let nextId = 0;

function body(
  edit: (part: (id: string) => BodyPartState, limb: (id: string) => LimbState) => void = () => {},
  extra: Partial<Mob> = {}
): Mob {
  const limbs = createBodyPlanLimbs(DEFAULT_PLAN, 1);
  const limb = (id: string) => limbs.find((l) => l.id === id)!;
  const part = (id: string) => limbs.flatMap((l) => l.parts ?? []).find((p) => p.id === id)!;
  edit(part, limb);
  return {
    id: `capacity-body-${nextId++}`,
    limbs,
    injuries: [],
    conditions: [],
    stats: {
      strength: 10,
      dexterity: 10,
      constitution: 10,
      intelligence: 10,
      perception: 10,
      charisma: 10
    },
    bloodVolume: 100,
    maxBloodVolume: 100,
    ...extra
  } as unknown as Mob;
}

const caps = (m: Mob) => pawnStatService.computeCapacities(m, 1);

describe('capacities read each organ group once, blending its worst and average part', () => {
  it('a half-crushed lung weighs on breathing and, through the lung average, on consciousness', () => {
    const c = caps(body((p) => (p('leftLung').health = 15)));
    expect(c.breathing).toBeCloseTo(0.5 * 0.5 + 0.75 * 0.5 + 0.05, 12);
    expect(c.consciousness).toBeCloseTo((0.6 + 0.15 + 0.75 * 0.1 + 0.1 + 1.15 * 0.05) * 1, 12);
  });

  it('a lost eye halves the eye average and zeroes its worst, for sight', () => {
    const c = caps(body((p) => (p('leftEye').isMissing = true)));
    expect(c.sight).toBeCloseTo(0 * 0.4 + 0.5 * 0.6 + 0.05, 12);
  });

  it('a dead kidney drags blood filtration to its blended value', () => {
    expect(caps(body((p) => (p('leftKidney').health = 0))).blood_filtration).toBeCloseTo(0.3, 12);
  });

  it('a half-ruined heart lowers blood pumping and consciousness by its own weights', () => {
    const c = caps(body((p) => (p('heart').health = 10)));
    expect(c.blood_pumping).toBeCloseTo(0.5 * 0.9 + 0.1, 12);
    expect(c.consciousness).toBeCloseTo(0.6 + 0.5 * 0.15 + 0.1 + 0.1 + 1.15 * 0.05, 12);
  });

  it('digestion takes its stomach and liver shares from the worst part of each', () => {
    const c = caps(
      body((p) => {
        p('stomach').health = 5;
        Object.assign(p('liver'), { isMissing: true, health: 0 });
      })
    );
    expect(c.digestion).toBeCloseTo(0.25 * 0.6 + 0 * 0.4, 12);
  });

  it('a broken jaw silences talk and a lost ear dulls hearing', () => {
    const c = caps(
      body((p) => {
        p('jaw').health = 0;
        p('leftEar').isMissing = true;
      })
    );
    expect(c.talking).toBeCloseTo(0.1, 12);
    expect(c.hearing).toBeCloseTo(0 * 0.3 + 0.5 * 0.7 + 0.15, 12);
  });

  it('a broken upper arm bone cuts that arm to the broken-bone share of manipulation', () => {
    const c = caps(body((p) => (p('leftHumerus').boneBroken = true)));
    expect(c.manipulation).toBeCloseTo(0.4 * 0.3 + 0.7 * 0.7, 12);
  });

  it('wound pain, limb damage and bleeding add up once into pain and through it into consciousness', () => {
    const injuries = [{ painContribution: 30 } as Injury];
    const c = caps(
      body(
        (_p, l) => {
          l('left_leg').health = 80;
          l('torso').bleedRate = 4;
        },
        { injuries }
      )
    );
    const pain = (30 + 20 * 0.01 + 4 * 0.5) / 100;
    expect(c.pain).toBeCloseTo(pain, 12);
    expect(c.consciousness).toBeCloseTo((0.95 + 1.15 * 0.05) * (1 - (pain - 0.1)), 12);
  });

  it('a body with no organ parts at all keeps every organ capacity whole', () => {
    const m = body();
    m.limbs = [{ id: 'body', health: 100, bleedRate: 0, parts: [] } as unknown as LimbState];
    const c = caps(m);
    expect(c.sight).toBeCloseTo(1.05, 12);
    expect(c.breathing).toBeCloseTo(1.05, 12);
    expect(c.blood_filtration).toBeCloseTo(1, 12);
    expect(c.blood_pumping).toBeCloseTo(1, 12);
    expect(c.digestion).toBeCloseTo(1, 12);
  });
});
