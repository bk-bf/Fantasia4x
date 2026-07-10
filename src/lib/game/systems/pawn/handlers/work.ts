/** pawn/handlers/work — work state handlers, extracted from PawnStateMachine (hotspot step 2). Each
 *  is a plain (pawn, gameState) => GameState function; the dispatcher wires them into the table. */
import type { GameState, Pawn } from '../../../core/types';
import { gameLogger } from '../../../dev/gameLogger';
import { manhattan } from '../../../core/distance';
import { perTick } from '../../../core/time';
import { jobService, BASE_WORK_RATE } from '../../../services/JobService';
import { pawnStatService } from '../../../services/PawnStatService';
import { pathfinderService } from '../../../services/PathfinderService';
import { PAWN_STATE } from '../pawnStates';
import { isAdjacent } from '../pawnQueries';
import { allowedTilesForPawn, nearestAllowedTile } from '../zoneConfine';
import { assignDraftMovePath } from '../../../services/draftMovePath';
import {
  JOB_QUEUE_SIZE,
  transitionTo,
  goIdle,
  mutatePawn,
  isJobUnreachableForPawn,
  markJobUnreachable,
  tryStartHunt,
  tryAssignPath,
  repathStuckMover,
  tryWanderStep
} from '../pawnHelpers';
import { checkNeedInterrupts, selectIdleNeed, applyNeed } from '../needSelection';
import {
  orderStationTile,
  depositInventory,
  findNearestDepositPoint,
  opportunisticHaulPickup
} from '../pawnHauling';
import { addInstanceToInventory } from '../../../core/PawnEquipment';
import { aggregateFromDrops } from '../../../core/GameState';

export function handleHauling(pawn: Pawn, gameState: GameState): GameState {
  // ADR-016 fetch-carry: items picked up for a craft order go to that order's station tile
  // (and are staged there with reservedFor), not to the nearest stockpile.
  if (pawn.carryingForOrder) {
    const station = orderStationTile(pawn.carryingForOrder, gameState);
    if (!station) {
      // Station/order gone — stageInventoryAtStation handles the fallback (deposit to stockpile).
      return depositInventory(pawn, gameState);
    }
    if (pawn.position && isAdjacent(pawn.position.x, pawn.position.y, station.x, station.y)) {
      return depositInventory(pawn, gameState); // stages at station
    }
    const afterPath = pawn.position ? tryAssignPath(pawn, station.x, station.y, gameState) : null;
    if (!afterPath) return depositInventory(pawn, gameState); // unreachable — stage in place fallback
    return mutatePawn(afterPath, pawn.id, (p) => {
      p.currentState = PAWN_STATE.MOVING_TO_DEPOSIT;
      p.activeJob = {
        type: 'need' as const,
        targetX: station.x,
        targetY: station.y,
        progress: 0,
        timeRequired: 1,
        depositX: station.x,
        depositY: station.y
      };
    });
  }

  // Pawn just picked up an item and needs to find a deposit point
  const deposit = findNearestDepositPoint(pawn, gameState);
  if (!deposit) {
    // No building to deposit at — drop straight to stockpile
    return depositInventory(pawn, gameState);
  }

  const alreadyAdjacent =
    pawn.position && isAdjacent(pawn.position.x, pawn.position.y, deposit.x, deposit.y);

  if (alreadyAdjacent) {
    return depositInventory(pawn, gameState);
  }

  const afterPath = pawn.position ? tryAssignPath(pawn, deposit.x, deposit.y, gameState) : null;

  if (!afterPath) {
    return depositInventory(pawn, gameState);
  }

  return mutatePawn(afterPath, pawn.id, (p) => {
    p.currentState = PAWN_STATE.MOVING_TO_DEPOSIT;
    p.activeJob = {
      type: 'need' as const,
      targetX: deposit.x,
      targetY: deposit.y,
      progress: 0,
      timeRequired: 1,
      depositX: deposit.x,
      depositY: deposit.y
    };
  });
}

