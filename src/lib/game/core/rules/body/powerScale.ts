export const STAT_SCALE = 10;

export const POWER_SOFT_CAP = 30;

export function powerScale(stat: number): number {
  if (stat <= STAT_SCALE) return Math.max(0, stat / STAT_SCALE);
  const over = stat - STAT_SCALE;
  return 1 + over / STAT_SCALE / (1 + over / POWER_SOFT_CAP);
}

export type PowerStat = 'strength' | 'dexterity' | 'perception' | 'intelligence' | 'charisma';
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
  if (wp?.arcane) return 'intelligence';
  if (wp?.finesse) return 'perception';
  return 'strength';
}

export const powerToken = (statValue: number) => powerScale(statValue) * STAT_SCALE;
