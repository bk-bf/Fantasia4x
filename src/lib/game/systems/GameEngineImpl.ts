/**
 * GameEngineImpl - Central Coordinator Implementation
 * 
 * This implementation provides the central coordination for all system interactions,
 * using the automated modifier system for unified calculations.
 * 
 * Requirements: 2.1, 2.2, 4.1, 4.2
 */

import type {
    GameEngine,
    GameEngineConfig,
    BuildingEffects,
    SystemInteractionResult,
    TurnProcessingResult,
    ConsistencyValidationResult
} from './GameEngine';
import type {
    GameState,
    WorkAssignment,
    Pawn
} from '../core/types';
import type { ServiceRegistry } from './ServiceIntegration';
import type {
    SystemInteractionCoordinator,
    SystemDataRequest,
    SystemDataResponse,
    SystemEvent,
    EventProcessingResult,
    StateUpdateRequest,
    StateUpdateResult,
    SystemError,
    RecoveryResult,
    InteractionProtocolConfig
} from './SystemInteractionProtocols';

import { modifierSystem, type ModifierSystem } from './ModifierSystem';
import { SystemInteractionCoordinatorImpl } from './SystemInteractionCoordinatorImpl';

/**
 * GameEngine Implementation using Automated Modifier System
 */
export class GameEngineImpl implements GameEngine {

    private gameState: GameState | null = null;
    private services: ServiceRegistry | null = null;
    private interactionCoordinator: SystemInteractionCoordinator;
    private modifierSystem: ModifierSystem;
    private config: GameEngineConfig;
    private isInitialized = false;
    private lastTurnProcessed = 0;
    private pendingOperations = 0;
    private errors: string[] = [];

    constructor(config: GameEngineConfig = {}) {
        this.config = {
            enableDebugLogging: false,
            validateStateOnEachUpdate: true,
            maxTurnsPerBatch: 10,
            enablePerformanceMetrics: false,
            errorRecoveryMode: 'lenient',
            ...config
        };

        this.interactionCoordinator = new SystemInteractionCoordinatorImpl();
        this.modifierSystem = modifierSystem;
    }

    // ===== SYSTEM COORDINATION =====

    processGameTurn(): TurnProcessingResult {
        if (!this.gameState || !this.services) {
            return {
                success: false,
                turnsProcessed: 0,
                systemsUpdated: [],
                errors: ['GameEngine not initialized']
            };
        }

        const systemsUpdated: string[] = [];
        const errors: string[] = [];
        const warnings: string[] = [];

        try {
            this.pendingOperations++;

            // 1. Process pawn needs and behavior
            this.processPawnNeeds();
            systemsUpdated.push('PawnNeeds');

            // 2. Execute work assignments and production
            this.processWorkAssignments();
            systemsUpdated.push('WorkAssignments');

            // 3. Process building construction and effects
            this.processBuildingEffects();
            systemsUpdated.push('Buildings');

            // 4. Advance research progress
            this.processResearch();
            systemsUpdated.push('Research');

            // 5. Process crafting queue
            this.processCrafting();
            systemsUpdated.push('Crafting');

            // 6. Generate and process events
            this.processEvents();
            systemsUpdated.push('Events');

            // 7. Update system states consistently
            this.updateSystemStates();
            systemsUpdated.push('StateSync');

            // 8. Clear modifier cache for next turn
            this.modifierSystem.clearCache();

            this.gameState.turn++;
            this.lastTurnProcessed = this.gameState.turn;

            return {
                success: true,
                turnsProcessed: 1,
                systemsUpdated,
                errors: errors.length > 0 ? errors : undefined,
                warnings: warnings.length > 0 ? warnings : undefined
            };

        } catch (error) {
            errors.push(`Turn processing failed: ${error}`);
            return {
                success: false,
                turnsProcessed: 0,
                systemsUpdated,
                errors
            };
        } finally {
            this.pendingOperations--;
        }
    }

