// Transient combat-sound cue channel: combat pushes a cue per swing/condition onset, AudioController
// drains it. Cues self-prune after a short TTL so the list never grows unbounded even if unread.
import { writable } from 'svelte/store';
// Request shape lives in the core sink so Combat can emit without importing this store (layer direction).
import type { CombatSoundRequest } from '$lib/game/core/logSink';

export type { CombatSoundRequest };

export interface CombatSoundEvent extends CombatSoundRequest {
  /** Unique id so each cue fires exactly once. */
  id: string;
  spawnTime: number;
}

/** Cue lifetime before pruning — only needs to outlive AudioController's tick. */
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
