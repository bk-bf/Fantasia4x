# Architecture Refactoring Design

## Philosophy: Follow the Pawn-Screen Model

The pawn-screen-refactoring demonstrated how to transform a monolithic, unmaintainable file into a clean, modular system. We apply the same principles to the business logic architecture:

**Pawn-Screen Success Pattern:**
- **Before**: 2500+ line monolithic file mixing all concerns
- **After**: 218-line coordinator + 6 focused components
- **Result**: 91% reduction, clean separation, high maintainability

**Architecture Refactoring Goal:**
- **Before**: Data + logic mixed in monolithic files with circular dependencies
- **After**: Data files + service files + GameEngine coordinator
- **Result**: Clean separation, zero circular dependencies, ready for complex features

## Core Design Principles

### 1. Separation of Concerns
**Just as PawnScreen separates UI concerns, we separate business concerns:**

```
DATA FILES (Pure Exports)          SERVICE FILES (Pure Logic)
├── Work.ts                    ├── WorkService.ts
│   └── WORK_CATEGORIES[]      │   ├── assignWork()
├── Items.ts                   ├── ItemService.ts  
│   └── ITEMS_DATABASE[]       │   ├── craftItem()
├── Buildings.ts               ├── BuildingService.ts
│   └── AVAILABLE_BUILDINGS[]  │   ├── placeBuilding()
└── Research.ts                └── ResearchService.ts
    └── RESEARCH_DATABASE[]        └── unlockResearch()
```

### 2. Central Coordination
**GameEngineImpl.ts serves as the architecture's "PawnScreen.svelte":**

- **Single Responsibility**: Coordinate services (not implement logic)
- **Clean Interface**: UI components only access GameEngine methods
- **State Management**: Single point for all game state updates
- **Service Orchestration**: Services interact through GameEngine only

### 3. Unidirectional Data Flow
**Inspired by PawnScreen's component hierarchy:**

```
UI Components (PawnScreen.svelte)
       ↓
GameEngine (GameEngineImpl.ts)
       ↓
Service Layer (WorkService.ts, etc.)
       ↓
Data Layer (Work.ts, etc.)
```

**Key Rules:**
- UI never imports services directly
- Services never import UI components
- Data files never import business logic
- GameEngine coordinates all inter-service communication

## Architecture Layers

### Layer 1: Data Files (Pure Exports)
**Role**: Provide structured data only, no business logic

```typescript
// Work.ts - ONLY data exports
export const WORK_CATEGORIES: WorkCategory[] = [
  { id: 'farming', name: 'Farming', baseTime: 4 },
  { id: 'crafting', name: 'Crafting', baseTime: 6 }
];

// NO business logic functions allowed here
```

### Layer 2: Service Files (Pure Logic)
**Role**: Implement all business logic, consume data, provide clean interfaces

```typescript
// WorkService.ts - ONLY business logic
class WorkService {
  constructor(private workData: WorkCategory[]) {}
  
  assignWork(pawnId: string, workType: string): WorkAssignment {
    // Business logic implementation
  }
  
  calculateEfficiency(pawn: Pawn, work: WorkCategory): number {
    // Calculation logic
  }
}
```

### Layer 3: GameEngine (Coordination Hub)
**Role**: Orchestrate services, manage state, provide unified interface

```typescript
// GameEngineImpl.ts - ONLY coordination
class GameEngineImpl implements GameEngine {
  constructor(
    private workService: WorkService,
    private itemService: ItemService,
    // ... other services
  ) {}
  
  // Coordinate work assignment with item consumption
  assignPawnWork(pawnId: string, workType: string): void {
    const assignment = this.workService.assignWork(pawnId, workType);
    const tools = this.itemService.getRequiredTools(workType);
    // Coordination logic only
  }
}
```

### Layer 4: UI Components (Clean Consumers)
**Role**: Use GameEngine interface only, no direct service access

```typescript
// WorkScreen.svelte - Clean GameEngine usage
<script lang="ts">
  import { gameEngine } from '$lib/stores/gameEngine';
  
  function assignWork(pawnId: string, workType: string) {
    gameEngine.assignPawnWork(pawnId, workType); // Clean interface
  }
</script>
```

## Benefits of This Architecture

### 1. Debugging Simplicity
**Following PawnScreen model for focused debugging:**
- Work assignment bug? → Check `WorkService.ts` only
- Item crafting issue? → Check `ItemService.ts` only
- System integration problem? → Check `GameEngineImpl.ts` only
- UI display issue? → Check specific component only

### 2. Feature Development
**Clean extension points for new features:**
- New combat system? → Create `CombatService.ts`, integrate via GameEngine
- New building types? → Add to `Buildings.ts`, extend `BuildingService.ts`
- New UI screen? → Create component, use existing GameEngine interface

### 3. Testing Strategy
**Services are testable in isolation:**
```typescript
// WorkService.test.ts
const workService = new WorkService(mockWorkData);
const result = workService.assignWork('pawn1', 'farming');
expect(result).toEqual(expectedAssignment);
```

### 4. Performance Benefits
**Optimized coordination:**
- Services can be lazy-loaded
- GameEngine coordinates batch operations
- No redundant calculations across systems
- Clean caching strategies possible

## Implementation Strategy

### Phase 1: Data/Logic Separation ✅ COMPLETE
- Extract business logic from data files
- Create focused service classes
- Ensure data files contain only exports

### Phase 2: GameEngine Coordination ✅ COMPLETE
- Implement GameEngineImpl as central coordinator
- Migrate components to use GameEngine interface
- Eliminate direct service imports in UI

### Phase 3: Optimization & Polish ⚠️ IN PROGRESS
- Complete remaining services (PawnService, EventService)
- Optimize coordination patterns
- Add comprehensive testing

## Success Metrics

### File Organization Success:
- **Data files**: 50%+ size reduction (logic extracted)
- **Service files**: Focused, single-purpose under 200 lines
- **GameEngine**: Clean coordination under 500 lines
- **Components**: Use GameEngine interface only

### Architecture Success:
- Zero circular dependencies
- Services testable in isolation
- GameEngine serves as clean coordination hub
- Ready for complex features (combat, diplomacy, etc.)

This architecture transforms the game from a tightly-coupled, circular dependency nightmare into a clean, maintainable system ready for complex feature development, following the proven success of the pawn-screen-refactoring.
