import { blank } from '$lib/pixelArt/canvas';
import { pennant } from '$lib/pixelArt/cloth';
import { stamp, textMask } from '$lib/pixelArt/lettering';
import { hash } from '$lib/pixelArt/noise';
import { RAMPS, type Rgb } from '$lib/pixelArt/palette';
import { BANNER_FONT, FLAG_H, FLAG_W, LIT_EXTRA, PIXEL_FONT, SWAY_PAD } from './mainMenuPlan';

export const DYES = [
  RAMPS.red,
  RAMPS.blue,
  RAMPS.green,
  RAMPS.purple,
  RAMPS.ochre,
  RAMPS.verdigris
];

const LABEL: Rgb = [255, 196, 102];
const LABEL_LIT: Rgb = [255, 236, 170];
const NOTE: Rgb = [236, 220, 180];
const FRAMES_PER_SECOND = 8;

export interface MenuItem {
  label: string;
  dye: number;
  emblem: string;
  needsSave?: boolean;
  desktopOnly?: boolean;
}

export const MENU_ITEMS: MenuItem[] = [
  { label: 'Continue', dye: 0, emblem: 'candle', needsSave: true },
  { label: 'New Game', dye: 2, emblem: 'handcart' },
  { label: 'Load Game', dye: 1, emblem: 'wooden_chest', needsSave: true },
  { label: 'Settings', dye: 3, emblem: 'iron_hammer' },
  { label: 'Credits', dye: 4, emblem: 'sovereign_crown' },
  { label: 'Exit', dye: 5, emblem: 'hide_boots', desktopOnly: true }
];

export interface FlagFace {
  label: string;
  note: string;
  dye: number;
  emblem: HTMLCanvasElement | null;
}

export interface SwayStrip {
  cloth: HTMLCanvasElement;
  ink: HTMLCanvasElement;
  frames: number;
  seconds: number;
  frameW: number;
  frameH: number;
}

function ink(face: FlagFace, w: number, lit: boolean): HTMLCanvasElement {
  const c = blank(w, FLAG_H);
  const g = c.getContext('2d');
  if (!g) return c;
  const e = face.emblem;
  if (e) g.drawImage(e, 9 + Math.round((26 - e.width) / 2), Math.round((FLAG_H - e.height) / 2));
  const label = textMask(face.label, BANNER_FONT, 20);
  stamp(g, label, 42, Math.round(FLAG_H / 2) + 7 - label.base, lit ? LABEL_LIT : LABEL);
  if (face.note) {
    const note = textMask(face.note, PIXEL_FONT, 16);
    const x = w - 20 - note.w;
    if (x > 42 + label.w + 8) stamp(g, note, x, Math.round(FLAG_H / 2) + 5 - note.base, NOTE);
  }
  return c;
}

function sway(
  src: HTMLCanvasElement,
  frames: number,
  offset: (x: number, f: number) => number
): HTMLCanvasElement {
  const w = src.width;
  const h = src.height;
  const fh = FLAG_H + SWAY_PAD * 2;
  const out = blank(FLAG_W + LIT_EXTRA, fh * frames);
  const sg = src.getContext('2d');
  const og = out.getContext('2d');
  if (!sg || !og) return out;
  const from = new Uint32Array(sg.getImageData(0, 0, w, h).data.buffer);
  const img = og.createImageData(out.width, out.height);
  const to = new Uint32Array(img.data.buffer);
  for (let f = 0; f < frames; f++)
    for (let x = 0; x < w; x++) {
      const top = f * fh + SWAY_PAD + offset(x, f);
      for (let y = 0; y < h; y++) to[(top + y) * out.width + x] = from[y * w + x];
    }
  og.putImageData(img, 0, 0);
  return out;
}

export function swayStrip(face: FlagFace, index: number, wind: number, lit: boolean): SwayStrip {
  const w = FLAG_W + (lit ? LIT_EXTRA : 0);
  const rate = 0.8 + 0.4 * hash(index, 3, 5);
  const seconds = Math.PI / rate;
  const frames = Math.max(8, Math.round(seconds * FRAMES_PER_SECOND));
  const wave = 0.055 + 0.03 * hash(index, 8, 5);
  const phase = index * 1.9;
  const gustPhase = hash(index, 11, 7) * Math.PI * 2;
  const offset = (x: number, f: number) => {
    const t = (f / frames) * Math.PI * 2;
    const gust = wind * (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t + gustPhase)));
    return Math.round(gust * (x / w) * Math.sin(t - x * wave + phase));
  };
  const cloth = pennant(w, FLAG_H, DYES[face.dye % DYES.length], face.dye + 3, lit);
  return {
    cloth: sway(cloth, frames, offset),
    ink: sway(ink(face, w, lit), frames, offset),
    frames,
    seconds,
    frameW: FLAG_W + LIT_EXTRA,
    frameH: FLAG_H + SWAY_PAD * 2
  };
}
