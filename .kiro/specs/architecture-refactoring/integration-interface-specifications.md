# Integration Interface Specifications

## Overview

This document defines the comprehensive interface specifications for the Fantasia4x architecture refactoring. These interfaces establish clean contracts between the GameEngine, service layer, and system components, enabling the elimination of circular dependencies and implementation of unified system coordination.

**Status Update (December 2024):** Most interfaces have been implemented and are operational. This document reflects both the designed interfaces and their current implementation status.

## Core Architecture Interfaces

### GameEngine Central Coordinator

The GameEngine serves as the single point of coordination for all system interactions, providing unified calculations and maintaining system consistency.

```typescript
/**
 * GameEngine - Central Coordinator Interface
 *
 * Primary coordinator for all system interactions, unified calculations,
 * and state management consistency.
 *
 * IMPLEMENTATION STATUS: ✅ FULLY IMPLEMENTED (GameEngineImpl)
 * Location: src/lib/game/systems/GameEngineImpl.ts
 */
export interface GameEngine {
  // ===== SYSTEM COORDINATION =====

  /**
   * Process complete game turn with coordinated system updates
   */
  processGameTurn(): TurnProcessingResult;

  /**
   * Coordinate interactions between different game systems
   */
  coordinateSystemInteractions(
    sourceSystem: string,
    targetSystem: string,
    interactionType: 'query' | 'command' | 'event',
    data: any
  ): SystemInteractionResult;

  // ===== UNIFIED CALCULATIONS =====

  /**
   * Single source of truth for pawn work efficiency
   */
  calculatePawnEfficiency(pawnId: string, workType: string): number;

  /**
   * Unified building effects calculation
   */
  calculateBuildingEffects(buildingId: string, locationId?: string): BuildingEffects;

  /**
   * Unified crafting time calculation
   */
  calculateCraftingTime(itemId: string, pawnId: string): number;

  /**
   * Unified resource production calculation
   */
  calculateResourceProduction(workAssignment: WorkAssignment): Record<string, number>;

  /**
   * Combat effectiveness calculation (future combat system)
   */
  calculateCombatEffectiveness(pawnId: string, combatType: 'melee' | 'ranged' | 'defense'): number;

  // ===== STATE MANAGEMENT =====

  /**
   * Get current game state (immutable copy)
   */
  getGameState(): GameState;

  /**
   * Update game state with validation and consistency checks
   */
  updateGameState(updates: Partial<GameState>): SystemInteractionResult;

  /**
   * Validate system state consistency
   */
  validateSystemConsistency(): ConsistencyValidationResult;

  // ===== SERVICE INTEGRATION =====

  /**
   * Integrate service registry with GameEngine
   */
  integrateServices(services: ServiceRegistry): void;

  /**
   * Get access to integrated services
   */
  getServices(): ServiceRegistry;

  // ===== SYSTEM LIFECYCLE =====

  /**
   * Initialize GameEngine with state and services
   */
  initialize(initialState: GameState, services: ServiceRegistry): SystemInteractionResult;

  /**
   * Shutdown GameEngine gracefully
   */
  shutdown(): SystemInteractionResult;

  /**
   * Get engine status and health information
   */
  getEngineStatus(): GameEngineStatus;
}
```

### Service Layer Interfaces

Clean interfaces for all game services, separating business logic from data definitions.

#### ItemService Interface

```typescript
/**
 * ItemService - Clean interface for item queries and operations
 *
 * IMPLEMENTATION STATUS: ✅ FULLY IMPLEMENTED (ItemServiceImpl)
 * Location: src/lib/game/services/ItemService.ts
 */
export interface ItemService {
  // ===== QUERY METHODS =====
  getItemById(id: string): Item | undefined;
  getItemsByType(type: string): Item[];
  getItemsByCategory(category: string): Item[];
  getCraftableItems(gameState: GameState, pawnId?: string): Item[];
  getItemsByWorkType(workType: string): Item[];

  // ===== VALIDATION METHODS =====
  canCraftItem(itemId: string, gameState: GameState, pawnId?: string): boolean;
  hasRequiredMaterials(itemId: string, gameState: GameState): boolean;
  hasRequiredTools(itemId: string, gameState: GameState): boolean;
  hasRequiredBuilding(itemId: string, gameState: GameState): boolean;

  // ===== CALCULATION METHODS =====
  calculateCraftingTime(itemId: string, gameState: GameState, pawnId?: string): number;
  calculateCraftingCost(itemId: string): Record<string, number>;
  calculateItemEffects(itemId: string): Record<string, number>;

  // ===== INVENTORY METHODS =====
  getAvailableQuantity(itemId: string, gameState: GameState): number;
  consumeItems(itemIds: Record<string, number>, gameState: GameState): GameState;
  addItems(itemIds: Record<string, number>, gameState: GameState): GameState;
}
```

