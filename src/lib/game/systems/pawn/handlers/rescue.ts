/** pawn/handlers/rescue — shelter lookup for the carry-to-shelter order.
 *
 *  Carrying a downed colonist is now a drafted `rescue` order driven by GameEngineImpl._processDraftOrders
 *  (the carry/drop cargo logic lives in systems/pawn/carry.ts). All that remains here is the shared
 *  "where do I take them?" query — the nearest complete rest building. */
import type { GameState } from '../../../core/types';
import { manhattan } from '../../../core/distance';
import { REST_TYPES } from '../pawnHelpers';
import { tileHasBody } from '../carry';

/** Nearest COMPLETE rest building (bed/shelter) tile to (x,y) that is NOT already occupied by another
 *  pawn — a shelter holds one body, so a carrier never delivers onto an occupied bed (which glitched
 *  two pawns onto one tile). Returns null when the colony has no FREE shelter. */
export function nearestShelterTile(
  gs: GameState,
  x: number,
  y: number
): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (const b of gs.buildings ?? []) {
    if (b.status !== 'complete' || !REST_TYPES.includes(b.type)) continue;
    if (tileHasBody(gs, b.x, b.y)) continue; // bed taken (pawn or mob) — one body per shelter
    const d = manhattan(b.x, b.y, x, y);
    if (d < bestD) {
      bestD = d;
      best = { x: b.x, y: b.y };
    }
  }
  return best;
}

/** Does the colony have anywhere to carry a rescued pawn? The `rescuePawn` command refuses early when not. */
export function hasShelter(gs: GameState): boolean {
  return (gs.buildings ?? []).some((b) => b.status === 'complete' && REST_TYPES.includes(b.type));
}
