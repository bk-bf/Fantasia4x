import { writable } from 'svelte/store';
import { animNow } from './animClock';
import type { CombatTextKind } from '$lib/game/core/util/logSink';

export type { CombatTextKind };

export interface CombatTextEvent {
  id: string;
  worldX: number;
  worldY: number;
  text: string;
  kind: CombatTextKind;
  color?: string;
  dy?: number;
  spawnTime: number;
}

export const FLOAT_TTL_MS = 900;
export const SOCIAL_TTL_MS = 4500;

export function floatTtl(kind: CombatTextKind): number {
  return kind === 'social' ? SOCIAL_TTL_MS : FLOAT_TTL_MS;
}

const MAX_ACTIVE = 60;

function createCombatFeedbackStore() {
  const { subscribe, update, set } = writable<CombatTextEvent[]>([]);

  let seq = 0;

  return {
    subscribe,
    push(evt: Omit<CombatTextEvent, 'id' | 'spawnTime'>) {
      const now = animNow();
      update((list) => {
        const live = list.filter((e) => now - e.spawnTime < floatTtl(e.kind));
        live.push({ ...evt, id: `cbt-${now}-${seq++}`, spawnTime: now });
        return live.length > MAX_ACTIVE ? live.slice(live.length - MAX_ACTIVE) : live;
      });
    },
    clear() {
      set([]);
    }
  };
}

export const combatFeedback = createCombatFeedbackStore();
