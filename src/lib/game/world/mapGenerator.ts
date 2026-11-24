export type MapGenerator = 'classic' | 'landforms';

export const MAP_GENERATOR_SWITCH = 'fantasia4x-mapgen';
export const LANDFORMS_MIN_DIM = 750;

export function readMapGeneratorFlag(search: string, stored: string | null): MapGenerator {
  const asked = new URLSearchParams(search).get('mapgen') ?? stored;
  return asked === 'classic' ? 'classic' : 'landforms';
}

function fromBrowser(): MapGenerator {
  if (typeof window === 'undefined') return 'landforms';
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(MAP_GENERATOR_SWITCH);
  } catch {
    stored = null;
  }
  return readMapGeneratorFlag(window.location?.search ?? '', stored);
}

let current: MapGenerator = fromBrowser();

export function getMapGenerator(): MapGenerator {
  return current;
}

export function setMapGenerator(next: MapGenerator): void {
  current = next;
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(MAP_GENERATOR_SWITCH, next);
  } catch {
    return;
  }
}

export function usesLandforms(generator: MapGenerator, w: number, h: number): boolean {
  return generator === 'landforms' && Math.min(w, h) >= LANDFORMS_MIN_DIM;
}
