import { paintedSpriteCanvas, PAINTED_BASE_URL } from '$lib/webgl/painted/loader';
import { toArt, type Art } from '$lib/pixelArt/picture';

const made = new Map<string, Promise<Art | null>>();

export function pawnSpriteArt(cultureId: string, pawnId: string): Promise<Art | null> {
  const key = `${cultureId}|${pawnId}`;
  let art = made.get(key);
  if (!art) {
    art = paintedSpriteCanvas('pawn', cultureId, PAINTED_BASE_URL, pawnId).then((c) =>
      c ? toArt(c) : null
    );
    made.set(key, art);
  }
  return art;
}
