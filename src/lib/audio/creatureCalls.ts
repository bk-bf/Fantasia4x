import { getCreatureById } from '$lib/game/core/defs/creatures';
import type { Mob } from '$lib/game/core/types';
import { creatureClips } from './manifest';

const PAWN_NEAR_TILES = 8;
const PAWN_FAR_TILES = 40;
const PAWN_FAR_FLOOR = 0.1;
const SILENT_STATES: ReadonlySet<string> = new Set(['Sleeping', 'Collapsed', 'Corpse']);

export type CallingMob = Pick<Mob, 'x' | 'y' | 'state' | 'creatureId'>;
type Point = { x: number; y: number };

function nearestPawnDistance(m: CallingMob, pawns: readonly Point[]): number {
  let best = Infinity;
  for (const pp of pawns) {
    const d2 = (pp.x - m.x) ** 2 + (pp.y - m.y) ** 2;
    if (d2 < best) best = d2;
  }
  return Math.sqrt(best);
}

function surroundingsGain(dist: number): number {
  if (dist > PAWN_FAR_TILES) return 0;
  if (dist <= PAWN_NEAR_TILES) return 1;
  const t = (dist - PAWN_NEAR_TILES) / (PAWN_FAR_TILES - PAWN_NEAR_TILES);
  return Math.max(PAWN_FAR_FLOOR, 1 - t * (1 - PAWN_FAR_FLOOR));
}

export function creatureCallMix(
  mobs: readonly CallingMob[],
  pawns: readonly Point[]
): Map<string, number> {
  const product = new Map<string, number>();
  if (!pawns.length) return product;
  for (const m of mobs) {
    if (SILENT_STATES.has(m.state)) continue;
    const sound = getCreatureById(m.creatureId)?.audio;
    if (!sound || creatureClips(sound).length === 0) continue;
    const c = surroundingsGain(nearestPawnDistance(m, pawns));
    if (c <= 0) continue;
    product.set(sound, (product.get(sound) ?? 1) * (1 - c));
  }
  return product;
}
