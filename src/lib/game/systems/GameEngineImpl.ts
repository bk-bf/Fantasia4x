import type { GameEngine, GameEngineConfig, TurnProcessingResult, SystemInteractionResult } from './GameEngine';
import type { GameState, PawnNeeds } from '../core/types';
import { GameStateManager } from '../core/GameState';
import { gameState } from '$lib/stores/gameState';
import { modifierSystem } from './ModifierSystem';
import { workService } from '../services/WorkService';
import { itemService } from '../services/ItemService';
import { locationService } from '../services/LocationServices';
import { pawnService } from '../services/PawnService';
import { buildingService } from '../services/BuildingService';
import { researchService } from '../services/ResearchService';
import { WORK_CATEGORIES } from '../core/Work';
import { ITEMS_DATABASE } from '../core/Items';
import { AVAILABLE_BUILDINGS } from '../core/Buildings';

import type { BuildingEffectResult } from './ModifierSystem';
import type { WorkCategory } from '../core/types';
import type { Pawn } from '../core/types';

export class GameEngineImpl implements GameEngine {

	private gameState: GameState | null = null;
	private gameStateManager: GameStateManager | null = null;
	private config: GameEngineConfig;
	private lastTurnProcessed = 0;

	constructor(config: GameEngineConfig = {}) {
		this.config = {
			enableDebugLogging: false,
			validateStateOnEachUpdate: false,
			maxTurnsPerBatch: 10,
			enablePerformanceMetrics: false,
			errorRecoveryMode: 'lenient',
			...config
		};
		// Inject GameEngine reference into WorkService
		(workService as any).setGameEngine(this);
	}

	// ===== PAWN SERVICE COORDINATION METHODS =====

	getPawnNeeds(pawnId: string): PawnNeeds {
		if (!this.gameState) return { hunger: 0, fatigue: 0, sleep: 0, lastSleep: 0, lastMeal: 0 };

		// COORDINATION: Delegate to PawnService instead of direct pawn access
		const pawn = this.gameState.pawns.find(p => p.id === pawnId);
		return pawn?.needs || { hunger: 0, fatigue: 0, sleep: 0, lastSleep: 0, lastMeal: 0 };
	}

	getPawnActivities(pawnId: string): string[] {
		if (!this.gameState) return [];
		return pawnService.getPawnActivities(pawnId, this.gameState);
	}

	getPawnNeedStatus(pawnId: string): { critical: string[]; warning: string[]; normal: string[] } {
		if (!this.gameState) return { critical: [], warning: [], normal: [] };
		return pawnService.getPawnNeedStatus(pawnId, this.gameState);
	}

	// COORDINATION: Force activity method - delegates to PawnService
	forcePawnActivity(pawnId: string, activity: string): void {
		if (!this.gameState) return;

		console.log(`[GameEngine] Coordinating pawn ${pawnId} activity: ${activity}`);

		// COORDINATION: Delegate all activity handling to PawnService
		if (activity === 'eating') {
			this.gameState = pawnService.processAutomaticEating(this.gameState);
		} else if (activity === 'sleeping' || activity === 'resting') {
			this.gameState = pawnService.processAutomaticSleeping(this.gameState);
		} else {
			this.gameState = pawnService.setPawnActivity(pawnId, activity, this.gameState);
		}

		this.updateStores();
	}

	// ===== SERVICE COORDINATION METHODS FOR UI =====

	// COORDINATION: ItemService methods for UI components
	getItemById(itemId: string): any {
		return itemService.getItemById(itemId);
	}

	getAllItems(): any[] {
		// COORDINATION: Return all items from database
		return ITEMS_DATABASE;
	}

	getCraftableItems(): any[] {
		if (!this.gameState) return [];
		return itemService.getCraftableItems(this.gameState);
	}

