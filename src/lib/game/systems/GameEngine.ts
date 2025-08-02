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

	// Pawn coordination methods
	getPawnNeeds(pawnId: string): any;
	getPawnActivities(pawnId: string): string[];
	getPawnNeedStatus(pawnId: string): { critical: string[]; warning: string[]; normal: string[] };
	forcePawnActivity(pawnId: string, activity: string): void;

	// Service coordination methods for UI
	// ItemService coordination
	getItemById(itemId: string): any;
	getAllItems(): any[];
	getCraftableItems(): any[];
	craftItem(itemId: string, quantity?: number): void;

	// BuildingService coordination
	getBuildingById(buildingId: string): any;
	getAllBuildings(): any[];
	getBuildableBuildings(): any[];
	constructBuilding(buildingId: string, locationId?: string): void;

	// ResearchService coordination
	getResearchById(researchId: string): any;
	getAllResearch(): any[];
	getAvailableResearch(): any[];
	startResearch(researchId: string): void;

	// WorkService coordination
	assignPawnToWork(pawnId: string, workType: string, locationId?: string): void;
	unassignPawnFromWork(pawnId: string): void;
	getWorkAssignments(): Record<string, any>;

	// LocationService coordination
	getAvailableLocations(): any[];
	getLocationById(locationId: string): any;
	exploreNewLocation(): void;

	// Integration
	setGameStateManager(manager: any): void;
}