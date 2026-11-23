import { idHash, type PaintedManifest } from './manifest.js';
import { cultureArchetype } from '$lib/game/core/rules/social/social.js';

export type PawnLookPool = Parameters<typeof cultureArchetype>[1];

export interface PawnLookOf {
  id: string;
  cultureId?: string;
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
