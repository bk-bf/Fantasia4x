# Fantasia4x System Hierarchy Diagram

## Overview

This document defines the system hierarchy for Fantasia4x, identifying primary systems, secondary systems, and their interaction points. This hierarchy serves as the foundation for the architectural refactoring outlined in the requirements and design documents.

## System Classification

### Primary Systems (Core Game Loop)
These systems form the core game loop and are essential for basic gameplay functionality:

1. **Pawns System** - Individual character management and behavior
2. **Work System** - Labor assignment and resource production
3. **Resources System** - Item management and inventory tracking

### Secondary Systems (Feature Extensions)
These systems extend gameplay functionality and depend on primary systems:

1. **Events System** - Dynamic storytelling and random occurrences
2. **Research System** - Technology progression and unlocks
3. **Exploration System** - Location discovery and missions
4. **Buildings System** - Construction and infrastructure
5. **Combat System** (Planned) - Tactical combat mechanics

## System Hierarchy Diagram

```mermaid
graph TB
    %% Central Coordinator
    GE[GameEngine<br/>Central Coordinator]
    
    %% Primary Systems
    subgraph "PRIMARY SYSTEMS (Core Game Loop)"
        PS[Pawns System<br/>🧑‍🤝‍🧑 Individual Management]
        WS[Work System<br/>⚒️ Labor & Production]
        RS[Resources System<br/>📦 Items & Inventory]
    end
    
    %% Secondary Systems
    subgraph "SECONDARY SYSTEMS (Feature Extensions)"
        ES[Events System<br/>📜 Dynamic Stories]
        RES[Research System<br/>🔬 Technology Tree]
        EXS[Exploration System<br/>🗺️ Location Discovery]
        BS[Buildings System<br/>🏗️ Construction]
        CS[Combat System<br/>⚔️ Tactical Combat<br/>(Planned)]
    end
    
    %% Service Layer
    subgraph "SERVICE LAYER (Business Logic)"
        IS[ItemService]
        BSV[BuildingService]
        WSV[WorkService]
        PSV[PawnService]
        RESV[ResearchService]
        ESV[EventService]
    end
    
    %% Data Layer
    subgraph "DATA LAYER (Pure Data)"
        ID[(Items Database)]
        BD[(Buildings Database)]
        WD[(Work Database)]
        RD[(Research Database)]
        LD[(Locations Database)]
        ED[(Events Database)]
    end
    
    %% UI Layer
    subgraph "UI LAYER (Components)"
        MS[MainScreen]
        subgraph "Core UI"
            RS_UI[ResourceSidebar]
            EL[EventLog]
            GC[GameControls]
            TK[TaskContainer]
        end
        subgraph "Screen Components"
            PS_UI[PawnScreen]
            WS_UI[WorkScreen]
            CS_UI[CraftingScreen]
            BS_UI[BuildingMenu]
            RES_UI[ResearchScreen]
            EXS_UI[ExplorationScreen]
        end
    end
    
    %% State Management
    subgraph "STATE MANAGEMENT"
        GST[GameState Store]
        UST[UI State Store]
        EST[Event Store]
        WST[World State Store]
    end
    
    %% Connections - GameEngine coordinates all systems
    GE --> PS
    GE --> WS
    GE --> RS
    GE --> ES
    GE --> RES
    GE --> EXS
    GE --> BS
    GE --> CS
    
    %% Service Layer connections
    GE --> IS
    GE --> BSV
    GE --> WSV
    GE --> PSV
    GE --> RESV
    GE --> ESV
    
    %% Services access data
    IS --> ID
    BSV --> BD
    WSV --> WD
    PSV --> ID
    RESV --> RD
    ESV --> ED
    
    %% UI connects to GameEngine
    MS --> GE
    PS_UI --> GE
    WS_UI --> GE
    CS_UI --> GE
    BS_UI --> GE
    RES_UI --> GE
    EXS_UI --> GE
    
    %% Core UI connects to GameEngine
    RS_UI --> GE
    EL --> GE
    GC --> GE
    TK --> GE
    
    %% State management
    GE --> GST
    MS --> UST
    ES --> EST
    EXS --> WST
    
    %% Styling
    classDef primary fill:#e1f5fe,stroke:#01579b,stroke-width:3px
    classDef secondary fill:#f3e5f5,stroke:#4a148c,stroke-width:2px
    classDef service fill:#e8f5e8,stroke:#1b5e20,stroke-width:2px
    classDef data fill:#fff3e0,stroke:#e65100,stroke-width:2px
    classDef ui fill:#fce4ec,stroke:#880e4f,stroke-width:2px
    classDef coordinator fill:#ffebee,stroke:#b71c1c,stroke-width:4px
    
    class PS,WS,RS primary
    class ES,RES,EXS,BS,CS secondary
    class IS,BSV,WSV,PSV,RESV,ESV service
    class ID,BD,WD,RD,LD,ED data
    class MS,RS_UI,EL,GC,TK,PS_UI,WS_UI,CS_UI,BS_UI,RES_UI,EXS_UI ui
    class GE coordinator
```

