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
import ITEMS_DATABASE from '../database/items.jsonc';
import { jobService, BASE_WORK_RATE } from '../services/JobService';
import { pawnService } from '../services/PawnService';
import { itemService } from '../services/ItemService';
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
const HUNGER_THRESHOLD = 60;           // Seek food at 60%
const CRITICAL_HUNGER = 85;            // Interrupt work — must eat now
const FATIGUE_THRESHOLD = 65;          // Seek rest at 65%
const CRITICAL_FATIGUE = 85;           // Interrupt work — collapse/sleep
const EATING_TURNS = 5;                // Turns to eat at a campfire
const EATING_TURNS_GROUND = 7;         // Turns eating in-place (cold, uncomfortable)
const SLEEPING_TURNS = 10;             // Turns asleep in a shelter
const SLEEPING_TURNS_GROUND = 15;      // Turns asleep on bare ground (fitful sleep)
const HUNGER_PER_EATING_CAMPFIRE = 14; // 5×14=70 hunger restored — enough from 60 to 0
const HUNGER_PER_EATING_GROUND = 7;    // 7×7=49 hunger restored — leaves pawn still hungry from 60
const FATIGUE_PER_SLEEPING_TURN = 10;  // 10×10=100 fatigue restored in shelter
const FATIGUE_PER_SLEEPING_GROUND = 5; // 15×5=75 restored on ground — never fully rests from high fatigue

// ===== HELPERS =====

function isAdjacent(ax: number, ay: number, bx: number, by: number): boolean {
    const dx = Math.abs(ax - bx);
    const dy = Math.abs(ay - by);
    return dx <= 1 && dy <= 1 && (dx + dy) > 0;
}

/** Tiles held by pawns that are currently stationary (eating, sleeping, or working). */
function getOccupiedTiles(excludePawnId: string, gs: GameState): Set<string> {
    const occupied = new Set<string>();
    for (const p of gs.pawns) {
        if (p.id === excludePawnId || !p.position) continue;
        const state = p.currentState ?? PAWN_STATE.IDLE;
        if (
            state === PAWN_STATE.EATING ||
            state === PAWN_STATE.SLEEPING ||
            state === PAWN_STATE.WORKING
        ) {
            occupied.add(`${p.position.x},${p.position.y}`);
        }
    }
    return occupied;
}

