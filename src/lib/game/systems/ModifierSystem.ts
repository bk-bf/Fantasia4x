/**
 * ModifierSystem - Automated Modifier and Bonus Calculation System
 * 
 * This system automatically generates work efficiencies and bonuses from Buildings, Items,
 * and other game elements, eliminating the need for manual mapping between systems.
 * 
 * Requirements: 4.1, 4.2
 */

import type {
    GameState,
    Pawn,
    Item,
    Building,
    WorkCategory,
    RacialTrait,
    EquippedItem
} from '../core/types';
import { ITEMS_DATABASE } from '../core/Items';
import { AVAILABLE_BUILDINGS } from '../core/Buildings';
import { WORK_CATEGORIES } from '../core/Work';
import { building } from '$app/environment';

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
 * Work efficiency calculation result
 */
export interface WorkEfficiencyResult extends ModifierResult {
    workType: string;
    pawnId: string;
    locationId?: string;
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
    // Work Efficiency Calculations
    calculateWorkEfficiency(pawnId: string, workType: string, gameState: GameState, locationId?: string): WorkEfficiencyResult;
    calculateAllWorkEfficiencies(pawnId: string, gameState: GameState): Record<string, WorkEfficiencyResult>;

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

    // Validation and Debugging
    validateModifierConsistency(gameState: GameState): { isValid: boolean; issues: string[] };
    getModifierDebugInfo(pawnId: string, workType: string, gameState: GameState): any;
}

/**
 * ModifierSystem Implementation
 */
export class ModifierSystemImpl implements ModifierSystem {

    // Cache for expensive calculations
    private calculationCache = new Map<string, any>();
    private cacheValidUntilTurn = -1;

    /**
     * Calculate work efficiency for a pawn doing specific work
     */
    calculateWorkEfficiency(pawnId: string, workType: string, gameState: GameState, locationId?: string): WorkEfficiencyResult {
        const cacheKey = `work_efficiency_${pawnId}_${workType}_${locationId || 'none'}_${gameState.turn}`;

        if (this.calculationCache.has(cacheKey) && gameState.turn <= this.cacheValidUntilTurn) {
            return this.calculationCache.get(cacheKey);
        }

        const pawn = gameState.pawns.find(p => p.id === pawnId);
        const workCategory = WORK_CATEGORIES.find(w => w.id === workType);

        if (!pawn || !workCategory) {
            return this.createEmptyWorkEfficiencyResult(pawnId, workType);
        }

        const sources: ModifierSource[] = [];
        let baseEfficiency = workCategory.baseEfficiency;
        let additiveBonus = 0;
        let multiplicativeBonus = 1.0;

        // 1. Base stat contributions
        const statResult = this.calculateStatContribution(pawn, workCategory);
        sources.push(...statResult.sources);
        multiplicativeBonus *= statResult.multiplier;

        // 2. Racial trait bonuses
        const traitResult = this.calculateTraitWorkBonus(pawn, workType);
        sources.push(...traitResult.sources);
        multiplicativeBonus *= traitResult.multiplier;

        // 3. Equipment bonuses (auto-discovered)
        const equipmentResult = this.calculateEquipmentWorkBonus(pawn, workType);
        sources.push(...equipmentResult.sources);
        multiplicativeBonus *= equipmentResult.multiplier;

        // 4. Building bonuses (auto-discovered)
        const buildingResult = this.calculateBuildingWorkBonus(gameState, workType, locationId);
        sources.push(...buildingResult.sources);
        multiplicativeBonus *= buildingResult.multiplier;

        // 5. Research bonuses (auto-discovered)
        const researchResult = this.calculateResearchWorkBonus(gameState, workType);
        sources.push(...researchResult.sources);
        multiplicativeBonus *= researchResult.multiplier;

        // 6. Location modifiers
        if (locationId) {
            const locationResult = this.calculateLocationWorkBonus(gameState, workType, locationId);
            sources.push(...locationResult.sources);
            multiplicativeBonus *= locationResult.multiplier;
        }

        // 7. Pawn state modifiers (needs, morale, health)
        const stateResult = this.calculatePawnStateModifiers(pawn);
        sources.push(...stateResult.sources);
        multiplicativeBonus *= stateResult.multiplier;

        const finalEfficiency = baseEfficiency * multiplicativeBonus;

        const result: WorkEfficiencyResult = {
            workType,
            pawnId,
            locationId,
            baseValue: baseEfficiency,
            totalValue: finalEfficiency,
            multiplier: multiplicativeBonus,
            sources,
            breakdown: {
                base: baseEfficiency,
                additiveBonus,
                multiplicativeBonus,
                final: finalEfficiency
            }
        };

        this.calculationCache.set(cacheKey, result);
        this.cacheValidUntilTurn = gameState.turn;

        return result;
    }

