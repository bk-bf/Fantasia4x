# Service Layer Interfaces Design Document

## Overview

This document outlines the complete service layer interfaces designed for the Fantasia4x architecture refactoring. The service layer provides clean separation between business logic and data definitions, enabling testable, maintainable, and extensible code.

## Service Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    SERVICE LAYER ARCHITECTURE               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  UI Components                                              │
│       │                                                     │
│       ▼                                                     │
│  Service Registry (Central Access)                          │
│       │                                                     │
│       ▼                                                     │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐          │
│  │  Item   │ │Building │ │  Work   │ │Research │          │
│  │Service  │ │Service  │ │Service  │ │Service  │          │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘          │
│       │           │           │           │                │
│       ▼           ▼           ▼           ▼                │
│  ┌─────────────────────────────────────────────────────┐   │
│  │               DATA LAYER                            │   │
│  │  Items.ts | Buildings.ts | Work.ts | Research.ts   │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## 1. ItemService Interface

**Purpose**: Clean interface for item queries, crafting validation, and inventory management.

### Core Methods

#### Query Methods
- `getItemById(id: string): Item | undefined`
- `getItemsByType(type: string): Item[]`
- `getItemsByCategory(category: string): Item[]`
- `getCraftableItems(gameState: GameState, pawnId?: string): Item[]`
- `getItemsByWorkType(workType: string): Item[]`

#### Validation Methods
- `canCraftItem(itemId: string, gameState: GameState, pawnId?: string): boolean`
- `hasRequiredMaterials(itemId: string, gameState: GameState): boolean`
- `hasRequiredTools(itemId: string, gameState: GameState): boolean`
- `hasRequiredBuilding(itemId: string, gameState: GameState): boolean`

#### Calculation Methods
- `calculateCraftingTime(itemId: string, gameState: GameState, pawnId?: string): number`
- `calculateCraftingCost(itemId: string): Record<string, number>`
- `calculateItemEffects(itemId: string): Record<string, number>`

#### Inventory Methods
- `getAvailableQuantity(itemId: string, gameState: GameState): number`
- `consumeItems(itemIds: Record<string, number>, gameState: GameState): GameState`
- `addItems(itemIds: Record<string, number>, gameState: GameState): GameState`

### Key Features
- **Crafting Validation**: Comprehensive checks for materials, tools, buildings, research, and population
- **Stat-based Bonuses**: Pawn dexterity affects crafting speed
- **Inventory Management**: Safe item consumption and addition with state immutability
- **Type Safety**: Full TypeScript support with proper error handling

## 2. BuildingService Interface

**Purpose**: Clean interface for building queries, construction validation, and building management.

### Core Methods

#### Query Methods
- `getBuildingById(id: string): Building | undefined`
- `getBuildingsByCategory(category: string): Building[]`
- `getBuildingsByTier(tier: number): Building[]`
- `getBuildingsByRarity(rarity: string): Building[]`
- `getAvailableBuildings(gameState: GameState, category?: string): Building[]`

#### Validation Methods
- `canBuildBuilding(buildingId: string, gameState: GameState): boolean`
- `hasRequiredResources(buildingId: string, gameState: GameState): boolean`
- `hasRequiredResearch(buildingId: string, gameState: GameState): boolean`
- `hasRequiredPopulation(buildingId: string, gameState: GameState): boolean`
- `hasRequiredTools(buildingId: string, gameState: GameState): boolean`
- `meetsStateRestrictions(buildingId: string, gameState: GameState): boolean`

#### Calculation Methods
- `calculateBuildingCost(buildingId: string): Record<string, number>`
- `calculateBuildingEffects(buildingId: string): Record<string, number>`
- `calculateConstructionTime(buildingId: string, gameState: GameState): number`
- `calculateBuildingEfficiency(buildingId: string, gameState: GameState): number`

#### Building Management
- `getBuildingDependencies(buildingId: string): string[]`
- `getBuildingUnlocks(buildingId: string): Building[]`
- `getBuildingMaintenanceNeeds(buildingId: string): { upkeep: Record<string, number>; requirements: string[]; }`

