import type { Building, GameState, PlacedBuilding } from '../core/types';
import buildingsData from '../database/buildings.jsonc';
import { RARITY_COLORS } from '../database/colors';

const AVAILABLE_BUILDINGS = buildingsData as unknown as Building[];

/**
 * BuildingService - Clean interface for building queries and validation
 * Separates business logic from data definitions
 */
export interface BuildingService {
	// Query Methods
	getBuildingById(id: string): Building | undefined;
	getBuildingsByCategory(category: string): Building[];
	getBuildingsByTier(tier: number): Building[];
	getBuildingsByRarity(rarity: string): Building[];
	getAvailableBuildings(gameState: GameState, category?: string): Building[];

	// Validation Methods
	canBuildBuilding(buildingId: string, gameState: GameState): boolean;
	hasRequiredResources(buildingId: string, gameState: GameState): boolean;
	hasRequiredResearch(buildingId: string, gameState: GameState): boolean;
	hasRequiredPopulation(buildingId: string, gameState: GameState): boolean;
	hasRequiredTools(buildingId: string, gameState: GameState): boolean;
	meetsStateRestrictions(buildingId: string, gameState: GameState): boolean;

	// Calculation Methods
	calculateBuildingCost(buildingId: string): Record<string, number>;
	calculateBuildingEffects(buildingId: string): Record<string, number>;
	calculateConstructionTime(buildingId: string, gameState: GameState): number;
	calculateBuildingEfficiency(buildingId: string, gameState: GameState): number;

	// Building Management
	getBuildingDependencies(buildingId: string): string[];
	getBuildingUnlocks(buildingId: string): Building[];
	getBuildingMaintenanceNeeds(buildingId: string): {
		upkeep: Record<string, number>;
		requirements: string[];
	};

	// Building Queue Processing
	processBuildingQueue(gameState: GameState): GameState;

	// Phase 4d: Tile-placed buildings
	placeBuilding(type: string, x: number, y: number, gameState: GameState): GameState;
	hasCompletedBuilding(type: string, gameState: GameState): boolean;
	countCompletedBuildings(type: string, gameState: GameState): number;

	// UI Helper Methods
	getBuildingIcon(buildingId: string): string;
	getBuildingColor(buildingId: string): string;
	getBuildingRarityColor(rarity: string): string;
	hasBuildings(buildingCounts: Record<string, number>, category: string): boolean;
}

/**
 * BuildingService Implementation
 */
export class BuildingServiceImpl implements BuildingService {
	getBuildingById(id: string): Building | undefined {
		return AVAILABLE_BUILDINGS.find((building) => building.id === id);
	}

	getBuildingsByCategory(category: string): Building[] {
		return AVAILABLE_BUILDINGS.filter((building) => building.category === category);
	}

	getBuildingsByTier(tier: number): Building[] {
		return AVAILABLE_BUILDINGS.filter((building) => building.tier === tier);
	}

	getBuildingsByRarity(rarity: string): Building[] {
		return AVAILABLE_BUILDINGS.filter((building) => building.rarity === rarity);
	}

	getAvailableBuildings(gameState: GameState, category?: string): Building[] {
		let buildings = AVAILABLE_BUILDINGS;

		// Filter by category if specified
		if (category) {
			buildings = buildings.filter((building) => building.category === category);
		}

		return buildings.filter((building) => this.canBuildBuilding(building.id, gameState));
	}

	canBuildBuilding(buildingId: string, gameState: GameState): boolean {
		const building = this.getBuildingById(buildingId);
		if (!building) return false;

		// Check all requirements
		return (
			this.hasRequiredResources(buildingId, gameState) &&
			this.hasRequiredResearch(buildingId, gameState) &&
			this.hasRequiredPopulation(buildingId, gameState) &&
			this.hasRequiredTools(buildingId, gameState) &&
			this.meetsStateRestrictions(buildingId, gameState)
		);
	}

	hasRequiredResources(buildingId: string, gameState: GameState): boolean {
		const building = this.getBuildingById(buildingId);
		if (!building?.buildingCost) return true;

		return Object.entries(building.buildingCost).every(([resourceId, cost]) => {
			const available = (gameState.stockpile ?? {})[resourceId] ?? 0;
			return available >= cost;
		});
	}

	hasRequiredResearch(buildingId: string, gameState: GameState): boolean {
		const building = this.getBuildingById(buildingId);
		if (!building?.researchRequired) return true;

		return gameState.completedResearch.includes(building.researchRequired);
	}

