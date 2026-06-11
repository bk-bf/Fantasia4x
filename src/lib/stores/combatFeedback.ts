// Transient combat-feedback channel.
//
// combatService (systems layer) pushes world-space events here on each resolved
// hit/miss/dodge. GameCanvas reads them every animation frame, converts the live
// tile coordinate to a screen position, and forwards a screen-space list to
// `worldEffects` for WorldEffectsLayer to render as rising/fading floating text.
//
// Events self-prune after FLOAT_TTL_MS so the list never grows unbounded even if
// nothing reads it (e.g. the canvas is unmounted). Positions are world tile
// coordinates — never pixels — so the renderer stays the single owner of camera math.
import { writable } from 'svelte/store';

export type CombatTextKind = 'damage' | 'crit' | 'miss' | 'dodge' | 'bleed' | 'knockdown';

export interface CombatTextEvent {
  id: string;
  worldX: number; // tile coordinate of the struck entity
  worldY: number;
  text: string;
  kind: CombatTextKind;
  /** Wall-clock spawn time (Date.now); drives the rise/fade animation lifetime. */
  spawnTime: number;
}

/** Lifetime of a floating-text label, in ms. Must match the CSS animation duration. */
export const FLOAT_TTL_MS = 900;

/** Hard cap so a long brawl can't accumulate hundreds of simultaneous labels. */
const MAX_ACTIVE = 60;

function createCombatFeedbackStore() {
  const { subscribe, update, set } = writable<CombatTextEvent[]>([]);

  let seq = 0;

  return {
    subscribe,
    /** Push a world-space combat label. Auto-prunes expired and over-cap entries. */
    push(evt: Omit<CombatTextEvent, 'id' | 'spawnTime'>) {
      const now = Date.now();
      update((list) => {
        const live = list.filter((e) => now - e.spawnTime < FLOAT_TTL_MS);
        live.push({ ...evt, id: `cbt-${now}-${seq++}`, spawnTime: now });
        // Drop oldest if we blow past the cap.
        return live.length > MAX_ACTIVE ? live.slice(live.length - MAX_ACTIVE) : live;
      });
    },
    clear() {
      set([]);
    }
  };
}

export const combatFeedback = createCombatFeedbackStore();
