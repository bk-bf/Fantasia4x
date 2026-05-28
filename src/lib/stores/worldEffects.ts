// World-space effects layer store.
// GameCanvas writes overlay positions here; WorldEffectsLayer reads and renders them.
// Add new effect types here to extend the system (weather, particle effects, etc.)
import { writable } from 'svelte/store';

export interface SleepingOverlay {
  id: string;
  left: number;
  top: number;
}

export interface WorldEffectsState {
  sleepingOverlays: SleepingOverlay[];
  // Future effects — add here and handle in WorldEffectsLayer:
  // weather: 'none' | 'rain' | 'snow';
  // particleEffects: ParticleEffect[];
}

function createWorldEffectsStore() {
  const { subscribe, update } = writable<WorldEffectsState>({
    sleepingOverlays: []
  });

  return {
    subscribe,
    setSleepingOverlays(overlays: SleepingOverlay[]) {
      update((s) => ({ ...s, sleepingOverlays: overlays }));
    }
  };
}

export const worldEffects = createWorldEffectsStore();