	craftItem(itemId: string, quantity: number = 1): void {
		if (!this.gameState) return;
		console.log(`[GameEngine] Coordinating crafting: ${quantity}x ${itemId}`);

		// COORDINATION: Check if can craft and add to crafting queue
		if (itemService.canCraftItem(itemId, this.gameState)) {
			const item = itemService.getItemById(itemId);
			if (item) {
				// Add to crafting queue
				const craftingInProgress = {
					item: item,
					quantity: quantity,
					turnsRemaining: item.craftingTime || 1,
					startedAt: this.gameState.turn
				};

				// Consume materials
				if (item.craftingCost) {
					this.gameState = itemService.consumeItems(item.craftingCost, this.gameState);
				}

				// Add to queue
				this.gameState = {
					...this.gameState,
					craftingQueue: [...(this.gameState.craftingQueue || []), craftingInProgress]
				};
			}
		}

		this.updateStores();
	}

	// COORDINATION: BuildingService methods for UI components
	getBuildingById(buildingId: string): any {
		return buildingService.getBuildingById(buildingId);
	}

	getAllBuildings(): any[] {
		// COORDINATION: Return all buildings from database
		return AVAILABLE_BUILDINGS;
	}

	getBuildableBuildings(): any[] {
		if (!this.gameState) return [];
		return buildingService.getAvailableBuildings(this.gameState);
	}

	constructBuilding(buildingId: string, locationId?: string): void {
		if (!this.gameState) return;
		console.log(`[GameEngine] Coordinating building construction: ${buildingId} at ${locationId || 'default location'}`);

		// COORDINATION: Check if can build and add to building queue
		if (buildingService.canBuildBuilding(buildingId, this.gameState)) {
			const building = buildingService.getBuildingById(buildingId);
			if (building) {
				// Add to building queue
				const buildingInProgress = {
					building: building,
					turnsRemaining: building.buildTime || 1,
					startedAt: this.gameState.turn,
					locationId: locationId || 'default'
				};

				// Consume materials
				if (building.buildingCost) {
					this.gameState = itemService.consumeItems(building.buildingCost, this.gameState);
				}

				// Add to queue
				this.gameState = {
					...this.gameState,
					buildingQueue: [...(this.gameState.buildingQueue || []), buildingInProgress]
				};
			}
		}

		this.updateStores();
	}

	// COORDINATION: ResearchService methods for UI components
	getResearchById(researchId: string): any {
		return researchService.getResearchById(researchId);
	}

	getAllResearch(): any[] {
		return researchService.getAllResearch();
	}

	getAvailableResearch(): any[] {
		if (!this.gameState) return [];
		return researchService.getAvailableResearch(this.gameState);
	}

	startResearch(researchId: string): void {
		if (!this.gameState) return;
		console.log(`[GameEngine] Coordinating research start: ${researchId}`);
		this.gameState = researchService.startResearch(researchId, this.gameState);
		this.updateStores();
	}

	// COORDINATION: WorkService methods for UI components
	assignPawnToWork(pawnId: string, workType: string, locationId?: string): void {
		if (!this.gameState) return;
		console.log(`[GameEngine] Coordinating work assignment: ${pawnId} to ${workType} at ${locationId || 'default location'}`);
		this.gameState = workService.assignPawnToWork(pawnId, workType, locationId || 'default', this.gameState);
		this.updateStores();
	}

	unassignPawnFromWork(pawnId: string): void {
		if (!this.gameState) return;
		console.log(`[GameEngine] Coordinating work unassignment: ${pawnId}`);

		// COORDINATION: Remove work assignment by clearing priorities
		if (this.gameState.workAssignments && this.gameState.workAssignments[pawnId]) {
			this.gameState = {
				...this.gameState,
				workAssignments: {
					...this.gameState.workAssignments,
					[pawnId]: {
						...this.gameState.workAssignments[pawnId],
						workPriorities: {},
						currentWork: undefined,
						activeLocation: undefined
					}
				}
			};
		}

		this.updateStores();
	}

	getWorkAssignments(): Record<string, any> {
		if (!this.gameState) return {};
		return this.gameState.workAssignments || {};
	}

	// COORDINATION: LocationService methods for UI components
	getAvailableLocations(): any[] {
		return locationService.getDiscoveredLocations();
	}

	getLocationById(locationId: string): any {
		return locationService.getLocationById(locationId);
	}

	exploreNewLocation(): void {
		if (!this.gameState) return;
		console.log(`[GameEngine] Coordinating location exploration`);

		// COORDINATION: Simple exploration - discover a random undiscovered location
		const undiscovered = locationService.getUndiscoveredLocations();
		if (undiscovered.length > 0) {
			const randomLocation = undiscovered[Math.floor(Math.random() * undiscovered.length)];
			locationService.discoverLocation(randomLocation.id);
			this.updateStores();
		}
	}

