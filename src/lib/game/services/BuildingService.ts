import type { Building, GameState } from '../core/types';
import { AVAILABLE_BUILDINGS } from '../core/Buildings';

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
      const available = gameState.item.find((item) => item.id === resourceId)?.amount || 0;
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

    const currentCount = gameState.buildingCounts[buildingId] || 0;

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
      const count = gameState.buildingCounts[buildingId] || 0;
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
    switch (rarity) {
      case 'common':
        return '#9E9E9E';
      case 'uncommon':
        return '#4CAF50';
      case 'rare':
        return '#2196F3';
      case 'epic':
        return '#9C27B0';
      case 'legendary':
        return '#FF9800';
      default:
        return '#9E9E9E';
    }
  }

  hasBuildings(buildingCounts: Record<string, number>, category: string): boolean {
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
