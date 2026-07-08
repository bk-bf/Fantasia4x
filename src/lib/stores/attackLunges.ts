// Transient attack-lunge channel: combatService pushes one lunge per resolved swing; GameCanvas
// nudges the attacker's glyph toward the struck tile and back over LUNGE_TTL_MS. Only the most
// recent lunge per attacker is kept; entries self-prune after the TTL even when nothing reads them.
import { writable } from 'svelte/store';
// Request shape lives in the core sink so Combat can emit without importing this store (layer direction).
import type { CombatLungeRequest } from '$lib/game/core/logSink';

export type { CombatLungeRequest };

export interface AttackLungeEvent extends CombatLungeRequest {
  spawnTime: number;
}

/** Lunge lifetime in ms — short enough to recover before the next swing. */
export const LUNGE_TTL_MS = 260;

function createAttackLungeStore() {
  const { subscribe, update } = writable<AttackLungeEvent[]>([]);

  return {
    subscribe,
    /** Replaces any in-flight lunge for the same attacker. */
    push(req: CombatLungeRequest) {
      const now = Date.now();
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