	// ===== CORE COORDINATION - MOVED FROM GAMESTATE =====

	processGameTurn(): TurnProcessingResult {
		if (!this.gameState || !this.gameStateManager) {
			return {
				success: false,
				turnsProcessed: 0,
				systemsUpdated: [],
				errors: ['GameEngine not initialized']
			};
		}

		try {
			console.log('[GameEngine] Coordinating turn processing:', this.gameState.turn + 1);

			// Increment turn
			this.gameState.turn += 1;

			// COORDINATION: Delegate to services for all system processing
			this.gameState = workService.ensureBasicWorkAssignments(this.gameState);
			this.processResources();
			this.processBuildings();
			this.processCrafting();
			this.processResearch();
			this.processPawns();
			this.processLocationRenewal();
			this.gameState = workService.processWorkHarvesting(this.gameState);

			this.lastTurnProcessed = this.gameState.turn;
			this.gameStateManager.updateState(this.gameState);
			this.updateStores();

			return {
				success: true,
				turnsProcessed: 1,
				systemsUpdated: ['pawns', 'work', 'buildings', 'research', 'crafting'],
				errors: []
			};

		} catch (error) {
			return {
				success: false,
				turnsProcessed: 0,
				systemsUpdated: [],
				errors: [error instanceof Error ? error.message : 'Unknown error']
			};
		}
	}



	/**
	 * GameEngine coordination method - gets location-specific resources for work type
	 * Replaces the removed LocationService.getResourcesForWorkType method
	 */
	getLocationResourcesForWorkType(locationId: string, workType: string): string[] {
		console.log(`[GameEngine] Getting resources for ${workType} at ${locationId}`);

		// GameEngine coordinates between LocationService and ItemService
		const availableResources = locationService.getAvailableResources(locationId);
		console.log(`[GameEngine] Available resources at ${locationId}:`, availableResources);

		// GameEngine filters using ItemService
		const filteredResources = availableResources.filter(resourceId => {
			const item = itemService.getItemById(resourceId);
			const hasWorkType = item?.workTypes?.includes(workType);
			console.log(`[GameEngine] Resource ${resourceId} has workType ${workType}:`, hasWorkType);
			return hasWorkType;
		});

		console.log(`[GameEngine] Filtered resources for ${workType}:`, filteredResources);
		return filteredResources;
	}

	private processLocationRenewal(): void {
		console.log('[GameEngine] Coordinating location resource renewal through LocationService');
		locationService.processAllLocationRenewal();
	}

	/**
	 * GameEngine coordination method - checks if work can be performed at location
	 * Replaces the removed LocationService.canPerformWorkAtLocation method
	 */
	canPerformWorkAtLocation(locationId: string, workType: string): boolean {
		const availableResources = this.getLocationResourcesForWorkType(locationId, workType);
		return availableResources.length > 0;
	}

	// ===== SYSTEM PROCESSING - MOVED FROM GAMESTATE =====
	private processResources(): void {
		console.log('[GameEngine] Coordinating resource processing through WorkService');
		this.gameState = workService.processWorkHarvesting(this.gameState!);
	}

	private processPawns(): void {
		console.log('[GameEngine] Coordinating pawn processing through services');

		// COORDINATION: Delegate all pawn processing to PawnService
		this.gameState = pawnService.clearTemporaryPawnStates(this.gameState!);
		this.gameState = workService.syncPawnWorkingStates(this.gameState!);
		this.gameState = pawnService.processAutomaticNeeds(this.gameState!);
		this.gameState = pawnService.processPawnTurn(this.gameState!);
		this.gameState = workService.syncPawnWorkingStates(this.gameState!);
	}

	private processBuildings(): void {
		console.log('[GameEngine] Coordinating building processing through BuildingService');
		this.gameState = buildingService.processBuildingQueue(this.gameState!);
	}

	private processCrafting(): void {
		console.log('[GameEngine] Coordinating crafting processing through ItemService');
		this.gameState = itemService.processCraftingQueue(this.gameState!);
	}

