/* filepath: src/lib/game/services/LightingService.ts */
/**
 * LightingService — per-tile dynamic point lighting (Phase A2)
 *
 * See LIVING-WORLD.md §Subsystem 5 "Dynamic point lighting". Computes a coloured
 * light value for any world tile coordinate by combining:
 *   - the global day/night ambient (multiplicative darkening), and
 *   - additive contributions from point-light emitters (campfires, …).
 *
 * The renderer samples this field at every tile CORNER and uploads the result as
 * a per-vertex attribute, so the GPU interpolates smooth gradients across quads
 * for free — no per-pixel cost, no blocky lit squares.
 *
 * Pure presentation: emitters are derived from GameState, never persisted, and
 * this service never mutates GameState. Radial falloff has no occlusion, so per
 * ADR-008 it is NOT spatial logic and correctly lives in TypeScript. Shadow /
 * light occlusion is deferred to the WASM spatial service.
 */

import type { PlacedBuilding } from '../core/types.js';
import { buildingService } from './BuildingService';

export interface LightEmitter {
  /** Tile X (world coords). */
  x: number;
  /** Tile Y (world coords). */
  y: number;
  /** Normalised RGB light colour (e.g. fire = [1.0, 0.55, 0.2]). */
  color: [number, number, number];
  /** Falloff radius in tiles. */
  radius: number;
  /** Peak additive strength at the source. */
  intensity: number;
  /** Whether this emitter flickers (fire). */
  flicker?: boolean;
}

/** Warm fire light — the default colour/intensity for any building that doesn't override them. */
export const FIRE_COLOR: [number, number, number] = [1.0, 0.55, 0.22];
export const FIRE_INTENSITY = 1.1;

/**
 * Resolve a completed building's light emission from its def, or null if it isn't currently
 * emitting. A building emits when it has a `lightRadius` and is complete; a fuelled one
 * (maxFuel>0) additionally must be `lit`. Shared by the renderer (collectEmitters) and the
 * gameplay/UI tile-light readout (EnvironmentService) so both agree on what glows.
 */
export function buildingLight(
  b: { type: string; status: string; lit?: boolean }
): { radius: number; intensity: number; color: [number, number, number] } | null {
  if (b.status !== 'complete') return null;
  const def = buildingService.getBuildingById(b.type);
  if (!def?.lightRadius) return null;
  const needsFuel = (def.maxFuel ?? 0) > 0;
  if (needsFuel && b.lit !== true) return null;
  return {
    radius: def.lightRadius,
    intensity: def.lightIntensity ?? FIRE_INTENSITY,
    color: def.lightColor ?? FIRE_COLOR
  };
}

/** Clamp ceiling so bright stacks of lights never blow past this multiplier. */
const MAX_LIGHT = 1.6;

class LightingServiceImpl {
  private emitters: LightEmitter[] = [];
  private ambientLight = 1.0;
  private ambientTint: [number, number, number] = [1.0, 1.0, 1.0];
  // Monotonic version that bumps whenever the emitter SET changes (a campfire is
  // lit/extinguished/moved). The renderer bakes flicker-free light into the vertex
  // buffer and only rebuilds when this changes; flicker is a per-frame shader uniform.
  private emittersVersion = 0;
  private emittersSignature = '';

  /** Replace the active emitter set (called each frame/turn from the canvas). */
  setEmitters(emitters: LightEmitter[]): void {
    this.emitters = emitters;
    // Cheap signature of position + radius + intensity so the version only bumps
    // on a real change, not on every frame's freshly-allocated array.
    let sig = '';
    for (const e of emitters) sig += `${e.x},${e.y},${e.radius},${e.intensity}|`;
    if (sig !== this.emittersSignature) {
      this.emittersSignature = sig;
      this.emittersVersion++;
    }
  }

  /** Version of the current emitter set; changes only when emitters are added/removed/moved. */
  getEmittersVersion(): number {
    return this.emittersVersion;
  }

  /** Global fire-flicker scalar (~0.85..1.0) applied as a shader uniform. */
  flicker(time: number): number {
    return fireFlicker(time, 0);
  }

  /** Mirror the current day/night ambient used as the multiplicative base. */
  setAmbient(light: number, tint: [number, number, number]): void {
    this.ambientLight = light;
    this.ambientTint = tint;
  }

  /**
   * Derive light emitters from the current buildings — data-driven: any completed building with
   * a `lightRadius` in its def emits (fuelled ones only while lit). See {@link buildingLight}.
   */
  collectEmitters(buildings: PlacedBuilding[]): LightEmitter[] {
    const out: LightEmitter[] = [];
    for (const b of buildings) {
      const light = buildingLight(b);
      if (!light) continue;
      out.push({
        x: b.x,
        y: b.y,
        color: light.color,
        radius: light.radius,
        intensity: light.intensity,
        flicker: true
      });
    }
    return out;
  }

