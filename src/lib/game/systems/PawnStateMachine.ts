/**
 * PawnStateMachine — Phase 5a/5e
 *
 * Turn-based state machine for pawn behaviour.
 * States: Idle → MovingToResource → Working → Idle
 *         Idle → Hungry → Eating → Idle
 *         Idle → Tired  → Sleeping → Idle
 *
 * Phase 5 change: Idle now picks jobs through JobService instead of directly
 * scanning designations. All job completion side-effects live in JobService.
 *
 * Port of Celestia pawn_state_machine.gd + states/*.gd, adapted to
 * turn-based ticks and Fantasia4x GameState immutability.
 */

import type { GameState, Pawn } from '../core/types';
import { ITEMS_DATABASE } from '../core/Items';
import { jobService, BASE_WORK_RATE } from '../services/JobService';
import { pawnService } from '../services/PawnService';
import { wasmPathfinderService } from '../services/WasmPathfinderService';
import { buildPathfindingGrids } from '../services/PathfinderService';

// ===== STATE NAME CONSTANTS =====
export const PAWN_STATE = {
    IDLE: 'Idle',
    MOVING_TO_RESOURCE: 'MovingToResource',
    WORKING: 'Working',
    HUNGRY: 'Hungry',
    TIRED: 'Tired',
    MOVING_TO_NEED: 'MovingToNeed',
    EATING: 'Eating',
    SLEEPING: 'Sleeping',
    HAULING: 'Hauling',
    MOVING_TO_DEPOSIT: 'MovingToDeposit'
} as const;

export type PawnStateName = (typeof PAWN_STATE)[keyof typeof PAWN_STATE];

// ===== NEED THRESHOLDS =====
const HUNGER_THRESHOLD = 65;
const FATIGUE_THRESHOLD = 65;
const EATING_TURNS = 3;
const SLEEPING_TURNS = 5;
const HUNGER_PER_EATING_TURN = 20;
const FATIGUE_PER_SLEEPING_TURN = 15;

// ===== HELPERS =====

function isAdjacent(ax: number, ay: number, bx: number, by: number): boolean {
    const dx = Math.abs(ax - bx);
    const dy = Math.abs(ay - by);
    return dx <= 1 && dy <= 1 && (dx + dy) > 0;
}

function findAdjacentApproach(
    tx: number,
    ty: number,
    worldMap: GameState['worldMap']
): { x: number; y: number } | null {
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = tx + dx;
            const ny = ty + dy;
            if (worldMap[ny]?.[nx]?.walkable) return { x: nx, y: ny };
        }
    }
    return null;
}

function tryAssignPath(
    pawn: Pawn,
    tx: number,
    ty: number,
    gameState: GameState
): GameState | null {
    if (!pawn.position) return null;
    if (!wasmPathfinderService.isReady()) return null;
    if (isAdjacent(pawn.position.x, pawn.position.y, tx, ty)) return null;
    const approach = findAdjacentApproach(tx, ty, gameState.worldMap);
    if (!approach) return null;
    const { walkable, costs, width, height } = buildPathfindingGrids(gameState.worldMap);
    const path = wasmPathfinderService.findPath(
        walkable, costs, width, height,
        pawn.position.x, pawn.position.y,
        approach.x, approach.y
    );
    if (path.length === 0) return null;
    return pawnService.assignPath(pawn.id, path, gameState);
}

function findAvailableFood(gs: GameState): { source: 'item' | 'stockpile'; id: string } | null {
    const foodItem = gs.item.find((i) => {
        const def = ITEMS_DATABASE.find((d) => d.id === i.id);
        return (def?.category === 'food' || (def?.nutrition ?? 0) > 0) && i.amount > 0;
    });
    if (foodItem) return { source: 'item', id: foodItem.id };
    for (const [id, amount] of Object.entries(gs.stockpile ?? {})) {
        if (amount <= 0) continue;
        const def = ITEMS_DATABASE.find((d) => d.id === id);
        if (def?.category === 'food' || (def?.nutrition ?? 0) > 0) {
            return { source: 'stockpile', id };
        }
    }
    return null;
}

