// Transient attack-lunge channel.
//
// combatService (systems layer) pushes one lunge per resolved swing here, carrying
// the attacker id and a normalised direction toward the struck tile. GameCanvas
// reads the active lunges every animation frame and nudges the attacker's glyph a
// fraction of a tile "into" the target, snapping it back over LUNGE_TTL_MS — a
// quick out-and-back thrust timed with the swing.
//
// Mirrors `combatFeedback` (the floating-text channel) but feeds the WebGL glyph
// layer instead of the DOM text layer: a lunge moves the pawn sprite, not a label.
// Only the most recent lunge per attacker is kept; entries self-prune after the TTL
// so the list never grows unbounded even when nothing reads it.
import { writable } from 'svelte/store';
// P-3: the request shape lives in the sim's core sink so Combat can emit without
// importing this store (layer direction). Re-exported here for the renderer.
import type { CombatLungeRequest } from '$lib/game/core/logSink';

export type { CombatLungeRequest };

export interface AttackLungeEvent extends CombatLungeRequest {
  /** Wall-clock spawn time (Date.now); drives the thrust/recover lifetime. */
  spawnTime: number;
}

/** Lifetime of a lunge thrust, in ms. Short enough to recover well before the next swing. */
export const LUNGE_TTL_MS = 260;

function createAttackLungeStore() {
  const { subscribe, update } = writable<AttackLungeEvent[]>([]);

  return {
    subscribe,
    /** Record a lunge for an attacker. Replaces any in-flight lunge for the same attacker. */
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
