import { getConditionCurrentStage } from '$lib/game/core/rules/body/conditions';
import type { Mob, Pawn } from '$lib/game/core/types';
import type { FxWorld } from './scene';

export function onsetChecker(w: Pick<FxWorld, 'pawns' | 'mobs'>): (key: string) => boolean {
  let byId: Map<string, Pawn | Mob> | null = null;
  return (key) => {
    byId ??= new Map<string, Pawn | Mob>([...w.pawns, ...w.mobs].map((e) => [e.id, e]));
    const cut = key.indexOf('|');
    const e = byId.get(key.slice(0, cut));
    const cond = key.slice(cut + 1);
    if (!e || e.isAlive === false) return false;
    if ((e.transientConditions ?? []).includes(cond)) return true;
    if ((e.conditionTimers?.[cond] ?? 0) > 0) return true;
    return (e.conditions ?? []).some(
      (c) => `${c.id}:${getConditionCurrentStage(c)?.label}` === cond
    );
  };
}
