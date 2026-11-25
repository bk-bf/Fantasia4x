import { paintedLookCanvas, paintedPawnLook } from '$lib/webgl/painted/loader';
import { folkPawn, type PawnLookOf, type PawnLookPool } from '$lib/webgl/painted/pawnLook';
import { drawFolk, folkCanvas } from '$lib/webgl/painted/folkArt';
import { lookKey } from '$lib/webgl/painted/pawnBand';
import { toArt, type Art } from '$lib/pixelArt/picture';

const made = new Map<string, Promise<Art | null>>();

function cached(key: string, make: () => Promise<Art | null>): Promise<Art | null> {
  let art = made.get(key);
  if (!art) {
    art = make();
    made.set(key, art);
  }
  return art;
}

export async function pawnSpriteArt(pawn: PawnLookOf, pool: PawnLookPool): Promise<Art | null> {
  const folk = folkPawn(pawn);
  if (folk)
    return cached(lookKey(folk), () =>
      drawFolk(folk, ['f'] as const).then((s) => (s ? toArt(folkCanvas(s.f)) : null))
    );
  const look = await paintedPawnLook(pawn, pool);
  if (!look) return null;
  return cached(look, () => paintedLookCanvas(look).then((c) => (c ? toArt(c) : null)));
}
