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

/** Warm campfire light. */
const FIRE_COLOR: [number, number, number] = [1.0, 0.55, 0.22];
const FIRE_RADIUS = 6;
const FIRE_INTENSITY = 1.1;

/** Clamp ceiling so bright stacks of lights never blow past this multiplier. */
const MAX_LIGHT = 1.6;

class LightingServiceImpl {
    private emitters: LightEmitter[] = [];
    private ambientLight = 1.0;
    private ambientTint: [number, number, number] = [1.0, 1.0, 1.0];

    /** Replace the active emitter set (called each frame/turn from the canvas). */
    setEmitters(emitters: LightEmitter[]): void {
        this.emitters = emitters;
    }

    /** Mirror the current day/night ambient used as the multiplicative base. */
    setAmbient(light: number, tint: [number, number, number]): void {
        this.ambientLight = light;
        this.ambientTint = tint;
    }

    /**
     * Derive light emitters from the current buildings.
     * Only lit, completed campfires emit for now.
     */
    collectEmitters(buildings: PlacedBuilding[]): LightEmitter[] {
        const out: LightEmitter[] = [];
        for (const b of buildings) {
            if (b.type === 'campfire' && b.status === 'complete' && b.lit === true) {
                out.push({
                    x: b.x,
                    y: b.y,
                    color: FIRE_COLOR,
                    radius: FIRE_RADIUS,
                    intensity: FIRE_INTENSITY,
                    flicker: true
                });
            }
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
}

/**
 * Cheap layered-sine value noise in [0.85, 1.0] for fire flicker.
 * Two incommensurate frequencies per emitter index avoid visible repetition.
 */
function fireFlicker(time: number, seed: number): number {
    const n =
        Math.sin(time * 6.0 + seed * 1.7) * 0.5 + Math.sin(time * 11.3 + seed * 0.9) * 0.5;
    return 0.85 + 0.15 * (0.5 + 0.5 * n);
}

export const lightingService = new LightingServiceImpl();
