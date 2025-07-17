# GameEngine Refactoring Requirements (50% Scope)

## Overview
Extract the most pressing pawn logic from GameEngine to achieve manageable architectural debt. This is a **partial refactoring** focused only on the critical GameEngine size problem, not a complete architecture overhaul.

## Core Principle: Reduce GameEngine Complexity

**Focus: GameEngine is 900+ lines and unmanageable**
- **Problem**: GameEngine implements pawn behavior instead of coordinating services
- **Solution**: Move automatic eating/sleeping logic to PawnService 
- **Goal**: Reduce GameEngine from 900+ lines to ~600 lines (manageable)
- **Scope**: 50% completion - only most critical architectural debt

## 1. Critical GameEngine Requirements

### 1.1 Extract Pawn Logic from GameEngine
- **Priority**: Critical
- **Requirement**: Move automatic pawn behavior out of GameEngine
- **Details**: 
  - Extract tryAutomaticEating() and tryAutomaticSleeping() to PawnService
  - Extract food/rest calculation logic to PawnService
  - Extract work sync coordination to WorkService
- **Success Criteria**: GameEngine reduces from 900+ to ~600 lines

### 1.2 PawnService Implementation for Extracted Logic
- **Priority**: High  
- **Requirement**: PawnService must handle all extracted pawn behavior
- **Details**:
  - Implement automatic eating logic in PawnService
  - Implement automatic sleeping logic in PawnService
  - Handle pawn needs coordination through PawnService
- **Success Criteria**: PawnService manages all automatic pawn behavior

### 1.3 Maintain GameEngine Coordination Role
- **Priority**: High
- **Requirement**: GameEngine coordinates services without implementing logic
- **Details**:
  - GameEngine calls pawnService.processAutomaticNeeds()
  - GameEngine calls workService.syncPawnWorkStates()
  - GameEngine maintains turn processing coordination
- **Success Criteria**: GameEngine coordinates, doesn't implement pawn behavior

## 2. Performance Requirements

### 2.1 GameEngine Size Reduction
- **Priority**: Critical
- **Requirement**: GameEngine must be reduced to manageable size
- **Details**: Target reduction from 900+ lines to ~600 lines (33% reduction)
- **Success Criteria**: GameEngine is under 600 lines and maintainable

### 2.2 Turn Processing Performance
- **Priority**: High
- **Requirement**: Turn processing must remain efficient after extraction
- **Details**: PawnService and WorkService coordination through GameEngine
- **Success Criteria**: Turn processing time <= current performance

### 2.3 Memory Efficiency
- **Priority**: Medium
- **Requirement**: Extraction must not significantly increase memory usage
- **Details**: Efficient service coordination, no redundant state
- **Success Criteria**: Memory usage remains within 5% of current levels

## 3. Compatibility Requirements

### 3.1 Save/Load Compatibility
- **Priority**: High
- **Requirement**: Existing save files must continue to work
- **Details**: Pawn behavior changes must be backward compatible
- **Success Criteria**: All existing save files load correctly

### 3.2 Feature Compatibility  
- **Priority**: Critical
- **Requirement**: All hunger/rest features must work identically
- **Details**: Automatic eating/sleeping behavior must be unchanged
- **Success Criteria**: 100% feature parity for hunger/rest systems

### 3.3 API Stability
- **Priority**: Medium
- **Requirement**: UI components should require minimal changes
- **Details**: GameEngine interface for pawn behavior remains stable
- **Success Criteria**: < 5% of component code requires modification

## 4. Code Quality Requirements

### 4.1 Documentation Standards
- **Priority**: Low
- **Requirement**: PawnService methods should have basic documentation
- **Details**: JSDoc comments for public methods
- **Success Criteria**: Public PawnService methods documented

### 4.2 Type Safety
- **Priority**: Medium
- **Requirement**: Maintain TypeScript strict mode compliance
- **Details**: No `any` types in extracted code
- **Success Criteria**: Clean TypeScript compilation

### 4.3 Testing Coverage
- **Priority**: Low
- **Requirement**: Basic testing for extracted pawn logic
- **Details**: Unit tests for critical PawnService methods
- **Success Criteria**: Core automatic behavior tested

## Success Metrics (50% Scope)

### File Organization Success:
- **GameEngine**: Reduced from 900+ to ~600 lines (manageable size)
- **PawnService**: Handles all automatic pawn behavior
- **WorkService**: Handles work sync coordination

### Maintainability Success:
- Pawn behavior bug? → Check `PawnService.ts` 
- Work sync issue? → Check `WorkService.ts`
- Turn processing problem? → Check `GameEngineImpl.ts` coordination

### Architecture Success:
- GameEngine coordinates services without implementing pawn logic
- Automatic eating/sleeping extracted to appropriate service
- Ready for production chain development (next phase)

## What This Refactoring SKIPS (Future Work)

### Intentionally Not Included (Not Urgent):
- Complete circular dependency elimination
- Full service layer completion (EventService, etc.)
- Complete UI component import cleanup
- Zero architectural debt (just manageable debt)

This **partial refactoring** achieves manageable architectural health without over-engineering, enabling focus on production chain development in the next phase.
