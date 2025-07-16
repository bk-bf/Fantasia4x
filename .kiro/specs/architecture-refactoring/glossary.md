# Architecture Refactoring Glossary

## Overview

This glossary provides definitions and navigation guidance for developers working with the Fantasia4x architecture refactoring documentation. It explains key concepts, relationships between documents, and how to navigate the documentation effectively.

## Core Architecture Concepts

### GameEngine

**Definition:** Central coordinator that manages all system interactions, calculations, and state management.
**Implementation:** `src/lib/game/systems/GameEngineImpl.ts`
**Status:** ✅ Fully Implemented
**Key Responsibilities:**

- Unified calculations (pawn efficiency, building effects, crafting time)
- System coordination and interaction management
- State management with validation
- Service integration and lifecycle management

### Service Layer

**Definition:** Business logic layer that separates data queries and operations from data definitions.
**Location:** `src/lib/game/services/`
**Status:** ✅ Core Services Implemented
**Components:**

- **ItemService** ✅ - Item queries, crafting validation, inventory management
- **BuildingService** ✅ - Building queries, construction validation, effect calculations
- **WorkService** ✅ - Work assignment logic, efficiency calculations
- **ResearchService** ✅ - Research progression, prerequisite validation
- **PawnService** ⚠️ - Placeholder implementation (needs completion)
- **EventService** ⚠️ - Placeholder implementation (needs completion)

### ModifierSystem

**Definition:** Automated system for calculating bonuses and effects from multiple sources.
**Implementation:** `src/lib/game/systems/ModifierSystem.ts`
**Status:** ✅ Fully Implemented
**Purpose:** Eliminates manual mapping between items, buildings, and work types by automatically discovering and aggregating modifiers.

### ServiceRegistry

**Definition:** Central registry that manages service dependencies and provides unified access.
**Implementation:** `src/lib/game/systems/ServiceRegistryImpl.ts`
**Status:** ✅ Fully Implemented
**Features:** Dependency injection, lifecycle management, health monitoring

### SystemInteractionCoordinator

**Definition:** Handles standardized communication patterns between systems.
**Implementation:** `src/lib/game/systems/SystemInteractionCoordinatorImpl.ts`
**Status:** ✅ Implemented
**Purpose:** Manages data requests, event propagation, and state coordination between systems.

## Data Layer Organization

### Core Data Files

**Location:** `src/lib/game/core/`
**Status:** ✅ Organized but contains some business logic
**Files:**

- `Items.ts` - All item definitions (2000+ lines, organized by progression)
- `Buildings.ts` - All building definitions (1000+ lines, organized by category)
- `Work.ts` - Work category definitions
- `Research.ts` - Research project definitions
- `types.ts` - TypeScript interface definitions
- `GameState.ts` - Central game state management

### Circular Dependencies Status

**Status:** ⚠️ Partially Resolved
**Remaining Issues:**

- `Work.ts` → `Items.ts` (getItemInfo function call)
- `PawnEquipment.ts` → `Items.ts` (equipment lookups)
- Business logic still mixed with data in some core files

## Documentation Structure

### Core Documents (Current and Maintained)

These documents reflect the current implemented state and are actively maintained:

#### System Flow Diagram (`system-flow-diagram.md`)

**Purpose:** Complete visual representation of current architecture
**Status:** ✅ Current and Accurate
**Contains:** Data flow analysis, circular dependency mapping, service integration status

#### Integration Interface Specifications (`integration-interface-specifications.md`)

**Purpose:** Comprehensive interface definitions for all systems
**Status:** ✅ Current and Accurate
**Contains:** GameEngine interface, service interfaces, data transfer objects

#### Refactoring Priority List (`refactoring-priority-list.md`)

**Purpose:** Prioritized list of remaining refactoring tasks
**Status:** ✅ Current and Accurate
**Contains:** Critical issues, implementation priorities, success metrics

#### Architecture Decision Document (`architecture-decision-document.md`)

