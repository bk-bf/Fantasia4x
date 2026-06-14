import type { Pawn, GameState, WorkCategory, LaborLevel } from '../core/types';
import { WORK_CATEGORIES } from '../core/Work';
import { jobService } from './JobService';
// Shadow the global console with a gated shim: log/debug/info/warn are silent in
// normal play (toggle via gameDebug(true)); console.error still surfaces. This
// removes the per-tick logging that profiling showed was ~75% of turn cost.
import { gatedConsole as console } from '../core/log';

/**
 * R7: FSM states in which a pawn is engaged in the productive work loop (so `isWorking` is true).
 * Derived from the real state machine — NOT the dead legacy workPriorities sort.
 */
const WORK_LOOP_STATES = new Set([
  'Working',
  'MovingToResource',
  'Hauling',
  'MovingToDeposit',
  'Hunting'
]);

/**
 * WorkService - Clean interface for work assignment and management
 * Separates business logic from data definitions
 *
 * Work speed/yield/quality is NOT computed here — it lives entirely in the
 * stats.jsonc model (pawnStatService.getWorkModifiers). See ADR in DECISIONS.md.
 */
export interface WorkService {
  // Query Methods
  getWorkCategory(workId: string): WorkCategory | undefined;
  getAllWorkCategories(): WorkCategory[];

  // Assignment Methods
  assignPawnToWork(pawnId: string, workType: string, gameState: GameState): GameState;
  updateWorkPriorities(
    pawnId: string,
    priorities: Record<string, number>,
    gameState: GameState
  ): GameState;

  // Work State Synchronization (derived from the FSM/job system; once per tick)
  syncPawnWorkingStates(gameState: GameState): GameState;

  // Work Assignment Initialization (applied ONCE at game init, not per tick)
  ensureDefaultWorkAssignments(gameState: GameState): GameState;
}

/**
 * WorkService Implementation
 */
export class WorkServiceImpl implements WorkService {
  getWorkCategory(workId: string): WorkCategory | undefined {
    return WORK_CATEGORIES.find((work) => work.id === workId);
  }

  getAllWorkCategories(): WorkCategory[] {
    return [...WORK_CATEGORIES];
  }

  assignPawnToWork(pawnId: string, workType: string, gameState: GameState): GameState {
    const newState = { ...gameState };

    // Initialize work assignments if not exists
    if (!newState.workAssignments) {
      newState.workAssignments = {};
    }

    // Create or update work assignment
    const currentAssignment = newState.workAssignments[pawnId] || {
      pawnId,
      workPriorities: {}
    };

    newState.workAssignments[pawnId] = {
      ...currentAssignment,
      currentWork: workType,
      workPriorities: {
        ...currentAssignment.workPriorities,
        [workType]: 10 // High priority for assigned work
      }
    };

    return newState;
  }

  updateWorkPriorities(
    pawnId: string,
    priorities: Record<string, number>,
    gameState: GameState
  ): GameState {
    const newState = { ...gameState };

    if (!newState.workAssignments) {
      newState.workAssignments = {};
    }

    const currentAssignment = newState.workAssignments[pawnId] || {
      pawnId,
      workPriorities: {}
    };

    newState.workAssignments[pawnId] = {
      ...currentAssignment,
      workPriorities: { ...priorities }
    };

    return newState;
  }

  // ============ Work State Synchronization Methods ============

  /**
   * R7: derive each pawn's `isWorking` flag and `currentWork` (display) label from the REAL FSM
   * state + active job — the JobService/state-machine is the source of truth. The old version read
   * the dead legacy `workPriorities` map (always empty under `laborSettings`), so `currentWork` was
   * always `'foraging'` fiction and `isWorking` ≈ "not eating/sleeping". Now: `isWorking` = the pawn
   * is in a work-loop state (not on a break); `currentWork` = its active job's work category, or
   * `undefined`. Immutable (ADR-002); runs ONCE per tick (the duplicate call was removed).
   */
  syncPawnWorkingStates(gameState: GameState): GameState {
    const workAssignments = { ...(gameState.workAssignments ?? {}) };
    let assignmentsChanged = false;

    // M2: mutate `isWorking` in place (leaf transform); only realloc the array if a flag flipped.
    let pawnsChanged = false;
    for (const pawn of gameState.pawns) {
      const inWorkLoop =
        WORK_LOOP_STATES.has(pawn.currentState ?? 'Idle') &&
        !pawn.state.isEating &&
        !pawn.state.isSleeping;

      // Real current-work label from the active job (harvest→woodcutting, craft→crafting, …);
      // `need`-type jobs (eat/sleep/drink/deposit) and idle pawns have no work category.
      const job = pawn.activeJob;
      const currentWork =
        job && job.type !== 'need' ? jobService.getJobWorkCategory(job, gameState) : undefined;

      const assignment = workAssignments[pawn.id];
      if (assignment && assignment.currentWork !== currentWork) {
        workAssignments[pawn.id] = { ...assignment, currentWork };
        assignmentsChanged = true;
      }

      if (pawn.state.isWorking !== inWorkLoop) {
        pawn.state.isWorking = inWorkLoop;
        pawnsChanged = true;
      }
    }

    return {
      ...gameState,
      ...(pawnsChanged ? { pawns: gameState.pawns.slice() } : {}),
      ...(assignmentsChanged ? { workAssignments } : {})
    };
  }

  /** Default labor settings for a fresh pawn: every work category at "normal" (level 2). */
  private createDefaultLaborSettings(): Record<string, LaborLevel> {
    const settings: Record<string, LaborLevel> = {};
    for (const wc of WORK_CATEGORIES) settings[wc.id] = 2;
    return settings;
  }

  /**
   * Give every pawn that lacks a work assignment explicit default labor settings.
   * Replaces the old per-tick `ensureBasicWorkAssignments`: this is meant to run ONCE
   * at game init / load (see gameState.ts), so the hot tick path no longer re-asserts
   * assignments 60×/sec. Returns the same state when nothing changed (immutable — ADR-002).
   */
  ensureDefaultWorkAssignments(gameState: GameState): GameState {
    const workAssignments = { ...(gameState.workAssignments ?? {}) };
    let changed = false;
    for (const pawn of gameState.pawns) {
      if (!workAssignments[pawn.id]) {
        workAssignments[pawn.id] = {
          pawnId: pawn.id,
          workPriorities: {},
          laborSettings: this.createDefaultLaborSettings()
        };
        changed = true;
      }
    }
    return changed ? { ...gameState, workAssignments } : gameState;
  }
}

// Export singleton instance
export const workService = new WorkServiceImpl();
