import { getConditionCurrentStage } from '$lib/game/core/rules/body/conditions';
import type { FxWorld } from './scene';

export function onsetActive(w: Pick<FxWorld, 'pawns' | 'mobs'>, key: string): boolean {
  const cut = key.indexOf('|');
  const id = key.slice(0, cut);
  const cond = key.slice(cut + 1);
  const e = w.pawns.find((p) => p.id === id) ?? w.mobs.find((m) => m.id === id);
  if (!e || e.isAlive === false) return false;
  if ((e.transientConditions ?? []).includes(cond)) return true;
  if ((e.conditionTimers?.[cond] ?? 0) > 0) return true;
  return (e.conditions ?? []).some((c) => `${c.id}:${getConditionCurrentStage(c)?.label}` === cond);
}
