import { writable } from 'svelte/store';
import type { CombatSoundRequest } from '$lib/game/core/util/logSink';

export type { CombatSoundRequest };

export interface CombatSoundEvent extends CombatSoundRequest {
  id: string;
  spawnTime: number;
}

export const COMBAT_SOUND_TTL_MS = 1000;
const MAX_ACTIVE = 40;

function createCombatSoundStore() {
  const { subscribe, update } = writable<CombatSoundEvent[]>([]);
  let seq = 0;
  return {
    subscribe,
    push(req: CombatSoundRequest) {
      const now = Date.now();
      update((list) => {
        const live = list.filter((e) => now - e.spawnTime < COMBAT_SOUND_TTL_MS);
        live.push({ ...req, id: `snd-${now}-${seq++}`, spawnTime: now });
        return live.length > MAX_ACTIVE ? live.slice(live.length - MAX_ACTIVE) : live;
      });
    },
    clear() {
      update(() => []);
    }
  };
}

export const combatSounds = createCombatSoundStore();
