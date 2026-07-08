// World-space effects layer store: GameCanvas writes overlay positions, WorldEffectsLayer renders.
import { writable } from 'svelte/store';

/** Anchored, looping glyph float pinned to a tile/entity (sleep Zzz, recovery ✚, campfire sparks…);
 *  `kind` selects the inner glyphs + animation in WorldEffectsLayer. */
export type GlyphFloatKind = 'sleep' | 'rest' | 'collapse' | 'winded' | 'campfire';
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
  progress: number; // 0–1
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
  kind: 'damage' | 'crit' | 'miss' | 'dodge' | 'bleed' | 'knockdown' | 'fracture' | 'condition';
  /** Explicit colour for data-driven `kind: 'condition'` labels (else the per-kind CSS colour). */
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