    coordinateSystemInteractions(
        sourceSystem: string,
        targetSystem: string,
        interactionType: 'query' | 'command' | 'event',
        data: any
    ): SystemInteractionResult {
        if (!this.gameState || !this.services) {
            return {
                success: false,
                error: 'GameEngine not initialized'
            };
        }

        try {
            // Use the modifier system for efficiency calculations
            if (interactionType === 'query' && data.type === 'work_efficiency') {
                const result = this.modifierSystem.calculateWorkEfficiency(
                    data.pawnId,
                    data.workType,
                    this.gameState,
                    data.locationId
                );

                return {
                    success: true,
                    data: result,
                    affectedSystems: [sourceSystem, targetSystem]
                };
            }

            // Use the modifier system for building effects
            if (interactionType === 'query' && data.type === 'building_effects') {
                const result = this.modifierSystem.calculateBuildingEffects(
                    data.buildingId,
                    this.gameState
                );

                return {
                    success: true,
                    data: result,
                    affectedSystems: [sourceSystem, targetSystem]
                };
            }

            // Delegate to interaction coordinator for other interactions
            return {
                success: true,
                data: null,
                affectedSystems: [sourceSystem, targetSystem]
            };

        } catch (error) {
            return {
                success: false,
                error: `System interaction failed: ${error}`,
                affectedSystems: [sourceSystem, targetSystem]
            };
        }
    }

    // ===== UNIFIED CALCULATIONS =====

    calculatePawnEfficiency(pawnId: string, workType: string): number {
        if (!this.gameState) return 1.0;

        const result = this.modifierSystem.calculateWorkEfficiency(
            pawnId,
            workType,
            this.gameState
        );

        return result.totalValue;
    }

    calculateBuildingEffects(buildingId: string, locationId?: string): BuildingEffects {
        if (!this.gameState) {
            return {
                populationCapacity: 0,
                productionBonus: {},
                workEfficiencyBonus: {},
                storageCapacity: {},
                defenseBonus: 0,
                morale: 0,
                upkeepCost: {}
            };
        }

        const result = this.modifierSystem.calculateBuildingEffects(buildingId, this.gameState);

        // Convert to GameEngine BuildingEffects format
        const effects: BuildingEffects = {
            productionBonus: {},
            workEfficiencyBonus: {},
            storageCapacity: {},
            upkeepCost: {}
        };

        // Extract specific effects
        Object.entries(result.effects).forEach(([effectName, modifierResult]) => {
            switch (effectName) {
                case 'populationCapacity':
                    effects.populationCapacity = modifierResult.totalValue;
                    break;
                case 'defenseBonus':
                    effects.defenseBonus = modifierResult.totalValue;
                    break;
                case 'morale':
                    effects.morale = modifierResult.totalValue;
                    break;
            }
        });

        // Extract work efficiency bonuses
        Object.entries(result.workBonuses).forEach(([workType, modifierResult]) => {
            effects.workEfficiencyBonus![workType] = modifierResult.totalValue;
        });

        // Extract production bonuses
        Object.entries(result.productionBonuses).forEach(([resource, modifierResult]) => {
            effects.productionBonus![resource] = modifierResult.totalValue;
        });

        return effects;
    }

    calculateCraftingTime(itemId: string, pawnId: string): number {
        if (!this.gameState || !this.services) return 1;

        // Use ItemService for base calculation, then apply modifiers
        const baseTime = this.services.itemService.calculateCraftingTime(itemId, this.gameState, pawnId);

        // Apply crafting efficiency modifiers
        const craftingEfficiency = this.calculatePawnEfficiency(pawnId, 'crafting');

        return Math.max(1, Math.round(baseTime / craftingEfficiency));
    }

    calculateResourceProduction(workAssignment: WorkAssignment): Record<string, number> {
        if (!this.gameState || !workAssignment.currentWork) return {};

        const pawn = this.gameState.pawns.find(p => p.id === workAssignment.pawnId);
        if (!pawn) return {};

        // Use modifier system to calculate efficiency
        const efficiency = this.modifierSystem.calculateWorkEfficiency(
            workAssignment.pawnId,
            workAssignment.currentWork,
            this.gameState,
            workAssignment.activeLocation
        );

        // Base production calculation
        const priority = workAssignment.workPriorities[workAssignment.currentWork] || 1;
        const baseProduction = efficiency.totalValue * priority * 0.5;

        // This would be expanded to include specific resource types
        return {
            [workAssignment.currentWork]: baseProduction
        };
    }

