import {
  idHash,
  pickVariant,
  positionHash,
  spriteAt,
  type PaintedKind,
  type PaintedSprite,
  type PaintedTileset,
  type PaintedVariant
} from './manifest.js';

export { PAINTED_TILES } from './flag.js';

let active: PaintedTileset | null = null;

const NO_PAINT = {};
const ANY_ID = '*';

export function setPaintedTileset(tileset: PaintedTileset | null): void {
  active = tileset;
}

export function paintedTileset(): PaintedTileset | null {
  return active;
}

export function paintedTile(
  kind: PaintedKind,
  id: string,
  x: number,
  y: number
): PaintedSprite | undefined {
  const variants = active?.lookup.get(kind)?.get(id);
  if (!variants) return undefined;
  return spriteAt(pickVariant(variants, positionHash(x, y)), x, y);
}

export function paintedEntity(
  kind: PaintedKind,
  id: string | undefined,
  entityId: string
): PaintedVariant['entity'] | Record<string, never> {
  const ofKind = active?.lookup.get(kind);
  const variants = (id === undefined ? undefined : ofKind?.get(id)) ?? ofKind?.get(ANY_ID);
  return variants ? pickVariant(variants, idHash(entityId)).entity : NO_PAINT;
}
