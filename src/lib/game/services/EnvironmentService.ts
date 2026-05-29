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
 * Ambient brightness in [0.15, 1.0], interpolated from AMBIENT_KEYFRAMES.
 *
 * The curve deliberately keeps full daylight through the afternoon and only
 * begins to fall off around 19:00, reaching night levels near 22:00 — so the
 * world does not darken too early. Midnight floors at 0.15 so glyphs stay
 * readable. Both the WebGL map and the HTML panels read from this single
 * value, keeping their brightness in lock-step.
 */
export function getAmbientLight(turn: number): number {
    const { a, b, f } = resolveKeyframes(getTimeOfDay(turn));
    return lerp(a.light, b.light, f);
}

/**
 * Unified ambient keyframes — t = timeOfDay (0.0 = midnight, 0.5 = noon).
 * t=0.00 and t=1.00 carry the same values so the day wraps seamlessly.
 *
 * `light` — scalar brightness [0.15, 1.0]; drives BOTH the WebGL ambient and
 *           the panel brightness (panels remap it with a higher floor), so the
 *           map and the sidebars dim and brighten together.
 * `tint`  — RGB multiplier used by the WebGL fragment shader (can go cool/blue).
 * `cssSp` — CSS sepia() for panel elements (0 = unchanged, 1 = full amber-brown).
 * `cssHr` — CSS hue-rotate() in degrees for panel elements.
 *
 * CSS params intentionally stay in the WARM range (hue-rotate ≤ 0°, i.e. shifting
 * amber toward orange/red) so transitions NEVER pass through pink on the hue wheel.
 * Night is handled with brightness-only — panels stay brownish, just dimmer.
 */
interface AmbientKeyframe {
    t: number;
    /** Scalar brightness [0.15, 1.0] — drives WebGL u_ambient AND panel dimming. */
    light: number;
    /**
     * NORMALISED colour (brightest channel ≈ 1.0) — carries HUE only, never
     * brightness. The shader multiplies it by `light`, so brightness comes
     * solely from `light`; keeping tint normalised means the brightest channel
     * never falls below `light` (0.15 floor) and glyphs stay visible at night.
     */
    tint: [number, number, number];
}

const AMBIENT_KEYFRAMES: AmbientKeyframe[] = [
    //  t      clock        light  normalised tint (hue only)
    { t: 0.0, light: 0.15, tint: [0.45, 0.5, 1.0] }, // 00:00 midnight — cold blue
    { t: 0.22, light: 0.15, tint: [0.5, 0.52, 0.98] }, // 05:18 pre-dawn — blue
    { t: 0.28, light: 0.45, tint: [1.0, 0.62, 0.34] }, // 06:43 dawn — warm orange
    { t: 0.34, light: 0.85, tint: [1.0, 0.92, 0.8] }, // 08:10 morning — warm white
    { t: 0.5, light: 1.0, tint: [1.0, 1.0, 1.0] }, // 12:00 noon — neutral
    { t: 0.67, light: 1.0, tint: [1.0, 0.97, 0.9] }, // 16:00 afternoon — faint warm
    { t: 0.79, light: 0.85, tint: [1.0, 0.82, 0.55] }, // 19:00 evening — golden
    { t: 0.85, light: 0.5, tint: [1.0, 0.52, 0.34] }, // 20:24 dusk — deep orange
    { t: 0.91, light: 0.28, tint: [0.78, 0.5, 0.72] }, // 21:50 late dusk — violet
    { t: 0.96, light: 0.18, tint: [0.52, 0.52, 0.96] }, // 23:00 night — blue
    { t: 1.0, light: 0.15, tint: [0.45, 0.5, 1.0] }, // 24:00 midnight wrap
];

function lerp(a: number, b: number, f: number): number {
    return a + (b - a) * f;
}

function lerpTint(
    a: [number, number, number],
    b: [number, number, number],
    f: number
): [number, number, number] {
    return [lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f)];
}

/** Find the two surrounding keyframes and return an interpolation factor [0,1]. */
function resolveKeyframes(t: number): { a: AmbientKeyframe; b: AmbientKeyframe; f: number } {
    for (let i = 0; i < AMBIENT_KEYFRAMES.length - 1; i++) {
        const a = AMBIENT_KEYFRAMES[i];
        const b = AMBIENT_KEYFRAMES[i + 1];
        if (t >= a.t && t <= b.t) {
            return { a, b, f: (t - a.t) / (b.t - a.t) };
        }
    }
    const last = AMBIENT_KEYFRAMES[AMBIENT_KEYFRAMES.length - 1];
    return { a: last, b: last, f: 0 };
}

/**
 * Ambient colour tint as an RGB triple used by the WebGL fragment shader.
 * Linearly interpolated between keyframes — no hard phase boundaries.
 */
export function getAmbientTint(turn: number): [number, number, number] {
    const { a, b, f } = resolveKeyframes(getTimeOfDay(turn));
    return lerpTint(a.tint, b.tint, f);
}

/**
 * Per-channel RGB multiplier for HTML panels.
 *
 * Applied via an SVG `feColorMatrix` (see +page.svelte) so panels are tinted by
 * the same hue the map uses — cool blue at night, warm amber at dawn/dusk — by
 * multiplying each colour channel directly. This avoids the pink artifact CSS
 * `hue-rotate` produces when rotating amber toward blue.
 *
 * Brightness and hue are computed SEPARATELY so the colour stays visible even
 * when the scene is dim. If hue were multiplied by `light`, night would crush
 * all channels toward the floor and wash the blue out — which is exactly what
 * looked "too subtle". Instead:
 *   - `bright` dims with `light` but floors at PANEL_BRIGHT_FLOOR for legibility.
 *   - `sat` mixes white→tint at a constant strength, so the hue reads clearly
 *     at any brightness. PANEL_SAT tunes how strong the tint is.
 */
const PANEL_BRIGHT_FLOOR = 0.45;
const PANEL_SAT = 0.55;
export function getPanelTint(turn: number): [number, number, number] {
    const light = getAmbientLight(turn);
    const tint = getAmbientTint(turn);
    const bright = PANEL_BRIGHT_FLOOR + (1 - PANEL_BRIGHT_FLOOR) * light;
    // mix(1.0, c, PANEL_SAT) — pull each channel from white toward the tint hue.
    const mul = (c: number) => bright * (1 - PANEL_SAT + PANEL_SAT * c);
    return [mul(tint[0]), mul(tint[1]), mul(tint[2])];
}

export interface AmbientState {
    /** Scalar brightness for WebGL u_ambient. */
    light: number;
    /** Normalised RGB hue for WebGL u_ambient_tint. */
    tint: [number, number, number];
    /** Per-channel RGB multiplier for the panel feColorMatrix tint. */
    panelTint: [number, number, number];
}

class EnvironmentServiceImpl {
    getAmbient(turn: number): AmbientState {
        return {
            light: getAmbientLight(turn),
            tint: getAmbientTint(turn),
            panelTint: getPanelTint(turn)
        };
    }
}

export const environmentService = new EnvironmentServiceImpl();