    /**
     * Calculate all work efficiencies for a pawn
     */
    calculateAllWorkEfficiencies(pawnId: string, gameState: GameState): Record<string, WorkEfficiencyResult> {
        const results: Record<string, WorkEfficiencyResult> = {};

        WORK_CATEGORIES.forEach(workCategory => {
            results[workCategory.id] = this.calculateWorkEfficiency(pawnId, workCategory.id, gameState);
        });

        return results;
    }

    /**
     * Calculate building effects with auto-discovered bonuses
     */
    calculateBuildingEffects(buildingId: string, gameState: GameState): BuildingEffectResult {
        const building = AVAILABLE_BUILDINGS.find(b => b.id === buildingId);
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
            workBonuses[workType] = this.createModifierResult(1.0, bonus, [{
                id: buildingId,
                name: building.name,
                type: 'building',
                category: building.category,
                value: bonus,
                description: `${building.name} provides ${(bonus * 100).toFixed(0)}% bonus to ${workType}`
            }]);
        });

        // Auto-discover production bonuses
        if (building.productionBonus) {
            Object.entries(building.productionBonus).forEach(([resource, bonus]) => {
                productionBonuses[resource] = this.createModifierResult(1.0, bonus, [{
                    id: buildingId,
                    name: building.name,
                    type: 'building',
                    category: building.category,
                    value: bonus,
                    description: `${building.name} provides ${(bonus * 100).toFixed(0)}% bonus to ${resource} production`
                }]);
            });
        }

        // Auto-discover general effects
        if (building.effects) {
            Object.entries(building.effects).forEach(([effectName, value]) => {
                effects[effectName] = this.createModifierResult(0, value, [{
                    id: buildingId,
                    name: building.name,
                    type: 'building',
                    category: building.category,
                    value,
                    description: `${building.name} provides ${effectName}: ${value}`
                }]);
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

        Object.keys(gameState.buildingCounts).forEach(buildingId => {
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
        const item = ITEMS_DATABASE.find(i => i.id === itemId);
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
                const item = ITEMS_DATABASE.find(i => i.id === equipped.itemId);
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
                effects[effectName] = this.createModifierResult(0, value, [{
                    id: trait.name,
                    name: trait.name,
                    type: 'trait',
                    value,
                    description: `${trait.name} provides ${effectName}: ${value}`
                }]);
            } else if (typeof value === 'object' && value !== null) {
                // Handle nested effects like workEfficiency
                Object.entries(value).forEach(([subEffect, subValue]) => {
                    if (typeof subValue === 'number') {
                        const fullEffectName = `${effectName}_${subEffect}`;
                        effects[fullEffectName] = this.createModifierResult(0, subValue, [{
                            id: trait.name,
                            name: trait.name,
                            type: 'trait',
                            value: subValue,
                            description: `${trait.name} provides ${fullEffectName}: ${subValue}`
                        }]);
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

        pawn.racialTraits.forEach(trait => {
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

        return this.createModifierResult(1.0, bonus, [{
            id: statName,
            name: statName.charAt(0).toUpperCase() + statName.slice(1),
            type: 'stat',
            value: bonus,
            description: `${statName} (${statValue}) provides ${(bonus * 100).toFixed(1)}% modifier`
        }]);
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

        ITEMS_DATABASE.forEach(item => {
            if (item.workTypes && item.effects) {
                item.workTypes.forEach(workType => {
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

        AVAILABLE_BUILDINGS.forEach(building => {
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

        AVAILABLE_BUILDINGS.forEach(building => {
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

    /**
     * Validate modifier consistency
     */
    validateModifierConsistency(gameState: GameState): { isValid: boolean; issues: string[] } {
        const issues: string[] = [];

        // Validate that all pawns have consistent modifier calculations
        gameState.pawns.forEach(pawn => {
            WORK_CATEGORIES.forEach(workCategory => {
                try {
                    this.calculateWorkEfficiency(pawn.id, workCategory.id, gameState);
                } catch (error) {
                    issues.push(`Failed to calculate work efficiency for pawn ${pawn.id}, work ${workCategory.id}: ${error}`);
                }
            });
        });

        // Validate building effects
        Object.keys(gameState.buildingCounts).forEach(buildingId => {
            try {
                this.calculateBuildingEffects(buildingId, gameState);
            } catch (error) {
                issues.push(`Failed to calculate building effects for ${buildingId}: ${error}`);
            }
        });

        return {
            isValid: issues.length === 0,
            issues
        };
    }

    /**
     * Get debug information for modifier calculations
     */
    getModifierDebugInfo(pawnId: string, workType: string, gameState: GameState): any {
        const result = this.calculateWorkEfficiency(pawnId, workType, gameState);

        return {
            pawnId,
            workType,
            result,
            cacheInfo: {
                cacheSize: this.calculationCache.size,
                cacheValidUntil: this.cacheValidUntilTurn,
                currentTurn: gameState.turn
            }
        };
    }

    // ===== PRIVATE HELPER METHODS =====

    private calculateStatContribution(pawn: Pawn, workCategory: WorkCategory): { sources: ModifierSource[]; multiplier: number } {
        const sources: ModifierSource[] = [];
        let multiplier = 1.0;

        // Primary stat contribution
        const primaryStatValue = pawn.stats[workCategory.primaryStat] || 10;
        const primaryBonus = primaryStatValue / 10;
        multiplier *= primaryBonus;

        sources.push({
            id: workCategory.primaryStat,
            name: workCategory.primaryStat.charAt(0).toUpperCase() + workCategory.primaryStat.slice(1),
            type: 'stat',
            value: primaryBonus,
            description: `Primary stat ${workCategory.primaryStat} (${primaryStatValue}) provides ${(primaryBonus * 100).toFixed(0)}% efficiency`
        });

        // Secondary stat contribution
        if (workCategory.secondaryStat) {
            const secondaryStatValue = pawn.stats[workCategory.secondaryStat] || 10;
            const secondaryBonus = 1 + (secondaryStatValue - 10) / 50;
            multiplier *= secondaryBonus;

            sources.push({
                id: workCategory.secondaryStat,
                name: workCategory.secondaryStat.charAt(0).toUpperCase() + workCategory.secondaryStat.slice(1),
                type: 'stat',
                value: secondaryBonus,
                description: `Secondary stat ${workCategory.secondaryStat} (${secondaryStatValue}) provides ${((secondaryBonus - 1) * 100).toFixed(1)}% bonus`
            });
        }

        return { sources, multiplier };
    }

    private calculateTraitWorkBonus(pawn: Pawn, workType: string): { sources: ModifierSource[]; multiplier: number } {
        const sources: ModifierSource[] = [];
        let multiplier = 1.0;

        pawn.racialTraits.forEach(trait => {
            if (trait.effects.workEfficiency) {
                const workEfficiency = trait.effects.workEfficiency as Record<string, number>;

                // Check for specific work type bonus
                if (workEfficiency[workType]) {
                    const bonus = workEfficiency[workType];
                    multiplier *= bonus;

                    sources.push({
                        id: trait.name,
                        name: trait.name,
                        type: 'trait',
                        value: bonus,
                        description: `${trait.name} provides ${((bonus - 1) * 100).toFixed(0)}% bonus to ${workType}`
                    });
                }

                // Check for general work efficiency bonus
                if (workEfficiency['all']) {
                    const bonus = workEfficiency['all'];
                    multiplier *= bonus;

                    sources.push({
                        id: trait.name,
                        name: trait.name,
                        type: 'trait',
                        value: bonus,
                        description: `${trait.name} provides ${((bonus - 1) * 100).toFixed(0)}% bonus to all work`
                    });
                }
            }
        });

        return { sources, multiplier };
    }

    private calculateEquipmentWorkBonus(pawn: Pawn, workType: string): { sources: ModifierSource[]; multiplier: number } {
        const sources: ModifierSource[] = [];
        let multiplier = 1.0;

        if (!pawn.equipment) return { sources, multiplier };

        Object.entries(pawn.equipment).forEach(([slot, equipped]) => {
            if (equipped) {
                const item = ITEMS_DATABASE.find(i => i.id === equipped.itemId);
                if (item) {
                    // Check if item is suitable for this work type
                    if (item.workTypes && item.workTypes.includes(workType)) {
                        // Auto-discover work bonus from item effects
                        const workBonus = this.calculateItemWorkBonus(item, workType);
                        if (workBonus > 1.0) {
                            multiplier *= workBonus;

                            sources.push({
                                id: equipped.itemId,
                                name: item.name,
                                type: 'item',
                                category: item.category,
                                value: workBonus,
                                description: `${item.name} (${slot}) provides ${((workBonus - 1) * 100).toFixed(0)}% bonus to ${workType}`
                            });
                        }
                    }
                }
            }
        });

        return { sources, multiplier };
    }

    private calculateBuildingWorkBonus(gameState: GameState, workType: string, locationId?: string): { sources: ModifierSource[]; multiplier: number } {
        const sources: ModifierSource[] = [];
        let multiplier = 1.0;

        Object.entries(gameState.buildingCounts).forEach(([buildingId, count]) => {
            if (count > 0) {
                const building = AVAILABLE_BUILDINGS.find(b => b.id === buildingId);
                if (building) {
                    const workBonus = this.calculateBuildingWorkBonusValue(building, workType);
                    if (workBonus > 1.0) {
                        // Apply bonus based on building count
                        const totalBonus = 1 + (workBonus - 1) * count;
                        multiplier *= totalBonus;

                        sources.push({
                            id: buildingId,
                            name: building.name,
                            type: 'building',
                            category: building.category,
                            value: totalBonus,
                            description: `${count}x ${building.name} provides ${((totalBonus - 1) * 100).toFixed(0)}% bonus to ${workType}`
                        });
                    }
                }
            }
        });

        return { sources, multiplier };
    }

    private calculateResearchWorkBonus(gameState: GameState, workType: string): { sources: ModifierSource[]; multiplier: number } {
        const sources: ModifierSource[] = [];
        let multiplier = 1.0;

        // This would be expanded to check research database for work bonuses
        // For now, return base values

        return { sources, multiplier };
    }

    private calculateLocationWorkBonus(gameState: GameState, workType: string, locationId: string): { sources: ModifierSource[]; multiplier: number } {
        const sources: ModifierSource[] = [];
        let multiplier = 1.0;

        const location = gameState.discoveredLocations.find(l => l.id === locationId);
        if (location && location.workModifiers && location.workModifiers[workType]) {
            const bonus = location.workModifiers[workType];
            multiplier *= bonus;

            sources.push({
                id: locationId,
                name: location.name,
                type: 'location',
                value: bonus,
                description: `${location.name} provides ${((bonus - 1) * 100).toFixed(0)}% modifier to ${workType}`
            });
        }

        return { sources, multiplier };
    }

    private calculatePawnStateModifiers(pawn: Pawn): { sources: ModifierSource[]; multiplier: number } {
        const sources: ModifierSource[] = [];
        let multiplier = 1.0;

        // Health modifier
        if (pawn.state.health < 100) {
            const healthPenalty = pawn.state.health / 100;
            multiplier *= healthPenalty;

            sources.push({
                id: 'health',
                name: 'Health',
                type: 'stat',
                value: healthPenalty,
                description: `Health (${pawn.state.health}%) reduces efficiency by ${((1 - healthPenalty) * 100).toFixed(0)}%`
            });
        }

        // Morale modifier
        if (pawn.state.mood !== 50) {
            const moraleBonus = 1 + (pawn.state.mood - 50) / 100;
            multiplier *= moraleBonus;

            sources.push({
                id: 'morale',
                name: 'Morale',
                type: 'stat',
                value: moraleBonus,
                description: `Morale (${pawn.state.mood}) provides ${((moraleBonus - 1) * 100).toFixed(0)}% modifier`
            });
        }

        // Fatigue modifier
        if (pawn.needs.fatigue > 50) {
            const fatiguePenalty = 1 - (pawn.needs.fatigue - 50) / 100;
            multiplier *= Math.max(0.1, fatiguePenalty);

            sources.push({
                id: 'fatigue',
                name: 'Fatigue',
                type: 'stat',
                value: fatiguePenalty,
                description: `Fatigue (${pawn.needs.fatigue}) reduces efficiency by ${((1 - fatiguePenalty) * 100).toFixed(0)}%`
            });
        }

        return { sources, multiplier };
    }

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
                WORK_CATEGORIES.forEach(work => {
                    bonuses[work.id] = 1 + props.efficiency!;
                });
            }

            if (props.specialization) {
                props.specialization.forEach(workType => {
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

    private calculateItemWorkBonus(item: Item, workType: string): number {
        let bonus = 1.0;

        if (!item.effects) return bonus;

        // Auto-discover work bonuses from item effects
        Object.entries(item.effects).forEach(([effectName, value]) => {
            if (this.isWorkRelatedEffect(effectName, workType)) {
                bonus += value;
            }
        });

        // Tool tier bonus
        if (item.type === 'tool' && item.level) {
            bonus += item.level * 0.1; // 10% bonus per tool level
        }

        return bonus;
    }

    private calculateBuildingWorkBonusValue(building: Building, workType: string): number {
        const bonuses = this.discoverBuildingWorkBonuses(building);
        return bonuses[workType] || 1.0;
    }

    private isWorkRelatedEffect(effectName: string, workType: string): boolean {
        const lowerEffectName = effectName.toLowerCase();
        const lowerWorkType = workType.toLowerCase();

        // Direct match
        if (lowerEffectName.includes(lowerWorkType)) return true;

        // Common effect mappings
        const effectMappings: Record<string, string[]> = {
            'efficiency': ['crafting', 'woodcutting', 'mining', 'hunting', 'fishing'],
            'speed': ['crafting', 'construction'],
            'bonus': ['all'],
            'productivity': ['all']
        };

        for (const [effect, workTypes] of Object.entries(effectMappings)) {
            if (lowerEffectName.includes(effect) && (workTypes.includes(lowerWorkType) || workTypes.includes('all'))) {
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

    private createModifierResult(baseValue: number, totalValue: number, sources: ModifierSource[]): ModifierResult {
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

    private createEmptyWorkEfficiencyResult(pawnId: string, workType: string): WorkEfficiencyResult {
        return {
            workType,
            pawnId,
            baseValue: 1.0,
            totalValue: 1.0,
            multiplier: 1.0,
            sources: [],
            breakdown: {
                base: 1.0,
                additiveBonus: 0,
                multiplicativeBonus: 1.0,
                final: 1.0
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