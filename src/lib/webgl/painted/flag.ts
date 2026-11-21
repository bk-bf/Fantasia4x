export const PAINTED_SWITCH = 'fantasia4x-painted-tiles';
export const GROUND_BLEND_SWITCH = 'fantasia4x-ground-blend';

export function readPaintedFlag(search: string, stored: string | null): boolean {
  return new URLSearchParams(search).get('painted') === '1' || stored === '1';
}

export function readGroundBlendFlag(search: string, stored: string | null): boolean {
  return new URLSearchParams(search).get('blend') === '1' || stored === '1';
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

export const GROUND_BLEND =
  PAINTED_TILES && readFromBrowser(GROUND_BLEND_SWITCH, readGroundBlendFlag);
