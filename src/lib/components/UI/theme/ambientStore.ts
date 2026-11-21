import { derived } from 'svelte/store';
import { gameState } from '$lib/stores/gameState';
import { dayNightTint, uiTheme } from '$lib/stores/uiPrefs';
import {
  environmentService,
  effectivePanelSaturation
} from '$lib/game/services/EnvironmentService';
import { THEMES } from './themes';
import {
  IDENTITY_MATRIX,
  ambientPanelVars,
  bleakSaturation,
  buildPanelMatrix,
  legibleOf,
  toTintStep
} from './ambientTokens';

type RGB = [number, number, number];

const CANDLE: RGB = [0.98, 0.8, 0.56];
const DATA_LIFT = 0.62;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, v: number) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export interface PanelAmbient {
  panel: string;
  legible: string;
  data: string;
  lit: string;
  vars: string;
}

export function panelAmbientOf(
  tint: RGB,
  sat: number,
  light: number,
  tinted: boolean,
  themeVars: string
): PanelAmbient {
  if (!tinted)
    return {
      panel: IDENTITY_MATRIX,
      legible: IDENTITY_MATRIX,
      data: IDENTITY_MATRIX,
      lit: IDENTITY_MATRIX,
      vars: themeVars
    };
  const night = 1 - smooth(0.2, 0.55, light);
  const legible = legibleOf(tint);
  return {
    panel: buildPanelMatrix(tint, sat),
    legible: buildPanelMatrix(legible, 1),
    data: buildPanelMatrix(legible.map((c) => lerp(c, 1, DATA_LIFT)) as RGB, 1),
    lit: buildPanelMatrix(
      tint.map((c, i) => lerp(c, CANDLE[i], night * 0.92)) as RGB,
      lerp(sat, 1, night)
    ),
    vars: themeVars
  };
}

export const panelAmbient = derived(
  [gameState, dayNightTint, uiTheme],
  ([gs, tinted, theme]): PanelAmbient => {
    const ambient = environmentService.getAmbient(environmentService.ambientTurn(gs));
    const tint = ambient.panelTint.map(toTintStep) as RGB;
    const sat = bleakSaturation(
      effectivePanelSaturation(environmentService.effectiveSeason(gs), gs.weather),
      ambient.light
    );
    const vars = ambientPanelVars(THEMES[theme], tinted, tint, sat, ambient.light);
    return panelAmbientOf(tint, sat, ambient.light, tinted, vars);
  }
);
