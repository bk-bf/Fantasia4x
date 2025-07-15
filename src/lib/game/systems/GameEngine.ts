/**
 * GameEngine - Central Coordinator Interface
 * 
 * This interface defines the core GameEngine that serves as the central coordinator
 * for all system interactions in Fantasia4x. It provides unified calculations,
 * system coordination, and maintains consistency across all game systems.
 * 
 * Requirements: 2.1, 2.2
 */

import type { GameState, WorkAssignment } from '../core/types';
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

/**
 * Building effects interface for unified calculation results
 */
export interface BuildingEffects {
    populationCapacity?: number;
    productionBonus?: Record<string, number>;
    workEfficiencyBonus?: Record<string, number>;
    storageCapacity?: Record<string, number>;
    defenseBonus?: number;
    morale?: number;
    upkeepCost?: Record<string, number>;
}

/**
 * System interaction result for coordination methods
 */
export interface SystemInteractionResult {
    success: boolean;
    data?: any;
    error?: string;
    affectedSystems?: string[];
}

/**
 * Game turn processing result
 */
export interface TurnProcessingResult {
    success: boolean;
    turnsProcessed: number;
    systemsUpdated: string[];
    errors?: string[];
    warnings?: string[];
}

/**
 * System consistency validation result
 */
export interface ConsistencyValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    affectedSystems: string[];
}

/**
 * GameEngine Core Interface
 * 
 * The GameEngine serves as the central coordinator for all system interactions,
 * providing unified calculations and maintaining system consistency.
 */
export interface GameEngine {

    // ===== SYSTEM COORDINATION =====

    /**
     * Process a complete game turn, coordinating all systems in the correct order
     * 
     * This method orchestrates the entire turn sequence:
     * 1. Process pawn needs and behavior
     * 2. Execute work assignments and production
     * 3. Process building construction and effects
     * 4. Advance research progress
     * 5. Process crafting queue
     * 6. Generate and process events
     * 7. Update system states consistently
     * 
     * @returns Result indicating success and what was processed
     */
    processGameTurn(): TurnProcessingResult;

    /**
     * Coordinate interactions between different game systems
     * 
     * This method handles complex interactions where multiple systems need to
     * communicate, such as:
     * - Combat affecting pawn stats and equipment
     * - Building construction requiring resources and affecting production
     * - Research unlocking new items and buildings
     * - Events triggering cascading system changes
     * 
     * @param sourceSystem - The system initiating the interaction
     * @param targetSystem - The system being affected
     * @param interactionType - Type of interaction (query, command, event)
     * @param data - Interaction-specific data
     * @returns Result of the system interaction
     */
    coordinateSystemInteractions(
        sourceSystem: string,
        targetSystem: string,
        interactionType: 'query' | 'command' | 'event',
        data: any
    ): SystemInteractionResult;

    // ===== UNIFIED CALCULATIONS =====

    /**
     * Calculate a pawn's efficiency for a specific work type
     * 
     * This is the single source of truth for work efficiency calculations,
     * considering all factors:
     * - Base pawn stats (strength, dexterity, etc.)
     * - Racial trait bonuses/penalties
     * - Equipment bonuses
     * - Building bonuses at work location
     * - Morale and needs effects
     * - Research unlocks and bonuses
     * 
     * @param pawnId - ID of the pawn
     * @param workType - Type of work being performed
     * @returns Efficiency multiplier (1.0 = 100% efficiency)
     */
    calculatePawnEfficiency(pawnId: string, workType: string): number;

    /**
     * Calculate all effects provided by a building
     * 
     * This method provides unified building effect calculations, considering:
     * - Base building properties
     * - Upgrade levels and modifications
     * - Synergy bonuses from adjacent buildings
     * - Research unlocks affecting building performance
     * - Environmental factors
     * 
     * @param buildingId - ID of the building type
     * @param locationId - Optional location for context-specific bonuses
     * @returns Complete building effects object
     */
    calculateBuildingEffects(buildingId: string, locationId?: string): BuildingEffects;

    /**
     * Calculate crafting time for an item by a specific pawn
     * 
     * Unified crafting time calculation considering:
     * - Base item crafting time
     * - Pawn skill and stat bonuses
     * - Tool and equipment bonuses
     * - Building bonuses (workshop effects)
     * - Research bonuses
     * 
     * @param itemId - ID of the item being crafted
     * @param pawnId - ID of the pawn doing the crafting
     * @returns Time in turns to complete crafting
     */
    calculateCraftingTime(itemId: string, pawnId: string): number;

    /**
     * Calculate total resource production for a work assignment
     * 
     * Unified production calculation considering:
     * - Base work category production rates
     * - Pawn efficiency (via calculatePawnEfficiency)
     * - Location resource availability and bonuses
     * - Building bonuses
     * - Tool and equipment bonuses
     * 
     * @param workAssignment - The work assignment to calculate for
     * @returns Resource production per turn
     */
    calculateResourceProduction(workAssignment: WorkAssignment): Record<string, number>;

    /**
     * Calculate combat effectiveness for a pawn
     * 
     * Unified combat calculation for future combat system:
     * - Base combat stats
     * - Weapon and armor bonuses
     * - Racial trait combat effects
     * - Building defensive bonuses
     * - Morale and health effects
     * 
     * @param pawnId - ID of the pawn
     * @param combatType - Type of combat (melee, ranged, defense)
     * @returns Combat effectiveness rating
     */
    calculateCombatEffectiveness(pawnId: string, combatType: 'melee' | 'ranged' | 'defense'): number;

