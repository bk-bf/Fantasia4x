import { animNow } from './animClock';
import type { CombatTextKind, CombatTextRequest } from '$lib/game/core/util/logSink';

export type { CombatTextKind };

export interface CombatTextEvent extends CombatTextRequest {
  id: number;
  spawnTime: number;
  until: number;
}

const MAX_ACTIVE = 60;
const ONSET_GRACE_MS = 2000;
const LIFE_MS: Partial<Record<CombatTextKind, number>> = {
  social: 4500,
  condition: 1700,
  knockdown: 1300
};
const DEFAULT_LIFE_MS = 900;

export const floatLifeMs = (kind: CombatTextKind): number => LIFE_MS[kind] ?? DEFAULT_LIFE_MS;

export const onsetKey = (entityId: string, conditionId: string): string =>
  `${entityId}|${conditionId}`;

function createCombatFeedback() {
  let list: CombatTextEvent[] = [];
  let expiry = Infinity;
  const onsets = new Map<string, number>();
  let seq = 0;

  return {
    push(req: CombatTextRequest): void {
      const now = animNow();
      if (req.entityId && req.conditionId) {
        const key = onsetKey(req.entityId, req.conditionId);
        if (onsets.has(key)) return;
        onsets.set(key, now);
      }
      const until = now + floatLifeMs(req.kind);
      list.push({ ...req, id: seq++, spawnTime: now, until });
      if (list.length > MAX_ACTIVE) list.shift();
      expiry = Math.min(expiry, until);
    },
    live(now: number): readonly CombatTextEvent[] {
      if (now < expiry) return list;
      list = list.filter((e) => e.until > now);
      expiry = list.reduce((m, e) => Math.min(m, e.until), Infinity);
      return list;
    },
    hasOnsets(): boolean {
      return onsets.size > 0;
    },
    pruneOnsets(now: number, active: (key: string) => boolean): void {
      for (const [key, at] of onsets)
        if (now - at > ONSET_GRACE_MS && !active(key)) onsets.delete(key);
    },
    clear(): void {
      list = [];
      expiry = Infinity;
      onsets.clear();
    }
  };
}

export const combatFeedback = createCombatFeedback();
