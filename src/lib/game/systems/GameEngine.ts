/**
 * GameEngine - Central Coordinator Interface
 * Simple interface for iterative development
 */

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

/**
 * GameEngine Interface - Core coordination methods
 */
export interface GameEngine {
  // Core methods
  processGameTurn(): TurnProcessingResult;
  /** Advance the sim by one tick (turn = 1 tick; the whole pipeline runs every tick). */
  processTick(): void;
  updateStores(): void;
  /** P-2 single-writer entry point: apply a user-action command (updater) to canonical state. */
  applyCommand(updater: (state: GameState) => GameState, save: boolean): void;

  // State management
  getGameState(): GameState;
  updateGameState(updates: Partial<GameState>): SystemInteractionResult;

  // UI-facing coordination (getById lookups, craftItem, startResearch, work assignment, …) lives
  // in GameCoordinator (P-2b), not on the engine — this interface stays a turn coordinator.

  // Integration
  setGameStateManager(manager: any): void;
}
