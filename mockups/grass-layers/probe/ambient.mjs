import { readFileSync } from 'node:fs';
const src = readFileSync('/home/ubuntu/mockups/fantasia4x-hud/ambient.js', 'utf8');
const HUD = new Function(`${src.replace("'use strict';", '')}; return HUD;`)();
export const AM = HUD.ambient;
export function layerOps(hour) {
  const a = AM.compute(hour, 'clear');
  return { light: a.light, tint: a.tint, dusk: Math.max(0, Math.min(1, a.warm * 1.35)), night: a.night };
}
