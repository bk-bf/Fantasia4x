# State Management Analysis

## Overview

This document analyzes the current state management patterns across the Fantasia4x application, identifying synchronization issues, reactive data binding problems, and inconsistent update patterns that need to be addressed during the architecture refactoring.

## Current State Architecture

### Store Structure

The application uses multiple Svelte stores for state management:

1. **gameState.ts** - Primary game state store (writable)
2. **uiState.ts** - UI-specific state (screen navigation, notifications)
3. **eventStore.ts** - Event system state (current events, event log)
4. **worldState.ts** - Empty/unused world state
5. **Log.ts** - Activity logging system

### Derived Stores

Several derived stores are created from the main gameState:
- `currentTurn` - Current game turn number
- `currentItem` - Current items array
- `currentRace` - Current race data
- `pawnAbilities` - Calculated pawn abilities

## State Management Patterns Analysis

### 1. GameState Update Patterns

#### Current Pattern: Mixed Update Approaches
```typescript
// Pattern 1: Direct update with manual save
gameState.update(state => {
  const newState = { ...state, turn: state.turn + 1 };
  return newState;
});

// Pattern 2: updateWithSave wrapper
const updateWithSave = (updater: (state: GameState) => GameState) => {
  update(state => {
    const newState = updater(state);
    saveToLocalStorage(newState);
    return newState;
  });
};

// Pattern 3: Direct property mutation (problematic)
state.pawns[pawnIndex] = equipItem(state.pawns[pawnIndex], itemId);
```

**Issues Identified:**
- Inconsistent save patterns - some updates save to localStorage, others don't
- Mixed immutable/mutable update patterns
- No centralized validation of state changes
- Manual synchronization required between related state pieces

#### Recommended Pattern: Centralized State Manager
```typescript
// All updates should go through GameEngine coordinator
gameEngine.updatePawnEquipment(pawnId, itemId, slot);
gameEngine.advanceTurn();
gameEngine.processWorkAssignment(pawnId, workType, priority);
```

### 2. Component State Synchronization Issues

#### Problem: Stale State References
```typescript
// PawnScreen.svelte - Tracking by ID to prevent stale references
let selectedPawnId: string | null = null;
const unsubscribe = gameState.subscribe((state) => {
  pawns = state.pawns || [];
  // Update selectedPawn to the latest version from state
  if (selectedPawnId && pawns.length > 0) {
    const updatedPawn = pawns.find((p) => p.id === selectedPawnId);
    if (updatedPawn) {
      selectedPawn = updatedPawn;
    }
  }
});
```

**Issues:**
- Components must manually track entity IDs to avoid stale references
- Complex synchronization logic scattered across components
- Risk of displaying outdated information

#### Problem: Multiple Subscriptions Per Component
```typescript
// ResourceSidebar.svelte - Multiple store subscriptions
const unsubscribeItems = currentItem.subscribe((newItems) => {
  // Handle items update
});
const unsubscribeRace = currentRace.subscribe((value) => {
  // Handle race update
});
```

**Issues:**
- Components subscribe to multiple derived stores
- Potential for subscription leaks if not properly cleaned up
- Complex dependency management

### 3. Reactive Data Binding Problems

#### Problem: Manual Change Tracking
```typescript
// ResourceSidebar.svelte - Manual animation tracking
let itemChanges: Record<string, number> = {};
newItems.forEach((newItem) => {
  const oldItem = items.find((i) => i.id === newItem.id);
  if (oldItem && oldItem.amount !== newItem.amount) {
    const change = newItem.amount - oldItem.amount;
    if (change > 0) {
      itemChanges[newItem.id] = change;
      setTimeout(() => {
        itemChanges[newItem.id] = 0;
      }, 2000);
    }
  }
});
```

**Issues:**
- Manual tracking of state changes for UI animations
- Timeout-based cleanup that could cause memory leaks
- No centralized change detection system

#### Problem: Computed State Inconsistencies
```typescript
// MainScreen.svelte - Reactive statements with complex dependencies
$: currentActivityLog = (() => {
  switch (logFilter) {
    case 'work': return $workActivity;
    case 'events': return $eventActivity;
    case 'critical': return $criticalActivity;
    default: return $recentActivity;
  }
})();
```

**Issues:**
- Complex reactive computations scattered across components
- Potential for circular dependencies in reactive statements
- No centralized computed state management

### 4. State Persistence Issues

#### Problem: Inconsistent Save/Load Patterns
```typescript
// gameState.ts - Save/load mixed with business logic
function saveToLocalStorage(state: GameState) {
  if (browser) {
    localStorage.setItem('fantasia4x-save', JSON.stringify(state));
  }
}

function loadFromLocalStorage(): GameState | null {
  if (browser) {
    const saved = localStorage.getItem('fantasia4x-save');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.warn('Failed to load save data:', e);
      }
    }
  }
  return null;
}
```

**Issues:**
- Save/load logic mixed with state management
- No versioning or migration support
- Error handling that silently fails
- No validation of loaded state

### 5. Cross-System State Dependencies

