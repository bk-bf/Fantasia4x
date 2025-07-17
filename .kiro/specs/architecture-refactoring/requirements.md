# Architecture Refactoring Requirements

## Overview
Transform the game's business logic architecture from mixed concerns to clean separation of data and logic, following the successful principles demonstrated in the pawn-screen-refactoring. The GameEngineImpl.ts serves as the central coordinator, similar to how PawnScreen.svelte coordinates UI components.

## Core Principle: Data/Logic Separation

**Just as PawnScreen extracts UI components, we extract business logic from data files:**
- **Data Files** (Work.ts): Pure data exports only → **Service Files** (WorkService.ts): Business logic only
- **Central Coordination**: GameEngineImpl.ts orchestrates services (like PawnScreen coordinates components)

## 1. Business Logic Requirements

### 1.1 Clean Data/Logic Separation
- **Priority**: High
- **Requirement**: Data files must contain only pure data exports
- **Details**: 
  - `Work.ts` exports only `WORK_CATEGORIES` array
  - `Items.ts` exports only `ITEMS_DATABASE` array  
  - `Buildings.ts` exports only `AVAILABLE_BUILDINGS` array
  - `Research.ts` exports only `RESEARCH_DATABASE` array
- **Success Criteria**: No business logic functions in data files

### 1.2 Service Layer Implementation
- **Priority**: High  
- **Requirement**: All business logic must be encapsulated in service classes
- **Details**:
  - `WorkService.ts` handles work calculations and assignments
  - `ItemService.ts` handles item operations and crafting
  - `BuildingService.ts` handles building placement and effects
  - `ResearchService.ts` handles research progress and unlocks
- **Success Criteria**: Each service has single responsibility and focused interface

### 1.3 Central Coordination Through GameEngine
- **Priority**: High
- **Requirement**: GameEngineImpl.ts must be the single point of coordination
- **Details**:
  - All UI components access game logic through GameEngine methods
  - Services are coordinated through GameEngine, not accessed directly
  - Game state updates flow through GameEngine only
- **Success Criteria**: No direct service imports in UI components

## 2. Data Flow Requirements

### 2.1 Unidirectional Data Flow  
- **Priority**: High
- **Requirement**: Establish clear data flow hierarchy
- **Flow**: `UI Components → GameEngine → Services → Data Files`
- **Success Criteria**: No circular dependencies between layers

### 2.2 Centralized State Management
- **Priority**: Medium
- **Requirement**: All game state updates must flow through GameEngine
- **Details**: Single `updateStores()` method in GameEngine for all state changes
- **Success Criteria**: No scattered `gameState.set()` calls throughout codebase

### 2.3 Service Independence
- **Priority**: Medium  
- **Requirement**: Services must be testable in isolation
- **Details**: Services depend only on injected data, not on each other directly
- **Success Criteria**: Each service can be unit tested without GameEngine

## 3. Performance Requirements

### 3.1 Initialization Performance
- **Priority**: Medium
- **Requirement**: Services must initialize efficiently
- **Details**: Lazy loading where appropriate, minimal startup overhead
- **Success Criteria**: Game startup time <= current performance

### 3.2 Turn Processing Performance
- **Priority**: High
- **Requirement**: Turn processing must be efficient and scalable
- **Details**: Batch operations through GameEngine, minimal redundant calculations
- **Success Criteria**: Turn processing time <= current performance

### 3.3 Memory Efficiency
- **Priority**: Low
- **Requirement**: Service layer must not significantly increase memory usage
- **Details**: Efficient caching strategies, no memory leaks
- **Success Criteria**: Memory usage remains within 10% of current levels

## 4. Compatibility Requirements

### 4.1 Save/Load Compatibility
- **Priority**: High
- **Requirement**: Existing save files must continue to work
- **Details**: Data structure changes must be backward compatible
- **Success Criteria**: All existing save files load correctly

### 4.2 Feature Compatibility  
- **Priority**: High
- **Requirement**: All existing game features must work identically
- **Details**: Refactoring must not change any game behavior
- **Success Criteria**: 100% feature parity with pre-refactoring version

### 4.3 API Stability
- **Priority**: Medium
- **Requirement**: Public GameEngine interface must remain stable
- **Details**: Components using GameEngine should require minimal changes
- **Success Criteria**: < 10% of component code requires modification

## 5. Code Quality Requirements

### 5.1 Documentation Standards
- **Priority**: Medium
- **Requirement**: All services must have comprehensive JSDoc comments
- **Details**: Interface documentation, parameter descriptions, usage examples
- **Success Criteria**: 100% public method documentation coverage

### 5.2 Type Safety
- **Priority**: High
- **Requirement**: Full TypeScript coverage with strict typing
- **Details**: No `any` types except for necessary edge cases
- **Success Criteria**: TypeScript compilation with strict mode enabled

### 5.3 Testing Coverage
- **Priority**: Medium
- **Requirement**: Core business logic must have test coverage
- **Details**: Unit tests for services, integration tests for GameEngine
- **Success Criteria**: >= 80% test coverage for service layer

## Success Metrics (Following Pawn-Screen Model)

### File Organization Success:
- **Data files**: 50%+ smaller (business logic extracted)
- **Service files**: Focused, single-purpose modules under 200 lines each
- **GameEngine**: Clean coordination layer under 500 lines

### Maintainability Success:
- Bug in work system? → Check `WorkService.ts` only
- Need new building logic? → Extend `BuildingService.ts` only  
- System integration issue? → Check `GameEngineImpl.ts` only

### Architecture Success:
- Zero circular dependencies between layers
- Services testable in isolation
- GameEngine serves as clean coordination hub

This refactoring transforms the game architecture from mixed concerns into a clean, maintainable system ready for complex features like combat systems, just as the pawn-screen-refactoring transformed the UI from monolithic to modular.
