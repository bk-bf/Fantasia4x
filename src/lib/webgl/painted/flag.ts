export const PAINTED_SWITCH = 'fantasia4x-painted-tiles';
export const GROUND_BLEND_SWITCH = 'fantasia4x-ground-blend';
export const PAINTED_LIGHT_SWITCH = 'fantasia4x-painted-light';
export const TIERS_SWITCH = 'fantasia4x-rock-tiers';

function onUnless(param: string, off: string) {
  return (search: string, stored: string | null): boolean =>
    new URLSearchParams(search).get(param) !== off && stored !== '0';
}

export const readPaintedFlag = onUnless('painted', '0');
export const readGroundBlendFlag = onUnless('blend', '0');
export const readPaintedLightFlag = onUnless('light', 'old');
export const readTiersFlag = onUnless('tiers', '0');

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
export const PAINTED_LIGHT =
  PAINTED_TILES && readFromBrowser(PAINTED_LIGHT_SWITCH, readPaintedLightFlag);
export const ROCK_TIERS = PAINTED_TILES && readFromBrowser(TIERS_SWITCH, readTiersFlag);
