import type { GameState } from '../core/types';
import {
	LOCATION_TEMPLATES,
	type LocationTemplate,
	type LocationWithResources,
	type ResourceNode,
	type ResourceNodeTemplate
} from '../core/Locations';

// Forward declaration to avoid circular import
interface ItemService {
	getItemById(id: string): any;
}

/**
 * LocationService - Clean interface for location queries and operations
 * Separates business logic from data definitions
 */
export interface LocationService {
	// Query Methods
	getLocationById(id: string): LocationWithResources | undefined;
	getLocationsByType(type: string): LocationWithResources[];
	getLocationsByTier(tier: number): LocationWithResources[];
	getDiscoveredLocations(): LocationWithResources[];
	getUndiscoveredLocations(): LocationWithResources[];

	// Resource Methods
	getAvailableResources(locationId: string): string[];
	// REMOVE: getResourcesForWorkType(locationId: string, workType: string, itemService?: ItemService): string[];
	getResourceAvailability(locationId: string, resourceId: string): {
		available: number;
		maxAmount: number;
		renewalRate: number;
		isRenewable: boolean;
	};

	// Discovery Methods
	canExploreLocation(locationId: string, gameState: GameState): boolean;
	discoverLocation(locationId: string): boolean;

	// Resource Management
	extractResource(locationId: string, resourceId: string, amount: number): number;
	processLocationRenewal(locationId: string): void;
	processAllLocationRenewal(): void;

	// Work Methods - REMOVE canPerformWorkAtLocation
	getWorkModifier(locationId: string, workType: string): number;

	// Initialization
	initializeAllLocations(): void;

	// Utility Methods
	evaluateResourceRichness(currentRange: [number, number], maxRange: [number, number]): string;
	getRichnessColor(richness: string): string;
	getRichnessEmoji(richness: string): string;
}

/**
 * LocationService Implementation
 */
export class LocationServiceImpl implements LocationService {
	private locationsDatabase: LocationWithResources[] = [];

	constructor() {
		this.initializeAllLocations();
	}

	// ===== INITIALIZATION =====

	initializeAllLocations(): void {
		this.locationsDatabase = LOCATION_TEMPLATES.map(template =>
			this.initializeLocation(template)
		);

		console.log(`[LocationService] Initialized ${this.locationsDatabase.length} locations`);
	}

	private initializeLocation(template: LocationTemplate): LocationWithResources {
		const resourceNodes: Record<string, ResourceNode> = {};

		Object.entries(template.resourceTemplates).forEach(([id, template]) => {
			resourceNodes[id] = this.generateResourceNode(template);
		});

		return {
			...template,
			resourceNodes
		};
	}

	private generateResourceNode(template: ResourceNodeTemplate): ResourceNode {
		const [minCurrent, maxCurrent] = template.currentAmountRange;
		const [minMax, maxMax] = template.maxAmountRange;

		const maxAmount = Math.floor(Math.random() * (maxMax - minMax + 1)) + minMax;
		const currentAmount = Math.min(
			Math.floor(Math.random() * (maxCurrent - minCurrent + 1)) + minCurrent,
			maxAmount
		);

		return {
			id: template.id,
			currentAmount,
			maxAmount,
			renewalRate: template.renewalRate,
			renewalType: template.renewalType,
			depletion: template.depletion
		};
	}

	// ===== QUERY METHODS =====

	getLocationById(id: string): LocationWithResources | undefined {
		return this.locationsDatabase.find(l => l.id === id);
	}

	getLocationsByType(type: string): LocationWithResources[] {
		return this.locationsDatabase.filter(location => location.type === type);
	}

	getLocationsByTier(tier: number): LocationWithResources[] {
		return this.locationsDatabase.filter(location => location.tier === tier);
	}

	getDiscoveredLocations(): LocationWithResources[] {
		return this.locationsDatabase.filter(location => location.discovered);
	}

	getUndiscoveredLocations(): LocationWithResources[] {
		return this.locationsDatabase.filter(location => !location.discovered);
	}

	// ===== RESOURCE METHODS =====

	getAvailableResources(locationId: string): string[] {
		console.log(`[LocationService] Getting available resources for location: ${locationId}`);

		const location = this.getLocationById(locationId);
		if (!location) {
			console.log(`[LocationService] Location not found: ${locationId}`);
			console.log(`[LocationService] Available locations:`, this.locationsDatabase.map(l => l.id));
			return [];
		}

		console.log(`[LocationService] Found location: ${location.name}, discovered: ${location.discovered}`);

		if (location.resourceNodes) {
			const availableResources = Object.keys(location.resourceNodes).filter(
				resourceId => location.resourceNodes[resourceId].currentAmount > 0
			);
			console.log(`[LocationService] Resource nodes for ${locationId}:`, Object.keys(location.resourceNodes));
			console.log(`[LocationService] Available resources (amount > 0):`, availableResources);
			return availableResources;
		}

		// Fallback to legacy format
		const legacyResources = [
			...location.availableResources.tier0,
			...location.availableResources.tier1,
			...location.availableResources.tier2
		];
		console.log(`[LocationService] Using legacy resources for ${locationId}:`, legacyResources);
		return legacyResources;
	}

