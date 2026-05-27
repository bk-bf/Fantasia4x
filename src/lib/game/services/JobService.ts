/**
 * JobService — Phase 5a
 *
 * Central job system: generates discrete jobs from world state, allows
 * pawns to claim and advance them, and handles completion side-effects.
 *
 * Port of Celestia job_service.gd, adapted for SvelteKit + immutable state.
 * Called from GameEngineImpl at the START of each turn (generateJobs) and
 * indirectly through PawnStateMachine (claimJob / advanceJob / releaseJob).
 */

import type { GameState, Job, Pawn, DroppedItem } from '../core/types';
import { ITEMS_DATABASE } from '../core/Items';

// ===== WORK CONSTANTS =====

/** How many work-points a harvest job costs by resource type. */
const HARVEST_WORK: Record<string, number> = {
    wood: 5,
    stone: 8,
    herbs: 3,
    iron_ore: 7,
    clay: 4,
    bark: 4,
    flint: 6,
    berries: 2,
    mushrooms: 2,
    fiber: 3,
    // Phase 6e: primitive resource costs
    twig: 1,
    flint_shard: 2,
    plant_fiber: 2,
    surface_stone: 2,
    clay_lump: 2
};
const DEFAULT_HARVEST_WORK = 5;

/** Work-points per turn a pawn delivers (base rate; later modifiable by stats). */
export const BASE_WORK_RATE = 1;

// ===== JOB SERVICE =====

class JobServiceImpl {
    // ------------------------------------------------------------------ //
    // PUBLIC API                                                           //
    // ------------------------------------------------------------------ //

    /**
     * Sync gameState.jobs[] with current world state.
     * - Creates new jobs for designations, incomplete buildings, and queued crafts.
     * - Removes jobs whose sources are gone.
     * - Preserves existing jobs (keeping claimedBy + workDone intact).
     *
     * Called once per turn from GameEngineImpl BEFORE pawn processing.
     */
    generateJobs(gameState: GameState): GameState {
        let jobs: Job[] = [...(gameState.jobs ?? [])];

        // --- Harvest jobs from designations ---
        jobs = this._syncHarvestJobs(jobs, gameState);

        // --- Haul jobs from dropped items ---
        jobs = this._syncHaulJobs(jobs, gameState);

        // --- Construct jobs from incomplete placed buildings ---
        jobs = this._syncConstructJobs(jobs, gameState);

        // --- Craft jobs from crafting queue ---
        jobs = this._syncCraftJobs(jobs, gameState);

        // --- Phase 6: fuel-management jobs for campfires ---
        jobs = this._syncLightJobs(jobs, gameState);
        jobs = this._syncRefuelJobs(jobs, gameState);

        return { ...gameState, jobs };
    }

    /**
     * Mark a job as claimed by a pawn.
     * Idempotent if the pawn already owns it.
     */
    claimJob(pawnId: string, jobId: string, gameState: GameState): GameState {
        const jobs = (gameState.jobs ?? []).map((j) =>
            j.id === jobId && (j.claimedBy === null || j.claimedBy === pawnId)
                ? { ...j, claimedBy: pawnId }
                : j
        );
        return { ...gameState, jobs };
    }

    /**
     * Release a pawn's claim on a job (e.g. interrupted).
     */
    releaseJob(pawnId: string, jobId: string, gameState: GameState): GameState {
        const jobs = (gameState.jobs ?? []).map((j) =>
            j.id === jobId && j.claimedBy === pawnId ? { ...j, claimedBy: null } : j
        );
        return { ...gameState, jobs };
    }