export function handleMovingToDeposit(pawn: Pawn, gameState: GameState): GameState {
  const activeJob = pawn.activeJob;
  if (!activeJob) return depositInventory(pawn, gameState);

  // Recover from a path dropped after being blocked too long; if the deposit point is
  // now unreachable, drop the goods in place rather than freezing.
  const recovered = repathStuckMover(pawn, gameState);
  if (recovered === 'unreachable') return depositInventory(pawn, gameState);
  if (recovered) return recovered;

  if (pawn.hasReachedDestination && pawn.position) {
    const adjacent = isAdjacent(
      pawn.position.x,
      pawn.position.y,
      activeJob.targetX,
      activeJob.targetY
    );
    if (adjacent) {
      return depositInventory(
        pawn,
        mutatePawn(gameState, pawn.id, (p) => {
          p.hasReachedDestination = false;
        })
      );
    }
    // Path ended SHORT of the stockpile (the target tile got occupied, etc.). Do NOT set the load
    // down out here — that was the ethereal-deposit leak (goods credited to a stockpile the pawn never
    // reached). Re-enter HAULING to re-find the deposit point and path again, so the pawn stays
    // MOTIVATED to physically reach the stockpile. A genuinely unreachable stockpile is caught by
    // repathStuckMover above (→ load set down loose on the ground, never teleported).
    return mutatePawn(gameState, pawn.id, (p) => {
      p.currentState = PAWN_STATE.HAULING;
      p.hasReachedDestination = false;
      p.activeJob = undefined;
    });
  }
  return gameState;
}