  /**
   * Sample the light field at a world tile corner.
   * @param wx world X (tile units, fractional corners allowed)
   * @param wy world Y
   * @param time seconds — snapshot once per frame so shared corners match exactly
   * @returns RGB multiplier the fragment shader applies to the tile colour
   */
  sample(wx: number, wy: number, time: number): [number, number, number] {
    // Multiplicative ambient base (day/night).
    let r = this.ambientLight * this.ambientTint[0];
    let g = this.ambientLight * this.ambientTint[1];
    let b = this.ambientLight * this.ambientTint[2];

    // Additive point lights.
    for (let i = 0; i < this.emitters.length; i++) {
      const e = this.emitters[i];
      const dx = wx - e.x - 0.5; // emitter sits at tile centre
      const dy = wy - e.y - 0.5;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist >= e.radius) continue;

      // Smooth falloff: 1 at source → 0 at the radius edge.
      const d = dist / e.radius;
      const falloff = (1 - d) * (1 - d);

      // Per-emitter flicker (deterministic in `time` so corners stay seamless).
      const flick = e.flicker ? fireFlicker(time, i) : 1.0;
      const add = e.intensity * falloff * flick;

      r += e.color[0] * add;
      g += e.color[1] * add;
      b += e.color[2] * add;
    }

    return [Math.min(r, MAX_LIGHT), Math.min(g, MAX_LIGHT), Math.min(b, MAX_LIGHT)];
  }

  /**
   * Sample ONLY the additive point-light contribution at a world tile corner
   * (no ambient). The renderer bakes this into the vertex buffer and adds the
   * global day/night ambient as a shader uniform, so ambient changes never
   * force a vertex-buffer rebuild. Returns [0,0,0] when no emitter is in range.
   */
  samplePointOnly(wx: number, wy: number, time: number): [number, number, number] {
    let r = 0;
    let g = 0;
    let b = 0;
    for (let i = 0; i < this.emitters.length; i++) {
      const e = this.emitters[i];
      const dx = wx - e.x - 0.5;
      const dy = wy - e.y - 0.5;
      // Cheap AABB reject: if either axis offset already exceeds the radius the
      // tile cannot be lit, so skip the sqrt for the (vast) majority of tiles.
      if (dx <= -e.radius || dx >= e.radius || dy <= -e.radius || dy >= e.radius) continue;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist >= e.radius) continue;

      const d = dist / e.radius;
      const falloff = (1 - d) * (1 - d);
      const flick = e.flicker ? fireFlicker(time, i) : 1.0;
      const add = e.intensity * falloff * flick;

      r += e.color[0] * add;
      g += e.color[1] * add;
      b += e.color[2] * add;
    }
    return [r, g, b];
  }

  /** Whether any point-light emitters are currently active. */
  hasEmitters(): boolean {
    return this.emitters.length > 0;
  }

  /**
   * Axis-aligned bounding box (world tile coords) enclosing every emitter's
   * reach, or null when nothing is lit. The renderer uses it to skip light
   * sampling for tiles that no emitter can reach, so lighting cost scales with
   * the lit area rather than the whole map.
   */
  getLitBounds(): { minX: number; minY: number; maxX: number; maxY: number } | null {
    if (this.emitters.length === 0) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < this.emitters.length; i++) {
      const e = this.emitters[i];
      const cx = e.x + 0.5; // emitter sits at tile centre (matches samplePoint*)
      const cy = e.y + 0.5;
      if (cx - e.radius < minX) minX = cx - e.radius;
      if (cy - e.radius < minY) minY = cy - e.radius;
      if (cx + e.radius > maxX) maxX = cx + e.radius;
      if (cy + e.radius > maxY) maxY = cy + e.radius;
    }
    return { minX, minY, maxX, maxY };
  }

  /**
   * Sample ONLY the additive point-light contribution WITHOUT flicker. Used by
   * the renderer to bake a static a_light vertex attribute; the time-varying
   * flicker is applied globally via a shader uniform so the terrain buffer stays
   * stable while a fire is lit. Returns [0,0,0] when no emitter is in range.
   */
  samplePointStatic(wx: number, wy: number): [number, number, number] {
    let r = 0;
    let g = 0;
    let b = 0;
    for (let i = 0; i < this.emitters.length; i++) {
      const e = this.emitters[i];
      const dx = wx - e.x - 0.5;
      const dy = wy - e.y - 0.5;
      // Cheap AABB reject: if either axis offset already exceeds the radius the
      // tile cannot be lit, so skip the sqrt for the (vast) majority of tiles.
      if (dx <= -e.radius || dx >= e.radius || dy <= -e.radius || dy >= e.radius) continue;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist >= e.radius) continue;

      const d = dist / e.radius;
      const falloff = (1 - d) * (1 - d);
      const add = e.intensity * falloff;

      r += e.color[0] * add;
      g += e.color[1] * add;
      b += e.color[2] * add;
    }
    return [r, g, b];
  }
}

/**
 * Cheap layered-sine value noise in [0.85, 1.0] for fire flicker.
 * Two incommensurate frequencies per emitter index avoid visible repetition.
 */
function fireFlicker(time: number, seed: number): number {
  const n = Math.sin(time * 6.0 + seed * 1.7) * 0.5 + Math.sin(time * 11.3 + seed * 0.9) * 0.5;
  return 0.85 + 0.15 * (0.5 + 0.5 * n);
}

export const lightingService = new LightingServiceImpl();
