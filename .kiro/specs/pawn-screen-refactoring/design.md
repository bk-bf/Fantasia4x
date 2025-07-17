# Design Document

## Overview

The PawnScreen.svelte refactoring will break down a massive 2300+ line component into smaller, focused components. Each component will handle one specific section of the pawn display, making the code easier to read, maintain, and debug. This follows the simple component extraction approach rather than complex service layers.

## Architecture

### Current Problem

The current PawnScreen component is a monolithic file that tries to do everything:
- Display pawn overview information
- Show detailed statistics with formatting
- Handle needs and state display
- Manage racial traits display
- Calculate and show complex abilities
- Handle equipment management

This makes it difficult to:
- Find specific functionality
- Make changes without affecting other areas
- Test individual features
- Understand the code flow

### Target Architecture

The refactored structure will be simple and focused:

```
PawnScreen.svelte (Main container)
├── PawnOverview.svelte (Basic info + status)
├── PawnStats.svelte (Individual statistics)
├── PawnNeeds.svelte (Hunger, fatigue, sleep)
├── PawnTraits.svelte (Racial traits display)
├── PawnAbilities.svelte (Work efficiency, combat, etc.)
└── PawnEquipment.svelte (Equipment management)
```

## Component Design

### Component Breakdown

Each extracted component will be simple and focused:

#### 1. PawnOverview.svelte
- Shows basic pawn info (name, height, weight, size)
- Displays current mood and health status
- Uses utility functions from `pawnUtils.ts` for formatting
- Props: `pawn: Pawn`

#### 2. PawnStats.svelte  
- Displays individual statistics (strength, dexterity, etc.)
- Shows stat bars and color coding
- Uses existing stat formatting utilities
- Props: `pawn: Pawn`

#### 3. PawnNeeds.svelte
- Shows hunger, fatigue, and sleep levels
- Displays current activities (working, sleeping, eating)
- Uses need formatting utilities
- Props: `pawn: Pawn`

#### 4. PawnTraits.svelte
- Displays racial traits with icons and descriptions
- Shows trait effects on the pawn
- Uses existing trait utilities
- Props: `pawn: Pawn`

#### 5. PawnAbilities.svelte
- Shows work efficiency, combat, survival abilities
- Uses existing ModifierSystem for calculations
- Handles breakdown display toggles
- Props: `pawn: Pawn, gameState: GameState`

#### 6. PawnEquipment.svelte
- Manages equipment operations (equip/unequip/use items)
- Uses existing PawnEquipment functions
- Handles loading states for equipment changes
- Props: `pawn: Pawn, gameState: GameState`

### Main PawnScreen Structure

```svelte
<script lang="ts">
  import { gameState } from '$lib/stores/gameState';
  import { uiState } from '$lib/stores/uiState';
  import PawnSelector from '../UI/PawnSelector.svelte';
  import PawnOverview from '../pawn/PawnOverview.svelte';
  import PawnStats from '../pawn/PawnStats.svelte';
  import PawnNeeds from '../pawn/PawnNeeds.svelte';
  import PawnTraits from '../pawn/PawnTraits.svelte';
  import PawnAbilities from '../pawn/PawnAbilities.svelte';
  import PawnEquipment from '../pawn/PawnEquipment.svelte';

  // Simple state management
  let selectedPawn = null;
  let selectedPawnId = null;

  // Event handlers
  function selectPawn(pawn) {
    selectedPawn = pawn;
    selectedPawnId = pawn.id;
  }
</script>

<div class="pawn-screen">
  <div class="pawn-header">
    <button on:click={() => uiState.setScreen('main')}>← Back to Map</button>
    <h2>👥 Your People</h2>
    <PawnSelector {pawns} {selectedPawn} onSelect={selectPawn} />
  </div>

  {#if selectedPawn}
    <div class="pawn-content">
      <PawnOverview pawn={selectedPawn} />
      <PawnStats pawn={selectedPawn} />
      <PawnNeeds pawn={selectedPawn} />
      <PawnTraits pawn={selectedPawn} />
      <PawnAbilities pawn={selectedPawn} gameState={$gameState} />
      <PawnEquipment pawn={selectedPawn} gameState={$gameState} />
    </div>
  {/if}
</div>
```

## Integration with Existing Systems

### Using ModifierSystem

The PawnAbilities component will use the existing ModifierSystem for calculations:

```typescript
// In PawnAbilities.svelte
import { modifierSystem } from '$lib/game/systems/ModifierSystem';

$: allModifierResults = selectedPawn && gameState ? 
  calculateAllModifierResults(selectedPawn, gameState) : {};

function calculateAllModifierResults(pawn, gameState) {
  const results = {
    workEfficiency: {},
    combatEfficiency: {},
    // ... other categories
  };
  
  // Use existing ModifierSystem
  WORK_CATEGORIES.forEach((workCategory) => {
    results.workEfficiency[workCategory.id] = modifierSystem.calculateWorkEfficiency(
      pawn.id,
      workCategory.id,
      gameState
    );
  });
  
  return results;
}
```

