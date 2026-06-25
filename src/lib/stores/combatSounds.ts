// Transient combat-SOUND cue channel.
//
// Combat (systems layer) pushes a cue here per weapon swing and per combat-condition onset, carrying
// a sound-id + the world tile it happened on. AudioController drains it (plays each cue once, at a
// volume scaled by zoom + viewport proximity) — the audio twin of combatFeedback (floating text) and
// attackLunges (glyph thrust). Cues self-prune after a short TTL so the list never grows unbounded
// even if nothing reads it.
import { writable } from 'svelte/store';
// The request shape lives in the sim's core sink so Combat can emit without importing this store
// (layer direction). Re-exported here for the renderer.
import type { CombatSoundRequest } from '$lib/game/core/logSink';

export type { CombatSoundRequest };

export interface CombatSoundEvent extends CombatSoundRequest {
  /** Unique id so the player can fire each cue exactly once. */
  id: string;
  /** Wall-clock spawn time (Date.now) — drives the self-prune. */
  spawnTime: number;
}

/** How long a cue lingers in the list before pruning (only needs to outlive AudioController's tick). */
export const COMBAT_SOUND_TTL_MS = 1000;
/** Hard cap so a chaotic brawl can't accumulate unbounded cues. */
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
