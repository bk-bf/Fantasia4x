# Complete System Flow Diagram

## Overview

This document provides a comprehensive system flow diagram for the Fantasia4x architecture, documenting current data flow patterns, circular dependencies, and system interactions. This analysis is critical for the architecture refactoring effort.

## Current System Architecture Flow

### High-Level System Flow

```mermaid
graph TB
    %% UI Layer
    UI[UI Components<br/>Svelte Components] --> GS[Game State Store<br/>gameState.ts]

    %% Game State Management
    GS --> GSM[GameStateManager<br/>GameState.ts]
    GSM --> GS

    %% Core Systems (Current - Problematic)
    GSM --> ITEMS[Items.ts<br/>2000+ lines<br/>Data + Logic Mixed]
    GSM --> BUILDINGS[Buildings.ts<br/>1000+ lines<br/>Data + Logic Mixed]
    GSM --> WORK[Work.ts<br/>Work Logic + Data]
    GSM --> PAWNS[Pawns.ts<br/>Pawn Management]

    %% Circular Dependencies (PROBLEM)
    ITEMS -.->|Circular| WORK
    WORK -.->|Circular| PAWNS
    PAWNS -.->|Circular| ITEMS
    BUILDINGS -.->|Circular| WORK

    %% Service Layer (Partially Implemented)
    ITEMS --> IS[ItemService<br/>Business Logic]
    BUILDINGS --> BS[BuildingService<br/>Business Logic]
    WORK --> WS[WorkService<br/>Business Logic]

    %% Systems Layer (New Architecture)
    IS --> MS[ModifierSystem<br/>Automated Calculations]
    BS --> MS
    WS --> MS

    %% GameEngine (Implemented)
    MS --> GE[GameEngine ✅<br/>GameEngineImpl]
    GE --> SR[ServiceRegistry ✅<br/>Implemented]
    GE --> SIC[SystemInteractionCoordinator ✅<br/>Implemented]

    %% External Systems
    GSM --> LOC[Locations.ts<br/>World Management]
    GSM --> EVENTS[Events.ts<br/>Event System]

    %% Style problematic connections
    classDef problem fill:#ffcccc,stroke:#ff0000,stroke-width:2px
    classDef circular fill:#ffffcc,stroke:#ffaa00,stroke-width:2px,stroke-dasharray: 5 5
    classDef service fill:#ccffcc,stroke:#00aa00,stroke-width:2px
    classDef interface fill:#ccccff,stroke:#0000aa,stroke-width:2px

    class ITEMS,BUILDINGS,WORK problem
    class IS,BS,WS,MS service
    class GE interface
```

### Detailed Data Flow Analysis

#### 1. Turn Processing Flow

```mermaid
sequenceDiagram
    participant UI as UI Components
    participant GS as Game State Store
    participant GSM as GameStateManager
    participant WORK as Work.ts
    participant ITEMS as Items.ts
    participant PAWNS as Pawns.ts
    participant LOC as Locations.ts

    UI->>GS: advanceTurn()
    GS->>GSM: processGameTurn()

    Note over GSM: Turn Processing Sequence
    GSM->>GSM: processResearch()
    GSM->>GSM: processBuildingQueue()
    GSM->>GSM: processCraftingQueue()

    GSM->>WORK: processWorkHarvesting()
    WORK->>LOC: getDiscoveredLocations()
    WORK->>LOC: getAvailableResourcesFromLocation()
    WORK->>LOC: extractResource()
    WORK->>ITEMS: getItemInfo() [CIRCULAR]
    WORK->>PAWNS: calculateHarvestAmount() [CIRCULAR]

    GSM->>PAWNS: processPawnTurn()
    PAWNS->>ITEMS: equipment calculations [CIRCULAR]
    PAWNS->>WORK: work efficiency [CIRCULAR]

    GSM->>GSM: generateItems()
    GSM->>GS: return updated state
    GS->>UI: reactive updates
```

#### 2. Work Assignment Flow

