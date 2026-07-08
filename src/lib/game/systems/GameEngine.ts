import type { GameState } from '../core/types';

export interface TurnProcessingResult {
  success: boolean;
  turnsProcessed: number;
  systemsUpdated: string[];
  errors?: string[];
}

export interface SystemInteractionResult {
  success: boolean;
  data?: any;
  error?: string;
}

export interface BuildingEffects {
  populationCapacity?: number;
  productionBonus?: Record<string, number>;
  workEfficiencyBonus?: Record<string, number>;
  storageCapacity?: Record<string, number>;
  defenseBonus?: number;
  morale?: number;
  upkeepCost?: Record<string, number>;
}

export interface GameEngineConfig {
  enableDebugLogging?: boolean;
  validateStateOnEachUpdate?: boolean;
  maxTurnsPerBatch?: number;
  enablePerformanceMetrics?: boolean;
  errorRecoveryMode?: 'strict' | 'lenient' | 'disabled';
}

export interface GameEngine {
  processGameTurn(): TurnProcessingResult;
  /** Advance the sim by one tick (turn = 1 tick; the whole pipeline runs every tick). */
  processTick(): void;
  updateStores(): void;
  /** Single-writer entry point: apply a user-action command (updater) to canonical state. */
  applyCommand(updater: (state: GameState) => GameState, save: boolean): void;

  getGameState(): GameState;
  updateGameState(updates: Partial<GameState>): SystemInteractionResult;

  // UI-facing lookups live in GameCoordinator, not here — this interface stays a turn coordinator.

  setGameStateManager(manager: any): void;
}
