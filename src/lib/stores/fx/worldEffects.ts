import { writable } from 'svelte/store';
import type { CombatTextKind } from '$lib/game/core/util/logSink';

export type GlyphFloatKind = 'sleep' | 'rest' | 'collapse' | 'winded' | 'campfire' | 'trade';
export interface GlyphFloat {
  id: string;
  left: number;
  top: number;
  kind: GlyphFloatKind;
}

export interface ProgressOverlay {
  id: string;
  left: number;
  top: number;
  progress: number;
}

export interface ParticleOverlay {
  id: string;
  left: number;
  top: number;
  effect: string;
}

export interface ProjectileOverlay {
  id: string;
  left: number;
  top: number;
  angle: number;
  effect: string;
  progress: number;
}

export interface HealthOverlay {
  id: string;
  left: number;
  top: number;
  health: number;
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
  kind: CombatTextKind;
  color?: string;
}

export interface WorldEffectsState {
  glyphFloats: GlyphFloat[];
  progressOverlays: ProgressOverlay[];
  particleOverlays: ParticleOverlay[];
  projectileOverlays: ProjectileOverlay[];
  healthOverlays: HealthOverlay[];
  draftTargetOverlays: DraftTargetOverlay[];
  floatingTextOverlays: FloatingTextOverlay[];
}

function createWorldEffectsStore() {
  const { subscribe, update } = writable<WorldEffectsState>({
    glyphFloats: [],
    progressOverlays: [],
    particleOverlays: [],
    projectileOverlays: [],
    healthOverlays: [],
    draftTargetOverlays: [],
    floatingTextOverlays: []
  });

  return {
    subscribe,
    setGlyphFloats(overlays: GlyphFloat[]) {
      update((s) => ({ ...s, glyphFloats: overlays }));
    },
    setProgressOverlays(overlays: ProgressOverlay[]) {
      update((s) => ({ ...s, progressOverlays: overlays }));
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