```mermaid
graph TD
    %% Work Assignment Process
    WA[Work Assignment Request] --> WS[WorkService]
    WS --> WC[Get Work Categories<br/>WORK_CATEGORIES]
    WS --> PA[Get Pawn Abilities<br/>calculatePawnAbilities]

    %% Circular Dependencies in Work Calculation
    PA --> STATS[Pawn Stats]
    PA --> TRAITS[Racial Traits]
    PA --> EQUIP[Equipment Bonuses]

    EQUIP --> ITEMS[Items Database<br/>CIRCULAR DEPENDENCY]
    ITEMS --> WORK_TYPES[Work Types<br/>CIRCULAR DEPENDENCY]
    WORK_TYPES --> WC

    %% Efficiency Calculation
    WS --> CALC[Calculate Work Efficiency]
    CALC --> MS[ModifierSystem<br/>Automated Calculation]
    MS --> RESULT[Efficiency Result]

    %% Assignment Result
    RESULT --> ASSIGN[Work Assignment]
    ASSIGN --> GS[Game State Update]

    %% Problem Areas
    classDef circular fill:#ffcccc,stroke:#ff0000,stroke-width:2px,stroke-dasharray: 5 5
    class ITEMS,WORK_TYPES circular
```

#### 3. Crafting System Flow

```mermaid
graph LR
    %% Crafting Request
    CR[Crafting Request] --> IS[ItemService]
    IS --> VALIDATE[Validate Crafting]

    %% Validation Dependencies
    VALIDATE --> MAT[Check Materials<br/>GameState.item]
    VALIDATE --> TOOLS[Check Tools<br/>currentToolLevel]
    VALIDATE --> BUILD[Check Buildings<br/>buildingCounts]
    VALIDATE --> RES[Check Research<br/>completedResearch]

    %% Crafting Process
    VALIDATE --> QUEUE[Add to Crafting Queue]
    QUEUE --> PROCESS[Process Each Turn]
    PROCESS --> COMPLETE[Crafting Complete]
    COMPLETE --> ADD[Add to Items Array]

    %% Dependencies
    MAT --> ITEMS[Items Database]
    TOOLS --> ITEMS
    BUILD --> BUILDINGS[Buildings Database]

    %% Circular Issue
    ITEMS -.->|workTypes| WORK[Work Categories]
    WORK -.->|toolsRequired| ITEMS

    classDef circular fill:#ffcccc,stroke:#ff0000,stroke-width:2px,stroke-dasharray: 5 5
    class ITEMS,WORK circular
```

### Current Circular Dependencies

#### Critical Circular Dependency Chains

```mermaid
graph TD
    %% Primary Circular Chain
    PAWNS[Pawns.ts<br/>Pawn Management] -->|needs equipment data| ITEMS[Items.ts<br/>Item Database]
    ITEMS -->|workTypes property| WORK[Work.ts<br/>Work Categories]
    WORK -->|calculateHarvestAmount| PAWNS

    %% Secondary Circular Chain
    BUILDINGS[Buildings.ts<br/>Building Database] -->|work bonuses| WORK
    WORK -->|construction work| BUILDINGS

    %% Equipment Chain
    PAWNS -->|equipment bonuses| EQUIP[PawnEquipment.ts]
    EQUIP -->|item lookups| ITEMS
    ITEMS -->|equipment effects| EQUIP

    %% Service Layer Attempts
    ITEMS -.->|extracted logic| IS[ItemService]
    WORK -.->|extracted logic| WS[WorkService]
    PAWNS -.->|extracted logic| PS[PawnService<br/>Not Implemented]

    %% ModifierSystem Dependencies
    IS --> MS[ModifierSystem]
    WS --> MS
    MS -->|auto-discovery| ITEMS
    MS -->|auto-discovery| BUILDINGS

    classDef problem fill:#ffcccc,stroke:#ff0000,stroke-width:2px
    classDef partial fill:#ffffcc,stroke:#ffaa00,stroke-width:2px
    classDef service fill:#ccffcc,stroke:#00aa00,stroke-width:2px

    class PAWNS,ITEMS,WORK,BUILDINGS problem
    class IS,WS,MS service
    class PS partial
```

### Service Layer Integration Status

#### Current Service Implementation (Updated December 2024)

