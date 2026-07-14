/**
 * Pure projection helpers that slim the worker→main entity snapshot: ship only the fields the
 * main thread actually reads, and truncate queued movement paths to the next couple of cells
 * (the renderer interpolates from `path[pathIndex]` only; drafted pawns keep the full path for
 * the draft-order polyline). Must run on fresh slim objects/shallow clones — never the worker's
 * canonical entities, whose full data the sim and saves still rely on.
 */

/** Cells of path kept in the sent projection. simTarget needs `path[0]`; the 2nd is cheap headroom. */
export const PATH_LOOKAHEAD = 2;

/**
 * Truncate a sent projection's `path` to the next {@link PATH_LOOKAHEAD} cells (pathIndex→0),
 * unless it's a drafted pawn with an active order (the draft overlay draws the full path).
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

// Sub-fields DROPPED from the sent projections — never read on the main thread, worker-only.
// DENYLISTS (not allowlists) so a newly-added *read* field stays included by default — fail-safe.
// All continuously-drifting need values stay hot (shown live in the UI); only the `lastX` event
// timestamps drop.
const NEEDS_DROP = new Set(['lastSleep', 'lastMeal', 'lastDrink', 'lastWash', 'lastSocialise']);
// activeJob: the main thread reads only `type` / `resourceId` / `progress`.
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
// state: the HUD reads `mood` + `health`; the FSM booleans are redundant with top-level `currentState`.
const STATE_DROP = new Set(['isWorking', 'isSleeping', 'isEating']);
// Top-level entity fields dropped wholesale — worker-only (jobQueue: pawn FSM lookahead;
// hideWear/hideWearAt: ADR-031 per-fight hide-wear combat scratch on mobs; naturalArmorOverride: §2a
// per-spawn hide-toughness roll read only by combat; memories: PAWN-MEMORY dialog-recall store read
// only by MemoryService/SocialService in the worker — none are rendered).
const ENTITY_DROP = ['jobQueue', 'hideWear', 'hideWearAt', 'naturalArmorOverride', 'memories'] as const;

/** Copy `src` minus the `drop` keys into a NEW object (never mutates the source/canonical nested obj). */
function omit(src: Record<string, unknown>, drop: Set<string>): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const k in src) if (!drop.has(k)) o[k] = src[k];
  return o;
}

/**
 * Project a sent entity (a fresh slim object or shallow clone — NEVER a canonical entity) down to
 * the fields the main thread reads. Nested objects are rebuilt fresh so canonical state is never mutated.
 */
export function projectSentEntity(o: Record<string, unknown>): void {
  truncateSentPath(o);
  if (o.needs) o.needs = omit(o.needs as Record<string, unknown>, NEEDS_DROP);
  if (o.activeJob) o.activeJob = omit(o.activeJob as Record<string, unknown>, ACTIVE_JOB_DROP);
  // Only pawns carry an OBJECT `state`; a mob's `state` is a plain string — running omit's `for…in`
  // over a string would iterate its char-indices and hand back `{0:'C',1:'o',…}`.
  if (o.state && typeof o.state === 'object')
    o.state = omit(o.state as Record<string, unknown>, STATE_DROP);
  for (const k of ENTITY_DROP) if (k in o) delete o[k];
}