#### BuildingService Interface

```typescript
/**
 * BuildingService - Clean interface for building queries and validation
 *
 * IMPLEMENTATION STATUS: ✅ FULLY IMPLEMENTED (BuildingServiceImpl)
 * Location: src/lib/game/services/BuildingService.ts
 */
export interface BuildingService {
  // ===== QUERY METHODS =====
  getBuildingById(id: string): Building | undefined;
  getBuildingsByCategory(category: string): Building[];
  getBuildingsByTier(tier: number): Building[];
  getAvailableBuildings(gameState: GameState, category?: string): Building[];

  // ===== VALIDATION METHODS =====
  canBuildBuilding(buildingId: string, gameState: GameState): boolean;
  hasRequiredResources(buildingId: string, gameState: GameState): boolean;
  hasRequiredResearch(buildingId: string, gameState: GameState): boolean;
  hasRequiredPopulation(buildingId: string, gameState: GameState): boolean;
  hasRequiredTools(buildingId: string, gameState: GameState): boolean;
  meetsStateRestrictions(buildingId: string, gameState: GameState): boolean;

  // ===== CALCULATION METHODS =====
  calculateBuildingCost(buildingId: string): Record<string, number>;
  calculateBuildingEffects(buildingId: string): Record<string, number>;
  calculateConstructionTime(buildingId: string, gameState: GameState): number;
  calculateBuildingEfficiency(buildingId: string, gameState: GameState): number;

  // ===== BUILDING MANAGEMENT =====
  getBuildingDependencies(buildingId: string): string[];
  getBuildingUnlocks(buildingId: string): Building[];
  getBuildingMaintenanceNeeds(buildingId: string): BuildingMaintenanceInfo;
}
```

#### WorkService Interface

```typescript
/**
 * WorkService - Clean interface for work assignment and efficiency
 *
 * IMPLEMENTATION STATUS: ✅ FULLY IMPLEMENTED (WorkServiceImpl)
 * Location: src/lib/game/services/WorkService.ts
 */
export interface WorkService {
  // ===== WORK ASSIGNMENT =====
  assignPawnToWork(pawnId: string, workType: string, locationId: string): boolean;
  getOptimalWorkAssignment(pawnId: string, gameState: GameState): WorkAssignment[];
  validateWorkAssignment(assignment: WorkAssignment, gameState: GameState): boolean;

  // ===== CALCULATION METHODS =====
  calculateWorkEfficiency(pawnId: string, workType: string, gameState: GameState): number;
  calculateResourceProduction(
    workAssignment: WorkAssignment,
    gameState: GameState
  ): Record<string, number>;
  calculateWorkTime(workType: string, pawnId: string, gameState: GameState): number;

  // ===== QUERY METHODS =====
  getWorkCategories(): WorkCategory[];
  getAvailableWork(locationId: string, gameState: GameState): WorkCategory[];
  getPawnWorkHistory(pawnId: string, gameState: GameState): WorkHistory[];
  getWorkRequirements(workType: string): WorkRequirements;
}
```

#### PawnService Interface

```typescript
/**
 * PawnService - Clean interface for pawn behavior and stats
 *
 * IMPLEMENTATION STATUS: ⚠️ INTERFACE DEFINED, PLACEHOLDER IMPLEMENTATION
 * Location: src/lib/game/services/ (interface exists, implementation needed)
 */
export interface PawnService {
  // ===== BEHAVIOR MANAGEMENT =====
  processPawnNeeds(pawnId: string, gameState: GameState): GameState;
  updatePawnMorale(pawnId: string, factors: MoraleFactors, gameState: GameState): GameState;
  processAutomaticBehavior(pawnId: string, gameState: GameState): PawnBehaviorResult;

  // ===== STAT CALCULATIONS =====
  calculateEffectiveStats(pawnId: string, gameState: GameState): RaceStats;
  calculateWorkBonus(pawnId: string, workType: string, gameState: GameState): number;
  calculateEquipmentBonuses(pawnId: string, gameState: GameState): StatBonuses;
  calculateRacialBonuses(pawnId: string): StatBonuses;

  // ===== EQUIPMENT INTEGRATION =====
  equipItem(pawnId: string, itemId: string, slot: EquipmentSlot, gameState: GameState): GameState;
  unequipItem(pawnId: string, slot: EquipmentSlot, gameState: GameState): GameState;
  validateEquipment(pawnId: string, gameState: GameState): EquipmentValidationResult;

  // ===== PAWN MANAGEMENT =====
  createPawn(raceId: string, gameState: GameState): Pawn;
  updatePawnStats(pawnId: string, statUpdates: Partial<RaceStats>, gameState: GameState): GameState;
  getPawnCapabilities(pawnId: string, gameState: GameState): PawnCapabilities;
}
```

