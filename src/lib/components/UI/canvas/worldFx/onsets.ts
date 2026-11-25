import type { Mob, Pawn } from '$lib/game/core/types';
import type { ConditionState } from '$lib/stores/fx/combatFeedback';
import type { FxWorld } from './scene';

const where = (e: Pawn | Mob) =>
  'position' in e ? (e.position ?? null) : { x: (e as Mob).x, y: (e as Mob).y };

export function conditionState(
  w: Pick<FxWorld, 'pawns' | 'mobs'>
): (entityId: string, conditionId: string) => ConditionState {
  let byId: Map<string, Pawn | Mob> | null = null;
  return (entityId, cond) => {
    byId ??= new Map<string, Pawn | Mob>([...w.pawns, ...w.mobs].map((e) => [e.id, e]));
    const e = byId.get(entityId);
    if (!e || e.isAlive === false) return null;
    const staged = `${cond}:`;
    if ((e.transientConditions ?? []).some((t) => t === cond || t.startsWith(staged))) return 'on';
    if ((e.conditionTimers?.[cond] ?? 0) > 0) return 'on';
    if ((e.conditions ?? []).some((c) => c.id === cond)) return 'on';
    return where(e);
  };
}
