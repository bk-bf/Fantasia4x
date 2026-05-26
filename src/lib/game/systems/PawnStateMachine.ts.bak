/**
 * PawnStateMachine — Phase 4a
 *
 * Manages turn-based state transitions for work-related pawn behaviour:
 * Idle → MovingToResource → Harvesting → Idle
 *
 * Needs-driven states (Hungry / Eating / Sleeping) are still managed by
 * PawnService.processAutomaticNeeds() to avoid disrupting existing systems.
 * The state machine checks `pawn.state.isEating / isSleeping` to yield when
 * the needs system has taken control.
 *
 * Port of Celestia pawn_state_machine.gd + states/*.gd, adapted to
 * turn-based ticks (no delta time) and Fantasia4x GameState immutability.
 */

import type { GameState, Pawn, DesignationType } from '../core/types';
import { pawnService } from '../services/PawnService';
import { wasmPathfinderService } from '../services/WasmPathfinderService';
import { buildPathfindingGrids } from '../services/PathfinderService';

// ===== STATE NAME CONSTANTS =====
export const PAWN_STATE = {
    IDLE: 'Idle',
    MOVING_TO_RESOURCE: 'MovingToResource',
    HARVESTING: 'Harvesting'
} as const;

export type PawnStateName = (typeof PAWN_STATE)[keyof typeof PAWN_STATE];

// ===== HARVEST TIMING (turns, not seconds) =====
const HARVEST_TURNS: Record<string, number> = {
    wood: 5,
    stone: 8,
    herbs: 3,
    iron_ore: 7,
    clay: 4
};
const DEFAULT_HARVEST_TURNS = 5;

// ===== HELPERS =====

function isAdjacent(ax: number, ay: number, bx: number, by: number): boolean {
    const dx = Math.abs(ax - bx);
    const dy = Math.abs(ay - by);
    return dx <= 1 && dy <= 1 && (dx + dy) > 0;
}

function dist(ax: number, ay: number, bx: number, by: number): number {
    return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
}

/**
 * Find the first open harvest designation nearest to the pawn that has
 * resources available on the world map.
 */
function findNearestHarvestDesignation(
    pawn: Pawn,
    gameState: GameState
): { x: number; y: number; resourceId: string } | null {
    if (!pawn.position) return null;
    const { x: px, y: py } = pawn.position;

    let best: { x: number; y: number; resourceId: string; dist: number } | null = null;

    for (const [key, type] of Object.entries(gameState.designations ?? {})) {
        if (type !== 'harvest') continue;
        const [kx, ky] = key.split(',').map(Number);
        const tile = gameState.worldMap[ky]?.[kx];
        if (!tile) continue;

        // Find which resource on the tile this designation is for (pick first available)
        const resourceId = Object.keys(tile.resources ?? {}).find(
            (id) => (tile.resources[id] ?? 0) > 0
        );
        if (!resourceId) continue;

        const d = dist(px, py, kx, ky);
        if (!best || d < best.dist) {
            best = { x: kx, y: ky, resourceId, dist: d };
        }
    }

    return best ? { x: best.x, y: best.y, resourceId: best.resourceId } : null;
}

/**
 * Find the best adjacent walkable tile to move to for reaching (tx, ty).
 * Returns null if no walkable adjacent tile exists.
 */
function findAdjacentApproach(
    tx: number,
    ty: number,
    worldMap: GameState['worldMap']
): { x: number; y: number } | null {
    const candidates: { x: number; y: number }[] = [];
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = tx + dx;
            const ny = ty + dy;
            if (worldMap[ny]?.[nx]?.walkable) {
                candidates.push({ x: nx, y: ny });
            }
        }
    }
    return candidates[0] ?? null;
}

/**
 * Attempt to path a pawn towards `(tx, ty)`. Assigns the path via PawnService
 * and returns the updated GameState. Returns null if no path found.
 */
function tryAssignPath(
    pawn: Pawn,
    tx: number,
    ty: number,
    gameState: GameState
): GameState | null {
    if (!pawn.position) return null;
    if (!wasmPathfinderService.isReady()) return null;

    // If already adjacent, no pathing needed — caller should transition directly
    if (isAdjacent(pawn.position.x, pawn.position.y, tx, ty)) return null;

    // Find an adjacent approach tile
    const approach = findAdjacentApproach(tx, ty, gameState.worldMap);
    if (!approach) return null;

    const { walkable, costs, width, height } = buildPathfindingGrids(gameState.worldMap);
    const path = wasmPathfinderService.findPath(
        walkable,
        costs,
        width,
        height,
        pawn.position.x,
        pawn.position.y,
        approach.x,
        approach.y
    );

    if (path.length === 0) return null;

    return pawnService.assignPath(pawn.id, path, gameState);
}

