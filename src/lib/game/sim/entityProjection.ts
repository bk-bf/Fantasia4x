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

// Sub-fields DROPPED from the sent `needs` / `activeJob` projections — the `slimTile` pattern applied
// to entities. A full main-thread read-audit (components/stores/routes + GameCanvas) found these are
// never read off the projected entity; they exist only for the worker sim, so shipping + cloning them
// every flush was pure tax. DENYLISTS (not allowlists) so a newly-added *read* field stays included
// by default — fail-safe. (The worker's canonical state + saves keep the full objects untouched.)
//
// Rate line (per the thirst caveat): every CONTINUOUSLY-drifting need — hunger/fatigue/sleep/thirst/
// AND hygiene — stays hot, because all of them are shown live in the work-screen list / detail card,
// and even the slowest (hygiene 0.3/s) would visibly lag if demoted to the ~2s resync. Only the
// `lastX` timestamps drop: they're event markers (zero continuous drift) the main thread never reads.
const NEEDS_DROP = new Set(['lastSleep', 'lastMeal', 'lastDrink', 'lastWash']);
// activeJob: the main thread reads only `type` / `resourceId` / `progress`; the rest is worker-only
// (job ids, target/deposit coords, timing/staging scratch).
const ACTIVE_JOB_DROP = new Set([
  'jobId',
  'targetX',
  'targetY',
  'droppedItemId',
  'buildingId',
  'craftQueueId',
  'timeRequired',
  'targetState',
  'turnsInState',
  'hungerToRecover',
  'depositX',
  'depositY'
]);
// state: the HUD reads `mood` + `health`; the three FSM booleans are redundant with the already-hot
// top-level `currentState`, and the main thread never reads them.
const STATE_DROP = new Set(['isWorking', 'isSleeping', 'isEating']);
// Top-level pawn fields dropped wholesale — worker-only, never read off the projected entity. The
// big one is `jobQueue` (the FSM's soft-preview of upcoming job ids — up to ~168B when populated).
const ENTITY_DROP = ['jobQueue'] as const;

/** Copy `src` minus the `drop` keys into a NEW object (never mutates the source/canonical nested obj). */
function omit(src: Record<string, unknown>, drop: Set<string>): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const k in src) if (!drop.has(k)) o[k] = src[k];
  return o;
}

/**
 * Project a sent entity (a fresh slim object or shallow clone — NEVER a canonical entity) down to the
 * fields the main thread actually reads: truncate `path`, and drop the worker-only sub-fields of
 * `needs` / `activeJob`. The nested objects are rebuilt fresh so the worker's canonical state is never
 * mutated. This is the §D entity-baseline cut — see ENGINE-PERFORMANCE.md.
 */
export function projectSentEntity(o: Record<string, unknown>): void {
  truncateSentPath(o);
  if (o.needs) o.needs = omit(o.needs as Record<string, unknown>, NEEDS_DROP);
  if (o.activeJob) o.activeJob = omit(o.activeJob as Record<string, unknown>, ACTIVE_JOB_DROP);
  // Only pawns carry an OBJECT `state` ({ mood, health, isWorking… }); a mob's `state` is a plain
  // MobState string. Running `omit` (a `for…in`) over a string would iterate its char-indices and
  // hand back `{0:'C',1:'o',…}` — surfacing as "[object Object]" in the mob's HUD state tag.
  if (o.state && typeof o.state === 'object')
    o.state = omit(o.state as Record<string, unknown>, STATE_DROP);
  for (const k of ENTITY_DROP) if (k in o) delete o[k];
}
