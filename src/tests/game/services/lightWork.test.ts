import { describe, it, expect } from 'vitest';
import { pawnStatService } from '$lib/game/services/PawnStatService';
import type { Pawn } from '$lib/game/core/types';

/**
 * §G light → work (unified via the sight capacity, not a parallel mechanic). A lightMultiplier
 * passed into computeCapacities scales the `sight` capacity linearly (sight = baseSight × light),
 * and every `*_speed` formula multiplies by sight — so darkness slows work through the existing
 * stats.jsonc model. (Verified earlier: this path was previously dormant — lightMultiplier was
 * never supplied — so there is no duplicate mechanic.)
 */
const pawn = (): Pawn =>
  ({
    limbs: [],
    injuries: [],
    stats: {
      strength: 10,
      dexterity: 10,
      intelligence: 10,
      perception: 10,
      constitution: 10,
      wisdom: 10,
      charisma: 10
    }
  }) as unknown as Pawn;

describe('§G light → sight capacity (unified model)', () => {
  it('sight scales linearly with the light multiplier', () => {
    const full = pawnStatService.computeCapacities(pawn(), 1).sight;
    const dim = pawnStatService.computeCapacities(pawn(), 0.4).sight;
    expect(full).toBeGreaterThan(0);
    expect(dim).toBeCloseTo(full * 0.4);
  });

  it('getWorkModifiers().speed falls when light is low (sight-driven), for crafting', () => {
    const day = pawnStatService.getWorkModifiers(pawn(), 'crafting', 1).speed;
    const dark = pawnStatService.getWorkModifiers(pawn(), 'crafting', 0.4).speed;
    expect(dark).toBeLessThan(day);
  });

  it('full light leaves work speed unchanged vs. the default (no light arg)', () => {
    const def = pawnStatService.getWorkModifiers(pawn(), 'crafting').speed;
    const lit = pawnStatService.getWorkModifiers(pawn(), 'crafting', 1).speed;
    expect(lit).toBeCloseTo(def);
  });
});