	getResourceAvailability(locationId: string, resourceId: string) {
		const location = this.getLocationById(locationId);
		if (!location) {
			return { available: 0, maxAmount: 0, renewalRate: 0, isRenewable: false };
		}

		const node = location.resourceNodes?.[resourceId];
		if (!node) {
			return { available: 0, maxAmount: 0, renewalRate: 0, isRenewable: false };
		}

		return {
			available: node.currentAmount,
			maxAmount: node.maxAmount,
			renewalRate: node.renewalRate,
			isRenewable: node.renewalType !== 'none'
		};
	}

	// ===== DISCOVERY METHODS =====

	canExploreLocation(locationId: string, gameState: GameState): boolean {
		const location = this.getLocationById(locationId);
		if (!location) return false;

		const availableTools = gameState.item.map(i => i.id);
		const availableBuildings = Object.keys(gameState.buildingCounts);

		return this.checkExplorationRequirements(
			location,
			gameState.pawns.length,
			availableTools,
			gameState.completedResearch,
			availableBuildings
		);
	}

	private checkExplorationRequirements(
		location: LocationWithResources,
		currentPopulation: number,
		availableTools: string[],
		completedResearch: string[],
		availableBuildings: string[]
	): boolean {
		if (location.explorationRequirements.population &&
			currentPopulation < location.explorationRequirements.population) {
			return false;
		}

		if (location.explorationRequirements.tools) {
			const hasRequiredTools = location.explorationRequirements.tools.every(tool =>
				availableTools.includes(tool)
			);
			if (!hasRequiredTools) return false;
		}

		if (location.explorationRequirements.research) {
			const hasRequiredResearch = location.explorationRequirements.research.every(research =>
				completedResearch.includes(research)
			);
			if (!hasRequiredResearch) return false;
		}

		if (location.explorationRequirements.buildings) {
			const hasRequiredBuildings = location.explorationRequirements.buildings.every(building =>
				availableBuildings.includes(building)
			);
			if (!hasRequiredBuildings) return false;
		}

		return true;
	}

	discoverLocation(locationId: string): boolean {
		const template = LOCATION_TEMPLATES.find(t => t.id === locationId);
		if (!template) return false;

		const existingIndex = this.locationsDatabase.findIndex(l => l.id === locationId);
		if (existingIndex !== -1) {
			this.locationsDatabase[existingIndex].discovered = true;
		} else {
			const newLocation = this.initializeLocation(template);
			newLocation.discovered = true;
			this.locationsDatabase.push(newLocation);
		}

		return true;
	}

	// ===== RESOURCE MANAGEMENT =====

	extractResource(locationId: string, resourceId: string, amount: number): number {
		const location = this.getLocationById(locationId);
		if (!location) return 0;

		const node = location.resourceNodes?.[resourceId];
		if (!node) return 0;

		const extractable = Math.min(amount, node.currentAmount);
		node.currentAmount -= extractable * node.depletion;

		return extractable;
	}

	processLocationRenewal(locationId: string): void {
		const location = this.getLocationById(locationId);
		if (!location) return;

		Object.values(location.resourceNodes).forEach(node => {
			if (node.renewalRate > 0 && node.currentAmount < node.maxAmount) {
				const renewal = Math.min(node.renewalRate, node.maxAmount - node.currentAmount);
				node.currentAmount += renewal;
			}
		});
	}

	processAllLocationRenewal(): void {
		this.locationsDatabase.forEach(location => {
			this.processLocationRenewal(location.id);
		});
	}

	// ===== WORK METHODS =====

	getWorkModifier(locationId: string, workType: string): number {
		const location = this.getLocationById(locationId);
		if (!location?.workModifiers) return 1.0;

		return location.workModifiers[workType] || 1.0;
	}

	// ===== UTILITY METHODS =====

	evaluateResourceRichness(currentRange: [number, number], maxRange: [number, number]): string {
		const currentMid = (currentRange[0] + currentRange[1]) / 2;
		const maxMid = (maxRange[0] + maxRange[1]) / 2;
		const ratio = maxMid > 0 ? currentMid / maxMid : 0;

		if (ratio < 0.2) return 'sparse';
		else if (ratio < 0.4) return 'scarce';
		else if (ratio < 0.6) return 'moderate';
		else if (ratio < 0.9) return 'rich';
		else return 'abundant';
	}

	getRichnessColor(richness: string): string {
		switch (richness) {
			case 'sparse': return '#F44336';
			case 'scarce': return '#FF9800';
			case 'moderate': return '#FFC107';
			case 'rich': return '#8BC34A';
			case 'abundant': return '#4CAF50';
			default: return '#9E9E9E';
		}
	}

	getRichnessEmoji(richness: string): string {
		switch (richness) {
			case 'sparse': return '🔴';
			case 'scarce': return '🟠';
			case 'moderate': return '🟡';
			case 'rich': return '🟢';
			case 'abundant': return '💚';
			default: return '⚪';
		}
	}
}

// Export singleton instance
export const locationService = new LocationServiceImpl();