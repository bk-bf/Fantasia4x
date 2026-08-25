import { writable } from 'svelte/store';
import { animNow } from './animClock';
import type { CombatLungeRequest } from '$lib/game/core/util/logSink';

export type { CombatLungeRequest };

export interface AttackLungeEvent extends CombatLungeRequest {
  spawnTime: number;
}

export const LUNGE_TTL_MS = 260;

function createAttackLungeStore() {
  const { subscribe, update } = writable<AttackLungeEvent[]>([]);

  return {
    subscribe,
    push(req: CombatLungeRequest) {
      const now = animNow();
      update((list) => {
        const live = list.filter(
          (e) => now - e.spawnTime < LUNGE_TTL_MS && e.attackerId !== req.attackerId
        );
        live.push({ ...req, spawnTime: now });
        return live;
      });
    },
    clear() {
      update(() => []);
    }
  };
}

export const attackLunges = createAttackLungeStore();
