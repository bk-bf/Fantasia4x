import type { Culture, EntityStats, Pawn, Trait } from '../types';
import { CORE_STAT_KEYS } from '../types';
import { PART_DEF_MAP } from '../defs/bodyParts';
import { rng } from '../util/rng';
import { SPAWN_STAT_CAP } from '../rules/body/spawnStatCap';

export const SPAWN_STAT_FLOOR = 4;

const STAT_KEYS = CORE_STAT_KEYS;

export function clampSpawnStats(stats: EntityStats): EntityStats {
  const out = { ...stats } as unknown as Record<string, number>;
  for (const k of STAT_KEYS) {
    const v = out[k as string];
    if (typeof v === 'number')
      out[k as string] = Math.max(SPAWN_STAT_FLOOR, Math.min(SPAWN_STAT_CAP, Math.round(v)));
  }
  return out as unknown as EntityStats;
}

export function rollStatsFromRanges(statRanges: Record<string, [number, number]>): EntityStats {
  const stats: any = {};

  Object.entries(statRanges).forEach(([statName, [min, max]]) => {
    stats[statName] = min + Math.floor(rng.random() * (max - min + 1));
  });

  return stats as EntityStats;
}

export function rollGrowthProfile(
  finalStats: EntityStats,
  statRanges: Record<string, [number, number]>
): { maxStats: EntityStats; favStats: (keyof EntityStats)[] } {
  const pool: (keyof EntityStats)[] = [];
  for (const stat of STAT_KEYS) {
    const [min, max] = statRanges[stat] ?? [10, 15];
    const weight = 1 + Math.max(0, Math.round((max - min + (max - 18)) / 3));
    for (let i = 0; i < weight; i++) pool.push(stat);
  }
  const favCount = rng.int(0, 2);
  const favStats: (keyof EntityStats)[] = [];
  let guard = 0;
  while (favStats.length < favCount && guard++ < 40) {
    const pick = rng.pick(pool);
    if (!favStats.includes(pick)) favStats.push(pick);
  }

  const maxStats = {} as EntityStats;
  for (const stat of STAT_KEYS) {
    const isFav = favStats.includes(stat);
    const base = isFav ? rng.int(50, 60) : rng.int(40, 55);
    maxStats[stat] = Math.max(base, finalStats[stat] + 15);
  }
  return { maxStats, favStats };
}

export function applyCulturalTraitBonuses(baseStats: EntityStats, traits: Trait[]): EntityStats {
  const modifiedStats = { ...baseStats };

  traits.forEach((trait) => {
    Object.entries(trait.effects).forEach(([effectName, effectValue]) => {
      if (effectName.endsWith('Bonus') && typeof effectValue === 'number') {
        const statName = effectName.replace('Bonus', '').toLowerCase() as keyof EntityStats;
        if (modifiedStats[statName] !== undefined) {
          modifiedStats[statName] = Math.max(1, modifiedStats[statName] + effectValue);
        }
      }
    });
    for (const g of trait.grafts ?? [])
      for (const partId of g.parts) {
        const per = PART_DEF_MAP[partId]?.grants?.perceptionBonus;
        if (typeof per === 'number') modifiedStats.perception += per;
      }
  });

  return modifiedStats;
}

export function rollPhysicalTraits(physical: Culture['physicalTraits']): Pawn['physicalTraits'] {
  const { heightRange, weightRange, size } = physical;

  return {
    height: heightRange[0] + Math.floor(rng.random() * (heightRange[1] - heightRange[0] + 1)),
    weight: weightRange[0] + Math.floor(rng.random() * (weightRange[1] - weightRange[0] + 1)),
    size
  };
}
