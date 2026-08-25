import type { Season } from '$lib/game/core/types';

export type MusicScene = 'menu' | 'day' | 'night' | 'combat';

export type AmbientBed = 'birds-day' | 'night-crickets' | 'wind' | 'rain' | 'rain-heavy' | 'forest';

const MENU = ['/audio/music/all/menu/menu.ogg', '/audio/music/all/menu/menu-kingdom.ogg'];
const COMBAT = [
  '/audio/music/all/combat/combat-1.ogg',
  '/audio/music/all/combat/combat-2.ogg',
  '/audio/music/all/combat/combat-3.ogg',
  '/audio/music/all/combat/combat-4.ogg',
  '/audio/music/all/combat/combat-5.ogg'
];

const DAY_SHARED = [
  '/audio/music/all/day/day-1.ogg',
  '/audio/music/all/day/day-2.ogg',
  '/audio/music/all/day/day-3.ogg',
  '/audio/music/all/day/day-4.ogg',
  '/audio/music/all/day/day-5.ogg',
  '/audio/music/all/day/day-6.ogg',
  '/audio/music/all/day/day-7.ogg',
  '/audio/music/all/day/day-8.ogg'
];
const DAY_SEASONAL: Record<Season, string[]> = {
  spring: [],
  summer: [],
  autumn: [],
  winter: ['/audio/music/winter/day/magic-actions.ogg']
};
const NIGHT_SHARED = [
  '/audio/music/all/night/night-1.ogg',
  '/audio/music/all/night/night-2.ogg',
  '/audio/music/all/night/night-3.ogg',
  '/audio/music/all/night/night-4.ogg',
  '/audio/music/all/night/night-5.ogg'
];
const NIGHT_SEASONAL: Record<Season, string[]> = {
  spring: [],
  summer: [],
  autumn: [],
  winter: []
};

export function playlistFor(scene: MusicScene, season?: Season): string[] {
  switch (scene) {
    case 'menu':
      return MENU;
    case 'combat':
      return COMBAT;
    case 'day':
      return season ? [...DAY_SHARED, ...DAY_SEASONAL[season]] : DAY_SHARED;
    case 'night':
      return season ? [...NIGHT_SHARED, ...NIGHT_SEASONAL[season]] : NIGHT_SHARED;
  }
}

export const FIRE_LOOP = '/audio/ambient/fire.ogg';

export const UI_SFX = {
  hover: '/audio/ui/hover.ogg',
  click: '/audio/ui/click.ogg'
} as const;

export const THREAT_ALERT_SFX = '/audio/ui/threat-alert.ogg';

export const AMBIENT_FILES: Record<AmbientBed, string> = {
  'birds-day': '/audio/ambient/birds-day.ogg',
  'night-crickets': '/audio/ambient/night-crickets.ogg',
  wind: '/audio/ambient/wind.ogg',
  rain: '/audio/ambient/rain.ogg',
  'rain-heavy': '/audio/ambient/rain-heavy.ogg',
  forest: '/audio/ambient/forest.ogg'
};

export type AmbientLayers = Partial<Record<AmbientBed, number>>;

export const SCENE_LABELS: Record<MusicScene, string> = {
  menu: 'Menu',
  day: 'Day',
  night: 'Night',
  combat: 'Combat'
};

export const TRACK_LABELS: Record<string, string> = {
  '/audio/music/all/menu/menu.ogg': 'Campaign',
  '/audio/music/all/menu/menu-kingdom.ogg': 'Kingdom Theme',
  '/audio/music/all/day/day-1.ogg': 'Town',
  '/audio/music/all/day/day-2.ogg': 'Middle Age RPG Theme 1',
  '/audio/music/all/day/day-3.ogg': 'Castle',
  '/audio/music/all/day/day-4.ogg': 'Middle Age RPG Theme 2',
  '/audio/music/all/day/day-5.ogg': "The Bard's Tale",
  '/audio/music/all/day/day-6.ogg': 'Legend',
  '/audio/music/all/day/day-7.ogg': 'Medieval Theme 1',
  '/audio/music/all/day/day-8.ogg': 'Medieval Theme 2',
  '/audio/music/all/night/night-1.ogg': 'Caves of Sorrow',
  '/audio/music/all/night/night-2.ogg': 'Dark Quest',
  '/audio/music/all/night/night-3.ogg': 'A Darkness Opus',
  '/audio/music/all/night/night-4.ogg': 'Full of Memories',
  '/audio/music/all/night/night-5.ogg': 'He Will Never See Her Again',
  '/audio/music/all/combat/combat-1.ogg': 'Battle Theme 1',
  '/audio/music/all/combat/combat-2.ogg': 'Battle Theme 3',
  '/audio/music/all/combat/combat-3.ogg': 'Battle Theme 5',
  '/audio/music/all/combat/combat-4.ogg': 'For The King',
  '/audio/music/all/combat/combat-5.ogg': 'Light Battle',
  '/audio/music/winter/day/magic-actions.ogg': 'Magic Actions'
};

