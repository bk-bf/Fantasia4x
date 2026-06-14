/** pawn/handlers/work — work state handlers, extracted from PawnStateMachine (hotspot step 2). Each
 *  is a plain (pawn, gameState) => GameState function; the dispatcher wires them into the table. */
import type { GameState, Pawn } from '../../../core/types';
import { gameLogger } from '../../../dev/gameLogger';
import { perTick } from '../../../core/time';
import { jobService, BASE_WORK_RATE } from '../../../services/JobService';
import { pawnStatService } from '../../../services/PawnStatService';
import { pathfinderService } from '../../../services/PathfinderService';
import { computeTileLightLevel } from '../../../services/EnvironmentService';
import { dampenLightByNightVision, getNightVision } from '../../../core/vision';
import { PAWN_STATE } from '../pawnStates';
import { isAdjacent } from '../pawnQueries';
import {
  JOB_QUEUE_SIZE,
  transitionTo,
  goIdle,
  isJobUnreachableForPawn,
  markJobUnreachable,
  tryStartHunt,
  tryAssignPath,
  repathStuckMover,
  tryWanderStep,
  lightWorkMultiplier
} from '../pawnHelpers';
import { checkNeedInterrupts, selectIdleNeed, applyNeed } from '../needSelection';
import { orderStationTile, depositInventory, findNearestDepositPoint } from '../pawnHauling';

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
    return {
      ...afterPath,
      pawns: afterPath.pawns.map((p) =>
        p.id === pawn.id
          ? {
              ...p,
              currentState: PAWN_STATE.MOVING_TO_DEPOSIT,
              activeJob: {
                type: 'need' as const,
                targetX: station.x,
                targetY: station.y,
                progress: 0,
                timeRequired: 1,
                depositX: station.x,
                depositY: station.y
              }
            }
          : p
      )
    };
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

  return {
    ...afterPath,
    pawns: afterPath.pawns.map((p) =>
      p.id === pawn.id
        ? {
            ...p,
            currentState: PAWN_STATE.MOVING_TO_DEPOSIT,
            activeJob: {
              type: 'need' as const,
              targetX: deposit.x,
              targetY: deposit.y,
              progress: 0,
              timeRequired: 1,
              depositX: deposit.x,
              depositY: deposit.y
            }
          }
        : p
    )
  };
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
      return depositInventory(pawn, {
        ...gameState,
        pawns: gameState.pawns.map((p) =>
          p.id === pawn.id ? { ...p, hasReachedDestination: false } : p
        )
      });
    }
    // Didn't quite make it — deposit in place anyway
    return depositInventory(pawn, gameState);
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
  if (Object.values(pawn.inventory?.items ?? {}).some((q) => q > 0)) {
    return transitionTo(pawn, PAWN_STATE.HAULING, gameState);
  }

  // Don't pick jobs until the pathfinder is ready — prevents endless pick/release cycles
  if (!pathfinderService.isReady()) return gameState;

  // Job-target selection (which job + the need-lookahead queue preview) is decided by JobService;
  // the handler injects the pawn-system reachability memory and only applies the result (P-4b).
  const { job, queuePreview } = jobService.selectJobForPawn(pawn, gameState, {
    isReachable: (id) => !isJobUnreachableForPawn(pawn.id, id, gameState.turn),
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

  const activeJob = {
    type: job.type as 'harvest' | 'construct' | 'craft' | 'haul' | 'fetch',
    jobId: job.id,
    targetX: job.targetX,
    targetY: job.targetY,
    resourceId: job.resourceId,
    droppedItemId: job.droppedItemId,
    buildingId: job.buildingId,
    craftQueueId: job.craftQueueId,
    progress: 0,
    timeRequired: job.workRequired
  };

  // ADR-016: craft jobs now target the station tile, so the pawn must walk there like any other
  // job (no more "craft anywhere"). Only genuinely abstract (0,0) jobs are worked in place.
  const atSite =
    (job.targetX === 0 && job.targetY === 0) || // abstract building placed off-map
    (pawn.position && isAdjacent(pawn.position.x, pawn.position.y, job.targetX, job.targetY));

  // queuePreview (soft-preview of upcoming unclaimed jobs for the need-lookahead system) is
  // computed by jobService.selectJobForPawn above.

  if (atSite) {
    return {
      ...gs,
      pawns: gs.pawns.map((p) =>
        p.id === pawn.id
          ? { ...p, currentState: PAWN_STATE.WORKING, activeJob, jobQueue: queuePreview }
          : p
      )
    };
  }

  const afterPath = tryAssignPath(pawn, job.targetX, job.targetY, gs);
  if (!afterPath) {
    // Unreachable right now — cool the job down for this pawn so we don't re-run the
    // expensive failed pathfind every tick, then drop the claim.
    markJobUnreachable(pawn.id, job.id, gameState.turn);
    return jobService.releaseJob(pawn.id, job.id, gs);
  }

  return {
    ...afterPath,
    pawns: afterPath.pawns.map((p) =>
      p.id === pawn.id
        ? { ...p, currentState: PAWN_STATE.MOVING_TO_RESOURCE, activeJob, jobQueue: queuePreview }
        : p
    )
  };
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
    ? Math.abs(activeJob.targetX - pawn.position.x) + Math.abs(activeJob.targetY - pawn.position.y)
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
    if (adjacent) {
      return {
        ...gameState,
        pawns: gameState.pawns.map((p) =>
          p.id === pawn.id
            ? { ...p, currentState: PAWN_STATE.WORKING, hasReachedDestination: false }
            : p
        )
      };
    }
    return goIdle(pawn, gameState);
  }
  return gameState;
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
    ? Math.abs(activeJob.targetX - pawn.position.x) + Math.abs(activeJob.targetY - pawn.position.y)
    : 0;
  const queue = pawn.jobQueue ?? [];
  // Reuse jobInPool (found above) instead of scanning gameState.jobs a second time (D9.3).
  const laborLevel = jobService.getJobLaborLevel(jobInPool, pawn, gameState);

  const interrupted = checkNeedInterrupts(pawn, gameState, 'Working', jobDist, queue, laborLevel);
  if (interrupted) return interrupted;

  // Must be adjacent to the job target to work it (ADR-016: craft is no longer exempt — the
  // pawn crafts AT the station tile). Only abstract (0,0) jobs are worked in place.
  if (
    !(activeJob.targetX === 0 && activeJob.targetY === 0) && // abstract building
    pawn.position &&
    !isAdjacent(pawn.position.x, pawn.position.y, activeJob.targetX, activeJob.targetY)
  ) {
    return jobService.releaseJob(pawn.id, jobId, goIdle(pawn, gameState));
  }

  // §G light → sight → work speed. Only sight-dependent jobs are affected (jobs.jsonc
  // `lightAffected`, default true) — carrying jobs (haul/fetch/refuel) shrug off the dark. For an
  // affected job, compute the pawn's tile light lazily from the day/night ambient + nearby fire
  // emitters (computeTileLightLevel — the same value the HUD shows; only this one tile is sampled,
  // no map scan). It scales the `sight` capacity every `*_speed` formula multiplies by, so darkness
  // (night, away from a fire) slows the work down to lightWorkMultiplier's 0.4 floor.
  // A pawn's night_vision (racial trait) dampens the darkness penalty here too, so a nocturnal pawn
  // neither sees worse nor works slower at night — the same dial used for vision range (core/vision).
  const lightAffected = jobService.isJobLightAffected(activeJob.type);
  const rawLight =
    lightAffected && pawn.position
      ? computeTileLightLevel(
          gameState.turn,
          gameState.buildings ?? [],
          pawn.position.x,
          pawn.position.y
        )
      : 1;
  const lightSightFactor = lightWorkMultiplier(
    dampenLightByNightVision(rawLight, getNightVision(pawn))
  );

  // Wire work speed into job advancement. getWorkModifiers (stats.jsonc) is the SINGLE
  // source: `*_speed` formula × body capacities × trait workSpeed × condition/status state,
  // with the light factor folded in via the `sight` capacity (so don't re-apply it here).
  const workCategory = jobService.getJobWorkCategory(activeJob, gameState);
  const workSpeedMult = pawnStatService.getWorkModifiers(
    pawn,
    workCategory,
    lightSightFactor
  ).speed;
  let workPoints =
    activeJob.type === 'construct' || activeJob.type === 'deconstruct'
      ? // construction scales by its own skill on top of the work-speed formula.
        Math.max(1, pawn.skills['skill_construction'] ?? 0) * workSpeedMult
      : // harvest/craft/haul advance at the base rate × the same work-speed multiplier.
        BASE_WORK_RATE * workSpeedMult;
  // workPoints is authored as work-points PER SECOND; deliver one tick's worth so
  // a job authored as N seconds of work still takes N seconds of real time.
  const afterAdvance = jobService.advanceJob(jobId, perTick(workPoints), gameState);
  const jobStillExists = (afterAdvance.jobs ?? []).some((j) => j.id === jobId);

  if (!jobStillExists) {
    // Job complete. If pawn is now carrying items, enter HAULING state.
    const updatedPawn = afterAdvance.pawns.find((p) => p.id === pawn.id);
    const invItems = updatedPawn?.inventory?.items ?? {};
    const hasInventory = Object.values(invItems).some((v) => v > 0);
    gameLogger.log(
      afterAdvance.turn,
      'JOB-EVT',
      `${pawn.name} job-complete hasInventory:${hasInventory} inv:${JSON.stringify(invItems)}`
    );

    if (hasInventory) {
      // Transition to HAULING — handleHauling will run next turn and find a deposit point.
      // This ensures items are visible in the CARRYING section for at least one turn.
      gameLogger.log(
        afterAdvance.turn,
        'JOB-EVT',
        `${pawn.name} → HAULING inv:${JSON.stringify(invItems)}`
      );
      return {
        ...afterAdvance,
        pawns: afterAdvance.pawns.map((p) =>
          p.id === pawn.id ? { ...p, currentState: PAWN_STATE.HAULING, activeJob: undefined } : p
        )
      };
    }

    return {
      ...afterAdvance,
      pawns: afterAdvance.pawns.map((p) =>
        p.id === pawn.id ? { ...p, currentState: PAWN_STATE.IDLE, activeJob: undefined } : p
      )
    };
  }

  const updatedJob = (afterAdvance.jobs ?? []).find((j) => j.id === jobId);
  const progress = updatedJob
    ? Math.min(1, updatedJob.workDone / updatedJob.workRequired)
    : activeJob.progress;

  return {
    ...afterAdvance,
    pawns: afterAdvance.pawns.map((p) =>
      p.id === pawn.id ? { ...p, activeJob: { ...activeJob, progress } } : p
    )
  };
}
