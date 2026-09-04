import needsData from '../../database/pawns/needs.json';

export interface NeedMoodBand {
  atOrAbove?: number;
  atOrBelow?: number;
  effect: string;
}

export interface NeedDef {
  states?: string[];
  rate?: number;
  decayRate?: number;
  seek?: number;
  autoSatisfy?: number;
  relief?: number;
  durationSeconds?: number;
  eatDurationSeconds?: number;
  eatGroundDurationSeconds?: number;
  sleepDurationSeconds?: number;
  sleepGroundDurationSeconds?: number;
  groundRecoveryPerSecond?: number;
  wakeThresholdFed?: number;
  wakeThresholdHungry?: number;
  fillPerGameHour?: number;
  feedThreshold?: number;
  feedRadius?: number;
  rageThreshold?: number;
  rageDurationHours?: number;
  moodBands?: NeedMoodBand[];
}

const NEEDS = needsData as unknown as Record<string, NeedDef>;

export const NEEDS_DB: Readonly<Record<string, NeedDef>> = NEEDS;

export function needDef(id: string): NeedDef {
  return NEEDS[id] ?? {};
}

export const NEED_OWNED_STATES: ReadonlySet<string> = new Set(
  Object.values(NEEDS).flatMap((d) => d.states ?? [])
);

export function needNum(id: string, field: keyof NeedDef, fallback: number): number {
  const v = NEEDS[id]?.[field];
  return typeof v === 'number' ? v : fallback;
}
