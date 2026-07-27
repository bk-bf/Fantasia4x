// The damage-power curve. Lives in `core` because BOTH the stat engine (PawnStatService, resolving the
// `POWER` formula token) and Combat need it, and Combat already imports the stat engine — putting it in
// either of those would close a cycle.

/** Baseline stat: a pawn at 10 swings a weapon for exactly its authored damage. */
export const STAT_SCALE = 10;

/**
 * Diminishing-returns span above the baseline for the damage roll. The power term used to be flat
 * `stat / 10`, written when stats sat in a ~5–22 band. PAWN-GROWTH later shifted rolls to 12–22 and
 * growth caps to 62–100, so that term silently became a ×6–×10 multiplier: subtractive armour stopped
 * mattering at high stats, weapon choice collapsed into "whose base damage is biggest", and the
 * fast/light classes could never catch up because cadence is capped and damage was not.
 *
 * Above 10 the headroom is damped by `1 / (1 + over/POWER_SOFT_CAP)`, which is ~flat where pawns
 * actually start and bounded by `1 + POWER_SOFT_CAP/STAT_SCALE` (= 4×) at the growth ceiling:
 *
 *   stat  10    16    20    30    45    60    100
 *   old  1.00  1.60  2.00  3.00  4.50  6.00  10.00
 *   new  1.00  1.50  1.75  2.20  2.75  2.88   3.25
 *
 * Below 10 it stays strictly linear — a weakened pawn should keep losing power all the way down.
 */
export const POWER_SOFT_CAP = 30;

/** Damage multiplier from the attack's power attribute (brawn / agility / awareness / intellect). */
export function powerScale(stat: number): number {
  if (stat <= STAT_SCALE) return Math.max(0, stat / STAT_SCALE);
  const over = stat - STAT_SCALE;
  return 1 + over / STAT_SCALE / (1 + over / POWER_SOFT_CAP);
}

/**
 * Which core stat drives an attack's damage. The weapon names it (`weaponProperties.powerStat`); the
 * fallbacks cover the older shorthands — an arcane staff channels on INTELLECT, a finesse thrust is
 * placed by AWARENESS, everything else is driven by the body.
 */
export type PowerStat = 'brawn' | 'agility' | 'awareness' | 'intellect';
export function powerStatOf(
  wp:
    | {
        powerStat?: string;
        arcane?: boolean;
        finesse?: boolean;
      }
    | null
    | undefined
): PowerStat {
  if (wp?.powerStat) return wp.powerStat as PowerStat;
  if (wp?.arcane) return 'intellect';
  if (wp?.finesse) return 'awareness';
  return 'brawn';
}

/**
 * The `POWER` formula token: the damped power value on the SAME 10-baseline scale the core stats use,
 * so `melee_damage`/`ranged_damage` can stay ordinary linear formulas —
 * `(1.0 + (POWER − 10) × 0.1)` reproduces `powerScale(stat)` exactly, and the damping stays in one
 * place instead of being restated in the data.
 */
export const powerToken = (statValue: number) => powerScale(statValue) * STAT_SCALE;
