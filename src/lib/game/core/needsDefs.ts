// needsDefs — the loader for needs.jsonc, the per-need behaviour registry. Leaf module (no service
// deps) so PawnService (accrual rates, mood bands), pawnHelpers (thresholds, relief, durations), and
// PawnStateMachine (bloodHunger) all resolve their tuning from one place. Values are authored in
// in-game SECONDS / need points; callers convert rates/durations to tick-space at their use site, exactly
// as they did when these were inline constants — so nothing about the per-tick hot path changes.
import needsData from '../database/needs.jsonc';

/** A mood band on a need: applies while the need is past `atOrAbove` (survival) / `atOrBelow` (fun),
 *  and references a mood effect id from mood.jsonc. */
export interface NeedMoodBand {
  atOrAbove?: number;
  atOrBelow?: number;
  effect: string;
}

/** One need's behaviour block. Every field is optional — a need only declares what applies to it
 *  (survival needs have `rate`, `fun` has `decayRate`, bloodHunger has its lineage feeding knobs). */
export interface NeedDef {
  /** Per-second build rate (survival needs). */
  rate?: number;
  /** Per-second decay rate (`fun`, inverted: 100 = entertained → 0). */
  decayRate?: number;
  /** Abandon work to satisfy the need at/above this (fun: at/below). */
  seek?: number;
  /** Opportunistic top-up threshold while already at the water/well. */
  autoSatisfy?: number;
  /** Need points removed (survival) / restored (fun) by one full satisfy session. */
  relief?: number;
  /** How long a satisfy session takes (in-game seconds). */
  durationSeconds?: number;
  // hunger
  eatDurationSeconds?: number;
  eatGroundDurationSeconds?: number;
  // fatigue
  sleepDurationSeconds?: number;
  sleepGroundDurationSeconds?: number;
  groundRecoveryPerSecond?: number;
  wakeThresholdFed?: number;
  wakeThresholdHungry?: number;
  // bloodHunger (LINEAGES-II)
  fillPerGameHour?: number;
  feedThreshold?: number;
  feedRadius?: number;
  rageThreshold?: number;
  rageDurationHours?: number;
  moodBands?: NeedMoodBand[];
}

const NEEDS = needsData as unknown as Record<string, NeedDef>;

/** All need defs keyed by `Pawn.needs` field (also the mood-band source PawnService iterates). */
export const NEEDS_DB: Readonly<Record<string, NeedDef>> = NEEDS;

/** One need's def (empty object if unknown — callers read a specific field with a fallback). */
export function needDef(id: string): NeedDef {
  return NEEDS[id] ?? {};
}

/** Read one numeric field off a need, with a fallback if the field (or the need) is absent. Keeps the
 *  call sites terse: `needNum('thirst', 'rate', 0.7)`. */
export function needNum(id: string, field: keyof NeedDef, fallback: number): number {
  const v = NEEDS[id]?.[field];
  return typeof v === 'number' ? v : fallback;
}