### Key Features
- **Comprehensive Validation**: Resources, research, population, tools, and state restrictions
- **Dynamic Construction Time**: Population affects construction speed
- **Building Synergies**: Network effects and efficiency calculations
- **Dependency Tracking**: Clear building prerequisites and unlocks

## 3. WorkService Interface

**Purpose**: Clean interface for work assignment, efficiency calculation, and resource production.

### Core Methods

#### Query Methods
- `getWorkCategory(workId: string): WorkCategory | undefined`
- `getAllWorkCategories(): WorkCategory[]`
- `getWorkCategoriesByLocation(locationId: string): WorkCategory[]`
- `getAvailableWork(gameState: GameState, locationId?: string): WorkCategory[]`

#### Assignment Methods
- `assignPawnToWork(pawnId: string, workType: string, locationId: string, gameState: GameState): GameState`
- `getOptimalWorkAssignment(pawns: Pawn[], productionTargets: ProductionTarget[], gameState: GameState): Record<string, WorkAssignment>`
- `updateWorkPriorities(pawnId: string, priorities: Record<string, number>, gameState: GameState): GameState`

#### Calculation Methods
- `calculateWorkEfficiency(pawn: Pawn, workCategory: WorkCategory, location?: Location, gameState?: GameState): number`
- `calculateResourceProduction(workAssignment: WorkAssignment, gameState: GameState): Record<string, number>`
- `calculateHarvestAmount(pawn: Pawn, workType: string, priority: number, gameState: GameState): number`

#### Validation Methods
- `canPawnDoWork(pawn: Pawn, workCategory: WorkCategory, gameState: GameState): boolean`
- `hasRequiredTools(pawn: Pawn, workCategory: WorkCategory, gameState: GameState): boolean`
- `hasRequiredSkills(pawn: Pawn, workCategory: WorkCategory): boolean`

#### Processing Methods
- `processWorkHarvesting(gameState: GameState): GameState`
- `getAvailableResourceIdsForWork(gameState: GameState, workType: string): string[]`

### Key Features
- **Stat-based Efficiency**: Primary and secondary stat bonuses for work categories
- **Stored Abilities Integration**: Uses pre-calculated pawn abilities when available
- **Tool and Skill Validation**: Comprehensive requirement checking
- **Optimal Assignment**: Efficiency-based pawn assignment to work categories
- **Resource Production**: Dynamic calculation based on work assignments

## 4. ResearchService Interface

**Purpose**: Clean interface for research progression, lore system, and technology unlocks.

### Core Methods

#### Query Methods
- `getResearchById(id: string): ResearchProject | undefined`
- `getAllResearch(): ResearchProject[]`
- `getResearchByCategory(category: string): ResearchProject[]`
- `getResearchByTier(tier: number): ResearchProject[]`
- `getAvailableResearch(gameState: GameState): ResearchProject[]`

#### Validation Methods
- `canStartResearch(researchId: string, gameState: GameState): boolean`
- `hasPrerequisites(researchId: string, gameState: GameState): boolean`
- `hasRequiredScrolls(researchId: string, gameState: GameState): boolean`
- `hasRequiredMaterials(researchId: string, gameState: GameState): boolean`
- `hasRequiredBuilding(researchId: string, gameState: GameState): boolean`
- `hasRequiredPopulation(researchId: string, gameState: GameState): boolean`

#### Lore System Methods
- `canUnlockWithLore(researchId: string, gameState: GameState): boolean`
- `getLoreItem(id: string): LoreItem | undefined`
- `getAllLore(): LoreItem[]`
- `getApplicableLore(researchId: string): LoreItem[]`

#### Calculation Methods
- `calculateResearchProgress(researchId: string, gameState: GameState): { canStart: boolean; scrollsNeeded: Record<string, number>; materialsNeeded: Record<string, number>; }`
- `calculateResearchTime(researchId: string, gameState: GameState): number`

