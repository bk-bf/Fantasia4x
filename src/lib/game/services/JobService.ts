import type { DesignationType, DroppedItem, GameState, Job, JobDef, Pawn } from '../core/types';
import { manhattan } from '../core/util/distance';
import { WORK_CATEGORIES } from '../core/defs/work';
import { applyWorkXp, workXpForJob, SKILL_CATEGORIES, workSkillCategory } from '../core/rules/body/workExperience';
import jobsData from '../database/pawns/jobs.jsonc';
import { resourceObjectService } from './ResourceObjectService';
import { itemService } from './ItemService';
import { recipeService } from './RecipeService';
import * as harvest from './jobs/harvest';
import * as haul from './jobs/haul';
import * as construct from './jobs/construct';
import * as deconstruct from './jobs/deconstruct';
import * as fetch from './jobs/fetch';
import * as fill from './jobs/fill';
import * as craft from './jobs/craft';
import * as caretake from './jobs/caretake';
import * as rescue from './jobs/rescue';
import * as refuel from './jobs/refuel';
import * as repair from './jobs/repair';
import * as plant from './jobs/plant';
import { isOrderSupplied as stagingIsOrderSupplied } from './jobs/staging';
import { craftWorkCategory, craftDiscipline } from './jobs/craftDiscipline';
import {
  DISCIPLINE_PARENTS,
  DISCIPLINE_LEAVES,
  DISCIPLINE_SPLIT_PARENTS,
  disciplineLeaves,
  DISCIPLINE_LABEL
} from '../core/defs/disciplines';

const JOB_DEFS = jobsData as unknown as JobDef[];
const JOB_DEF_BY_ID = new Map<string, JobDef>(JOB_DEFS.map((d) => [d.id, d]));

const SUBJOBS_BY_CATEGORY: Map<string, string[]> = (() => {
  const m = new Map<string, string[]>();
  for (const def of JOB_DEFS) {
    if (!def.workCategory || def.workCategorySource) continue;
    const arr = m.get(def.workCategory) ?? [];
    arr.push(def.id);
    m.set(def.workCategory, arr);
  }
  for (const parent of DISCIPLINE_PARENTS) {
    const leaves = disciplineLeaves(parent);
    if (leaves.length) m.set(parent, [...(m.get(parent) ?? []), ...leaves]);
  }
  return m;
})();

type JobPoolType =
  | 'harvest'
  | 'haul'
  | 'construct'
  | 'deconstruct'
  | 'fetch'
  | 'fill'
  | 'craft'
  | 'caretake'
  | 'rescue'
  | 'refuel'
  | 'repair'
  | 'plant';
type _AssertPoolSubset = JobPoolType extends Job['type'] ? true : never;
const _assertPoolSubset: _AssertPoolSubset = true;
void _assertPoolSubset;

type JobHandler = {
  generate: (jobs: Job[], gs: GameState) => Job[];
  complete: (job: Job, gs: GameState) => GameState;
};

type WorkKeyJob = {
  type: string;
  targetX: number;
  targetY: number;
  resourceId?: string;
  craftQueueId?: string;
};

export const BASE_WORK_RATE = 1;

class JobServiceImpl {
  private readonly handlers: Record<JobPoolType, JobHandler> = {
    harvest: { generate: harvest.generate, complete: harvest.complete },
    haul: { generate: haul.generate, complete: haul.complete },
    construct: { generate: construct.generate, complete: construct.complete },
    deconstruct: { generate: deconstruct.generate, complete: deconstruct.complete },
    fetch: { generate: fetch.generate, complete: fetch.complete },
    fill: { generate: fill.generate, complete: fill.complete },
    craft: { generate: craft.generate, complete: craft.complete },
    caretake: { generate: caretake.generate, complete: caretake.complete },
    rescue: { generate: rescue.generate, complete: rescue.complete },
    refuel: { generate: refuel.generate, complete: refuel.complete },
    repair: { generate: repair.generate, complete: repair.complete },
    plant: { generate: plant.generate, complete: plant.complete }
  };

  reservePendingCraftOrders(gameState: GameState): GameState {
    return craft.reservePendingOrders(gameState);
  }

  generateJobs(gameState: GameState): GameState {
    gameState = haul.reconcileEvictedDrops(gameState);

    let jobs: Job[] = [...(gameState.jobs ?? [])];

    for (const def of JOB_DEFS) {
      jobs = this.handlers[def.id as JobPoolType].generate(jobs, gameState);
    }

    jobs = jobs.filter((j) => j.type !== 'light');

    return { ...gameState, jobs };
  }

