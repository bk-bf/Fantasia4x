// PawnGrowthService — Battle-Brothers-style stat growth (PAWN-GROWTH).
//
// A pawn banks "growth offers" as it survives the year, then the player accepts two stats per offer
// (see applyGrowthChoice). Cadence — 4 offers per year, NEVER more:
//   • 3 SEASONAL offers — one per non-birthday season, firing on a RANDOM day within that season
//     (a "coupon" roll whose odds ramp to a guaranteed fire by the season's last day → surprising but
//     certain). Rolls each stat +0..+3, biased upward on the pawn's two favoured (talent-star) stats.
//   • 1 BIRTHDAY offer — on the pawn's fixed birthday it ages +1 AND banks a growth offer whose rolls
//     are DOUBLED (+0..+6). This REPLACES the birthday season's seasonal offer (no extra event) — the
//     doubling is what makes that season worth two.
//
// Aging is realistic (1 year = 4 seasons = 360 days); only the growth cadence is seasonal.

import type { GameState, Pawn, EntityStats, StatKey, GrowthOffer, Trait } from '$lib/game/core/types';
import { rng } from '$lib/game/core/rng';
import { DAYS_PER_SEASON } from '$lib/game/services/EnvironmentService';
import { advanceAwakeningMeters, lineageGrowthEvent } from '$lib/game/core/Lineages';
import { applyGainedTrait } from '$lib/game/entities/Pawns';

const STAT_KEYS: StatKey[] = [
  'strength',
  'dexterity',
  'intelligence',
  'perception',
  'charisma',
  'constitution'
];

const DAYS_PER_YEAR = DAYS_PER_SEASON * 4; // 4 seasons

/** Roll one stat's gain 0..+3. Favoured stats skew high ("more likely to roll higher"); others skew low. */
function rollGain(isFav: boolean): number {
  const r = rng.random();
  if (isFav) return r < 0.05 ? 0 : r < 0.25 ? 1 : r < 0.65 ? 2 : 3;
  return r < 0.35 ? 0 : r < 0.7 ? 1 : r < 0.9 ? 2 : 3;
}

/** Build + bank one growth offer (every stat rolled, so the pick-two screen shows all six). LINEAGES §3:
 *  each growth EVENT is also a lineage-progression moment — awaken a full meter, else evolve a stage,
 *  else grow a new member trait. */
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
  /**
   * Run the per-day growth cadence for every living pawn. Called once when the in-game day advances
   * (in-place mutation, per the sim hot-path convention — this is per-DAY, not per-tick). `dayIndex`
   * is the absolute whole-day count since turn 0 (`dayIndexForTurn`).
   */
  processDay(gs: GameState, dayIndex: number): void {
    const season = Math.floor(dayIndex / DAYS_PER_SEASON); // absolute season index
    const seasonDay = dayIndex % DAYS_PER_SEASON; // 0..DAYS_PER_SEASON-1
    const yearDay = dayIndex % DAYS_PER_YEAR; // 0..DAYS_PER_YEAR-1
    const currentSeasonOfYear = Math.floor(yearDay / DAYS_PER_SEASON); // 0..3

    for (const pawn of gs.pawns ?? []) {
      if (pawn.isAlive === false) continue;
      // LINEAGES §4: fold the day's deeds into any awakening meters (and decay stalled ones).
      advanceAwakeningMeters(pawn, dayIndex);
      // Lazy init: treat the (partial) spawn season as already-accounted, so growth only starts after
      // the pawn has SURVIVED a full season — the first offer lands in the next season.
      if (pawn.lastGrowthSeason === undefined) {
        pawn.lastGrowthSeason = season;
      }

      // Birthday: age +1, and (once per birthday season) a DOUBLED offer that stands in for this
      // season's seasonal offer.
      if (pawn.birthDayOfYear === yearDay) {
        pawn.age = (pawn.age ?? 0) + 1;
        if (season > pawn.lastGrowthSeason) {
          bankOffer(pawn, 'birthday', true);
          pawn.lastGrowthSeason = season;
        }
      }

      // Seasonal: one offer per NON-birthday season, on a random day (coupon → guaranteed by season end).
      const birthdaySeasonOfYear = Math.floor((pawn.birthDayOfYear ?? 0) / DAYS_PER_SEASON);
      const isBirthdaySeason = currentSeasonOfYear === birthdaySeasonOfYear;
      if (!isBirthdaySeason && season > pawn.lastGrowthSeason) {
        const daysLeft = DAYS_PER_SEASON - seasonDay; // 1..DAYS_PER_SEASON
        if (rng.random() < 1 / daysLeft) {
          bankOffer(pawn, 'season', false);
          pawn.lastGrowthSeason = season;
        }
      }
    }
  }

  /**
   * Apply the player's pick-two on a pawn's OLDEST pending offer: raise the two chosen stats by their
   * rolled gains, each clamped to that stat's `maxStats` cap, then drop the offer. Returns the updated
   * pawn (new object — command path, immutable). No-op if the offer/choices are invalid.
   */
  applyGrowthChoice(pawn: Pawn, chosen: StatKey[]): Pawn {
    const queue = pawn.pendingGrowth;
    if (!queue || queue.length === 0) return pawn;
    const offer = queue[0];
    // Accept at most two DISTINCT stats that actually rolled a gain.
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