	hasRequiredPopulation(buildingId: string, gameState: GameState): boolean {
		const building = this.getBuildingById(buildingId);
		if (!building) return false;

		const currentPop = gameState.pawns.length;
		const maxPop = gameState.maxPopulation;

		// Check minimum population requirement
		if (currentPop < building.populationRequired) return false;

		// Check if building would exceed max population (for non-housing buildings)
		if (building.category !== 'housing' && currentPop >= maxPop) return false;

		return true;
	}

	hasRequiredTools(buildingId: string, gameState: GameState): boolean {
		const building = this.getBuildingById(buildingId);
		if (!building?.toolTierRequired) return true;

		return gameState.currentToolLevel >= building.toolTierRequired;
	}

	meetsStateRestrictions(buildingId: string, gameState: GameState): boolean {
		const building = this.getBuildingById(buildingId);
		if (!building?.buildingState) return true;

		const currentCount = (gameState.buildings ?? []).filter(
			(b) => b.type === buildingId && b.status === 'complete'
		).length;

		// Check if building is unique and already exists
		if (building.buildingState.isUnique && currentCount > 0) return false;

		// Check maximum count
		if (building.buildingState.maxCount && currentCount >= building.buildingState.maxCount)
			return false;

		return true;
	}

	calculateBuildingCost(buildingId: string): Record<string, number> {
		const building = this.getBuildingById(buildingId);
		return building?.buildingCost || {};
	}

	calculateBuildingEffects(buildingId: string): Record<string, number> {
		const building = this.getBuildingById(buildingId);
		return building?.effects || {};
	}

	calculateConstructionTime(buildingId: string, gameState: GameState): number {
		const building = this.getBuildingById(buildingId);
		if (!building) return 0;

		let time = building.buildTime;

		// Apply population bonus (more workers = faster construction)
		const availableWorkers = Math.min(gameState.pawns.length, building.populationRequired * 2);
		const workerBonus = Math.max(0.5, availableWorkers / building.populationRequired);
		time = Math.round(time / workerBonus);

		return Math.max(1, time);
	}

	calculateBuildingEfficiency(buildingId: string, gameState: GameState): number {
		// Simple efficiency calculation without modifier system dependency
		let efficiency = 1.0;

		// Apply network effects from synergies
		const building = this.getBuildingById(buildingId);
		if (building?.synergies?.networkEffects) {
			const count = (gameState.buildings ?? []).filter(
				(b) => b.type === buildingId && b.status === 'complete'
			).length;
			Object.entries(building.synergies.networkEffects).forEach(([effect, bonus]) => {
				efficiency += bonus * count;
			});
		}

		return efficiency;
	}

	getBuildingDependencies(buildingId: string): string[] {
		const building = this.getBuildingById(buildingId);
		if (!building) return [];

		const dependencies = [];

		if (building.researchRequired) {
			dependencies.push(`Research: ${building.researchRequired}`);
		}

		if (building.toolTierRequired && building.toolTierRequired > 0) {
			dependencies.push(`Tool Level: ${building.toolTierRequired}`);
		}

		if (building.populationRequired > 0) {
			dependencies.push(`Population: ${building.populationRequired}`);
		}

		return dependencies;
	}

	getBuildingUnlocks(buildingId: string): Building[] {
		return AVAILABLE_BUILDINGS.filter((building) => {
			// Check if this building is required for construction
			if (building.researchRequired === buildingId) return true;

			// Check synergies
			if (building.synergies?.chainBonus?.includes(buildingId)) return true;

			return false;
		});
	}

	getBuildingMaintenanceNeeds(buildingId: string): {
		upkeep: Record<string, number>;
		requirements: string[];
	} {
		const building = this.getBuildingById(buildingId);
		if (!building) return { upkeep: {}, requirements: [] };

		const upkeep = building.upkeepCost || {};
		const requirements = [];

		if (building.itemInteractions?.requires) {
			requirements.push(...building.itemInteractions.requires);
		}

		if (building.buildingState?.environmentalNeeds) {
			requirements.push(...building.buildingState.environmentalNeeds);
		}

		return { upkeep, requirements };
	}

