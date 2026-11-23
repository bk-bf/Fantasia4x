import { animNow } from './animClock';
import type { CombatTextKind, CombatTextRequest } from '$lib/game/core/util/logSink';

export type { CombatTextKind };

export interface CombatTextEvent extends CombatTextRequest {
  id: number;
  spawnTime: number;
  until: number;
}

export type ConditionState = 'on' | { x: number; y: number } | null;

interface Onset {
  at: number;
  level: number;
  entityId: string;
  conditionId: string;
  name: string;
  color?: string;
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

export const baseCondition = (conditionId: string): string => conditionId.split(':')[0];

export const onsetKey = (entityId: string, conditionId: string): string =>
  `${entityId}|${baseCondition(conditionId)}`;

function createCombatFeedback() {
  let list: CombatTextEvent[] = [];
  let expiry = Infinity;
  const onsets = new Map<string, Onset>();
  let seq = 0;

  const add = (req: CombatTextRequest, now: number) => {
    const until = now + floatLifeMs(req.kind);
    list.push({ ...req, id: seq++, spawnTime: now, until });
    if (list.length > MAX_ACTIVE) list.shift();
    expiry = Math.min(expiry, until);
  };

  return {
    push(req: CombatTextRequest): void {
      const now = animNow();
      if (req.entityId && req.conditionId) {
        const key = onsetKey(req.entityId, req.conditionId);
        const had = onsets.get(key);
        if (had && (req.level ?? 0) === had.level) return;
        onsets.set(key, {
          at: now,
          level: req.level ?? 0,
          entityId: req.entityId,
          conditionId: baseCondition(req.conditionId),
          name: req.text,
          color: req.color
        });
      }
      add(req, now);
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
    pruneOnsets(
      now: number,
      state: (entityId: string, conditionId: string) => ConditionState
    ): void {
      for (const [key, o] of onsets) {
        if (now - o.at <= ONSET_GRACE_MS) continue;
        const s = state(o.entityId, o.conditionId);
        if (s === 'on') continue;
        onsets.delete(key);
        if (s)
          add(
            {
              worldX: s.x,
              worldY: s.y,
              text: o.name,
              kind: 'condition',
              color: o.color,
              entityId: o.entityId,
              conditionId: o.conditionId,
              lost: true
            },
            now
          );
      }
    },
    clear(): void {
      list = [];
      expiry = Infinity;
      onsets.clear();
    }
  };
}

export const combatFeedback = createCombatFeedback();