    /**
     * Add work-points to a job.
     * When workDone >= workRequired, completes the job and applies side-effects.
     */
    advanceJob(jobId: string, workPoints: number, gameState: GameState): GameState {
        const jobIdx = (gameState.jobs ?? []).findIndex((j) => j.id === jobId);
        if (jobIdx < 0) return gameState;

        const job = gameState.jobs[jobIdx];
        const newWorkDone = job.workDone + workPoints;

        if (newWorkDone >= job.workRequired) {
            // Job complete — run side effects, remove from pool
            return this._completeJob(job, gameState);
        }

        // Not done yet — update workDone in job (and mirror to building if construct)
        const newJobs = [...gameState.jobs];
        newJobs[jobIdx] = { ...job, workDone: newWorkDone };

        if (job.type === 'construct' && job.buildingId) {
            const newBuildings = (gameState.buildings ?? []).map((b) =>
                b.id === job.buildingId
                    ? { ...b, status: 'under_construction' as const, workDone: newWorkDone }
                    : b
            );
            return { ...gameState, jobs: newJobs, buildings: newBuildings };
        }

        if (job.type === 'craft' && job.craftQueueId) {
            const newQueue = (gameState.craftingQueue ?? []).map((e) =>
                e.id === job.craftQueueId ? { ...e, workDone: newWorkDone } : e
            );
            return { ...gameState, jobs: newJobs, craftingQueue: newQueue };
        }

        return { ...gameState, jobs: newJobs };
    }

    /**
     * Return unclaimed (or claimed by this pawn) jobs the pawn is allowed to work,
     * sorted by labor level (desc) then Manhattan distance (asc).
     */
    getAvailableJobs(pawn: Pawn, gameState: GameState): Job[] {
        if (!pawn.position) return [];
        const { x: px, y: py } = pawn.position;

        const assignment = gameState.workAssignments?.[pawn.id];
        const laborSettings = assignment?.laborSettings ?? {};
        const legacyPriorities = assignment?.workPriorities ?? {};

        const available = (gameState.jobs ?? []).filter((j) => {
            // Must be unclaimed or claimed by this pawn
            if (j.claimedBy !== null && j.claimedBy !== pawn.id) return false;

            // Map job type to work category key used in labor settings
            const workKey = this._jobTypeToWorkKey(j, gameState);

            // Check new laborSettings first, fall back to legacy workPriorities.
            // Default to LABOR_LEVEL.NORMAL (2) so new pawns accept all jobs.
            let priority: number;
            if (workKey in laborSettings) {
                priority = laborSettings[workKey] ?? 2;
            } else if (workKey in legacyPriorities) {
                priority = legacyPriorities[workKey];
            } else {
                priority = 2; // LABOR_LEVEL.NORMAL — default enabled
            }
            return priority > 0;
        });

        return available.sort((a, b) => {
            const workKeyA = this._jobTypeToWorkKey(a, gameState);
            const workKeyB = this._jobTypeToWorkKey(b, gameState);
            const labA = laborSettings[workKeyA] ?? 2;
            const labB = laborSettings[workKeyB] ?? 2;
            if (labB !== labA) return labB - labA;
            const dA = Math.abs(a.targetX - px) + Math.abs(a.targetY - py);
            const dB = Math.abs(b.targetX - px) + Math.abs(b.targetY - py);
            return dA - dB;
        });
    }

    // ------------------------------------------------------------------ //
    // PRIVATE — JOB GENERATION                                            //
    // ------------------------------------------------------------------ //

