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
  day: [
    '/audio/music/day-1.ogg',
    '/audio/music/day-2.ogg',
    '/audio/music/day-3.ogg',
    '/audio/music/day-4.ogg'
  ],
  night: ['/audio/music/night-1.ogg', '/audio/music/night-2.ogg'],
  combat: ['/audio/music/combat-1.ogg', '/audio/music/combat-2.ogg', '/audio/music/combat-3.ogg']
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

// ── Human labels (for the now-playing / debug UI — raw filenames + bed ids are backend refs only). ──
export const SCENE_LABELS: Record<MusicScene, string> = {
  menu: 'Menu',
  day: 'Day',
  night: 'Night',
  combat: 'Combat'
};

export const TRACK_LABELS: Record<string, string> = {
  '/audio/music/menu.ogg': 'Campaign',
  '/audio/music/day-1.ogg': 'Town',
  '/audio/music/day-2.ogg': 'Middle Age RPG Theme 1',
  '/audio/music/day-3.ogg': 'Castle',
  '/audio/music/day-4.ogg': 'Middle Age RPG Theme 2',
  '/audio/music/night-1.ogg': 'Caves of Sorrow',
  '/audio/music/night-2.ogg': 'Dark Quest',
  '/audio/music/combat-1.ogg': 'Battle Theme 1',
  '/audio/music/combat-2.ogg': 'Battle Theme 3',
  '/audio/music/combat-3.ogg': 'Battle Theme 5'
};

export const AMBIENT_LABELS: Record<AmbientBed, string> = {
  'birds-day': 'Birds (day)',
  'night-crickets': 'Crickets (night)',
  wind: 'Wind',
  rain: 'Rain',
  'rain-heavy': 'Heavy rain',
  forest: 'Forest'
};

/** Display title for a music track url (falls back to the bare filename). */
export function trackLabel(url: string | null): string {
  if (!url) return '—';
  return TRACK_LABELS[url] ?? url.split('/').pop() ?? url;
}

// ── Creature SFX ────────────────────────────────────────────────────────────────────────────────
// Per-creature vocalisations, keyed by a small ARCHETYPE id (a `creatures.jsonc` "audio" value). Many
// creatures share an archetype (every canine → "canine"). These play as INTERMITTENT ONE-SHOTS whose
// volume + trigger rate scale with on-screen audibility (zoom + viewport proximity + count) —
// computed in AudioController, played by audioService.playSfx. Each archetype lists 1+ clips; a random
// one fires per trigger. Files live in static/audio/creatures/<id>/N.ogg.

export type CreatureSoundId =
  | 'fowl'
  | 'raptor'
  | 'canine'
  | 'beast'
  | 'boar'
  | 'grunt'
  | 'goat'
  | 'critter'
  | 'frog'
  | 'insect'
  | 'reptile'
  | 'goblinoid'
  | 'wraith';

const clips = (id: string, n: number): string[] =>
  Array.from({ length: n }, (_, i) => `/audio/creatures/${id}/${i + 1}.ogg`);

export const CREATURE_SFX: Record<CreatureSoundId, string[]> = {
  fowl: clips('fowl', 1),
  raptor: clips('raptor', 2),
  canine: clips('canine', 3),
  beast: clips('beast', 3),
  boar: clips('boar', 3),
  grunt: clips('grunt', 5),
  goat: clips('goat', 1),
  critter: clips('critter', 4),
  frog: clips('frog', 2),
  insect: clips('insect', 4),
  reptile: clips('reptile', 3),
  goblinoid: clips('goblinoid', 6),
  wraith: clips('wraith', 5)
};

export const CREATURE_SOUND_LABELS: Record<CreatureSoundId, string> = {
  fowl: 'Fowl',
  raptor: 'Raptor',
  canine: 'Canine',
  beast: 'Beast',
  boar: 'Boar',
  grunt: 'Game',
  goat: 'Goat',
  critter: 'Critter',
  frog: 'Frog',
  insect: 'Insect',
  reptile: 'Reptile',
  goblinoid: 'Goblinoid',
  wraith: 'Wraith'
};

/** Clips for an archetype id, or [] if the id is unknown. */
export function creatureClips(id: string | undefined): string[] {
  return id && id in CREATURE_SFX ? CREATURE_SFX[id as CreatureSoundId] : [];
}

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