#### Research Management
- `getResearchRequirements(researchId: string): { scrolls: Record<string, number>; materials: Record<string, number>; buildings: string[]; population: number; prerequisites: string[]; }`
- `getResearchUnlocks(researchId: string): { buildings: string[]; items: string[]; abilities: string[]; effects: Record<string, number>; toolTier: number; }`
- `startResearch(researchId: string, gameState: GameState): GameState`
- `completeResearch(researchId: string, gameState: GameState): GameState`

### Key Features
- **Comprehensive Prerequisites**: Scrolls, materials, buildings, population, and research chains
- **Lore System Integration**: Alternative research unlock paths through discovered lore
- **Dynamic Research Time**: Building bonuses affect research speed
- **Technology Unlocks**: Buildings, items, abilities, and tool tier progression
- **Resource Management**: Safe consumption of scrolls and materials

## Service Registry

**Central Access Point**: The `ServiceRegistry` interface provides unified access to all services:

```typescript
export interface ServiceRegistry {
  itemService: ItemService;
  buildingService: BuildingService;
  workService: WorkService;
  researchService: ResearchService;
}

export const serviceRegistry: ServiceRegistry = {
  itemService,
  buildingService,
  workService,
  researchService
};
```

## Implementation Benefits

### 1. Clean Architecture
- **Separation of Concerns**: Business logic separated from data definitions
- **Unidirectional Dependencies**: Services depend on data, not vice versa
- **Interface-based Design**: Implementations can be swapped without affecting consumers

### 2. Testability
- **Unit Testing**: Each service can be tested independently
- **Mock Support**: Interfaces enable easy mocking for tests
- **Isolated Logic**: Business rules can be validated without full game state

### 3. Maintainability
- **Single Responsibility**: Each service handles one domain area
- **Consistent Patterns**: Similar operations follow the same interface patterns
- **Type Safety**: Full TypeScript support prevents runtime errors

### 4. Extensibility
- **Easy Enhancement**: New methods can be added to interfaces
- **Service Composition**: Services can use other services through dependency injection
- **Plugin Architecture**: New services can be added to the registry

### 5. Performance
- **Singleton Pattern**: Service instances are reused across the application
- **Efficient Queries**: Optimized data access patterns
- **State Immutability**: Safe state updates without side effects

## Integration with GameEngine

The service layer is designed to integrate seamlessly with the planned GameEngine coordinator:

```typescript
interface GameEngine {
  // Service integration
  integrateServices(services: ServiceRegistry): void;
  
  // Unified calculations using services
  calculatePawnEfficiency(pawnId: string, workType: string): number;
  calculateBuildingEffects(buildingId: string): BuildingEffects;
  calculateCraftingTime(itemId: string, pawnId: string): number;
}
```

## Migration Strategy

### Phase 1: Service Layer Extraction ✅
- [x] Extract ItemService from Items.ts
- [x] Extract BuildingService from Buildings.ts  
- [x] Extract WorkService from Work.ts
- [x] Extract ResearchService from Research.ts
- [x] Create ServiceRegistry for unified access

### Phase 2: Component Integration
- [ ] Update UI components to use services instead of direct data access
- [ ] Replace direct imports with service registry usage
- [ ] Implement dependency injection patterns

### Phase 3: GameEngine Integration
- [ ] Create GameEngine class using service layer
- [ ] Implement unified system coordination
- [ ] Migrate complex calculations to GameEngine

## Conclusion

The service layer interfaces provide a solid foundation for the Fantasia4x architecture refactoring. They enable clean separation of concerns, comprehensive testing, and maintainable code while supporting the complex game mechanics required for the planned combat system and future features.

The interfaces are designed to be:
- **Complete**: Cover all current game functionality
- **Extensible**: Support future feature additions
- **Type-safe**: Full TypeScript integration
- **Testable**: Enable comprehensive unit testing
- **Performant**: Efficient data access and state management

This service layer forms the critical foundation for implementing the GameEngine coordinator and achieving the clean architecture goals outlined in the requirements.