```mermaid
graph TB
    %% Data Layer (Current)
    subgraph "Data Layer (Mostly Clean)"
        ITEMS_DB[Items Database<br/>ITEMS_DATABASE<br/>2000+ lines, organized]
        BUILDINGS_DB[Buildings Database<br/>AVAILABLE_BUILDINGS<br/>1000+ lines, organized]
        WORK_DB[Work Categories<br/>WORK_CATEGORIES<br/>Clean data only]
        TYPES[types.ts<br/>Type Definitions]
    end

    %% Service Layer (Fully Implemented)
    subgraph "Service Layer (Current Status)"
        IS[ItemService ✅<br/>ItemServiceImpl<br/>Fully Functional]
        BS[BuildingService ✅<br/>BuildingServiceImpl<br/>Fully Functional]
        WS[WorkService ✅<br/>WorkServiceImpl<br/>Fully Functional]
        RS[ResearchService ✅<br/>ResearchServiceImpl<br/>Fully Functional]
        PS[PawnService ⚠️<br/>Interface Defined<br/>Placeholder Implementation]
        ES[EventService ⚠️<br/>Interface Defined<br/>Placeholder Implementation]
    end

    %% Systems Layer (Fully Implemented)
    subgraph "Systems Layer (Production Ready)"
        MS[ModifierSystem ✅<br/>ModifierSystemImpl<br/>Auto-Discovery Working]
        GE[GameEngine ✅<br/>GameEngineImpl<br/>Central Coordinator Active]
        SIC[SystemInteractionCoordinator ✅<br/>SystemInteractionCoordinatorImpl<br/>Communication Protocols]
        SR[ServiceRegistry ✅<br/>ServiceRegistryImpl<br/>Dependency Management]
        SLM[ServiceLifecycleManager ✅<br/>BasicServiceLifecycleManager<br/>Health Monitoring]
        SC[ServiceContainer ✅<br/>SimpleServiceContainer<br/>Dependency Injection]
    end

    %% Clean Connections (Implemented)
    ITEMS_DB --> IS
    BUILDINGS_DB --> BS
    WORK_DB --> WS

    IS --> MS
    BS --> MS
    WS --> MS
    RS --> MS

    %% GameEngine Coordination (Active)
    GE --> SR
    SR --> IS
    SR --> BS
    SR --> WS
    SR --> RS
    SR --> PS
    SR --> ES

    %% System Coordination (Operational)
    GE --> MS
    GE --> SIC
    SIC --> SR
    SR --> SLM
    SLM --> SC

    %% Remaining Circular Dependencies (Minimal)
    WORK_DB -.->|getItemInfo() calls| ITEMS_DB

    classDef implemented fill:#ccffcc,stroke:#00aa00,stroke-width:2px
    classDef placeholder fill:#ffffcc,stroke:#ffaa00,stroke-width:2px
    classDef minimal_circular fill:#ffe6cc,stroke:#ff8800,stroke-width:1px,stroke-dasharray: 3 3

    class IS,BS,WS,RS,MS,GE,SIC,SR,SLM,SC implemented
    class PS,ES placeholder
    class WORK_DB minimal_circular
```

### GameEngine Coordination Requirements

#### Target GameEngine Flow

```mermaid
graph TD
    %% GameEngine Central Coordination
    GE[GameEngine<br/>Central Coordinator] --> SR[ServiceRegistry<br/>Service Management]

    %% Service Registry
    SR --> IS[ItemService]
    SR --> BS[BuildingService]
    SR --> WS[WorkService]
    SR --> PS[PawnService]
    SR --> RS[ResearchService]
    SR --> ES[EventService]

    %% Unified Calculations
    GE --> UC[Unified Calculations]
    UC --> PE[calculatePawnEfficiency]
    UC --> BE[calculateBuildingEffects]
    UC --> CT[calculateCraftingTime]
    UC --> RP[calculateResourceProduction]

    %% System Coordination
    GE --> SC[System Coordination]
    SC --> TP[processGameTurn]
    SC --> SI[coordinateSystemInteractions]
    SC --> SV[validateSystemConsistency]

    %% State Management
    GE --> SM[State Management]
    SM --> GS[getGameState]
    SM --> US[updateGameState]
    SM --> RS_STATE[resetGameState]

    %% Integration Points
    UC --> MS[ModifierSystem<br/>Automated Calculations]
    SC --> SIC[SystemInteractionCoordinator]
    SM --> GSM[GameStateManager]

    classDef target fill:#ccffff,stroke:#0066cc,stroke-width:2px
    classDef service fill:#ccffcc,stroke:#00aa00,stroke-width:2px
    classDef system fill:#ffffcc,stroke:#ffaa00,stroke-width:2px

    class GE,SR,UC,SC,SM target
    class IS,BS,WS,PS,RS,ES service
    class MS,SIC,GSM system
```

