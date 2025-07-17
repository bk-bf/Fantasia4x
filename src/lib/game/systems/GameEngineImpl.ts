import type { GameEngine, GameEngineConfig, TurnProcessingResult, SystemInteractionResult, BuildingEffects } from './GameEngine';
import type { GameState, PawnNeeds } from '../core/types';
import { GameStateManager } from '../core/GameState';
import { gameState, currentItem } from '$lib/stores/gameState';
import { modifierSystem } from './ModifierSystem';
import { workService } from '../services/WorkService';
import { itemService } from '../services/ItemService';
import { locationService } from '../services/LocationServices';
import { pawnService } from '../services/PawnService';
import { WORK_CATEGORIES } from '../core/Work'; // ADD THIS IMPORT

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

		// SPECIAL HANDLING for eating - use our automatic eating system
		if (activity === 'eating') {
			const fedPawn = this.tryAutomaticEating(pawn);

			// Update the actual pawn in gameState
			this.gameState.pawns = this.gameState.pawns.map(p =>
				p.id === pawnId ? fedPawn : p
			);

			this.updateStores();
			return;
		}

		// SPECIAL HANDLING for sleeping/resting
		if (activity === 'sleeping' || activity === 'resting') {
			const restedPawn = this.tryAutomaticSleeping(pawn);

			// Update the actual pawn in gameState
			this.gameState.pawns = this.gameState.pawns.map(p =>
				p.id === pawnId ? restedPawn : p
			);

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
		console.log('[GameEngine] Syncing pawn working states with work assignments');

		this.gameState!.pawns.forEach((pawn, index) => {
			const workAssignment = this.gameState!.workAssignments[pawn.id];

			if (workAssignment) {
				// FIXED: Update currentWork based on highest priority work the pawn can actually do
				const availableWork = this.getAvailableWorkForPawn(pawn, workAssignment);
				if (availableWork && availableWork !== workAssignment.currentWork) {
					console.log(`[GameEngine] Updating ${pawn.name} work from ${workAssignment.currentWork} to ${availableWork}`);
					workAssignment.currentWork = availableWork;
				}
			}

			// Determine if pawn should be working
			const shouldBeWorking = workAssignment &&
				workAssignment.currentWork &&
				!pawn.state.isEating &&
				!pawn.state.isSleeping;

			// Update pawn state if it doesn't match
			if (pawn.state.isWorking !== shouldBeWorking) {
				this.gameState!.pawns[index] = {
					...pawn,
					state: {
						...pawn.state,
						isWorking: shouldBeWorking || false
					}
				};

				console.log(`[GameEngine] Updated ${pawn.name} working state: ${pawn.state.isWorking} → ${shouldBeWorking} (doing ${workAssignment?.currentWork})`);
			}
		});
	}

	// NEW: Determine what work a pawn should actually be doing based on priorities and availability
	private getAvailableWorkForPawn(pawn: Pawn, workAssignment: any): string | null {
		if (!workAssignment.workPriorities) {
			return 'foraging'; // Default fallback
		}

		// Get work types sorted by priority (highest first)
		const sortedWork = Object.entries(workAssignment.workPriorities)
			.filter(([_, priority]) => (priority as number) > 0)
			.sort((a, b) => (b[1] as number) - (a[1] as number));

		console.log(`[GameEngine] ${pawn.name} work priorities:`, sortedWork);

		// Find the highest priority work that the pawn can actually do
		for (const [workType, priority] of sortedWork) {
			if (this.canPawnDoWork(pawn, workType, workAssignment)) {
				console.log(`[GameEngine] ${pawn.name} should do ${workType} (priority ${priority})`);
				return workType;
			}
		}

		// Fallback to foraging if nothing else is available
		return 'foraging';
	}

	private canPawnDoWork(pawn: Pawn, workType: string, workAssignment: any): boolean {
		// Get work category info
		const workCategory = WORK_CATEGORIES.find(w => w.id === workType);
		if (!workCategory) {
			console.log(`[GameEngine] Unknown work type: ${workType}`);
			return false;
		}

		// Check if pawn has required tools (simplified check)
		if (workCategory.toolsRequired && workCategory.toolsRequired.length > 0) {
			// For now, assume pawns can do work if they have basic tools
			// This would need to be expanded to check actual equipment
			console.log(`[GameEngine] ${workType} requires tools: ${workCategory.toolsRequired.join(', ')}`);
		}

		// Check if location supports this work type
		if (workCategory.locationTypesRequired && workCategory.locationTypesRequired.length > 0) {
			const currentLocation = workAssignment.activeLocation;
			const location = locationService.getLocationById(currentLocation);

			if (location && !workCategory.locationTypesRequired.includes(location.type)) {
				console.log(`[GameEngine] ${workType} not available at ${location.type} location`);
				return false;
			}
		}

		console.log(`[GameEngine] ${pawn.name} can do ${workType}`);
		return true;
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
		this.clearTemporaryPawnStates();

		// SECOND: Sync working states with work assignments
		this.syncPawnWorkingStates();

		// THIRD: Process automatic need-based activities (eating, sleeping)
		this.processAutomaticPawnNeeds();

		// FOURTH: Process regular pawn turn logic
		this.gameState = pawnService.processPawnTurn(this.gameState!);

		// FIFTH: Re-sync working states after pawn processing
		this.syncPawnWorkingStates();
	}

	// UPDATED: Clear temporary states only when pawns should wake up
	private clearTemporaryPawnStates(): void {
		this.gameState!.pawns.forEach((pawn, index) => {
			let shouldClearStates = false;

			// Clear eating state after one turn (eating is always one turn)
			if (pawn.state.isEating) {
				shouldClearStates = true;
				console.log(`[GameEngine] Clearing eating state for ${pawn.name}`);
			}

			// Only clear sleeping state if pawn should wake up
			if (pawn.state.isSleeping) {
				const shouldWakeUp = !this.shouldPawnSleep(pawn);
				if (shouldWakeUp) {
					shouldClearStates = true;
					console.log(`[GameEngine] Waking up ${pawn.name} (fatigue: ${pawn.needs.fatigue}, hunger: ${pawn.needs.hunger})`);
				} else {
					console.log(`[GameEngine] ${pawn.name} continues sleeping (fatigue: ${pawn.needs.fatigue}, hunger: ${pawn.needs.hunger})`);
				}
			}

			if (shouldClearStates) {
				this.gameState!.pawns[index] = {
					...pawn,
					state: {
						...pawn.state,
						isEating: false,
						isSleeping: pawn.state.isSleeping && !shouldClearStates // Only clear sleeping if should wake up
					}
				};
			}
		});
	}

	// NEW METHOD: Handle automatic eating and sleeping
	private processAutomaticPawnNeeds(): void {
		console.log('[GameEngine] Checking automatic pawn needs');

		this.gameState!.pawns.forEach((pawn, index) => {
			let updatedPawn = { ...pawn };
			let needsUpdate = false;

			// PRIORITY 1: Critical hunger (must eat immediately)
			if (updatedPawn.needs.hunger >= 85) {
				console.log(`[GameEngine] ${pawn.name} critically hungry (${updatedPawn.needs.hunger}), must eat now`);

				const fedPawn = this.tryAutomaticEating(updatedPawn);
				if (fedPawn !== updatedPawn) {
					updatedPawn = fedPawn;
					needsUpdate = true;
					console.log(`[GameEngine] ${pawn.name} ate due to critical hunger, hunger now: ${updatedPawn.needs.hunger}`);
				}
			}
			// PRIORITY 2: Sleep decision based on hunger/fatigue balance
			else if (this.shouldPawnSleep(updatedPawn)) {
				console.log(`[GameEngine] ${pawn.name} should sleep (fatigue: ${updatedPawn.needs.fatigue}, hunger: ${updatedPawn.needs.hunger})`);

				const restedPawn = this.tryAutomaticSleeping(updatedPawn);
				if (restedPawn !== updatedPawn) {
					updatedPawn = restedPawn;
					needsUpdate = true;
					console.log(`[GameEngine] ${pawn.name} is sleeping, fatigue now: ${updatedPawn.needs.fatigue}`);
				}
			}
			// PRIORITY 3: Moderate hunger (eat when not sleeping)
			else if (updatedPawn.needs.hunger >= 70 && !updatedPawn.state.isSleeping) {
				console.log(`[GameEngine] ${pawn.name} moderately hungry (${updatedPawn.needs.hunger}), attempting to eat`);

				const fedPawn = this.tryAutomaticEating(updatedPawn);
				if (fedPawn !== updatedPawn) {
					updatedPawn = fedPawn;
					needsUpdate = true;
					console.log(`[GameEngine] ${pawn.name} ate due to moderate hunger, hunger now: ${updatedPawn.needs.hunger}`);
				}
			}

			// Update pawn in gameState if changes were made
			if (needsUpdate) {
				this.gameState!.pawns[index] = updatedPawn;
			}
		});
	}
	// NEW: Intelligent sleep decision based on hunger/fatigue balance
	private shouldPawnSleep(pawn: Pawn): boolean {
		const fatigue = pawn.needs.fatigue;
		const hunger = pawn.needs.hunger;

		// Don't sleep if already sleeping
		if (pawn.state.isSleeping) {
			// Continue sleeping if still tired, unless getting very hungry
			const shouldContinueSleeping = fatigue > 15 && hunger < 80; // LOWERED: Wake at 15 fatigue (was 30)
			console.log(`[GameEngine] ${pawn.name} sleeping: fatigue=${fatigue}, hunger=${hunger}, continue=${shouldContinueSleeping}`);
			return shouldContinueSleeping;
		}

		// Start sleeping based on hunger/fatigue balance
		if (hunger < 30) {
			// Well fed: sleep until almost fully rested (fatigue < 15)
			return fatigue >= 40; // LOWERED: Start at 40 fatigue (was 50)
		} else if (hunger < 60) {
			// Moderately fed: sleep until moderately rested (fatigue < 20)
			return fatigue >= 60; // LOWERED: Start at 60 fatigue (was 70)
		} else if (hunger < 80) {
			// Getting hungry: only sleep when very tired (fatigue < 30)
			return fatigue >= 80; // LOWERED: Start at 80 fatigue (was 85)
		} else {
			// Very hungry: don't sleep, eat instead
			return false;
		}
	}

	// FIXED: Try to feed a pawn automatically - eat as much as possible
	private tryAutomaticEating(pawn: Pawn): Pawn {
		// Find available food in gameState
		const availableFood = this.findAvailableFood();

		if (availableFood.length === 0) {
			console.log(`[GameEngine] No food available for ${pawn.name}`);
			return pawn; // No food available
		}

		// Sort food by nutrition value (highest first)
		const sortedFood = availableFood.sort((a, b) => (b.nutrition || 0) - (a.nutrition || 0));

		let totalHungerReduction = 0;
		let updatedPawn = { ...pawn };

		// EAT AS MUCH FOOD AS POSSIBLE until hunger is satisfied or no more food
		for (const food of sortedFood) {
			// Stop if hunger is already low enough
			if (updatedPawn.needs.hunger <= 10) break;

			// Calculate how much of this food we can/should eat
			const maxFoodToEat = Math.min(food.amount, Math.ceil(updatedPawn.needs.hunger / (food.nutrition || 1)));

			if (maxFoodToEat > 0) {
				// Consume the food from inventory
				this.consumeFoodFromInventory(food.id, maxFoodToEat);

				// Calculate hunger reduction
				const hungerReduction = maxFoodToEat * (food.nutrition || 1);
				totalHungerReduction += hungerReduction;

				// Update pawn's hunger
				updatedPawn.needs = {
					...updatedPawn.needs,
					hunger: Math.max(0, updatedPawn.needs.hunger - hungerReduction),
					lastMeal: this.gameState!.turn
				};

				console.log(`[GameEngine] ${pawn.name} ate ${maxFoodToEat}x ${food.name}, hunger reduced by ${hungerReduction}`);
			}
		}

		// FIXED: Set eating state but ensure it gets cleared
		updatedPawn.state = {
			...pawn.state,
			isEating: totalHungerReduction > 0, // Only set eating if actually ate something
			isWorking: false, // Stop working to eat
			isSleeping: false,
			mood: Math.min(100, pawn.state.mood + Math.floor(totalHungerReduction * 0.1)) // Small mood boost
		};

		console.log(`[GameEngine] ${pawn.name} total eating result: hunger ${pawn.needs.hunger} → ${updatedPawn.needs.hunger} (reduced by ${totalHungerReduction.toFixed(1)})`);
		return updatedPawn;
	}

	// UPDATED: Sleeping continues until hunger/fatigue balance changes
	private tryAutomaticSleeping(pawn: Pawn): Pawn {
		// Calculate rest recovery
		const recovery = this.calculateRestRecovery(pawn);

		// Update pawn
		const updatedPawn = { ...pawn };
		updatedPawn.needs = {
			...pawn.needs,
			fatigue: Math.max(0, pawn.needs.fatigue - recovery),
			lastSleep: this.gameState!.turn
		};
		updatedPawn.state = {
			...pawn.state,
			isSleeping: true,
			isWorking: false, // Stop working to sleep
			isEating: false
		};

		console.log(`[GameEngine] ${pawn.name} sleeping: fatigue ${pawn.needs.fatigue} → ${updatedPawn.needs.fatigue} (recovery: ${recovery})`);
		return updatedPawn;
	}

	// NEW METHOD: Find available food in gameState
	private findAvailableFood(): any[] {
		if (!this.gameState!.item) {
			return [];
		}

		const availableFood = this.gameState!.item.filter(item => {
			const hasNutrition = item.nutrition && item.nutrition > 0;
			const hasAmount = item.amount && item.amount > 0;
			return hasNutrition && hasAmount;
		});

		console.log(`[GameEngine] Found ${availableFood.length} available food items`);
		return availableFood;
	}

	// NEW METHOD: Select best food by nutrition value
	private selectBestFood(availableFood: any[]): any {
		if (availableFood.length === 0) return null;

		const bestFood = availableFood.reduce((best, current) => {
			const currentNutrition = current.nutrition || 0;
			const bestNutrition = best.nutrition || 0;
			return currentNutrition > bestNutrition ? current : best;
		});

		console.log(`[GameEngine] Selected best food: ${bestFood.name} (nutrition: ${bestFood.nutrition})`);
		return bestFood;
	}

	// NEW METHOD: Consume food from inventory
	private consumeFoodFromInventory(foodId: string, amount: number): void {
		if (!this.gameState!.item) return;

		const foodIndex = this.gameState!.item.findIndex(item => item.id === foodId);
		if (foodIndex !== -1) {
			this.gameState!.item[foodIndex] = {
				...this.gameState!.item[foodIndex],
				amount: Math.max(0, this.gameState!.item[foodIndex].amount - amount)
			};

			// Remove item if amount reaches 0
			if (this.gameState!.item[foodIndex].amount <= 0) {
				this.gameState!.item.splice(foodIndex, 1);
			}

			console.log(`[GameEngine] Consumed ${amount}x ${foodId} from inventory`);
		}
	}

	// SIMPLIFIED: Direct nutrition eating - no bonuses
	private calculateFoodRecovery(pawn: Pawn, food: any): number {
		// SIMPLE: Direct nutrition value mapping - no bonuses!
		const nutritionValue = food.nutrition || 1.0;
		return nutritionValue; // 1 nutrition = 1 hunger reduction
	}

	// SIMPLIFIED: Direct rest recovery - no bonuses
	private calculateRestRecovery(pawn: Pawn): number {
		return 5; // Simple fixed rest recovery
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