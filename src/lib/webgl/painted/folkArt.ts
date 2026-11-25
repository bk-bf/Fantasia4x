import { FOLK_ART } from '../../../../tools/tileset/sources.mjs';
import type { PawnLook } from '$lib/game/core/types';

export type Face = 'f' | 's' | 'b';
export const FACES: readonly Face[] = ['f', 's', 'b'];

export interface FolkPawn {
  id: string;
  sex?: 'male' | 'female';
  age?: number;
  physicalTraits: { height: number; weight: number };
  traits: readonly { id?: string; rarity?: string }[];
  look?: PawnLook;
}

export interface FolkSprite {
  w: number;
  h: number;
  ox: number;
  oy: number;
  px: Uint8ClampedArray;
  light: Uint8ClampedArray;
}

interface Spr {
  w: number;
  h: number;
  ax: number;
  ay: number;
  c: ([number, number, number] | null)[];
  e: Uint8Array;
}

type Weights = Record<string, number>;

interface ArtLook {
  style: string;
  [field: string]: unknown;
}

interface Art {
  FOLK_PARTS: { look(look: ArtLook, face: Face): Spr };
  pawnLookOf(
    p: { id: string; sex: string; age: number; height: number; weight: number; traits: string[] },
    pref: { skin: Weights; hair: Weights; eyes: Weights },
    rarity: Record<string, string>
  ): ArtLook;
  STYLES: { id: string; trait?: string }[];
}

const FOOT = { x: 16, y: 27 };
const CROP = { left: 34, up: 66, w: 68, h: 70 };
const EXPORTS = 'return { FOLK_PARTS, pawnLookOf, STYLES };';

const SOURCES = import.meta.glob('../../../../tools/tileset/art/**/*.js', {
  query: '?raw',
  import: 'default'
}) as Record<string, () => Promise<string>>;

let art: Promise<Art> | null = null;

async function loadArt(): Promise<Art> {
  const files = await Promise.all(
    FOLK_ART.map((f: string) => {
      const read = SOURCES[`../../../../tools/tileset/art/${f}`];
      if (!read) throw new Error(`the folk art has no ${f}`);
      return read();
    })
  );
  const body = files.map((src) => src.replace(/^'use strict';\n/, '')).join('\n;');
  return new Function(`'use strict';\n${body}\n${EXPORTS}`)() as Art;
}

function folkArt(): Promise<Art> {
  art ??= loadArt();
  return art;
}

const one = (key: string): Weights => ({ [key]: 1 });

export const traitIds = (pawn: FolkPawn): string[] =>
  pawn.traits.flatMap((t) => (t.id ? [t.id] : []));

function artLook(a: Art, pawn: FolkPawn, look: PawnLook): ArtLook {
  const traits = traitIds(pawn);
  const rarity = Object.fromEntries(pawn.traits.map((t) => [t.id ?? '', t.rarity ?? '']));
  const base = a.pawnLookOf(
    {
      id: pawn.id,
      sex: pawn.sex ?? 'male',
      age: pawn.age ?? 30,
      height: pawn.physicalTraits.height,
      weight: pawn.physicalTraits.weight,
      traits
    },
    { skin: one(look.skin), hair: one(look.hair), eyes: one(look.eyes) },
    rarity
  );
  const forced = a.STYLES.find((s) => s.trait && traits.includes(s.trait));
  return {
    ...base,
    skin: look.skin,
    hair: look.hair,
    eyes: look.eyes,
    oddEye: look.oddEye === look.eyes ? null : look.oddEye,
    style: forced ? forced.id : look.style,
    beard: look.beard
  };
}

function folkSprite(s: Spr): FolkSprite | null {
  const x0 = s.ax - CROP.left;
  const y0 = s.ay - CROP.up;
  let minX = Infinity,
    minY = Infinity,
    maxX = -1,
    maxY = -1;
  for (let y = Math.max(0, y0); y < Math.min(s.h, y0 + CROP.h); y++)
    for (let x = Math.max(0, x0); x < Math.min(s.w, x0 + CROP.w); x++) {
      if (!s.c[y * s.w + x]) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  if (maxX < 0) return null;
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const px = new Uint8ClampedArray(w * h * 4);
  const light = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const at = (minY + y) * s.w + minX + x;
      const c = s.c[at];
      if (!c) continue;
      const i = (y * w + x) * 4;
      px.set([c[0], c[1], c[2], 255], i);
      light[i] = s.e[at] ?? 0;
    }
  return { w, h, ox: FOOT.x - s.ax + minX, oy: FOOT.y - s.ay + minY, px, light };
}

export function mirrored(s: FolkSprite): FolkSprite {
  const flip = (src: Uint8ClampedArray) => {
    const out = new Uint8ClampedArray(src.length);
    for (let y = 0; y < s.h; y++)
      for (let x = 0; x < s.w; x++)
        out.set(src.subarray((y * s.w + x) * 4, (y * s.w + x) * 4 + 4), (y * s.w + s.w - 1 - x) * 4);
    return out;
  };
  return { ...s, ox: 2 * FOOT.x - s.ox - s.w, px: flip(s.px), light: flip(s.light) };
}

export async function drawFolk<F extends Face>(
  pawn: FolkPawn,
  faces: readonly F[]
): Promise<Record<F, FolkSprite> | null> {
  if (!pawn.look) return null;
  const a = await folkArt();
  const look = artLook(a, pawn, pawn.look);
  const out: Partial<Record<F, FolkSprite>> = {};
  for (const face of faces) {
    const s = folkSprite(a.FOLK_PARTS.look(look, face));
    if (!s) return null;
    out[face] = s;
  }
  return out as Record<F, FolkSprite>;
}

export function folkCanvas(s: FolkSprite): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = s.w;
  canvas.height = s.h;
  canvas.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(s.px), s.w, s.h), 0, 0);
  return canvas;
}
