// Transient floating-combat-text channel: combatService pushes world-space events per resolved
// hit/miss/dodge; GameCanvas converts to screen space for WorldEffectsLayer. Positions are world
// TILE coordinates, never pixels — the renderer owns camera math. Self-prunes after FLOAT_TTL_MS.
import { writable } from 'svelte/store';
// Kind enum lives in the core sink so Combat can reference it without importing this store.
import type { CombatTextKind } from '$lib/game/core/logSink';

export type { CombatTextKind };

export interface CombatTextEvent {
  id: string;
  worldX: number; // tile coordinate of the struck entity
  worldY: number;
  text: string;
  kind: CombatTextKind;
  /** Explicit CSS colour for data-driven `kind: 'condition'` labels (overrides the per-kind class). */
  color?: string;
  /** Extra vertical px offset — stacks a secondary cue below its sibling damage number. */
  dy?: number;
  spawnTime: number;
}

/** Label lifetime in ms. Must match the CSS animation duration. */
export const FLOAT_TTL_MS = 900;

const MAX_ACTIVE = 60;

function createCombatFeedbackStore() {
  const { subscribe, update, set } = writable<CombatTextEvent[]>([]);

  let seq = 0;

  return {
    subscribe,
    push(evt: Omit<CombatTextEvent, 'id' | 'spawnTime'>) {
      const now = Date.now();
      update((list) => {
        const live = list.filter((e) => now - e.spawnTime < FLOAT_TTL_MS);
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
