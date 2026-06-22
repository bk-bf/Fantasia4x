/**
 * pawnHelpers — shared orchestration helpers + tuning constants for the pawn AI, extracted from the
 * PawnStateMachine god-file (hotspot step 2). Pathfinding glue, building/food/rest finders, the
 * need-interrupt machinery, combat/hunt selection, and the deposit/stage pipeline. Pure module
 * boundary: depends only on services/core/pawnQueries/pawnStates — never on the handlers or the
 * dispatcher — so the import graph stays acyclic.
 */
import type { GameState, Pawn, Mob, Building, PlacedBuilding, Job } from '../../core/types';
import BUILDINGS_DATABASE_RAW from '../../database/buildings.jsonc';
import { jobService } from '../../services/JobService';
import { pawnService } from '../../services/PawnService';
import {
  buildPathfindingGrids,
  buildSharedSoftBlockedGrid,
  pathfinderService
} from '../../services/PathfinderService';
import { occupancyService } from '../../services/OccupancyService';
import { getRangedWeapon, effectiveRangedRange } from '../rangedCombat';
import { gameLogger } from '../../dev/gameLogger';
import { ticksFromSeconds, SECONDS_PER_TICK } from '../../core/time';
import { rng } from '../../core/rng';
import { pawnById } from '../../core/pawnIndex';
import { computeTileLightLevel } from '../../services/EnvironmentService';
import { effectiveVisionRange } from '../../core/vision';
import { PAWN_STATE, type PawnStateName } from './pawnStates';
import { isAdjacent, findAdjacentApproach, hasAvailableFood } from './pawnQueries';

// ===== NEED THRESHOLDS =====
// Calibrated to 1 in-game day = 300 turns (1 turn ≈ 5 in-game min; 1 day ≈ 5 real min at 1 turn/sec):
//   Hunger:  0.54/turn → 0→70 in ~130 turns ≈ 0.43 days  (matches Rimworld ~10.5h hunger trigger)
//   Fatigue: 0.32/turn → 0→72 in ~225 turns ≈ 0.75 days  (matches Rimworld ~18h sleep trigger)
//   Bed sleep: 0.72/turn → 72→0 in ~100 turns = 1/3 day ≈ 8h   (Rimworld 8h bed sleep)
//   Ground:    0.58/turn → 72→0 in ~124 turns ≈ 9.9h             (Rimworld ~10h ground sleep)
//   At 2× speed everything is 2× faster; at 4× speed 4× faster — matching Rimworld multi-speed feel.
export const HUNGER_THRESHOLD = 70; // Seek food at 70% (= Rimworld 30% saturation trigger)

export const FATIGUE_THRESHOLD = 72; // Seek rest after ~225 turns ≈ 0.75 days (28% rest = 72% fatigue)

// Hygiene (0–100, 100 = filthy) at/above which the `filthy` condition shows. Only the fully-grimy end
// of the bar — a pawn isn't "Filthy" while merely a bit unwashed; the hygiene need bar is the gradient.
export const FILTHY_THRESHOLD = 100;

// ===== WOUND RECOVERY =====
/** Pain (0–100) at/above which a wounded pawn breaks off to rest and recover. */
export const RECOVER_PAIN_THRESHOLD = 12;
/** Total bleed (blood/s) at/above which a pawn must stop and rest — a real wound, not a graze (a
 *  single small cut bleeds ~0.5/s, so the floor sits above that; stacked/serious bleeders clear it). */
const RECOVER_BLEED_THRESHOLD = 1.5;

/**
 * Should this pawn drop what it's doing and lie down to recover? True for a MEANINGFUL wound — pain
 * past the threshold, a serious+ wound, or bleeding faster than a graze — since wounds only mend at
 * full rate while resting (healWounds activity gate). A minor, barely-bleeding scratch does NOT pull
 * a pawn off work ("only minor wounds can be risked left untreated"); it self-closes slowly meanwhile.
 */
export function needsRecovery(pawn: Pawn): boolean {
  if (pawn.isAlive === false) return false;
  if ((pawn.pain ?? 0) >= RECOVER_PAIN_THRESHOLD) return true;
  let bleed = 0;
  for (const l of pawn.limbs ?? []) {
    bleed += l.bleedRate ?? 0;
    for (const p of l.parts ?? [])
      for (const w of p.injuries) if (w.severity !== 'minor') return true;
  }
  return bleed >= RECOVER_BLEED_THRESHOLD;
}

// ===== COMBAT (COMBAT-SYSTEM) =====
/** How far (tiles) a fleeing pawn tries to put between itself and the threat. */
export const FLEE_DISTANCE = 6;

/** Vision/aggro radius in tiles for this pawn. Uses the SHARED perception-based vision (same as
 *  mobs, core/vision) scaled by the pawn's tile light + night_vision (§G) — so darkness shortens
 *  threat detection. Defensive pawns ignore this (they only react to adjacent hostiles). */
export function pawnVisionTiles(pawn: Pawn, gs: GameState): number {
  const light = pawn.position
    ? computeTileLightLevel(gs.turn, gs.buildings ?? [], pawn.position.x, pawn.position.y)
    : 1;
  return effectiveVisionRange(pawn, light);
}