#### ResearchService Interface

```typescript
/**
 * ResearchService - Clean interface for research progression
 *
 * IMPLEMENTATION STATUS: ✅ FULLY IMPLEMENTED (ResearchServiceImpl)
 * Location: src/lib/game/services/ResearchService.ts
 */
export interface ResearchService {
  // ===== QUERY METHODS =====
  getResearchById(id: string): ResearchProject | undefined;
  getAvailableResearch(gameState: GameState): ResearchProject[];
  getResearchByCategory(category: string): ResearchProject[];
  getResearchTree(): ResearchTree;

  // ===== VALIDATION METHODS =====
  canResearch(researchId: string, gameState: GameState): boolean;
  hasPrerequisites(researchId: string, gameState: GameState): boolean;
  hasRequiredResources(researchId: string, gameState: GameState): boolean;

  // ===== CALCULATION METHODS =====
  calculateResearchTime(researchId: string, gameState: GameState): number;
  calculateResearchCost(researchId: string): Record<string, number>;
  calculateResearchProgress(researchId: string, gameState: GameState): number;

  // ===== RESEARCH MANAGEMENT =====
  startResearch(researchId: string, gameState: GameState): GameState;
  progressResearch(gameState: GameState): GameState;
  completeResearch(researchId: string, gameState: GameState): GameState;
  getResearchUnlocks(researchId: string): ResearchUnlocks;
}
```

#### EventService Interface

```typescript
/**
 * EventService - Clean interface for event generation and processing
 *
 * IMPLEMENTATION STATUS: ⚠️ INTERFACE DEFINED, PLACEHOLDER IMPLEMENTATION
 * Location: src/lib/game/services/ (interface exists, implementation needed)
 */
export interface EventService {
  // ===== EVENT GENERATION =====
  generateEvents(gameState: GameState): GameEvent[];
  generateRandomEvent(gameState: GameState, category?: string): GameEvent | null;
  generateTriggeredEvents(trigger: EventTrigger, gameState: GameState): GameEvent[];

  // ===== EVENT PROCESSING =====
  processEvent(eventId: string, choice: string, gameState: GameState): GameState;
  validateEventChoice(eventId: string, choice: string, gameState: GameState): boolean;
  calculateEventConsequences(
    eventId: string,
    choice: string,
    gameState: GameState
  ): EventConsequences;

  // ===== EVENT MANAGEMENT =====
  getEventHistory(limit?: number): GameEvent[];
  getActiveEvents(gameState: GameState): GameEvent[];
  dismissEvent(eventId: string, gameState: GameState): GameState;

  // ===== EVENT QUERIES =====
  getEventsByCategory(category: string): GameEvent[];
  getEventsByTrigger(trigger: EventTrigger): GameEvent[];
  getEventProbability(eventId: string, gameState: GameState): number;
}
```

### Service Registry Interface

Central registry for managing all game services with lifecycle management.

```typescript
/**
 * ServiceRegistry - Central registry for all game services
 *
 * IMPLEMENTATION STATUS: ✅ FULLY IMPLEMENTED (ServiceRegistryImpl)
 * Location: src/lib/game/systems/ServiceRegistryImpl.ts
 */
export interface ServiceRegistry {
  // ===== CORE SERVICES =====
  itemService: ItemService;
  buildingService: BuildingService;
  workService: WorkService;
  researchService: ResearchService;
  pawnService: PawnService;
  eventService: EventService;

  // ===== SERVICE MANAGEMENT =====
  isInitialized(): boolean;
  getServiceStatus(serviceName: string): ServiceStatus;
  getAllServiceStatuses(): Record<string, ServiceStatus>;

  // ===== SERVICE LIFECYCLE =====
  initializeServices(gameState: GameState): Promise<ServiceInitializationResult>;
  shutdownServices(): Promise<void>;
  restartService(serviceName: string): Promise<boolean>;

  // ===== SERVICE COMMUNICATION =====
  broadcastToServices(message: ServiceMessage): void;
  getServiceDependencies(serviceName: string): string[];
  validateServiceDependencies(): ServiceValidationResult;
}
```

