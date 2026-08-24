import { describe, it, expect } from 'vitest';
import { pawnStatService } from '$lib/game/services/PawnStatService';
import { createBodyPlanLimbs, enabledNaturalWeapons } from '$lib/game/core/BodyParts';
import type { LimbState, Mob } from '$lib/game/core/types';

/**
 * Arachnid anatomy is modelled in its own right (limbmap.jsonc), NOT as a borrowed mammal torso: 8 eyes,
 * a tubular heart, book lungs, a sucking stomach + digestive gland, Malpighian tubules (excretion), and
 * the venom & silk glands. Two things this locks:
 *   1. those arachnid organs DRIVE the capacities (the PawnStatService resolver is plan-agnostic — book
 *      lung → breathing, Malpighian → blood_filtration, 8 eyes → sight), and
 *   2. the venomous bite is a natural weapon bound to the VENOM GLAND part, so destroying the gland
 *      disables `venom_bite` (only a plain `bite` from the chelicerae remains) — pure weapon↔part wiring.
 * Plus a mammal-invariance guard: the generalized resolver leaves a humanoid's capacities unchanged.
 */
const STATS = {
  strength: 16,
  dexterity: 13,
  constitution: 7,
  intelligence: 4,
  perception: 11,
  wisdom: 10,
  charisma: 10
};

/** A fresh arachnid entity; `kill(id)` selects parts to destroy (health 0 + missing) for this build. */
function spider(kill: (id: string) => boolean = () => false): Mob {
  const limbs = createBodyPlanLimbs('arachnid', 1).map((l) => ({
    ...l,
    parts: (l.parts ?? []).map((p) => (kill(p.id) ? { ...p, health: 0, isMissing: true } : p))
  }));
  return {
    id: 'spider-1',
    creatureId: 'thornwood_spider',
    entityClass: 'animal',
    isAlive: true,
    stats: STATS,
    limbs,
    injuries: [],
    conditions: [],
    bloodVolume: 100,
    maxBloodVolume: 100
  } as unknown as Mob;
}

const allParts = (limbs: LimbState[] | undefined) => (limbs ?? []).flatMap((l) => l.parts ?? []);

describe('arachnid anatomy', () => {
  it('models 8 eyes plus arachnid-specific organs (not a borrowed mammal torso)', () => {
    const parts = allParts(spider().limbs);
    const ids = new Set(parts.map((p) => p.id));
    expect(parts.filter((p) => /eye/i.test(p.id)).length).toBe(8);
    expect(parts.filter((p) => /lung/i.test(p.id)).length).toBe(2); // book lungs
    expect(parts.filter((p) => /venomGland/i.test(p.id)).length).toBe(2);
    expect(parts.filter((p) => /silkGland/i.test(p.id)).length).toBe(2);
    expect(parts.filter((p) => /malpighian/i.test(p.id)).length).toBe(2);
    expect(ids.has('tubularHeart')).toBe(true);
    expect(ids.has('synganglion')).toBe(true); // the spider "brain"
    expect(ids.has('suckingStomach')).toBe(true);
    expect(ids.has('digestiveGland')).toBe(true);
    // No mammal organ ids leaked into the plan.
    expect(ids.has('leftLung')).toBe(false);
    expect(ids.has('leftKidney')).toBe(false);
  });

  it('all 8 eyes feed sight — blinding the spider collapses it', () => {
    const intact = pawnStatService.computeCapacities(spider()).sight;
    const blinded = pawnStatService.computeCapacities(spider((id) => /eye/i.test(id))).sight;
    expect(intact).toBeCloseTo(1.05); // min*0.4 + avg*0.6 over 8 healthy eyes = 1, + 0.05 base
    expect(blinded).toBeLessThan(0.1); // every eye gone → just the residual base
    expect(intact).toBeGreaterThan(blinded);
  });

  it('book lungs drive breathing; Malpighian tubules drive blood_filtration', () => {
    const caps = pawnStatService.computeCapacities(spider());
    expect(caps.breathing).toBeCloseTo(1.05);
    expect(caps.blood_filtration).toBeCloseTo(1.0);
    const noLungs = pawnStatService.computeCapacities(spider((id) => /lung/i.test(id))).breathing;
    const noKidney = pawnStatService.computeCapacities(
      spider((id) => /malpighian/i.test(id))
    ).blood_filtration;
    expect(noLungs).toBeCloseTo(0.05); // both book lungs gone → suffocating
    expect(noKidney).toBeCloseTo(0.0); // both tubules gone → no filtration (→ heal_rate 0)
  });

  it('the venom gland carries the venomous bite — destroy it and only a plain bite remains', () => {
    const intact = enabledNaturalWeapons(spider().limbs);
    expect(intact.has('venom_bite')).toBe(true);
    expect(intact.has('bite')).toBe(true);
    const noGlands = enabledNaturalWeapons(spider((id) => /venomGland/i.test(id)).limbs);
    expect(noGlands.has('venom_bite')).toBe(false); // venom apparatus destroyed → the bite goes dry
    expect(noGlands.has('bite')).toBe(true); // the chelicerae still bite
  });
});

describe('mammal capacities unchanged by the plan-agnostic resolver', () => {
  it('a healthy humanoid still computes full sight/breathing/filtration/digestion', () => {
    const human = {
      limbs: createBodyPlanLimbs('humanoid', 1),
      injuries: [],
      conditions: [],
      stats: STATS,
      bloodVolume: 100,
      maxBloodVolume: 100
    } as unknown as Mob;
    const caps = pawnStatService.computeCapacities(human);
    expect(caps.sight).toBeCloseTo(1.05);
    expect(caps.breathing).toBeCloseTo(1.05);
    expect(caps.blood_filtration).toBeCloseTo(1.0);
    expect(caps.digestion).toBeCloseTo(1.0); // stomach×0.6 + liver×0.4
  });
});
