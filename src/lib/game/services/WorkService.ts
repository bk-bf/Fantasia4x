import type {
	Pawn,
	Location,
	GameState,
	WorkAssignment,
	ProductionTarget,
	WorkCategory
} from '../core/types';
import { WORK_CATEGORIES } from '../core/Work';
import { itemService } from './ItemService';

// Lazy import to avoid circular dependency
let gameEngineInstance: any = null;

/**
 * WorkService - Clean interface for work assignment and management
 * Separates business logic from data definitions
 */
export interface WorkService {
	// Query Methods
	getWorkCategory(workId: string): WorkCategory | undefined;
	getAllWorkCategories(): WorkCategory[];
	getWorkCategoriesByLocation(locationId: string): WorkCategory[];
	getAvailableWork(gameState: GameState, locationId?: string): WorkCategory[];

	// Assignment Methods
	assignPawnToWork(
		pawnId: string,
		workType: string,
		locationId: string,
		gameState: GameState
	): GameState;
	getOptimalWorkAssignment(
		pawns: Pawn[],
		productionTargets: ProductionTarget[],
		gameState: GameState
	): Record<string, WorkAssignment>;
	updateWorkPriorities(
		pawnId: string,
		priorities: Record<string, number>,
		gameState: GameState
	): GameState;

	// Calculation Methods
	calculateWorkEfficiency(
		pawn: Pawn,
		workCategory: WorkCategory,
		location?: Location,
		gameState?: GameState
	): number;
	calculateResourceProduction(
		workAssignment: WorkAssignment,
		gameState: GameState
	): Record<string, number>;
	calculateHarvestAmount(
		pawn: Pawn,
		workType: string,
		priority: number,
		gameState: GameState
	): number;

	// Validation Methods
	canPawnDoWork(pawn: Pawn, workCategory: WorkCategory, gameState: GameState): boolean;
	hasRequiredTools(pawn: Pawn, workCategory: WorkCategory, gameState: GameState): boolean;
	hasRequiredSkills(pawn: Pawn, workCategory: WorkCategory): boolean;

	// Processing Methods
	processWorkHarvesting(gameState: GameState): GameState;
	getAvailableResourceIdsForWork(gameState: GameState, workType: string, locationId?: string): string[];

	// UI Helper Methods
	getWorkEfficiencyDescription(pawn: Pawn, workType: string, gameState: GameState): string;
}

/**
 * WorkService Implementation
 */
export class WorkServiceImpl implements WorkService {
	private gameEngine: any = null;

	// Method to set GameEngine reference (called from GameEngine constructor)
	setGameEngine(gameEngine: any) {
		this.gameEngine = gameEngine;
	}

	getAvailableResourceIdsForWork(gameState: GameState, workType: string, locationId?: string): string[] {
		if (locationId) {
			if (this.gameEngine && typeof this.gameEngine.getLocationResourcesForWorkType === 'function') {
				try {
					const resources = this.gameEngine.getLocationResourcesForWorkType(locationId, workType);
					console.log(`[WorkService] Available resources for ${workType} at ${locationId}:`, resources);
					return resources || [];
				} catch (error) {
					console.error('[WorkService] Error calling GameEngine method:', error);
				}
			} else {
				console.warn('[WorkService] GameEngine not available or method missing');
			}

			// If GameEngine fails, return empty array to prevent wrong resources
			console.log(`[WorkService] No location-specific resources available for ${workType} at ${locationId}`);
			return [];
		} else {
			return this.getFallbackResources(workType);
		}
	}

	private getFallbackResources(workType: string): string[] {
		// Fallback: Get all possible resources for this work type (when no location specified)
		const availableItems = itemService.getItemsByWorkType(workType);
		const resources = availableItems.map(item => item.id);
		console.log(`[WorkService] Fallback resources for ${workType}:`, resources);
		return resources;
	}
	getWorkCategory(workId: string): WorkCategory | undefined {
		return WORK_CATEGORIES.find((work) => work.id === workId);
	}

	getAllWorkCategories(): WorkCategory[] {
		return [...WORK_CATEGORIES];
	}

	getWorkCategoriesByLocation(locationId: string): WorkCategory[] {
		// TODO: Implement when location system is available
		// For now, return all work categories
		return WORK_CATEGORIES;
	}

	getAvailableWork(gameState: GameState, locationId?: string): WorkCategory[] {
		return WORK_CATEGORIES.filter((work) => {
			// Check if pawn has required tools for this work
			const hasTools =
				!work.toolsRequired ||
				work.toolsRequired.some((toolType) => {
					return gameState.item.some(
						(item) => item.type === 'tool' && item.category === toolType && item.amount > 0
					);
				});

			return hasTools;
		});
	}