// Dynamic need interruption (replaces flat CRITICAL_HUNGER / CRITICAL_FATIGUE thresholds).
// A pawn weighs need urgency against proximity — the hungrier/more tired, the greater the detour.
export const NEED_DETOUR_MAX_FACTOR = 15; // At need=100%, willing to detour up to 15× the job distance

export const NEED_DETOUR_MIN_DIST = 5; // Minimum effective job distance (prevents ÷0 when already at site)

// Work priority threshold adjustments:
//   Level 4 (critical) → +8 pts harder to interrupt; level 1 (low) → −4 pts easier
export const WORK_PRIORITY_THRESHOLD_SHIFT = 4; // pts per labor level above/below default (2)

// Queue food lookahead: if no upcoming task passes near food, lower the threshold so pawn eats sooner.
export const QUEUE_FOOD_THRESHOLD_REDUCTION = 5; // max threshold pts reduction when all queue jobs far from food

// How many ahead-of-time jobs to soft-preview in the pawn's jobQueue.
export const JOB_QUEUE_SIZE = 4;

// NOTE: The constants below are turn-denominated. *_TURNS are durations (a turn = 60 ticks,
// so they keep their values). FATIGUE_PER_SLEEPING_* and the MALNUTRITION/BLOOD rates below
// deliberately stay PER-TURN: they are recovery/condition rates evaluated alongside the
// turn-based state machine and death checks, and at <0.001/turn they are sub-perceptual —
// smoothing them to per-tick would add risk for no visible benefit.
// NOTE: Values below are authored in SECONDS (the legacy "turn"). The sim runs the
// whole pipeline every tick, so DURATIONS are converted to ticks via ticksFromSeconds()
// and per-second RATES are converted to per-tick amounts via perTick(). One knob
// (TICKS_PER_SECOND in core/time) retunes all of them at once.
export const EATING_TURNS = ticksFromSeconds(2); // ~2 in-game min to eat at a campfire

export const EATING_TURNS_GROUND = ticksFromSeconds(3); // eating in-place (cold, uncomfortable)

export const SLEEPING_TURNS = ticksFromSeconds(100); // Full recovery in bed: 72 / 0.72 = 100s = 1/3 day (progress bar ref)

export const SLEEPING_TURNS_GROUND = ticksFromSeconds(124); // Full recovery on ground: 72 / 0.58 ≈ 124s ≈ 9.9h

// Bed sleep = ground rate + the bed's fatigueRecovery bonus (see handleSleeping), so only the
// ground rate is a constant here.
export const FATIGUE_PER_SLEEPING_GROUND = 0.58; // Ground: 72 → 0 in ~124s ≈ 9.9 in-game hours (per second; perTick at use)

// Wake thresholds — prevents yo-yo by requiring proper rest before resuming activity
export const SLEEP_WAKE_THRESHOLD_FED = 0; // Sleep until fully restored when not hungry

export const SLEEP_WAKE_THRESHOLD_HUNGRY = 30; // Allow early waking at 30% to go eat

// Building definitions (for sleep quality lookup)
export const BUILDINGS_DB = BUILDINGS_DATABASE_RAW as unknown as Building[];

/**
 * §G light → work. Map a tile's light level (~0.1 pitch-dark … 1.0 daylight … 1.6 firelit, from
 * `computeTileLightLevel`) to a sight/work multiplier: full speed in good light, down to a 0.4 floor
 * in the dark (a pawn can still fumble through coarse work). Fed into `sight` so it flows through the
 * *_speed formulas.
 */
export function lightWorkMultiplier(lightLevel: number): number {
  return Math.min(1, Math.max(0.4, lightLevel));
}

// Per-pawn "unreachable job" cooldown. A failed A* search to an unreachable target
// explores the whole connected map component — very expensive. Without this, an idle
// pawn that cannot reach its highest-priority job would claim → fail → release it every
// single tick, re-running that full-map search 60×/second (and ×N idle pawns). We instead
// remember the failure for UNREACHABLE_COOLDOWN_TICKS and skip the job until then.
export const UNREACHABLE_COOLDOWN_TICKS = 60; // ~1 in-game second before retrying an unreachable job

export const _unreachableJobs = new Map<string, Map<string, number>>(); // pawnId → (jobId → expiryTurn)

/**
 * Clear the module-level unreachable-job memory (D7). This Map is NOT part of GameState,
 * so without an explicit reset it survives save/load and new-game resets — stale entries
 * compared against a `turn` that resets can become permanent or expire instantly. Called
 * from the store init/load path whenever a fresh GameState is installed.
 */
export function resetUnreachableJobs(): void {
  _unreachableJobs.clear();
}

export function isJobUnreachableForPawn(pawnId: string, jobId: string, turn: number): boolean {
  const expiry = _unreachableJobs.get(pawnId)?.get(jobId);
  return expiry !== undefined && expiry > turn;
}

export function markJobUnreachable(pawnId: string, jobId: string, turn: number): void {
  let m = _unreachableJobs.get(pawnId);
  if (!m) {
    m = new Map();
    _unreachableJobs.set(pawnId, m);
  }
  // Prune expired entries so the map can't grow unbounded as job ids churn.
  if (m.size > 16) {
    for (const [id, exp] of m) if (exp <= turn) m.delete(id);
  }
  m.set(jobId, turn + UNREACHABLE_COOLDOWN_TICKS);
}

