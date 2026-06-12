import type { Pawn, GameState, WorkAssignment, WorkCategory, LaborLevel } from '../core/types';
import { WORK_CATEGORIES } from '../core/Work';
// Shadow the global console with a gated shim: log/debug/info/warn are silent in
// normal play (toggle via gameDebug(true)); console.error still surfaces. This
// removes the per-tick logging that profiling showed was ~75% of turn cost.
import { gatedConsole as console } from '../core/log';

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

  // Work State Synchronization Methods
  syncPawnWorkingStates(gameState: GameState): GameState;
  getAvailableWorkForPawn(
    pawn: Pawn,
    workAssignment: WorkAssignment,
    gameState: GameState
  ): string | null;
  canPawnDoWorkByType(
    pawn: Pawn,
    workType: string,
    workAssignment: WorkAssignment,
    gameState: GameState
  ): boolean;

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

  syncPawnWorkingStates(gameState: GameState): GameState {
    console.debug('[WorkService] Syncing pawn working states with work assignments');

    // D6/ADR-002: build new objects rather than mutating the assignment/pawn objects held
    // inside GameState. In-place mutation here leaked into the UI's "immutable" snapshot and
    // defeated change detection.
    const workAssignments = { ...gameState.workAssignments };
    let assignmentsChanged = false;

    const updatedPawns = gameState.pawns.map((pawn) => {
      let workAssignment = workAssignments[pawn.id];

      if (workAssignment) {
        // Update currentWork based on highest priority work the pawn can actually do
        const availableWork = this.getAvailableWorkForPawn(pawn, workAssignment, gameState);
        if (availableWork && availableWork !== workAssignment.currentWork) {
          workAssignment = { ...workAssignment, currentWork: availableWork };
          workAssignments[pawn.id] = workAssignment;
          assignmentsChanged = true;
        }
      }

      // Determine if pawn should be working
      const shouldBeWorking = !!(
        workAssignment &&
        workAssignment.currentWork &&
        !pawn.state.isEating &&
        !pawn.state.isSleeping
      );

      // Update pawn state if it doesn't match
      if (pawn.state.isWorking !== shouldBeWorking) {
        return {
          ...pawn,
          state: { ...pawn.state, isWorking: shouldBeWorking }
        };
      }

      return pawn;
    });

    return {
      ...gameState,
      pawns: updatedPawns,
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

  getAvailableWorkForPawn(
    pawn: Pawn,
    workAssignment: WorkAssignment,
    gameState: GameState
  ): string | null {
    if (!workAssignment.workPriorities) {
      return 'foraging'; // Default fallback
    }

    // Get work types sorted by priority (highest first)
    const sortedWork = Object.entries(workAssignment.workPriorities)
      .filter(([_, priority]) => (priority as number) > 0)
      .sort((a, b) => (b[1] as number) - (a[1] as number));

    console.debug(`[WorkService] ${pawn.name} work priorities:`, sortedWork);

    // Find the highest priority work that the pawn can actually do
    for (const [workType, priority] of sortedWork) {
      if (this.canPawnDoWorkByType(pawn, workType, workAssignment, gameState)) {
        console.debug(`[WorkService] ${pawn.name} should do ${workType} (priority ${priority})`);
        return workType;
      }
    }

    // Fallback to foraging if nothing else is available
    return 'foraging';
  }

  canPawnDoWorkByType(
    pawn: Pawn,
    workType: string,
    workAssignment: WorkAssignment,
    gameState: GameState
  ): boolean {
    // Get work category info
    const workCategory = WORK_CATEGORIES.find((w) => w.id === workType);
    if (!workCategory) {
      console.log(`[WorkService] Unknown work type: ${workType}`);
      return false;
    }

    // D5: tool gating is NOT enforced here. The old "check" only logged the requirement
    // and always passed, which misled readers into thinking tools were gated. Per ADR-009,
    // tool requirements belong at job-claim time against the pawn's claimed inventory
    // (JobService) — not against the global stockpile here. Until that lands, do not pretend.

    console.debug(`[WorkService] ${pawn.name} can do ${workType}`);
    return true;
  }
}

// Export singleton instance
export const workService = new WorkServiceImpl();
