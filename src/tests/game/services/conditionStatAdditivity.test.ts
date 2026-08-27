import { describe, it, expect } from 'vitest';
import { pawnStatService } from '$lib/game/services/PawnStatService';
import type { Pawn } from '$lib/game/core/types';

const baseStats = {
  strength: 10,
  dexterity: 10,
  constitution: 10,
  intelligence: 10,
  perception: 10,
  charisma: 10
};

const limbs = () =>
  ['head', 'torso', 'left_arm', 'right_arm', 'left_leg', 'right_leg'].map((id) => ({
    id,
    health: 100,
    bleedRate: 0,
    parts: []
  }));

function pawnWith(stat: keyof typeof baseStats, value: number, transientConditions: string[]): Pawn {
  return {
    id: 'p',
    isAlive: true,
    stats: { ...baseStats, [stat]: value },
    traits: [],
    equipment: {},
    limbs: limbs(),
    conditions: [],
    transientConditions,
    pain: 0
  } as unknown as Pawn;
}

const WEAK = 6;
const AVERAGE = 10;
const STRONG = 20;

describe('a condition that carries a stat modifier moves the sim reader for every pawn, not just the average one', () => {
  it('stock_warmed (constitution buff) raises cold_resistance by the same amount for a weak, average and strong pawn', () => {
    const deltas = [WEAK, AVERAGE, STRONG].map((con) => {
      const without = pawnStatService.evaluateStat('cold_resistance', pawnWith('constitution', con, []));
      const with_ = pawnStatService.evaluateStat(
        'cold_resistance',
        pawnWith('constitution', con, ['stock_warmed'])
      );
      expect(with_, `con ${con}: stock_warmed should raise cold_resistance`).toBeGreaterThan(without);
      return with_ - without;
    });
    expect(deltas[1]).toBeCloseTo(deltas[0], 5);
    expect(deltas[2]).toBeCloseTo(deltas[0], 5);
  });

  it('tired (strength/dexterity/perception debuff) crushes melee_damage by the same amount whatever the pawn started with', () => {
    const deltas = [WEAK, AVERAGE, STRONG].map((str) => {
      const without = pawnStatService.evaluateStat('melee_damage', pawnWith('strength', str, []));
      const with_ = pawnStatService.evaluateStat('melee_damage', pawnWith('strength', str, ['tired']));
      expect(with_, `str ${str}: tired should lower melee_damage`).toBeLessThan(without);
      return without - with_;
    });
    expect(deltas[1]).toBeCloseTo(deltas[0], 5);
    expect(deltas[2]).toBeCloseTo(deltas[0], 5);
  });

  it('fortified (strength buff) raises melee_damage for a weak, average and strong pawn alike', () => {
    for (const str of [WEAK, AVERAGE, STRONG]) {
      const without = pawnStatService.evaluateStat('melee_damage', pawnWith('strength', str, []));
      const with_ = pawnStatService.evaluateStat('melee_damage', pawnWith('strength', str, ['fortified']));
      expect(with_, `str ${str}: fortified should raise melee_damage`).toBeGreaterThan(without);
    }
  });
});