**Purpose:** Record of all major architectural decisions with rationale
**Status:** ✅ Current and Accurate
**Contains:** 10 major architectural decisions with context and consequences

#### Design Document (`design.md`)

**Purpose:** High-level architecture design and patterns
**Status:** ✅ Updated to Current Status
**Contains:** Target architecture, component interfaces, implementation status

#### Requirements Document (`requirements.md`)

**Purpose:** Functional and non-functional requirements for refactoring
**Status:** ✅ Updated with Implementation Status
**Contains:** 10 major requirements with current fulfillment status

### Implementation Reference Documents

These documents provide detailed implementation information:

#### Service Layer Interfaces (`service-layer-interfaces.md`)

**Purpose:** Detailed service interface definitions
**Status:** ✅ Updated to Match Current Implementations
**Contains:** Actual implemented interfaces with status indicators

#### GameEngine Implementation Review (`gameengine-implementation-plan.md`)

**Purpose:** Historical record of GameEngine implementation approach
**Status:** ✅ Converted to Implementation Review
**Contains:** Completed implementation phases, lessons learned, success metrics

### Removed Documents (Redundant/Obsolete)

These documents were removed during the cleanup to reduce maintenance burden:

- `data-flow-analysis.md` ❌ (covered by system-flow-diagram.md)
- `unified-calculation-system.md` ❌ (implemented, covered in integration specs)
- `automated-modifier-system.md` ❌ (implemented, covered in integration specs)
- `migration-guide.md` ❌ (migration complete, remaining work in priority list)
- `system-interaction-protocols.md` ❌ (implemented, covered in integration specs)
- `system-interaction-examples.md` ❌ (examples outdated with GameEngine)
- `system-hierarchy-diagram.md` ❌ (covered by system-flow-diagram.md)
- `service-integration.md` ❌ (covered in integration-interface-specifications.md)
- `state-management-analysis.md` ❌ (covered in system-flow-diagram.md and design.md)

## Navigation Guide

### For New Developers

1. **Start Here:** `glossary.md` (this document)
2. **Understand Current State:** `system-flow-diagram.md`
3. **Learn Architecture:** `architecture-decision-document.md`
4. **See Interfaces:** `integration-interface-specifications.md`
5. **Check Remaining Work:** `refactoring-priority-list.md`

### For Implementation Work

1. **Check Current Status:** `refactoring-priority-list.md`
2. **Understand Interfaces:** `integration-interface-specifications.md`
3. **Review Decisions:** `architecture-decision-document.md`
4. **Check Requirements Status:** `requirements.md`

### For Architecture Understanding

1. **High-Level Design:** `design.md`
2. **System Flow:** `system-flow-diagram.md`
3. **Decision Context:** `architecture-decision-document.md`
4. **Interface Contracts:** `integration-interface-specifications.md`
5. **Implementation History:** `gameengine-implementation-plan.md` (now implementation review)

## Current Implementation Status (Updated December 2024)

### ✅ Completed Systems

- **GameEngine** - Central coordinator fully implemented and operational
- **ServiceRegistry** - Service management and dependency injection complete
- **ModifierSystem** - Automated bonus calculation system fully operational
- **Core Services** - ItemService, BuildingService, WorkService, ResearchService all fully implemented
- **SystemInteractionCoordinator** - Inter-system communication fully implemented
- **Architecture Foundation** - Clean dependency flow, unified calculations, state management
- **Documentation** - Comprehensive documentation updated and current

### ⚠️ Remaining Work

- **PawnService** - Interface exists, implementation is placeholder (needs completion)
- **EventService** - Interface exists, implementation is placeholder (needs completion)
- **Minor Circular Dependencies** - Most resolved, some minor ones remain in core files
- **UI Component Migration** - Some components still use direct service access instead of GameEngine

### ✅ Ready for Development