### Using PawnEquipment Functions

The PawnEquipment component will use existing equipment functions:

```typescript
// In PawnEquipment.svelte
import {
  equipItem,
  unequipItem,
  useConsumable,
  canEquipItem,
  syncAllPawnInventories
} from '$lib/game/core/PawnEquipment';

function equipPawnItem(pawnId, itemId) {
  equipmentLoading = true;
  gameState.update((state) => {
    const pawnIndex = state.pawns.findIndex((p) => p.id === pawnId);
    if (pawnIndex !== -1) {
      state.pawns[pawnIndex] = equipItem(state.pawns[pawnIndex], itemId);
      state = syncAllPawnInventories(state);
    }
    equipmentLoading = false;
    return state;
  });
}
```

## Error Handling

### Simple Error Handling

Components will handle errors gracefully without complex patterns:

```typescript
// In component - simple error handling
function safeCalculateAbilities(pawn, gameState) {
  try {
    return calculateAllModifierResults(pawn, gameState);
  } catch (error) {
    console.error('Failed to calculate abilities:', error);
    return {}; // Return empty object as fallback
  }
}

// Handle missing pawn data
{#if selectedPawn}
  <PawnOverview pawn={selectedPawn} />
{:else}
  <div class="no-pawn">No pawn selected</div>
{/if}
```

### Equipment Error Handling

```typescript
// Simple equipment error handling
function equipPawnItem(pawnId, itemId) {
  try {
    equipmentLoading = true;
    gameState.update((state) => {
      // ... existing equipment logic
      return state;
    });
  } catch (error) {
    console.error('Equipment error:', error);
    // Show simple error message
    equipmentError = 'Failed to equip item';
  } finally {
    equipmentLoading = false;
  }
}
```

## Testing Strategy

### Component Testing

Each extracted component will be simple to test:

```typescript
// Test individual components
describe('PawnOverview', () => {
  test('should display pawn basic info', () => {
    const mockPawn = createMockPawn();
    render(PawnOverview, { props: { pawn: mockPawn } });
    
    expect(screen.getByText(mockPawn.name)).toBeInTheDocument();
    expect(screen.getByText(`${mockPawn.physicalTraits.height}cm`)).toBeInTheDocument();
  });
});

describe('PawnStats', () => {
  test('should display all stats with proper formatting', () => {
    const mockPawn = createMockPawn();
    render(PawnStats, { props: { pawn: mockPawn } });
    
    expect(screen.getByText('Strength')).toBeInTheDocument();
    expect(screen.getByText(mockPawn.stats.strength.toString())).toBeInTheDocument();
  });
});
```

### Integration Testing

Test the main PawnScreen with all components:

```typescript
describe('PawnScreen Integration', () => {
  test('should display all pawn information sections', () => {
    const mockGameState = createMockGameState();
    render(PawnScreen, { 
      context: new Map([['gameState', writable(mockGameState)]]) 
    });
    
    expect(screen.getByText('👥 Your People')).toBeInTheDocument();
    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Stats')).toBeInTheDocument();
  });
});
```

## Performance Considerations

### Simple Optimizations

Keep performance optimizations simple and focused:

```typescript
// Only recalculate when pawn changes
$: pawnStats = selectedPawn ? formatPawnStats(selectedPawn) : null;

// Only show breakdown when requested
$: showAbilityBreakdown = showBreakdown[abilityType] || false;

// Use existing ModifierSystem caching
$: allAbilities = selectedPawn && gameState ? 
  calculateAllModifierResults(selectedPawn, gameState) : {};
```

### Component Size Targets

- **PawnScreen.svelte**: Reduce from 2300+ to ~200 lines (main container only)
- **Each sub-component**: Keep under 150 lines each
- **Total lines**: Distribute across 6-7 focused components instead of one massive file

## Migration Approach

### Step-by-Step Extraction

Follow the refactoring guide's approach:

1. **Extract PawnOverview** - Move basic info display
2. **Extract PawnStats** - Move statistics display  
3. **Extract PawnNeeds** - Move needs and activities
4. **Extract PawnTraits** - Move racial traits display
5. **Extract PawnAbilities** - Move complex ability calculations
6. **Extract PawnEquipment** - Move equipment management
7. **Update PawnScreen** - Import and use all extracted components

### Maintain Functionality

- Keep all existing features working exactly the same
- Use existing utility functions and systems
- Don't change the user experience
- Test each extraction step individually