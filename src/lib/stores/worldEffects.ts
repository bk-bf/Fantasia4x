// World-space effects layer store.
// GameCanvas writes overlay positions here; WorldEffectsLayer reads and renders them.
// Add new effect types here to extend the system (weather, particle effects, etc.)
import { writable } from 'svelte/store';

export interface SleepingOverlay {
  id: string;
  left: number;
  top: number;
}

export interface ProgressOverlay {
  id: string;
  left: number;
  top: number;
  progress: number; // 0–1
}

export interface CampfireOverlay {
  id: string;
  left: number;
  top: number;
}

export interface HealthOverlay {
  id: string;
  left: number;
  top: number;
  health: number; // 0–1 fraction
  type: 'pawn' | 'mob';
}

export interface DraftTargetOverlay {
  id: string;
  points: Array<{ x: number; y: number }>;
}

export interface WorldEffectsState {
  sleepingOverlays: SleepingOverlay[];
  progressOverlays: ProgressOverlay[];
  campfireOverlays: CampfireOverlay[];
  healthOverlays: HealthOverlay[];
  draftTargetOverlays: DraftTargetOverlay[];
  // Future effects — add here and handle in WorldEffectsLayer:
  // weather: 'none' | 'rain' | 'snow';
  // particleEffects: ParticleEffect[];
}

function createWorldEffectsStore() {
  const { subscribe, update } = writable<WorldEffectsState>({
    sleepingOverlays: [],
    progressOverlays: [],
    campfireOverlays: [],
    healthOverlays: [],
    draftTargetOverlays: []
  });

  return {
    subscribe,
    setSleepingOverlays(overlays: SleepingOverlay[]) {
      update((s) => ({ ...s, sleepingOverlays: overlays }));
    },
    setProgressOverlays(overlays: ProgressOverlay[]) {
      update((s) => ({ ...s, progressOverlays: overlays }));
    },
    setCampfireOverlays(overlays: CampfireOverlay[]) {
      update((s) => ({ ...s, campfireOverlays: overlays }));
    },
    setHealthOverlays(overlays: HealthOverlay[]) {
      update((s) => ({ ...s, healthOverlays: overlays }));
    },
    setDraftTargetOverlays(overlays: DraftTargetOverlay[]) {
      update((s) => ({ ...s, draftTargetOverlays: overlays }));
    }
  };
}

export const worldEffects = createWorldEffectsStore();
