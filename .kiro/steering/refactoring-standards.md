# Refactoring Standards

## Implementation Standards for Architecture Migration

### Service Extraction Patterns

#### Business Logic Extraction
```typescript
// BEFORE: Logic mixed with data
export const ITEMS_DATABASE = [...];
export function getCraftableItems(pawnId: string): Item[] {
  // Business logic mixed with data export
}

// AFTER: Pure data export
export const ITEMS_DATABASE = [...];
// Logic moved to ItemService class
```

#### Service Implementation Pattern
```typescript
// Standard service structure
export class ItemService implements IItemService {
  // Query methods
  getItemById(id: string): Item | undefined { ... }
  
  // Validation methods  
  canCraftItem(itemId: string, gameState: GameState): boolean { ... }
  
  // Calculation methods
  calculateCraftingTime(itemId: string, pawnId: string): number { ... }
}
```

### Migration Safety Standards

#### Backup Requirements
- **File Backups**: Create `.backup` copies before modifying any existing files
- **Git Commits**: Commit working state before each major refactoring step
- **Rollback Scripts**: Maintain automated rollback procedures for each phase
- **Validation Tests**: Run full test suite after each change

#### Backward Compatibility Enforcement
```typescript
// Maintain old patterns during transition
export const ItemService = {
  // New service methods
  getItemById: (id: string) => itemService.getItemById(id),
  
  // Legacy function wrappers (temporary)
  getCraftableItems: (pawnId: string) => itemService.getCraftableItems(gameState, pawnId)
};
```

#### Feature Flag Implementation
```typescript
// Configuration-based architecture switching
const USE_GAME_ENGINE = process.env.NODE_ENV === 'development' ? true : false;
const ENABLE_SERVICE_LAYER = true;

// Conditional logic paths
if (USE_GAME_ENGINE) {
  return gameEngine.calculateEfficiency(pawnId, workType);
} else {
  return legacyCalculateEfficiency(pawnId, workType);
}
```

### Testing Standards During Migration

#### Test-First Refactoring
1. **Write Tests**: Create tests for existing functionality before refactoring
2. **Refactor Code**: Extract logic while keeping tests passing
3. **Validate Behavior**: Ensure identical behavior before and after refactoring
4. **Add New Tests**: Test new service interfaces and error conditions

#### Service Testing Pattern
```typescript
describe('ItemService', () => {
  let itemService: ItemService;
  let mockGameState: GameState;
  
  beforeEach(() => {
    itemService = new ItemService();
    mockGameState = createMockGameState();
  });
  
  describe('getCraftableItems', () => {
    test('should return items pawn can craft', () => {
      const result = itemService.getCraftableItems(mockGameState, 'pawn1');
      expect(result).toHaveLength(expectedCount);
      expect(result.every(item => item.craftable)).toBe(true);
    });
  });
});
```

#### Integration Testing Requirements
- **Service Coordination**: Test services working together through GameEngine
- **State Consistency**: Validate state remains consistent across operations
- **Performance Regression**: Ensure no performance degradation
- **UI Integration**: Test that Svelte components update correctly

### Code Quality Standards

#### Import Organization
```typescript
// 1. External libraries
import { writable } from 'svelte/store';
import { v4 as uuidv4 } from 'uuid';

// 2. Internal types and interfaces
import type { GameState, Item, Pawn } from '$lib/game/core/types';

// 3. Services and utilities
import { serviceRegistry } from '$lib/game/services';
import { validateGameState } from '$lib/utils/validation';
```

#### Error Handling Standards
```typescript
// Service result pattern
interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    context?: Record<string, any>;
  };
}

// Implementation example
public craftItem(itemId: string, pawnId: string): ServiceResult<Item> {
  try {
    // Validation
    if (!this.canCraftItem(itemId, pawnId)) {
      return {
        success: false,
        error: {
          code: 'CRAFT_VALIDATION_FAILED',
          message: 'Pawn cannot craft this item',
          context: { itemId, pawnId }
        }
      };
    }
    
    // Business logic
    const item = this.performCrafting(itemId, pawnId);
    return { success: true, data: item };
    
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'CRAFT_SYSTEM_ERROR',
        message: error.message,
        context: { itemId, pawnId }
      }
    };
  }
}
```

### Performance Standards

