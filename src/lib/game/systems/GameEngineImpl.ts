import type { GameEngine, GameEngineConfig, TurnProcessingResult, SystemInteractionResult, BuildingEffects } from './GameEngine';
import type { GameState, PawnNeeds } from '../core/types';
import { GameStateManager } from '../core/GameState';
import { gameState, currentItem } from '$lib/stores/gameState';
import { modifierSystem } from './ModifierSystem';
import { workService } from '../services/WorkService';
import { itemService } from '../services/ItemService';
import { locationService } from '../services/LocationServices';
import { pawnService } from '../services/PawnService';
import { WORK_CATEGORIES } from '../core/Work';

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

	// ===== PAWN SERVICE INTEGRATION METHODS =====

	getPawnNeeds(pawnId: string): PawnNeeds {
		const pawn = this.gameState?.pawns.find(p => p.id === pawnId);
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

	// UPDATED: Force activity method with better integration
	forcePawnActivity(pawnId: string, activity: string): void {
		if (!this.gameState) return;

		console.log(`[GameEngine] Forcing pawn ${pawnId} to ${activity}`);

		const pawn = this.gameState.pawns.find(p => p.id === pawnId);
		if (!pawn) {
			console.error(`[GameEngine] Pawn ${pawnId} not found`);
			return;
		}

		// SPECIAL HANDLING for eating - use PawnService automatic eating system
		if (activity === 'eating') {
			this.gameState = pawnService.processAutomaticEating(this.gameState);
			this.updateStores();
			return;
		}

		// SPECIAL HANDLING for sleeping/resting - use PawnService automatic sleeping system
		if (activity === 'sleeping' || activity === 'resting') {
			this.gameState = pawnService.processAutomaticSleeping(this.gameState);
			this.updateStores();
			return;
		}

		// For other activities, use the normal setPawnActivity
		this.gameState = pawnService.setPawnActivity(pawnId, activity, this.gameState);
		this.updateStores();
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
			console.log('[GameEngine] Processing turn:', this.gameState.turn + 1);

			// DEBUG: Check work assignments BEFORE turn processing
			console.log('[GameEngine] BEFORE turn - Work assignments:', Object.keys(this.gameState.workAssignments || {}));

			// Increment turn FIRST
			this.gameState.turn += 1;

			// ENSURE PAWNS HAVE WORK ASSIGNMENTS
			this.ensureBasicWorkAssignments();

			// Process all systems (MOVED FROM GameState.advanceTurn())
			this.processResources();
			this.processBuildings();
			this.processCrafting();
			this.processResearch();
			this.processPawns();
			this.processLocationRenewal();

			// DEBUG: Check work assignments AFTER our processing
			console.log('[GameEngine] AFTER our processing - Work assignments:', Object.keys(this.gameState.workAssignments || {}));

			// Also run WorkService processing
			this.gameState = workService.processWorkHarvesting(this.gameState);

			// DEBUG: Check work assignments AFTER WorkService
			console.log('[GameEngine] AFTER WorkService - Work assignments:', Object.keys(this.gameState.workAssignments || {}));

			this.lastTurnProcessed = this.gameState.turn;

			// Update GameStateManager with final state
			this.gameStateManager.updateState(this.gameState);

			// DEBUG: Check work assignments AFTER GameStateManager
			console.log('[GameEngine] AFTER GameStateManager - Work assignments:', Object.keys(this.gameState.workAssignments || {}));

			// Update stores (THE KEY FIX!)
			this.updateStores();

			// DEBUG: Check work assignments AFTER store update
			console.log('[GameEngine] AFTER updateStores - Work assignments:', Object.keys(this.gameState.workAssignments || {}));

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

	// ===== NEW METHOD: ENSURE WORK ASSIGNMENTS =====
	private ensureBasicWorkAssignments(): void {
		// Initialize workAssignments if it doesn't exist
		if (!this.gameState!.workAssignments) {
			this.gameState!.workAssignments = {};
		}

		// Get available discovered locations
		const discoveredLocations = locationService.getDiscoveredLocations();
		const defaultLocation = discoveredLocations.find(loc => loc.id === 'plains') || discoveredLocations[0];

		if (!defaultLocation) {
			console.error('[GameEngine] No discovered locations available for work assignments!');
			return;
		}

		console.log(`[GameEngine] Using default location for assignments: ${defaultLocation.id}`);

		// Give every pawn a basic work assignment if they don't have one
		this.gameState!.pawns.forEach((pawn, index) => {
			if (!this.gameState!.workAssignments[pawn.id]) {
				console.log(`[GameEngine] Auto-assigning work to pawn: ${pawn.name}`);

				this.gameState!.workAssignments[pawn.id] = {
					pawnId: pawn.id,
					currentWork: 'foraging', // Basic work that doesn't need tools
					activeLocation: defaultLocation.id, // Use valid discovered location
					workPriorities: {
						'foraging': 5, // Medium priority
						'woodcutting': 3, // Lower priority, may need tools
						'mining': 2
					},
					authorizedLocations: [defaultLocation.id] // Use valid discovered location
				};
			}

			// SYNC PAWN STATE WITH WORK ASSIGNMENT
			const workAssignment = this.gameState!.workAssignments[pawn.id];
			if (workAssignment && workAssignment.currentWork) {
				// Mark pawn as working if they have a work assignment and aren't eating/sleeping
				if (!pawn.state.isEating && !pawn.state.isSleeping) {
					this.gameState!.pawns[index] = {
						...pawn,
						state: {
							...pawn.state,
							isWorking: true
						}
					};
					console.log(`[GameEngine] Marked ${pawn.name} as working (${workAssignment.currentWork})`);
				}
			}
		});

		const assignedCount = Object.keys(this.gameState!.workAssignments).length;
		console.log(`[GameEngine] Work assignments ensured: ${assignedCount} pawns assigned`);
	}

	private syncPawnWorkingStates(): void {
		// Delegate to WorkService for work state synchronization
		this.gameState = workService.syncPawnWorkingStates(this.gameState!);
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
		console.log('[GameEngine] Processing location resource renewal');
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
		console.log('[GameEngine] Processing resources - BEFORE WorkService');
		console.log('[GameEngine] Current items:', this.gameState!.item?.length || 0);
		console.log('[GameEngine] Work assignments before WorkService:', Object.keys(this.gameState!.workAssignments || {}));

		// Process through WorkService (WorkService will call back to GameEngine for coordination)
		this.gameState = workService.processWorkHarvesting(this.gameState!);

		console.log('[GameEngine] Processing resources - AFTER WorkService');
		console.log('[GameEngine] Items after WorkService:', this.gameState!.item?.length || 0);
		console.log('[GameEngine] Work assignments after WorkService:', Object.keys(this.gameState!.workAssignments || {}));
		this.gameState!.item?.forEach(item => {
			console.log(`  - ${item.name}: ${item.amount}`);
		});
	}

	private processPawns(): void {
		console.log('[GameEngine] Processing pawn needs and activities');

		// FIRST: Clear temporary eating/sleeping states from previous turn
		this.gameState = pawnService.clearTemporaryPawnStates(this.gameState!);

		// SECOND: Sync working states with work assignments
		this.syncPawnWorkingStates();

		// THIRD: Process automatic need-based activities (eating, sleeping) through PawnService
		this.gameState = pawnService.processAutomaticNeeds(this.gameState!);

		// FOURTH: Process regular pawn turn logic
		this.gameState = pawnService.processPawnTurn(this.gameState!);

		// FIFTH: Re-sync working states after pawn processing
		this.syncPawnWorkingStates();
	}

	private processBuildings(): void {
		console.log('[GameEngine] Processing buildings');

		// Process building queue - buildings under construction (MOVED FROM GameState)
		if (this.gameState!.buildingQueue.length > 0) {
			this.gameState!.buildingQueue = this.gameState!.buildingQueue
				.map((building) => ({
					...building,
					turnsRemaining: building.turnsRemaining - 1
				}))
				.filter((building) => {
					if (building.turnsRemaining <= 0) {
						// Building completed - add to building counts
						this.gameState!.buildingCounts[building.building.id] =
							(this.gameState!.buildingCounts[building.building.id] || 0) + 1;
						console.log('[GameEngine] Building completed:', building.building.id);
						return false;
					}
					return true;
				});
		}
	}

	private processCrafting(): void {
		console.log('[GameEngine] Processing crafting');

		// Process crafting queue - items being crafted (MOVED FROM GameState)
		if (this.gameState!.craftingQueue.length > 0) {
			this.gameState!.craftingQueue = this.gameState!.craftingQueue
				.map((crafting) => ({
					...crafting,
					turnsRemaining: crafting.turnsRemaining - 1
				}))
				.filter((crafting) => {
					if (crafting.turnsRemaining <= 0) {
						// Crafting completed - add to items array
						const itemId = crafting.item.id;
						const quantity = crafting.quantity || 1;
						this.addItemToGameState(itemId, quantity);
						console.log('[GameEngine] Crafting completed:', itemId, 'x', quantity);
						return false;
					}
					return true;
				});
		}
	}

	private processResearch(): void {
		console.log('[GameEngine] Processing research');

		// Process current research - scroll-based progression (MOVED FROM GameState)
		if (this.gameState!.currentResearch) {
			this.gameState!.currentResearch.currentProgress =
				(this.gameState!.currentResearch.currentProgress || 0) + 1;

			if (this.gameState!.currentResearch.currentProgress >= this.gameState!.currentResearch.researchTime) {
				// Research completed
				this.gameState!.completedResearch.push(this.gameState!.currentResearch.id);

				// Apply research unlocks
				if (this.gameState!.currentResearch.unlocks.toolTierRequired) {
					this.gameState!.currentToolLevel = Math.max(
						this.gameState!.currentToolLevel,
						this.gameState!.currentResearch.unlocks.toolTierRequired
					);
				}

				console.log('[GameEngine] Research completed:', this.gameState!.currentResearch.id);
				// Clear current research
				this.gameState!.currentResearch = undefined;
			}
		}
	}

	// ===== HELPER METHODS =====

	private addItemToGameState(itemId: string, amount: number): void {
		if (!this.gameState!.item) this.gameState!.item = [];

		const itemIndex = this.gameState!.item.findIndex((item) => item.id === itemId);
		if (itemIndex !== -1) {
			// Update existing item immutably
			this.gameState!.item[itemIndex] = {
				...this.gameState!.item[itemIndex],
				amount: this.gameState!.item[itemIndex].amount + amount
			};
		} else {
			// Add new item if it doesn't exist
			const itemInfo = itemService.getItemById(itemId);
			if (itemInfo) {
				this.gameState!.item.push({ ...itemInfo, amount });
			}
		}
	}

	updateStores(): void {
		if (!this.gameState) return;

		console.log('[GameEngine] BEFORE updateStores - items in gameState:', this.gameState.item?.length || 0);
		this.gameState.item?.forEach(item => {
			console.log(`  - ${item.name}: ${item.amount}`);
		});

		// Update Svelte stores
		gameState.updateWithSave(() => this.gameState!);

		console.log('[GameEngine] AFTER updateStores - store should be updated');
	}

	// ===== BASIC CALCULATIONS =====

	calculatePawnEfficiency(pawnId: string, workType: string): number {
		return modifierSystem.calculateWorkEfficiency(pawnId, workType, this.gameState!, undefined).totalValue;
	}

	calculateBuildingEffects(buildingId: string, locationId?: string): BuildingEffectResult {
		return modifierSystem.calculateBuildingEffects(buildingId, this.gameState!);
	}

	calculateCraftingTime(itemId: string, pawnId: string): number {
		return 3; // Simplified - normally would calculate based on pawn skills
	}

	calculateResourceProduction(workAssignment: any): Record<string, number> {
		return {}; // Simplified
	}

	calculateCombatEffectiveness(pawnId: string, combatType: 'melee' | 'ranged' | 'defense'): number {
		return 1.0; // Simplified
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
		// Simplified - just note that services are available
		console.log('[GameEngine] Services integrated');
	}

	getServices(): any {
		throw new Error('Method not implemented - services accessed directly');
	}

	initialize(initialState: GameState, services: any): SystemInteractionResult {
		this.gameState = JSON.parse(JSON.stringify(initialState));
		return { success: true };
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