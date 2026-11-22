import { describe, it, expect } from 'vitest';
import { pawnStatService } from '$lib/game/services/PawnStatService';
import type { Pawn } from '$lib/game/core/types';

let nextId = 0;
function pawn(extra: Record<string, unknown> = {}): Pawn {
  return {
    id: `stat-pawn-${nextId++}`,
    name: 'Vale Test',
    limbs: [],
    traits: [],
    stats: {
      strength: 10,
      dexterity: 10,
      constitution: 10,
      intelligence: 10,
      perception: 10,
      charisma: 10
    },
    equipment: {},
    inventory: { items: {}, instances: [] },
    ...extra
  } as unknown as Pawn;
}

const limb = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  health: 100,
  bleedRate: 0,
  isMissing: false,
  parts: [],
  ...extra
});

describe('beauty and the intact body', () => {
  it('one scarred part in six lowers beauty to exactly 0.975', () => {
    const parts = Array.from({ length: 6 }, (_, i) => ({
      id: `part${i}`,
      injuries: i === 0 ? [{ type: 'cut_scar', permanent: true }] : []
    }));
    expect(pawnStatService.evaluateStat('beauty', pawn())).toBe(1);
    expect(
      pawnStatService.evaluateStat('beauty', pawn({ limbs: [limb('torso', { parts })] }))
    ).toBe(0.975);
  });
});

describe('capacities', () => {
  it('sight follows the light even for a pawn whose body has not changed', () => {
    const p = pawn();
    const lit = pawnStatService.computeCapacities(p, 1).sight;
    const dark = pawnStatService.computeCapacities(p, 0.3).sight;
    expect(dark).toBeCloseTo(lit * 0.3);
  });

  it('pain below 0.1 leaves consciousness untouched', () => {
    const calm = pawnStatService.computeCapacities(pawn()).consciousness;
    const sore = pawnStatService.computeCapacities(pawn({ injuries: [{ painContribution: 5 }] }));
    expect(sore.pain).toBeCloseTo(0.05);
    expect(sore.consciousness).toBe(calm);
  });

  it('a pawn with one useless leg moves at a quarter, weighting the worst leg by half', () => {
    const p = pawn({ limbs: [limb('leftLeg', { health: 0 }), limb('rightLeg')] });
    expect(pawnStatService.computeCapacities(p).moving).toBeCloseTo(0.25);
  });
});

describe('temperature tolerance', () => {
  it('a hardy constitution lowers the cold onset below the comfort floor', () => {
    const t = pawnStatService.temperatureTolerance(
      pawn({
        stats: {
          strength: 10,
          dexterity: 10,
          constitution: 14,
          intelligence: 10,
          perception: 10,
          charisma: 10
        }
      })
    );
    expect(t.coldDeg).toBeGreaterThan(0);
    expect(t.coldOnset).toBeCloseTo(t.comfortMin - t.coldDeg);
    expect(t.coldOnset).toBeLessThan(t.comfortMin);
  });

  it('cold tolerance is capped at 25 degrees', () => {
    const t = pawnStatService.temperatureTolerance(
      pawn({ traits: [{ id: 'frost_hide', name: 'Frost Hide', resistances: { cold: 2 } }] })
    );
    expect(t.coldDeg).toBe(25);
    expect(t.coldCapped).toBe(true);
  });
});

describe('work', () => {
  it('a novice miner works slower than a master', () => {
    const novice = pawnStatService.evaluateStat('mining_speed', pawn({ skills: { mining: 1 } }));
    const master = pawnStatService.evaluateStat('mining_speed', pawn({ skills: { mining: 50 } }));
    expect(novice).toBeLessThan(master);
  });

  it('a condition at exactly a stage threshold applies that stage', () => {
    const free = pawnStatService.getWorkModifiers(pawn(), 'mining').speed;
    const laden = pawnStatService.getWorkModifiers(
      pawn({ conditions: [{ id: 'encumbered', severity: 0.33 }] }),
      'mining'
    ).speed;
    expect(laden / free).toBeCloseTo(0.85);
  });

  it('a fine lower-tier tool beats a plain higher-tier one when its quality makes it faster', () => {
    const p = pawn({
      inventory: {
        items: {},
        instances: [
          { instanceId: 'a', itemId: 'copper_axe', durability: 40, quality: 1 },
          { instanceId: 'b', itemId: 'stone_axe', durability: 40, quality: 5 }
        ]
      }
    });
    const tool = pawnStatService.heldToolFor(p, 'woodcutting');
    expect(tool?.itemId).toBe('stone_axe');
    expect(tool?.speed).toBeCloseTo(0.75 * 1.8);
  });
});
