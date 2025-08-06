# Design Document

## Overview

The screen refactoring will break down three massive screen components into smaller, focused components. Each screen will follow a consistent pattern: a main container component that imports and orchestrates smaller sub-components, each handling a specific section of functionality. This follows the successful pattern established in the pawn-screen-refactoring spec.

## Architecture

### Current Problem

The current screen components are monolithic files that try to do everything:
- **WorkScreen.svelte (1,313 lines)**: Handles population overview, work priorities, job cycling, production management, and complex UI state
- **ExplorationScreen.svelte (974 lines)**: Manages discovered locations, active missions, available explorations, and resource calculations
- **CraftingScreen.svelte (950 lines)**: Handles item filtering, inventory display, crafting queue, and recipe management

This makes it difficult to:
- Find specific functionality within massive files
- Make changes without affecting other areas
- Test individual features in isolation
- Add new features like healthcare and cooking jobs
- Understand the code flow and debug issues

### Target Architecture

The refactored structure will be simple and focused:

```
WorkScreen.svelte (Main container)
├── PopulationOverview.svelte (Worker cards + current jobs)
├── WorkPriorities.svelte (Individual pawn work assignment)
├── JobQueue.svelte (RimWorld-style job cycling display)
└── ProductionManagement.svelte (Location-based production targets)

ExplorationScreen.svelte (Main container)
├── DiscoveredLocations.svelte (Known locations + resources)
├── ActiveMissions.svelte (Expeditions in progress)
└── AvailableExplorations.svelte (New exploration opportunities)

CraftingScreen.svelte (Main container)
├── CraftingFilters.svelte (Item type and category filters)
├── CurrentInventory.svelte (Crafted items display)
├── CraftingQueue.svelte (Items being crafted)
└── AvailableRecipes.svelte (Craftable items grid)
```

## Component Design

### WorkScreen Components

#### 1. PopulationOverview.svelte
- Shows worker cards with stats and current job indicators
- Displays RimWorld-style job queue for each pawn
- Handles pawn selection for detailed work management
- Uses existing pawn utilities for stat display
- Props: `pawns: Pawn[], workAssignments: Record<string, any>, pawnCurrentJobs: Record<string, any>, onSelectPawn: (pawn: Pawn) => void`

#### 2. WorkPriorities.svelte
- Manages individual pawn work priority settings
- Shows work efficiency calculations and harvest predictions
- Handles priority adjustment with conflict detection
- Uses WorkService for efficiency calculations
- Props: `selectedPawn: Pawn | null, workAssignments: Record<string, any>, onUpdatePriority: (pawnId: string, workId: string, priority: number) => void`

#### 3. JobQueue.svelte
- Displays RimWorld-style job cycling visualization
- Shows current job progress and queue order
- Handles job cycling timer and progression
- Uses existing work category data and colors
- Props: `pawns: Pawn[], pawnCurrentJobs: Record<string, any>, workAssignments: Record<string, any>`

#### 4. ProductionManagement.svelte
- Shows location-based production targets and assignments
- Manages resource allocation percentages
- Displays worker assignments per location/work type
- Uses LocationService for location data
- Props: `discoveredLocations: Location[], productionTargets: any[], workAssignments: Record<string, any>`

### ExplorationScreen Components

#### 1. DiscoveredLocations.svelte
- Displays known locations with resource information
- Shows resource richness and availability data
- Handles location-specific work bonuses display
- Uses LocationService for resource calculations
- Props: `discoveredLocations: Location[], itemService: ItemService`

#### 2. ActiveMissions.svelte
- Shows expeditions currently in progress
- Displays mission progress with cancel options
- Handles mission recall with partial refunds
- Uses CurrentTask component for consistent UI
- Props: `activeExplorationMissions: Mission[], onRecallMission: (index: number) => void`

#### 3. AvailableExplorations.svelte
- Lists available exploration opportunities
- Shows mission requirements and success chances
- Handles mission launch with resource validation
- Uses existing requirement checking patterns
- Props: `availableExplorationMissions: Mission[], race: Race, itemMap: Record<string, number>, onLaunchMission: (mission: Mission) => void`

### CraftingScreen Components

#### 1. CraftingFilters.svelte
- Provides item type and category filtering
- Shows filter buttons with icons and counts
- Handles filter state management
- Uses existing item categorization
- Props: `selectedItemType: string, selectedCategory: string, onFilterChange: (type: string, category: string) => void`