    calculateCombatEffectiveness(pawnId: string, combatType: 'melee' | 'ranged' | 'defense'): number {
        if (!this.gameState) return 1.0;

        const pawn = this.gameState.pawns.find(p => p.id === pawnId);
        if (!pawn) return 1.0;

        // Use modifier system for equipment bonuses
        const equipmentBonuses = this.modifierSystem.calculateEquipmentBonuses(pawn);

        let effectiveness = 1.0;

        // Apply relevant bonuses based on combat type
        switch (combatType) {
            case 'melee':
                effectiveness *= pawn.stats.strength / 10;
                if (equipmentBonuses.meleeDamage) {
                    effectiveness *= equipmentBonuses.meleeDamage.totalValue;
                }
                break;
            case 'ranged':
                effectiveness *= pawn.stats.dexterity / 10;
                if (equipmentBonuses.rangedDamage) {
                    effectiveness *= equipmentBonuses.rangedDamage.totalValue;
                }
                break;
            case 'defense':
                effectiveness *= pawn.stats.constitution / 10;
                if (equipmentBonuses.defense) {
                    effectiveness *= equipmentBonuses.defense.totalValue;
                }
                break;
        }

        return effectiveness;
    }

    // ===== STATE MANAGEMENT =====

    getGameState(): GameState {
        if (!this.gameState) {
            throw new Error('GameEngine not initialized');
        }

        // Return deep copy to prevent mutations
        return JSON.parse(JSON.stringify(this.gameState));
    }

    updateGameState(updates: Partial<GameState>): SystemInteractionResult {
        if (!this.gameState) {
            return {
                success: false,
                error: 'GameEngine not initialized'
            };
        }

        try {
            // Apply updates
            this.gameState = { ...this.gameState, ...updates };

            // Validate consistency if enabled
            if (this.config.validateStateOnEachUpdate) {
                const validation = this.validateSystemConsistency();
                if (!validation.isValid) {
                    return {
                        success: false,
                        error: `State validation failed: ${validation.errors.join(', ')}`
                    };
                }
            }

            // Clear modifier cache when state changes
            this.modifierSystem.clearCache();

            return { success: true };

        } catch (error) {
            return {
                success: false,
                error: `State update failed: ${error}`
            };
        }
    }

    validateSystemConsistency(): ConsistencyValidationResult {
        if (!this.gameState) {
            return {
                isValid: false,
                errors: ['GameEngine not initialized'],
                warnings: [],
                affectedSystems: []
            };
        }

        const errors: string[] = [];
        const warnings: string[] = [];
        const affectedSystems: string[] = [];

        // Use modifier system validation
        const modifierValidation = this.modifierSystem.validateModifierConsistency(this.gameState);
        if (!modifierValidation.isValid) {
            errors.push(...modifierValidation.issues);
            affectedSystems.push('ModifierSystem');
        }

        // Additional consistency checks
        this.gameState.pawns.forEach(pawn => {
            if (pawn.state.health < 0 || pawn.state.health > 100) {
                errors.push(`Pawn ${pawn.id} has invalid health: ${pawn.state.health}`);
                affectedSystems.push('PawnSystem');
            }

            if (pawn.needs.hunger < 0 || pawn.needs.hunger > 100) {
                errors.push(`Pawn ${pawn.id} has invalid hunger: ${pawn.needs.hunger}`);
                affectedSystems.push('PawnSystem');
            }
        });

        // Check building counts
        Object.entries(this.gameState.buildingCounts).forEach(([buildingId, count]) => {
            if (count < 0) {
                errors.push(`Building ${buildingId} has negative count: ${count}`);
                affectedSystems.push('BuildingSystem');
            }
        });

        // Check item quantities
        this.gameState.item.forEach(item => {
            if (item.amount < 0) {
                errors.push(`Item ${item.id} has negative amount: ${item.amount}`);
                affectedSystems.push('ItemSystem');
            }
        });

        return {
            isValid: errors.length === 0,
            errors,
            warnings,
            affectedSystems: [...new Set(affectedSystems)]
        };
    }