## Problem Analysis

### 1. Circular Dependency Issues

**Primary Issues:**

- `Pawns.ts` → `Items.ts` → `Work.ts` → `Pawns.ts`
- `Buildings.ts` → `Work.ts` → `Buildings.ts`
- `PawnEquipment.ts` → `Items.ts` → `PawnEquipment.ts`

**Impact:**

- Prevents clean testing of individual systems
- Makes code changes risky (changing one file affects many others)
- Blocks implementation of combat system
- Complicates debugging and maintenance

### 2. Missing Central Coordination

**Current State:**

- No single source of truth for calculations
- Scattered business logic across data files
- No unified system interaction patterns
- Manual coordination between systems

**Required:**

- GameEngine as central coordinator
- Unified calculation methods
- Standardized system interaction protocols
- Centralized state management

### 3. Service Layer Gaps

**Fully Implemented:**

- ItemService ✅
- BuildingService ✅
- WorkService ✅
- ResearchService ✅
- ModifierSystem ✅
- GameEngine ✅ (GameEngineImpl)
- SystemInteractionCoordinator ✅
- ServiceRegistry ✅

**Placeholder Implementations Only:**

- PawnService ⚠️ (Interface exists, placeholder implementation)
- EventService ⚠️ (Interface exists, placeholder implementation)

**Still Problematic:**

- Circular Dependencies ❌ (Core data files still have circular imports)
- Business Logic Extraction ❌ (Logic still mixed with data in core files)

## Target Architecture Flow

### Clean Architecture Flow

```mermaid
graph TB
    %% UI Layer
    UI[UI Components] --> GE[GameEngine<br/>Central Coordinator]

    %% GameEngine Coordination
    GE --> SR[ServiceRegistry]
    GE --> UC[Unified Calculations]
    GE --> SC[System Coordination]
    GE --> SM[State Management]

    %% Service Layer (Clean)
    SR --> IS[ItemService]
    SR --> BS[BuildingService]
    SR --> WS[WorkService]
    SR --> PS[PawnService]
    SR --> RS[ResearchService]
    SR --> ES[EventService]

    %% Data Layer (Pure Data)
    IS --> ITEMS_DATA[Items Database<br/>Pure Data]
    BS --> BUILDINGS_DATA[Buildings Database<br/>Pure Data]
    WS --> WORK_DATA[Work Categories<br/>Pure Data]
    PS --> PAWN_DATA[Pawn Templates<br/>Pure Data]
    RS --> RESEARCH_DATA[Research Database<br/>Pure Data]
    ES --> EVENT_DATA[Event Templates<br/>Pure Data]

    %% Systems Layer
    UC --> MS[ModifierSystem]
    SC --> SIC[SystemInteractionCoordinator]
    SM --> GSM[GameStateManager]

    %% Clean Dependencies (Unidirectional)
    MS --> ITEMS_DATA
    MS --> BUILDINGS_DATA
    MS --> WORK_DATA

    classDef clean fill:#ccffcc,stroke:#00aa00,stroke-width:2px
    classDef data fill:#e6f3ff,stroke:#0066cc,stroke-width:2px
    classDef system fill:#fff2e6,stroke:#ff8800,stroke-width:2px

    class GE,SR,IS,BS,WS,PS,RS,ES clean
    class ITEMS_DATA,BUILDINGS_DATA,WORK_DATA,PAWN_DATA,RESEARCH_DATA,EVENT_DATA data
    class UC,SC,SM,MS,SIC,GSM system
```

## Current Implementation Status (Detailed Analysis)

### Actual Circular Dependencies Found in Code

#### 1. Work.ts → Items.ts Circular Chain

```typescript
// In Work.ts (line 3)
import { getItemInfo } from './Items';

// In Items.ts (workTypes property in items)
workTypes: ['foraging']; // References work categories
```

#### 2. Pawns.ts → PawnEquipment.ts → Items.ts Chain

```typescript
// In Pawns.ts (line 3)
import {
  createPawnInventory,
  createPawnEquipment,
  getEquipmentBonuses
} from '../core/PawnEquipment';

// In PawnEquipment.ts (line 2)
import { getItemInfo } from './Items';

// This creates: Pawns → PawnEquipment → Items
```

