import type {
  GameState,
  Pawn,
  EntityStats,
  StatKey,
  GrowthOffer,
  Trait
} from '$lib/game/core/types';
import { rng } from '$lib/game/core/util/rng';
import { DAYS_PER_SEASON } from '$lib/game/services/EnvironmentService';
import { advanceAwakeningMeters, lineageGrowthEvent } from '$lib/game/core/defs/lineages';
import { applyGainedTrait } from '$lib/game/entities/Pawns';

const STAT_KEYS: StatKey[] = [
  'strength',
  'dexterity',
  'intelligence',
  'perception',
  'charisma',
  'constitution'
];

const DAYS_PER_YEAR = DAYS_PER_SEASON * 4;

function rollGain(isFav: boolean): number {
  const r = rng.random();
  if (isFav) return r < 0.05 ? 0 : r < 0.25 ? 1 : r < 0.65 ? 2 : 3;
  return r < 0.35 ? 0 : r < 0.7 ? 1 : r < 0.9 ? 2 : 3;
}

function bankOffer(pawn: Pawn, kind: GrowthOffer['kind'], doubled: boolean): void {
  const rolls: Partial<Record<StatKey, number>> = {};
  for (const stat of STAT_KEYS) {
    const isFav = pawn.favStats?.includes(stat) ?? false;
    rolls[stat] = rollGain(isFav) * (doubled ? 2 : 1);
  }
  (pawn.pendingGrowth ??= []).push({ kind, rolls });
  lineageGrowthEvent(pawn, (t: Trait) => applyGainedTrait(pawn, t));
}

class PawnGrowthService {
  processDay(gs: GameState, dayIndex: number): void {
    const season = Math.floor(dayIndex / DAYS_PER_SEASON);
    const seasonDay = dayIndex % DAYS_PER_SEASON;
    const yearDay = dayIndex % DAYS_PER_YEAR;
    const currentSeasonOfYear = Math.floor(yearDay / DAYS_PER_SEASON);

    for (const pawn of gs.pawns ?? []) {
      if (pawn.isAlive === false) continue;
      advanceAwakeningMeters(pawn, dayIndex);
      if (pawn.lastGrowthSeason === undefined) {
        pawn.lastGrowthSeason = season;
      }

      if (pawn.birthDayOfYear === yearDay) {
        pawn.age = (pawn.age ?? 0) + 1;
        if (season > pawn.lastGrowthSeason) {
          bankOffer(pawn, 'birthday', true);
          pawn.lastGrowthSeason = season;
        }
      }

      const birthdaySeasonOfYear = Math.floor((pawn.birthDayOfYear ?? 0) / DAYS_PER_SEASON);
      const isBirthdaySeason = currentSeasonOfYear === birthdaySeasonOfYear;
      if (!isBirthdaySeason && season > pawn.lastGrowthSeason) {
        const daysLeft = DAYS_PER_SEASON - seasonDay;
        if (rng.random() < 1 / daysLeft) {
          bankOffer(pawn, 'season', false);
          pawn.lastGrowthSeason = season;
        }
      }
    }
  }

  grantGrowthOffer(pawn: Pawn, doubled = false): void {
    bankOffer(pawn, doubled ? 'birthday' : 'season', doubled);
  }

  applyGrowthChoice(pawn: Pawn, chosen: StatKey[]): Pawn {
    const queue = pawn.pendingGrowth;
    if (!queue || queue.length === 0) return pawn;
    const offer = queue[0];
    const picks = [...new Set(chosen)].filter((s) => (offer.rolls[s] ?? 0) > 0).slice(0, 2);

    const stats: EntityStats = { ...pawn.stats };
    const caps = pawn.maxStats;
    for (const stat of picks) {
      const gain = offer.rolls[stat] ?? 0;
      const cap = caps?.[stat] ?? Infinity;
      stats[stat] = Math.min(cap, stats[stat] + gain);
    }
    return { ...pawn, stats, pendingGrowth: queue.slice(1) };
  }
}

export const pawnGrowthService = new PawnGrowthService();