	assignPawnToWork(
		pawnId: string,
		workType: string,
		locationId: string,
		gameState: GameState
	): GameState {
		const newState = { ...gameState };

		// Initialize work assignments if not exists
		if (!newState.workAssignments) {
			newState.workAssignments = {};
		}

		// Create or update work assignment
		const currentAssignment = newState.workAssignments[pawnId] || {
			pawnId,
			workPriorities: {},
			authorizedLocations: [locationId]
		};

		newState.workAssignments[pawnId] = {
			...currentAssignment,
			currentWork: workType,
			activeLocation: locationId,
			workPriorities: {
				...currentAssignment.workPriorities,
				[workType]: 10 // High priority for assigned work
			}
		};

		return newState;
	}

	getOptimalWorkAssignment(
		pawns: Pawn[],
		productionTargets: ProductionTarget[],
		gameState: GameState
	): Record<string, WorkAssignment> {
		const assignments: Record<string, WorkAssignment> = {};

		// Initialize assignments for all pawns
		pawns.forEach((pawn) => {
			assignments[pawn.id] = {
				pawnId: pawn.id,
				workPriorities: {},
				authorizedLocations: [] // TODO: Get from discovered locations
			};
		});

		// Assign pawns to production targets based on efficiency
		productionTargets.forEach((target) => {
			const workCategory = this.getWorkCategory(target.workCategoryId);
			if (!workCategory) return;

			// Calculate efficiency for each pawn
			const pawnEfficiencies = pawns.map((pawn) => ({
				pawn,
				efficiency: this.calculateWorkEfficiency(pawn, workCategory, undefined, gameState)
			}));

			// Sort by efficiency and assign best pawns
			pawnEfficiencies
				.sort((a, b) => b.efficiency - a.efficiency)
				.slice(0, target.assignedPawns.length)
				.forEach(({ pawn }) => {
					assignments[pawn.id].currentWork = workCategory.id;
					assignments[pawn.id].activeLocation = target.locationId;
					assignments[pawn.id].workPriorities[workCategory.id] = 10;
				});
		});

		return assignments;
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
			workPriorities: {},
			authorizedLocations: []
		};

		newState.workAssignments[pawnId] = {
			...currentAssignment,
			workPriorities: { ...priorities }
		};

