/**
 * ModifierSystem - Automated Modifier and Bonus Calculation System
 *
 * This system automatically generates work efficiencies and bonuses from Buildings, Items,
 * and other game elements, eliminating the need for manual mapping between systems.
 *
 * Requirements: 4.1, 4.2
 */

import type { GameState, Pawn, Item, Building, RacialTrait } from '../core/types';
import itemsData from '../database/items.jsonc';
import buildingsData from '../database/buildings.jsonc';
import { WORK_CATEGORIES } from '../core/Work';

const ITEMS_DATABASE = itemsData as unknown as Item[];
const AVAILABLE_BUILDINGS = buildingsData as unknown as Building[];

/**
 * Represents a modifier source and its contribution
 */
export interface ModifierSource {
  id: string;
  name: string;
  type: 'item' | 'building' | 'trait' | 'stat' | 'research' | 'location';
  category?: string;
  value: number;
  description: string;
}

/**
 * Aggregated modifier result with all contributing sources
 */
export interface ModifierResult {
  baseValue: number;
  totalValue: number;
  multiplier: number;
  sources: ModifierSource[];
  breakdown: {
    base: number;
    additiveBonus: number;
    multiplicativeBonus: number;
    final: number;
  };
}

/**
 * Building effect calculation result
 */
export interface BuildingEffectResult {
  buildingId: string;
  effects: Record<string, ModifierResult>;
  workBonuses: Record<string, ModifierResult>;
  productionBonuses: Record<string, ModifierResult>;
}

/**
 * Automated Modifier System Interface
 */
export interface ModifierSystem {
  // Building Effect Calculations
  calculateBuildingEffects(buildingId: string, gameState: GameState): BuildingEffectResult;
  calculateAllBuildingEffects(gameState: GameState): Record<string, BuildingEffectResult>;

  // Item Effect Calculations
  calculateItemEffects(itemId: string, context?: any): ModifierResult;
  calculateEquipmentBonuses(pawn: Pawn): Record<string, ModifierResult>;

  // Trait Effect Calculations
  calculateTraitEffects(trait: RacialTrait, pawn: Pawn): Record<string, ModifierResult>;
  calculateAllTraitEffects(pawn: Pawn): Record<string, ModifierResult>;

  // Unified Bonus Calculations
  calculateStatBonus(statName: string, statValue: number, baseValue?: number): ModifierResult;
  calculateResearchBonuses(gameState: GameState): Record<string, ModifierResult>;

  // Auto-Discovery Methods
  discoverWorkBonusesFromItems(): Record<string, Record<string, number>>;
  discoverWorkBonusesFromBuildings(): Record<string, Record<string, number>>;
  discoverProductionBonusesFromBuildings(): Record<string, Record<string, number>>;
}

/**
 * ModifierSystem Implementation
 */
export class ModifierSystemImpl implements ModifierSystem {
  // Cache for expensive calculations
  private calculationCache = new Map<string, any>();
  private cacheValidUntilTurn = -1;