## System Integration Interfaces

### System Interaction Coordinator

Handles standardized communication patterns between systems.

```typescript
/**
 * SystemInteractionCoordinator - Handles system-to-system communication
 *
 * IMPLEMENTATION STATUS: ✅ FULLY IMPLEMENTED (SystemInteractionCoordinatorImpl)
 * Location: src/lib/game/systems/SystemInteractionCoordinatorImpl.ts
 */
export interface SystemInteractionCoordinator {
  // ===== DATA REQUEST HANDLING =====
  processDataRequest(request: SystemDataRequest): Promise<SystemDataResponse>;
  registerDataProvider(systemName: string, provider: DataProvider): void;

  // ===== EVENT PROPAGATION =====
  propagateEvent(event: SystemEvent): Promise<EventProcessingResult>;
  registerEventHandler(systemName: string, eventType: string, handler: EventHandler): void;

  // ===== STATE COORDINATION =====
  coordinateStateUpdate(update: StateUpdateRequest): Promise<StateUpdateResult>;
  validateStateConsistency(gameState: GameState): ConsistencyValidationResult;

  // ===== ERROR HANDLING =====
  handleSystemError(error: SystemError): Promise<RecoveryResult>;
  registerErrorHandler(systemName: string, handler: ErrorHandler): void;

  // ===== CONFIGURATION =====
  configureProtocols(config: Partial<InteractionProtocolConfig>): void;
  getProtocolStatus(): InteractionProtocolStatus;
}
```

### Modifier System Interface

Automated system for calculating bonuses and effects from multiple sources.

```typescript
/**
 * ModifierSystem - Automated bonus and effect calculation
 *
 * IMPLEMENTATION STATUS: ✅ FULLY IMPLEMENTED (ModifierSystemImpl)
 * Location: src/lib/game/systems/ModifierSystem.ts
 */
export interface ModifierSystem {
  // ===== MODIFIER CALCULATION =====
  calculatePawnModifiers(pawnId: string, gameState: GameState): PawnModifiers;
  calculateBuildingEffects(buildingId: string, gameState: GameState): BuildingEffectResult;
  calculateItemEffects(itemId: string, context: EffectContext): ItemEffectResult;

  // ===== MODIFIER AGGREGATION =====
  aggregateModifiers(modifiers: Modifier[]): AggregatedModifiers;
  calculateFinalValue(baseValue: number, modifiers: Modifier[]): number;

  // ===== MODIFIER SOURCES =====
  getModifierSources(
    targetId: string,
    modifierType: string,
    gameState: GameState
  ): ModifierSource[];
  validateModifierSources(gameState: GameState): ModifierValidationResult;

  // ===== EFFECT PROCESSING =====
  applyEffects(effects: Effect[], target: any, gameState: GameState): EffectApplicationResult;
  calculateEffectDuration(effectId: string, context: EffectContext): number;
}
```

## Data Transfer Objects

### Result Types

```typescript
/**
 * Standard result types for service operations
 */
export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: ServiceError;
  warnings?: string[];
}

export interface ServiceError {
  code: string;
  message: string;
  context?: Record<string, any>;
  recoverable: boolean;
}

export interface TurnProcessingResult {
  success: boolean;
  turnsProcessed: number;
  systemsUpdated: string[];
  errors?: string[];
  warnings?: string[];
  performanceMetrics?: PerformanceMetrics;
}

export interface SystemInteractionResult {
  success: boolean;
  data?: any;
  error?: string;
  affectedSystems?: string[];
  executionTime?: number;
}

export interface ConsistencyValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  affectedSystems: string[];
  validationTime?: number;
}
```

### Service Status Types

```typescript
/**
 * Service lifecycle and health monitoring types
 */
export interface ServiceStatus {
  name: string;
  isInitialized: boolean;
  isHealthy: boolean;
  lastError?: string;
  dependencies: string[];
  dependents: string[];
  initializationTime?: number;
  lastHealthCheck?: number;
}

export interface ServiceInitializationResult {
  success: boolean;
  initializedServices: string[];
  failedServices: string[];
  errors: Record<string, string>;
  totalInitializationTime: number;
}

export interface ServiceValidationResult {
  isValid: boolean;
  circularDependencies: string[][];
  missingDependencies: Record<string, string[]>;
  unresolvedServices: string[];
}
```