export function tryAssignPath(
  pawn: Pawn,
  tx: number,
  ty: number,
  gameState: GameState,
  // Path-churn profiler tag (ENGINE-PERFORMANCE §6 v2). 'assign' = handler routing a pawn
  // to a job/target; 'blockedRepath' = repathStuckMover recovering a dropped path.
  _reason: string = 'assign'
): GameState | null {
  if (!pawn.position) return null;
  if (!pathfinderService.isReady()) return null;
  if (isAdjacent(pawn.position.x, pawn.position.y, tx, ty)) return null;
  // PERF: shared per-tick occupancy + soft-blocked grid (same cache the mobs use) — the old per-call
  // build cloned the whole 562k-tile cost array on EVERY pawn path request, which storms during startup
  // job-pathing / combat repositioning (the harpy-fight TPS crater). Self-exclusion is dropped (the
  // mover's own start-tile penalty is moot to A*); the chosen approach tile is unoccupied either way.
  const blocked = occupancyService.blockedTilesShared(gameState);
  const approach = findAdjacentApproach(
    tx,
    ty,
    gameState.worldMap,
    blocked,
    pawn.position.x,
    pawn.position.y
  );
  if (!approach) {
    return null;
  }
  const { walkable, costs, width, height } = buildSharedSoftBlockedGrid(gameState.worldMap, blocked);
  // Churn instrumentation: count every actual A* run, by reason, plus the two churn
  // signals — re-planning while the pawn ALREADY holds a path (hadPath), and empty
  // results (fail = unreachable). A high hadPath or blockedRepath rate ⇒ behaviour bug.
  const path = pathfinderService.findPath(
    walkable,
    costs,
    width,
    height,
    pawn.position.x,
    pawn.position.y,
    approach.x,
    approach.y
  );
  if (path.length === 0) {
    return null;
  }
  return pawnService.assignPath(pawn.id, path, gameState);
}

/**
 * Recover a pawn whose path was dropped by `processMovement` after being blocked too long
 * (another body — typically an idle pawn — parked on its route to a build site / station).
 * The pawn is sitting in a MOVING_* state, not moving and not yet arrived. Re-route around
 * the obstruction toward the same target.
 *
 *   • `null`        — not stuck (still moving, arrived, or already adjacent); proceed normally.
 *   • a GameState   — re-path issued OR the pawn is adjacent and is flagged as arrived so the
 *                     handler's normal arrival branch runs next tick.
 *   • 'unreachable' — no route exists right now; caller should give up its own way
 *                     (release the job / deposit in place / go idle).
 */
export function repathStuckMover(
  pawn: Pawn,
  gameState: GameState
): GameState | 'unreachable' | null {
  const job = pawn.activeJob;
  if (!job || !pawn.position) return null;
  // Only the dropped-path case: in a move state but neither moving nor arrived.
  if (pawn.isMoving || pawn.hasReachedDestination) return null;
  if (isAdjacent(pawn.position.x, pawn.position.y, job.targetX, job.targetY)) {
    // Path was dropped right next to the target — treat it as having arrived so the
    // handler's hasReachedDestination branch fires instead of freezing in place.
    return {
      ...gameState,
      pawns: gameState.pawns.map((p) =>
        p.id === pawn.id ? { ...p, hasReachedDestination: true } : p
      )
    };
  }
  return tryAssignPath(pawn, job.targetX, job.targetY, gameState, 'blockedRepath') ?? 'unreachable';
}

/** Average idle wander-steps per second. Lower than the mob rate (1.0) — colonists mill
 *  about rather than graze. The point is they don't stand frozen on a tile forever, which
 *  also keeps idlers off build-site approach tiles (the construct deadlock). */
const WANDER_MOVES_PER_SECOND = 0.4;

/**
 * Pick a random walkable, unoccupied neighbour of (x, y). Neighbours are tried in random
 * order so a boxed-in pawn still finds its one exit. Diagonal steps are disallowed when both
 * shared orthogonal tiles are blocked (mirrors the A* wall-cut rule). Null if hemmed in.
 */