  /**
   * Calculate building effects with auto-discovered bonuses
   */
  calculateBuildingEffects(buildingId: string, gameState: GameState): BuildingEffectResult {
    const building = AVAILABLE_BUILDINGS.find((b) => b.id === buildingId);
    if (!building) {
      return {
        buildingId,
        effects: {},
        workBonuses: {},
        productionBonuses: {}
      };
    }

    const effects: Record<string, ModifierResult> = {};
    const workBonuses: Record<string, ModifierResult> = {};
    const productionBonuses: Record<string, ModifierResult> = {};

    // Auto-discover work bonuses from building properties
    const discoveredWorkBonuses = this.discoverBuildingWorkBonuses(building);
    Object.entries(discoveredWorkBonuses).forEach(([workType, bonus]) => {
      workBonuses[workType] = this.createModifierResult(1.0, bonus, [
        {
          id: buildingId,
          name: building.name,
          type: 'building',
          category: building.category,
          value: bonus,
          description: `${building.name} provides ${(bonus * 100).toFixed(0)}% bonus to ${workType}`
        }
      ]);
    });

    // Auto-discover production bonuses
    if (building.productionBonus) {
      Object.entries(building.productionBonus).forEach(([resource, bonus]) => {
        productionBonuses[resource] = this.createModifierResult(1.0, bonus, [
          {
            id: buildingId,
            name: building.name,
            type: 'building',
            category: building.category,
            value: bonus,
            description: `${building.name} provides ${(bonus * 100).toFixed(0)}% bonus to ${resource} production`
          }
        ]);
      });
    }

    // Auto-discover general effects
    if (building.effects) {
      Object.entries(building.effects).forEach(([effectName, value]) => {
        effects[effectName] = this.createModifierResult(0, value, [
          {
            id: buildingId,
            name: building.name,
            type: 'building',
            category: building.category,
            value,
            description: `${building.name} provides ${effectName}: ${value}`
          }
        ]);
      });
    }

    return {
      buildingId,
      effects,
      workBonuses,
      productionBonuses
    };
  }

  /**
   * Calculate all building effects in the game state
   */
  calculateAllBuildingEffects(gameState: GameState): Record<string, BuildingEffectResult> {
    const results: Record<string, BuildingEffectResult> = {};

    Object.keys(gameState.buildingCounts).forEach((buildingId) => {
      if (gameState.buildingCounts[buildingId] > 0) {
        results[buildingId] = this.calculateBuildingEffects(buildingId, gameState);
      }
    });

    return results;
  }

  /**
   * Calculate item effects
   */
  calculateItemEffects(itemId: string, context?: any): ModifierResult {
    const item = ITEMS_DATABASE.find((i) => i.id === itemId);
    if (!item || !item.effects) {
      return this.createEmptyModifierResult();
    }

    const sources: ModifierSource[] = [];
    let totalValue = 0;

    Object.entries(item.effects).forEach(([effectName, value]) => {
      sources.push({
        id: itemId,
        name: item.name,
        type: 'item',
        category: item.category,
        value,
        description: `${item.name} provides ${effectName}: ${value}`
      });
      totalValue += value;
    });

    return this.createModifierResult(0, totalValue, sources);
  }

  /**
   * Calculate equipment bonuses for a pawn
   */
  calculateEquipmentBonuses(pawn: Pawn): Record<string, ModifierResult> {
    const bonuses: Record<string, ModifierResult> = {};

    if (!pawn.equipment) return bonuses;

    Object.entries(pawn.equipment).forEach(([slot, equipped]) => {
      if (equipped) {
        const item = ITEMS_DATABASE.find((i) => i.id === equipped.itemId);
        if (item && item.effects) {
          Object.entries(item.effects).forEach(([effectName, value]) => {
            if (!bonuses[effectName]) {
              bonuses[effectName] = this.createEmptyModifierResult();
            }

            bonuses[effectName].sources.push({
              id: equipped.itemId,
              name: item.name,
              type: 'item',
              category: item.category,
              value,
              description: `${item.name} (${slot}) provides ${effectName}: ${value}`
            });

            bonuses[effectName].totalValue += value;
          });
        }
      }
    });

    return bonuses;
  }

  /**
   * Calculate trait effects for a pawn
   */
  calculateTraitEffects(trait: RacialTrait, pawn: Pawn): Record<string, ModifierResult> {
    const effects: Record<string, ModifierResult> = {};

    Object.entries(trait.effects).forEach(([effectName, value]) => {
      if (typeof value === 'number') {
        effects[effectName] = this.createModifierResult(0, value, [
          {
            id: trait.name,
            name: trait.name,
            type: 'trait',
            value,
            description: `${trait.name} provides ${effectName}: ${value}`
          }
        ]);
      } else if (typeof value === 'object' && value !== null) {
        // Handle nested map effects like workSpeed / workYield / workQuality
        Object.entries(value).forEach(([subEffect, subValue]) => {
          if (typeof subValue === 'number') {
            const fullEffectName = `${effectName}_${subEffect}`;
            effects[fullEffectName] = this.createModifierResult(0, subValue, [
              {
                id: trait.name,
                name: trait.name,
                type: 'trait',
                value: subValue,
                description: `${trait.name} provides ${fullEffectName}: ${subValue}`
              }
            ]);
          }
        });
      }
    });

    return effects;
  }