## System Dependencies and Interaction Points

### Primary System Interactions

#### Pawns ↔ Work ↔ Resources Flow
```
Pawns System → Work System → Resources System
     ↑                              ↓
     ←──────── Resource Consumption ←─
```

**Current Problem**: Circular dependency chain
- Pawns import Items for equipment/inventory
- Items reference Work categories for crafting
- Work imports Pawns for efficiency calculations

**Target Solution**: All interactions mediated through GameEngine and Service Layer

#### Core Game Loop Integration
1. **Pawns System** manages individual character state and needs
2. **Work System** assigns pawns to production activities
3. **Resources System** tracks materials produced and consumed
4. **GameEngine** coordinates all interactions and calculations

### Secondary System Dependencies

#### Events System
- **Depends on**: Pawns (for character events), Resources (for resource events)
- **Triggers**: Random events, milestone events, consequence chains
- **Integration Points**: Event consequences affect pawn stats, resource amounts

#### Research System
- **Depends on**: Resources (scroll/material requirements), Buildings (research facilities)
- **Unlocks**: New items, buildings, work categories
- **Integration Points**: Research completion triggers unlock events

#### Exploration System
- **Depends on**: Pawns (explorers), Resources (supplies), Research (prerequisites)
- **Produces**: New locations, resources, events
- **Integration Points**: Mission completion affects multiple systems

#### Buildings System
- **Depends on**: Resources (construction materials), Research (prerequisites)
- **Affects**: Work efficiency, resource production, pawn capacity
- **Integration Points**: Building effects modify other system calculations

#### Combat System (Planned)
- **Depends on**: Pawns (combatants), Resources (equipment), Buildings (fortifications)
- **Affects**: Pawn health/stats, resource consumption, event generation
- **Integration Points**: Combat outcomes trigger cascading effects

## Service Layer Interface Points

### ItemService Interfaces
```typescript
// Primary system interfaces
getPawnEquipment(pawnId: string): Equipment[]
getWorkTools(workCategory: string): Item[]
getCraftingMaterials(itemId: string): Record<string, number>

// Secondary system interfaces
getResearchMaterials(researchId: string): Record<string, number>
getBuildingMaterials(buildingId: string): Record<string, number>
getExplorationSupplies(missionId: string): Record<string, number>
```

### WorkService Interfaces
```typescript
// Primary system interfaces
assignPawnToWork(pawnId: string, workType: string): boolean
calculateWorkEfficiency(pawnId: string, workType: string): number
processWorkProduction(assignments: WorkAssignment[]): ResourceProduction[]

// Secondary system interfaces
getWorkUnlockedByResearch(researchId: string): string[]
getWorkBonusFromBuilding(buildingId: string): Record<string, number>
```

