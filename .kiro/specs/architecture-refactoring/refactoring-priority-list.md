# Architecture Refactoring Priority List

## Overview

This document outlines the critical refactoring priorities for Fantasia4x based on current architectural analysis and TypeScript compilation errors. The priorities are ordered by urgency and dependency relationships to ensure a safe, incremental migration to clean architecture.

## 🚨 CRITICAL ISSUES (Must Fix First)

### Priority 1: TypeScript Compilation Errors
**Status:** BLOCKING - Prevents development
**Impact:** HIGH - Code doesn't compile
**Effort:** LOW - Quick fixes

#### Issues:
1. **Service Registry Import Errors** (`src/lib/game/services/index.ts`)
   - Missing service instance exports causing shorthand property errors
   - Services not properly instantiated before registry creation

2. **Node.js `require()` Usage** (`BuildingService.ts`, `WorkService.ts`)
   - Using CommonJS `require()` in ES modules
   - Should use ES6 import statements

3. **GameEngine Implementation Errors** (`GameEngineImpl.ts`)
   - Missing constructor arguments for `SystemInteractionCoordinatorImpl`
   - Missing `clearCache()` method on `ModifierSystem`
   - Incorrect method signatures for service calls

4. **Type Definition Mismatches**
   - `EventLog` type not exported from Events module
   - Location type mismatch in WorldGenerator
   - Event trigger parameter type mismatch

#### Action Items:
- [ ] Fix service registry instantiation order
- [ ] Replace `require()` with proper ES6 imports
- [ ] Fix GameEngine constructor and method calls
- [ ] Export missing types and fix type mismatches

---

### Priority 2: Circular Dependency Elimination
**Status:** CRITICAL - Prevents clean architecture
**Impact:** HIGH - Blocks service layer implementation
**Effort:** MEDIUM - Requires careful refactoring

#### Current Circular Dependencies:
```
GameState.ts → Work.ts → Items.ts → (implicit) GameState.ts
Work.ts → Items.ts (getItemInfo)
Work.ts → Locations.ts → (potential) Work.ts
PawnEquipment.ts → Items.ts (getItemInfo)
```

#### Root Causes:
1. **Business Logic Mixed with Data**: Functions like `getItemInfo()` in data files
2. **Cross-System Function Calls**: Direct imports between core modules
3. **Shared State Dependencies**: Multiple systems importing GameState

#### Action Items:
- [ ] Extract all business logic functions from `Items.ts` to `ItemService`
- [ ] Remove direct imports between core data files
- [ ] Create service interfaces for cross-system communication
- [ ] Implement dependency injection through GameEngine

---

### Priority 3: Service Layer Completion
**Status:** MOSTLY COMPLETE - Core services implemented
**Impact:** HIGH - Foundation for clean architecture
**Effort:** LOW - Minor completions needed

#### Current Service Status (Updated December 2024):
- ✅ `ItemService` - Fully implemented (`ItemServiceImpl`)
- ✅ `BuildingService` - Fully implemented (`BuildingServiceImpl`)
- ✅ `WorkService` - Fully implemented (`WorkServiceImpl`)
- ✅ `ResearchService` - Fully implemented (`ResearchServiceImpl`)
- ⚠️ `PawnService` - Interface defined, placeholder implementation
- ❌ `LocationService` - Not needed (functionality in other services)
- ⚠️ `EventService` - Interface defined, placeholder implementation

#### Remaining Service Work:
1. **PawnService**: Complete implementation for pawn behavior, needs processing, stat calculations
2. **EventService**: Complete implementation for event generation, processing, and integration
3. **Service Integration**: Ensure all services are properly integrated with GameEngine

#### Action Items:
- [ ] Complete PawnService implementation (replace placeholder)
- [ ] Complete EventService implementation (replace placeholder)
- [ ] Validate service integration with GameEngine
- [ ] Add comprehensive error handling and validation

---

## 🔧 ARCHITECTURAL IMPROVEMENTS (Second Phase)

### Priority 4: GameEngine Central Coordinator
**Status:** ✅ IMPLEMENTED - Fully operational
**Impact:** HIGH - Enables complex feature development
**Effort:** COMPLETE - System integration achieved

#### Current Status (Updated December 2024):
1. **GameEngineImpl**: Fully implemented with central coordination
2. **Service Integration**: ServiceRegistry properly injected and operational
3. **Unified Calculations**: ModifierSystem provides automated calculations
4. **State Management**: Consistent patterns through GameEngine
5. **System Protocols**: SystemInteractionCoordinator handles communication

#### Completed Components:
- ✅ GameEngine compilation and implementation
- ✅ Service registry injection and lifecycle management
- ✅ Unified calculation methods (efficiency, effects, crafting time)
- ✅ Consistent state management patterns
- ✅ System interaction protocols and coordination

---

### Priority 5: Data Layer Reorganization
**Status:** NEEDED - Large monolithic files
**Impact:** MEDIUM - Developer experience
**Effort:** MEDIUM - File reorganization