function randomWalkableNeighbour(
  gameState: GameState,
  x: number,
  y: number,
  selfId: string
): { x: number; y: number } | null {
  const dirs = [
    { dx: 0, dy: -1 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
    { dx: 1, dy: 0 },
    { dx: -1, dy: -1 },
    { dx: 1, dy: -1 },
    { dx: -1, dy: 1 },
    { dx: 1, dy: 1 }
  ];
  for (let i = dirs.length - 1; i > 0; i--) {
    const j = Math.floor(rng.random() * (i + 1));
    [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
  }
  const walkable = (nx: number, ny: number) => gameState.worldMap?.[ny]?.[nx]?.walkable === true;
  for (const { dx, dy } of dirs) {
    const nx = x + dx;
    const ny = y + dy;
    if (!walkable(nx, ny)) continue;
    if (dx !== 0 && dy !== 0 && !walkable(x + dx, y) && !walkable(x, y + dy)) continue;
    if (occupancyService.isBlocked(gameState, nx, ny, selfId)) continue;
    return { x: nx, y: ny };
  }
  return null;
}

/**
 * Idle wander: an idle pawn occasionally ambles one tile to a free neighbour instead of
 * standing perfectly still. Probabilistic (~WANDER_MOVES_PER_SECOND/s) so it reads as natural
 * milling, and — crucially — it stops idlers from permanently camping a build-site approach
 * tile and starving the construct job (mirrors how mobs already behave). Returns the updated
 * state if a step was taken, else null (caller stays put). The pawn keeps its IDLE state, so it
 * still re-evaluates jobs every tick and grabs one the instant it appears.
 */
export function tryWanderStep(pawn: Pawn, gameState: GameState): GameState | null {
  if (!pawn.position) return null;
  if (pawn.isMoving && (pawn.path?.length ?? 0) > 0) return null; // already strolling
  if (rng.random() >= WANDER_MOVES_PER_SECOND * SECONDS_PER_TICK) return null;
  const tile = randomWalkableNeighbour(gameState, pawn.position.x, pawn.position.y, pawn.id);
  if (!tile) return null;
  return pawnService.assignPath(pawn.id, [tile], gameState);
}

/**
 * Like tryAssignPath but paths the pawn directly TO (tx, ty) — used for beds
 * where the pawn should sleep ON the tile, not adjacent to it.
 */
export function tryAssignSleepPath(
  pawn: Pawn,
  tx: number,
  ty: number,
  gameState: GameState
): GameState | null {
  if (!pawn.position) return null;
  if (!pathfinderService.isReady()) return null;
  if (pawn.position.x === tx && pawn.position.y === ty) return null; // already on the bed
  // Route around other bodies via the shared per-tick grid (see navigateToApproach above for why the
  // self-exclusion / goal-exemption drop is safe). Was an O(map) clone per call.
  const blocked = occupancyService.blockedTilesShared(gameState);
  const { walkable, costs, width, height } = buildSharedSoftBlockedGrid(gameState.worldMap, blocked);
  const path = pathfinderService.findPath(
    walkable,
    costs,
    width,
    height,
    pawn.position.x,
    pawn.position.y,
    tx,
    ty
  );
  if (path.length === 0) {
    return null;
  }
  return pawnService.assignPath(pawn.id, path, gameState);
}

// Building type lists — module-level for use in helpers
export const CAMPFIRE_TYPES = ['campfire'];

export const REST_TYPES = [
  'lean_to_shelter',
  'woodland_shelter',
  'stone_hut',
  'sleeping_spot',
  'hay_bed'
];

/** Phase 6: find the nearest complete storage building (campfire etc.) to a pawn. */
export function findNearestStorageBuilding(
  pawn: Pawn,
  gs: GameState
): { x: number; y: number; buildingId: string } | null {
  if (!pawn.position) return null;
  let best: { x: number; y: number; buildingId: string; dist: number } | null = null;
  for (const b of gs.buildings ?? []) {
    if (b.status !== 'complete') continue;
    if (!CAMPFIRE_TYPES.includes(b.type)) continue;
    const dist = Math.abs(b.x - pawn.position.x) + Math.abs(b.y - pawn.position.y);
    if (!best || dist < best.dist) best = { x: b.x, y: b.y, buildingId: b.id, dist };
  }
  return best ? { x: best.x, y: best.y, buildingId: best.buildingId } : null;
}

/** Phase 6: find the best rest building for a pawn (assigned > quality > distance). */
export function findNearestRestBuilding(
  pawn: Pawn,
  gs: GameState
): { x: number; y: number; buildingId: string } | null {
  if (!pawn.position) return null;
  // 1. Prefer a building specifically assigned to this pawn.
  const assigned = (gs.buildings ?? []).find(
    (b) => b.status === 'complete' && REST_TYPES.includes(b.type) && b.assignedPawnId === pawn.id
  );
  if (assigned) return { x: assigned.x, y: assigned.y, buildingId: assigned.id };
  // 2. Among unassigned buildings pick the highest quality one (distance as tie-break).
  //    Skip buildings owned by another pawn, and skip beds already occupied by a
  //    sleeping pawn (only one pawn per bed).
  let best: { x: number; y: number; buildingId: string; score: number } | null = null;
  for (const b of gs.buildings ?? []) {
    if (b.status !== 'complete') continue;
    if (!REST_TYPES.includes(b.type)) continue;
    if (b.assignedPawnId && b.assignedPawnId !== pawn.id) continue;
    // Exclusive occupancy: skip if another pawn is sleeping on this tile OR is already
    // en route to sleep here (MOVING_TO_NEED with targetState=SLEEPING).
    // Without the en-route check, all fatigued pawns simultaneously claim the same bed.
    if (
      gs.pawns.some(
        (p) =>
          p.id !== pawn.id &&
          ((p.currentState === PAWN_STATE.SLEEPING &&
            p.position?.x === b.x &&
            p.position?.y === b.y) ||
            (p.currentState === PAWN_STATE.MOVING_TO_NEED &&
              p.activeJob?.targetState === PAWN_STATE.SLEEPING &&
              p.activeJob?.targetX === b.x &&
              p.activeJob?.targetY === b.y))
      )
    )
      continue;
    const def = BUILDINGS_DB.find((d) => d.id === b.type);
    const quality = (def?.effects?.sleepQuality ?? 0) + (def?.effects?.fatigueRecovery ?? 0);
    const dist = Math.abs(b.x - pawn.position!.x) + Math.abs(b.y - pawn.position!.y);
    // Quality dominates; distance is a small tie-break penalty.
    const score = quality * 100 - dist * 0.01;
    if (!best || score > best.score) best = { x: b.x, y: b.y, buildingId: b.id, score };
  }
  return best ? { x: best.x, y: best.y, buildingId: best.buildingId } : null;
}

/** True when the pawn is adjacent to a lit campfire (better eating). */
export function isAtFoodBuilding(pawn: Pawn, gs: GameState): boolean {
  if (!pawn.position) return false;
  return (gs.buildings ?? []).some(
    (b) =>
      b.status === 'complete' &&
      CAMPFIRE_TYPES.includes(b.type) &&
      isAdjacent(pawn.position!.x, pawn.position!.y, b.x, b.y)
  );
}

/** Returns the complete rest building the pawn is adjacent to, or null. */
export function getRestBuildingAtPawn(pawn: Pawn, gs: GameState): PlacedBuilding | null {
  if (!pawn.position) return null;
  // Use dx<=1 && dy<=1 (includes same tile) so a pawn sleeping on the building
  // tile itself (e.g. exhaustion collapse) still receives the shelter bonus.
  return (
    (gs.buildings ?? []).find(
      (b) =>
        b.status === 'complete' &&
        REST_TYPES.includes(b.type) &&
        Math.abs(b.x - pawn.position!.x) <= 1 &&
        Math.abs(b.y - pawn.position!.y) <= 1
    ) ?? null
  );
}

/** True when the pawn is adjacent to a shelter (better sleep). */
export function isAtRestBuilding(pawn: Pawn, gs: GameState): boolean {
  return getRestBuildingAtPawn(pawn, gs) !== null;
}

/**
 * Manhattan distance to the nearest food source (campfire).
 * Returns 0 when no campfire exists — pawn eats in-place, so food is always "here".
 * Returns Infinity when no food is available anywhere.
 */
export function distToNearestFoodSource(pawn: Pawn, gs: GameState): number {
  if (!pawn.position) return Infinity;
  if (!hasAvailableFood(gs)) return Infinity;
  const building = findNearestStorageBuilding(pawn, gs);
  if (!building) return 0; // no campfire → eat in place
  return Math.abs(building.x - pawn.position.x) + Math.abs(building.y - pawn.position.y);
}

/**
 * Manhattan distance to the nearest rest source (shelter).
 * Returns 0 when no shelter exists — pawn sleeps in-place.
 */
export function distToNearestRestSource(pawn: Pawn, gs: GameState): number {
  if (!pawn.position) return Infinity;
  const building = findNearestRestBuilding(pawn, gs);
  if (!building) return 0; // no shelter → sleep in place
  return Math.abs(building.x - pawn.position.x) + Math.abs(building.y - pawn.position.y);
}

/**
 * Manhattan distance from an arbitrary map point to the nearest food source (campfire).
 * Returns 0 when no campfire exists (eat in-place). Returns Infinity when no food available.
 */
export function distFromPointToNearestFoodSource(x: number, y: number, gs: GameState): number {
  if (!hasAvailableFood(gs)) return Infinity;
  let best = Infinity;
  for (const b of gs.buildings ?? []) {
    if (b.status !== 'complete') continue;
    if (!CAMPFIRE_TYPES.includes(b.type)) continue;
    const d = Math.abs(b.x - x) + Math.abs(b.y - y);
    if (d < best) best = d;
  }
  return best === Infinity ? 0 : best; // 0 = eat in place when no campfire exists
}

/**
 * Minimum Manhattan distance from any job in the pawn's soft queue to the nearest food source.
 * Returns null when the queue is empty or no food is available.
 * Jobs that are no longer in the pool or claimed by another pawn are skipped.
 */
export function computeMinQueueFoodDist(
  queueIds: string[],
  pawn: Pawn,
  gs: GameState
): number | null {
  if (queueIds.length === 0 || !hasAvailableFood(gs)) return null;
  let min = Infinity;
  for (const id of queueIds) {
    const job = (gs.jobs ?? []).find(
      (j) => j.id === id && (j.claimedBy === null || j.claimedBy === pawn.id)
    );
    if (!job) continue;
    const d = distFromPointToNearestFoodSource(job.targetX, job.targetY, gs);
    if (d < min) min = d;
  }
  return min === Infinity ? null : min;
}

/**
 * Manhattan distance from an arbitrary map point to the nearest rest source (shelter).
 * Returns 0 when no shelter exists (sleep in-place), so rest is always reachable.
 */
export function distFromPointToNearestRestSource(x: number, y: number, gs: GameState): number {
  let best = Infinity;
  for (const b of gs.buildings ?? []) {
    if (b.status !== 'complete') continue;
    if (!REST_TYPES.includes(b.type)) continue;
    const d = Math.abs(b.x - x) + Math.abs(b.y - y);
    if (d < best) best = d;
  }
  return best === Infinity ? 0 : best; // 0 = sleep in place when no shelter exists
}

/**
 * Minimum Manhattan distance from any job in the pawn's soft queue to the nearest rest source.
 * Returns null when the queue is empty. Mirrors {@link computeMinQueueFoodDist} but for the
 * fatigue interrupt — D8 fixed the copy-paste that fed food distance into the rest threshold.
 */
export function computeMinQueueRestDist(
  queueIds: string[],
  pawn: Pawn,
  gs: GameState
): number | null {
  if (queueIds.length === 0) return null;
  let min = Infinity;
  for (const id of queueIds) {
    const job = (gs.jobs ?? []).find(
      (j) => j.id === id && (j.claimedBy === null || j.claimedBy === pawn.id)
    );
    if (!job) continue;
    const d = distFromPointToNearestRestSource(job.targetX, job.targetY, gs);
    if (d < min) min = d;
  }
  return min === Infinity ? null : min;
}

/**
 * Compute the effective hunger/fatigue interrupt threshold for a working pawn,
 * incorporating two adjustments on top of the base threshold:
 *
 *  1. Work priority (laborLevel 1–4): higher-priority jobs resist interruption.
 *     Level 4 → +8 pts (harder). Level 1 → −4 pts (easier). Default level 2 → 0.
 *
 *  2. Queue food lookahead: if no upcoming task brings the pawn near food,
 *     lower the threshold slightly so they eat sooner rather than collapse later.
 *     minQueueFoodDist is the min(dist from any queued job → food).
 *     The farther that minimum is from food, the more the threshold drops (up to 5 pts).
 *
 * Result is clamped within ±12 pts of the base to prevent extreme values.
 */
export function computeAdjustedNeedThreshold(
  baseThreshold: number,
  laborLevel: number,
  minQueueFoodDist: number | null
): number {
  const priorityShift = (laborLevel - 2) * WORK_PRIORITY_THRESHOLD_SHIFT;
  // queueFoodPressure 0 = queue job right next to food; 1 = all jobs 20+ tiles from food
  const queueFoodPressure = minQueueFoodDist !== null ? Math.min(minQueueFoodDist / 20, 1) : 1; // no queue → full pressure (no known path to food)
  const queueShift = -(queueFoodPressure * QUEUE_FOOD_THRESHOLD_REDUCTION);
  return Math.max(
    baseThreshold - 12,
    Math.min(baseThreshold + 12, baseThreshold + priorityShift + queueShift)
  );
}

/**
 * Decides whether a busy pawn should interrupt their current activity to attend to a need.
 *
 * The formula combines two factors:
 *   1. Urgency  — how far past `threshold` the need has climbed (quadratic 0→1 curve)
 *   2. Proximity — how much further the need source is compared to the current job target
 *
 * At need = 100 the pawn always interrupts regardless of distance.
 * At need = threshold the pawn only detours if the source is within NEED_DETOUR_MIN_DIST tiles.
 * In between, the acceptable detour grows quadratically up to NEED_DETOUR_MAX_FACTOR × job distance.
 *
 * @param need         Current hunger or fatigue (0–100)
 * @param threshold    Adjusted trigger (already accounts for labor level + queue lookahead)
 * @param distToSource Manhattan distance to the nearest food / shelter
 * @param distToJob    Manhattan distance to the current job target (0 if already there)
 */
export function shouldInterruptForNeed(
  need: number,
  threshold: number,
  distToSource: number,
  distToJob: number
): boolean {
  if (need >= 100) return true;
  if (need < threshold) return false;
  const urgency = (need - threshold) / (100 - threshold); // 0..1
  const urgencyBias = urgency * urgency; // quadratic: slow start, steep near 100%
  const effectiveJobDist = Math.max(distToJob, NEED_DETOUR_MIN_DIST);
  const maxAcceptableDist = effectiveJobDist * (1 + urgencyBias * (NEED_DETOUR_MAX_FACTOR - 1));
  return distToSource <= maxAcceptableDist;
}

// M2-core (ENGINE-PERFORMANCE ★ ACTIVE): these single-pawn updaters mutate the live array element
// in place (found by id, matching the old map-by-id semantics) and return the SAME state ref — no
// per-call `pawns.map` array allocation, which was O(n) per call → O(n²)/tick (transitionTo runs
// per-pawn-per-tick). Safe: processGameTurn shallow-copies the top-level state each tick so
// reactivity still fires; the ?simworker snapshot is cloned at the boundary; no FSM site keys off
// these helpers' return identity (the only `!==` checks are tendWounds/healWounds).
export function transitionTo(pawn: Pawn, state: PawnStateName, gs: GameState): GameState {
  const prev = pawn.currentState ?? PAWN_STATE.IDLE;
  if (prev !== state) {
    gameLogger.log(gs.turn, 'STATE-CHG', `${pawn.name} ${prev} → ${state}`);
  }
  const target = pawnById(gs.pawns, pawn.id);
  if (target) target.currentState = state;
  return gs;
}

export function goIdle(pawn: Pawn, gs: GameState): GameState {
  const target = pawnById(gs.pawns, pawn.id);
  if (target) {
    target.currentState = PAWN_STATE.IDLE;
    target.activeJob = undefined;
    target.isMoving = false;
    target.path = [];
  }
  return gs;
}

/**
 * M2-core: apply `mutate` to one pawn (found by id) IN PLACE and return the SAME state ref — the
 * mutable replacement for the `{...gs, pawns: gs.pawns.map(p => p.id===id ? {...p, …} : p)}` splice
 * that allocated a whole pawns array (+ a pawn object) per single-pawn update. `mutate` receives the
 * live array element; set its fields (nested too: `p.needs.hunger = …`). No-op if the id isn't found.
 */
export function mutatePawn(gs: GameState, id: string, mutate: (p: Pawn) => void): GameState {
  const p = pawnById(gs.pawns, id);
  if (p) mutate(p);
  return gs;
}

// ── P0 perception pre-filter (ENGINE-PERFORMANCE §6 / ADR-018) ────────────────
// findCombatThreat / findNearestHuntTarget each run once per pawn per tick, and each
// used to scan ALL mobs — most of them neutral animals — re-deriving the predicate
// every call (O(pawns × mobs); the profiler measured ~21k checks/tick). The relevant
// subsets (hostiles; hunt-flagged) are the SAME for every pawn within a tick, so
// compute them once and reuse. Keyed on the gs.mobs array identity: immutable updates
// (ADR-002) recreate the array whenever any mob changes (death, state flip, spawn), so
// the memo self-invalidates and can never serve a stale subset. This is the constant-
// factor cut only — true O(1)-per-tick (persistence) and spatial bounding are P1/P2.
let _mobSubsetCache: { mobsRef: Mob[] | undefined; hostiles: Mob[]; huntTargets: Mob[] } | null =
  null;

function mobSubsets(gs: GameState): { hostiles: Mob[]; huntTargets: Mob[] } {
  const mobs = gs.mobs;
  if (_mobSubsetCache && _mobSubsetCache.mobsRef === mobs) return _mobSubsetCache;
  const hostiles: Mob[] = [];
  const huntTargets: Mob[] = [];
  for (const m of mobs ?? []) {
    if (m.isAlive === false || m.state === 'Corpse') continue;
    if (m.entityClass === 'mob' || m.state === 'Attacking' || m.state === 'Alerted')
      hostiles.push(m);
    if (m.markedForHunt) huntTargets.push(m);
  }
  _mobSubsetCache = { mobsRef: mobs, hostiles, huntTargets };
  return _mobSubsetCache;
}

/**
 * Nearest hostile mob this pawn should react to, or null. A `mob`-class creature
 * (goblins etc.) is always hostile; a neutral `animal` only counts once it has
 * actually turned aggressive (Alerted/Attacking) toward the colony.
 *
 * Detection range depends on stance: a "defensive" pawn reacts only once a hostile
 * is adjacent (it fights when drawn into melee), while "aggressive" and "flee" pawns
 * react anywhere inside their vision range.
 */
export function findCombatThreat(pawn: Pawn, gs: GameState): Mob | null {
  if (!pawn.position || pawn.isAlive === false) return null;
  const stance = pawn.combatStance ?? 'defensive';
  const vision = pawnVisionTiles(pawn, gs);
  let range = stance === 'defensive' ? 1 : vision;
  // RANGED-COMBAT: a ranged pawn engages approaching threats out to its EFFECTIVE shooting range (the
  // same STR/gear-scaled, vision-capped value the shot itself uses) even on the defensive — otherwise
  // it would hold fire until an enemy is already adjacent, or stand at a range it can't actually hit.
  const rw = getRangedWeapon(pawn);
  if (rw) range = Math.max(range, effectiveRangedRange(pawn, rw));
  const px = pawn.position.x;
  const py = pawn.position.y;
  let best: Mob | null = null;
  let bestDist = Infinity;
  // Pre-filtered hostile subset (computed once per tick), not the full mob list.
  for (const m of mobSubsets(gs).hostiles) {
    const d = Math.max(Math.abs(px - m.x), Math.abs(py - m.y));
    if (d <= range && d < bestDist) {
      best = m;
      bestDist = d;
    }
  }
  return best;
}

/** Stop a pawn's current movement in place (used when planting to fight). */
export function haltMovement(pawn: Pawn, gs: GameState): GameState {
  if ((pawn.path?.length ?? 0) === 0 && !pawn.isMoving) return gs;
  const target = pawnById(gs.pawns, pawn.id);
  if (target) {
    target.path = [];
    target.isMoving = false;
    target.hasReachedDestination = false;
  }
  return gs;
}

/** A pawn's labor level (0–4) for a work category, mirroring getAvailableJobs' default of 2. */
export function laborLevel(pawn: Pawn, workId: string, gs: GameState): number {
  const ls = gs.workAssignments?.[pawn.id]?.laborSettings;
  if (ls && workId in ls) return ls[workId] ?? 2;
  const pri = gs.workAssignments?.[pawn.id]?.workPriorities?.[workId];
  return pri ?? 2;
}

/** Nearest live mob the player has flagged `markedForHunt` (Chebyshev), or null. */
export function findNearestHuntTarget(pawn: Pawn, gs: GameState): Mob | null {
  if (!pawn.position) return null;
  const { x: px, y: py } = pawn.position;
  let best: Mob | null = null;
  let bestDist = Infinity;
  // Pre-filtered hunt-flagged subset (computed once per tick), not the full mob list.
  for (const m of mobSubsets(gs).huntTargets) {
    const d = Math.max(Math.abs(px - m.x), Math.abs(py - m.y));
    if (d < bestDist) {
      best = m;
      bestDist = d;
    }
  }
  return best;
}

/** Put the pawn into HUNTING locked onto `target` (clearing any active job). */
export function enterHunting(pawn: Pawn, target: Mob, gs: GameState): GameState {
  return {
    ...gs,
    pawns: gs.pawns.map((p) =>
      p.id === pawn.id
        ? { ...p, currentState: PAWN_STATE.HUNTING, huntTargetId: target.id, activeJob: undefined }
        : p
    )
  };
}

/**
 * If a player-marked huntable mob exists and the pawn's hunting labor is at least as high
 * as its best available job, lock onto the nearest one and start the hunt. Returns the new
 * state, or null to fall through to normal job selection. `bestJob` is the highest-priority
 * reachable job (or null) — used only to compare labor levels.
 */
export function tryStartHunt(pawn: Pawn, gs: GameState, bestJob: Job | null): GameState | null {
  if (!pawn.position) return null;
  const huntLevel = laborLevel(pawn, 'hunting', gs);
  if (huntLevel <= 0) return null;
  const jobLevel = bestJob ? laborLevel(pawn, jobService.getJobWorkCategory(bestJob, gs), gs) : 0;
  if (huntLevel < jobLevel) return null;

  const target = findNearestHuntTarget(pawn, gs);
  if (!target) return null;

  // Already in melee range — plant and let combat resolve swings.
  if (Math.max(Math.abs(pawn.position.x - target.x), Math.abs(pawn.position.y - target.y)) <= 1) {
    return enterHunting(pawn, target, gs);
  }
  // Otherwise commit only if we can actually path to it; else fall through to normal jobs
  // so the pawn isn't stuck fixating on an unreachable mark.
  const afterPath = tryAssignPath(pawn, target.x, target.y, gs);
  if (!afterPath) return null;
  return enterHunting(pawn, target, afterPath);
}

/** Leave HUNTING for `state`, clearing the target and any in-flight movement. */
export function endHunt(pawn: Pawn, state: PawnStateName, gs: GameState): GameState {
  return {
    ...gs,
    pawns: gs.pawns.map((p) =>
      p.id === pawn.id
        ? { ...p, currentState: state, huntTargetId: undefined, path: [], isMoving: false }
        : p
    )
  };
}

// §D water-need routing thresholds (higher than the opportunistic auto-drink/wash at 70/75, so a
// pawn only abandons work to seek water when it's getting urgent) and relief amounts.
export const ROUTE_TO_DRINK_THIRST = 82;

export const ROUTE_TO_WASH_HYGIENE = 88;

export const DRINK_NEED_RELIEF = 65;

export const WASH_NEED_RELIEF = 70;

// Durations for drinking/washing — these take time like eating/sleeping (not instant). The need
// relief above is distributed evenly over the duration. Drinking is quick (a few sips); washing is
// a longer chore.
export const DRINK_TURNS = ticksFromSeconds(2);

export const WASH_TURNS = ticksFromSeconds(4);

/**
 * §D: nearest place to satisfy a water need — a player-painted `drink`/`wash` zone tile (the way
 * the player controls where pawns go, exactly like stockpile drop-off), or for drinking a `well`
 * building. Mirrors findNearestDepositPoint (cheap: scans designations + buildings, not the map).
 */
export function findNearestWaterTarget(
  pawn: Pawn,
  gs: GameState,
  kind: 'drink' | 'wash'
): { x: number; y: number } | null {
  if (!pawn.position) return null;
  const { x: px, y: py } = pawn.position;
  let best: { x: number; y: number; dist: number } | null = null;

  for (const [key, type] of Object.entries(gs.designations ?? {})) {
    if (type !== kind) continue;
    const [x, y] = key.split(',').map(Number);
    const dist = Math.abs(x - px) + Math.abs(y - py);
    if (!best || dist < best.dist) best = { x, y, dist };
  }
  if (best) return { x: best.x, y: best.y };

  if (kind === 'drink') {
    for (const b of gs.buildings ?? []) {
      if (b.status !== 'complete' || b.type !== 'well') continue;
      const dist = Math.abs(b.x - px) + Math.abs(b.y - py);
      if (!best || dist < best.dist) best = { x: b.x, y: b.y, dist };
    }
  }
  return best ? { x: best.x, y: best.y } : null;
}

/** §D: route a pawn to a drink/wash target via the MOVING_TO_NEED flow; null if none/unreachable. */
export function tryRouteToWaterNeed(
  pawn: Pawn,
  gameState: GameState,
  kind: 'drink' | 'wash'
): GameState | null {
  const target = findNearestWaterTarget(pawn, gameState, kind);
  if (!target || !pawn.position) return null;
  const targetState = kind === 'drink' ? PAWN_STATE.DRINKING : PAWN_STATE.WASHING;
  // Already there → start the task in place. Clear any in-progress movement (the pawn may have been
  // wandering or mid-job when interrupted next to water) so it's gated at this tile, not still walking.
  if (isAdjacent(pawn.position.x, pawn.position.y, target.x, target.y)) {
    const gs = transitionTo(pawn, targetState, gameState);
    return {
      ...gs,
      pawns: gs.pawns.map((p) =>
        p.id === pawn.id ? { ...p, path: [], isMoving: false, nextCellCostLeft: undefined } : p
      )
    };
  }
  const afterPath = tryAssignPath(pawn, target.x, target.y, gameState);
  if (!afterPath) return null;
  return {
    ...afterPath,
    pawns: afterPath.pawns.map((p) =>
      p.id === pawn.id
        ? {
            ...p,
            currentState: PAWN_STATE.MOVING_TO_NEED,
            activeJob: {
              type: 'need' as const,
              targetX: target.x,
              targetY: target.y,
              progress: 0,
              timeRequired: 1,
              turnsInState: 0,
              targetState
            }
          }
        : p
    )
  };
}
