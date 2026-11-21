import { get } from 'svelte/store';
import { cameraViewport, cameraTileSize } from '$lib/stores/cameraView';
import { getCreatureById } from '$lib/game/core/defs/creatures';
import type { Mob } from '$lib/game/core/types';
import { creatureClips } from './manifest';
import { spatialAt, zoomGainFor } from './audibility';

const PAWN_NEAR_TILES = 8;
const PAWN_FAR_TILES = 40;
const PAWN_FAR_FLOOR = 0.1;
const SILENT_STATES: ReadonlySet<string> = new Set(['Sleeping', 'Collapsed', 'Corpse']);

export type CallingMob = Pick<Mob, 'x' | 'y' | 'state' | 'creatureId'>;
type Point = { x: number; y: number };

export function creatureCallMix(
  mobs: readonly CallingMob[],
  pawns: readonly Point[]
): Map<string, number> {
  const product = new Map<string, number>();
  const vp = get(cameraViewport);
  if (!mobs.length || vp.w <= 0) return product;
  const zg = zoomGainFor(get(cameraTileSize));

  for (const m of mobs) {
    if (SILENT_STATES.has(m.state)) continue;
    const sound = getCreatureById(m.creatureId)?.audio;
    if (!sound || creatureClips(sound).length === 0) continue;
    const spatial = spatialAt(m.x, m.y, vp);
    if (spatial <= 0) continue;

    let pawnGain = PAWN_FAR_FLOOR;
    if (pawns.length) {
      let best = Infinity;
      for (const pp of pawns) {
        const d2 = (pp.x - m.x) ** 2 + (pp.y - m.y) ** 2;
        if (d2 < best) best = d2;
      }
      const dist = Math.sqrt(best);
      pawnGain =
        dist <= PAWN_NEAR_TILES
          ? 1
          : Math.max(
              PAWN_FAR_FLOOR,
              1 -
                ((dist - PAWN_NEAR_TILES) / (PAWN_FAR_TILES - PAWN_NEAR_TILES)) *
                  (1 - PAWN_FAR_FLOOR)
            );
    }

    const c = Math.max(0, Math.min(1, zg * spatial * pawnGain));
    if (c <= 0) continue;
    product.set(sound, (product.get(sound) ?? 1) * (1 - c));
  }
  return product;
}