#### 3. Work.ts → Locations.ts → Potential Circular

```typescript
// In Work.ts (lines 4-5)
import {
  getDiscoveredLocations,
  getAvailableResourcesFromLocation,
  getLocationInfo,
  extractResource
} from './Locations';

// Locations.ts likely references work types for resource extraction
```

### Service Implementation Status (Verified)

#### Fully Functional Services

- **ItemService** ✅ (`ItemServiceImpl` class with full implementation)
- **BuildingService** ✅ (`BuildingServiceImpl` class with full implementation)
- **WorkService** ✅ (`WorkServiceImpl` class with full implementation)
- **ResearchService** ✅ (`ResearchServiceImpl` class with full implementation)

#### Systems Layer Status

- **ModifierSystem** ✅ (`ModifierSystemImpl` class with full implementation)
- **GameEngine** ✅ (`GameEngineImpl` class with full implementation)
- **SystemInteractionCoordinator** ✅ (`SystemInteractionCoordinatorImpl` class)
- **ServiceRegistry** ✅ (`ServiceRegistryImpl` class)

#### Placeholder Services (Need Full Implementation)

- **PawnService** ⚠️ (Interface exists, `PawnServiceImpl` is placeholder)
- **EventService** ⚠️ (Interface exists, `EventServiceImpl` is placeholder)

### Critical Gaps Remaining

#### 1. Business Logic Still Mixed with Data

- **Items.ts**: Still contains `workTypes` properties that create circular dependencies
- **Work.ts**: Still imports `getItemInfo` directly from Items.ts
- **PawnEquipment.ts**: Still imports `getItemInfo` directly from Items.ts

#### 2. Core Files Not Using Service Layer

- UI components may still import core files directly instead of using GameEngine
- Core files still have direct imports between each other
- Service layer exists but isn't fully integrated into the data flow

#### 3. Missing Service Implementations

- **PawnService**: Needs full implementation for pawn behavior, needs processing, stat calculations
- **EventService**: Needs full implementation for event generation, processing, and integration

## Implementation Priority

### Phase 1: Foundation (Weeks 1-2)

1. **Complete system flow documentation** ✅ (This document)
2. **Implement full PawnService** (replace placeholder)
3. **Implement full EventService** (replace placeholder)
4. **Extract business logic** from Items.ts, Work.ts, PawnEquipment.ts
5. **Eliminate circular dependencies** in core files

### Phase 2: Integration (Weeks 3-4)

1. **Implement SystemInteractionCoordinator**
2. **Integrate services with GameEngine**
3. **Update UI components** to use GameEngine
4. **Validate system consistency**

### Phase 3: Optimization (Weeks 5-6)

1. **Performance optimization**
2. **Error handling and recovery**
3. **Testing and validation**
4. **Documentation updates**

## Success Metrics

### Architecture Quality

- ✅ Zero circular dependencies
- ✅ Clean TypeScript compilation
- ✅ Service layer complete
- ✅ GameEngine operational

### System Integration

- ✅ All systems coordinate through GameEngine
- ✅ Unified calculations working
- ✅ State consistency maintained
- ✅ Error recovery functional

### Performance

- ✅ No performance regression
- ✅ Calculation caching effective
- ✅ Memory usage stable
- ✅ UI responsiveness maintained

## Integration Testing Flow

### Complete System Integration Test Sequence

```mermaid
sequenceDiagram
    participant UI as UI Components
    participant GE as GameEngine
    participant SR as ServiceRegistry
    participant IS as ItemService
    participant WS as WorkService
    participant PS as PawnService
    participant MS as ModifierSystem
    participant GS as GameState

    Note over UI,GS: Complete Turn Processing Test

    UI->>GE: processGameTurn()
    GE->>SR: getServices()

    Note over GE: Pawn Needs Processing
    GE->>PS: processPawnNeeds(pawnId)
    PS->>GS: getPawnState(pawnId)
    PS->>PS: calculateNeedsDecay()
    PS->>GS: updatePawnNeeds(pawnId, needs)

    Note over GE: Work Assignment Processing
    GE->>WS: processWorkAssignments()
    WS->>PS: getPawnWorkCapacity(pawnId)
    WS->>MS: calculateWorkEfficiency(pawnId, workType)
    MS->>IS: getEquipmentBonuses(pawnId)
    MS->>MS: aggregateModifiers()
    MS-->>WS: efficiency result
    WS->>GS: updateWorkProgress()

    Note over GE: Resource Production
    GE->>WS: calculateResourceProduction()
    WS->>MS: getProductionModifiers()
    MS->>IS: getBuildingBonuses()
    MS-->>WS: production modifiers
    WS->>GS: addResources()

    Note over GE: State Validation
    GE->>GE: validateSystemConsistency()
    GE->>GS: commitStateChanges()
    GS-->>UI: reactive updates

    Note over UI,GS: Integration Test Complete
```

