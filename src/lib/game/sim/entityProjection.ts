/**
 * entityProjection — pure projection helpers for the worker→main entity snapshot (ADR-021 §D).
 *
 * The per-flush entity baseline (`pawns + mobs ≈ 400–500k/flush`, peaking at game START) is the
 * load-bearing cost of the snapshot boundary. The dominant *variable* part is each entity's queued
 * movement `path`: at start every pawn is pathing and the full array inflates a slim entity to ~900B
 * (the [SNAP-PAWN] probe measured `path` at 100–650B).
 *
 * A read-audit of the MAIN thread shows `path` is consumed in exactly two places:
 *   1. MovementSystem.simTarget — reads only `path[pathIndex]` (the next cell) to interpolate motion,
 *      for every entity every frame.
 *   2. GameCanvas's draft-order polyline — walks `path[pathIndex…end]`, but ONLY for pawns that are
 *      `drafted && draftTarget` (normally zero; a few during combat micro).
 *
 * So the next couple of cells are all the renderer needs from a non-drafted entity. `truncateSentPath`
 * rewrites the SENT projection to just that, re-basing `pathIndex` to 0. It must run on a fresh object
 * (a slim projection or a shallow clone) — never the worker's canonical entity, whose full path the
 * sim and saves still rely on. Mobs are never drafted, so all mob paths truncate.
 */

/** Cells of path kept in the sent projection. simTarget needs `path[0]`; the 2nd is cheap headroom. */
export const PATH_LOOKAHEAD = 2;

/**
 * Truncate a sent entity projection's `path` to the next {@link PATH_LOOKAHEAD} cells (pathIndex→0),
 * unless it's a drafted pawn with an active order (whose full remaining path the draft overlay draws).
 * Mutates `o` in place — pass a fresh slim object or shallow clone, NOT a canonical entity.
 */
export function truncateSentPath(o: Record<string, unknown>): void {
  if (o.drafted && o.draftTarget) return; // draft overlay needs the whole remaining path
  const path = o.path as unknown[] | undefined;
  if (!path || path.length === 0) return;
  const idx = (o.pathIndex as number) ?? 0;
  if (idx === 0 && path.length <= PATH_LOOKAHEAD) return; // already minimal — skip the realloc
  o.path = path.slice(idx, idx + PATH_LOOKAHEAD);
  o.pathIndex = 0;
}
