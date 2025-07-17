# GameEngine Refactoring Design (50% Scope)

## Philosophy: Focused GameEngine Cleanup

The architecture refactoring follows a **pragmatic 50% approach** - solve the most pressing problem (GameEngine too large) without over-engineering the entire system.

**Current Problem:**
- **GameEngine**: 900+ lines implementing pawn behavior directly
- **Impact**: Unmaintainable, blocks production chain development
- **Solution**: Extract pawn logic to PawnService (coordination, not implementation)

**Refactoring Goal:**
- **Before**: GameEngine implements automatic eating/sleeping (hundreds of lines)
- **After**: GameEngine coordinates PawnService.processAutomaticNeeds() (few lines)
- **Result**: 33% size reduction (900+ → ~600 lines), manageable complexity

## Core Design Principles

### 1. Extraction Over Reconstruction
**Focus on moving existing logic, not rebuilding architecture:**

```
BEFORE (GameEngine implements):
├── tryAutomaticEating(pawn: Pawn): Pawn
├── tryAutomaticSleeping(pawn: Pawn): Pawn  
├── findAvailableFood(): any[]
├── selectBestFood(): any
├── calculateFoodRecovery(): number
├── shouldPawnSleep(): boolean
└── processAutomaticPawnNeeds(): void

AFTER (GameEngine coordinates):
├── this.gameState = pawnService.processAutomaticNeeds(this.gameState)
└── this.gameState = workService.syncPawnWorkStates(this.gameState)
```

### 2. Minimal Interface Changes
**GameEngine coordination interface remains stable:**

- **UI Components**: No changes to how they call GameEngine
- **Turn Processing**: Same coordination pattern, different implementation
- **State Management**: Same updateStores() pattern
- **Save/Load**: No data structure changes

### 3. Pragmatic Service Boundaries
**PawnService handles what GameEngine shouldn't:**

```
PawnService Responsibilities:
├── Automatic eating logic (moved from GameEngine)
├── Automatic sleeping logic (moved from GameEngine)  
├── Food selection and consumption (moved from GameEngine)
├── Rest calculation and recovery (moved from GameEngine)
└── Pawn needs coordination (moved from GameEngine)

GameEngine Responsibilities (unchanged):
├── Service coordination (existing)
├── Turn processing flow (existing)
├── State management (existing)
└── UI interface (existing)
```

## Implementation Strategy

### Step 1: Extract Eating Logic
**Move food-related behavior from GameEngine to PawnService:**

```typescript
// BEFORE (in GameEngine):
tryAutomaticEating(pawn: Pawn): Pawn {
  // 50+ lines of eating logic implementation
}

// AFTER (in PawnService):
processAutomaticEating(gameState: GameState): GameState {
  // Same 50+ lines, better location
}

// AFTER (in GameEngine):
this.gameState = this.pawnService.processAutomaticEating(this.gameState);
```

### Step 2: Extract Sleeping Logic  
**Move rest-related behavior from GameEngine to PawnService:**

```typescript
// BEFORE (in GameEngine):
tryAutomaticSleeping(pawn: Pawn): Pawn {
  // 30+ lines of sleeping logic implementation
}

// AFTER (in PawnService):
processAutomaticSleeping(gameState: GameState): GameState {
  // Same 30+ lines, better location
}

// AFTER (in GameEngine):
this.gameState = this.pawnService.processAutomaticSleeping(this.gameState);
```

### Step 3: Extract Work Sync
**Move work coordination from GameEngine to WorkService:**

```typescript
// BEFORE (in GameEngine):
syncPawnWorkingStates(): void {
  // 20+ lines of work sync implementation
}

// AFTER (in WorkService):
syncPawnWorkStates(gameState: GameState): GameState {
  // Same 20+ lines, better location
}

// AFTER (in GameEngine):
this.gameState = this.workService.syncPawnWorkStates(this.gameState);
```

### Step 4: Coordinate Through Services
**GameEngine becomes clean coordinator:**

```typescript
// AFTER (in GameEngine turn processing):
processTurn(): void {
  // Service coordination only
  this.gameState = this.pawnService.processAutomaticNeeds(this.gameState);
  this.gameState = this.workService.syncPawnWorkStates(this.gameState);
  this.updateStores();
}
```

## Benefits of 50% Approach

### 1. Immediate Problem Resolution
**Solves the critical GameEngine size issue:**
- GameEngine becomes manageable (600 lines vs 900+)
- Pawn behavior logic properly separated
- Ready for production chain development
- No architectural analysis paralysis

### 2. Minimal Disruption
**Low-risk changes with high impact:**
- Same game behavior (automatic eating/sleeping unchanged)
- Same UI interface (components unaware of changes)
- Same save/load compatibility
- Same performance characteristics

### 3. Pragmatic Technical Debt
**Manageable debt, not zero debt:**
- Some circular dependencies remain (acceptable)
- Some services incomplete (not blocking)
- Some components import data directly (not urgent)
- Focus on what matters for next development phase

### 4. Clear Success Metrics
**Measurable improvement:**
- GameEngine: 900+ → ~600 lines (33% reduction)
- PawnService: Handles all automatic pawn behavior
- WorkService: Handles work sync coordination
- Ready for Week 2: Screen refactoring (WorkScreen breakdown)

## What This Design SKIPS

### Intentionally Not Addressed (Future Work):
- **Complete circular dependency elimination** (not urgent)
- **Full service layer completion** (EventService, etc. - later)
- **Zero architectural debt** (manageable debt is fine)
- **Perfect separation of concerns** (good enough separation)
- **Complete UI import cleanup** (not blocking production chains)

## Next Phase Preparation

### Ready for Production Chain Development:
- **PawnService**: Available for health/disease systems (survival-consequences)
- **WorkService**: Available for building work bonuses (production-chain)
- **GameEngine**: Manageable size for adding new coordination
- **Architecture**: Stable foundation for screen refactoring

This **pragmatic refactoring** achieves the critical goal (manageable GameEngine) without over-engineering, enabling focus on gameplay development in subsequent phases.
