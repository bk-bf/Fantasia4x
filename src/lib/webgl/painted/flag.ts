export const PAINTED_SWITCH = 'fantasia4x-painted-tiles';
export const PAINTED_LIGHT_SWITCH = 'fantasia4x-painted-light';

export function readPaintedFlag(search: string, stored: string | null): boolean {
  return new URLSearchParams(search).get('painted') === '1' || stored === '1';
}

export function readPaintedLightFlag(search: string, stored: string | null): boolean {
  return new URLSearchParams(search).get('light') !== 'old' && stored !== '0';
}

function readFromBrowser(key: string, read: (search: string, stored: string | null) => boolean) {
  if (typeof window === 'undefined') return false;
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(key);
  } catch {
    stored = null;
  }
  return read(window.location?.search ?? '', stored);
}

export const PAINTED_TILES = readFromBrowser(PAINTED_SWITCH, readPaintedFlag);

export const PAINTED_LIGHT =
  PAINTED_TILES && readFromBrowser(PAINTED_LIGHT_SWITCH, readPaintedLightFlag);