	processBuildingQueue(gameState: GameState): GameState {
		console.log('[BuildingService] Processing building queue');

		if (gameState.buildingQueue.length === 0) return gameState;

		let newBuildings = [...(gameState.buildings ?? [])];
		const newBuildingCounts = { ...(gameState.buildingCounts ?? {}) };

		const updatedBuildingQueue = gameState.buildingQueue
			.map((entry) => ({ ...entry, turnsRemaining: entry.turnsRemaining - 1 }))
			.filter((entry) => {
				if (entry.turnsRemaining <= 0) {
					// Building completed — push into buildings[] as a complete PlacedBuilding
					const placed: PlacedBuilding = {
						id: `${entry.building.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
						type: entry.building.id,
						x: 0, // abstract queue buildings have no tile coords
						y: 0,
						status: 'complete',
						progress: 1
					};
					newBuildings = [...newBuildings, placed];
					// Keep buildingCounts in sync for backward compat
					newBuildingCounts[entry.building.id] =
						(newBuildingCounts[entry.building.id] ?? 0) + 1;
					console.log('[BuildingService] Building completed:', entry.building.id);
					return false;
				}
				return true;
			});

		return {
			...gameState,
			buildingQueue: updatedBuildingQueue,
			buildings: newBuildings,
			buildingCounts: newBuildingCounts
		};
	}

	/**
	 * Phase 4d / Phase 5c: Place a building at specific tile coordinates with status 'planned'.
	 * Sets workRequired = buildTime × 10 so that JobService can generate a construct job.
	 */
	placeBuilding(type: string, x: number, y: number, gameState: GameState): GameState {
		const building = this.getBuildingById(type);
		if (!building) {
			console.warn(`[BuildingService] Unknown building type: ${type}`);
			return gameState;
		}
		const placed: PlacedBuilding = {
			id: `${type}-${x}-${y}-${Date.now()}`,
			type,
			x,
			y,
			// Phase 6: zero-buildTime buildings (craft_spot) are complete immediately
			status: building.buildTime === 0 ? 'complete' : 'planned',
			progress: building.buildTime === 0 ? 1 : 0,
			// Phase 5c: work-point model
			workRequired: building.buildTime * 10,
			workDone: building.buildTime === 0 ? building.buildTime * 10 : 0,
			materialsDelivered: false
		};
		return {
			...gameState,
			buildings: [...(gameState.buildings ?? []), placed]
		};
	}

	/**
	 * Helper: does any complete building of this type exist?
	 */
	hasCompletedBuilding(type: string, gameState: GameState): boolean {
		return (gameState.buildings ?? []).some(
			(b) => b.type === type && b.status === 'complete'
		);
	}

	/**
	 * Helper: count complete buildings of this type.
	 */
	countCompletedBuildings(type: string, gameState: GameState): number {
		return (gameState.buildings ?? []).filter(
			(b) => b.type === type && b.status === 'complete'
		).length;
	}

	getBuildingIcon(buildingId: string): string {
		const building = this.getBuildingById(buildingId);
		if (building?.emoji) return building.emoji;

		// Fallback icons based on category
		const categoryIcons: Record<string, string> = {
			housing: '🏠',
			production: '🔨',
			food: '🍖',
			knowledge: '📜',
			military: '⚔️',
			magical: '⚗️',
			commerce: '🏪'
		};

		return categoryIcons[building?.category || 'production'] || '🏗️';
	}

	getBuildingColor(buildingId: string): string {
		const building = this.getBuildingById(buildingId);
		return building?.color || '#4CAF50';
	}

	getBuildingRarityColor(rarity: string): string {
		return RARITY_COLORS[rarity] ?? '#9E9E9E';
	}

	hasBuildings(buildingCountsOrGameState: Record<string, number> | GameState, category: string): boolean {
		// Support legacy buildingCounts map or full GameState
		const buildingCounts: Record<string, number> =
			'buildings' in buildingCountsOrGameState
				? {}
				: (buildingCountsOrGameState as Record<string, number>);

		if ('buildings' in buildingCountsOrGameState) {
			// New path: check buildings array
			const gs = buildingCountsOrGameState as GameState;
			return (gs.buildings ?? []).some((b) => {
				if (b.status !== 'complete') return false;
				const building = this.getBuildingById(b.type);
				return building?.category === category;
			});
		}

		return Object.entries(buildingCounts).some(([buildingId, count]) => {
			if (count > 0) {
				const building = this.getBuildingById(buildingId);
				return building?.category === category;
			}
			return false;
		});
	}
}

// Export singleton instance
export const buildingService = new BuildingServiceImpl();
