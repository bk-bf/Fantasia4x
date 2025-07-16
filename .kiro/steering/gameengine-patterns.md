---
inclusion: fileMatch
fileMatchPattern: '**/systems/**'
---

# GameEngine Implementation Patterns

## GameEngine Interface Standards

### Core GameEngine Interface

```typescript
interface IGameEngine {
  // System Coordination
  processGameTurn(): void;
  coordinateSystemInteractions(): void;

  // Service Management
  registerService<T>(name: string, service: T): void;
  getService<T>(name: string): T;

  // State Management
  getGameState(): GameState;
  updateGameState(updates: Partial<GameState>): void;

  // Unified Calculations
  calculatePawnEfficiency(pawnId: string, workType: string): number;
  calculateBuildingEffects(buildingId: string): BuildingEffects;
  calculateCraftingTime(itemId: string, pawnId: string): number;

  // System Validation
  validateSystemConsistency(): ValidationResult;
}
```

### Service Registry Integration

```typescript
// GameEngine coordinates all services
export class GameEngine implements IGameEngine {
  private services: Map<string, any> = new Map();

  constructor(private gameState: GameState) {
    this.initializeServices();
  }

  private initializeServices(): void {
    this.registerService('itemService', new ItemService());
    this.registerService('buildingService', new BuildingService());
    this.registerService('workService', new WorkService());
    this.registerService('researchService', new ResearchService());
  }

  registerService<T>(name: string, service: T): void {
    this.services.set(name, service);
  }

  getService<T>(name: string): T {
    const service = this.services.get(name);
    if (!service) {
      throw new Error(`Service ${name} not found`);
    }
    return service as T;
  }
}
```

## Unified Calculation Patterns

### Efficiency Calculation Coordination

```typescript
// GameEngine coordinates complex calculations across services
calculatePawnEfficiency(pawnId: string, workType: string): number {
  const pawn = this.gameState.pawns.find(p => p.id === pawnId);
  if (!pawn) return 0;

  // Coordinate between services for unified calculation
  const workService = this.getService<WorkService>('workService');
  const itemService = this.getService<ItemService>('itemService');

  // Base efficiency from work service
  const baseEfficiency = workService.calculateWorkEfficiency(pawn, workType);

  // Equipment bonuses from item service
  const equipmentBonuses = itemService.calculateEquipmentBonuses(pawn.id);

  // Building bonuses from building service
  const buildingBonuses = this.calculateLocationBonuses(pawn.locationId);

  // Combine all factors through GameEngine
  return this.combineEfficiencyFactors(baseEfficiency, equipmentBonuses, buildingBonuses);
}
```

### State Coordination Patterns

```typescript
// All state changes flow through GameEngine
updateGameState(updates: Partial<GameState>): void {
  // Validate updates before applying
  const validationResult = this.validateStateUpdates(updates);
  if (!validationResult.isValid) {
    throw new Error(`Invalid state update: ${validationResult.issues.join(', ')}`);
  }

  // Apply updates immutably
  this.gameState = {
    ...this.gameState,
    ...updates
  };

  // Notify all services of state change
  this.notifyServicesOfStateChange();

  // Validate final state consistency
  this.validateSystemConsistency();
}
```

## System Interaction Protocols

### Service-to-Service Communication

```typescript
// Services communicate through GameEngine, never directly
coordinateSystemInteractions(): void {
  // Process work assignments
  const workUpdates = this.processWorkAssignments();

  // Update building effects
  const buildingUpdates = this.processBuildingEffects();

  // Coordinate research progress
  const researchUpdates = this.processResearchProgress();

  // Apply all updates atomically
  this.updateGameState({
    ...workUpdates,
    ...buildingUpdates,
    ...researchUpdates
  });
}
```

### Event Processing Coordination

```typescript
// GameEngine coordinates event processing across systems
processGameEvents(): void {
  const eventService = this.getService<EventService>('eventService');
  const pendingEvents = eventService.getPendingEvents();

  pendingEvents.forEach(event => {
    // Coordinate event effects across all relevant systems
    const affectedSystems = this.determineAffectedSystems(event);

    affectedSystems.forEach(systemName => {
      const system = this.getService(systemName);
      system.processEvent(event);
    });

    // Update game state with event results
    this.applyEventEffects(event);
  });
}
```

## Performance Optimization Patterns

### Calculation Caching

```typescript
// Cache expensive calculations with proper invalidation
private calculationCache = new Map<string, any>();
private cacheInvalidationTurn = 0;

calculatePawnEfficiency(pawnId: string, workType: string): number {
  // Invalidate cache on new turn
  if (this.gameState.turn > this.cacheInvalidationTurn) {
    this.calculationCache.clear();
    this.cacheInvalidationTurn = this.gameState.turn;
  }

  const cacheKey = `efficiency-${pawnId}-${workType}`;

  if (this.calculationCache.has(cacheKey)) {
    return this.calculationCache.get(cacheKey);
  }

  const result = this.performEfficiencyCalculation(pawnId, workType);
  this.calculationCache.set(cacheKey, result);
  return result;
}
```

### Batch Processing

