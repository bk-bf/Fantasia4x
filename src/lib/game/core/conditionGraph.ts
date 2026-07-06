// Condition relationship graph (TRAIT-SYSTEM-V2 §5). A PURE, allocation-conscious evaluator for the
// weather-style edges that let one condition trigger/escalate another, and for the `activateWhen`
// environment gate. Kept side-effect-free so it's unit-testable and so the per-tick hot path
// (PawnStateMachine.tickConditions) can drive it without paying an allocation on the common (no-edge)
// path — see ENGINE-PERFORMANCE.md. The caller supplies a live-state CONTEXT + a per-tick `roll`, and
// applies the returned FiredEdge list (add/escalate the target condition).
import type { ConditionPredicate, ConditionTrigger } from './types/health';

/** Live-state snapshot a predicate is evaluated against. Built once per pawn per tick by the caller. */
export interface GraphContext {
  /** `Pawn.needs` values by field (hunger/thirst/fatigue/wetness/coldExposure/heatExposure/hygiene). */
  needs: Record<string, number>;
  /** bloodVolume ÷ maxBloodVolume, 0–1. */
  bloodFrac: number;
  /** Aggregate pain 0–100. */
  pain: number;
  /** Ambient day/night light 0–1 at the pawn's tile. */
  ambientLight: number;
  /** True when the pawn is under an open sky (no roof). */
  unsheltered: boolean;
  /** Whether a condition id is currently present on the pawn. */
  hasCondition: (id: string) => boolean;
  /** Severity 0–1 of the SOURCE condition (for `meter: 'severity'` escalation edges). */
  sourceSeverity: number;
}

const NONE: FiredEdge[] = [];

/** An edge that fired this tick. The caller adds/escalates a PERSISTENT `to` by `severity`, or stamps a
 *  TRANSIENT `to` (timer-based) for `durationHours` — or just ensures the target present. */
export interface FiredEdge {
  to: string;
  severity?: number;
  durationHours?: number;
}

function meterValue(p: ConditionPredicate, ctx: GraphContext): number | undefined {
  if (p.need !== undefined) return ctx.needs[p.need] ?? 0;
  switch (p.meter) {
    case 'bloodFrac':
      return ctx.bloodFrac;
    case 'pain':
      return ctx.pain;
    case 'ambientLight':
      return ctx.ambientLight;
    case 'severity':
      return ctx.sourceSeverity;
    default:
      return undefined;
  }
}

/** True when every present comparison in `p` holds (an absent predicate is always true). */
export function evaluatePredicate(p: ConditionPredicate | undefined, ctx: GraphContext): boolean {
  if (!p) return true;
  if (p.unsheltered !== undefined && p.unsheltered !== ctx.unsheltered) return false;
  if (p.hasCondition !== undefined && !ctx.hasCondition(p.hasCondition)) return false;
  if (p.lacksCondition !== undefined && ctx.hasCondition(p.lacksCondition)) return false;
  const v = meterValue(p, ctx);
  if (v !== undefined) {
    if (p.atOrAbove !== undefined && v < p.atOrAbove) return false;
    if (p.atOrBelow !== undefined && v > p.atOrBelow) return false;
  }
  return true;
}

/**
 * Evaluate ONE condition's outgoing edges against the context. `roll(chance)` returns true with the
 * given PER-TICK probability (the caller passes a `perTick`-scaled rng so `chance` reads as a
 * per-second rate, matching weather + the WET_CHILL edge). Deterministic edges (no `chance`) fire on
 * every eligible tick — this is how the shock-from-pain/blood CERTAINTY is preserved. `isOnset` is true
 * only on the tick the source condition first appeared (for `per: 'onset'` edges).
 * Allocates nothing unless an edge actually fires (returns a shared empty array otherwise).
 */
export function fireTriggers(
  triggers: ConditionTrigger[] | undefined,
  ctx: GraphContext,
  roll: (chance: number) => boolean,
  isOnset: boolean
): FiredEdge[] {
  if (!triggers || triggers.length === 0) return NONE;
  let out: FiredEdge[] | null = null;
  for (const t of triggers) {
    if (t.per === 'onset' && !isOnset) continue;
    if (!evaluatePredicate(t.when, ctx)) continue;
    if (t.chance !== undefined && !roll(t.chance)) continue;
    (out ??= []).push({ to: t.to, severity: t.severity, durationHours: t.durationHours });
  }
  return out ?? NONE;
}