#### 2. CurrentInventory.svelte
- Displays crafted items with rarity indicators
- Shows item details and quantities
- Handles inventory item display formatting
- Uses ItemService for item data
- Props: `inventory: Record<string, number>, itemService: ItemService`

#### 3. CraftingQueue.svelte
- Shows items currently being crafted
- Displays crafting progress with cancel options
- Handles queue management and refunds
- Uses CurrentTask component for consistency
- Props: `craftingQueue: CraftingItem[], onCancelCrafting: (index: number) => void`

#### 4. AvailableRecipes.svelte
- Lists craftable items with requirements
- Shows crafting costs and special properties
- Handles crafting initiation with validation
- Uses existing crafting cost calculations
- Props: `availableCraftableItems: Item[], itemMap: Record<string, number>, gameState: GameState, onStartCrafting: (item: Item) => void`

### Main Screen Structure

Each main screen component will follow this pattern:

```svelte
<script lang="ts">
  import { gameState } from '$lib/stores/gameState';
  import { uiState } from '$lib/stores/uiState';
  import PopulationOverview from '../work/PopulationOverview.svelte';
  import WorkPriorities from '../work/WorkPriorities.svelte';
  import JobQueue from '../work/JobQueue.svelte';
  import ProductionManagement from '../work/ProductionManagement.svelte';

  // Simple state management
  let selectedPawn = null;
  let workAssignments = {};
  let pawnCurrentJobs = {};

  // Event handlers
  function selectPawn(pawn) {
    selectedPawn = pawn;
  }

  function updatePriority(pawnId, workId, priority) {
    // Update logic using existing patterns
  }
</script>

<div class="work-screen">
  <div class="work-header">
    <button on:click={() => uiState.setScreen('main')}>← Back to Map</button>
    <h2>👷 Work Management</h2>
  </div>

  <div class="work-content">
    <PopulationOverview {pawns} {workAssignments} {pawnCurrentJobs} onSelectPawn={selectPawn} />
    <WorkPriorities {selectedPawn} {workAssignments} onUpdatePriority={updatePriority} />
    <JobQueue {pawns} {pawnCurrentJobs} {workAssignments} />
    <ProductionManagement {discoveredLocations} {productionTargets} {workAssignments} />
  </div>
</div>
```

## Integration with Existing Systems

### Using WorkService

Components will use the existing WorkService for calculations:

```typescript
// In WorkPriorities.svelte
import { workService } from '$lib/game/services/WorkService';

$: workEfficiency = selectedPawn && workId ? 
  workService.calculateWorkEfficiency(selectedPawn, workId, $gameState) : 0;

$: expectedHarvest = selectedPawn && workId ?
  workService.calculateHarvestAmount(selectedPawn, workId, priority, $gameState) : 0;
```

### Using LocationService

Components will use the existing LocationService for location data:

```typescript
// In DiscoveredLocations.svelte
import { locationService } from '$lib/game/services/LocationServices';

$: discoveredLocations = locationService.getDiscoveredLocations();

$: resourceRichness = location ? 
  locationService.getLocationResourceRichness(location) : {};
```

### Using ItemService

Components will use the existing ItemService for item operations:

```typescript
// In AvailableRecipes.svelte
import { itemService } from '$lib/game/services/ItemService';

$: canCraftItem = (itemId) => itemService.canCraftItem(itemId, $gameState);

$: itemIcon = (itemId) => itemService.getItemIcon(itemId);
```

## Error Handling

### Simple Error Handling

Components will handle errors gracefully without complex patterns:

```typescript
// In component - simple error handling
function safeCalculateEfficiency(pawn, workType) {
  try {
    return workService.calculateWorkEfficiency(pawn, workType, $gameState);
  } catch (error) {
    console.error('Failed to calculate work efficiency:', error);
    return 0; // Return safe default
  }
}

// Handle missing data
{#if selectedPawn}
  <WorkPriorities pawn={selectedPawn} />
{:else}
  <div class="no-pawn">Select a worker to manage their priorities</div>
{/if}
```

### Service Error Handling

