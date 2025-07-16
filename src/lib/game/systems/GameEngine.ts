/**
 * GameEngine - Central Coordinator Interface
 * Simple interface for iterative development
 */

import type { GameState, WorkAssignment } from '../core/types';
import type { BuildingEffectResult } from './ModifierSystem';

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
	updateStores(): void;

	// State management
	getGameState(): GameState;
	updateGameState(updates: Partial<GameState>): SystemInteractionResult;

	// Basic calculations (can expand iteratively)
	calculatePawnEfficiency(pawnId: string, workType: string): number;
	calculateBuildingEffects(buildingId: string, locationId?: string): BuildingEffectResult;

	// Integration
	setGameStateManager(manager: any): void;
}