	private processResearch(): void {
		console.log('[GameEngine] Coordinating research processing through ResearchService');
		this.gameState = researchService.processCurrentResearch(this.gameState!);
	}

	// ===== HELPER METHODS =====

	updateStores(): void {
		if (!this.gameState) return;
		gameState.updateWithSave(() => this.gameState!);
	}

	// ===== BASIC CALCULATIONS =====

	calculatePawnEfficiency(pawnId: string, workType: string): number {
		if (!this.gameState) return 1.0;
		return modifierSystem.calculateWorkEfficiency(pawnId, workType, this.gameState, undefined).totalValue;
	}

	calculateBuildingEffects(buildingId: string, locationId?: string): BuildingEffectResult {
		if (!this.gameState) {
			return {
				buildingId,
				effects: {},
				workBonuses: {},
				productionBonuses: {}
			};
		}
		return modifierSystem.calculateBuildingEffects(buildingId, this.gameState);
	}

	calculateCraftingTime(itemId: string, pawnId: string): number {
		// COORDINATION: Use ItemService to get crafting time
		const item = itemService.getItemById(itemId);
		return item?.craftingTime || 3;
	}

	calculateResourceProduction(workAssignment: { pawnId: string; workType: string; turns?: number }): Record<string, number> {
		if (!this.gameState) return {};

		// COORDINATION: Use WorkService to calculate resource production
		const turns = workAssignment.turns || 1;
		const resources = this.getLocationResourcesForWorkType('default', workAssignment.workType);
		const result: Record<string, number> = {};

		resources.forEach(resourceId => {
			// Simplified calculation - could be enhanced with WorkService methods
			result[resourceId] = turns * this.calculatePawnEfficiency(workAssignment.pawnId, workAssignment.workType);
		});

		return result;
	}

	calculateCombatEffectiveness(pawnId: string, combatType: 'melee' | 'ranged' | 'defense'): number {
		if (!this.gameState) return 1.0;

		// COORDINATION: Use ModifierSystem for combat calculations
		const pawn = this.gameState.pawns.find(p => p.id === pawnId);
		if (!pawn) return 1.0;

		// Base effectiveness from stats
		let effectiveness = 1.0;
		switch (combatType) {
			case 'melee':
				effectiveness = (pawn.stats.strength + pawn.stats.constitution) / 20;
				break;
			case 'ranged':
				effectiveness = (pawn.stats.dexterity + pawn.stats.intelligence) / 20;
				break;
			case 'defense':
				effectiveness = (pawn.stats.constitution + pawn.stats.dexterity) / 20;
				break;
		}

		return Math.max(0.1, effectiveness);
	}

	// ===== STATE MANAGEMENT =====

	getGameState(): GameState {
		if (!this.gameState) throw new Error('GameState not initialized');
		return JSON.parse(JSON.stringify(this.gameState));
	}

	getCurrentState(): GameState {
		if (!this.gameState) throw new Error('GameState not initialized');
		return this.gameState;
	}

	updateGameState(updates: Partial<GameState>): SystemInteractionResult {
		if (!this.gameState) {
			return { success: false, error: 'GameState not initialized' };
		}

		this.gameState = { ...this.gameState, ...updates };
		this.updateStores();

		return { success: true };
	}

	validateSystemConsistency(): any {
		return { isValid: true, errors: [], warnings: [], affectedSystems: [] };
	}

	resetGameState(newState?: GameState): SystemInteractionResult {
		if (newState) {
			this.gameState = JSON.parse(JSON.stringify(newState));
			this.updateStores();
		}
		return { success: true };
	}

	// ===== INTEGRATION =====

	setGameStateManager(manager: GameStateManager): void {
		this.gameStateManager = manager;
		this.gameState = manager.getState();
	}

	integrateServices(services: any): void {
		// COORDINATION: Services are integrated through direct imports
		console.log('[GameEngine] Services integrated:', Object.keys(services || {}));
	}

	getServices(): any {
		throw new Error('Method not implemented - services accessed directly');
	}

