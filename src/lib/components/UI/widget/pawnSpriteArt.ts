import { paintedLookCanvas, paintedPawnLook } from '$lib/webgl/painted/loader';
import type { PawnLookOf, PawnLookPool } from '$lib/webgl/painted/pawnLook';
import { toArt, type Art } from '$lib/pixelArt/picture';

const made = new Map<string, Promise<Art | null>>();

export async function pawnSpriteArt(pawn: PawnLookOf, pool: PawnLookPool): Promise<Art | null> {
  const look = await paintedPawnLook(pawn, pool);
  if (!look) return null;
  let art = made.get(look);
  if (!art) {
    art = paintedLookCanvas(look).then((c) => (c ? toArt(c) : null));
    made.set(look, art);
  }
  return art;
}
