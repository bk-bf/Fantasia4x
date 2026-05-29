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

/**
 * Derive a CSS filter string from ambient brightness + tint.
 *
 * Strategy (works well for the dark amber terminal theme):
 *   1. brightness()  — scaled from ambient light, floored at 0.5 so panels
 *      remain readable even at midnight.
 *   2. sepia()       — converts the existing amber palette toward a neutral
 *      warm brown, controlled by the tint's colour saturation.
 *   3. hue-rotate()  — shifts from the sepia base hue (~36° warm amber) to
 *      the dominant hue of the ambient tint.  Blue night = −156°, orange
 *      dawn = −10°, neutral noon = nothing.
 */
export function getAmbientCssFilter(light: number, tint: [number, number, number]): string {
    const brightness = Math.max(0.5, light);
    const [r, g, b] = tint;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;

    // Essentially neutral (white / grey) — brightness only
    if (delta < 0.05) {
        return brightness >= 0.995 ? 'none' : `brightness(${brightness.toFixed(2)})`;
    }

    // HSL hue of the tint colour (0–360°)
    let hue: number;
    if (max === r) {
        hue = 60 * (((g - b) / delta + 6) % 6);
    } else if (max === g) {
        hue = 60 * ((b - r) / delta + 2);
    } else {
        hue = 60 * ((r - g) / delta + 4);
    }

    // sepia(1) maps toward ~36° (warm amber/brown) — the same tone as the
    // existing panel theme, so sepia alone is subtle.  hue-rotate then
    // nudges from that base toward the ambient tint's hue.
    const SEPIA_HUE = 36;
    let hueShift = hue - SEPIA_HUE;
    if (hueShift > 180) hueShift -= 360;
    if (hueShift < -180) hueShift += 360;

    const saturation = delta / max;
    const sepia = Math.min(0.35, saturation * 0.45);

    return (
        `brightness(${brightness.toFixed(2)})` +
        ` sepia(${sepia.toFixed(2)})` +
        ` hue-rotate(${Math.round(hueShift)}deg)`
    );
}

export interface AmbientState {
    light: number;
    tint: [number, number, number];
    /** Ready-to-use CSS filter string for HTML panel elements. */
    cssFilter: string;
}

class EnvironmentServiceImpl {
    getAmbient(turn: number): AmbientState {
        const light = getAmbientLight(turn);
        const tint = getAmbientTint(turn);
        return {
            light,
            tint,
            cssFilter: getAmbientCssFilter(light, tint)
        };
    }
}

export const environmentService = new EnvironmentServiceImpl();