```typescript
// Process multiple operations together for efficiency
processBatchOperations(operations: GameOperation[]): void {
  // Group operations by type
  const groupedOps = this.groupOperationsByType(operations);

  // Process each type in batch
  Object.entries(groupedOps).forEach(([type, ops]) => {
    switch (type) {
      case 'work_assignment':
        this.processBatchWorkAssignments(ops);
        break;
      case 'item_crafting':
        this.processBatchCrafting(ops);
        break;
      case 'building_construction':
        this.processBatchConstruction(ops);
        break;
    }
  });

  // Single state update for all operations
  this.updateGameState(this.consolidateOperationResults(operations));
}
```

## Error Handling and Recovery

### System Error Recovery

```typescript
// GameEngine handles system errors gracefully
validateSystemConsistency(): ValidationResult {
  const issues: string[] = [];

  try {
    // Validate each service's state
    this.services.forEach((service, name) => {
      if (service.validateState && !service.validateState(this.gameState)) {
        issues.push(`${name} state validation failed`);
      }
    });

    // Validate cross-system consistency
    if (!this.validateCrossSystemConsistency()) {
      issues.push('Cross-system state inconsistency detected');
    }

  } catch (error) {
    issues.push(`System validation error: ${error.message}`);
  }

  return {
    isValid: issues.length === 0,
    issues
  };
}

// Automatic error recovery
recoverFromError(error: SystemError): RecoveryResult {
  console.warn(`System error detected: ${error.message}`);

  // Attempt to restore to last valid state
  if (this.lastValidState) {
    this.gameState = { ...this.lastValidState };
    return { success: true, message: 'Restored to last valid state' };
  }

  // Attempt service-level recovery
  const recoveryResult = this.attemptServiceRecovery(error);
  if (recoveryResult.success) {
    return recoveryResult;
  }

  // Last resort: reset to safe state
  return this.resetToSafeState();
}
```

### State Backup and Rollback

```typescript
// Maintain state history for rollback capability
private stateHistory: GameState[] = [];
private maxHistorySize = 10;

updateGameState(updates: Partial<GameState>): void {
  // Backup current state before changes
  this.backupCurrentState();

  try {
    // Apply updates
    this.gameState = { ...this.gameState, ...updates };

    // Validate new state
    const validation = this.validateSystemConsistency();
    if (!validation.isValid) {
      throw new Error(`State validation failed: ${validation.issues.join(', ')}`);
    }

  } catch (error) {
    // Rollback on error
    this.rollbackToLastValidState();
    throw error;
  }
}

private backupCurrentState(): void {
  this.stateHistory.push({ ...this.gameState });

  // Maintain history size limit
  if (this.stateHistory.length > this.maxHistorySize) {
    this.stateHistory.shift();
  }
}
```

## Component Integration Patterns

### Svelte Store Integration

```typescript
// GameEngine integrates with Svelte stores
import { writable, derived } from 'svelte/store';

export const gameEngine = writable<GameEngine>();
export const gameState = derived(gameEngine, ($engine) => $engine?.getGameState());

// Component usage pattern
export function createGameEngineStore(initialState: GameState) {
  const engine = new GameEngine(initialState);
  const { subscribe, set, update } = writable(engine);

  return {
    subscribe,
    updateState: (updates: Partial<GameState>) => {
      update((engine) => {
        engine.updateGameState(updates);
        return engine;
      });
    },
    processGameTurn: () => {
      update((engine) => {
        engine.processGameTurn();
        return engine;
      });
    }
  };
}
```

### Component Access Pattern

```typescript
// Components access GameEngine through stores, not direct imports
<script lang="ts">
  import { gameEngine, gameState } from '$lib/stores/gameEngine';

  // Reactive access to game state
  $: pawns = $gameState?.pawns || [];

  // Actions through GameEngine
  function assignPawnToWork(pawnId: string, workType: string) {
    $gameEngine.assignPawnToWork(pawnId, workType);
  }

  function craftItem(itemId: string, pawnId: string) {
    const result = $gameEngine.craftItem(itemId, pawnId);
    if (!result.success) {
      console.error('Crafting failed:', result.error);
    }
  }
</script>
```

## Testing Patterns for GameEngine

### GameEngine Unit Testing

```typescript
describe('GameEngine', () => {
  let gameEngine: GameEngine;
  let mockGameState: GameState;

  beforeEach(() => {
    mockGameState = createMockGameState();
    gameEngine = new GameEngine(mockGameState);
  });

  describe('Service Coordination', () => {
    test('should coordinate pawn efficiency calculation', () => {
      const efficiency = gameEngine.calculatePawnEfficiency('pawn1', 'mining');
      expect(efficiency).toBeGreaterThan(0);
      expect(efficiency).toBeLessThanOrEqual(2.0); // Max efficiency cap
    });

    test('should maintain state consistency during updates', () => {
      gameEngine.updateGameState({ turn: 5 });
      const validation = gameEngine.validateSystemConsistency();
      expect(validation.isValid).toBe(true);
    });
  });
});
```

### Integration Testing Patterns

```typescript
describe('GameEngine Integration', () => {
  test('should handle complete game turn processing', () => {
    const gameEngine = new GameEngine(createRealGameState());

    // Process multiple turns
    for (let i = 0; i < 10; i++) {
      gameEngine.processGameTurn();

      // Validate state after each turn
      const validation = gameEngine.validateSystemConsistency();
      expect(validation.isValid).toBe(true);
    }
  });
});
```
