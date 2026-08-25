import type { GameState, Pawn, Job } from '../../../core/types';
import { gameLogger } from '../../../debug/gameLogger';
import { manhattan } from '../../../core/util/distance';
import { perTick } from '../../../core/util/time';
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
  advancePawnOrders,
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
import {
  addInstanceToInventory,
  equipDropToPawn,
  carryDropToInventory
} from '../../../core/rules/gear/equipment';
import { withDrops } from '../../../core/state/stockpile';
import { handleForcedConsume, handleForcedDrink } from './needs';

function handleForcedEquip(
  pawn: Pawn,
  gameState: GameState,
  order: {
    dropId: string;
    x: number;
    y: number;
    slot?: import('../../../core/types/items').EquipmentSlot | 'inventory';
  }
): GameState {
  const drop = (gameState.droppedItems ?? []).find(
    (d) => d.id === order.dropId && (d.quantity ?? 0) > 0
  );
  if (!drop || !pawn.position) return mutatePawn(gameState, pawn.id, advancePawnOrders);

  const onOrAdjacent =
    (pawn.position.x === drop.x && pawn.position.y === drop.y) ||
    isAdjacent(pawn.position.x, pawn.position.y, drop.x, drop.y);
  if (!onOrAdjacent) {
    const afterPath = tryAssignPath(pawn, drop.x, drop.y, gameState);
    if (afterPath) {
      return mutatePawn(afterPath, pawn.id, (p) => {
        p.currentState = PAWN_STATE.MOVING_TO_NEED;
        p.activeJob = {
          type: 'need' as const,
          targetX: drop.x,
          targetY: drop.y,
          progress: 0,
          timeRequired: 1,
          turnsInState: 0,
          targetState: PAWN_STATE.IDLE
        };
      });
    }
    return mutatePawn(gameState, pawn.id, advancePawnOrders);
  }

  const equipped =
    order.slot === 'inventory'
      ? carryDropToInventory(gameState, pawn.id, order.dropId)
      : equipDropToPawn(gameState, pawn.id, order.dropId, order.slot);
  return mutatePawn(equipped, pawn.id, advancePawnOrders);
}

export function advanceJobOneTick(
  pawn: Pawn,
  job: {
    type: string;
    targetX: number;
    targetY: number;
    resourceId?: string;
    craftQueueId?: string;
  },
  jobId: string,
  gameState: GameState
): GameState {
  const workCategory = jobService.getJobWorkCategory(job, gameState);
  const workStatKey = jobService.getJobWorkStatKey(job, gameState);
  const workSpeedMult = pawnStatService.getWorkModifiers(
    pawn,
    workStatKey,
    undefined,
    workCategory
  ).speed;
  const workPoints = BASE_WORK_RATE * workSpeedMult;
  return jobService.advanceJob(jobId, perTick(workPoints), gameState);
}

