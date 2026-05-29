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

import type { DesignationType, GameState, Job, Pawn, DroppedItem, ZoneFilter } from '../core/types';
import itemsData from '../database/items.jsonc';
import { resourceObjectService } from './ResourceObjectService';
import { itemService } from './ItemService';
import { buildingService } from './BuildingService';

const ITEMS_DATABASE = itemsData as unknown as import('../core/types').Item[];

// ===== WORK CONSTANTS =====

/** Work-points per turn a pawn delivers (base rate; later modifiable by stats). */
export const BASE_WORK_RATE = 1;

/** Designation types that produce harvest-category jobs. */
const HARVEST_DTYPES: DesignationType[] = ['harvest', 'woodcut', 'forage'];

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

        // --- Deconstruct jobs from buildings queued for demolition ---
        jobs = this._syncDeconstructJobs(jobs, gameState);

        // --- Craft jobs from crafting queue ---
        jobs = this._syncCraftJobs(jobs, gameState);

        // --- Phase 6: fuel-management jobs for campfires ---
        // Light jobs removed: campfires auto-light whenever they have fuel.
        // Stale light jobs are purged here in case of old save data.
        jobs = jobs.filter((j) => j.type !== 'light');
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

        if (job.type === 'deconstruct' && job.buildingId) {
            const newBuildings = (gameState.buildings ?? []).map((b) =>
                b.id === job.buildingId ? { ...b, deconstructWorkDone: newWorkDone } : b
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
        // Remove harvest jobs whose exact designated tile no longer permits harvesting,
        // or whose resource is gone.
        jobs = jobs.filter((j) => {
            if (j.type !== 'harvest') return true;
            const designationType = gs.designations?.[`${j.targetX},${j.targetY}`];
            if (!designationType || !HARVEST_DTYPES.includes(designationType)) return false;
            if (!this._resourceMatchesDesignation(designationType, j.resourceId ?? '')) return false;
            if (!this._resourceMatchesFilter(designationType, j.resourceId ?? '', gs, `${j.targetX},${j.targetY}`)) return false;
            const tile = gs.worldMap[j.targetY]?.[j.targetX];
            return (tile?.resources?.[j.resourceId ?? ''] ?? 0) > 0;
        });

        // Add harvest jobs only for designated tiles that currently hold matching resources.
        for (const [key, dtype] of Object.entries(gs.designations ?? {})) {
            if (!HARVEST_DTYPES.includes(dtype)) continue;
            const [x, y] = key.split(',').map(Number);
            const tile = gs.worldMap[y]?.[x];
            if (!tile) continue;

            for (const [resourceId, amount] of Object.entries(tile.resources ?? {})) {
                if ((amount ?? 0) <= 0) continue;
                if (!this._resourceMatchesDesignation(dtype, resourceId)) continue;
                if (!this._resourceMatchesFilter(dtype, resourceId, gs, key)) continue;

                const exists = jobs.some(
                    (j) =>
                        j.type === 'harvest' &&
                        j.targetX === x &&
                        j.targetY === y &&
                        j.resourceId === resourceId
                );
                if (exists) continue;

                jobs.push({
                    id: `harvest-${x}-${y}-${resourceId}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                    type: 'harvest',
                    targetX: x,
                    targetY: y,
                    resourceId,
                    workRequired: resourceObjectService.getWorkAmount(resourceId, dtype as DesignationType),
                    workDone: 0,
                    claimedBy: null
                });
            }
        }

        return jobs;
    }

    private _syncDeconstructJobs(jobs: Job[], gs: GameState): Job[] {
        // Remove deconstruct jobs for buildings no longer queued or already gone
        jobs = jobs.filter((j) => {
            if (j.type !== 'deconstruct') return true;
            const b = (gs.buildings ?? []).find((b) => b.id === j.buildingId);
            return b && b.deconstructQueued === true;
        });

        // Add new deconstruct jobs for buildings freshly queued
        for (const building of gs.buildings ?? []) {
            if (!building.deconstructQueued) continue;
            const exists = jobs.some((j) => j.type === 'deconstruct' && j.buildingId === building.id);
            if (!exists) {
                jobs.push({
                    id: `deconstruct-${building.id}-${Date.now()}`,
                    type: 'deconstruct',
                    targetX: building.x,
                    targetY: building.y,
                    buildingId: building.id,
                    workRequired: building.deconstructWorkRequired ?? 1,
                    workDone: building.deconstructWorkDone ?? 0,
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
            case 'deconstruct':
                state = this._completeDeconstruct(job, state);
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

        // Pick the interaction matching the current designation type on this tile.
        const def = resourceObjectService.getById(job.resourceId);
        const designationType = (gs.designations ?? {})[`${job.targetX},${job.targetY}`] as DesignationType | undefined;
        const interaction = def
            ? (resourceObjectService.getInteractionByDesignationType(
                  job.resourceId,
                  designationType ?? 'harvest'
              ) ?? def.interaction)
            : undefined;

        // A persistent node stays on the map after harvesting (yields regrow via cooldown).
        // A node with harvestDepletes:true is removed permanently when cut (e.g. woodcut).
        const shouldPersist =
            interaction?.persistent === true && interaction?.harvestDepletes !== true;

        // Determine which yields are currently available (their per-yield cooldowns may be active).
        // Compound cooldown keys are formatted as "resourceId:itemId".
        let availableItemIds: Set<string> | undefined;
        if (shouldPersist && def && interaction) {
            const currentCooldowns = tile.resourceCooldowns ?? {};
            const yieldHasPerItemCooldowns = interaction.yields.some((y) => y.regrowthTurns !== undefined);
            if (yieldHasPerItemCooldowns) {
                availableItemIds = new Set<string>();
                for (const y of interaction.yields) {
                    const key = `${job.resourceId}:${y.itemId}`;
                    if (!(key in currentCooldowns)) {
                        availableItemIds.add(y.itemId);
                    }
                }
            }
        }

        const pawn = gs.pawns.find((p) => p.id === job.claimedBy);
        const yields = resourceObjectService.calculateYield(job.resourceId, pawn, availableItemIds, designationType);
        const yieldEntries = Object.entries(yields);

        // Build updated tile — zero resources + set per-yield or interaction-level cooldowns.
        const newWorldMap = gs.worldMap.map((row, ry) =>
            ry === job.targetY
                ? row.map((col, rx) => {
                    if (rx !== job.targetX) return col;
                    const updatedResources = { ...col.resources, [job.resourceId!]: 0 };
                    if (!shouldPersist) return { ...col, resources: updatedResources };

                    const newCooldowns = { ...(col.resourceCooldowns ?? {}) };
                    const yieldHasPerItemCooldowns = interaction!.yields.some((y) => y.regrowthTurns !== undefined);

                    if (yieldHasPerItemCooldowns) {
                        // Per-yield compound keys: "resourceId:itemId" → turn
                        for (const y of interaction!.yields) {
                            if (y.regrowthTurns && (availableItemIds?.has(y.itemId) ?? true)) {
                                newCooldowns[`${job.resourceId!}:${y.itemId}`] = gs.turn + y.regrowthTurns;
                            }
                        }
                    } else if (interaction?.regrowthTurns) {
                        // Simple whole-resource cooldown
                        newCooldowns[job.resourceId!] = gs.turn + interaction.regrowthTurns;
                    }

                    return { ...col, resources: updatedResources, resourceCooldowns: newCooldowns };
                })
                : row
        );

        // Spawn one DroppedItem per yield type
        const newDropped = [...(gs.droppedItems ?? [])];
        for (const [dropResourceId, dropAmount] of yieldEntries) {
            const drop: DroppedItem = {
                id: `drop-${dropResourceId}-${job.targetX}-${job.targetY}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                resourceId: dropResourceId,
                x: job.targetX,
                y: job.targetY,
                quantity: dropAmount
            };
            newDropped.push(drop);
            console.log(
                `[JobService] Harvest complete: ${job.resourceId} at (${job.targetX},${job.targetY}) → ${dropResourceId} x${dropAmount}${shouldPersist ? ' (persistent)' : ''}`
            );
        }
        return { ...gs, worldMap: newWorldMap, droppedItems: newDropped };
    }

    private _syncHaulJobs(jobs: Job[], gs: GameState): Job[] {
        // Only consider non-stored drops (stored = already in stockpile)
        const allDrops = (gs.droppedItems ?? []).filter((d) => !d.stored);
        // Apply stockpile zone filter — prefer per-instance filters, fall back to legacy zoneFilters.
        const stockpileInstances = (gs.zoneInstances ?? []).filter((z) => z.type === 'stockpile');
        const drops = allDrops.filter((d) => {
            if (stockpileInstances.length > 0) {
                return stockpileInstances.some((inst) => {
                    if (inst.filter.allowedCategories.length === 0) return true;
                    return this._itemMatchesFilter(d.resourceId, inst.filter);
                });
            }
            const legacyFilter = gs.zoneFilters?.['stockpile'];
            if (!legacyFilter || legacyFilter.allowedCategories.length === 0) return true;
            return this._itemMatchesFilter(d.resourceId, legacyFilter);
        });
        console.log(`[HAUL-SYNC] drops on ground: ${drops.length}`, drops.map(d => `${d.id}(${d.resourceId}×${d.quantity})`));

        // Haul jobs only make sense when there is a stockpile zone to deliver to.
        const stockpileTiles = Object.entries(gs.designations ?? {}).filter(([, t]) => t === 'stockpile');
        if (stockpileTiles.length === 0) {
            // Remove any leftover haul jobs and skip creation
            const pruned = jobs.filter((j) => j.type !== 'haul');
            if (pruned.length !== jobs.length) console.log('[HAUL-SYNC] no stockpile zone — removed all haul jobs');
            return pruned;
        }

        // Count free stockpile tiles (not occupied by a stored item)
        const usedCoords = new Set(
            (gs.droppedItems ?? []).filter((d) => d.stored).map((d) => `${d.x},${d.y}`)
        );
        // A tile is "available" if it's free OR already holds the same resource (can stack)
        const storedResourceIds = new Set(
            (gs.droppedItems ?? []).filter((d) => d.stored).map((d) => d.resourceId)
        );
        const freeTileCount = stockpileTiles.filter(([key]) => !usedCoords.has(key)).length;
        // Total capacity = free tiles + tiles that can accept more of an already-stored type
        const canAccept = freeTileCount + storedResourceIds.size;

        // Remove haul jobs whose dropped item no longer exists
        jobs = jobs.filter((j) => {
            if (j.type !== 'haul') return true;
            const stillExists = drops.some((d) => d.id === j.droppedItemId);
            if (!stillExists) console.log(`[HAUL-SYNC] pruned stale haul job ${j.id}`);
            return stillExists;
        });

        // Count active haul jobs to avoid scheduling more than we have capacity for
        const activeHaulCount = jobs.filter((j) => j.type === 'haul').length;

        // Add haul jobs for dropped items that have no job yet, up to available capacity
        for (const drop of drops) {
            if (activeHaulCount >= canAccept) break; // stockpile full
            const exists = jobs.some((j) => j.type === 'haul' && j.droppedItemId === drop.id);
            if (!exists) {
                console.log(`[HAUL-SYNC] creating haul job for drop ${drop.id} (${drop.resourceId}×${drop.quantity})`);
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
                console.log(`[HAUL-COMPLETE] ${p.name} picked up ${drop.resourceId}×${drop.quantity} — inventory now:`, JSON.stringify(newItems));
                return { ...p, inventory: { ...inv, items: newItems, currentSlots } };
            });
            return { ...gs, droppedItems: newDropped, pawns: newPawns };
        }
        console.warn(`[HAUL-COMPLETE] no claimedBy on haul job ${job.id} — dropping straight to stockpile`);

        // No pawn claimed it (shouldn't happen) — fall back to stockpile and item
        const newStockpile = { ...(gs.stockpile ?? {}) };
        newStockpile[drop.resourceId] = (newStockpile[drop.resourceId] ?? 0) + drop.quantity;
        const baseState = { ...gs, droppedItems: newDropped, stockpile: newStockpile };
        return itemService.addItems({ [drop.resourceId]: drop.quantity }, baseState);
    }

    private _completeDeconstruct(job: Job, gs: GameState): GameState {
        if (!job.buildingId) return gs;
        const building = (gs.buildings ?? []).find((b) => b.id === job.buildingId);
        if (!building) return gs;

        // Refund 50% of building cost to stockpile
        const def = buildingService.getBuildingById(building.type);
        const newStockpile = { ...(gs.stockpile ?? {}) };
        if (def?.buildingCost) {
            for (const [itemId, cost] of Object.entries(def.buildingCost)) {
                const refund = Math.floor(Number(cost) * 0.5);
                if (refund > 0) newStockpile[itemId] = (newStockpile[itemId] ?? 0) + refund;
            }
        }

        // Keep buildingCounts in sync
        const newCounts = { ...(gs.buildingCounts ?? {}) };
        if (newCounts[building.type]) {
            newCounts[building.type] = Math.max(0, newCounts[building.type] - 1);
        }

        console.log(`[JobService] Deconstruction complete: ${building.type} (${building.id})`);
        return {
            ...gs,
            stockpile: newStockpile,
            buildingCounts: newCounts,
            buildings: (gs.buildings ?? []).filter((b) => b.id !== job.buildingId)
        };
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

    /** Phase 6: generate 'refuel' jobs for campfires that are not at max fuel. */
    private _syncRefuelJobs(jobs: Job[], gs: GameState): Job[] {
        const totalFuel = this._totalFuelInStockpile(gs);

        // Remove refuel jobs whose building is gone, at max, or stockpile no longer
        // has enough fuel to fill to max (prevents partial top-ups).
        jobs = jobs.filter((j) => {
            if (j.type !== 'refuel') return true;
            const b = (gs.buildings ?? []).find((b) => b.id === j.buildingId);
            if (!b || b.status !== 'complete') return false;
            const maxFuel = buildingService.getBuildingById(b.type)?.maxFuel ?? 60;
            const needed = maxFuel - (b.fuel ?? 0);
            return needed > 0 && totalFuel >= needed;
        });

        for (const b of gs.buildings ?? []) {
            if (b.status !== 'complete') continue;
            const bDef = buildingService.getBuildingById(b.type);
            if (!bDef?.maxFuel) continue;
            const needed = bDef.maxFuel - (b.fuel ?? 0);
            if (needed <= 0) continue;
            // Only queue refuel when stockpile can fully top up the tank.
            if (totalFuel < needed) continue;
            const exists = jobs.some((j) => j.type === 'refuel' && j.buildingId === b.id);
            if (!exists) {
                jobs.push({
                    id: `refuel-${b.id}-${Date.now()}`,
                    type: 'refuel',
                    targetX: b.x,
                    targetY: b.y,
                    buildingId: b.id,
                    workRequired: 5,
                    workDone: 0,
                    claimedBy: null
                });
            }
        }
        return jobs;
    }

    private _completeLight(job: Job, gs: GameState): GameState {
        if (!job.buildingId) return gs;
        // Campfires auto-light from fuel — no firestarter required.
        const newBuildings = (gs.buildings ?? []).map((b) =>
            b.id === job.buildingId ? { ...b, lit: true } : b
        );
        console.log(`[JobService] Campfire lit: ${job.buildingId}`);
        return { ...gs, buildings: newBuildings };
    }

    private _completeRefuel(job: Job, gs: GameState): GameState {
        if (!job.buildingId) return gs;
        const building = (gs.buildings ?? []).find((b) => b.id === job.buildingId);
        if (!building) return gs;
        const maxFuel = buildingService.getBuildingById(building.type)?.maxFuel ?? 60;
        const stockpile = { ...(gs.stockpile ?? {}) };
        let currentFuel = building.fuel ?? 0;
        // Consume fuel items until tank is full or stockpile exhausted
        for (const item of ITEMS_DATABASE) {
            if ((item.fuelValue ?? 0) <= 0) continue;
            while (currentFuel < maxFuel) {
                const available = stockpile[item.id] ?? 0;
                if (available <= 0) break;
                stockpile[item.id] = available - 1;
                currentFuel = Math.min(currentFuel + item.fuelValue!, maxFuel);
            }
        }
        if (currentFuel === (building.fuel ?? 0)) return gs; // nothing added
        const newBuildings = (gs.buildings ?? []).map((b) =>
            b.id === job.buildingId
                ? { ...b, fuel: currentFuel, lit: currentFuel > 0 }
                : b
        );
        console.log(`[JobService] Campfire refuelled to ${currentFuel}/${maxFuel}: ${job.buildingId}`);
        return { ...gs, buildings: newBuildings, stockpile };
    }

    private _hasFuelInStockpile(gs: GameState): boolean {
        const stockpile = gs.stockpile ?? {};
        return ITEMS_DATABASE.some(
            (item) => (item.fuelValue ?? 0) > 0 && (stockpile[item.id] ?? 0) > 0
        );
    }

    private _totalFuelInStockpile(gs: GameState): number {
        const stockpile = gs.stockpile ?? {};
        return ITEMS_DATABASE.reduce((sum, item) => {
            if ((item.fuelValue ?? 0) <= 0) return sum;
            return sum + (stockpile[item.id] ?? 0) * item.fuelValue!;
        }, 0);
    }

    private _resourceMatchesDesignation(
        designationType: DesignationType,
        resourceId: string
    ): boolean {
        if (!HARVEST_DTYPES.includes(designationType)) return false;
        const def = resourceObjectService.getById(resourceId);
        if (!def) return true;
        return def.designationTypes.includes(designationType);
    }

    /**
     * Returns false if the zone's filter excludes this tile resource.
     * A resource passes if at least one of its yielded items falls in allowedCategories
     * and is not in blockedItems.
     */
    private _resourceMatchesFilter(
        designationType: DesignationType,
        resourceId: string,
        gs: GameState,
        tileKey?: string
    ): boolean {
        let filter: import('../core/types').ZoneFilter | undefined;
        if (tileKey) {
            const instanceId = gs.designationZoneId?.[tileKey];
            if (instanceId) {
                const inst = (gs.zoneInstances ?? []).find((z) => z.id === instanceId);
                filter = inst?.filter;
            }
        }
        filter = filter ?? gs.zoneFilters?.[designationType as import('$lib/game/core/types.js').FilterableZoneType];
        if (!filter || filter.allowedCategories.length === 0) return true;
        const def = resourceObjectService.getById(resourceId);
        if (!def) return true;
        const interaction =
            resourceObjectService.getInteractionByDesignationType(resourceId, designationType) ??
            def.interaction;
        return interaction.yields.some((y) => this._itemMatchesFilter(y.itemId, filter!));
    }

    /** Check whether a single item ID passes a ZoneFilter. */
    private _itemMatchesFilter(
        itemId: string,
        filter: ZoneFilter
    ): boolean {
        if (filter.blockedItems.includes(itemId)) return false;
        const item = ITEMS_DATABASE.find((i) => i.id === itemId);
        return item ? filter.allowedCategories.includes(item.category) : false;
    }

    // ------------------------------------------------------------------ //
    // PRIVATE — HELPERS                                                   //
    // ------------------------------------------------------------------ //
    // PUBLIC HELPERS                                                       //
    // ------------------------------------------------------------------ //

    /**
     * Return the labor priority level (0–4) this pawn has assigned to the given job.
     * 0 = disabled, 1 = low, 2 = normal (default), 3 = high, 4 = critical.
     */
    getJobLaborLevel(job: Job, pawn: Pawn, gs: GameState): number {
        const assignment = gs.workAssignments?.[pawn.id];
        const laborSettings = assignment?.laborSettings ?? {};
        const legacyPriorities = assignment?.workPriorities ?? {};
        const workKey = this._jobTypeToWorkKey(job, gs);
        if (workKey in laborSettings) return laborSettings[workKey] ?? 2;
        if (workKey in legacyPriorities) return Math.max(0, Math.min(4, legacyPriorities[workKey]));
        return 2; // LABOR_LEVEL.NORMAL default
    }

    // ------------------------------------------------------------------ //

    /** Map Job to the work category key used in WorkAssignment.laborSettings */
    private _jobTypeToWorkKey(job: Job, gs?: GameState): string {
        switch (job.type) {
            case 'harvest': {
                const designationType = gs
                    ? ((gs.designations ?? {})[`${job.targetX},${job.targetY}`] as DesignationType | undefined)
                    : undefined;
                const def = resourceObjectService.getById(job.resourceId ?? '');
                const interaction = designationType && def
                    ? (resourceObjectService.getInteractionByDesignationType(job.resourceId ?? '', designationType) ?? def.interaction)
                    : def?.interaction;
                return interaction?.workCategory ?? 'foraging';
            }
            case 'construct':
                return 'construction';
            case 'deconstruct':
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