/** Phase 6: find the nearest complete storage building (campfire etc.) to a pawn. */
function findNearestStorageBuilding(
    pawn: Pawn,
    gs: GameState
): { x: number; y: number; buildingId: string } | null {
    if (!pawn.position) return null;
    let best: { x: number; y: number; buildingId: string; dist: number } | null = null;
    for (const b of gs.buildings ?? []) {
        if (b.status !== 'complete') continue;
        const def = ITEMS_DATABASE; // unused, check building def via flag
        // Check isStorage flag on the building definition (set in Buildings.ts)
        // We can check it via the PlacedBuilding's type by looking up AVAILABLE_BUILDINGS,
        // but to avoid a circular import we check known storage building types directly.
        const STORAGE_TYPES = ['campfire'];
        if (!STORAGE_TYPES.includes(b.type)) continue;
        const dist = Math.abs(b.x - pawn.position.x) + Math.abs(b.y - pawn.position.y);
        if (!best || dist < best.dist) best = { x: b.x, y: b.y, buildingId: b.id, dist };
    }
    return best ? { x: best.x, y: best.y, buildingId: best.buildingId } : null;
}

/** Phase 6: find the nearest complete rest building (shelter etc.) to a pawn. */
function findNearestRestBuilding(
    pawn: Pawn,
    gs: GameState
): { x: number; y: number; buildingId: string } | null {
    if (!pawn.position) return null;
    const REST_TYPES = ['lean_to_shelter', 'woodland_shelter', 'stone_hut'];
    let best: { x: number; y: number; buildingId: string; dist: number } | null = null;
    for (const b of gs.buildings ?? []) {
        if (b.status !== 'complete') continue;
        if (!REST_TYPES.includes(b.type)) continue;
        const dist = Math.abs(b.x - pawn.position.x) + Math.abs(b.y - pawn.position.y);
        if (!best || dist < best.dist) best = { x: b.x, y: b.y, buildingId: b.id, dist };
    }
    return best ? { x: best.x, y: best.y, buildingId: best.buildingId } : null;
}

function consumeFood(foodRef: { source: 'item' | 'stockpile'; id: string }, gs: GameState): GameState {
    if (foodRef.source === 'item') {
        return {
            ...gs,
            item: gs.item.map((i) =>
                i.id === foodRef.id ? { ...i, amount: Math.max(0, i.amount - 1) } : i
            )
        };
    }
    const newStockpile = { ...(gs.stockpile ?? {}) };
    newStockpile[foodRef.id] = Math.max(0, (newStockpile[foodRef.id] ?? 0) - 1);
    return { ...gs, stockpile: newStockpile };
}

function transitionTo(pawn: Pawn, state: PawnStateName, gs: GameState): GameState {
    return {
        ...gs,
        pawns: gs.pawns.map((p) =>
            p.id === pawn.id ? { ...p, currentState: state } : p
        )
    };
}

function goIdle(pawn: Pawn, gs: GameState): GameState {
    return {
        ...gs,
        pawns: gs.pawns.map((p) =>
            p.id === pawn.id
                ? { ...p, currentState: PAWN_STATE.IDLE, activeJob: undefined, isMoving: false, path: [] }
                : p
        )
    };
}

// ===== PER-PAWN STATE HANDLERS =====

// ===== HAULING HELPERS =====

/** Storage building types that accept deposited resources. */
const DEPOSIT_TYPES = ['storage_rack', 'campfire', 'lean_to_shelter', 'woodland_shelter', 'stone_hut'];

/**
 * Find the nearest complete storage building to deposit hauled items.
 * Falls back to any complete building if no storage type found.
 * Returns null if no buildings exist (pawn will deposit in-place).
 */
function findNearestDepositPoint(
    pawn: Pawn,
    gs: GameState
): { x: number; y: number } | null {
    if (!pawn.position) return null;
    const { x: px, y: py } = pawn.position;

    let best: { x: number; y: number; dist: number } | null = null;

    // Prefer designated storage types
    for (const b of gs.buildings ?? []) {
        if (b.status !== 'complete') continue;
        if (!DEPOSIT_TYPES.includes(b.type)) continue;
        const dist = Math.abs(b.x - px) + Math.abs(b.y - py);
        if (!best || dist < best.dist) best = { x: b.x, y: b.y, dist };
    }
    if (best) return { x: best.x, y: best.y };

    // Fallback: any complete building
    for (const b of gs.buildings ?? []) {
        if (b.status !== 'complete') continue;
        const dist = Math.abs(b.x - px) + Math.abs(b.y - py);
        if (!best || dist < best.dist) best = { x: b.x, y: b.y, dist };
    }
    return best ? { x: best.x, y: best.y } : null;
}

