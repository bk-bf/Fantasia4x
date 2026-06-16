// Living-world environment types: seasons + weather (SEASONS_WEATHER spec, Phases B–C).
// Re-exported via the core/types barrel so `from '../core/types'` imports are unchanged.
//
// Perf note (SEASONS_WEATHER §0.5): `season`/`seasonDay`/`weather` are small top-level GameState
// scalars — the sectional-diff snapshot (W2) ships only the section that changed, so they are
// essentially free on the worker→main boundary. Tile `temperature` (types/world.ts) stays
// worker-only (dropped from the slim worldMapDelta — PERF-2).

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export type WeatherType =
  | 'clear'
  | 'rain'
  | 'heavy_rain'
  | 'snow'
  | 'blizzard'
  | 'heat_wave'
  | 'fog';

export interface WeatherState {
  type: WeatherType;
  /** 0.0–1.0 — drives both gameplay severity and the visual overlay. */
  intensity: number;
  /** Turns (ticks) until this weather is re-rolled by the Markov chain. */
  turnsRemaining: number;
  /** Optional absolute temperature delta for heat_wave / blizzard, °C (conceptual). */
  temperatureOverride?: number;
}