#### Current Issues:
1. **Monolithic Files**: `Items.ts` (2000+ lines), `Buildings.ts` (1000+ lines)
2. **Mixed Concerns**: Data and logic in same files
3. **Poor Organization**: Items not grouped by progression/type
4. **Search Difficulty**: Hard to find specific items/buildings

#### Action Items:
- [ ] Reorganize Items.ts by progression level and type
- [ ] Reorganize Buildings.ts by category and tier
- [ ] Extract all business logic to services
- [ ] Maintain single-file databases for mod compatibility
- [ ] Add comprehensive documentation and indexing

---

### Priority 6: State Management Consistency
**Status:** INCONSISTENT - Multiple patterns
**Impact:** MEDIUM - UI synchronization issues
**Effort:** MEDIUM - Standardize patterns

#### Current Issues:
1. **Multiple State Patterns**: Direct mutation, store updates, GameState manager
2. **Synchronization Problems**: UI components not updating consistently
3. **Save/Load Issues**: State persistence problems
4. **Event System Bugs**: Message log not displaying properly

#### Action Items:
- [ ] Standardize state update patterns through GameEngine
- [ ] Fix Svelte store synchronization
- [ ] Repair save/load functionality
- [ ] Fix event system and message log display

---

## 🎯 FEATURE ENABLEMENT (Third Phase)

### Priority 7: Combat System Preparation
**Status:** BLOCKED - Requires clean architecture
**Impact:** HIGH - Major feature development
**Effort:** HIGH - Complex system implementation

#### Prerequisites:
- ✅ Service layer complete
- ✅ GameEngine operational
- ✅ Clean dependency flow
- ✅ Stable state management

#### Action Items:
- [ ] Design combat system interfaces
- [ ] Plan integration with existing systems
- [ ] Create combat state management
- [ ] Implement turn-based mechanics

---

### Priority 8: Performance Optimization
**Status:** FUTURE - After architecture stabilization
**Impact:** MEDIUM - User experience
**Effort:** MEDIUM - Optimization work

#### Areas for Optimization:
- [ ] Calculation caching in services
- [ ] Lazy loading of large data structures
- [ ] Component rendering optimization
- [ ] Memory management improvements

---

## 📋 IMPLEMENTATION STRATEGY

### Phase 1: Emergency Fixes (Week 1)
1. Fix all TypeScript compilation errors
2. Resolve immediate circular dependencies
3. Complete basic service implementations
4. Ensure game runs without errors

### Phase 2: Architecture Stabilization (Week 2-3)
1. Complete GameEngine implementation
2. Implement comprehensive service layer
3. Standardize state management patterns
4. Fix event system and UI synchronization

### Phase 3: System Integration (Week 4-5)
1. Validate all systems work together
2. Implement automated testing
3. Performance optimization
4. Documentation updates

### Phase 4: Feature Development (Week 6+)
1. Combat system implementation
2. Advanced features
3. Visual improvements
4. Modding support

---

## 🎯 SUCCESS METRICS

### Immediate Goals (Week 1) ✅ MOSTLY ACHIEVED
- ⚠️ Zero TypeScript compilation errors (some minor issues remain)
- ✅ No circular dependency warnings (mostly resolved)
- ✅ Game starts and runs for 10+ turns without errors
- ✅ All existing features functional

### Short-term Goals (Week 2-3) ✅ MOSTLY ACHIEVED
- ⚠️ Service layer complete and tested (core services done, PawnService/EventService need completion)
- ✅ GameEngine operational (GameEngineImpl fully implemented)
- ✅ Consistent state management (centralized through GameEngine)
- ⚠️ Event system working properly (needs EventService completion)

### Long-term Goals (Week 4+) ⚠️ IN PROGRESS
- ❌ Combat system implemented (waiting for complete architecture)
- ⚠️ Performance optimized (basic optimization done, advanced pending)
- ⚠️ Comprehensive testing (ModifierSystem tested, others need tests)
- ✅ Documentation complete (this update completes documentation)

---

## ⚠️ RISK MITIGATION

### Backup Strategy
- Create `.backup` files before any major changes
- Commit working state before each refactoring phase
- Maintain rollback scripts for emergency recovery

### Testing Strategy
- Test each service extraction independently
- Validate game functionality after each change
- Run extended gameplay sessions after major changes

### Communication Strategy
- Document all architectural decisions
- Maintain migration logs with before/after comparisons
- Update team on progress and blockers

---

## 📝 NOTES

### Critical Dependencies
- Priority 1 must be completed before any other work
- Priority 2 and 3 can be worked on in parallel after Priority 1
- Priority 4+ require completion of earlier priorities

### Development Guidelines
- No new features until architecture is stable
- Maintain backward compatibility during migration
- Use feature flags for gradual rollout
- Document all changes for team coordination

### Emergency Procedures
- If refactoring causes critical issues, immediately rollback
- Use backup files to restore working state
- Document what caused the issue before continuing
- Consider alternative approaches if current path is blocked