function findAdjacentApproach(
    tx: number,
    ty: number,
    worldMap: GameState['worldMap'],
    occupied?: Set<string>
): { x: number; y: number } | null {
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = tx + dx;
            const ny = ty + dy;
            if (worldMap[ny]?.[nx]?.walkable && !occupied?.has(`${nx},${ny}`)) return { x: nx, y: ny };
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
    const occupied = getOccupiedTiles(pawn.id, gameState);
    const approach = findAdjacentApproach(tx, ty, gameState.worldMap, occupied);
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

// Building type lists — module-level for use in helpers
const CAMPFIRE_TYPES = ['campfire'];
const REST_TYPES = ['lean_to_shelter', 'woodland_shelter', 'stone_hut'];

/** Phase 6: find the nearest complete storage building (campfire etc.) to a pawn. */
function findNearestStorageBuilding(
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

/** Phase 6: find the nearest complete rest building (shelter etc.) to a pawn. */
function findNearestRestBuilding(
    pawn: Pawn,
    gs: GameState
): { x: number; y: number; buildingId: string } | null {
    if (!pawn.position) return null;
    let best: { x: number; y: number; buildingId: string; dist: number } | null = null;
    for (const b of gs.buildings ?? []) {
        if (b.status !== 'complete') continue;
        if (!REST_TYPES.includes(b.type)) continue;
        const dist = Math.abs(b.x - pawn.position.x) + Math.abs(b.y - pawn.position.y);
        if (!best || dist < best.dist) best = { x: b.x, y: b.y, buildingId: b.id, dist };
    }
    return best ? { x: best.x, y: best.y, buildingId: best.buildingId } : null;
}

/** True when the pawn is adjacent to a lit campfire (better eating). */
function isAtFoodBuilding(pawn: Pawn, gs: GameState): boolean {
    if (!pawn.position) return false;
    return (gs.buildings ?? []).some(
        (b) => b.status === 'complete' && CAMPFIRE_TYPES.includes(b.type) &&
            isAdjacent(pawn.position!.x, pawn.position!.y, b.x, b.y)
    );
}

/** True when the pawn is adjacent to a shelter (better sleep). */
function isAtRestBuilding(pawn: Pawn, gs: GameState): boolean {
    if (!pawn.position) return false;
    return (gs.buildings ?? []).some(
        (b) => b.status === 'complete' && REST_TYPES.includes(b.type) &&
            isAdjacent(pawn.position!.x, pawn.position!.y, b.x, b.y)
    );
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

    // First priority: stockpile zones designated on the map
    for (const [key, type] of Object.entries(gs.designations ?? {})) {
        if (type !== 'stockpile') continue;
        const [x, y] = key.split(',').map(Number);
        const dist = Math.abs(x - px) + Math.abs(y - py);
        if (!best || dist < best.dist) best = { x, y, dist };
    }
    if (best) return { x: best.x, y: best.y };

    // Second priority: designated storage building types
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

/** Transfer everything in pawn.inventory onto stockpile zone tiles (1 item type per tile). */
function depositInventory(pawn: Pawn, gs: GameState): GameState {
    const inv = pawn.inventory?.items ?? {};
    if (Object.keys(inv).length === 0) return goIdle(pawn, gs);

    // Collect all stockpile tile coordinates
    const stockpileTiles = Object.entries(gs.designations ?? {})
        .filter(([, t]) => t === 'stockpile')
        .map(([key]) => {
            const [x, y] = key.split(',').map(Number);
            return { x, y };
        });

    const newDropped = [...(gs.droppedItems ?? [])];
    const newStockpile = { ...(gs.stockpile ?? {}) };

    for (const [resourceId, qty] of Object.entries(inv)) {
        if (qty <= 0) continue;

        // Try to stack onto an existing stored tile of the same type
        const existingIdx = newDropped.findIndex((d) => d.stored && d.resourceId === resourceId);
        if (existingIdx >= 0) {
            newDropped[existingIdx] = {
                ...newDropped[existingIdx],
                quantity: newDropped[existingIdx].quantity + qty
            };
        } else {
            // Find a free stockpile tile (no stored item on it yet)
            const usedCoords = new Set(newDropped.filter((d) => d.stored).map((d) => `${d.x},${d.y}`));
            const freeTile = stockpileTiles.find((t) => !usedCoords.has(`${t.x},${t.y}`));
            if (freeTile) {
                newDropped.push({
                    id: `stored-${resourceId}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                    resourceId,
                    x: freeTile.x,
                    y: freeTile.y,
                    quantity: qty,
                    stored: true
                });
            }
            // If no free tile, items are still tracked in the aggregate below
        }

        // Always keep the aggregate stockpile in sync (used by fuel/crafting systems)
        newStockpile[resourceId] = (newStockpile[resourceId] ?? 0) + qty;
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
    // Write to both stockpile (for fuel/fire systems) and item (for sidebar/crafting display)
    const afterStockpile = { ...gs, stockpile: newStockpile, pawns: newPawns, droppedItems: newDropped };
    return itemService.addItems(inv, afterStockpile);
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
    if ((pawn.needs?.hunger ?? 0) >= HUNGER_THRESHOLD && findAvailableFood(gameState)) {
        return transitionTo(pawn, PAWN_STATE.HUNGRY, gameState);
    }
    // Sleep if fatigued — pawn will collapse in-place if no shelter exists
    if ((pawn.needs?.fatigue ?? 0) >= FATIGUE_THRESHOLD) {
        return transitionTo(pawn, PAWN_STATE.TIRED, gameState);
    }

    // Don't pick jobs until the pathfinder is ready — prevents endless pick/release cycles
    if (!wasmPathfinderService.isReady()) return gameState;

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

    // Critical needs: pawn drops the job and attends to survival immediately
    if ((pawn.needs?.hunger ?? 0) >= CRITICAL_HUNGER && findAvailableFood(gameState)) {
        const gs = jobService.releaseJob(pawn.id, jobId, gameState);
        return transitionTo(pawn, PAWN_STATE.HUNGRY, gs);
    }
    if ((pawn.needs?.fatigue ?? 0) >= CRITICAL_FATIGUE) {
        const gs = jobService.releaseJob(pawn.id, jobId, gameState);
        return transitionTo(pawn, PAWN_STATE.TIRED, gs);
    }

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
        const invItems = updatedPawn?.inventory?.items ?? {};
        const hasInventory = Object.values(invItems).some((v) => v > 0);
        console.log(`[WORKING-DONE] ${pawn.name} job finished — hasInventory=${hasInventory} inv=`, JSON.stringify(invItems));

        if (hasInventory) {
            // Transition to HAULING — handleHauling will run next turn and find a deposit point.
            // This ensures items are visible in the CARRYING section for at least one turn.
            console.log(`[WORKING-DONE] ${pawn.name} entering HAULING state with inv=`, JSON.stringify(invItems));
            return {
                ...afterAdvance,
                pawns: afterAdvance.pawns.map((p) =>
                    p.id === pawn.id
                        ? { ...p, currentState: PAWN_STATE.HAULING, activeJob: undefined }
                        : p
                )
            };
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
    // Better recovery near a campfire; cold field meal is less satisfying
    const atCampfire = isAtFoodBuilding(pawn, gameState);
    const hungerRecovery = atCampfire ? HUNGER_PER_EATING_CAMPFIRE : HUNGER_PER_EATING_GROUND;
    const eatDuration = atCampfire ? EATING_TURNS : EATING_TURNS_GROUND;
    const newHunger = Math.max(0, (pawn.needs?.hunger ?? 50) - hungerRecovery);

    const updatedNeeds = {
        ...(pawn.needs ?? { hunger: 0, fatigue: 0, sleep: 0, lastSleep: 0, lastMeal: 0 }),
        hunger: newHunger,
        lastMeal: gameState.turn
    };
    const updatedState = {
        ...(pawn.state ?? { mood: 50, health: 100, isWorking: false, isSleeping: false, isEating: false }),
        isEating: turnsInState < eatDuration
    };

    if (turnsInState >= eatDuration) {
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
                        ? { ...activeJob, turnsInState, progress: turnsInState / eatDuration }
                        : undefined
                }
                : p
        )
    };
}

function handleSleeping(pawn: Pawn, gameState: GameState): GameState {
    const activeJob = pawn.activeJob;
    const turnsInState = (activeJob?.turnsInState ?? 0) + 1;
    // Proper shelter dramatically improves sleep quality and duration
    const atShelter = isAtRestBuilding(pawn, gameState);
    const fatigueRecovery = atShelter ? FATIGUE_PER_SLEEPING_TURN : FATIGUE_PER_SLEEPING_GROUND;
    const sleepDuration = atShelter ? SLEEPING_TURNS : SLEEPING_TURNS_GROUND;
    const newFatigue = Math.max(0, (pawn.needs?.fatigue ?? 50) - fatigueRecovery);
    const newSleep = Math.max(0, (pawn.needs?.sleep ?? 50) - fatigueRecovery);

    const updatedNeeds = {
        ...(pawn.needs ?? { hunger: 0, fatigue: 0, sleep: 0, lastSleep: 0, lastMeal: 0 }),
        fatigue: newFatigue,
        sleep: newSleep,
        lastSleep: gameState.turn
    };
    const updatedState = {
        ...(pawn.state ?? { mood: 50, health: 100, isWorking: false, isSleeping: false, isEating: false }),
        isSleeping: turnsInState < sleepDuration
    };

    if (turnsInState >= sleepDuration) {
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
                        ? { ...activeJob, turnsInState, progress: turnsInState / sleepDuration }
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