### PawnService Interfaces
```typescript
// Primary system interfaces
updatePawnNeeds(pawnId: string): void
calculatePawnStats(pawnId: string): RaceStats
managePawnInventory(pawnId: string, items: Record<string, number>): boolean

// Secondary system interfaces
applyEventEffects(pawnId: string, effects: EventEffects): void
assignToExploration(pawnId: string, missionId: string): boolean
preparePawnForCombat(pawnId: string): CombatReadiness
```

## Critical Integration Points

### 1. Efficiency Calculations
**Current Problem**: Scattered across multiple files
**Target Solution**: Centralized in GameEngine with service layer support

```typescript
// GameEngine coordinates all efficiency calculations
calculatePawnWorkEfficiency(pawnId: string, workType: string): number {
  const pawnStats = PawnService.getEffectiveStats(pawnId);
  const workRequirements = WorkService.getWorkRequirements(workType);
  const equipmentBonuses = ItemService.getEquipmentBonuses(pawnId);
  const buildingBonuses = BuildingService.getWorkplaceBonuses(workType);
  
  return this.combineEfficiencyFactors(pawnStats, workRequirements, equipmentBonuses, buildingBonuses);
}
```

### 2. Resource Flow Management
**Current Problem**: Inconsistent resource tracking between systems
**Target Solution**: Unified resource management through GameEngine

```typescript
// All resource changes go through GameEngine
processResourceTransaction(transaction: ResourceTransaction): boolean {
  const available = ItemService.getAvailableResources();
  const required = transaction.requirements;
  
  if (this.validateResourceAvailability(available, required)) {
    ItemService.updateResourceAmounts(transaction.changes);
    this.logResourceTransaction(transaction);
    return true;
  }
  return false;
}
```

### 3. Event System Integration
**Current Problem**: Events don't properly integrate with other systems
**Target Solution**: Events trigger through GameEngine coordination

```typescript
// Events affect multiple systems through GameEngine
processEventConsequences(event: GameEvent): void {
  event.consequences.forEach(consequence => {
    if (consequence.pawnEffects) {
      PawnService.applyEffects(consequence.pawnEffects);
    }
    if (consequence.resourceEffects) {
      ItemService.applyEffects(consequence.resourceEffects);
    }
    if (consequence.buildingEffects) {
      BuildingService.applyEffects(consequence.buildingEffects);
    }
  });
}
```

## Architecture Benefits

### Clean Separation of Concerns
- **Data Layer**: Pure data definitions, no business logic
- **Service Layer**: Business logic and data access, no UI concerns
- **GameEngine**: System coordination and unified calculations
- **UI Layer**: Presentation logic, no direct system access

### Elimination of Circular Dependencies
- All system interactions mediated through GameEngine
- Services access data layer directly, systems access services through GameEngine
- UI components interact only with GameEngine, not individual systems

### Scalability for Combat System
- Combat system integrates cleanly through existing service layer
- No need to modify existing system files
- GameEngine provides coordination for complex combat interactions

### Testing and Maintenance
- Each system can be tested independently through service interfaces
- Business logic separated from data allows focused testing
- Clear dependency hierarchy enables incremental refactoring

## Implementation Priority

### Phase 1: Service Layer Creation
1. Extract ItemService from Items.ts
2. Extract BuildingService from Buildings.ts  
3. Extract WorkService from Work.ts
4. Create PawnService for pawn management

### Phase 2: GameEngine Implementation
1. Create GameEngine class with coordination methods
2. Integrate services into GameEngine
3. Update components to use GameEngine instead of direct imports

### Phase 3: System Integration
1. Eliminate circular dependencies
2. Standardize all system interactions through GameEngine
3. Implement unified efficiency calculations

### Phase 4: Combat System Preparation
1. Validate architecture scales with existing content
2. Create combat-specific service interfaces
3. Prepare GameEngine for combat system integration

This hierarchy provides the foundation for clean, scalable architecture that supports both current functionality and planned combat system implementation.