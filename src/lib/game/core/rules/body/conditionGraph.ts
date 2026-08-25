import type { ConditionPredicate, ConditionTrigger } from '../../types/health';

export interface GraphContext {
  needs: Record<string, number>;
  bloodFrac: number;
  pain: number;
  ambientLight: number;
  unsheltered: boolean;
  fullMoon: boolean;
  hasCondition: (id: string) => boolean;
  sourceSeverity: number;
}

const NONE: FiredEdge[] = [];

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

export function evaluatePredicate(p: ConditionPredicate | undefined, ctx: GraphContext): boolean {
  if (!p) return true;
  if (p.unsheltered !== undefined && p.unsheltered !== ctx.unsheltered) return false;
  if (p.fullMoon !== undefined && p.fullMoon !== ctx.fullMoon) return false;
  if (p.hasCondition !== undefined && !ctx.hasCondition(p.hasCondition)) return false;
  if (p.lacksCondition !== undefined && ctx.hasCondition(p.lacksCondition)) return false;
  const v = meterValue(p, ctx);
  if (v !== undefined) {
    if (p.atOrAbove !== undefined && v < p.atOrAbove) return false;
    if (p.atOrBelow !== undefined && v > p.atOrBelow) return false;
  }
  return true;
}

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