export function handleIdle(pawn: Pawn, gameState: GameState): GameState {
  // Need-target selection (hunger / thirst→drink / hygiene→wash / fatigue) is decided by
  // needSelection; the handler only applies the resulting state transition (P-4b).
  const idleNeed = selectIdleNeed(pawn, gameState);
  if (idleNeed) return applyNeed(pawn, gameState, idleNeed);

  // ADR-016 / haul recovery: a pawn that is still carrying items (a fetch or haul interrupted
  // by a need) must deliver them before taking new work — otherwise the goods, and for a fetch
  // the reservation they represent, would be stranded in its hands. handleHauling routes a
  // fetch-carry to its order's station (carryingForOrder) and a plain haul to the stockpile.
  // Pinned items are kept in hand and never deposited, so they must NOT trigger haul-recovery —
  // otherwise a pawn carrying only pinned items would loop Idle→Hauling→deposit(keeps)→Idle forever.
  const pinnedSet = new Set(pawn.pinnedItems ?? []);
  if (Object.entries(pawn.inventory?.items ?? {}).some(([id, q]) => q > 0 && !pinnedSet.has(id))) {
    return transitionTo(pawn, PAWN_STATE.HAULING, gameState);
  }

  // Don't pick jobs until the pathfinder is ready — prevents endless pick/release cycles
  if (!pathfinderService.isReady()) return gameState;

  // Restriction zones: a confined (non-drafted) pawn may only claim jobs whose target tile lies inside
  // its allowed area, so it never grabs out-of-zone work and then churns failing to path there. Built
  // once here (only for confined pawns) so the isReachable predicate is O(1) per candidate.
  const allowedZone = pawn.drafted ? null : allowedTilesForPawn(gameState, pawn.id);

  // If confined and currently OUTSIDE the allowed area (zone freshly drawn away from the pawn), march it
  // back IN before considering any work — drawing a restriction zone should walk the pawn there, not
  // freeze it. assignDraftMovePath uses the normal (unconfined) grid so the route home isn't walled off;
  // once the pawn re-enters the zone, confinement re-applies. Skip while it's already striding home.
  if (allowedZone && pawn.position && !allowedZone.has(`${pawn.position.x},${pawn.position.y}`)) {
    if (pawn.isMoving && (pawn.path?.length ?? 0) > 0) return gameState;
    const home = nearestAllowedTile(allowedZone, pawn.position.x, pawn.position.y);
    if (home) return assignDraftMovePath(gameState, pawn, home.x, home.y);
    return gameState; // no reachable allowed tile — stay put rather than churn
  }

  const jobsById = allowedZone ? new Map(gameState.jobs.map((j) => [j.id, j])) : null;
  const jobInZone = (id: string): boolean => {
    if (!allowedZone || !jobsById) return true;
    const j = jobsById.get(id);
    if (!j) return true;
    if (allowedZone.has(`${j.targetX},${j.targetY}`)) return true;
    // A pawn works a job from an ADJACENT tile, and the target itself can be an UNWALKABLE tile it
    // never stands on — a wall/solid-building blueprint (built from beside it) or a resource node. So
    // the job is workable from inside the zone if ANY neighbour of the target is in-zone. Confinement
    // still holds: pathing stays on allowed tiles, so the pawn only ever STANDS inside the zone.
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        if ((dx || dy) && allowedZone.has(`${j.targetX + dx},${j.targetY + dy}`)) return true;
    return false;
  };

  // Job-target selection (which job + the need-lookahead queue preview) is decided by JobService;
  // the handler injects the pawn-system reachability memory and only applies the result (P-4b).
  const { job, queuePreview } = jobService.selectJobForPawn(pawn, gameState, {
    isReachable: (id) => !isJobUnreachableForPawn(pawn.id, id, gameState.turn) && jobInZone(id),
    queueSize: JOB_QUEUE_SIZE
  });

  // Hunting competes with normal work by labor level: a player-marked huntable mob is
  // pursued when the pawn's hunting priority is at least as high as its best available job.
  const hunt = tryStartHunt(pawn, gameState, job ?? null);
  if (hunt) return hunt;

  // Nothing to do right now — amble about rather than stand frozen. Keeps idlers from
  // permanently camping a build-site approach tile (the construct deadlock) and reads as
  // natural milling. Still IDLE, so a job appearing next tick is picked up immediately.
  if (!job) return tryWanderStep(pawn, gameState) ?? gameState;

  let gs = jobService.claimJob(pawn.id, job.id, gameState);

  // ADR-009 step 2: if this is a tool-gated job and the pawn isn't already holding the tool, detour
  // to grab one from colony stock first (carried in inventory, not belted), THEN proceed to the job.
  // `toolFetch` makes the first leg target the tool's stockpile tile; the pickup re-targets the site.
  let toolFetch: { itemId: string; siteX: number; siteY: number } | undefined;
  let destX = job.targetX;
  let destY = job.targetY;
  const toolReq = jobService.requiredToolForJob(job, gs);
  if (toolReq && !jobService.pawnHasToolFor(pawn, toolReq.workType, toolReq.minTier)) {
    const drop = jobService.findStockToolDropFor(
      gs,
      toolReq.workType,
      toolReq.minTier,
      pawn.position ?? undefined
    );
    if (!drop) {
      // Claimable only because the colony had a tool a moment ago; it's gone now — cool the job
      // down for this pawn and release so a tool-bearing pawn can take it.
      markJobUnreachable(pawn.id, job.id, gameState.turn);
      return jobService.releaseJob(pawn.id, job.id, gs);
    }
    toolFetch = { itemId: drop.resourceId, siteX: job.targetX, siteY: job.targetY };
    destX = drop.x;
    destY = drop.y;
  }

  const activeJob = {
    type: job.type as 'harvest' | 'construct' | 'craft' | 'haul' | 'fetch' | 'plant',
    jobId: job.id,
    targetX: destX,
    targetY: destY,
    resourceId: job.resourceId,
    droppedItemId: job.droppedItemId,
    buildingId: job.buildingId,
    craftQueueId: job.craftQueueId,
    progress: 0,
    timeRequired: job.workRequired,
    startedTurn: gameState.turn,
    toolFetch
  };

  // ADR-016: craft jobs now target the station tile, so the pawn must walk there like any other
  // job (no more "craft anywhere"). Only genuinely abstract (0,0) jobs are worked in place. A
  // tool-fetch detour never starts AT the site — the first leg is always the tool tile.
  const atSite =
    !toolFetch &&
    ((job.targetX === 0 && job.targetY === 0) || // abstract building placed off-map
      (pawn.position && isAdjacent(pawn.position.x, pawn.position.y, job.targetX, job.targetY)));

  // queuePreview (soft-preview of upcoming unclaimed jobs for the need-lookahead system) is
  // computed by jobService.selectJobForPawn above.

  if (atSite) {
    return mutatePawn(gs, pawn.id, (p) => {
      p.currentState = PAWN_STATE.WORKING;
      p.activeJob = activeJob;
      p.jobQueue = queuePreview;
    });
  }

  const afterPath = tryAssignPath(pawn, destX, destY, gs);
  if (afterPath) {
    return mutatePawn(afterPath, pawn.id, (p) => {
      p.currentState = PAWN_STATE.MOVING_TO_RESOURCE;
      p.activeJob = activeJob;
      p.jobQueue = queuePreview;
    });
  }

  // tryAssignPath returned null = already adjacent to the destination OR genuinely unreachable.
  // A tool-fetch leg that's already adjacent enters MovingToResource flagged arrived, so the pickup
  // branch fires next tick (the job-target adjacency was handled by `atSite` above).
  if (toolFetch && pawn.position && isAdjacent(pawn.position.x, pawn.position.y, destX, destY)) {
    return mutatePawn(gs, pawn.id, (p) => {
      p.currentState = PAWN_STATE.MOVING_TO_RESOURCE;
      p.activeJob = activeJob;
      p.jobQueue = queuePreview;
      p.hasReachedDestination = true;
    });
  }

  // Unreachable right now — cool the job down for this pawn so we don't re-run the expensive failed
  // pathfind every tick, then drop the claim.
  markJobUnreachable(pawn.id, job.id, gameState.turn);
  return jobService.releaseJob(pawn.id, job.id, gs);
}

