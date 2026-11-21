export const PAINTED_SWITCH = 'fantasia4x-painted-tiles';

export function readPaintedFlag(search: string, stored: string | null): boolean {
  return new URLSearchParams(search).get('painted') === '1' || stored === '1';
}

function readFromBrowser(): boolean {
  if (typeof window === 'undefined') return false;
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(PAINTED_SWITCH);
  } catch {
    stored = null;
  }
  return readPaintedFlag(window.location?.search ?? '', stored);
}

export const PAINTED_TILES = readFromBrowser();