#### Calculation Caching
```typescript
// Cache expensive calculations
private calculationCache = new Map<string, any>();

calculatePawnEfficiency(pawnId: string, workType: string): number {
  const cacheKey = `${pawnId}-${workType}-${this.gameState.turn}`;
  
  if (this.calculationCache.has(cacheKey)) {
    return this.calculationCache.get(cacheKey);
  }
  
  const result = this.performEfficiencyCalculation(pawnId, workType);
  this.calculationCache.set(cacheKey, result);
  return result;
}
```

#### Memory Management
```typescript
// Proper cleanup in services
export class GameEngine {
  private cleanup(): void {
    this.calculationCache.clear();
    this.eventListeners.forEach(listener => listener.unsubscribe());
    this.services.clear();
  }
  
  public dispose(): void {
    this.cleanup();
  }
}
```

### State Management Standards

#### Immutable State Updates
```typescript
// Correct: Create new state object
updateGameState(updates: Partial<GameState>): GameState {
  const newState = {
    ...this.gameState,
    ...updates,
    // Deep clone complex objects
    pawns: updates.pawns ? [...updates.pawns] : this.gameState.pawns
  };
  
  this.validateStateConsistency(newState);
  return newState;
}

// Incorrect: Mutate existing state
updateGameState(updates: Partial<GameState>): void {
  Object.assign(this.gameState, updates); // DON'T DO THIS
}
```

#### State Validation
```typescript
// Validate state consistency after changes
validateStateConsistency(state: GameState): ValidationResult {
  const issues: string[] = [];
  
  // Check pawn-work assignments
  state.pawns.forEach(pawn => {
    if (pawn.workAssignment && !this.workService.canPawnDoWork(pawn, pawn.workAssignment)) {
      issues.push(`Invalid work assignment for pawn ${pawn.id}`);
    }
  });
  
  // Check inventory consistency
  const totalItems = this.calculateTotalItems(state);
  if (totalItems < 0) {
    issues.push('Negative item quantities detected');
  }
  
  return {
    isValid: issues.length === 0,
    issues
  };
}
```

### Documentation Standards

#### Service Documentation
```typescript
/**
 * ItemService provides clean interface for item queries, crafting validation,
 * and inventory management.
 * 
 * @example
 * ```typescript
 * const craftableItems = itemService.getCraftableItems(gameState, pawnId);
 * const canCraft = itemService.canCraftItem('oak_spear', gameState, pawnId);
 * ```
 */
export class ItemService implements IItemService {
  /**
   * Get all items that a pawn can currently craft
   * @param gameState Current game state
   * @param pawnId Optional pawn ID for pawn-specific crafting
   * @returns Array of craftable items
   */
  getCraftableItems(gameState: GameState, pawnId?: string): Item[] {
    // Implementation
  }
}
```

#### Migration Documentation
- **Before/After Comparisons**: Document what changed and why
- **Breaking Changes**: List any breaking changes and migration paths
- **Performance Impact**: Document performance implications of changes
- **Rollback Procedures**: Clear instructions for reverting changes

### Rollback Standards

#### Emergency Rollback Checklist
1. **Stop Development**: Halt all refactoring work immediately
2. **Restore Backups**: Copy `.backup` files over current files
3. **Disable Features**: Set feature flags to disable new architecture
4. **Run Tests**: Execute full test suite to validate functionality
5. **Document Issues**: Record what caused the rollback need
6. **Plan Recovery**: Determine how to address the issues before continuing

#### Rollback Validation
```bash
#!/bin/bash
# rollback-validation.sh

echo "Validating rollback..."

# Check that game starts without errors
npm run dev &
DEV_PID=$!
sleep 5
kill $DEV_PID

# Run test suite
npm run test

# Check build process
npm run build

echo "Rollback validation complete"
```

## Critical Success Factors

### Architecture Quality Metrics
- **Zero Circular Dependencies**: No import cycles in dependency graph
- **Clean TypeScript Compilation**: No warnings or errors during build
- **Service Interface Compliance**: All services implement required interfaces
- **Test Coverage**: Minimum 80% coverage for service layer code

### Migration Safety Metrics
- **Backward Compatibility**: All existing functionality works unchanged
- **Performance Baseline**: No more than 5% performance degradation
- **State Consistency**: No state corruption during migration
- **Rollback Capability**: Ability to restore original functionality within 5 minutes