### System Health Check Flow

```mermaid
graph TD
    HC[Health Check Request] --> GE[GameEngine]
    GE --> SR[ServiceRegistry]

    %% Service Health Checks
    SR --> IS_HC[ItemService Health Check]
    SR --> BS_HC[BuildingService Health Check]
    SR --> WS_HC[WorkService Health Check]
    SR --> PS_HC[PawnService Health Check]
    SR --> RS_HC[ResearchService Health Check]
    SR --> ES_HC[EventService Health Check]

    %% System Health Checks
    GE --> MS_HC[ModifierSystem Health Check]
    GE --> SIC_HC[SystemInteractionCoordinator Health Check]
    GE --> STATE_HC[State Consistency Check]

    %% Results Aggregation
    IS_HC --> RESULTS[Health Check Results]
    BS_HC --> RESULTS
    WS_HC --> RESULTS
    PS_HC --> RESULTS
    RS_HC --> RESULTS
    ES_HC --> RESULTS
    MS_HC --> RESULTS
    SIC_HC --> RESULTS
    STATE_HC --> RESULTS

    %% Status Report
    RESULTS --> STATUS[System Status Report]
    STATUS --> PASS[All Systems Healthy ✅]
    STATUS --> FAIL[System Issues Detected ❌]

    classDef health fill:#e6ffe6,stroke:#00aa00,stroke-width:2px
    classDef check fill:#fff2e6,stroke:#ff8800,stroke-width:2px
    classDef pass fill:#ccffcc,stroke:#00aa00,stroke-width:2px
    classDef fail fill:#ffcccc,stroke:#ff0000,stroke-width:2px

    class HC,GE,SR health
    class IS_HC,BS_HC,WS_HC,PS_HC,RS_HC,ES_HC,MS_HC,SIC_HC,STATE_HC check
    class PASS pass
    class FAIL fail
```

## Validation Checklist

### Architecture Validation

- [ ] **Zero Circular Dependencies**: No import cycles detected by TypeScript compiler
- [ ] **Clean Compilation**: `npm run build` completes without errors or warnings
- [ ] **Service Layer Complete**: All services implement their interfaces fully
- [ ] **GameEngine Integration**: All system interactions go through GameEngine
- [ ] **State Consistency**: GameState remains consistent across all operations

### Functional Validation

- [ ] **Turn Processing**: Complete game turn processes without errors
- [ ] **Work Assignments**: Pawns can be assigned to work with correct efficiency calculations
- [ ] **Resource Production**: Resources are produced according to work assignments and modifiers
- [ ] **Crafting System**: Items can be crafted with proper validation and resource consumption
- [ ] **Building Construction**: Buildings can be constructed with proper requirements checking
- [ ] **Research Progression**: Research projects can be completed and unlock new content

### Performance Validation

- [ ] **Calculation Caching**: Expensive calculations are cached and reused appropriately
- [ ] **Memory Usage**: Memory usage remains stable during extended gameplay
- [ ] **UI Responsiveness**: UI updates remain smooth and responsive
- [ ] **Load Times**: Game loads and saves complete within acceptable time limits

### Integration Validation

- [ ] **Service Communication**: Services communicate only through GameEngine coordination
- [ ] **Event System**: Events are generated and processed correctly
- [ ] **State Synchronization**: UI components stay synchronized with game state
- [ ] **Error Recovery**: System recovers gracefully from errors without data loss

---

_This comprehensive system flow diagram documents the complete current architecture, identifies all circular dependencies and integration points, and provides the foundation for successful architecture refactoring. The integration testing flows ensure that the refactored system will work correctly once implementation is complete._
