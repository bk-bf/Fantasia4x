/* filepath: src/lib/game/services/EnvironmentService.ts */
/**
 * EnvironmentService — Day/Night ambient light & tint (Phase A)
 *
 * Computes per-turn ambient brightness and colour tint driven by the
 * sinusoidal day/night curve specified in LIVING-WORLD.md §Subsystem 1.
 *
 * No mutable state — all methods are pure functions of turn number.
 * Season / weather phases (B–D) will be added here when implemented.
 */

export const TURNS_PER_DAY = 300;

/**
 * Map turn → fractional time-of-day in [0, 1).
 * 0.0 = midnight, 0.25 = 06:00, 0.5 = noon, 0.75 = 18:00.
 */
export function getTimeOfDay(turn: number): number {
    return (turn % TURNS_PER_DAY) / TURNS_PER_DAY;
}

/**
 * Ambient brightness in [0.15, 1.0].
 * Sinusoidal sunrise/sunset with a 0.15 floor so glyphs remain readable at night.
 *
 *   ambientLight = clamp(sin(π * t), 0, 1) * 0.85 + 0.15
 *   t = timeOfDay remapped so midnight = 0 and noon = 1:
 *       t_mapped = (timeOfDay + 0.5) % 1.0  →  midnight wraps to 0.0, noon = 0.5
 *
 * We use two half-periods:
 *   dawn  = t in [0, 0.5]  → sin rising  0 → 1 → 0 maps nicely to sin(π*t_mapped)
 */
export function getAmbientLight(turn: number): number {
    const t = getTimeOfDay(turn);
    // Remap so that t=0 (midnight) produces the nadir.  A full period sin wave:
    // sin( 2π * (t - 0.25) ) gives -1 at midnight (t=0), +1 at noon (t=0.5).
    // We clamp the negative portion to 0 and scale.
    const raw = Math.sin(2 * Math.PI * (t - 0.25)); // [-1, 1]
    const clamped = Math.max(0, raw);                // [0, 1]
    return clamped * 0.85 + 0.15;                    // [0.15, 1.0]
}

/** Colour phases from the LIVING-WORLD spec (t = timeOfDay). */
const TINT_PHASES: Array<{ maxT: number; tint: [number, number, number] }> = [
    { maxT: 0.10, tint: [0.05, 0.05, 0.15] }, // deep night   0.00–0.10
    { maxT: 0.20, tint: [0.9, 0.5, 0.2] }, // dawn         0.10–0.20
    { maxT: 0.35, tint: [1.0, 0.85, 0.7] }, // morning      0.20–0.35
    { maxT: 0.65, tint: [1.0, 1.0, 1.0] }, // noon         0.35–0.65
    { maxT: 0.80, tint: [1.0, 0.8, 0.5] }, // evening      0.65–0.80
    { maxT: 0.90, tint: [0.7, 0.3, 0.2] }, // dusk         0.80–0.90
    { maxT: 1.00, tint: [0.1, 0.1, 0.3] }, // night        0.90–1.00
];

/** Ambient colour tint as an RGB triple with each channel in [0, 1]. */
export function getAmbientTint(turn: number): [number, number, number] {
    const t = getTimeOfDay(turn);
    for (const phase of TINT_PHASES) {
        if (t < phase.maxT) return phase.tint;
    }
    return TINT_PHASES[TINT_PHASES.length - 1].tint;
}

export interface AmbientState {
    light: number;
    tint: [number, number, number];
}

class EnvironmentServiceImpl {
    getAmbient(turn: number): AmbientState {
        return {
            light: getAmbientLight(turn),
            tint: getAmbientTint(turn)
        };
    }
}

export const environmentService = new EnvironmentServiceImpl();