  /**
   * Calculate all trait effects for a pawn
   */
  calculateAllTraitEffects(pawn: Pawn): Record<string, ModifierResult> {
    const allEffects: Record<string, ModifierResult> = {};

    pawn.racialTraits.forEach((trait) => {
      const traitEffects = this.calculateTraitEffects(trait, pawn);

      Object.entries(traitEffects).forEach(([effectName, result]) => {
        if (!allEffects[effectName]) {
          allEffects[effectName] = this.createEmptyModifierResult();
        }

        allEffects[effectName].sources.push(...result.sources);
        allEffects[effectName].totalValue += result.totalValue;
      });
    });

    return allEffects;
  }

  /**
   * Calculate stat bonus contribution
   */
  calculateStatBonus(statName: string, statValue: number, baseValue: number = 10): ModifierResult {
    const bonus = (statValue - baseValue) / baseValue;

    return this.createModifierResult(1.0, bonus, [
      {
        id: statName,
        name: statName.charAt(0).toUpperCase() + statName.slice(1),
        type: 'stat',
        value: bonus,
        description: `${statName} (${statValue}) provides ${(bonus * 100).toFixed(1)}% modifier`
      }
    ]);
  }

  /**
   * Calculate research bonuses
   */
  calculateResearchBonuses(gameState: GameState): Record<string, ModifierResult> {
    const bonuses: Record<string, ModifierResult> = {};

    // This would be expanded to read from research database
    // For now, return empty as research bonuses are handled elsewhere

    return bonuses;
  }

  /**
   * Auto-discover work bonuses from items
   */
  discoverWorkBonusesFromItems(): Record<string, Record<string, number>> {
    const workBonuses: Record<string, Record<string, number>> = {};

    ITEMS_DATABASE.forEach((item) => {
      if (item.processingType && item.effects) {
        item.processingType.forEach((workType) => {
          if (!workBonuses[workType]) {
            workBonuses[workType] = {};
          }

          // Auto-discover bonuses based on item effects
          if (item.effects) {
            Object.entries(item.effects).forEach(([effectName, value]) => {
              if (this.isWorkRelatedEffect(effectName, workType)) {
                workBonuses[workType][item.id] = value;
              }
            });
          }
        });
      }
    });

    return workBonuses;
  }

  /**
   * Auto-discover work bonuses from buildings
   */
  discoverWorkBonusesFromBuildings(): Record<string, Record<string, number>> {
    const workBonuses: Record<string, Record<string, number>> = {};

    AVAILABLE_BUILDINGS.forEach((building) => {
      const discoveredBonuses = this.discoverBuildingWorkBonuses(building);

      Object.entries(discoveredBonuses).forEach(([workType, bonus]) => {
        if (!workBonuses[workType]) {
          workBonuses[workType] = {};
        }
        workBonuses[workType][building.id] = bonus;
      });
    });

    return workBonuses;
  }

  /**
   * Auto-discover production bonuses from buildings
   */
  discoverProductionBonusesFromBuildings(): Record<string, Record<string, number>> {
    const productionBonuses: Record<string, Record<string, number>> = {};

    AVAILABLE_BUILDINGS.forEach((building) => {
      if (building.productionBonus) {
        Object.entries(building.productionBonus).forEach(([resource, bonus]) => {
          if (!productionBonuses[resource]) {
            productionBonuses[resource] = {};
          }
          productionBonuses[resource][building.id] = bonus;
        });
      }
    });

    return productionBonuses;
  }