/**
 * ADR-009 step 2 — the pawn has reached the tool's stockpile tile: take one tool from stock, carry
 * it in its inventory (NOT the belt slot — the gate accepts a carried tool), clear the detour, and
 * re-path to the real job site. If the tool was taken by someone else first, release the job + cool
 * it down so the pawn re-selects (and may grab from another stock tile).
 */
function acquireToolAndProceed(pawn: Pawn, gameState: GameState): GameState {
  const aj = pawn.activeJob!;
  const tf = aj.toolFetch!;
  const drop = (gameState.droppedItems ?? []).find(
    (d) =>
      d.stored &&
      d.resourceId === tf.itemId &&
      d.x === aj.targetX &&
      d.y === aj.targetY &&
      (d.quantity ?? 0) > 0
  );
  if (!drop) {
    if (aj.jobId) markJobUnreachable(pawn.id, aj.jobId, gameState.turn);
    return jobService.releaseJob(pawn.id, aj.jobId ?? '', goIdle(pawn, gameState));
  }

  // Remove one tool from stock + recompute the aggregate (it's now on the pawn, not the colony).
  const remainder = (drop.quantity ?? 1) - 1;
  const newDropped =
    remainder > 0
      ? (gameState.droppedItems ?? []).map((d) =>
          d.id === drop.id ? { ...d, quantity: remainder } : d
        )
      : (gameState.droppedItems ?? []).filter((d) => d.id !== drop.id);

  // Carry the tool in the pawn's inventory (NOT the belt slot — belts go there). The tool-gate
  // (`pawnHasToolFor`) accepts a carried tool, so the pawn can work the job while holding it in its
  // pack; deposit/craft-staging preserve carried instances, so it isn't dropped at a stockpile.
  const withTool: GameState = {
    ...gameState,
    droppedItems: newDropped,
    stockpile: aggregateFromDrops(newDropped),
    pawns: gameState.pawns.map((p) => {
      if (p.id !== pawn.id) return p;
      const carried = addInstanceToInventory(p, tf.itemId);
      return {
        ...carried,
        activeJob: { ...aj, toolFetch: undefined, targetX: tf.siteX, targetY: tf.siteY },
        hasReachedDestination: false
      };
    })
  };

  const updated = withTool.pawns.find((p) => p.id === pawn.id)!;
  // Already at the site (tool tile == site or adjacent)? Work next tick. Otherwise path there.
  if (updated.position && isAdjacent(updated.position.x, updated.position.y, tf.siteX, tf.siteY)) {
    return mutatePawn(withTool, pawn.id, (p) => {
      p.currentState = PAWN_STATE.MOVING_TO_RESOURCE;
      p.hasReachedDestination = true;
    });
  }
  const afterPath = tryAssignPath(updated, tf.siteX, tf.siteY, withTool);
  if (!afterPath) {
    if (aj.jobId) markJobUnreachable(pawn.id, aj.jobId, withTool.turn);
    return jobService.releaseJob(pawn.id, aj.jobId ?? '', goIdle(updated, withTool));
  }
  return mutatePawn(afterPath, pawn.id, (p) => {
    p.currentState = PAWN_STATE.MOVING_TO_RESOURCE;
  });
}

