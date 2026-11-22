import { describe, it, expect } from 'vitest';
import { recomputeWound, healLimbsInPlace, healLimbs } from '$lib/game/core/defs/wounds';
import {
  boneBreakBudget,
  createBodyPlanLimbs,
  PART_DEF_MAP,
  skeletonPartOf
} from '$lib/game/core/defs/bodyParts';
import { combatService } from '$lib/game/systems/Combat';
import { stepHunger } from '$lib/game/services/entity/entityLifecycle';
import { makeMob } from '$lib/game/services/entity/entitySpawning';
import { getCreatureById } from '$lib/game/core/defs/creatures';
import type { BodyPartState, GameState, Injury, LimbState } from '$lib/game/core/types';

function bodyWith(...wounds: Injury[]): LimbState[] {
  const limbs = createBodyPlanLimbs('humanoid');
  for (const w of wounds) {
    const part = limbs.flatMap((l) => l.parts ?? []).find((p) => p.id === w.bodyPart)!;
    part.injuries.push(w);
    part.health = part.maxHp - w.damage;
  }
  for (const l of limbs)
    l.bleedRate = (l.parts ?? []).reduce(
      (s, p) => s + p.injuries.reduce((a, w) => a + w.bleeding, 0),
      0
    );
  return limbs;
}

const partOf = (limbs: LimbState[], id: string): BodyPartState =>
  limbs.flatMap((l) => l.parts ?? []).find((p) => p.id === id)!;

const rolledUp = (limb: LimbState) => {
  const parts = limb.parts ?? [];
  const max = parts.reduce((s, p) => s + p.maxHp, 0);
  const hp = parts.reduce((s, p) => s + p.health, 0);
  return Math.round((hp / max) * 100);
};

const cut = (part: string, dmg: number): Injury =>
  recomputeWound(part as Injury['bodyPart'], 'cut', dmg, undefined, 0);

describe('recomputeWound bleed and pain', () => {
  it('a serious chest cut bleeds bleedRatio × 32 × bleedMod × frac', () => {
    const w = recomputeWound('chest', 'cut', 40, undefined, 0);
    expect(w.severity).toBe('serious');
    expect(w.bleeding).toBeCloseTo(0.12 * 32 * 1 * 0.5, 2);
  });

  it('a severed stump bleeds at the 2.5× stump rate', () => {
    const w = recomputeWound('chest', 'cut', 80, undefined, 0);
    expect(w.severity).toBe('destroyed');
    expect(w.bleeding).toBeCloseTo(0.12 * 32 * 2.5, 2);
  });

  it('a body twice the size bleeds twice as much from the same fraction', () => {
    const small = recomputeWound('chest', 'cut', 40, undefined, 0, 80);
    const big = recomputeWound('chest', 'cut', 80, undefined, 0, 160);
    expect(big.bleeding).toBeCloseTo(small.bleeding * 2, 2);
  });

  it('a wound on a vital organ hurts twice as much per fraction', () => {
    const heart = recomputeWound('heart', 'cut', 10, undefined, 0);
    const arm = recomputeWound('leftUpperArm', 'cut', 22.5, undefined, 0);
    expect(heart.painContribution / 20).toBeCloseTo((2 * arm.painContribution) / 45, 1);
  });

  it('a fracture on a non-skeleton part is measured against the bone budget', () => {
    expect(recomputeWound('leftUpperArm', 'fracture', 0.55 * 45, undefined, 0).severity).toBe(
      'destroyed'
    );
  });
});