		return newState;
	}

	calculateWorkEfficiency(
		pawn: Pawn,
		workCategory: WorkCategory,
		location?: Location,
		gameState?: GameState
	): number {
		// Simple efficiency calculation without modifier system dependency
		if (gameState) {
			// Basic efficiency calculation based on pawn skills
			let efficiency = 1.0;

			// Apply pawn skill bonuses
			if (pawn.skills && workCategory.id in pawn.skills) {
				efficiency += pawn.skills[workCategory.id] / 100;
			}

			return efficiency;
		}

		// Fallback to basic calculation when no game state available
		let efficiency = workCategory.baseEfficiency;
		const primaryStatValue = pawn.stats[workCategory.primaryStat] || 10;
		efficiency *= primaryStatValue / 10;

		if (workCategory.secondaryStat) {
			const secondaryStatValue = pawn.stats[workCategory.secondaryStat] || 10;
			efficiency *= 1 + (secondaryStatValue - 10) / 50;
		}

		// Location work modifiers
		if (location?.workModifiers && location.workModifiers[workCategory.id]) {
			efficiency *= location.workModifiers[workCategory.id];
		}

		return Math.max(0.1, efficiency);
	}

	calculateResourceProduction(
		workAssignment: WorkAssignment,
		gameState: GameState
	): Record<string, number> {
		const production: Record<string, number> = {};

		if (!workAssignment.currentWork) return production;

		const workCategory = this.getWorkCategory(workAssignment.currentWork);
		const pawn = gameState.pawns.find((p) => p.id === workAssignment.pawnId);

		if (!workCategory || !pawn) return production;

		const efficiency = this.calculateWorkEfficiency(pawn, workCategory, undefined, gameState);
		const availableResources = this.getAvailableResourceIdsForWork(
			gameState,
			workAssignment.currentWork
		);

		// Calculate base production for each available resource
		availableResources.forEach((resourceId) => {
			const priority = workAssignment.workPriorities[workAssignment.currentWork!] || 1;
			const baseProduction = efficiency * priority * 0.5; // Base production rate
			production[resourceId] = (production[resourceId] || 0) + baseProduction;
		});

		return production;
	}

	calculateHarvestAmount(
		pawn: Pawn,
		workType: string,
		priority: number,
		gameState: GameState
	): number {
		const workCategory = this.getWorkCategory(workType);
		if (!workCategory) return 0;

		const efficiency = this.calculateWorkEfficiency(pawn, workCategory, undefined, gameState);
		const baseHarvestRate = 2; // Base harvest rate

		const harvestAmount = Math.floor(priority * baseHarvestRate * efficiency);
		return Math.max(1, harvestAmount);
	}

	canPawnDoWork(pawn: Pawn, workCategory: WorkCategory, gameState: GameState): boolean {
		// Check required tools
		if (!this.hasRequiredTools(pawn, workCategory, gameState)) return false;

		// Check required skills
		if (!this.hasRequiredSkills(pawn, workCategory)) return false;

		return true;
	}

	hasRequiredTools(pawn: Pawn, workCategory: WorkCategory, gameState: GameState): boolean {
		if (!workCategory.toolsRequired) return true;

		// Check if any required tools are available in inventory or equipped
		return workCategory.toolsRequired.some((toolType: string) => {
			// Check equipped items
			if (pawn.equipment.tool?.itemId) {
				const equippedTool = gameState.item.find((item) => item.id === pawn.equipment.tool?.itemId);
				if (equippedTool && equippedTool.category === toolType) return true;
			}

			// Check inventory
			return gameState.item.some(
				(item) => item.type === 'tool' && item.category === toolType && item.amount > 0
			);
		});
	}

	hasRequiredSkills(pawn: Pawn, workCategory: WorkCategory): boolean {
		if (!workCategory.skillRequired) return true;

		const skillLevel = pawn.skills[workCategory.skillRequired] || 0;
		return skillLevel > 0; // Basic skill requirement
	}

	processWorkHarvesting(gameState: GameState): GameState {
		if (!gameState.pawns || gameState.pawns.length === 0) return gameState;

		let newState = { ...gameState };
		const harvestedResources: Record<string, number> = {};

		if (!newState.currentJobIndex) newState.currentJobIndex = {};

		console.log('[WorkService] Processing work for pawns:', gameState.pawns.length);

		gameState.pawns.forEach((pawn) => {
			const workAssignment = gameState.workAssignments[pawn.id];
			if (!workAssignment) {
				console.log(`[WorkService] No work assignment for pawn: ${pawn.name}`);
				return;
			}

			const sortedWorks = Object.entries(workAssignment.workPriorities)
				.filter(([_, priority]) => priority > 0)
				.sort(([, a], [, b]) => b - a); // Sort by priority descending

			if (sortedWorks.length === 0) {
				console.log(`[WorkService] No prioritized work for pawn: ${pawn.name}`);
				return;
			}

			// Get current job index for this pawn, default to 0
			const idx = newState.currentJobIndex[pawn.id] ?? 0;
			const [workType, priority] = sortedWorks[idx % sortedWorks.length];

			console.log(`[WorkService] Pawn ${pawn.name} doing ${workType} with priority ${priority} at ${workAssignment.activeLocation}`);

			// CHANGE: Get available resource IDs for this work type AT THIS LOCATION
			const availableResourceIds = this.getAvailableResourceIdsForWork(
				gameState,
				workType,
				workAssignment.activeLocation  // ← ADD THE LOCATION!
			);

			if (availableResourceIds.length === 0) {
				console.log(`[WorkService] No resources available for ${workType} at ${workAssignment.activeLocation}`);
				return;
			}

			// For each available resource, calculate harvest amount
			availableResourceIds.forEach((resourceId) => {
				const harvestAmount = this.calculateHarvestAmount(pawn, workType, priority, gameState);
				if (harvestAmount > 0) {
					harvestedResources[resourceId] = (harvestedResources[resourceId] || 0) + harvestAmount;
					console.log(`[WorkService] ${pawn.name} harvested ${harvestAmount} ${resourceId} from ${workAssignment.activeLocation}`);
				}
			});

			// Advance to next job for next turn
			newState.currentJobIndex[pawn.id] = (idx + 1) % sortedWorks.length;
		});

		// Add harvested resources to player inventory
		Object.entries(harvestedResources).forEach(([resourceId, amount]) => {
			console.log(`[WorkService] Adding ${amount} ${resourceId} to game state`);
			newState = itemService.addItems({ [resourceId]: amount }, newState);
		});

		console.log('[WorkService] Harvest processing completed');
		return newState;
	}

	getWorkEfficiencyDescription(pawn: Pawn, workType: string, gameState: GameState): string {
		const workCategory = this.getWorkCategory(workType);
		if (!workCategory) return 'Unknown work type';

		const efficiency = this.calculateWorkEfficiency(pawn, workCategory, undefined, gameState);
		const efficiencyPercent = Math.round(efficiency * 100);

		// Build description based on available data
		const sources = [];

		if (pawn.skills[workType]) {
			sources.push(`Skill: ${pawn.skills[workType]}`);
		}

		if (pawn.stats[workCategory.primaryStat]) {
			sources.push(`${workCategory.primaryStat}: ${pawn.stats[workCategory.primaryStat]}`);
		}

		const sourceText = sources.length > 0 ? ` (${sources.join(', ')})` : '';
		return `${efficiencyPercent}% efficiency${sourceText}`;
	}
}

// Export singleton instance
export const workService = new WorkServiceImpl();
