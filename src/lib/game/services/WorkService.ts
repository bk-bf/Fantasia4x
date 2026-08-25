import type { Pawn, GameState, WorkCategory, LaborLevel } from '../core/types';
import { WORK_CATEGORIES } from '../core/defs/work';
import { jobService } from './JobService';
import { gatedConsole as console } from '../core/util/log';

const WORK_LOOP_STATES = new Set([
  'Working',
  'MovingToResource',
  'Hauling',
  'MovingToDeposit',
  'Hunting'
]);

export interface WorkService {
  getWorkCategory(workId: string): WorkCategory | undefined;
  getAllWorkCategories(): WorkCategory[];

  assignPawnToWork(pawnId: string, workType: string, gameState: GameState): GameState;
  updateWorkPriorities(
    pawnId: string,
    priorities: Record<string, number>,
    gameState: GameState
  ): GameState;

  syncPawnWorkingStates(gameState: GameState): GameState;

  ensureDefaultWorkAssignments(gameState: GameState): GameState;
}

export class WorkServiceImpl implements WorkService {
  getWorkCategory(workId: string): WorkCategory | undefined {
    return WORK_CATEGORIES.find((work) => work.id === workId);
  }

  getAllWorkCategories(): WorkCategory[] {
    return [...WORK_CATEGORIES];
  }

  assignPawnToWork(pawnId: string, workType: string, gameState: GameState): GameState {
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
      currentWork: workType,
      workPriorities: {
        ...currentAssignment.workPriorities,
        [workType]: 10
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

  syncPawnWorkingStates(gameState: GameState): GameState {
    const workAssignments = { ...(gameState.workAssignments ?? {}) };
    let assignmentsChanged = false;

    let pawnsChanged = false;
    for (const pawn of gameState.pawns) {
      const inWorkLoop =
        WORK_LOOP_STATES.has(pawn.currentState ?? 'Idle') &&
        !pawn.state.isEating &&
        !pawn.state.isSleeping;

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

  private createDefaultLaborSettings(): Record<string, LaborLevel> {
    const settings: Record<string, LaborLevel> = {};
    for (const wc of WORK_CATEGORIES) settings[wc.id] = 2;
    return settings;
  }

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

export const workService = new WorkServiceImpl();