// ===== PER-PAWN STATE UPDATE =====

function tickPawn(pawn: Pawn, gameState: GameState): GameState {
    // Yield to needs system when pawn is eating or sleeping
    if (pawn.state.isEating || pawn.state.isSleeping) {
        // Clear work state if interrupted mid-job
        if (
            pawn.currentState === PAWN_STATE.HARVESTING ||
            pawn.currentState === PAWN_STATE.MOVING_TO_RESOURCE
        ) {
            return {
                ...gameState,
                pawns: gameState.pawns.map((p) =>
                    p.id === pawn.id
                        ? { ...p, currentState: PAWN_STATE.IDLE, activeJob: undefined }
                        : p
                )
            };
        }
        return gameState;
    }

    const state = pawn.currentState ?? PAWN_STATE.IDLE;

    switch (state) {
        case PAWN_STATE.IDLE:
            return handleIdle(pawn, gameState);

        case PAWN_STATE.MOVING_TO_RESOURCE:
            return handleMovingToResource(pawn, gameState);

        case PAWN_STATE.HARVESTING:
            return handleHarvesting(pawn, gameState);

        default:
            return gameState;
    }
}

// ----- Idle -----

function handleIdle(pawn: Pawn, gameState: GameState): GameState {
    // Look for a nearby harvest designation
    const target = findNearestHarvestDesignation(pawn, gameState);
    if (!target) return gameState;

    const timeRequired = HARVEST_TURNS[target.resourceId] ?? DEFAULT_HARVEST_TURNS;
    const job = {
        type: 'harvest' as const,
        targetX: target.x,
        targetY: target.y,
        resourceId: target.resourceId,
        progress: 0,
        timeRequired
    };

    // If already adjacent, skip movement and go straight to harvesting
    if (pawn.position && isAdjacent(pawn.position.x, pawn.position.y, target.x, target.y)) {
        return {
            ...gameState,
            pawns: gameState.pawns.map((p) =>
                p.id === pawn.id
                    ? { ...p, currentState: PAWN_STATE.HARVESTING, activeJob: job }
                    : p
            )
        };
    }

    // Try to assign a path towards the target
    const afterPath = tryAssignPath(pawn, target.x, target.y, gameState);
    if (!afterPath) return gameState; // No path available — stay idle

    return {
        ...afterPath,
        pawns: afterPath.pawns.map((p) =>
            p.id === pawn.id
                ? { ...p, currentState: PAWN_STATE.MOVING_TO_RESOURCE, activeJob: job }
                : p
        )
    };
}

// ----- MovingToResource -----

function handleMovingToResource(pawn: Pawn, gameState: GameState): GameState {
    const job = pawn.activeJob;
    if (!job || job.type !== 'harvest') {
        // No job — go idle
        return {
            ...gameState,
            pawns: gameState.pawns.map((p) =>
                p.id === pawn.id
                    ? { ...p, currentState: PAWN_STATE.IDLE, activeJob: undefined }
                    : p
            )
        };
    }

    // Check if the target tile still has the resource
    const tile = gameState.worldMap[job.targetY]?.[job.targetX];
    const resourceAmount = tile?.resources?.[job.resourceId ?? ''] ?? 0;
    if (resourceAmount <= 0) {
        // Resource depleted — cancel and go idle
        return {
            ...gameState,
            pawns: gameState.pawns.map((p) =>
                p.id === pawn.id
                    ? { ...p, currentState: PAWN_STATE.IDLE, activeJob: undefined, isMoving: false, path: [] }
                    : p
            )
        };
    }

    // If pawn just reached destination (processMovement sets hasReachedDestination)
    if (pawn.hasReachedDestination && pawn.position) {
        const adjacent = isAdjacent(pawn.position.x, pawn.position.y, job.targetX, job.targetY);
        if (adjacent) {
            // Arrived — start harvesting
            return {
                ...gameState,
                pawns: gameState.pawns.map((p) =>
                    p.id === pawn.id
                        ? { ...p, currentState: PAWN_STATE.HARVESTING, hasReachedDestination: false }
                        : p
                )
            };
        }
        // Reached end of path but not adjacent — no path or target moved; go idle
        return {
            ...gameState,
            pawns: gameState.pawns.map((p) =>
                p.id === pawn.id
                    ? { ...p, currentState: PAWN_STATE.IDLE, activeJob: undefined }
                    : p
            )
        };
    }

    // Still moving — no action needed (processMovement handles step advancement)
    return gameState;
}

