import { idHash, type PaintedManifest, type PaintedVariant } from './manifest.js';
import { cultureArchetype } from '$lib/game/core/rules/social/social.js';
import type { FolkPawn } from './folkArt.js';
import { pawnBandLook, type Facing } from './pawnBand.js';

export type PawnLookPool = Parameters<typeof cultureArchetype>[1];

export interface PawnLookOf extends Partial<Omit<FolkPawn, 'id'>> {
  id: string;
  cultureId?: string;
}

export interface PawnMotion {
  position?: { x: number; y: number };
  path?: { x: number; y: number }[];
  pathIndex?: number;
  isMoving?: boolean;
}

export const folkPawn = (pawn: PawnLookOf): FolkPawn | null =>
  pawn.look && pawn.physicalTraits && pawn.traits ? (pawn as FolkPawn) : null;

export function pawnFacing(pawn: PawnMotion): Facing {
  const next = pawn.isMoving ? pawn.path?.[pawn.pathIndex ?? 0] : undefined;
  if (!next || !pawn.position) return 'f';
  const dx = next.x - pawn.position.x;
  const dy = next.y - pawn.position.y;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 's' : 'w';
  return dy < 0 ? 'b' : 'f';
}

export function assembledLook(pawn: PawnLookOf, facing: Facing): PaintedVariant | undefined {
  const folk = folkPawn(pawn);
  return folk ? pawnBandLook(folk, facing) : undefined;
}

export function pawnLook(
  map: PaintedManifest['map'],
  pawn: PawnLookOf,
  pool: PawnLookPool
): string | undefined {
  const folk = map.pawn;
  const archetype = cultureArchetype(pawn.cultureId, pool);
  const sprites = (archetype === undefined ? undefined : folk?.[archetype]) ?? folk?.['*'];
  return sprites?.length ? sprites[idHash(pawn.id) % sprites.length] : undefined;
}
