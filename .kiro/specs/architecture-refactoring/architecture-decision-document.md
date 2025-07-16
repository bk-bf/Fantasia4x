# Architecture Decision Document (ADD)

_Fantasia4x Architecture Refactoring - Version 1.0_

## Document Overview

This Architecture Decision Document captures the key architectural decisions made during the Fantasia4x refactoring initiative. Each decision is documented with context, rationale, alternatives considered, and consequences to provide future developers with the reasoning behind the current architecture.

## Table of Contents

1. [ADR-001: GameEngine Central Coordinator Pattern](#adr-001-gameengine-central-coordinator-pattern)
2. [ADR-002: Service Layer Architecture](#adr-002-service-layer-architecture)
3. [ADR-003: Circular Dependency Elimination Strategy](#adr-003-circular-dependency-elimination-strategy)
4. [ADR-004: Business Logic Extraction from Data Files](#adr-004-business-logic-extraction-from-data-files)
5. [ADR-005: Unified Calculation System](#adr-005-unified-calculation-system)
6. [ADR-006: State Management Centralization](#adr-006-state-management-centralization)
7. [ADR-007: Service Registry Pattern](#adr-007-service-registry-pattern)
8. [ADR-008: Error Handling and Recovery Strategy](#adr-008-error-handling-and-recovery-strategy)
9. [ADR-009: Migration Strategy and Backward Compatibility](#adr-009-migration-strategy-and-backward-compatibility)
10. [ADR-010: Testing and Validation Approach](#adr-010-testing-and-validation-approach)

---

## ADR-001: GameEngine Central Coordinator Pattern

### Status

**ACCEPTED** - Implemented in Phase 1

### Context

The original architecture lacked a central coordinator, leading to scattered system interactions, inconsistent calculations, and difficulty implementing complex features like combat. Systems directly called each other, creating tight coupling and making it impossible to implement unified game mechanics.

### Decision

Implement a GameEngine class that serves as the central coordinator for all system interactions, calculations, and state management.

### Rationale

- **Single Source of Truth**: All complex calculations go through GameEngine
- **System Coordination**: GameEngine mediates all inter-system communication
- **Unified Interface**: Provides consistent API for all game operations
- **Future-Proof**: Enables complex features like combat without architectural changes

### Alternatives Considered

1. **Event Bus Pattern**: Would have created loose coupling but made debugging difficult
2. **Direct Service Communication**: Would have perpetuated existing coupling issues
3. **Multiple Coordinators**: Would have created coordination complexity between coordinators

### Consequences

**Positive:**

- Clean system integration points for new features
- Unified calculation system eliminates inconsistencies
- Centralized state validation ensures consistency
- Simplified testing through single integration point

**Negative:**

- GameEngine could become a "god object" if not carefully managed
- Requires discipline to route all interactions through GameEngine
- Initial implementation complexity higher than direct service calls

### Implementation Notes

```typescript
interface GameEngine {
  // System Coordination
  processGameTurn(): void;
  coordinateSystemInteractions(): void;

  // Unified Calculations
  calculatePawnEfficiency(pawnId: string, workType: string): number;
  calculateBuildingEffects(buildingId: string): BuildingEffects;

  // State Management
  getGameState(): GameState;
  updateGameState(updates: Partial<GameState>): void;
}
```

---

## ADR-002: Service Layer Architecture

### Status

**ACCEPTED** - Implemented in Phase 1

### Context

Business logic was scattered throughout monolithic data files (Items.ts, Buildings.ts), making it difficult to test, maintain, and extend. Functions were mixed with data exports, creating maintenance nightmares and preventing clean separation of concerns.

### Decision

Extract all business logic into dedicated service classes that provide clean, focused interfaces for specific game systems.

### Rationale

- **Separation of Concerns**: Business logic separated from data definitions
- **Testability**: Services can be unit tested independently
- **Maintainability**: Logic changes don't require editing large data files
- **Reusability**: Services can be used across multiple components

### Alternatives Considered

1. **Utility Functions**: Would have been simpler but wouldn't provide clean interfaces
2. **Static Classes**: Would have made dependency injection and testing difficult
3. **Functional Approach**: Would have made state management and caching complex

### Consequences

**Positive:**

- Clean, testable business logic
- Easy to add new functionality without touching data files
- Clear interfaces make system boundaries explicit
- Improved code organization and maintainability

**Negative:**

- Additional abstraction layer increases initial complexity
- Requires consistent patterns across all services
- More files to maintain than monolithic approach

### Implementation Notes

```typescript
// Service interface pattern
interface ItemService {
  getItemById(id: string): Item | undefined;
  getCraftableItems(gameState: GameState, pawnId?: string): Item[];
  canCraftItem(itemId: string, gameState: GameState, pawnId: string): boolean;
  calculateCraftingTime(itemId: string, pawnId: string): number;
}
```

---

## ADR-003: Circular Dependency Elimination Strategy

### Status

**ACCEPTED** - Implemented in Phase 1

### Context

The original architecture had circular dependencies: Pawns → Items → Work → Pawns, making it impossible to add new features without breaking existing functionality. TypeScript compilation was slow and error-prone due to circular imports.

### Decision

Implement strict unidirectional dependency flow: UI Components → GameEngine → Service Layer → Data Layer.

### Rationale

- **Predictable Dependencies**: Clear hierarchy eliminates circular imports
- **Faster Compilation**: TypeScript compiles faster without circular dependencies
- **Easier Testing**: Each layer can be tested independently
- **Cleaner Architecture**: Unidirectional flow is easier to understand and maintain

### Alternatives Considered

1. **Dependency Injection**: Would have been complex to implement in TypeScript
2. **Event-Driven Architecture**: Would have made data flow harder to trace
3. **Modular Monolith**: Would have perpetuated existing coupling issues

### Consequences

**Positive:**

- Fast, clean TypeScript compilation
- Predictable data flow makes debugging easier
- Each system can be developed and tested independently
- New features integrate cleanly without breaking existing code

**Negative:**

- Requires discipline to maintain unidirectional flow
- Some operations require more indirection than direct calls
- Initial refactoring effort to eliminate existing circular dependencies

### Implementation Notes

```typescript
// Correct dependency flow
UI Component → GameEngine → ItemService → ITEMS_DATABASE

// Prohibited patterns
ItemService ↔ WorkService (circular)
Component → Service (bypassing GameEngine)
```

---

## ADR-004: Business Logic Extraction from Data Files

### Status

**ACCEPTED** - Implemented in Phase 1

### Context

Data files like Items.ts (2000+ lines) and Buildings.ts (1000+ lines) contained both data definitions and business logic, making them difficult to maintain, test, and extend. Adding new items required navigating complex business logic mixed with data.

### Decision

Keep data files as pure data exports and extract all business logic into service classes.

### Rationale

- **Single Responsibility**: Data files only contain data, services only contain logic
- **Maintainability**: Easy to add new items without touching business logic
- **Testability**: Business logic can be unit tested independently
- **Mod-Friendly**: Modders can easily understand and modify pure data files

### Alternatives Considered

1. **Split Data Files**: Would have created many small files that are hard to navigate
2. **Keep Mixed Approach**: Would have perpetuated existing maintenance issues
3. **Move Everything to Services**: Would have made data harder to find and edit

### Consequences

**Positive:**

- Easy to add new content by editing data files
- Business logic changes don't require touching data files
- Clear separation makes codebase easier to understand
- Modding support through clean data file structure

**Negative:**

- Requires consistent patterns to avoid logic creeping back into data files
- More indirection when accessing data with associated logic
- Initial extraction effort for existing mixed files

### Implementation Notes

```typescript
// Data file (Items.ts) - Pure data only
export const ITEMS_DATABASE: Item[] = [
  {
    id: 'oak_spear',
    name: 'Oak Spear',
    type: 'weapon',
    damage: 8
    // ... only data properties
  }
];

// Service file (ItemService.ts) - Logic only
export class ItemService {
  getCraftableItems(gameState: GameState): Item[] {
    return ITEMS_DATABASE.filter((item) => this.canCraftItem(item.id, gameState));
  }
}
```

---

## ADR-005: Unified Calculation System

### Status

**ACCEPTED** - Implemented in Phase 1

### Context

Efficiency calculations, bonus applications, and modifier aggregations were scattered throughout the codebase, leading to inconsistent results and making it impossible to implement features like combat that require unified stat calculations.

### Decision

Centralize all calculations in the GameEngine with a unified modifier system that automatically aggregates bonuses from equipment, buildings, research, and other sources.

### Rationale

- **Consistency**: All calculations use the same logic and produce consistent results
- **Maintainability**: Changes to calculation logic only need to be made in one place
- **Extensibility**: New bonus sources can be added without changing existing calculations
- **Performance**: Calculations can be cached and optimized centrally

### Alternatives Considered

1. **Distributed Calculations**: Would have perpetuated existing inconsistency issues
2. **Static Utility Functions**: Would have made caching and state management difficult
3. **Event-Based Calculations**: Would have made debugging and tracing difficult

### Consequences

**Positive:**

- Consistent calculation results across all systems
- Easy to add new bonus sources (equipment, buildings, research)
- Centralized caching improves performance
- Combat system can leverage existing calculation infrastructure

**Negative:**

- GameEngine becomes more complex with calculation responsibilities
- All calculation changes must go through GameEngine
- Requires careful design to avoid performance bottlenecks

### Implementation Notes

```typescript
// Unified calculation interface
interface GameEngine {
  calculatePawnEfficiency(pawnId: string, workType: string): number;
  calculateBuildingEffects(buildingId: string): BuildingEffects;
  calculateCombatStats(pawnId: string): CombatStats;

  // Modifier aggregation
  aggregateModifiers(sources: ModifierSource[]): ModifierSet;
}
```

---

## ADR-006: State Management Centralization

### Status

**ACCEPTED** - Implemented in Phase 1

### Context

State updates were scattered throughout components and services, leading to synchronization issues, inconsistent UI updates, and save/load problems. Components directly mutated game state, making it difficult to track changes and maintain consistency.

### Decision

Centralize all state management through the GameEngine with immutable state updates and reactive store integration.

### Rationale

- **Consistency**: All state changes go through a single point of control
- **Reactivity**: Svelte stores automatically update when state changes
- **Debugging**: Centralized state changes are easier to debug and trace
- **Save/Load**: Consistent state structure makes persistence reliable

### Alternatives Considered

1. **Component-Level State**: Would have perpetuated existing synchronization issues
2. **Multiple State Managers**: Would have created coordination complexity
3. **Direct Store Mutations**: Would have made change tracking difficult

### Consequences

**Positive:**

- Consistent state across all components
- Reliable save/load functionality
- Easy to implement features like undo/redo
- Reactive UI updates work correctly

**Negative:**

- All state changes must go through GameEngine
- Requires discipline to avoid direct state mutations
- Initial complexity higher than direct mutations

### Implementation Notes

```typescript
// Centralized state management
interface GameEngine {
  getGameState(): GameState;
  updateGameState(updates: Partial<GameState>): void;
  validateStateConsistency(): ValidationResult;

  // Reactive integration
  subscribeToStateChanges(callback: (state: GameState) => void): void;
}
```

---

## ADR-007: Service Registry Pattern

### Status

**ACCEPTED** - Implemented in Phase 1

### Context

Services needed to communicate with each other, but direct service-to-service communication would have created circular dependencies. Components needed access to services without creating tight coupling.

### Decision

Implement a ServiceRegistry that provides unified access to all services and manages service dependencies through the GameEngine.

### Rationale

- **Dependency Management**: Services can access other services without circular dependencies
- **Unified Access**: Single point of access for all services
- **Testability**: Easy to mock services for testing
- **Flexibility**: Services can be swapped or extended without changing consumers

### Alternatives Considered

1. **Direct Service Imports**: Would have created circular dependency issues
2. **Dependency Injection Framework**: Would have added complexity and external dependencies
3. **Global Service Objects**: Would have made testing and mocking difficult

### Consequences

**Positive:**

- Clean service access without circular dependencies
- Easy to test with service mocking
- Services can be extended or replaced without breaking consumers
- Centralized service lifecycle management

**Negative:**

- Additional abstraction layer
- Services must be registered before use
- Requires consistent patterns across all service access

### Implementation Notes

```typescript
// Service registry pattern
interface ServiceRegistry {
  itemService: ItemService;
  buildingService: BuildingService;
  workService: WorkService;
  pawnService: PawnService;
}

// Usage through GameEngine
const gameEngine = new GameEngine(serviceRegistry);
const items = gameEngine.services.itemService.getCraftableItems(gameState);
```

---

## ADR-008: Error Handling and Recovery Strategy

### Status

**ACCEPTED** - Implemented in Phase 1

### Context

The original architecture had inconsistent error handling, making it difficult to debug issues and recover from errors gracefully. Errors in one system could crash the entire game without clear indication of the problem.

### Decision

Implement a comprehensive error handling strategy with ServiceResult pattern, automatic error recovery, and graceful degradation.

### Rationale

- **Reliability**: System continues operating even when individual operations fail
- **Debugging**: Clear error messages with context make issues easier to diagnose
- **User Experience**: Graceful error handling prevents game crashes
- **Recovery**: Automatic recovery mechanisms restore system stability

### Alternatives Considered

1. **Exception-Based Handling**: Would have made error flow difficult to trace
2. **Silent Failures**: Would have made debugging nearly impossible
3. **Global Error Handlers**: Would have made specific error handling difficult

### Consequences

**Positive:**

- Robust error handling prevents game crashes
- Clear error messages improve debugging experience
- Automatic recovery maintains game stability
- Graceful degradation preserves user experience

**Negative:**

- More verbose code with explicit error handling
- Requires consistent error handling patterns
- Additional complexity in service implementations

### Implementation Notes

```typescript
// ServiceResult pattern
interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    context?: Record<string, any>;
  };
}

// Error recovery in GameEngine
interface GameEngine {
  recoverFromError(error: SystemError): RecoveryResult;
  rollbackToLastValidState(): boolean;
  validateSystemState(): ValidationResult;
}
```

---

## ADR-009: Migration Strategy and Backward Compatibility

### Status

**ACCEPTED** - Implemented in Phase 1

### Context

The refactoring needed to be done without breaking existing functionality or requiring a complete rewrite. The system needed to remain playable throughout the migration process.

### Decision

Implement a phased migration strategy with feature flags, backward compatibility layers, and incremental component updates.

### Rationale

- **Risk Mitigation**: Incremental changes reduce risk of breaking existing functionality
- **Continuous Operation**: Game remains playable throughout refactoring
- **Rollback Capability**: Can revert to previous state if issues arise
- **Team Productivity**: Developers can continue working while refactoring proceeds

### Alternatives Considered

1. **Big Bang Rewrite**: Would have been too risky and time-consuming
2. **Parallel Development**: Would have required maintaining two codebases
3. **Feature Freeze**: Would have stopped all development during refactoring

### Consequences

**Positive:**

- Low-risk migration with ability to rollback at any point
- Continuous game functionality throughout refactoring
- Incremental validation of each change
- Team can continue development work

**Negative:**

- Temporary code complexity with dual patterns
- Requires discipline to maintain backward compatibility
- Migration takes longer than complete rewrite

### Implementation Notes

```typescript
// Feature flag pattern
const USE_NEW_ARCHITECTURE = process.env.NODE_ENV === 'development';

// Backward compatibility layer
export const ItemService = {
  // New service methods
  getItemById: (id: string) => serviceRegistry.itemService.getItemById(id),

  // Legacy function wrappers (temporary)
  getCraftableItems: (pawnId: string) =>
    serviceRegistry.itemService.getCraftableItems(gameState, pawnId)
};
```

---

## ADR-010: Testing and Validation Approach

### Status

**ACCEPTED** - Implemented in Phase 1

### Context

The original codebase had minimal testing, making refactoring risky and error-prone. A comprehensive testing strategy was needed to ensure refactoring didn't break existing functionality.

### Decision

Implement a multi-layered testing approach with unit tests for services, integration tests for GameEngine coordination, and end-to-end tests for complete game functionality.

### Rationale

- **Safety**: Comprehensive tests catch regressions during refactoring
- **Confidence**: Developers can make changes knowing tests will catch issues
- **Documentation**: Tests serve as documentation for expected behavior
- **Quality**: Consistent testing improves overall code quality

### Alternatives Considered

1. **Manual Testing Only**: Would have been too time-consuming and error-prone
2. **Unit Tests Only**: Would have missed integration issues
3. **End-to-End Tests Only**: Would have been too slow and brittle

### Consequences

**Positive:**

- High confidence in refactoring changes
- Automated regression detection
- Tests serve as living documentation
- Improved code quality through testable design

**Negative:**

- Initial time investment to write comprehensive tests
- Tests must be maintained alongside code changes
- Test suite execution time increases with coverage

### Implementation Notes

```typescript
// Service unit testing
describe('ItemService', () => {
  test('should return craftable items for pawn', () => {
    const result = itemService.getCraftableItems(mockGameState, 'pawn1');
    expect(result).toHaveLength(expectedCount);
  });
});

// GameEngine integration testing
describe('GameEngine Integration', () => {
  test('should coordinate pawn work assignment', () => {
    const result = gameEngine.assignPawnToWork(pawnId, workType);
    expect(result.success).toBe(true);
  });
});
```

---

## Decision Summary

| ADR | Decision                        | Status   | Impact                                |
| --- | ------------------------------- | -------- | ------------------------------------- |
| 001 | GameEngine Central Coordinator  | Accepted | High - Enables all future features    |
| 002 | Service Layer Architecture      | Accepted | High - Improves maintainability       |
| 003 | Circular Dependency Elimination | Accepted | High - Enables clean development      |
| 004 | Business Logic Extraction       | Accepted | Medium - Improves code organization   |
| 005 | Unified Calculation System      | Accepted | High - Enables combat system          |
| 006 | State Management Centralization | Accepted | High - Fixes synchronization issues   |
| 007 | Service Registry Pattern        | Accepted | Medium - Enables clean service access |
| 008 | Error Handling Strategy         | Accepted | Medium - Improves reliability         |
| 009 | Migration Strategy              | Accepted | High - Enables safe refactoring       |
| 010 | Testing Approach                | Accepted | High - Ensures quality                |

## Future Considerations

### Potential Architecture Evolution

- **Combat System Integration**: Current architecture is designed to support complex combat features
- **Modding Support**: Service layer provides clean extension points for mods
- **Performance Optimization**: Centralized calculations enable advanced caching strategies
- **Multi-Player Support**: GameEngine coordination could support networked gameplay

### Monitoring and Maintenance

- **Performance Metrics**: Monitor GameEngine performance as complexity increases
- **Architecture Compliance**: Regular reviews to ensure patterns are followed consistently
- **Technical Debt**: Periodic refactoring to prevent architecture degradation
- **Documentation Updates**: Keep this document current as architecture evolves

---

_This document represents the architectural decisions made during the Fantasia4x refactoring initiative. It should be updated as new decisions are made or existing decisions are revised._
