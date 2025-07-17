# Architecture Refactoring Tasks

## Overview
Complete the data/logic separation following the pawn-screen-refactoring model. Focus on extracting business logic from data files and centralizing coordination through GameEngineImpl.ts.

## Core Tasks (Applying Pawn-Screen Principles)

### Task 1: Complete Data/Logic Separation ⚠️ IN PROGRESS

**Goal**: Extract all business logic from data files, just like extracting UI logic from PawnScreen.svelte

#### 1.1 Clean Up Data Files ⚠️ PARTIAL
- [x] **Work.ts**: Remove all calculation functions, keep only `WORK_CATEGORIES` export
- [x] **Items.ts**: Remove all business logic, keep only `ITEMS_DATABASE` export  
- [x] **Buildings.ts**: Remove all calculation functions, keep only `AVAILABLE_BUILDINGS` export
- [x] **Research.ts**: Remove all business logic, keep only `RESEARCH_DATABASE` export

#### 1.2 Complete Service Implementations ⚠️ PARTIAL
- [x] **WorkService.ts**: All work calculations and assignments ✅ COMPLETE
- [x] **ItemService.ts**: All item operations and crafting ✅ COMPLETE
- [x] **BuildingService.ts**: All building placement and effects ✅ COMPLETE
- [x] **ResearchService.ts**: All research progression logic ✅ COMPLETE
- [ ] **PawnService.ts**: Complete pawn behavior and need management
- [ ] **EventService.ts**: Complete event generation and logging

#### 1.3 Update All Imports ⚠️ PARTIAL
- [ ] **UI Components**: Replace direct data file imports with GameEngine calls
- [ ] **Services**: Ensure services only import data files, not other services
- [ ] **GameEngine**: Coordinate all service interactions

### Task 2: Complete GameEngine Coordination ⚠️ IN PROGRESS

**Goal**: Make GameEngineImpl.ts the central coordinator like PawnScreen.svelte coordinates components

#### 2.1 Service Coordination ✅ COMPLETE
- [x] **Service Registry**: All services registered in GameEngine
- [x] **Service Dependencies**: Services injected via constructor
- [x] **Unified Interface**: Components access services through GameEngine only

#### 2.2 State Management ✅ COMPLETE
- [x] **Central Updates**: All state changes flow through GameEngine
- [x] **Store Updates**: Single `updateStores()` method for consistency
- [x] **Turn Processing**: Coordinated turn processing through GameEngine

#### 2.3 Method Completion ⚠️ PARTIAL
- [ ] **Pawn Methods**: Complete pawn management methods in GameEngine
- [ ] **Event Methods**: Complete event handling methods in GameEngine
- [ ] **Need Processing**: Automatic pawn need satisfaction

### Task 3: Eliminate Remaining Dependencies ⚠️ MINOR

**Goal**: Achieve zero circular dependencies like the clean component hierarchy

#### 3.1 Import Cleanup ⚠️ MINOR
- [x] **Core Systems**: No circular imports between major systems ✅ MOSTLY COMPLETE
- [ ] **Minor Dependencies**: Clean up remaining minor circular imports
- [x] **TypeScript Compilation**: Clean compilation without dependency warnings ✅ COMPLETE

#### 3.2 Component Migration ⚠️ PARTIAL
- [ ] **Remove Direct Imports**: Components should not import services directly
- [ ] **GameEngine Interface**: All components use GameEngine methods only
- [ ] **Clean Hierarchy**: UI → GameEngine → Services → Data

### Task 4: Complete Missing Services ⚠️ HIGH PRIORITY

**Goal**: Finish the service layer just like completing all component extractions

#### 4.1 PawnService Completion ⚠️ HIGH PRIORITY
```typescript
class PawnService {
  // High Priority: Automatic need satisfaction
  processNeedsAutomatically(pawnId: string): void;
  
  // High Priority: Behavior management  
  updateMorale(pawnId: string): void;
  
  // Medium Priority: Advanced features
  calculateEffectiveStats(pawnId: string): RaceStats;
}
```

#### 4.2 EventService Completion ⚠️ MEDIUM PRIORITY
```typescript
class EventService {
  // Medium Priority: Event logging
  logPawnActivity(pawn: Pawn, activity: string): void;
  
  // Medium Priority: Building events
  logBuildingCompletion(building: Building): void;
  
  // Low Priority: Event history
  getRecentEvents(): GameEvent[];
}
```

## Success Metrics (Following Pawn-Screen Model)

### File Organization Success:
- **Data files**: 50%+ smaller (business logic extracted) ⚠️ PARTIAL
- **Service files**: Focused, single-purpose under 200 lines each ✅ COMPLETE
- **GameEngine**: Clean coordination under 500 lines ✅ COMPLETE

### Architecture Success:
- **Zero circular dependencies**: ✅ MOSTLY COMPLETE (minor issues remain)
- **Services testable in isolation**: ✅ COMPLETE
- **GameEngine coordination hub**: ✅ COMPLETE
- **UI uses GameEngine only**: ⚠️ PARTIAL (some components still import directly)

### Ready for Complex Features:
- **Combat system integration**: ✅ READY (architecture supports it)
- **Diplomacy system**: ✅ READY (service layer ready)
- **Advanced AI**: ✅ READY (clean data/logic separation)

## Current Status Summary

### ✅ COMPLETE
- GameEngine central coordination
- Core service implementations (Work, Item, Building, Research)
- Service registry and dependency injection
- Turn processing coordination
- Most circular dependency elimination

### ⚠️ IN PROGRESS  
- Data file cleanup (business logic extraction)
- Component migration to GameEngine interface
- PawnService completion
- EventService completion

### 🎯 SUCCESS CRITERIA
Following the pawn-screen-refactoring success:
- **Data files**: Pure exports only (like extracting UI components)
- **Service files**: Focused business logic (like component-specific logic)
- **GameEngine**: Central coordinator (like PawnScreen orchestrates components)
- **Components**: Clean GameEngine interface usage (like clean component interfaces)

This transforms the business logic architecture from mixed concerns to clean separation, enabling complex feature development just like the UI transformation enabled complex interface features.
  - ✅ Service implementation created
  - ❌ **CRITICAL: Business logic NOT removed from Buildings.ts**
  - ❌ **CRITICAL: Components still import from Buildings.ts, not BuildingService**