	initialize(initialState: GameState, services: any): SystemInteractionResult {
		try {
			this.gameState = JSON.parse(JSON.stringify(initialState));
			this.integrateServices(services);
			console.log('[GameEngine] Initialized with state and services');
			return { success: true };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Failed to initialize GameEngine'
			};
		}
	}

	shutdown(): SystemInteractionResult {
		return { success: true };
	}

	getEngineStatus(): any {
		return {
			isInitialized: !!this.gameState,
			systemsIntegrated: ['work', 'research', 'crafting'],
			lastTurnProcessed: this.lastTurnProcessed,
			pendingOperations: 0,
			errors: []
		};
	}

	/**
	 * Debug command to test work efficiency balance
	 */
	debugWorkBalance(pawnId?: string, workType?: string): void {
		if (!this.gameState) {
			console.log('No game state available');
			return;
		}

		const testPawnId = pawnId || this.gameState.pawns[0]?.id;
		const testWorkType = workType || 'crafting';

		if (!testPawnId) {
			console.log('No pawns available for testing');
			return;
		}

		console.log('\n🔍 WORK EFFICIENCY BALANCE TEST');
		console.log('================================');

		// Test current state
		modifierSystem.debugWorkEfficiency(testPawnId, testWorkType, this.gameState);

		// Test balance scenarios
		modifierSystem.testBalanceScenarios(this.gameState);

		// Test all work types for this pawn
		console.log(`\n--- All Work Types for Pawn ${testPawnId} ---`);
		WORK_CATEGORIES.forEach((work: WorkCategory) => {
			const efficiency = modifierSystem.calculateWorkEfficiency(testPawnId, work.id, this.gameState!);
			console.log(`${work.id}: ${efficiency.totalValue.toFixed(2)}x (${efficiency.sources.length} sources)`);
		});
	}

	validateGameBalance(): void {
		if (!this.gameState) return;

		const validation = modifierSystem.validateEfficiencyBalance(this.gameState);

		console.log('\n🎯 GAME BALANCE VALIDATION');
		console.log('==========================');
		console.log(`Overall Balance: ${validation.isBalanced ? '✅ BALANCED' : '❌ NEEDS ADJUSTMENT'}`);

		if (validation.issues.length > 0) {
			console.log('\n🚨 Issues Found:');
			validation.issues.forEach((issue, index) => {
				console.log(`  ${index + 1}. ${issue}`);
			});
		}

		if (validation.recommendations.length > 0) {
			console.log('\n💡 Recommendations:');
			validation.recommendations.forEach((rec, index) => {
				console.log(`  ${index + 1}. ${rec}`);
			});
		}
	}

	/**
	 * Quick balance check for all pawns
	 */
	checkAllPawnEfficiencies(): void {
		if (!this.gameState) return;

		console.log('\n📊 ALL PAWN EFFICIENCY SUMMARY');
		console.log('==============================');

		this.gameState.pawns.forEach((pawn: Pawn) => {
			console.log(`\nPawn: ${pawn.name} (${pawn.id})`);

			const efficiencies = WORK_CATEGORIES.map((work: WorkCategory) => {
				const result = modifierSystem.calculateWorkEfficiency(pawn.id, work.id, this.gameState!);
				return {
					workType: work.id,
					efficiency: result.totalValue,
					sources: result.sources.length
				};
			});

			// Show top 3 and bottom 3 efficiencies
			efficiencies.sort((a, b) => b.efficiency - a.efficiency);

			console.log('  Top 3:');
			efficiencies.slice(0, 3).forEach(e => {
				console.log(`    ${e.workType}: ${e.efficiency.toFixed(2)}x (${e.sources} sources)`);
			});

			if (efficiencies.length > 6) {
				console.log('  Bottom 3:');
				efficiencies.slice(-3).forEach(e => {
					console.log(`    ${e.workType}: ${e.efficiency.toFixed(2)}x (${e.sources} sources)`);
				});
			}

			// Flag concerning efficiencies
			const overpowered = efficiencies.filter(e => e.efficiency > 5.0);
			if (overpowered.length > 0) {
				console.warn(`    ⚠️  Overpowered: ${overpowered.map(e => `${e.workType}(${e.efficiency.toFixed(1)}x)`).join(', ')}`);
			}
		});
	}
}

// Export singleton
export const gameEngine = new GameEngineImpl();

export function initializeGameEngine(gameStateManager: GameStateManager): GameEngineImpl {
	gameEngine.setGameStateManager(gameStateManager);
	return gameEngine;
}