  // ===== PRIVATE HELPER METHODS =====

  private discoverBuildingWorkBonuses(building: Building): Record<string, number> {
    const bonuses: Record<string, number> = {};

    // Auto-discover from building category and effects
    if (building.category === 'production') {
      // Production buildings provide general crafting bonus
      bonuses['crafting'] = 1.2;
    }

    if (building.category === 'food') {
      // Food buildings provide cooking and food processing bonuses
      bonuses['cooking'] = 1.3;
      bonuses['food_processing'] = 1.25;
    }

    // Auto-discover from building properties
    if (building.buildingProperties) {
      const props = building.buildingProperties;

      if (props.craftingSpeed) {
        bonuses['crafting'] = 1 + props.craftingSpeed;
      }

      if (props.efficiency) {
        // Apply general efficiency to all work types
        WORK_CATEGORIES.forEach((work) => {
          bonuses[work.id] = 1 + props.efficiency!;
        });
      }

      if (props.specialization) {
        props.specialization.forEach((workType) => {
          bonuses[workType] = 1.5; // 50% bonus for specialized work
        });
      }
    }

    // Auto-discover from building effects
    if (building.effects) {
      Object.entries(building.effects).forEach(([effectName, value]) => {
        if (effectName.includes('Efficiency') || effectName.includes('Bonus')) {
          const workType = this.extractWorkTypeFromEffectName(effectName);
          if (workType) {
            bonuses[workType] = 1 + value;
          }
        }
      });
    }

    // Auto-discover from production bonuses
    if (building.productionBonus) {
      Object.entries(building.productionBonus).forEach(([workType, bonus]) => {
        bonuses[workType] = bonus;
      });
    }

    return bonuses;
  }

  private isWorkRelatedEffect(effectName: string, workType: string): boolean {
    const lowerEffectName = effectName.toLowerCase();
    const lowerWorkType = workType.toLowerCase();

    // Direct match
    if (lowerEffectName.includes(lowerWorkType)) return true;

    // Common effect mappings
    const effectMappings: Record<string, string[]> = {
      efficiency: ['crafting', 'woodcutting', 'mining', 'hunting', 'fishing'],
      speed: ['crafting', 'construction'],
      bonus: ['all'],
      productivity: ['all']
    };

    for (const [effect, workTypes] of Object.entries(effectMappings)) {
      if (
        lowerEffectName.includes(effect) &&
        (workTypes.includes(lowerWorkType) || workTypes.includes('all'))
      ) {
        return true;
      }
    }

    return false;
  }

  private extractWorkTypeFromEffectName(effectName: string): string | null {
    const lowerEffectName = effectName.toLowerCase();

    for (const workCategory of WORK_CATEGORIES) {
      if (lowerEffectName.includes(workCategory.id.toLowerCase())) {
        return workCategory.id;
      }
    }

    return null;
  }

  private createModifierResult(
    baseValue: number,
    totalValue: number,
    sources: ModifierSource[]
  ): ModifierResult {
    const multiplier = baseValue > 0 ? totalValue / baseValue : 1.0;

    return {
      baseValue,
      totalValue,
      multiplier,
      sources,
      breakdown: {
        base: baseValue,
        additiveBonus: totalValue - baseValue,
        multiplicativeBonus: multiplier,
        final: totalValue
      }
    };
  }

  private createEmptyModifierResult(): ModifierResult {
    return {
      baseValue: 0,
      totalValue: 0,
      multiplier: 1.0,
      sources: [],
      breakdown: {
        base: 0,
        additiveBonus: 0,
        multiplicativeBonus: 1.0,
        final: 0
      }
    };
  }

  /**
   * Clear calculation cache (call when game state changes significantly)
   */
  clearCache(): void {
    this.calculationCache.clear();
    this.cacheValidUntilTurn = -1;
  }
}

// Export singleton instance
export const modifierSystem = new ModifierSystemImpl();
