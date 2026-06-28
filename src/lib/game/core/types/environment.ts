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
  /**
   * The DERIVED, labelled weather the rest of the game reads — the product of the two chains below via
   * `weather.jsonc` `grid` (e.g. precip `rain` × wind `gale` ⇒ `storm`). Effects/visuals are looked up
   * from its def.
   */
  type: WeatherType;
  /** 0.0–1.0 — drives both gameplay severity and the visual overlay. */
  intensity: number;
  /**
   * PRECIP-axis chain state (wet axis): `dry`/`drizzle`/`rain`/`heavy_rain` (+ `snow`/`fog`/
   * `foggy_rain`/`heat_wave`). Optional for back-compat — recovered from `type` when absent.
   */
  precip?: string;
  /** WIND-axis chain level (windy axis): `calm`/`breezy`/`windy`/`gale`. Recovered from `type` when absent. */
  windLevel?: string;
  /** Turns (ticks) until the PRECIP chain re-rolls. */
  turnsRemaining: number;
  /** Turns (ticks) until the WIND chain re-rolls (its own independent spell). */
  windTurns?: number;
  /**
   * Ambient wind 0.0–1.0 — the live scalar that drives windchill and the visual overlay slant. It
   * random-walks but stays inside the `windLevel`'s band (weather.jsonc `wind.bands`), so the readout
   * always matches the wind level (and thus the derived `type`). Optional for back-compat.
   */
  wind?: number;
  /**
   * Ambient wind DIRECTION as an 8-way compass index (0=N, 1=NE, 2=E … 7=NW), the way the wind
   * BLOWS TOWARD. Drifts slowly on day boundaries (occasional ±1 rotation) alongside `wind`. Gameplay
   * uses it to cast a downwind shelter shadow behind impassable tiles (walls/mountains) so the lee
   * side is calm. Optional for back-compat; defaults applied in EnvironmentService.
   */
  windDir?: number;
  /**
   * Which way the PRECIP chain is travelling: `rising` (intensifying) or `falling` (calming). Reaching
   * the wet climax (`heavy_rain`) flips it to `falling`; returning to `dry` resets it to `rising`;
   * otherwise it carries forward. Drizzle reads it so a drizzle on the way DOWN from rain strongly
   * clears, while a drizzle building UP from dry can still develop into rain. Defaults to `rising`.
   */
  phase?: 'rising' | 'falling';
}