/** Transfer everything in pawn.inventory to gs.stockpile and clear the inventory. */
function depositInventory(pawn: Pawn, gs: GameState): GameState {
    const inv = pawn.inventory?.items ?? {};
    if (Object.keys(inv).length === 0) return goIdle(pawn, gs);

    const newStockpile = { ...(gs.stockpile ?? {}) };
    for (const [resourceId, qty] of Object.entries(inv)) {
        if (qty > 0) newStockpile[resourceId] = (newStockpile[resourceId] ?? 0) + qty;
    }

    const newPawns = gs.pawns.map((p) =>
        p.id === pawn.id
            ? {
                ...p,
                currentState: PAWN_STATE.IDLE,
                activeJob: undefined,
                inventory: { ...(p.inventory ?? { items: {}, maxSlots: 20, currentSlots: 0 }), items: {}, currentSlots: 0 }
            }
            : p
    );
    console.log(`[PawnSM] ${pawn.name} deposited inventory:`, inv);
    return { ...gs, stockpile: newStockpile, pawns: newPawns };
}

function handleHauling(pawn: Pawn, gameState: GameState): GameState {
    // Pawn just picked up an item and needs to find a deposit point
    const deposit = findNearestDepositPoint(pawn, gameState);
    if (!deposit) {
        // No building to deposit at — drop straight to stockpile
        return depositInventory(pawn, gameState);
    }

    const alreadyAdjacent = pawn.position &&
        isAdjacent(pawn.position.x, pawn.position.y, deposit.x, deposit.y);

    if (alreadyAdjacent) {
        return depositInventory(pawn, gameState);
    }

    const afterPath = pawn.position
        ? tryAssignPath(pawn, deposit.x, deposit.y, gameState)
        : null;

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

function handleMovingToDeposit(pawn: Pawn, gameState: GameState): GameState {
    const activeJob = pawn.activeJob;
    if (!activeJob) return depositInventory(pawn, gameState);

    if (pawn.hasReachedDestination && pawn.position) {
        const adjacent = isAdjacent(
            pawn.position.x, pawn.position.y,
            activeJob.targetX, activeJob.targetY
        );
        if (adjacent) {
            return depositInventory(pawn, { ...gameState, pawns: gameState.pawns.map((p) => p.id === pawn.id ? { ...p, hasReachedDestination: false } : p) });
        }
        // Didn't quite make it — deposit in place anyway
        return depositInventory(pawn, gameState);
    }
    return gameState;
}

// ===== PER-PAWN STATE HANDLERS =====

function tickPawn(pawn: Pawn, gameState: GameState): GameState {
    const state = pawn.currentState ?? PAWN_STATE.IDLE;
    switch (state) {
        case PAWN_STATE.IDLE: return handleIdle(pawn, gameState);
        case PAWN_STATE.MOVING_TO_RESOURCE: return handleMovingToResource(pawn, gameState);
        case PAWN_STATE.WORKING: return handleWorking(pawn, gameState);
        case PAWN_STATE.HUNGRY: return handleHungry(pawn, gameState);
        case PAWN_STATE.TIRED: return handleTired(pawn, gameState);
        case PAWN_STATE.MOVING_TO_NEED: return handleMovingToNeed(pawn, gameState);
        case PAWN_STATE.EATING: return handleEating(pawn, gameState);
        case PAWN_STATE.SLEEPING: return handleSleeping(pawn, gameState);
        case PAWN_STATE.HAULING: return handleHauling(pawn, gameState);
        case PAWN_STATE.MOVING_TO_DEPOSIT: return handleMovingToDeposit(pawn, gameState);
        default: return gameState;
    }
}

function handleIdle(pawn: Pawn, gameState: GameState): GameState {
    if ((pawn.needs?.hunger ?? 0) >= HUNGER_THRESHOLD) {
        return transitionTo(pawn, PAWN_STATE.HUNGRY, gameState);
    }
    if ((pawn.needs?.fatigue ?? 0) >= FATIGUE_THRESHOLD) {
        return transitionTo(pawn, PAWN_STATE.TIRED, gameState);
    }

    const availableJobs = jobService.getAvailableJobs(pawn, gameState);
    const job = availableJobs[0];
    if (!job) return gameState;

    let gs = jobService.claimJob(pawn.id, job.id, gameState);

    const activeJob = {
        type: job.type as 'harvest' | 'construct' | 'craft' | 'haul',
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

    const atSite =
        job.type === 'craft' ||
        (job.targetX === 0 && job.targetY === 0) || // abstract building placed off-map
        (pawn.position && isAdjacent(pawn.position.x, pawn.position.y, job.targetX, job.targetY));

    if (atSite) {
        return {
            ...gs,
            pawns: gs.pawns.map((p) =>
                p.id === pawn.id
                    ? { ...p, currentState: PAWN_STATE.WORKING, activeJob }
                    : p
            )
        };
    }

    const afterPath = tryAssignPath(pawn, job.targetX, job.targetY, gs);
    if (!afterPath) {
        return jobService.releaseJob(pawn.id, job.id, gs);
    }

    return {
        ...afterPath,
        pawns: afterPath.pawns.map((p) =>
            p.id === pawn.id
                ? { ...p, currentState: PAWN_STATE.MOVING_TO_RESOURCE, activeJob }
                : p
        )
    };
}

function handleMovingToResource(pawn: Pawn, gameState: GameState): GameState {
    const activeJob = pawn.activeJob;
    if (!activeJob || activeJob.type === 'need') return goIdle(pawn, gameState);

    const jobInPool = activeJob.jobId
        ? (gameState.jobs ?? []).find((j) => j.id === activeJob.jobId)
        : null;
    if (!jobInPool) return goIdle(pawn, gameState);

    if (pawn.hasReachedDestination && pawn.position) {
        const adjacent = isAdjacent(
            pawn.position.x, pawn.position.y,
            activeJob.targetX, activeJob.targetY
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

function handleWorking(pawn: Pawn, gameState: GameState): GameState {
    const activeJob = pawn.activeJob;
    if (!activeJob || activeJob.type === 'need') return goIdle(pawn, gameState);

    const jobId = activeJob.jobId;
    if (!jobId) return goIdle(pawn, gameState);

    const jobInPool = (gameState.jobs ?? []).find((j) => j.id === jobId);
    if (!jobInPool) return goIdle(pawn, gameState);

    if (
        activeJob.type !== 'craft' &&
        !(activeJob.targetX === 0 && activeJob.targetY === 0) && // abstract building
        pawn.position &&
        !isAdjacent(pawn.position.x, pawn.position.y, activeJob.targetX, activeJob.targetY)
    ) {
        return jobService.releaseJob(pawn.id, jobId, goIdle(pawn, gameState));
    }

    const afterAdvance = jobService.advanceJob(jobId, BASE_WORK_RATE, gameState);
    const jobStillExists = (afterAdvance.jobs ?? []).some((j) => j.id === jobId);

    if (!jobStillExists) {
        // Job complete. If pawn is now carrying items, enter HAULING state.
        const updatedPawn = afterAdvance.pawns.find((p) => p.id === pawn.id);
        const hasInventory = updatedPawn &&
            Object.values(updatedPawn.inventory?.items ?? {}).some((v) => v > 0);

        if (hasInventory) {
            // Find a deposit point and start hauling
            const deposit = findNearestDepositPoint(updatedPawn!, afterAdvance);
            const depositPayload = deposit
                ? { depositX: deposit.x, depositY: deposit.y }
                : null;

            if (depositPayload && deposit && updatedPawn!.position &&
                !isAdjacent(updatedPawn!.position.x, updatedPawn!.position.y, deposit.x, deposit.y)) {
                const afterPath = tryAssignPath(updatedPawn!, deposit.x, deposit.y, afterAdvance);
                if (afterPath) {
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
            }
            // Already adjacent or no path — deposit immediately
            return depositInventory(updatedPawn!, afterAdvance);
        }

        return {
            ...afterAdvance,
            pawns: afterAdvance.pawns.map((p) =>
                p.id === pawn.id
                    ? { ...p, currentState: PAWN_STATE.IDLE, activeJob: undefined }
                    : p
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
            p.id === pawn.id
                ? { ...p, activeJob: { ...activeJob, progress } }
                : p
        )
    };
}

function handleHungry(pawn: Pawn, gameState: GameState): GameState {
    const food = findAvailableFood(gameState);
    if (!food) {
        return transitionTo(pawn, PAWN_STATE.IDLE, gameState);
    }

    // Phase 6: try to pathfind to the nearest storage building to eat there
    const storageBuilding = findNearestStorageBuilding(pawn, gameState);
    if (
        storageBuilding &&
        pawn.position &&
        !isAdjacent(pawn.position.x, pawn.position.y, storageBuilding.x, storageBuilding.y)
    ) {
        const afterPath = tryAssignPath(pawn, storageBuilding.x, storageBuilding.y, gameState);
        if (afterPath) {
            return {
                ...afterPath,
                pawns: afterPath.pawns.map((p) =>
                    p.id === pawn.id
                        ? {
                            ...p,
                            currentState: PAWN_STATE.MOVING_TO_NEED,
                            activeJob: {
                                type: 'need' as const,
                                targetX: storageBuilding.x,
                                targetY: storageBuilding.y,
                                progress: 0,
                                timeRequired: EATING_TURNS,
                                turnsInState: 0,
                                targetState: PAWN_STATE.EATING
                            }
                        }
                        : p
                )
            };
        }
    }

    // Fallback: eat in place
    const afterConsume = consumeFood(food, gameState);
    return {
        ...afterConsume,
        pawns: afterConsume.pawns.map((p) =>
            p.id === pawn.id
                ? {
                    ...p,
                    currentState: PAWN_STATE.EATING,
                    activeJob: {
                        type: 'need' as const,
                        targetX: p.position?.x ?? 0,
                        targetY: p.position?.y ?? 0,
                        progress: 0,
                        timeRequired: EATING_TURNS,
                        turnsInState: 0
                    }
                }
                : p
        )
    };
}

function handleTired(pawn: Pawn, gameState: GameState): GameState {
    // Phase 6: try to pathfind to the nearest rest building to sleep there
    const restBuilding = findNearestRestBuilding(pawn, gameState);
    if (
        restBuilding &&
        pawn.position &&
        !isAdjacent(pawn.position.x, pawn.position.y, restBuilding.x, restBuilding.y)
    ) {
        const afterPath = tryAssignPath(pawn, restBuilding.x, restBuilding.y, gameState);
        if (afterPath) {
            return {
                ...afterPath,
                pawns: afterPath.pawns.map((p) =>
                    p.id === pawn.id
                        ? {
                            ...p,
                            currentState: PAWN_STATE.MOVING_TO_NEED,
                            activeJob: {
                                type: 'need' as const,
                                targetX: restBuilding.x,
                                targetY: restBuilding.y,
                                progress: 0,
                                timeRequired: SLEEPING_TURNS,
                                turnsInState: 0,
                                targetState: PAWN_STATE.SLEEPING
                            }
                        }
                        : p
                )
            };
        }
    }

    // Fallback: sleep in place
    return {
        ...gameState,
        pawns: gameState.pawns.map((p) =>
            p.id === pawn.id
                ? {
                    ...p,
                    currentState: PAWN_STATE.SLEEPING,
                    activeJob: {
                        type: 'need' as const,
                        targetX: p.position?.x ?? 0,
                        targetY: p.position?.y ?? 0,
                        progress: 0,
                        timeRequired: SLEEPING_TURNS,
                        turnsInState: 0
                    }
                }
                : p
        )
    };
}

function handleMovingToNeed(pawn: Pawn, gameState: GameState): GameState {
    const activeJob = pawn.activeJob;
    if (!activeJob) return goIdle(pawn, gameState);
    if (pawn.hasReachedDestination && pawn.position) {
        const targetState = (activeJob.targetState ?? PAWN_STATE.EATING) as PawnStateName;
        let gs = gameState;
        // Phase 6: consume food on arrival when transitioning to Eating
        if (targetState === PAWN_STATE.EATING) {
            const food = findAvailableFood(gs);
            if (food) gs = consumeFood(food, gs);
            else return goIdle(pawn, gs); // no food found after pathfinding
        }
        return {
            ...gs,
            pawns: gs.pawns.map((p) =>
                p.id === pawn.id
                    ? { ...p, currentState: targetState, hasReachedDestination: false }
                    : p
            )
        };
    }
    return gameState;
}

function handleEating(pawn: Pawn, gameState: GameState): GameState {
    const activeJob = pawn.activeJob;
    const turnsInState = (activeJob?.turnsInState ?? 0) + 1;
    const newHunger = Math.max(0, (pawn.needs?.hunger ?? 50) - HUNGER_PER_EATING_TURN);

    const updatedNeeds = {
        ...(pawn.needs ?? { hunger: 0, fatigue: 0, sleep: 0, lastSleep: 0, lastMeal: 0 }),
        hunger: newHunger,
        lastMeal: gameState.turn
    };
    const updatedState = {
        ...(pawn.state ?? { mood: 50, health: 100, isWorking: false, isSleeping: false, isEating: false }),
        isEating: turnsInState < EATING_TURNS
    };

    if (turnsInState >= EATING_TURNS) {
        return {
            ...gameState,
            pawns: gameState.pawns.map((p) =>
                p.id === pawn.id
                    ? { ...p, needs: updatedNeeds, state: updatedState, currentState: PAWN_STATE.IDLE, activeJob: undefined }
                    : p
            )
        };
    }

    return {
        ...gameState,
        pawns: gameState.pawns.map((p) =>
            p.id === pawn.id
                ? {
                    ...p,
                    needs: updatedNeeds,
                    state: updatedState,
                    activeJob: activeJob
                        ? { ...activeJob, turnsInState, progress: turnsInState / EATING_TURNS }
                        : undefined
                }
                : p
        )
    };
}

function handleSleeping(pawn: Pawn, gameState: GameState): GameState {
    const activeJob = pawn.activeJob;
    const turnsInState = (activeJob?.turnsInState ?? 0) + 1;
    const newFatigue = Math.max(0, (pawn.needs?.fatigue ?? 50) - FATIGUE_PER_SLEEPING_TURN);
    const newSleep = Math.max(0, (pawn.needs?.sleep ?? 50) - FATIGUE_PER_SLEEPING_TURN);

    const updatedNeeds = {
        ...(pawn.needs ?? { hunger: 0, fatigue: 0, sleep: 0, lastSleep: 0, lastMeal: 0 }),
        fatigue: newFatigue,
        sleep: newSleep,
        lastSleep: gameState.turn
    };
    const updatedState = {
        ...(pawn.state ?? { mood: 50, health: 100, isWorking: false, isSleeping: false, isEating: false }),
        isSleeping: turnsInState < SLEEPING_TURNS
    };

    if (turnsInState >= SLEEPING_TURNS) {
        return {
            ...gameState,
            pawns: gameState.pawns.map((p) =>
                p.id === pawn.id
                    ? { ...p, needs: updatedNeeds, state: updatedState, currentState: PAWN_STATE.IDLE, activeJob: undefined }
                    : p
            )
        };
    }

    return {
        ...gameState,
        pawns: gameState.pawns.map((p) =>
            p.id === pawn.id
                ? {
                    ...p,
                    needs: updatedNeeds,
                    state: updatedState,
                    activeJob: activeJob
                        ? { ...activeJob, turnsInState, progress: turnsInState / SLEEPING_TURNS }
                        : undefined
                }
                : p
        )
    };
}

// ===== STATE MACHINE SERVICE =====

class PawnStateMachineImpl {
    /**
     * Run one turn tick for every pawn.
     * Called from GameEngineImpl.processPawns() AFTER processMovement().
     */
    tick(gameState: GameState): GameState {
        let state = gameState;
        for (const pawn of state.pawns) {
            const current = state.pawns.find((p) => p.id === pawn.id);
            if (current) state = tickPawn(current, state);
        }
        return state;
    }
}

export const pawnStateMachineService = new PawnStateMachineImpl();
