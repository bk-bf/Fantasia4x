// manifest.ts — the data-driven audio definition layer (the "what plays when", separate from the
// AudioService "how"). Maps music SCENES → track playlists, and resolves the nature AMBIENT beds
// from the live weather + day/night state. All files live under static/audio/ and are served at
// /audio/... (same-origin in dev via Vite, bundled from static/ in a production build — so this works
// identically in the browser and inside the Electron webview, no IPC).
//
// Adding/renaming a track: drop the file in static/audio/{music,ambient}/, update the path here, and
// (for CC-BY) add the attribution to AUDIO-CREDITS.md. Nothing else references the filenames.

/** Music layer — exactly one scene is active at a time (priority resolved in AudioController). */
export type MusicScene = 'menu' | 'day' | 'night' | 'combat';

/** Nature ambient beds — several can layer simultaneously (e.g. rain + wind), each with its own gain. */
export type AmbientBed = 'birds-day' | 'night-crickets' | 'wind' | 'rain' | 'rain-heavy' | 'forest';

/**
 * Per-scene playlists. A scene with multiple tracks is played as a shuffled sequence (AudioService
 * advances on track end); a single-track scene effectively loops. Keep entries in sync with the files
 * actually present in static/audio/music/ — a missing file just fails to load (Howler onloaderror),
 * it won't crash the app.
 */
export const MUSIC: Record<MusicScene, string[]> = {
  menu: ['/audio/music/menu.ogg'],
  day: ['/audio/music/day-lofi-1.ogg', '/audio/music/day-lofi-2.ogg', '/audio/music/day-lofi-3.ogg'],
  night: ['/audio/music/night-1.ogg', '/audio/music/night-2.ogg'],
  combat: ['/audio/music/combat-1.ogg', '/audio/music/combat-2.ogg']
};

/** Bed id → looping source file. */
export const AMBIENT_FILES: Record<AmbientBed, string> = {
  'birds-day': '/audio/ambient/birds-day.ogg',
  'night-crickets': '/audio/ambient/night-crickets.ogg',
  wind: '/audio/ambient/wind.ogg',
  rain: '/audio/ambient/rain.ogg',
  'rain-heavy': '/audio/ambient/rain-heavy.ogg',
  forest: '/audio/ambient/forest.ogg'
};

/** Target gains for each currently-audible bed (0–1). Beds omitted from the map fade to silence. */
export type AmbientLayers = Partial<Record<AmbientBed, number>>;

// Weather-type → bed grouping. Mirrors the overlay/windStrength semantics in weather.jsonc so the
// audio bed matches what the player sees: precipitation overlays → rain bed; windy/gale/blizzard →
// wind bed. (Kept as plain sets so a new weather id simply falls through to the calm default.)
const RAIN_LIGHT = new Set(['drizzle', 'foggy_rain']);
const RAIN_MED = new Set(['rain', 'windy_rain']);
const RAIN_HEAVY = new Set(['heavy_rain', 'storm']);
const WINDY = new Set(['spring_windy', 'summer_windy', 'autumn_windy', 'winter_windy', 'gale']);

/**
 * Resolve the ambient bed mix from the live environment. `intensity` is weather.intensity (0–1) and
 * scales the precipitation beds so a drizzle is quieter than a downpour; the calm birds/crickets/forest
 * beds use fixed gentle gains. Returns target gains AudioService crossfades toward.
 */
export function resolveAmbient(opts: {
  weatherType: string;
  isNight: boolean;
  intensity: number;
}): AmbientLayers {
  const { weatherType, isNight, intensity } = opts;
  const i = Math.max(0, Math.min(1, intensity));
  const layers: AmbientLayers = {};

  // Precipitation beds (mutually exclusive tiers), scaled by intensity.
  if (RAIN_HEAVY.has(weatherType)) {
    layers['rain-heavy'] = 0.55 + 0.35 * i;
  } else if (RAIN_MED.has(weatherType)) {
    layers.rain = 0.4 + 0.35 * i;
  } else if (RAIN_LIGHT.has(weatherType)) {
    layers.rain = 0.25 + 0.25 * i;
  }

  // Wind bed — windy/gale weathers, plus a layer under heavy rain/storm and blizzards/winter wind.
  if (WINDY.has(weatherType) || weatherType === 'blizzard') {
    layers.wind = weatherType === 'gale' || weatherType === 'blizzard' ? 0.6 : 0.35;
  } else if (RAIN_HEAVY.has(weatherType) || weatherType === 'windy_rain') {
    layers.wind = 0.3;
  }

  // Calm bed — only when there's no heavy precipitation drowning it out.
  const calm = !RAIN_HEAVY.has(weatherType) && weatherType !== 'storm';
  if (calm) {
    if (weatherType === 'snow') {
      layers.wind = Math.max(layers.wind ?? 0, 0.2); // soft snow hiss
    } else if (weatherType === 'fog') {
      layers.forest = 0.18; // muffled stillness
    } else if (isNight) {
      layers['night-crickets'] = 0.45;
    } else if (weatherType === 'clear' || weatherType === 'heat_wave') {
      layers['birds-day'] = 0.4;
      layers.forest = 0.2;
    } else {
      // windy-but-dry daytime — keep a faint forest under the wind.
      layers.forest = isNight ? 0 : 0.15;
    }
  }

  return layers;
}
