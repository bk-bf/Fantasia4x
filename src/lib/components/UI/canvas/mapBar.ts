import { toArt } from '$lib/pixelArt/picture';
import type { RampName } from '$lib/pixelArt/palette';
import { SKINS } from '$lib/pixelArt/skins';
import type { ThemeId } from '$lib/components/UI/theme/themes';

export const MAP_BAR_W = 24;
export const MAP_BAR_H = 5;

const painted = new Map<string, string>();

export function mapBarUrl(theme: ThemeId, ramp: RampName, frac: number): string {
  const span = MAP_BAR_W - 2;
  const fill = Math.round(span * Math.max(0, Math.min(1, frac)));
  const key = `${theme}|${ramp}|${fill}`;
  let url = painted.get(key);
  if (!url) {
    url = toArt(SKINS[theme].bar(MAP_BAR_W, MAP_BAR_H, fill / span, ramp)).url;
    painted.set(key, url);
  }
  return url;
}