// ----- Harvesting -----

function handleHarvesting(pawn: Pawn, gameState: GameState): GameState {
    const job = pawn.activeJob;
    if (!job || job.type !== 'harvest' || !job.resourceId) {
        return {
            ...gameState,
            pawns: gameState.pawns.map((p) =>
                p.id === pawn.id
                    ? { ...p, currentState: PAWN_STATE.IDLE, activeJob: undefined }
                    : p
            )
        };
    }

    // Verify still adjacent to target
    if (pawn.position && !isAdjacent(pawn.position.x, pawn.position.y, job.targetX, job.targetY)) {
        // Drifted away — re-enter idle to re-path
        return {
            ...gameState,
            pawns: gameState.pawns.map((p) =>
                p.id === pawn.id
                    ? { ...p, currentState: PAWN_STATE.IDLE, activeJob: undefined }
                    : p
            )
        };
    }

    // Check tile still has resources
    const tile = gameState.worldMap[job.targetY]?.[job.targetX];
    const resourceAmount = tile?.resources?.[job.resourceId] ?? 0;
    if (resourceAmount <= 0) {
        // Resource exhausted mid-harvest
        // Remove the designation since nothing left to harvest
        const newDesignations = { ...(gameState.designations ?? {}) };
        delete newDesignations[`${job.targetX},${job.targetY}`];
        return {
            ...gameState,
            designations: newDesignations,
            pawns: gameState.pawns.map((p) =>
                p.id === pawn.id
                    ? { ...p, currentState: PAWN_STATE.IDLE, activeJob: undefined }
                    : p
            )
        };
    }

    // Advance progress
    const harvestSpeed = 1.0; // base harvest speed (could come from pawn stats later)
    const progressPerTurn = (1 / job.timeRequired) * harvestSpeed;
    const newProgress = job.progress + progressPerTurn;

    if (newProgress >= 1.0) {
        // Harvest complete — add to stockpile, deplete tile, clear designation
        const harvestAmount = Math.min(resourceAmount, 1); // harvest 1 unit per completion
        const newDesignations = { ...(gameState.designations ?? {}) };
        delete newDesignations[`${job.targetX},${job.targetY}`];

        // Deplete tile resource
        const newWorldMap = gameState.worldMap.map((row, ry) =>
            ry === job.targetY
                ? row.map((col, rx) =>
                    rx === job.targetX
                        ? {
                            ...col,
                            resources: {
                                ...col.resources,
                                [job.resourceId!]: Math.max(0, resourceAmount - harvestAmount)
                            }
                        }
                        : col
                )
                : row
        );

        // Add to stockpile
        const newStockpile = { ...(gameState.stockpile ?? {}) };
        newStockpile[job.resourceId] = (newStockpile[job.resourceId] ?? 0) + harvestAmount;

        return {
            ...gameState,
            worldMap: newWorldMap,
            stockpile: newStockpile,
            designations: newDesignations,
            pawns: gameState.pawns.map((p) =>
                p.id === pawn.id
                    ? { ...p, currentState: PAWN_STATE.IDLE, activeJob: undefined }
                    : p
            )
        };
    }

    // Not done yet — update progress
    return {
        ...gameState,
        pawns: gameState.pawns.map((p) =>
            p.id === pawn.id ? { ...p, activeJob: { ...job, progress: newProgress } } : p
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
            state = tickPawn(pawn, state);
            // Re-fetch the pawn from updated state for next iteration
            const updatedPawn = state.pawns.find((p) => p.id === pawn.id);
            if (updatedPawn) {
                // tickPawn already updates the state; the loop naturally picks up the next pawn
            }
        }
        return state;
    }
}

export const pawnStateMachineService = new PawnStateMachineImpl();