describe('healLimbsInPlace (mob healing)', () => {
  it('lowers damage, raises part health, and rolls up limb health and bleed', () => {
    const limbs = bodyWith(cut('chest', 20));
    const torso = limbs.find((l) => l.id === 'torso')!;
    const chest = partOf(limbs, 'chest');
    expect(healLimbsInPlace(limbs, 1, 0, false)).toBe(true);
    expect(chest.injuries[0].damage).toBeCloseTo(19, 5);
    expect(chest.health).toBeCloseTo(61, 5);
    expect(torso.health).toBe(rolledUp(torso));
    expect(torso.health).toBeLessThan(100);
    expect(torso.bleedRate).toBeCloseTo(chest.injuries[0].bleeding, 5);
    expect(torso.bleedRate).toBeLessThan(cut('chest', 20).bleeding);
  });

  it('heals a puncture slower by its healDifficulty', () => {
    const limbs = bodyWith(recomputeWound('chest', 'puncture', 20, undefined, 0));
    healLimbsInPlace(limbs, 1, 0, false);
    expect(partOf(limbs, 'chest').injuries[0].damage).toBeCloseTo(20 - 1 / 1.2, 5);
  });

  it('a wound within 0.05 of healed is removed and the part restored', () => {
    const limbs = bodyWith(cut('chest', 1.04));
    healLimbsInPlace(limbs, 1, 0, false);
    const chest = partOf(limbs, 'chest');
    expect(chest.injuries).toEqual([]);
    expect(chest.health).toBe(chest.maxHp);
  });

  it('a fracture that knits back under the bone budget clears boneBroken', () => {
    const bone = skeletonPartOf('leftUpperArm')!;
    const budget = boneBreakBudget(PART_DEF_MAP[bone], PART_DEF_MAP[bone]!.maxHp);
    const limbs = bodyWith(recomputeWound(bone, 'fracture', budget + 1, undefined, 0));
    const humerus = partOf(limbs, bone);
    humerus.health = humerus.maxHp;
    humerus.boneBroken = true;
    healLimbsInPlace(limbs, 10, 0, false);
    expect(humerus.injuries[0].damage).toBeCloseTo(budget + 1 - 10 / 4, 5);
    expect(humerus.boneBroken).toBe(false);
  });

  it('a wounded wolf left to stepHunger mends its chest, its torso health and its bleed together', () => {
    const wolf = makeMob(getCreatureById('wolf')!, 5, 5, 0);
    let gs = { turn: 0, pawns: [], mobs: [wolf], worldMap: [] } as unknown as GameState;
    gs = combatService.applyInjuryToMob(wolf.id, cut('chest', 20), gs);
    const startHealth = partOf(gs.mobs![0].limbs!, 'chest').health;
    for (let i = 1; i <= 300; i++) gs = stepHunger({ ...gs, turn: i });
    const limbs = gs.mobs![0].limbs!;
    const chest = partOf(limbs, 'chest');
    const torso = limbs.find((l) => (l.parts ?? []).some((p) => p.id === 'chest'))!;
    expect(chest.health).toBeGreaterThan(startHealth);
    expect(torso.health).toBe(rolledUp(torso));
    expect(torso.bleedRate).toBeCloseTo(
      (torso.parts ?? []).reduce((s, p) => s + p.injuries.reduce((a, w) => a + w.bleeding, 0), 0),
      9
    );
  });
});

describe('healLimbs (pawn healing)', () => {
  it('a wound within 0.05 of healed is removed', () => {
    const out = healLimbs(bodyWith(cut('chest', 1.04)), 1, 0, false);
    expect(partOf(out, 'chest').injuries).toEqual([]);
  });

  it('heals a puncture slower by its healDifficulty', () => {
    const out = healLimbs(
      bodyWith(recomputeWound('chest', 'puncture', 20, undefined, 0)),
      1,
      0,
      false
    );
    expect(partOf(out, 'chest').injuries[0].damage).toBeCloseTo(20 - 1 / 1.2, 5);
  });

  it('an untended serious wound stalls to 0.15× when stalls are on', () => {
    const out = healLimbs(bodyWith(cut('chest', 40)), 1, 0, true);
    expect(partOf(out, 'chest').injuries[0].damage).toBeCloseTo(40 - 0.15, 5);
  });
});