export function handleHauling(pawn: Pawn, gameState: GameState): GameState {
  if (pawn.carryingForOrder) {
    const station = orderStationTile(pawn.carryingForOrder, gameState);
    if (!station) {
      return depositInventory(pawn, gameState);
    }
    if (pawn.position && isAdjacent(pawn.position.x, pawn.position.y, station.x, station.y)) {
      return depositInventory(pawn, gameState);
    }
    const afterPath = pawn.position ? tryAssignPath(pawn, station.x, station.y, gameState) : null;
    if (!afterPath) return depositInventory(pawn, gameState);
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

  const deposit = findNearestDepositPoint(pawn, gameState);
  if (!deposit) {
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
    return mutatePawn(gameState, pawn.id, (p) => {
      p.currentState = PAWN_STATE.HAULING;
      p.hasReachedDestination = false;
      p.activeJob = undefined;
    });
  }
  return gameState;
}

export function handleIdle(pawn: Pawn, gameState: GameState): GameState {
  const idleNeed = selectIdleNeed(pawn, gameState);
  if (idleNeed) return applyNeed(pawn, gameState, idleNeed);

  const pinnedSet = new Set(pawn.pinnedItems ?? []);
  const owesDelivery =
    !!pawn.carryingForOrder ||
    (pawn.inventory?.instances ?? []).some((i) => !!i.contents?.length) ||
    Object.entries(pawn.inventory?.items ?? {}).some(([id, q]) => q > 0 && !pinnedSet.has(id));
  if (owesDelivery) {
    return transitionTo(pawn, PAWN_STATE.HAULING, gameState);
  }

  if (!pathfinderService.isReady()) return gameState;

  const order = pawn.draftTarget;
  let forcedJob: Job | undefined;
  if (order) {
    if (order.type === 'forceConsume') return handleForcedConsume(pawn, gameState, order);
    if (order.type === 'drink') return handleForcedDrink(pawn, gameState, order);
    if (order.type === 'equip') return handleForcedEquip(pawn, gameState, order);
    if (order.type === 'forceJob') {
      forcedJob = (gameState.jobs ?? []).find(
        (j) => j.id === order.jobId && (j.claimedBy === null || j.claimedBy === pawn.id)
      );
      const toolReq = forcedJob ? jobService.requiredToolForJob(forcedJob, gameState) : null;
      const toolBlocked =
        !!toolReq &&
        !jobService.pawnHasToolFor(pawn, toolReq.workType, toolReq.minTier) &&
        !jobService.findStockToolDropFor(
          gameState,
          toolReq.workType,
          toolReq.minTier,
          pawn.position ?? undefined
        );
      if (!forcedJob || toolBlocked) return mutatePawn(gameState, pawn.id, advancePawnOrders);
    } else {
      return mutatePawn(gameState, pawn.id, advancePawnOrders);
    }
  }

  if (pawn.socialBreak && gameState.turn < pawn.socialBreak.until) {
    if (forcedJob) return mutatePawn(gameState, pawn.id, advancePawnOrders);
    return tryWanderStep(pawn, gameState) ?? gameState;
  }

  const allowedZone = pawn.drafted || forcedJob ? null : allowedTilesForPawn(gameState, pawn.id);

  if (allowedZone && pawn.position && !allowedZone.has(`${pawn.position.x},${pawn.position.y}`)) {
    if (pawn.isMoving && (pawn.path?.length ?? 0) > 0) return gameState;
    const home = nearestAllowedTile(allowedZone, pawn.position.x, pawn.position.y);
    if (home) return assignDraftMovePath(gameState, pawn, home.x, home.y);
    return gameState;
  }

  const jobsById = allowedZone ? new Map(gameState.jobs.map((j) => [j.id, j])) : null;
  const jobInZone = (id: string): boolean => {
    if (!allowedZone || !jobsById) return true;
    const j = jobsById.get(id);
    if (!j) return true;
    if (allowedZone.has(`${j.targetX},${j.targetY}`)) return true;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        if ((dx || dy) && allowedZone.has(`${j.targetX + dx},${j.targetY + dy}`)) return true;
    return false;
  };

  const { job, queuePreview } = forcedJob
    ? { job: forcedJob, queuePreview: pawn.jobQueue ?? [] }
    : jobService.selectJobForPawn(pawn, gameState, {
        isReachable: (id) => !isJobUnreachableForPawn(pawn.id, id, gameState.turn) && jobInZone(id),
        queueSize: JOB_QUEUE_SIZE
      });

  if (!forcedJob) {
    const hunt = tryStartHunt(pawn, gameState, job ?? null);
    if (hunt) return hunt;
  }

  if (!job) return tryWanderStep(pawn, gameState) ?? gameState;

  let gs = jobService.claimJob(pawn.id, job.id, gameState);

  if (job.type === 'rescue') {
    return mutatePawn(gs, pawn.id, (p) => {
      p.currentState = PAWN_STATE.RESCUING;
      p.activeJob = {
        type: 'rescue',
        jobId: job.id,
        patientId: job.patientId,
        targetX: job.targetX,
        targetY: job.targetY,
        progress: 0,
        timeRequired: 1,
        startedTurn: gameState.turn
      };
      p.jobQueue = queuePreview;
    });
  }

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

  const atSite =
    !toolFetch &&
    ((job.targetX === 0 && job.targetY === 0) ||
      (pawn.position && isAdjacent(pawn.position.x, pawn.position.y, job.targetX, job.targetY)));

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

  if (toolFetch && pawn.position && isAdjacent(pawn.position.x, pawn.position.y, destX, destY)) {
    return mutatePawn(gs, pawn.id, (p) => {
      p.currentState = PAWN_STATE.MOVING_TO_RESOURCE;
      p.activeJob = activeJob;
      p.jobQueue = queuePreview;
      p.hasReachedDestination = true;
    });
  }

  markJobUnreachable(pawn.id, job.id, gameState.turn);
  return jobService.releaseJob(pawn.id, job.id, gs);
}

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

  const remainder = (drop.quantity ?? 1) - 1;
  const newDropped =
    remainder > 0
      ? (gameState.droppedItems ?? []).map((d) =>
          d.id === drop.id ? { ...d, quantity: remainder } : d
        )
      : (gameState.droppedItems ?? []).filter((d) => d.id !== drop.id);

  const withTool: GameState = {
    ...withDrops(gameState, newDropped),
    pawns: gameState.pawns.map((p) => {
      if (p.id !== pawn.id) return p;
      const carried = addInstanceToInventory(p, tf.itemId, gameState.turn);
      return {
        ...carried,
        activeJob: { ...aj, toolFetch: undefined, targetX: tf.siteX, targetY: tf.siteY },
        hasReachedDestination: false
      };
    })
  };

  const updated = withTool.pawns.find((p) => p.id === pawn.id)!;
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

const OPPORTUNISTIC_DEFER_RADIUS = 16;

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

  const order = pawn.draftTarget;
  const runningForcedJob = order?.type === 'forceJob' && order.jobId === jobId;
  if (order && !runningForcedJob) {
    return jobService.releaseJob(pawn.id, jobId, goIdle(pawn, gameState));
  }

  const jobDist = pawn.position
    ? manhattan(activeJob.targetX, activeJob.targetY, pawn.position.x, pawn.position.y)
    : 0;
  const queue = pawn.jobQueue ?? [];
  const laborLevel = jobService.getJobLaborLevel(jobInPool, pawn, gameState);

  const interrupted = checkNeedInterrupts(pawn, gameState, 'Working', jobDist, queue, laborLevel);
  if (interrupted) return opportunisticHaulPickup(interrupted, pawn.id);

  if (
    !(activeJob.targetX === 0 && activeJob.targetY === 0) &&
    pawn.position &&
    !isAdjacent(pawn.position.x, pawn.position.y, activeJob.targetX, activeJob.targetY)
  ) {
    return jobService.releaseJob(pawn.id, jobId, goIdle(pawn, gameState));
  }

  const afterAdvance = advanceJobOneTick(pawn, activeJob, jobId, gameState);
  const jobStillExists = (afterAdvance.jobs ?? []).some((j) => j.id === jobId);

  if (!jobStillExists) {
    const afterPickup =
      activeJob.type === 'haul' || moreNearbySameTypeWork(pawn, afterAdvance, activeJob.type)
        ? afterAdvance
        : opportunisticHaulPickup(afterAdvance, pawn.id);

    const updatedPawn = afterPickup.pawns.find((p) => p.id === pawn.id);
    const invItems = updatedPawn?.inventory?.items ?? {};
    const hasInventory = Object.values(invItems).some((v) => v > 0);
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
      gameLogger.log(
        afterAdvance.turn,
        'JOB-EVT',
        `${pawn.name} → HAULING inv:${JSON.stringify(invItems)}`
      );
      return mutatePawn(afterPickup, pawn.id, (p) => {
        p.currentState = PAWN_STATE.HAULING;
        p.activeJob = undefined;
        if (runningForcedJob) advancePawnOrders(p);
      });
    }

    return mutatePawn(afterPickup, pawn.id, (p) => {
      p.currentState = PAWN_STATE.IDLE;
      p.activeJob = undefined;
      if (runningForcedJob) advancePawnOrders(p);
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
