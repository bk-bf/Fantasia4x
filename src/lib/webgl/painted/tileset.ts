import {
  idHash,
  pickVariant,
  positionHash,
  spriteAt,
  type PaintedKind,
  type PaintedPieces,
  type PaintedSprite,
  type PaintedTileset,
  type PaintedVariant
} from './manifest.js';

import {
  assembledLook,
  pawnFacing,
  pawnLook,
  type PawnLookOf,
  type PawnLookPool,
  type PawnMotion
} from './pawnLook.js';

export { PAINTED_TILES } from './flag.js';

let active: PaintedTileset | null = null;
let groundIds: string[] = [];
let groundIndex = new Map<string, number>();

const NO_PAINT = {};
const ANY_ID = '*';

export function setPaintedTileset(tileset: PaintedTileset | null): void {
  active = tileset;
  groundIds = [...(tileset?.lookup.get('subterrain')?.keys() ?? [])];
  groundIndex = new Map(groundIds.map((id, i) => [id, i + 1]));
}

export function paintedGroundKind(subType: string): number {
  return groundIndex.get(subType) ?? 0;
}

export function paintedGroundIds(): readonly string[] {
  return groundIds;
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

export function paintedScenery(id: string, x: number, y: number): PaintedSprite | undefined {
  const variants = active?.scenery.get(id);
  return variants && spriteAt(pickVariant(variants, positionHash(x, y)), x, y);
}

export function paintedTileIn(
  kind: PaintedKind,
  id: string,
  state: string | undefined,
  x: number,
  y: number
): PaintedSprite | undefined {
  return (state && paintedTile(kind, `${id}:${state}`, x, y)) || paintedTile(kind, id, x, y);
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

export function paintedPawn(
  pawn: PawnLookOf & PawnMotion,
  pool: PawnLookPool
): PaintedVariant['entity'] | Record<string, never> {
  const own = active && assembledLook(pawn, pawnFacing(pawn));
  if (own) return own.entity;
  const look = active && pawnLook(active.map, pawn, pool);
  return (look && active?.sprites.get(look)?.entity) || NO_PAINT;
}

export function paintedPieces(set: string): PaintedPieces | undefined {
  return active?.pieces.get(set);
}

export function pieceLayout(
  pieces: PaintedPieces,
  isMass: (x: number, y: number) => boolean,
  x: number,
  y: number
): number {
  let layout = 0;
  pieces.neighbours.forEach(([dx, dy], bit) => {
    if (isMass(x + dx, y + dy)) layout |= 1 << bit;
  });
  return layout;
}

export function paintedPiece(
  pieces: PaintedPieces,
  isMass: (x: number, y: number) => boolean,
  x: number,
  y: number
): PaintedSprite {
  return spriteAt(pieces.layouts[pieceLayout(pieces, isMass, x, y)], x, y);
}