export function handleMovingToResource(pawn: Pawn, gameState: GameState): GameState {
  const activeJob = pawn.activeJob;
  if (!activeJob || activeJob.type === 'need') return goIdle(pawn, gameState);

  const jobInPool = activeJob.jobId
    ? (gameState.jobs ?? []).find((j) => j.id === activeJob.jobId)
    : null;
  if (!jobInPool) return goIdle(pawn, gameState);

  // Dynamic need interruption while en route to a job.
  // Re-evaluated every turn so needs that arise mid-journey are caught early.
  // Both work priority and queue lookahead adjust when the pawn will divert.
  const enRouteDist = pawn.position
    ? manhattan(activeJob.targetX, activeJob.targetY, pawn.position.x, pawn.position.y)
    : 0;
  const enRouteQueue = pawn.jobQueue ?? [];
  const enRouteLaborLevel = jobService.getJobLaborLevel(jobInPool, pawn, gameState);

  const interrupted = checkNeedInterrupts(
    pawn,
    gameState,
    'EnRoute',
    enRouteDist,
    enRouteQueue,
    enRouteLaborLevel
  );
  if (interrupted) return interrupted;

  // Recover from a path dropped after being blocked too long (e.g. an idle pawn parked on
  // the build site's approach tile). Re-route around it; if the site is now unreachable,
  // cool the job down for this pawn and release it so another pawn can try.
  const recovered = repathStuckMover(pawn, gameState);
  if (recovered === 'unreachable') {
    if (activeJob.jobId) markJobUnreachable(pawn.id, activeJob.jobId, gameState.turn);
    return jobService.releaseJob(pawn.id, activeJob.jobId ?? '', goIdle(pawn, gameState));
  }
  if (recovered) return recovered;

  if (pawn.hasReachedDestination && pawn.position) {
    const adjacent = isAdjacent(
      pawn.position.x,
      pawn.position.y,
      activeJob.targetX,
      activeJob.targetY
    );
    // ADR-009 step 2: arrived at the tool's stockpile tile — grab + equip it, then continue to the
    // job site (still MovingToResource). Must run BEFORE the WORKING transition (no tool, no work).
    if (adjacent && activeJob.toolFetch) {
      return acquireToolAndProceed(pawn, gameState);
    }
    if (adjacent) {
      return mutatePawn(gameState, pawn.id, (p) => {
        p.currentState = PAWN_STATE.WORKING;
        p.hasReachedDestination = false;
      });
    }
    return goIdle(pawn, gameState);
  }
  return gameState;
}

