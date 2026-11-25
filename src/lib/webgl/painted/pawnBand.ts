import { resolveVariant, type PaintedVariant } from './manifest.js';
import { texelKind, type AtlasTexels } from '../drawnSprites.js';
import { FACES, drawFolk, mirrored, traitIds, type FolkPawn, type FolkSprite } from './folkArt.js';

export type Facing = 'f' | 's' | 'b' | 'w';
const FACINGS: readonly Facing[] = ['f', 's', 'b', 'w'];

const CELL = { w: 68, h: 70 };
const ROWS = 8;
export const PAWN_BAND_H = CELL.h * ROWS;

interface Band {
  tile: number;
  w: number;
  top: number;
  h: number;
}

export interface BandUpload {
  x: number;
  y: number;
  sprite: FolkSprite;
}

interface Slot {
  index: number;
  key: string;
  variants: Record<Facing, PaintedVariant>;
  sprites: Record<Facing, FolkSprite>;
}

let band: Band | null = null;
let texels: AtlasTexels | null = null;
let pixels: Uint8ClampedArray | null = null;
const slots = new Map<string, Slot>();
const drawing = new Map<string, Promise<void>>();
const seen = new Map<string, { traits: unknown; n: number; look: unknown }>();
let uploads: BandUpload[] = [];

const perRow = (b: Band) => Math.floor(b.w / (CELL.w * FACINGS.length));
const capacity = (b: Band) => perRow(b) * ROWS;

export function lookKey(p: FolkPawn): string {
  const l = p.look;
  if (!l) return '';
  const traits = traitIds(p).sort();
  return [
    p.sex,
    p.physicalTraits.height,
    p.physicalTraits.weight,
    l.skin,
    l.hair,
    l.eyes,
    l.oddEye,
    l.style,
    l.beard,
    ...traits
  ].join('|');
}

function cellAt(b: Band, index: number, k: number): { x: number; y: number } {
  const per = perRow(b);
  return {
    x: ((index % per) * FACINGS.length + k) * CELL.w,
    y: b.top + Math.floor(index / per) * CELL.h
  };
}

function write(at: { x: number; y: number }, s: FolkSprite): void {
  uploads.push({ x: at.x, y: at.y, sprite: s });
  if (!band || !pixels) return;
  for (let y = 0; y < s.h; y++) {
    const row = ((at.y - band.top + y) * band.w + at.x) * 4;
    pixels.set(s.px.subarray(y * s.w * 4, (y + 1) * s.w * 4), row);
  }
  if (texels) paintKinds(texels, at, s);
}

function paintKinds(t: AtlasTexels, at: { x: number; y: number }, s: FolkSprite): void {
  for (let y = 0; y < s.h; y++)
    for (let x = 0; x < s.w; x++) {
      const i = (y * s.w + x) * 4;
      t.kinds[(at.y + y) * t.w + at.x + x] = texelKind(s.px[i], s.px[i + 1], s.px[i + 2], s.px[i + 3]);
    }
}

function freeIndex(b: Band): number {
  const used = new Set([...slots.values()].map((s) => s.index));
  for (let i = 0; i < capacity(b); i++) if (!used.has(i)) return i;
  return -1;
}

function place(b: Band, id: string, key: string, drawn: Record<'f' | 's' | 'b', FolkSprite>): void {
  const index = slots.get(id)?.index ?? freeIndex(b);
  if (index < 0) return;
  const sprites: Record<Facing, FolkSprite> = { ...drawn, w: mirrored(drawn.s) };
  const manifest = { tile: b.tile, atlas: { w: b.w, h: b.h }, sprites: {}, map: {} };
  const variants = {} as Record<Facing, PaintedVariant>;
  FACINGS.forEach((facing, k) => {
    const at = cellAt(b, index, k);
    const s = sprites[facing];
    write(at, s);
    variants[facing] = resolveVariant(manifest, { ...at, w: s.w, h: s.h, ox: s.ox, oy: s.oy });
  });
  slots.set(id, { index, key, variants, sprites });
}

const sameBand = (a: Band | null, b: Band | null) =>
  !!a && !!b && a.tile === b.tile && a.w === b.w && a.top === b.top && a.h === b.h;

export function setPawnBand(next: Band | null): void {
  if (sameBand(band, next)) {
    texels = null;
    return;
  }
  band = next;
  texels = null;
  seen.clear();
  pixels = next ? new Uint8ClampedArray(next.w * PAWN_BAND_H * 4) : null;
  slots.clear();
  uploads = [];
}

export function bindPawnTexels(t: AtlasTexels): void {
  texels = t;
  for (const slot of slots.values())
    FACINGS.forEach((f, k) => band && paintKinds(t, cellAt(band, slot.index, k), slot.sprites[f]));
}

export function resendPawnBand(): void {
  if (!band) return;
  const b = band;
  uploads = [...slots.values()].flatMap((slot) =>
    FACINGS.map((f, k) => ({ ...cellAt(b, slot.index, k), sprite: slot.sprites[f] }))
  );
}

export function takePawnUploads(): BandUpload[] {
  const out = uploads;
  uploads = [];
  return out;
}

export function readPawnBand(x: number, y: number, w: number, h: number): Uint8ClampedArray | null {
  if (!band || !pixels) return null;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let j = 0; j < h; j++) {
    const row = ((y - band.top + j) * band.w + x) * 4;
    out.set(pixels.subarray(row, row + w * 4), j * w * 4);
  }
  return out;
}

export function assemblePawn(pawn: FolkPawn): Promise<void> {
  const key = lookKey(pawn);
  if (!band || !key || slots.get(pawn.id)?.key === key) return Promise.resolve();
  const queued = drawing.get(pawn.id);
  if (queued) return queued;
  const target = band;
  const done = drawFolk(pawn, FACES)
    .then((drawn) => {
      if (drawn && target && band === target) place(target, pawn.id, key, drawn);
    })
    .catch((err) => console.warn('[painted tiles] could not assemble a pawn:', err))
    .finally(() => drawing.delete(pawn.id));
  drawing.set(pawn.id, done);
  return done;
}

export function assemblePawns(pawns: readonly FolkPawn[]): Promise<void> {
  const keep = new Set(pawns.map((p) => p.id));
  for (const id of slots.keys()) if (!keep.has(id)) slots.delete(id);
  for (const id of seen.keys()) if (!keep.has(id)) seen.delete(id);
  return Promise.all(pawns.map(assemblePawn)).then(() => undefined);
}

export function pawnBandLook(p: FolkPawn, facing: Facing): PaintedVariant | undefined {
  const last = seen.get(p.id);
  if (!band) return undefined;
  if (!last || last.traits !== p.traits || last.n !== p.traits.length || last.look !== p.look) {
    seen.set(p.id, { traits: p.traits, n: p.traits.length, look: p.look });
    void assemblePawn(p);
  }
  return slots.get(p.id)?.variants[facing];
}