export const AMBIENT_LABELS: Record<AmbientBed, string> = {
  'birds-day': 'Birds (day)',
  'night-crickets': 'Crickets (night)',
  wind: 'Wind',
  rain: 'Rain',
  'rain-heavy': 'Heavy rain',
  forest: 'Forest'
};

export function trackLabel(url: string | null): string {
  if (!url) return '—';
  return TRACK_LABELS[url] ?? url.split('/').pop() ?? url;
}

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
  | 'wraith'
  | 'rustle';

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
  wraith: clips('wraith', 5),
  rustle: clips('rustle', 5)
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
  wraith: 'Wraith',
  rustle: 'Rustle'
};

export function creatureClips(id: string | undefined): string[] {
  return id && id in CREATURE_SFX ? CREATURE_SFX[id as CreatureSoundId] : [];
}

const workClips = (id: string, n: number): string[] =>
  Array.from({ length: n }, (_, i) => `/audio/work/${id}/${i + 1}.ogg`);

export const WORK_SFX: Record<string, string[]> = {
  woodcutting: workClips('woodcutting', 5),
  mining: workClips('mining', 5),
  construction: workClips('construction', 5),
  crafting: workClips('crafting', 5),
  foraging: workClips('foraging', 3),
  planting: workClips('planting', 3)
};

export const WORK_SOUND_LABELS: Record<string, string> = {
  woodcutting: 'Woodcutting',
  mining: 'Mining',
  construction: 'Building',
  crafting: 'Crafting',
  foraging: 'Foraging',
  planting: 'Planting'
};

export function workClipsFor(id: string | undefined): string[] {
  return id && id in WORK_SFX ? WORK_SFX[id] : [];
}

const combatClips = (id: string, n: number): string[] =>
  Array.from({ length: n }, (_, i) => `/audio/combat/${id}/${i + 1}.ogg`);

export const COMBAT_SFX: Record<string, string[]> = {
  slash: combatClips('slash', 2),
  pierce: combatClips('pierce', 2),
  blunt: combatClips('blunt', 2),
  bow: combatClips('bow', 2),
  bite: combatClips('bite', 2),
  venom: combatClips('venom', 2),
  screech: combatClips('screech', 2),
  spectral: combatClips('spectral', 2),
  tongue: combatClips('tongue', 1),
  knockdown: combatClips('knockdown', 1),
  fracture: combatClips('fracture', 1),
  shock: combatClips('shock', 1),
  envenomed: combatClips('envenomed', 1),
  disoriented: combatClips('disoriented', 1),
  ensnared: combatClips('ensnared', 1),
  bloodletting: combatClips('bloodletting', 1)
};

export function combatClipsFor(id: string | undefined): string[] {
  return id && id in COMBAT_SFX ? COMBAT_SFX[id] : [];
}

const RAIN_LIGHT = new Set(['drizzle', 'foggy_rain']);
const RAIN_MED = new Set(['rain', 'windy_rain']);
const RAIN_HEAVY = new Set(['heavy_rain', 'storm']);
const WINDY = new Set(['spring_windy', 'summer_windy', 'autumn_windy', 'winter_windy', 'gale']);

export function resolveAmbient(opts: {
  weatherType: string;
  isNight: boolean;
  intensity: number;
}): AmbientLayers {
  const { weatherType, isNight, intensity } = opts;
  const i = Math.max(0, Math.min(1, intensity));
  const layers: AmbientLayers = {};

  if (RAIN_HEAVY.has(weatherType)) {
    layers['rain-heavy'] = 0.55 + 0.35 * i;
  } else if (RAIN_MED.has(weatherType)) {
    layers.rain = 0.4 + 0.35 * i;
  } else if (RAIN_LIGHT.has(weatherType)) {
    layers.rain = 0.25 + 0.25 * i;
  }

  if (WINDY.has(weatherType) || weatherType === 'blizzard') {
    layers.wind = weatherType === 'gale' || weatherType === 'blizzard' ? 0.6 : 0.35;
  } else if (RAIN_HEAVY.has(weatherType) || weatherType === 'windy_rain') {
    layers.wind = 0.3;
  }

  const calm = !RAIN_HEAVY.has(weatherType) && weatherType !== 'storm';
  if (calm) {
    if (weatherType === 'snow') {
      layers.wind = Math.max(layers.wind ?? 0, 0.2);
    } else if (weatherType === 'fog') {
      layers.forest = 0.18;
    } else if (isNight) {
      layers['night-crickets'] = 0.45;
    } else if (weatherType === 'clear' || weatherType === 'heat_wave') {
      layers['birds-day'] = 0.4;
      layers.forest = 0.2;
    } else {
      layers.forest = isNight ? 0 : 0.15;
    }
  }

  return layers;
}
