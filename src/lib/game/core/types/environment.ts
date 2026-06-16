// Living-world environment types: seasons + weather (SEASONS_WEATHER spec, Phases B–C).
// Re-exported via the core/types barrel so `from '../core/types'` imports are unchanged.
//
// Perf note (SEASONS_WEATHER §0.5): `season`/`seasonDay`/`weather` are small top-level GameState
// scalars — the sectional-diff snapshot (W2) ships only the section that changed, so they are
// essentially free on the worker→main boundary. Tile `temperature` (types/world.ts) stays
// worker-only (dropped from the slim worldMapDelta — PERF-2).

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

/**
 * A weather id. DATA-DRIVEN: the set of weather types — and all their effects, visuals, and Markov
 * transitions — live in `database/weather.jsonc` (loaded by EnvironmentService). This is a plain
 * `string` so new weather can be added in the JSONC alone. The built-ins are: clear, rain, heavy_rain,
 * snow, blizzard, heat_wave, fog.
 */
export type WeatherType = string;

export interface WeatherState {
  type: WeatherType;
  /** 0.0–1.0 — drives both gameplay severity and the visual overlay. */
  intensity: number;
  /** Turns (ticks) until this weather is re-rolled by the Markov chain. */
  turnsRemaining: number;
  /**
   * Ambient wind 0.0–1.0 — a slowly-varying world scalar (its own daily random-walk), independent of
   * the weather *type*. It biases the connected-chain transitions (a `windScaled` branch like
   * rain→storm gets more likely as wind rises) and feeds the visual overlay slant alongside each
   * type's own `windStrength`. Optional for back-compat; defaults applied in EnvironmentService.
   */
  wind?: number;
}
