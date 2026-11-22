import { describe, it, expect, vi } from 'vitest';
import type { Pawn } from '$lib/game/core/types';

vi.mock('$lib/game/core/rules/body/conditions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('$lib/game/core/rules/body/conditions')>();
  return {
    ...actual,
    conditionStatMultipliers: (e: Parameters<typeof actual.conditionStatMultipliers>[0]) =>
      e.conditions?.some((c) => c.id === 'hale')
        ? { strength: 1, dexterity: 1, constitution: 2, perception: 1, intelligence: 1 }
        : actual.conditionStatMultipliers(e)
  };
});

const { pawnStatService } = await import('$lib/game/services/PawnStatService');

const pawn = (conditions: { id: string; severity: number }[]): Pawn =>
  ({
    id: `scaling-${conditions.length}`,
    name: 'Vale Test',
    limbs: [],
    traits: [],
    conditions,
    stats: {
      strength: 10,
      dexterity: 10,
      constitution: 14,
      intelligence: 10,
      perception: 10,
      charisma: 10
    }
  }) as unknown as Pawn;

describe('a condition that scales a core stat', () => {
  it('feeds the scaled stat into every formula that reads it', () => {
    expect(pawnStatService.evaluateStat('cold_resistance', pawn([]))).toBeCloseTo(0.04);
    expect(
      pawnStatService.evaluateStat('cold_resistance', pawn([{ id: 'hale', severity: 1 }]))
    ).toBeCloseTo(0.18);
  });
});