    resetGameState(newState?: GameState): SystemInteractionResult {
        try {
            if (newState) {
                this.gameState = JSON.parse(JSON.stringify(newState));
            } else {
                // Reset to default state would go here
                return {
                    success: false,
                    error: 'Default state reset not implemented'
                };
            }

            this.modifierSystem.clearCache();
            this.lastTurnProcessed = this.gameState.turn;

            return { success: true };

        } catch (error) {
            return {
                success: false,
                error: `State reset failed: ${error}`
            };
        }
    }

    // ===== SERVICE INTEGRATION =====

    integrateServices(services: ServiceRegistry): void {
        this.services = services;
    }

    getServices(): ServiceRegistry {
        if (!this.services) {
            throw new Error('Services not integrated');
        }
        return this.services;
    }

    // ===== SYSTEM INTERACTION PROTOCOLS =====

    getInteractionCoordinator(): SystemInteractionCoordinator {
        return this.interactionCoordinator;
    }

    async processDataRequest(request: SystemDataRequest): Promise<SystemDataResponse> {
        return this.interactionCoordinator.processDataRequest(request);
    }

    async propagateEvent(event: SystemEvent): Promise<EventProcessingResult> {
        return this.interactionCoordinator.propagateEvent(event);
    }

    async coordinateStateUpdate(update: StateUpdateRequest): Promise<StateUpdateResult> {
        return this.interactionCoordinator.coordinateStateUpdate(update);
    }

    async handleSystemError(error: SystemError): Promise<RecoveryResult> {
        return this.interactionCoordinator.handleSystemError(error);
    }

    configureInteractionProtocols(config: Partial<InteractionProtocolConfig>): void {
        this.interactionCoordinator.configureProtocols(config);
    }

    // ===== SYSTEM LIFECYCLE =====

    initialize(initialState: GameState, services: ServiceRegistry): SystemInteractionResult {
        try {
            this.gameState = JSON.parse(JSON.stringify(initialState));
            this.services = services;
            this.isInitialized = true;
            this.lastTurnProcessed = initialState.turn;

            // Validate initial state
            const validation = this.validateSystemConsistency();
            if (!validation.isValid) {
                this.errors.push(...validation.errors);
                if (this.config.errorRecoveryMode === 'strict') {
                    return {
                        success: false,
                        error: `Initial state validation failed: ${validation.errors.join(', ')}`
                    };
                }
            }

            return { success: true };

        } catch (error) {
            return {
                success: false,
                error: `Initialization failed: ${error}`
            };
        }
    }

    shutdown(): SystemInteractionResult {
        try {
            // Wait for pending operations
            while (this.pendingOperations > 0) {
                // In a real implementation, this would be async
            }

            this.modifierSystem.clearCache();
            this.isInitialized = false;
            this.gameState = null;
            this.services = null;

            return { success: true };

        } catch (error) {
            return {
                success: false,
                error: `Shutdown failed: ${error}`
            };
        }
    }

    getEngineStatus() {
        return {
            isInitialized: this.isInitialized,
            systemsIntegrated: this.services ? Object.keys(this.services) : [],
            lastTurnProcessed: this.lastTurnProcessed,
            pendingOperations: this.pendingOperations,
            errors: [...this.errors]
        };
    }

    // ===== PRIVATE HELPER METHODS =====