### Communication Types

```typescript
/**
 * Inter-service communication types
 */
export interface ServiceMessage {
  type: ServiceMessageType;
  source: string;
  target?: string;
  data: any;
  timestamp: number;
  correlationId?: string;
}

export type ServiceMessageType =
  | 'state_update'
  | 'calculation_request'
  | 'validation_request'
  | 'event_notification'
  | 'system_shutdown'
  | 'health_check';

export interface SystemDataRequest {
  requestId: string;
  sourceSystem: string;
  targetSystem: string;
  dataType: string;
  parameters: Record<string, any>;
  timeout?: number;
}

export interface SystemDataResponse {
  requestId: string;
  success: boolean;
  data?: any;
  error?: string;
  responseTime: number;
}
```

## Implementation Strategy

### Phase 1: Core Interface Implementation ✅ COMPLETED

1. **GameEngine Interface** ✅ COMPLETED
   - ✅ Implemented GameEngineImpl class with core coordination methods
   - ✅ Added unified calculation methods for efficiency and effects
   - ✅ Implemented state management with validation

2. **Service Layer Interfaces** ✅ MOSTLY COMPLETED
   - ✅ Extracted business logic from data files into service implementations
   - ✅ Implemented clean query and validation methods (ItemService, BuildingService, WorkService, ResearchService)
   - ⚠️ PawnService and EventService need full implementation (currently placeholders)
   - ✅ Added calculation methods with proper error handling

3. **Service Registry** ✅ COMPLETED
   - ✅ Created ServiceRegistryImpl with dependency injection
   - ✅ Implemented service lifecycle management
   - ✅ Added service health monitoring

### Phase 2: System Integration ✅ COMPLETED

1. **System Interaction Coordinator** ✅ COMPLETED
   - ✅ Implemented SystemInteractionCoordinatorImpl with standardized data request handling
   - ✅ Added event propagation system
   - ✅ Created state coordination mechanisms

2. **Modifier System** ✅ COMPLETED
   - ✅ Implemented ModifierSystemImpl with automated bonus calculation
   - ✅ Added modifier aggregation and source tracking
   - ✅ Created effect application system with auto-discovery

3. **Error Handling and Recovery** ✅ MOSTLY COMPLETED
   - ✅ Implemented comprehensive error handling with ServiceResult pattern
   - ✅ Added automatic recovery mechanisms
   - ✅ Created rollback capabilities

### Phase 3: Advanced Features ⚠️ IN PROGRESS

1. **Performance Optimization** ⚠️ PARTIALLY COMPLETED
   - ✅ Added calculation caching in ModifierSystem
   - ⚠️ Batch operations partially implemented
   - ⚠️ Memory usage optimization ongoing

2. **Monitoring and Diagnostics** ✅ MOSTLY COMPLETED
   - ✅ Added performance metrics tracking
   - ✅ Implemented health monitoring for services
   - ✅ Created diagnostic tools (getEngineStatus, service health checks)

3. **Configuration and Extensibility** ⚠️ PARTIALLY COMPLETED
   - ✅ Added runtime configuration for GameEngine
   - ⚠️ Plugin architecture foundation laid
   - ❌ Modding support not yet implemented

### Remaining Work

1. **Complete Service Implementations**
   - Complete PawnService implementation (behavior, needs processing, stat calculations)
   - Complete EventService implementation (generation, processing, integration)

2. **Final Integration Testing**
   - Comprehensive integration testing of all systems
   - Performance optimization and tuning
   - Edge case handling and validation

3. **Advanced Features**
   - Combat system integration (depends on complete architecture)
   - Advanced modding support
   - Enhanced performance optimization

## Success Criteria

### Interface Compliance

- All services implement their respective interfaces completely
- GameEngine provides all required coordination methods
- System interactions follow standardized protocols

### Dependency Elimination

- No circular dependencies between any modules
- Clean unidirectional data flow from UI → GameEngine → Services → Data
- TypeScript compilation without circular dependency warnings

### System Integration

- All systems communicate through GameEngine coordination
- Unified calculations provide consistent results
- State management maintains consistency across all operations

### Performance and Reliability

- No performance degradation compared to current implementation
- Comprehensive error handling with graceful recovery
- Stable operation during extended gameplay sessions

This specification provides the foundation for implementing clean, maintainable architecture that supports complex feature development while eliminating current architectural problems.
