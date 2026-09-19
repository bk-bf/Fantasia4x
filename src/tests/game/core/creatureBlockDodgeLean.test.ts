import { describe, it, expect } from 'vitest';
import { CREATURES, type CreatureStats } from '$lib/game/core/defs/creatures';
import { creatureAptitudes } from '$lib/game/core/rules/body/aptitudes';
import { pawnStatService } from '$lib/game/services/PawnStatService';
import type { Mob, EntityStats } from '$lib/game/core/types';

const sizeClassOf = (strength: number): 'large' | 'medium' | 'small' =>
  strength >= 14 ? 'large' : strength >= 6 ? 'medium' : 'small';
const weightForSizeClass = (sizeClass: 'large' | 'medium' | 'small'): number =>
  sizeClass === 'large' ? 90 : sizeClass === 'medium' ? 50 : 20;

function mobAtMidStats(id: string, creatureStats: CreatureStats): Mob {
  const stats: EntityStats = {
    strength: creatureStats.strength,
    dexterity: creatureStats.dexterity,
    constitution: creatureStats.constitution,
    perception: creatureStats.perception,
    intelligence: 8,
    charisma: 5
  };
  const sizeClass = sizeClassOf(stats.strength);
  return {
    id,
    creatureId: id,
    entityClass: 'animal',
    x: 0,
    y: 0,
    health: 1,
    maxHealth: 1,
    state: 'Wander',
    stateSince: 0,
    needs: { hunger: 0, fatigue: 0, sleep: 0, lastSleep: 0, lastMeal: 0 },
    stats,
    aptitudes: creatureAptitudes(stats),
    physicalTraits: { height: 100, weight: weightForSizeClass(sizeClass), size: sizeClass },
    limbs: [],
    conditions: [],
    skills: {}
  } as unknown as Mob;
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdDev(values: number[]): number {
  const m = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
}

const HIGH_STANDARD_DEVIATIONS_ABOVE_ROSTER_MEAN = 0.5;

describe('no creature is naturally high in both block and dodge', () => {
  const natural = CREATURES.map((c) => {
    const mob = mobAtMidStats(c.id, c.stats);
    return {
      id: c.id,
      block: pawnStatService.evaluateStat('block', mob),
      dodge: pawnStatService.evaluateStat('dodge', mob)
    };
  });

  it('leans every creature toward one axis, never both, at half a standard deviation above the mean', () => {
    const blocks = natural.map((n) => n.block);
    const dodges = natural.map((n) => n.dodge);
    const blockMean = mean(blocks);
    const blockStd = stdDev(blocks);
    const dodgeMean = mean(dodges);
    const dodgeStd = stdDev(dodges);

    const highInBoth = natural.filter((n) => {
      const blockZ = (n.block - blockMean) / blockStd;
      const dodgeZ = (n.dodge - dodgeMean) / dodgeStd;
      return (
        blockZ >= HIGH_STANDARD_DEVIATIONS_ABOVE_ROSTER_MEAN &&
        dodgeZ >= HIGH_STANDARD_DEVIATIONS_ABOVE_ROSTER_MEAN
      );
    });

    expect(highInBoth.map((n) => n.id)).toEqual([]);
  });
});
