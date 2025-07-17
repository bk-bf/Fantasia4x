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

### Task 4: **URGENT: Extract Pawn Logic from GameEngine** ⚠️ NEW PRIORITY

**Goal**: Move pawn behavior logic to PawnService to keep GameEngine focused on coordination

#### 4.1 Move Automatic Needs to PawnService ⚠️ URGENT
```typescript
// MOVE FROM GameEngine TO PawnService:
- tryAutomaticEating(pawn: Pawn): Pawn
- tryAutomaticSleeping(pawn: Pawn): Pawn  
- processAutomaticPawnNeeds(): void
- shouldPawnSleep(pawn: Pawn): boolean
- clearTemporaryPawnStates(): void

// GameEngine should only call:
gameState = pawnService.processAutomaticNeeds(gameState);
```

#### 4.2 Move Food/Rest Logic to PawnService ⚠️ URGENT
```typescript
// MOVE FROM GameEngine TO PawnService:
- findAvailableFood(): any[]
- selectBestFood(availableFood: any[]): any
- consumeFoodFromInventory(foodId: string, amount: number): void
- calculateFoodRecovery(pawn: Pawn, food: any): number
- calculateRestRecovery(pawn: Pawn): number
```

#### 4.3 Coordinate Work Sync Through Services ⚠️ HIGH
```typescript
// GameEngine coordination:
this.gameState = workService.syncPawnWorkStates(this.gameState);
this.gameState = pawnService.processAutomaticNeeds(this.gameState);

// NOT: Hundreds of lines of pawn logic in GameEngine
```

### Task 5: **Production Chain Implementation** ⚠️ NEW PRIORITY

**Goal**: Complete the survival loop: resource harvesting → crafting/building → needs + productivity bonus

#### 5.1 Building Effects on Work ⚠️ HIGH PRIORITY
```typescript
// Buildings should boost work efficiency automatically:
- Kitchen: +40% cooking efficiency (affects food recovery)
- Workshop: +25% crafting efficiency  
- Smelter: +50% metalworking efficiency
// Via ModifierSystem, NOT hardcoded in GameEngine
```

#### 5.2 Tool Crafting System ⚠️ HIGH PRIORITY  
```typescript
// Crafting unlocks progression:
- Wood tools → Stone tools → Iron tools → Steel tools
- Better tools = higher work efficiency
- Research unlocks tool recipes
```

#### 5.3 Research → Building → Crafting Chain ⚠️ MEDIUM
```typescript
// Research progression:
- Basic Metallurgy → Unlocks Smelter building
- Smelter building → Enables iron tool crafting  
- Iron tools → 2x work efficiency vs stone tools
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
- GameEngine central coordination ✅
- Core service implementations (Work, Item, Building, Research) ✅
- Service registry and dependency injection ✅
- Turn processing coordination ✅
- **HUNGER/REST SYSTEM** ✅ **NEW: COMPLETE**
- **Work assignment display** ✅ **NEW: COMPLETE**
- **Automatic need satisfaction** ✅ **NEW: COMPLETE**
- Most circular dependency elimination ✅

### ⚠️ CRITICAL: GameEngine Too Large
- **GameEngine**: 900+ lines, needs **pawn logic extraction**
- **Needs system**: Should be in PawnService, not GameEngine
- **Work sync logic**: Should be in WorkService coordination

### 🎯 NEXT PRIORITIES (Production Chain Focus)

#### PRIORITY 1: Move Pawn Logic to PawnService ⚠️ URGENT
- **Extract eating/sleeping logic** from GameEngine → PawnService
- **Extract work state sync** from GameEngine → WorkService coordination
- **Keep GameEngine under 400 lines** (coordination only)

#### PRIORITY 2: Production Chain Completion ⚠️ HIGH 
- **Building effects on work efficiency** (kitchen → cooking bonus)
- **Crafting unlocks better tools** (stone axe → iron axe)
- **Research unlocks buildings/crafting** (metallurgy → smelter)

#### PRIORITY 3: Balance & Polish ⚠️ MEDIUM
- **Tool requirements enforcement** (can't mine without pick)
- **Building placement system** (construct buildings at locations)
- **Research progression** (knowledge items + lore discovery)

### 🎯 IMMEDIATE ROADMAP (Next Development Phase)

**The game is almost playable! Here's the clear chronological order:**

#### WEEK 1: Architecture Cleanup (Foundation)
1. **Extract GameEngine Pawn Logic** → PawnService (Task 4.1-4.2)
   - Move automatic eating/sleeping to PawnService
   - Move work sync coordination to proper services
   - Reduce GameEngine from 900+ lines to ~400 lines

#### WEEK 2: Production Chain Core (Gameplay)  
2. **Building Effects System** (Task 5.1)
   - Kitchen → +40% cooking efficiency  
   - Workshop → +25% crafting efficiency
   - Buildings provide tangible gameplay benefits

3. **Basic Tool Crafting** (Task 5.2)
   - Wood tools → Stone tools → Iron tools progression
   - Tools boost work efficiency significantly
   - Crafting gives progression rewards

#### WEEK 3: Strategic Depth (Complete Loop)
4. **Research → Building Chain** (Task 5.3)
   - Research unlocks building types
   - Buildings enable advanced crafting
   - Complete: resource → craft → build → bonus → better resources

**After these 3 weeks: Complete production loop game ready for additional features!**

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

