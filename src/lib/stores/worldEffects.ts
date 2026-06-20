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

/** Ambient per-tile particle effect (e.g. a lair's smoke). `effect` selects the animation in
 *  WorldEffectsLayer; position is screen-space like every other overlay. */
export interface ParticleOverlay {
  id: string;
  left: number;
  top: number;
  effect: string; // 'smoke' | …
}

/** A ranged projectile in flight: its head's current screen position (lerped shooter→target each
 *  frame by GameCanvas), travel `angle` for orienting the glyph/trail, and `progress` (≥1 = impact). */
export interface ProjectileOverlay {
  id: string;
  left: number;
  top: number;
  angle: number; // degrees, travel direction
  effect: string; // 'arrow' | 'bolt' | 'stone' | 'spear'
  progress: number; // 0–1 flight; ≥1 → render the impact puff
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

export interface FloatingTextOverlay {
  id: string;
  left: number;
  top: number;
  text: string;
  kind: 'damage' | 'crit' | 'miss' | 'dodge' | 'bleed' | 'knockdown' | 'condition';
  /** Explicit colour for data-driven `kind: 'condition'` labels (else the per-kind CSS colour). */
  color?: string;
}

export interface WorldEffectsState {
  sleepingOverlays: SleepingOverlay[];
  /** Wounded pawns lying down to RECOVER (distinct red ✚ marker, vs the blue Zzz of plain sleep). */
  restingOverlays: SleepingOverlay[];
  /** Collapsed/downed pawns (pain/blood-loss/hunger) — a subtle red ↓ marker, vs the blue Zzz of sleep. */
  collapsedOverlays: SleepingOverlay[];
  progressOverlays: ProgressOverlay[];
  campfireOverlays: CampfireOverlay[];
  particleOverlays: ParticleOverlay[];
  projectileOverlays: ProjectileOverlay[];
  healthOverlays: HealthOverlay[];
  draftTargetOverlays: DraftTargetOverlay[];
  floatingTextOverlays: FloatingTextOverlay[];
  // Future effects — add here and handle in WorldEffectsLayer:
  // weather: 'none' | 'rain' | 'snow';
  // particleEffects: ParticleEffect[];
}

function createWorldEffectsStore() {
  const { subscribe, update } = writable<WorldEffectsState>({
    sleepingOverlays: [],
    restingOverlays: [],
    collapsedOverlays: [],
    progressOverlays: [],
    campfireOverlays: [],
    particleOverlays: [],
    projectileOverlays: [],
    healthOverlays: [],
    draftTargetOverlays: [],
    floatingTextOverlays: []
  });

  return {
    subscribe,
    setSleepingOverlays(overlays: SleepingOverlay[]) {
      update((s) => ({ ...s, sleepingOverlays: overlays }));
    },
    setRestingOverlays(overlays: SleepingOverlay[]) {
      update((s) => ({ ...s, restingOverlays: overlays }));
    },
    setCollapsedOverlays(overlays: SleepingOverlay[]) {
      update((s) => ({ ...s, collapsedOverlays: overlays }));
    },
    setProgressOverlays(overlays: ProgressOverlay[]) {
      update((s) => ({ ...s, progressOverlays: overlays }));
    },
    setCampfireOverlays(overlays: CampfireOverlay[]) {
      update((s) => ({ ...s, campfireOverlays: overlays }));
    },
    setParticleOverlays(overlays: ParticleOverlay[]) {
      update((s) => ({ ...s, particleOverlays: overlays }));
    },
    setProjectileOverlays(overlays: ProjectileOverlay[]) {
      update((s) => ({ ...s, projectileOverlays: overlays }));
    },
    setHealthOverlays(overlays: HealthOverlay[]) {
      update((s) => ({ ...s, healthOverlays: overlays }));
    },
    setDraftTargetOverlays(overlays: DraftTargetOverlay[]) {
      update((s) => ({ ...s, draftTargetOverlays: overlays }));
    },
    setFloatingTextOverlays(overlays: FloatingTextOverlay[]) {
      update((s) => ({ ...s, floatingTextOverlays: overlays }));
    }
  };
}

export const worldEffects = createWorldEffectsStore();
