import type { Theme } from './themes';

type RGB = [number, number, number];

const LUMA: RGB = [0.2126, 0.7152, 0.0722];
const NIGHT_BLEAK = 0.25;
const NIGHT_SAT_FLOOR = 0.6;

export const IDENTITY_MATRIX = '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0';

export const toTintStep = (v: number): number => Math.round(v * 64) / 64;

export function bleakSaturation(baseSat: number, light: number): number {
  const extra = (1 - baseSat) * (1 - light) * NIGHT_BLEAK;
  return toTintStep(Math.max(Math.min(baseSat, NIGHT_SAT_FLOOR), baseSat - extra));
}

export function legibleOf(tint: RGB): RGB {
  const l = LUMA[0] * tint[0] + LUMA[1] * tint[1] + LUMA[2] * tint[2];
  const k = l > 1e-4 ? 1 / l : 1;
  return [tint[0] * k, tint[1] * k, tint[2] * k];
}

export function buildPanelMatrix(tint: RGB, s: number): string {
  const [lr, lg, lb] = LUMA;
  const [tr, tg, tb] = tint;
  const wash = (1 - s) * 0.08;
  const f = (n: number) => n.toFixed(4);
  return (
    `${f(tr * ((1 - s) * lr + s))} ${f(tr * (1 - s) * lg)} ${f(tr * (1 - s) * lb)} 0 ${f(wash)} ` +
    `${f(tg * (1 - s) * lr)} ${f(tg * ((1 - s) * lg + s))} ${f(tg * (1 - s) * lb)} 0 ${f(wash)} ` +
    `${f(tb * (1 - s) * lr)} ${f(tb * (1 - s) * lg)} ${f(tb * ((1 - s) * lb + s))} 0 ${f(wash)} ` +
    `0 0 0 1 0`
  );
}

function tintRGB(hex: string, tint: RGB, s: number): RGB {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const [lr, lg, lb] = LUMA;
  const [tr, tg, tb] = tint;
  const wash = (1 - s) * 0.08;
  return [
    tr * (((1 - s) * lr + s) * r + (1 - s) * lg * g + (1 - s) * lb * b) + wash,
    tg * ((1 - s) * lr * r + ((1 - s) * lg + s) * g + (1 - s) * lb * b) + wash,
    tb * ((1 - s) * lr * r + (1 - s) * lg * g + ((1 - s) * lb + s) * b) + wash
  ];
}

function toHex([r, g, b]: RGB): string {
  const h = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n * 255)))
      .toString(16)
      .padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

const LIT_PAGE = 0.45;
const LIT_INK = 0.25;
const mixRGB = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t
];
const plain = (hex: string): RGB => tintRGB(hex, [1, 1, 1], 1);
const FADING_INK = new Set(['--text-dim', '--text-muted']);

function litColour(
  theme: Theme,
  key: string,
  hex: string,
  tint: RGB,
  sat: number,
  light: number
): RGB {
  const surface = key in theme.surface;
  const tinted = surface ? tintRGB(hex, tint, sat) : tintRGB(hex, legibleOf(tint), 1);
  if (!theme.inkOnLit) return tinted;
  if (surface) return mixRGB(plain(hex), tinted, LIT_PAGE);
  const ink = mixRGB(plain(hex), tinted, LIT_INK);
  return FADING_INK.has(key) ? mixRGB(ink, plain(theme.ink['--text']), (1 - light) * 0.6) : ink;
}

export function ambientPanelVars(
  theme: Theme,
  tinted: boolean,
  tint: RGB,
  sat: number,
  light: number
): string {
  return Object.entries({ ...theme.surface, ...theme.ink })
    .map(([k, v]) => `${k}: ${tinted ? toHex(litColour(theme, k, v, tint, sat, light)) : v}`)
    .join('; ');
}