#### Problem: Circular State Updates
```typescript
// PawnScreen.svelte - Complex state synchronization
function equipPawnItem(pawnId: string, itemId: string) {
  gameState.update((state) => {
    const pawnIndex = state.pawns.findIndex((p) => p.id === pawnId);
    if (pawnIndex !== -1) {
      state.pawns[pawnIndex] = equipItem(state.pawns[pawnIndex], itemId);
      state = syncAllPawnInventories(state); // Additional sync required
    }
    return state;
  });
}
```

**Issues:**
- Equipment changes require manual inventory synchronization
- Multiple systems must be updated for single actions
- Risk of inconsistent state if synchronization fails

#### Problem: Event System Integration
```typescript
// eventStore.ts - Separate event state management
export const currentEvent = writable<GameEvent | null>(null);
export const eventLog = writable<EventLog[]>([]);
export const showEventModal = writable<boolean>(false);

// gameState.ts - Event generation in turn processing
const event = eventSystem.generateEvent(newState);
if (event) {
  triggerEvent(event); // Updates separate event store
}
```

**Issues:**
- Event state managed separately from game state
- No guaranteed consistency between game state and event state
- Events could be lost if not properly synchronized

## Specific Synchronization Issues

### 1. Inventory vs Equipment Synchronization
- **Problem**: Pawn equipment and global inventory can become desynchronized
- **Current Solution**: Manual `syncAllPawnInventories()` calls
- **Impact**: Items can appear/disappear, equipment can reference non-existent items

### 2. Work Assignment State Consistency
- **Problem**: Work assignments stored separately from pawn state
- **Current Pattern**: `workAssignments: Record<string, WorkAssignment>`
- **Impact**: Pawns can have work assignments that don't match their current state

### 3. Building Effects on Game State
- **Problem**: Building effects calculated during turn processing but not immediately reflected
- **Current Pattern**: `_woodBonus` and `_stoneBonus` cached values
- **Impact**: UI shows outdated production values until next turn

### 4. Research State Propagation
- **Problem**: Research completion affects multiple systems but updates aren't coordinated
- **Impact**: Tool levels, available items, and building options can be inconsistent

## Reactive Data Binding Problems

### 1. Subscription Management
```typescript
// Common pattern across components
const unsubscribe = gameState.subscribe((state) => {
  // Update local component state
});

onDestroy(() => {
  unsubscribe();
});
```

**Problems:**
- Manual subscription cleanup required
- Risk of memory leaks if cleanup is missed
- No automatic dependency tracking

### 2. Derived State Calculations
```typescript
// WorkScreen.svelte - Complex derived calculations
$: allResources = items.filter((item) => item.amount > 0);
$: availableCraftableItems = getCraftableItems(
  completedResearch,
  availableBuildings,
  currentToolLevel,
  currentPopulation,
  selectedItemType === 'all' ? undefined : selectedItemType,
  selectedCategory === 'all' ? undefined : selectedCategory
);
```

**Problems:**
- Expensive calculations run on every state change
- No memoization or caching of computed values
- Potential for infinite reactive loops

### 3. UI State Synchronization
```typescript
// PawnScreen.svelte - Manual UI state tracking
let selectedPawn: Pawn | null = null;
let selectedPawnId: string | null = null;

// Must manually keep UI selection in sync with game state
if (selectedPawnId && pawns.length > 0) {
  const updatedPawn = pawns.find((p) => p.id === selectedPawnId);
  if (updatedPawn) {
    selectedPawn = updatedPawn;
  }
}
```

**Problems:**
- UI state must be manually synchronized with game state
- Risk of displaying stale or incorrect information
- Complex selection management logic

## Recommendations for Refactoring

### 1. Implement Central GameEngine Coordinator
- All state updates go through GameEngine
- Automatic synchronization between related systems
- Centralized validation and consistency checks

### 2. Standardize State Update Patterns
- Single `updateGameState()` method for all changes
- Automatic save/load handling
- Consistent immutable update patterns

### 3. Implement Reactive State Management
- Computed properties for derived state
- Automatic dependency tracking
- Memoization for expensive calculations

### 4. Create Service Layer for State Access
- Clean interfaces for querying game state
- Encapsulated business logic
- Consistent error handling

### 5. Improve Event System Integration
- Events as part of main game state
- Automatic event log updates
- Consistent event handling patterns

## Migration Strategy

### Phase 1: GameEngine Implementation
1. Create GameEngine class as central coordinator
2. Move all state update logic to GameEngine methods
3. Update components to use GameEngine instead of direct store access

### Phase 2: Service Layer Creation
1. Extract query logic into service classes
2. Implement consistent interfaces for data access
3. Add proper error handling and validation

### Phase 3: Reactive System Improvement
1. Implement computed state properties
2. Add automatic dependency tracking
3. Optimize reactive calculations with memoization

### Phase 4: State Persistence Overhaul
1. Separate persistence logic from business logic
2. Add state versioning and migration support
3. Implement proper error handling and recovery

This analysis provides the foundation for implementing clean, consistent state management patterns during the architecture refactoring phase.