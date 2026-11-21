import { TICKS_PER_SECOND } from '$lib/game/core/util/time';

const TURNS_PER_DAY = 300;
const DAYS_PER_MONTH = 30;
const MONTHS_PER_YEAR = 12;

const MONTH_NAMES = [
  'Early Spring',
  'Mid Spring',
  'Late Spring',
  'Early Summer',
  'Mid Summer',
  'Late Summer',
  'Early Autumn',
  'Mid Autumn',
  'Late Autumn',
  'Early Winter',
  'Mid Winter',
  'Late Winter'
];

export interface GameDate {
  year: number;
  day: number;
  monthName: string;
  hour: number;
  clock: string;
}

export function turnToGameDate(turn: number): GameDate {
  const seconds = turn / TICKS_PER_SECOND;
  const totalDays = Math.floor(seconds / TURNS_PER_DAY);
  const hours = ((seconds % TURNS_PER_DAY) / TURNS_PER_DAY) * 24;
  const hour = Math.floor(hours);
  const minute = Math.floor((hours - hour) * 60);
  const totalMonths = Math.floor(totalDays / DAYS_PER_MONTH);
  return {
    year: Math.floor(totalMonths / MONTHS_PER_YEAR) + 1,
    day: (totalDays % DAYS_PER_MONTH) + 1,
    monthName: MONTH_NAMES[totalMonths % MONTHS_PER_YEAR],
    hour,
    clock: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  };
}
