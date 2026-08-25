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
  processTick(): void;
  updateStores(): void;
  applyCommand(updater: (state: GameState) => GameState, save: boolean): void;

  getGameState(): GameState;
  updateGameState(updates: Partial<GameState>): SystemInteractionResult;

  setGameStateManager(manager: any): void;
}