    // ===== STATE MANAGEMENT =====

    /**
     * Get the current game state
     * 
     * Returns a deep copy of the current game state to prevent
     * accidental mutations outside of the GameEngine.
     * 
     * @returns Complete current game state
     */
    getGameState(): GameState;

    /**
     * Update game state with validation and consistency checks
     * 
     * This method ensures all state updates maintain system consistency:
     * - Validates state changes don't break system invariants
     * - Updates dependent systems when core data changes
     * - Maintains referential integrity between systems
     * - Triggers necessary recalculations
     * 
     * @param updates - Partial state updates to apply
     * @returns Success status and any validation errors
     */
    updateGameState(updates: Partial<GameState>): SystemInteractionResult;

    /**
     * Validate system state consistency
     * 
     * Checks that all systems are in a consistent state:
     * - Pawn work assignments reference valid work and locations
     * - Building counts match actual buildings
     * - Item quantities are non-negative
     * - Research prerequisites are satisfied
     * 
     * @returns Validation result with any inconsistencies found
     */
    validateSystemConsistency(): ConsistencyValidationResult;

    /**
     * Reset game state to a clean, consistent state
     * 
     * Used for error recovery and testing. Ensures all systems
     * are properly initialized and consistent.
     * 
     * @param newState - Optional new state to reset to
     * @returns Success status of the reset operation
     */
    resetGameState(newState?: GameState): SystemInteractionResult;

    // ===== SERVICE INTEGRATION =====

    /**
     * Integrate service registry with the GameEngine
     * 
     * This method connects all service layer components to the GameEngine,
     * allowing for coordinated system interactions through clean interfaces.
     * 
     * @param services - Registry of all game services
     */
    integrateServices(services: ServiceRegistry): void;

    /**
     * Get access to integrated services
     * 
     * Provides controlled access to service layer for components that
     * need direct service access while maintaining GameEngine coordination.
     * 
     * @returns The integrated service registry
     */
    getServices(): ServiceRegistry;

    // ===== SYSTEM INTERACTION PROTOCOLS =====

    /**
     * Get the system interaction coordinator
     * 
     * Provides access to the coordinator that handles data requests,
     * event propagation, state consistency, and error recovery.
     * 
     * @returns The system interaction coordinator
     */
    getInteractionCoordinator(): SystemInteractionCoordinator;

    /**
     * Process data request between systems
     * 
     * Handles standardized data requests between systems through
     * the interaction coordinator.
     * 
     * @param request - The data request to process
     * @returns Response with requested data or error
     */
    processDataRequest(request: SystemDataRequest): Promise<SystemDataResponse>;

    /**
     * Propagate event to target systems
     * 
     * Handles event propagation through the interaction coordinator,
     * ensuring proper event handling and cascade management.
     * 
     * @param event - The event to propagate
     * @returns Result of event processing
     */
    propagateEvent(event: SystemEvent): Promise<EventProcessingResult>;

    /**
     * Coordinate state update across systems
     * 
     * Handles coordinated state updates with validation and
     * consistency checking through the interaction coordinator.
     * 
     * @param update - The state update request
     * @returns Result of state update coordination
     */
    coordinateStateUpdate(update: StateUpdateRequest): Promise<StateUpdateResult>;

    /**
     * Handle system error with recovery
     * 
     * Handles system errors through the interaction coordinator,
     * attempting automatic recovery when possible.
     * 
     * @param error - The system error to handle
     * @returns Result of error handling and recovery
     */
    handleSystemError(error: SystemError): Promise<RecoveryResult>;

    /**
     * Configure interaction protocols
     * 
     * Updates the configuration for system interaction protocols,
     * allowing runtime adjustment of protocol behavior.
     * 
     * @param config - New protocol configuration
     */
    configureInteractionProtocols(config: Partial<InteractionProtocolConfig>): void;

    // ===== SYSTEM LIFECYCLE =====

    /**
     * Initialize the GameEngine with a game state
     * 
     * Sets up the GameEngine with initial state and validates
     * that all systems are properly configured.
     * 
     * @param initialState - Initial game state
     * @param services - Service registry to integrate
     * @returns Success status of initialization
     */
    initialize(initialState: GameState, services: ServiceRegistry): SystemInteractionResult;

    /**
     * Shutdown the GameEngine gracefully
     * 
     * Performs cleanup operations and ensures all pending
     * operations are completed before shutdown.
     * 
     * @returns Success status of shutdown
     */
    shutdown(): SystemInteractionResult;

    /**
     * Get GameEngine status and health information
     * 
     * Provides diagnostic information about the GameEngine state,
     * useful for debugging and monitoring.
     * 
     * @returns Status information including system health
     */
    getEngineStatus(): {
        isInitialized: boolean;
        systemsIntegrated: string[];
        lastTurnProcessed: number;
        pendingOperations: number;
        errors: string[];
    };
}

/**
 * GameEngine Factory Interface
 * 
 * Factory for creating GameEngine instances with proper configuration
 */
export interface GameEngineFactory {
    /**
     * Create a new GameEngine instance
     * 
     * @param config - Optional configuration for the engine
     * @returns New GameEngine instance
     */
    createGameEngine(config?: GameEngineConfig): GameEngine;
}

/**
 * GameEngine Configuration
 */
export interface GameEngineConfig {
    enableDebugLogging?: boolean;
    validateStateOnEachUpdate?: boolean;
    maxTurnsPerBatch?: number;
    enablePerformanceMetrics?: boolean;
    errorRecoveryMode?: 'strict' | 'lenient' | 'disabled';
}