    private processPawnNeeds(): void {
        if (!this.gameState || !this.services) return;

        this.gameState.pawns.forEach(pawn => {
            // Process basic needs
            pawn.needs.hunger = Math.min(100, pawn.needs.hunger + 2);
            pawn.needs.fatigue = Math.min(100, pawn.needs.fatigue + 1);
            pawn.needs.sleep = Math.min(100, pawn.needs.sleep + 1.5);

            // Auto-satisfy needs if they're critical
            if (pawn.needs.hunger > 90) {
                this.tryToEat(pawn);
            }

            if (pawn.needs.sleep > 90) {
                this.tryToSleep(pawn);
            }

            if (pawn.needs.fatigue > 80) {
                this.tryToRest(pawn);
            }
        });
    }

    private processWorkAssignments(): void {
        if (!this.gameState) return;

        Object.values(this.gameState.workAssignments).forEach(assignment => {
            if (assignment.currentWork) {
                const production = this.calculateResourceProduction(assignment);

                // Apply production to game state
                Object.entries(production).forEach(([resource, amount]) => {
                    const existingItem = this.gameState!.item.find(i => i.id === resource);
                    if (existingItem) {
                        existingItem.amount += amount;
                    }
                });
            }
        });
    }

    private processBuildingEffects(): void {
        if (!this.gameState) return;

        // Apply building effects using modifier system
        const allBuildingEffects = this.modifierSystem.calculateAllBuildingEffects(this.gameState);

        // This would apply building effects to game state
        // For now, just validate they can be calculated
    }

    private processResearch(): void {
        if (!this.gameState || !this.services) return;

        if (this.gameState.currentResearch) {
            // Use research service for processing
            // This would be implemented when research service is available
        }
    }

    private processCrafting(): void {
        if (!this.gameState) return;

        this.gameState.craftingQueue.forEach(crafting => {
            crafting.turnsRemaining--;

            if (crafting.turnsRemaining <= 0) {
                // Complete crafting
                const existingItem = this.gameState!.item.find(i => i.id === crafting.item.id);
                if (existingItem) {
                    existingItem.amount += crafting.quantity;
                } else {
                    this.gameState!.item.push({
                        ...crafting.item,
                        amount: crafting.quantity
                    });
                }
            }
        });

        // Remove completed crafting
        this.gameState.craftingQueue = this.gameState.craftingQueue.filter(c => c.turnsRemaining > 0);
    }

    private processEvents(): void {
        if (!this.gameState) return;

        // Event processing would go here
        // This would use the event system when available
    }

    private updateSystemStates(): void {
        if (!this.gameState) return;

        // Update pawn abilities using modifier system
        const newPawnAbilities: Record<string, Record<string, { value: number, sources: string[] }>> = {};

        this.gameState.pawns.forEach(pawn => {
            const workEfficiencies = this.modifierSystem.calculateAllWorkEfficiencies(pawn.id, this.gameState!);

            newPawnAbilities[pawn.id] = {};

            Object.entries(workEfficiencies).forEach(([workType, result]) => {
                newPawnAbilities[pawn.id][`${workType}Efficiency`] = {
                    value: result.totalValue,
                    sources: result.sources.map(s => s.description)
                };
            });
        });

        this.gameState.pawnAbilities = newPawnAbilities;
    }

    private tryToEat(pawn: Pawn): void {
        if (!this.gameState) return;

        // Find available food
        const food = this.gameState.item.find(i => i.type === 'material' && i.category === 'food' && i.amount > 0);
        if (food) {
            food.amount--;
            pawn.needs.hunger = Math.max(0, pawn.needs.hunger - 30);
            pawn.needs.lastMeal = this.gameState.turn;
        }
    }

    private tryToSleep(pawn: Pawn): void {
        if (!this.gameState) return;

        pawn.state.isSleeping = true;
        pawn.needs.sleep = Math.max(0, pawn.needs.sleep - 50);
        pawn.needs.lastSleep = this.gameState.turn;
    }

    private tryToRest(pawn: Pawn): void {
        pawn.needs.fatigue = Math.max(0, pawn.needs.fatigue - 20);
    }
}

/**
 * GameEngine Factory Implementation
 */
export class GameEngineFactory {
    static createGameEngine(config?: GameEngineConfig): GameEngine {
        return new GameEngineImpl(config);
    }
}

// Export singleton instance for convenience
export const gameEngine = new GameEngineImpl();