// How far (Chebyshev) another claimable job of the SAME type counts as "still part of this cluster".
// While one exists within this radius, a pawn defers its opportunistic haul and keeps working the
// patch — so it finishes the 10 bushes next to it before making the trip to the stockpile.
const OPPORTUNISTIC_DEFER_RADIUS = 16;

/**
 * Is there another claimable job of the same `jobType` within OPPORTUNISTIC_DEFER_RADIUS of the pawn —
 * i.e. more of the same work cluster left to do? Used to hold off opportunistic hauling until the pawn
 * has cleared the local patch (don't haul after every single bush). Unclaimed jobs, or ones this pawn
 * already holds, count; another pawn's claim does not.
 */
function moreNearbySameTypeWork(pawn: Pawn, gs: GameState, jobType: string): boolean {
  const px = pawn.position?.x;
  const py = pawn.position?.y;
  if (px == null || py == null) return false;
  return (gs.jobs ?? []).some(
    (j) =>
      j.type === jobType &&
      (j.claimedBy == null || j.claimedBy === pawn.id) &&
      Math.max(Math.abs(j.targetX - px), Math.abs(j.targetY - py)) <= OPPORTUNISTIC_DEFER_RADIUS
  );
}

export function handleWorking(pawn: Pawn, gameState: GameState): GameState {
  const activeJob = pawn.activeJob;
  if (!activeJob || activeJob.type === 'need') return goIdle(pawn, gameState);

  const jobId = activeJob.jobId;
  if (!jobId) return goIdle(pawn, gameState);

  const jobInPool = (gameState.jobs ?? []).find((j) => j.id === jobId);
  if (!jobInPool) return goIdle(pawn, gameState);

  // Dynamic need interruption: weighs urgency against proximity to food/shelter vs job target.
  // The threshold is adjusted by work priority (high-priority jobs resist interruption more)
  // and job-queue lookahead (if no upcoming task passes near food, eat sooner).
  const jobDist = pawn.position
    ? manhattan(activeJob.targetX, activeJob.targetY, pawn.position.x, pawn.position.y)
    : 0;
  const queue = pawn.jobQueue ?? [];
  // Reuse jobInPool (found above) instead of scanning gameState.jobs a second time (D9.3).
  const laborLevel = jobService.getJobLaborLevel(jobInPool, pawn, gameState);

  const interrupted = checkNeedInterrupts(pawn, gameState, 'Working', jobDist, queue, laborLevel);
  // A need is pulling the pawn off the job — it's leaving the work area anyway, so scoop up any loose
  // stockpile-bound goods on its tile to carry along (delivered after the need via handleIdle's
  // haul-recovery). No-op when nothing's there, so it never detours a hungry pawn — just a free grab.
  if (interrupted) return opportunisticHaulPickup(interrupted, pawn.id);

  // Must be adjacent to the job target to work it (ADR-016: craft is no longer exempt — the
  // pawn crafts AT the station tile). Only abstract (0,0) jobs are worked in place.
  if (
    !(activeJob.targetX === 0 && activeJob.targetY === 0) && // abstract building
    pawn.position &&
    !isAdjacent(pawn.position.x, pawn.position.y, activeJob.targetX, activeJob.targetY)
  ) {
    return jobService.releaseJob(pawn.id, jobId, goIdle(pawn, gameState));
  }

  // §G light → sight → work. Darkness now flows through the `sight` capacity itself (dampened per tick to
  // the pawn's night-vision-adjusted effectiveLight, no penalty ≥50% light), and work `*_speed`/quality
  // formulas AVERAGE their capacities — so low light only shaves work by sight's SHARE (e.g. 1/2 or 1/3),
  // never to zero, and needs no separate light factor or 0.4 floor here. Sight-less jobs (haul/fetch →
  // moving+manipulation) are naturally unaffected in the dark.
  const workCategory = jobService.getJobWorkCategory(activeJob, gameState);
  // Subjobs (build/repair/demolish/refuel, haul/fetch) read their OWN `*_speed` when stats.jsonc
  // defines one, falling back per-axis to the parent category — so a repair runs at repair_speed.
  const workStatKey = jobService.getJobWorkStatKey(activeJob, gameState);
  const workSpeedMult = pawnStatService.getWorkModifiers(pawn, workStatKey, undefined, workCategory).speed;
  // WORK-EXPERIENCE: every job advances at the base rate × the work-speed multiplier — the pawn's
  // experience level is already folded into that multiplier (the SKILL token), so the old
  // `skill_construction` special-case would double-count it.
  const workPoints = BASE_WORK_RATE * workSpeedMult;
  // workPoints is authored as work-points PER SECOND; deliver one tick's worth so
  // a job authored as N seconds of work still takes N seconds of real time.
  const afterAdvance = jobService.advanceJob(jobId, perTick(workPoints), gameState);
  const jobStillExists = (afterAdvance.jobs ?? []).some((j) => j.id === jobId);

  if (!jobStillExists) {
    // Opportunistic hauling: a pawn that just finished a non-haul job while standing next to loose,
    // stockpile-bound goods (e.g. a woodcutter on the tile it just felled) grabs them now and hauls
    // them off in the same trip, instead of leaving them for a separate later haul. Haul jobs already
    // sweep their own 3×3 on pickup (haul.complete), so they're skipped here. DEFERRED while more of
    // the same work cluster remains nearby: the pawn finishes the patch of bushes/trees first and only
    // makes the stockpile trip on the LAST one — otherwise it'd shuttle back after every single bush.
    const afterPickup =
      activeJob.type === 'haul' || moreNearbySameTypeWork(pawn, afterAdvance, activeJob.type)
        ? afterAdvance
        : opportunisticHaulPickup(afterAdvance, pawn.id);

    // Job complete. If pawn is now carrying items, enter HAULING state.
    const updatedPawn = afterPickup.pawns.find((p) => p.id === pawn.id);
    const invItems = updatedPawn?.inventory?.items ?? {};
    const hasInventory = Object.values(invItems).some((v) => v > 0);
    // What was completed: prefer the most specific target (harvested resource / built building /
    // craft order / hauled item), falling back to the job type. Duration is turns since claim
    // (includes travel + work for this attempt).
    const what =
      activeJob.resourceId ??
      activeJob.buildingId ??
      activeJob.craftQueueId ??
      activeJob.droppedItemId ??
      activeJob.type;
    const tookTurns =
      activeJob.startedTurn != null ? afterAdvance.turn - activeJob.startedTurn : undefined;
    const pos = pawn.position ? `(${pawn.position.x},${pawn.position.y})` : '(?,?)';
    gameLogger.log(
      afterAdvance.turn,
      'JOB-EVT',
      `${pawn.name} completed ${activeJob.type}:${what} at ${pos}` +
        (tookTurns != null ? ` took=${tookTurns} turns` : '') +
        (hasInventory ? ` carrying:${JSON.stringify(invItems)}` : '')
    );

    if (hasInventory) {
      // Transition to HAULING — handleHauling will run next turn and find a deposit point.
      // This ensures items are visible in the CARRYING section for at least one turn.
      gameLogger.log(
        afterAdvance.turn,
        'JOB-EVT',
        `${pawn.name} → HAULING inv:${JSON.stringify(invItems)}`
      );
      return mutatePawn(afterPickup, pawn.id, (p) => {
        p.currentState = PAWN_STATE.HAULING;
        p.activeJob = undefined;
      });
    }

    return mutatePawn(afterPickup, pawn.id, (p) => {
      p.currentState = PAWN_STATE.IDLE;
      p.activeJob = undefined;
    });
  }

  const updatedJob = (afterAdvance.jobs ?? []).find((j) => j.id === jobId);
  const progress = updatedJob
    ? Math.min(1, updatedJob.workDone / updatedJob.workRequired)
    : activeJob.progress;

  return mutatePawn(afterAdvance, pawn.id, (p) => {
    p.activeJob = { ...activeJob, progress };
  });
}