    private _syncHarvestJobs(jobs: Job[], gs: GameState): Job[] {
        // Remove harvest/forage/scavenge jobs whose designation no longer exists or tile is empty
        jobs = jobs.filter((j) => {
            if (j.type !== 'harvest') return true;
            const key = `${j.targetX},${j.targetY}`;
            const dtype = gs.designations?.[key];
            if (dtype !== 'harvest' && dtype !== 'forage' && dtype !== 'scavenge') return false;
            const tile = gs.worldMap[j.targetY]?.[j.targetX];
            return (tile?.resources?.[j.resourceId ?? ''] ?? 0) > 0;
        });

        // Add new harvest jobs for designations that have no job yet
        for (const [key, dtype] of Object.entries(gs.designations ?? {})) {
            if (dtype !== 'harvest' && dtype !== 'forage' && dtype !== 'scavenge') continue;
            const [x, y] = key.split(',').map(Number);

            const tile = gs.worldMap[y]?.[x];
            if (!tile) continue;

            const resourceId = Object.keys(tile.resources ?? {}).find(
                (id) => (tile.resources[id] ?? 0) > 0
            );
            if (!resourceId) continue;

            const exists = jobs.some(
                (j) => j.type === 'harvest' && j.targetX === x && j.targetY === y
            );
            if (!exists) {
                jobs.push({
                    id: `harvest-${x}-${y}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                    type: 'harvest',
                    targetX: x,
                    targetY: y,
                    resourceId,
                    workRequired: HARVEST_WORK[resourceId] ?? DEFAULT_HARVEST_WORK,
                    workDone: 0,
                    claimedBy: null
                });
            }
        }

        return jobs;
    }

    private _syncConstructJobs(jobs: Job[], gs: GameState): Job[] {
        // Remove construct jobs for buildings that no longer exist or are complete
        jobs = jobs.filter((j) => {
            if (j.type !== 'construct') return true;
            const b = (gs.buildings ?? []).find((b) => b.id === j.buildingId);
            return b && b.status !== 'complete';
        });

        // Add new construct jobs for incomplete buildings
        for (const building of gs.buildings ?? []) {
            if (building.status === 'complete') continue;
            if (!building.x && !building.y && building.x !== 0 && building.y !== 0) continue;

            // Phase 6: zero-workRequired buildings were already completed by BuildingService.placeBuilding
            // (buildTime === 0 → status 'complete' on placement), so they won't reach here.
            // Extra guard just in case:
            if ((building.workRequired ?? 1) === 0) continue;

            const exists = jobs.some(
                (j) => j.type === 'construct' && j.buildingId === building.id
            );
            if (!exists) {
                jobs.push({
                    id: `construct-${building.id}-${Date.now()}`,
                    type: 'construct',
                    targetX: building.x,
                    targetY: building.y,
                    buildingId: building.id,
                    workRequired: building.workRequired ?? 50,
                    workDone: building.workDone ?? 0,
                    claimedBy: null
                });
            }
        }

        return jobs;
    }

    private _syncCraftJobs(jobs: Job[], gs: GameState): Job[] {
        // Remove craft jobs for queue entries that no longer exist
        jobs = jobs.filter((j) => {
            if (j.type !== 'craft') return true;
            return (gs.craftingQueue ?? []).some((e) => e.id === j.craftQueueId);
        });

        // Add new craft jobs for queue entries that have an id but no job yet
        for (const entry of gs.craftingQueue ?? []) {
            if (!entry.id) continue; // legacy entries without id — skip
            const exists = jobs.some((j) => j.type === 'craft' && j.craftQueueId === entry.id);
            if (!exists) {
                jobs.push({
                    id: `craft-${entry.id}-${Date.now()}`,
                    type: 'craft',
                    targetX: 0,
                    targetY: 0,
                    craftQueueId: entry.id,
                    workRequired: entry.workRequired ?? (entry.item.craftingTime ?? 1) * 5,
                    workDone: entry.workDone ?? 0,
                    claimedBy: null
                });
            }
        }

        return jobs;
    }

    // ------------------------------------------------------------------ //
    // PRIVATE — JOB COMPLETION                                            //
    // ------------------------------------------------------------------ //

    private _completeJob(job: Job, gameState: GameState): GameState {
        // Remove the finished job from the pool
        const jobs = (gameState.jobs ?? []).filter((j) => j.id !== job.id);
        let state: GameState = { ...gameState, jobs };

        switch (job.type) {
            case 'harvest':
                state = this._completeHarvest(job, state);
                break;
            case 'haul':
                state = this._completeHaul(job, state);
                break;
            case 'construct':
                state = this._completeConstruct(job, state);
                break;
            case 'craft':
                state = this._completeCraft(job, state);
                break;
            case 'light':
                state = this._completeLight(job, state);
                break;
            case 'refuel':
                state = this._completeRefuel(job, state);
                break;
        }

        return state;
    }

    private _completeHarvest(job: Job, gs: GameState): GameState {
        if (!job.resourceId) return gs;

        const tile = gs.worldMap[job.targetY]?.[job.targetX];
        const available = tile?.resources?.[job.resourceId] ?? 0;
        if (available <= 0) return gs;

        const harvestAmount = 1;

        // Deplete tile
        const newWorldMap = gs.worldMap.map((row, ry) =>
            ry === job.targetY
                ? row.map((col, rx) =>
                    rx === job.targetX
                        ? {
                            ...col,
                            resources: {
                                ...col.resources,
                                [job.resourceId!]: Math.max(
                                    0,
                                    (col.resources[job.resourceId!] ?? 0) - harvestAmount
                                )
                            }
                        }
                        : col
                )
                : row
        );

        // Spawn a dropped item at the harvest tile instead of adding straight to stockpile
        const drop: DroppedItem = {
            id: `drop-${job.resourceId}-${job.targetX}-${job.targetY}-${Date.now()}`,
            resourceId: job.resourceId,
            x: job.targetX,
            y: job.targetY,
            quantity: harvestAmount
        };
        const newDropped = [...(gs.droppedItems ?? []), drop];

        // Remove designation
        const newDesignations = { ...(gs.designations ?? {}) };
        delete newDesignations[`${job.targetX},${job.targetY}`];

        console.log(
            `[JobService] Harvest complete: ${job.resourceId} at (${job.targetX},${job.targetY}) → dropped (${drop.id})`
        );
        return { ...gs, worldMap: newWorldMap, droppedItems: newDropped, designations: newDesignations };
    }

    private _syncHaulJobs(jobs: Job[], gs: GameState): Job[] {
        // Remove haul jobs whose dropped item no longer exists
        jobs = jobs.filter((j) => {
            if (j.type !== 'haul') return true;
            return (gs.droppedItems ?? []).some((d) => d.id === j.droppedItemId);
        });

        // Add haul jobs for dropped items that have no job yet
        for (const drop of gs.droppedItems ?? []) {
            const exists = jobs.some((j) => j.type === 'haul' && j.droppedItemId === drop.id);
            if (!exists) {
                jobs.push({
                    id: `haul-${drop.id}-${Date.now()}`,
                    type: 'haul',
                    targetX: drop.x,
                    targetY: drop.y,
                    resourceId: drop.resourceId,
                    droppedItemId: drop.id,
                    workRequired: 1, // instant pick-up on arrival
                    workDone: 0,
                    claimedBy: null
                });
            }
        }

        return jobs;
    }

    private _completeHaul(job: Job, gs: GameState): GameState {
        if (!job.droppedItemId) return gs;

        const drop = (gs.droppedItems ?? []).find((d) => d.id === job.droppedItemId);
        if (!drop) return gs;

        // Remove the dropped item from the ground
        const newDropped = (gs.droppedItems ?? []).filter((d) => d.id !== drop.id);

        // Add to carrying pawn's inventory
        const pawnId = job.claimedBy;
        if (pawnId) {
            const newPawns = gs.pawns.map((p) => {
                if (p.id !== pawnId) return p;
                const inv = p.inventory ?? { items: {}, maxSlots: 20, currentSlots: 0 };
                const newItems = { ...inv.items };
                newItems[drop.resourceId] = (newItems[drop.resourceId] ?? 0) + drop.quantity;
                const currentSlots = Object.values(newItems).reduce((s, v) => s + v, 0);
                return { ...p, inventory: { ...inv, items: newItems, currentSlots } };
            });
            console.log(`[JobService] Haul pickup: ${drop.resourceId} ×${drop.quantity} → pawn ${pawnId}`);
            return { ...gs, droppedItems: newDropped, pawns: newPawns };
        }

        // No pawn claimed it (shouldn't happen) — fall back to stockpile
        const newStockpile = { ...(gs.stockpile ?? {}) };
        newStockpile[drop.resourceId] = (newStockpile[drop.resourceId] ?? 0) + drop.quantity;
        return { ...gs, droppedItems: newDropped, stockpile: newStockpile };
    }

    private _completeConstruct(job: Job, gs: GameState): GameState {
        if (!job.buildingId) return gs;

        const building = (gs.buildings ?? []).find((b) => b.id === job.buildingId);
        if (!building) return gs;

        const newBuildings = (gs.buildings ?? []).map((b) =>
            b.id === job.buildingId
                ? { ...b, status: 'complete' as const, progress: 1, workDone: b.workRequired ?? 50 }
                : b
        );

        // Keep buildingCounts in sync for legacy compatibility
        const newCounts = { ...(gs.buildingCounts ?? {}) };
        newCounts[building.type] = (newCounts[building.type] ?? 0) + 1;

        console.log(`[JobService] Construction complete: ${building.type} (${building.id})`);
        return { ...gs, buildings: newBuildings, buildingCounts: newCounts };
    }

    private _completeCraft(job: Job, gs: GameState): GameState {
        if (!job.craftQueueId) return gs;

        const entry = (gs.craftingQueue ?? []).find((e) => e.id === job.craftQueueId);
        if (!entry) return gs;

        // Add crafted item(s) to item pool
        const itemId = entry.item.id;
        const quantity = entry.quantity ?? 1;
        const newItems = [...gs.item];
        const idx = newItems.findIndex((i) => i.id === itemId);
        if (idx >= 0) {
            newItems[idx] = { ...newItems[idx], amount: newItems[idx].amount + quantity };
        } else {
            newItems.push({ ...entry.item, amount: quantity });
        }

        // Remove from crafting queue
        const newQueue = (gs.craftingQueue ?? []).filter((e) => e.id !== job.craftQueueId);

        console.log(`[JobService] Crafting complete: ${itemId} ×${quantity}`);
        return { ...gs, item: newItems, craftingQueue: newQueue };
    }

    /** Phase 6: generate 'light' jobs for unlit campfires that have fuel. */
    private _syncLightJobs(jobs: Job[], gs: GameState): Job[] {
        // Remove light jobs for campfires that are now lit or gone
        jobs = jobs.filter((j) => {
            if (j.type !== 'light') return true;
            const b = (gs.buildings ?? []).find((b) => b.id === j.buildingId);
            return b && b.status === 'complete' && !b.lit && (b.fuel ?? 0) > 0;
        });

        // Add light job for any unlit campfire with fuel that has no light job yet
        for (const b of gs.buildings ?? []) {
            if (b.status !== 'complete') continue;
            if (b.type !== 'campfire') continue;
            if (b.lit) continue;
            if ((b.fuel ?? 0) <= 0) continue;
            const exists = jobs.some((j) => j.type === 'light' && j.buildingId === b.id);
            if (!exists) {
                jobs.push({
                    id: `light-${b.id}-${Date.now()}`,
                    type: 'light',
                    targetX: b.x,
                    targetY: b.y,
                    buildingId: b.id,
                    workRequired: 2,
                    workDone: 0,
                    claimedBy: null
                });
            }
        }
        return jobs;
    }

    /** Phase 6: generate 'refuel' jobs for campfires whose fuel is low. */
    private _syncRefuelJobs(jobs: Job[], gs: GameState): Job[] {
        const REFUEL_THRESHOLD = 10;
        // Remove refuel jobs for campfires at capacity or gone
        jobs = jobs.filter((j) => {
            if (j.type !== 'refuel') return true;
            const b = (gs.buildings ?? []).find((b) => b.id === j.buildingId);
            if (!b || b.status !== 'complete') return false;
            // Check we still have fuel items in stockpile
            const hasFuelItems = this._hasFuelInStockpile(gs);
            return (b.fuel ?? 0) < REFUEL_THRESHOLD && hasFuelItems;
        });

        for (const b of gs.buildings ?? []) {
            if (b.status !== 'complete') continue;
            if (b.type !== 'campfire') continue;
            if ((b.fuel ?? 0) >= REFUEL_THRESHOLD) continue;
            if (!this._hasFuelInStockpile(gs)) continue;
            const exists = jobs.some((j) => j.type === 'refuel' && j.buildingId === b.id);
            if (!exists) {
                jobs.push({
                    id: `refuel-${b.id}-${Date.now()}`,
                    type: 'refuel',
                    targetX: b.x,
                    targetY: b.y,
                    buildingId: b.id,
                    workRequired: 3,
                    workDone: 0,
                    claimedBy: null
                });
            }
        }
        return jobs;
    }

    private _completeLight(job: Job, gs: GameState): GameState {
        if (!job.buildingId) return gs;
        // Pawn needs a firestarter in stockpile
        const newStockpile = { ...(gs.stockpile ?? {}) };
        const firestarters = newStockpile['firestarter'] ?? 0;
        if (firestarters > 0) newStockpile['firestarter'] = firestarters - 1;
        const newBuildings = (gs.buildings ?? []).map((b) =>
            b.id === job.buildingId ? { ...b, lit: true } : b
        );
        console.log(`[JobService] Campfire lit: ${job.buildingId}`);
        return { ...gs, buildings: newBuildings, stockpile: newStockpile };
    }

    private _completeRefuel(job: Job, gs: GameState): GameState {
        if (!job.buildingId) return gs;
        const building = (gs.buildings ?? []).find((b) => b.id === job.buildingId);
        if (!building) return gs;
        // Find best available fuel item in stockpile
        const stockpile = { ...(gs.stockpile ?? {}) };
        let fuelAdded = 0;
        for (const item of ITEMS_DATABASE) {
            if ((item.fuelValue ?? 0) <= 0) continue;
            const available = stockpile[item.id] ?? 0;
            if (available <= 0) continue;
            stockpile[item.id] = available - 1;
            fuelAdded = item.fuelValue!;
            break;
        }
        if (fuelAdded === 0) return gs; // nothing to add
        const newBuildings = (gs.buildings ?? []).map((b) =>
            b.id === job.buildingId
                ? { ...b, fuel: Math.min((b.fuel ?? 0) + fuelAdded, 60) }
                : b
        );
        console.log(`[JobService] Campfire refuelled +${fuelAdded}: ${job.buildingId}`);
        return { ...gs, buildings: newBuildings, stockpile };
    }

    private _hasFuelInStockpile(gs: GameState): boolean {
        const stockpile = gs.stockpile ?? {};
        return ITEMS_DATABASE.some(
            (item) => (item.fuelValue ?? 0) > 0 && (stockpile[item.id] ?? 0) > 0
        );
    }

    // ------------------------------------------------------------------ //
    // PRIVATE — HELPERS                                                   //
    // ------------------------------------------------------------------ //

    /** Map Job to the work category key used in WorkAssignment.laborSettings */
    private _jobTypeToWorkKey(job: Job, gs?: GameState): string {
        switch (job.type) {
            case 'harvest': {
                // Route based on the resource being harvested
                const resourceId = job.resourceId ?? '';
                const primitiveForage = ['twig', 'flint_shard', 'plant_fiber', 'bark', 'surface_stone', 'clay_lump', 'herbs', 'berries', 'mushrooms', 'fiber'];
                if (primitiveForage.includes(resourceId)) return 'foraging';
                if (['stone', 'iron_ore', 'flint'].includes(resourceId)) return 'mining';
                return 'woodcutting'; // wood and unrecognised defaults
            }
            case 'construct':
                return 'construction';
            case 'craft':
                return 'crafting';
            case 'haul':
                return 'hauling';
            case 'eat':
                return 'eat';
            case 'sleep':
                return 'sleep';
            case 'light':
            case 'refuel':
                return 'construction'; // map to construction labor bucket
            default:
                return job.type;
        }
    }
}

export const jobService = new JobServiceImpl();