- **Combat System Integration** - Architecture ready, can be implemented cleanly
- **Advanced Features** - Foundation supports complex feature development
- **Performance Optimization** - Basic optimization complete, advanced optimization ready
- **Testing Framework** - Comprehensive testing patterns established

## Key Relationships

### Document Dependencies

```
requirements.md → design.md → integration-interface-specifications.md
                           ↓
architecture-decision-document.md → system-flow-diagram.md
                           ↓
                    refactoring-priority-list.md
```

### System Dependencies

```
UI Components → GameEngine → ServiceRegistry → Individual Services → Data Layer
```

### Implementation Order

1. **Foundation** - GameEngine, ServiceRegistry, ModifierSystem ✅
2. **Core Services** - Item, Building, Work, Research services ✅
3. **Missing Services** - Pawn, Event services ⚠️
4. **Integration** - Complete system integration ⚠️
5. **Features** - Combat system, advanced features ❌

## Common Patterns

### Service Implementation Pattern

```typescript
// Interface definition
export interface XService {
  // Query methods
  getXById(id: string): X | undefined;

  // Validation methods
  canDoX(params): boolean;

  // Calculation methods
  calculateX(params): number;
}

// Implementation
export class XServiceImpl implements XService {
  // Implementation details
}

// Singleton export
export const xService = new XServiceImpl();
```

### GameEngine Integration Pattern

```typescript
// Access services through GameEngine
const gameEngine = new GameEngineImpl();
gameEngine.integrateServices(serviceRegistry);

// Use unified calculations
const efficiency = gameEngine.calculatePawnEfficiency(pawnId, workType);
```

### Error Handling Pattern

```typescript
interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: ServiceError;
}
```

## Troubleshooting

### Common Issues

1. **Circular Dependencies** - Check import chains in core files
2. **Service Not Found** - Ensure service is registered in ServiceRegistry
3. **GameEngine Not Initialized** - Call `initialize()` with state and services
4. **Type Errors** - Check interface definitions in `integration-interface-specifications.md`

### Debug Resources

- **System Status:** Use `gameEngine.getEngineStatus()`
- **Service Health:** Use `serviceRegistry.getAllServiceStatuses()`
- **Dependency Graph:** Check `ServiceContainer.getDependencyGraph()`

## Future Evolution

### Planned Additions

- **Combat System** - Turn-based tactical combat
- **Advanced AI** - Enhanced pawn behavior
- **Modding Support** - Plugin architecture
- **Performance Optimization** - Advanced caching and optimization

### Architecture Evolution

- **Event-Driven Architecture** - Enhanced event system
- **Microservices** - Service decomposition for large features
- **State Management** - Advanced state synchronization
- **Testing Framework** - Comprehensive test coverage

## Document Cleanup Summary (December 2024)

### Changes Made

- **Removed 9 redundant documents** to reduce maintenance burden
- **Updated service-layer-interfaces.md** to reflect actual implemented interfaces
- **Converted gameengine-implementation-plan.md** to implementation review
- **Updated design.md and requirements.md** with current implementation status
- **Maintained 8 core documents** that provide comprehensive coverage

### Current Document Set

The documentation now consists of 8 focused, current documents:

1. `glossary.md` - This navigation guide
2. `system-flow-diagram.md` - Current architecture visualization
3. `integration-interface-specifications.md` - Interface definitions
4. `refactoring-priority-list.md` - Remaining work priorities
5. `architecture-decision-document.md` - Decision history
6. `design.md` - Architecture design with status
7. `requirements.md` - Requirements with fulfillment status
8. `tasks.md` - Current task tracking

### Benefits of Cleanup

- **Reduced Maintenance** - Fewer documents to keep current
- **Eliminated Redundancy** - No duplicate information across documents
- **Current Information** - All remaining documents reflect actual implementation
- **Clear Navigation** - Easy to find relevant information
- **Historical Record** - Important decisions and approaches preserved

---

_This glossary reflects the post-cleanup documentation structure and should be updated as the remaining implementation work (PawnService, EventService) is completed._