```typescript
// Simple service error handling
function launchExplorationMission(mission) {
  try {
    missionLoading = true;
    gameState.update((state) => {
      // ... existing mission logic
      return state;
    });
  } catch (error) {
    console.error('Mission launch error:', error);
    missionError = 'Failed to launch expedition';
  } finally {
    missionLoading = false;
  }
}
```

## Testing Strategy

### Component Testing

Each extracted component will be simple to test:

```typescript
// Test individual components
describe('PopulationOverview', () => {
  test('should display worker cards with current jobs', () => {
    const mockPawns = createMockPawns();
    const mockJobs = createMockCurrentJobs();
    render(PopulationOverview, { 
      props: { pawns: mockPawns, pawnCurrentJobs: mockJobs } 
    });
    
    expect(screen.getByText(mockPawns[0].name)).toBeInTheDocument();
    expect(screen.getByText('Current Job:')).toBeInTheDocument();
  });
});

describe('CraftingFilters', () => {
  test('should handle filter changes correctly', () => {
    const mockFilterChange = jest.fn();
    render(CraftingFilters, { 
      props: { 
        selectedItemType: 'all', 
        selectedCategory: 'all',
        onFilterChange: mockFilterChange 
      } 
    });
    
    fireEvent.click(screen.getByText('tool'));
    expect(mockFilterChange).toHaveBeenCalledWith('tool', 'all');
  });
});
```

### Integration Testing

Test the main screens with all components:

```typescript
describe('WorkScreen Integration', () => {
  test('should display all work management sections', () => {
    const mockGameState = createMockGameState();
    render(WorkScreen, { 
      context: new Map([['gameState', writable(mockGameState)]]) 
    });
    
    expect(screen.getByText('👷 Work Management')).toBeInTheDocument();
    expect(screen.getByText('Available Workers')).toBeInTheDocument();
    expect(screen.getByText('Work Priorities')).toBeInTheDocument();
  });
});
```

## Performance Considerations

### Simple Optimizations

Keep performance optimizations simple and focused:

```typescript
// Only recalculate when relevant data changes
$: workEfficiency = selectedPawn && workId ? 
  calculateWorkEfficiency(selectedPawn, workId) : 0;

// Only show complex displays when needed
$: showProductionDetails = selectedLocation && productionTargets.length > 0;

// Use existing service caching
$: availableExplorations = gameState ? 
  generateAvailableExplorations(gameState) : [];
```

### Component Size Targets

- **WorkScreen.svelte**: Reduce from 1,313 to ~200 lines (main container only)
- **ExplorationScreen.svelte**: Reduce from 974 to ~200 lines (main container only)  
- **CraftingScreen.svelte**: Reduce from 950 to ~200 lines (main container only)
- **Each sub-component**: Keep under 200 lines each
- **Total lines**: Distribute across 4-5 focused components per screen instead of one massive file

## Migration Approach

### Step-by-Step Extraction

Follow the refactoring guide's approach:

1. **Extract PopulationOverview** - Move worker display and job indicators
2. **Extract WorkPriorities** - Move individual pawn work management
3. **Extract JobQueue** - Move RimWorld-style job cycling display
4. **Extract ProductionManagement** - Move location-based production
5. **Update WorkScreen** - Import and use all extracted components

### Maintain Functionality

- Keep all existing features working exactly the same
- Use existing utility functions and services
- Don't change the user experience
- Test each extraction step individually

### Priority Order

1. **WorkScreen first** - Most critical for healthcare/cooking jobs
2. **ExplorationScreen second** - Complex resource calculations
3. **CraftingScreen third** - Item filtering and queue management

## Directory Structure

```
src/lib/components/
├── screens/
│   ├── WorkScreen.svelte (main container)
│   ├── ExplorationScreen.svelte (main container)
│   └── CraftingScreen.svelte (main container)
├── work/
│   ├── PopulationOverview.svelte
│   ├── WorkPriorities.svelte
│   ├── JobQueue.svelte
│   └── ProductionManagement.svelte
├── exploration/
│   ├── DiscoveredLocations.svelte
│   ├── ActiveMissions.svelte
│   └── AvailableExplorations.svelte
└── crafting/
    ├── CraftingFilters.svelte
    ├── CurrentInventory.svelte
    ├── CraftingQueue.svelte
    └── AvailableRecipes.svelte
```

This follows the same pattern as the successful pawn-screen-refactoring with dedicated directories for each screen's components.