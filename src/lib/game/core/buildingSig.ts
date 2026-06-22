import type { GameState } from './types';

/**
 * Stable signature string of the building set's VISUAL fields only — id, position, type, status,
 * deconstruct-queued and paused. Deliberately EXCLUDES fuel/lit so a lit campfire decrementing fuel
 * every tick doesn't churn the signature (which would force a full terrain rebuild ~2×/s).
 *
 * Shared so the two terrain-rebuild change-detectors stay in lock-step: the render side
 * (GameCanvas overlay) and the sim worker. It used to be hand-copied in both (the worker's comment
 * literally said "Mirrors GameCanvas.buildingsVisualSig"); a drift between the two would silently
 * break rebuild detection. Type-only import, so it stays safe to pull into the worker bundle.
 */
export function buildingsVisualSig(bs: GameState['buildings']): string {
  let sig = '';
  for (const b of bs ?? [])
    sig += `${b.id}:${b.x},${b.y}:${b.type}:${b.status}:${b.deconstructQueued ? 1 : 0}:${b.paused ? 1 : 0}|`;
  return sig;
}
