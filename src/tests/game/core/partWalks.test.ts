import { describe, it, expect } from 'vitest';
import { CARE_CONFIG, woundInfectionPressure } from '$lib/game/core/defs/wounds';
import { createBodyPlanLimbs, DEFAULT_PLAN, hasLivingPart } from '$lib/game/core/defs/bodyParts';
import type { Injury, LimbState } from '$lib/game/core/types';

const TURN = CARE_CONFIG.infectionIncubationTicks * 2;
const OLD = TURN - CARE_CONFIG.infectionIncubationTicks;

function wound(edit: Partial<Injury> = {}): Injury {
  return {
    bodyPart: 'leftHand',
    type: 'cut',
    severity: 'serious',
    damage: 20,
    bleeding: 0,
    painContribution: 5,
    infected: false,
    inflictedAt: OLD,
    ...edit
  } as Injury;
}

function limbsWith(...wounds: Injury[]): LimbState[] {
  const limbs = createBodyPlanLimbs(DEFAULT_PLAN, 1);
  const parts = limbs.flatMap((l) => l.parts ?? []);
  wounds.forEach((w, i) => parts[i].injuries.push(w));
  return limbs;
}

describe('infection pressure walks every wound of every part', () => {
  it('an untended open wound past incubation adds one wound of risk', () => {
    expect(woundInfectionPressure(limbsWith(wound()), TURN)).toBe(
      CARE_CONFIG.infectionRiskPerWound
    );
  });

  it('a minor wound that has stopped bleeding adds nothing', () => {
    expect(woundInfectionPressure(limbsWith(wound({ severity: 'minor' })), TURN)).toBe(0);
  });

  it('a minor wound that still bleeds counts as open', () => {
    expect(woundInfectionPressure(limbsWith(wound({ severity: 'minor', bleeding: 1 })), TURN)).toBe(
      CARE_CONFIG.infectionRiskPerWound
    );
  });

  it('a wound younger than the incubation adds nothing', () => {
    expect(woundInfectionPressure(limbsWith(wound({ inflictedAt: TURN - 1 })), TURN)).toBe(0);
  });

  it('a freshly tended wound adds nothing', () => {
    expect(
      woundInfectionPressure(limbsWith(wound({ treatedAt: TURN - 1, treatmentQuality: 1 })), TURN)
    ).toBe(0);
  });

  it('a permanent wound adds nothing', () => {
    expect(woundInfectionPressure(limbsWith(wound({ permanent: true })), TURN)).toBe(0);
  });

  it('wounds spread over several parts add up to the cap and no further', () => {
    const many = limbsWith(wound(), wound(), wound(), wound(), wound());
    expect(woundInfectionPressure(many, TURN)).toBe(CARE_CONFIG.infectionRiskMax);
  });

  it('a body with no wounds has no pressure', () => {
    expect(woundInfectionPressure(limbsWith(), TURN)).toBe(0);
  });
});

describe('a living host part is found on any limb that is not missing', () => {
  const firstPart = (limbs: LimbState[]) => limbs.find((l) => l.parts?.length)!.parts![0];

  it('finds a part that is present', () => {
    const limbs = limbsWith();
    expect(hasLivingPart(limbs, [firstPart(limbs).id])).toBe(true);
  });

  it('skips a missing part', () => {
    const limbs = limbsWith();
    const part = firstPart(limbs);
    part.isMissing = true;
    expect(hasLivingPart(limbs, [part.id])).toBe(false);
  });

  it('skips every part of a missing limb', () => {
    const limbs = limbsWith();
    const limb = limbs.find((l) => l.parts?.length)!;
    limb.isMissing = true;
    expect(hasLivingPart(limbs, [limb.parts![0].id])).toBe(false);
  });

  it('a body with no limbs has no host part', () => {
    expect(hasLivingPart(undefined, ['tail'])).toBe(false);
  });
});