  claimJob(pawnId: string, jobId: string, gameState: GameState): GameState {
    const jobs = (gameState.jobs ?? []).map((j) =>
      j.id === jobId && (j.claimedBy === null || j.claimedBy === pawnId)
        ? { ...j, claimedBy: pawnId }
        : j
    );
    return { ...gameState, jobs };
  }

  releaseJob(pawnId: string, jobId: string, gameState: GameState): GameState {
    const jobs = (gameState.jobs ?? []).map((j) =>
      j.id === jobId && j.claimedBy === pawnId ? { ...j, claimedBy: null } : j
    );
    return { ...gameState, jobs };
  }

  advanceJob(jobId: string, workPoints: number, gameState: GameState): GameState {
    const jobIdx = (gameState.jobs ?? []).findIndex((j) => j.id === jobId);
    if (jobIdx < 0) return gameState;

    const job = gameState.jobs[jobIdx];
    const newWorkDone = job.workDone + workPoints;

    if (newWorkDone >= job.workRequired) {
      return this._completeJob(job, gameState);
    }

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

  getAvailableJobs(pawn: Pawn, gameState: GameState): Job[] {
    if (!pawn.position) return [];
    const { x: px, y: py } = pawn.position;

    const assignment = gameState.workAssignments?.[pawn.id];
    const laborSettings = assignment?.laborSettings ?? {};
    const legacyPriorities = assignment?.workPriorities ?? {};

    const available = (gameState.jobs ?? []).filter((j) => {
      if (j.claimedBy !== null && j.claimedBy !== pawn.id) return false;

      const claimGate = JOB_DEF_BY_ID.get(j.type)?.claimGate;

      if (claimGate === 'refuelAllowlist' && j.buildingId) {
        const building = (gameState.buildings ?? []).find((b) => b.id === j.buildingId);
        const allowedPawns = building?.fuelSettings?.allowedRefuelPawnIds ?? [];
        if (allowedPawns.length > 0 && !allowedPawns.includes(pawn.id)) return false;
      }

      if (claimGate === 'repairAllowlist' && j.buildingId) {
        const building = (gameState.buildings ?? []).find((b) => b.id === j.buildingId);
        const allowedPawns = building?.repairSettings?.allowedRepairPawnIds ?? [];
        if (allowedPawns.length > 0 && !allowedPawns.includes(pawn.id)) return false;
      }

      if (claimGate === 'harvestTool' || claimGate === 'craftTool') {
        const req = this.requiredToolForJob(j, gameState);
        if (
          req &&
          !this.pawnHasToolFor(pawn, req.workType, req.minTier) &&
          !this.colonyHasToolFor(gameState, req.workType, req.minTier)
        )
          return false;
      }

      const workKey = this._jobTypeToWorkKey(j, gameState);

      let priority: number;
      if (workKey in laborSettings) {
        priority = laborSettings[workKey] ?? 2;
      } else if (workKey in legacyPriorities) {
        priority = legacyPriorities[workKey];
      } else {
        priority = 2;
      }
      if (priority <= 0) return false;
      const subKey = this._jobSubKey(j, workKey, gameState);
      if (subKey !== workKey && subKey in laborSettings && (laborSettings[subKey] ?? 2) <= 0)
        return false;
      return true;
    });

    return available.sort((a, b) => {
      const urgA = a.urgent ? 1 : 0;
      const urgB = b.urgent ? 1 : 0;
      if (urgB !== urgA) return urgB - urgA;
      const workKeyA = this._jobTypeToWorkKey(a, gameState);
      const workKeyB = this._jobTypeToWorkKey(b, gameState);
      const labA = laborSettings[workKeyA] ?? 2;
      const labB = laborSettings[workKeyB] ?? 2;
      if (labB !== labA) return labB - labA;
      if (workKeyA === workKeyB) {
        const subKeyA = this._jobSubKey(a, workKeyA, gameState);
        const subKeyB = this._jobSubKey(b, workKeyB, gameState);
        const subA =
          subKeyA !== workKeyA && subKeyA in laborSettings ? (laborSettings[subKeyA] ?? 2) : labA;
        const subB =
          subKeyB !== workKeyB && subKeyB in laborSettings ? (laborSettings[subKeyB] ?? 2) : labB;
        if (subB !== subA) return subB - subA;
      }
      const dA = manhattan(a.targetX, a.targetY, px, py);
      const dB = manhattan(b.targetX, b.targetY, px, py);
      return dA - dB;
    });
  }

  private _jobSubKey(job: WorkKeyJob, categoryKey: string, gs?: GameState): string {
    const subs = SUBJOBS_BY_CATEGORY.get(categoryKey);
    if (!subs || subs.length <= 1) return categoryKey;
    if (job.type === 'craft') {
      const leaf = craftDiscipline(
        (gs?.craftingQueue ?? []).find((o) => o.id === job.craftQueueId)
      );
      return subs.includes(leaf) ? leaf : categoryKey;
    }
    return subs.includes(job.type) ? job.type : categoryKey;
  }

  isCraftSubjob(categoryId: string): boolean {
    return DISCIPLINE_LEAVES.has(categoryId);
  }

  isGroupingParent(categoryId: string): boolean {
    return DISCIPLINE_SPLIT_PARENTS.has(categoryId);
  }

  getSubjobsForCategory(categoryId: string): { id: string; label: string }[] {
    const subs = SUBJOBS_BY_CATEGORY.get(categoryId);
    if (!subs || subs.length <= 1) return [];
    return subs.map((id) => ({
      id,
      label: JOB_DEF_BY_ID.get(id)?.label ?? DISCIPLINE_LABEL.get(id) ?? id
    }));
  }

  selectJobForPawn(
    pawn: Pawn,
    gameState: GameState,
    opts: { isReachable: (jobId: string) => boolean; queueSize: number }
  ): { job: Job | null; queuePreview: string[] } {
    const availableJobs = this.getAvailableJobs(pawn, gameState);
    const job = availableJobs.find((j) => opts.isReachable(j.id)) ?? null;
    const queuePreview = [
      ...new Set(
        availableJobs
          .slice(1, 1 + opts.queueSize)
          .filter((j) => j.claimedBy === null)
          .map((j) => j.id)
      )
    ];
    return { job, queuePreview };
  }

  isOrderSupplied(order: import('../core/types').CraftingInProgress, gs: GameState): boolean {
    return stagingIsOrderSupplied(order, gs);
  }

  completeCraftOrder(entry: import('../core/types').CraftingInProgress, gs: GameState): GameState {
    return craft.completeCraftOrder(entry, gs);
  }

  private _completeJob(job: Job, gameState: GameState): GameState {
    const jobs = (gameState.jobs ?? []).filter((j) => j.id !== job.id);
    const state: GameState = { ...gameState, jobs };
    const handler = this.handlers[job.type as JobPoolType];
    return this._grantWorkXp(job, handler ? handler.complete(job, state) : state);
  }

  private _grantWorkXp(job: Job, state: GameState): GameState {
    if (!job.claimedBy) return state;
    const category = workSkillCategory(this.getJobWorkStatKey(job, state));
    if (!category || !SKILL_CATEGORIES.includes(category)) return state;
    const idx = state.pawns.findIndex((p) => p.id === job.claimedBy);
    if (idx < 0) return state;
    const next = applyWorkXp(state.pawns[idx], category, workXpForJob(job.workRequired));
    if (!next) return state;
    const pawns = [...state.pawns];
    pawns[idx] = next;
    return { ...state, pawns };
  }

  getJobLaborLevel(job: Job, pawn: Pawn, gs: GameState): number {
    const assignment = gs.workAssignments?.[pawn.id];
    const laborSettings = assignment?.laborSettings ?? {};
    const legacyPriorities = assignment?.workPriorities ?? {};
    const workKey = this._jobTypeToWorkKey(job, gs);
    if (workKey in laborSettings) return laborSettings[workKey] ?? 2;
    if (workKey in legacyPriorities) return Math.max(0, Math.min(4, legacyPriorities[workKey]));
    return 2;
  }

  getJobWorkCategory(job: WorkKeyJob, gs?: GameState): string {
    return this._jobTypeToWorkKey(job, gs);
  }

  getJobWorkStatKey(job: WorkKeyJob, gs?: GameState): string {
    return this._jobSubKey(job, this._jobTypeToWorkKey(job, gs), gs);
  }

  isJobLightAffected(type: string): boolean {
    return JOB_DEF_BY_ID.get(type)?.lightAffected !== false;
  }

  getJobLabel(type: string): string | undefined {
    return JOB_DEF_BY_ID.get(type)?.label;
  }

  getJobAudio(type: string): string | undefined {
    return JOB_DEF_BY_ID.get(type)?.audio;
  }

  jobTypeIds(): string[] {
    return Object.keys(this.handlers);
  }

  requiredToolForJob(job: Job, gs: GameState): { workType: string; minTier: number } | null {
    if (job.type === 'craft' || job.craftQueueId) {
      const order = (gs.craftingQueue ?? []).find((e) => e.id === job.craftQueueId);
      if (!order) return null;
      const recipe = order.recipeId
        ? recipeService.getRecipeById(order.recipeId)
        : recipeService.getRecipeForItem(order.item.id);
      const req = recipeService.toolRequirementForRecipe(recipe);
      if (!req) return null;
      const tools = WORK_CATEGORIES.find((w) => w.id === req.workType)?.toolsRequired ?? [];
      if (tools.length === 0) return null;
      return req;
    }
    if (!job.resourceId) return null;
    const def = resourceObjectService.getById(job.resourceId);
    if (!def) return null;
    const dtype = (gs.designations ?? {})[`${job.targetX},${job.targetY}`] as
      | DesignationType
      | undefined;
    const interaction =
      (dtype
        ? resourceObjectService.getInteractionByDesignationType(job.resourceId, dtype)
        : undefined) ?? def.interaction;
    const req = interaction?.toolRequirement;
    if (!req) return null;
    const tools = WORK_CATEGORIES.find((w) => w.id === req.workType)?.toolsRequired ?? [];
    if (tools.length === 0) return null;
    return { workType: req.workType, minTier: req.minTier ?? 1 };
  }

  private _qualifyingToolIds(workType: string, minTier: number): string[] {
    const tools = WORK_CATEGORIES.find((w) => w.id === workType)?.toolsRequired ?? [];
    return tools.filter(
      (id) => ((itemService.getItemById(id) as { tier?: number } | undefined)?.tier ?? 1) >= minTier
    );
  }

  pawnHasToolFor(pawn: Pawn, workType: string, minTier: number): boolean {
    const ids = this._qualifyingToolIds(workType, minTier);
    if (ids.length === 0) return false;
    if (Object.values(pawn.equipment ?? {}).some((inst) => inst && ids.includes(inst.itemId)))
      return true;
    if ((pawn.inventory?.instances ?? []).some((inst) => ids.includes(inst.itemId))) return true;
    const bulk = pawn.inventory?.items ?? {};
    return ids.some((id) => (bulk[id] ?? 0) > 0);
  }

  colonyHasToolFor(gs: GameState, workType: string, minTier: number): boolean {
    return this._qualifyingToolIds(workType, minTier).some((id) => (gs.stockpile?.[id] ?? 0) > 0);
  }

  findStockToolDropFor(
    gs: GameState,
    workType: string,
    minTier: number,
    near?: { x: number; y: number }
  ): DroppedItem | null {
    const ids = new Set(this._qualifyingToolIds(workType, minTier));
    if (ids.size === 0) return null;
    let best: DroppedItem | null = null;
    let bestD = Infinity;
    for (const d of gs.droppedItems ?? []) {
      if (!d.stored || (d.quantity ?? 0) <= 0 || d.reservedFor) continue;
      if (!ids.has(d.resourceId)) continue;
      if (!near) return d;
      const dd = manhattan(d.x, d.y, near.x, near.y);
      if (dd < bestD) {
        bestD = dd;
        best = d;
      }
    }
    return best;
  }

  private _jobTypeToWorkKey(job: WorkKeyJob, gs?: GameState): string {
    const def = JOB_DEF_BY_ID.get(job.type);

    if (def?.workCategorySource === 'designation') {
      const designationType = gs
        ? ((gs.designations ?? {})[`${job.targetX},${job.targetY}`] as DesignationType | undefined)
        : undefined;
      const rdef = resourceObjectService.getById(job.resourceId ?? '');
      const interaction =
        designationType && rdef
          ? (resourceObjectService.getInteractionByDesignationType(
              job.resourceId ?? '',
              designationType
            ) ?? rdef.interaction)
          : rdef?.interaction;
      return interaction?.workCategory ?? 'foraging';
    }

    if (def?.workCategorySource === 'recipe-output') {
      return this.craftWorkCategory(
        (gs?.craftingQueue ?? []).find((o) => o.id === job.craftQueueId)
      );
    }

    return def?.workCategory ?? job.type;
  }

  craftWorkCategory(
    order: { item: { id: string }; stationType?: string | null } | undefined
  ): string {
    return craftWorkCategory(order);
  }
}

export const jobService = new JobServiceImpl();
