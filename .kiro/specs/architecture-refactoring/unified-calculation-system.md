# Unified Calculation System Design

## Overview

The Unified Calculation System serves as the single source of truth for all bonus calculations, modifier aggregations, and efficiency computations in Fantasia4x. This system eliminates scattered calculation logic and provides consistent, cacheable, and performant calculations across all game systems.

## Current Problems

### Scattered Calculations
- Work efficiency calculated in multiple places (Work.ts, WorkService.ts, GameEngine interface)
- Item effects applied inconsistently across different systems
- Building bonuses calculated separately in each service
- Equipment bonuses mixed with base stats in various locations
- Research bonuses applied ad-hoc without central coordination

### Inconsistent Modifier Stacking
- No standardized way to combine bonuses from different sources
- Multiplicative vs additive bonuses applied inconsistently
- Order of operations varies between different calculation contexts
- No clear precedence rules for conflicting modifiers

### Performance Issues
- Recalculating same values multiple times per turn
- No caching of expensive calculations
- Redundant database lookups for modifier sources
- Complex calculations blocking game loop progression

## Architecture Design

### Core Components

```typescript
/**
 * Central calculation coordinator that manages all game calculations
 */
interface UnifiedCalculationEngine {
  // Efficiency Calculations
  calculatePawnWorkEfficiency(pawnId: string, workType: string): EfficiencyResult;
  calculateCraftingEfficiency(pawnId: string, itemId: string): EfficiencyResult;
  calculateCombatEfficiency(pawnId: string, combatType: CombatType): EfficiencyResult;
  
  // Modifier Aggregation
  aggregateModifiers(sourceType: ModifierSourceType, sourceId: string, targetType: ModifierTargetType): ModifierSet;
  calculateFinalValue(baseValue: number, modifiers: ModifierSet): number;
  
  // Resource Production
  calculateResourceProduction(workAssignment: WorkAssignment): ResourceProductionResult;
  calculateBuildingProduction(buildingId: string, locationId?: string): ResourceProductionResult;
  
  // Time Calculations
  calculateCraftingTime(itemId: string, pawnId: string): TimeCalculationResult;
  calculateConstructionTime(buildingId: string, assignedPawns: string[]): TimeCalculationResult;
  calculateResearchTime(researchId: string, assignedPawns: string[]): TimeCalculationResult;
  
  // Caching Management
  invalidateCache(cacheKey: string): void;
  clearAllCaches(): void;
  getCacheStatistics(): CacheStatistics;
}
```

### Modifier System Architecture

```typescript
/**
 * Standardized modifier representation
 */
interface Modifier {
  id: string;
  source: ModifierSource;
  target: ModifierTarget;
  type: ModifierType;
  value: number;
  operation: ModifierOperation;
  priority: number;
  conditions?: ModifierCondition[];
  duration?: ModifierDuration;
}

/**
 * Modifier source identification
 */
interface ModifierSource {
  type: 'pawn_stat' | 'equipment' | 'building' | 'research' | 'race_trait' | 'event' | 'temporary';
  id: string;
  name: string;
}

/**
 * Modifier target specification
 */
interface ModifierTarget {
  type: 'work_efficiency' | 'crafting_speed' | 'combat_power' | 'resource_production' | 'stat_bonus';
  subtype?: string; // e.g., 'woodcutting' for work_efficiency
}

/**
 * Modifier operation types
 */
type ModifierOperation = 
  | 'add'           // +10
  | 'multiply'      // *1.5
  | 'percentage'    // +15%
  | 'set_minimum'   // min(current, value)
  | 'set_maximum'   // max(current, value)
  | 'override';     // replace entirely

/**
 * Modifier aggregation rules
 */
interface ModifierAggregationRules {
  // How to combine multiple modifiers of the same type
  sameTypeStacking: 'additive' | 'multiplicative' | 'highest_wins' | 'custom';
  
  // Order of operations for different modifier types
  operationOrder: ModifierOperation[];
  
  // Priority resolution for conflicting modifiers
  priorityResolution: 'highest_priority' | 'most_recent' | 'source_hierarchy';
  
  // Custom aggregation function for complex cases
  customAggregator?: (modifiers: Modifier[]) => number;
}
```

### Calculation Pipeline Architecture

```typescript
/**
 * Standardized calculation pipeline
 */
interface CalculationPipeline<TInput, TOutput> {
  // Pipeline stages
  stages: CalculationStage<any, any>[];
  
  // Execute full pipeline
  execute(input: TInput): Promise<TOutput>;
  
  // Execute specific stage
  executeStage<TStageInput, TStageOutput>(
    stageIndex: number, 
    input: TStageInput
  ): Promise<TStageOutput>;
  
  // Pipeline validation
  validate(): PipelineValidationResult;
}

/**
 * Individual calculation stage
 */
interface CalculationStage<TInput, TOutput> {
  name: string;
  description: string;
  dependencies: string[];
  
  // Stage execution
  execute(input: TInput, context: CalculationContext): Promise<TOutput>;
  
  // Stage validation
  validate(input: TInput): ValidationResult;
  
  // Caching configuration
  caching?: {
    enabled: boolean;
    keyGenerator: (input: TInput) => string;
    ttl: number; // Time to live in milliseconds
  };
}
```

## Specific Calculation Implementations

### Work Efficiency Calculation Pipeline

```typescript
/**
 * Work efficiency calculation with all modifier sources
 */
class WorkEfficiencyCalculationPipeline implements CalculationPipeline<WorkEfficiencyInput, EfficiencyResult> {
  stages = [
    new BaseStatCalculationStage(),
    new RacialTraitModifierStage(),
    new EquipmentBonusStage(),
    new BuildingBonusStage(),
    new ResearchBonusStage(),
    new MoraleModifierStage(),
    new TemporaryEffectStage(),
    new FinalAggregationStage()
  ];
}

/**
 * Base stat calculation stage
 */
class BaseStatCalculationStage implements CalculationStage<WorkEfficiencyInput, BaseEfficiencyResult> {
  async execute(input: WorkEfficiencyInput, context: CalculationContext): Promise<BaseEfficiencyResult> {
    const pawn = context.gameState.pawns.find(p => p.id === input.pawnId);
    const workCategory = context.services.workService.getWorkCategory(input.workType);
    
    if (!pawn || !workCategory) {
      throw new CalculationError('Invalid pawn or work category');
    }
    
    // Base efficiency from primary stat
    const primaryStatValue = pawn.stats[workCategory.primaryStat] || 10;
    let efficiency = workCategory.baseEfficiency * (primaryStatValue / 10);
    
    // Secondary stat bonus
    if (workCategory.secondaryStat) {
      const secondaryStatValue = pawn.stats[workCategory.secondaryStat] || 10;
      efficiency *= (1 + (secondaryStatValue - 10) / 50);
    }
    
    return {
      baseEfficiency: efficiency,
      primaryStat: workCategory.primaryStat,
      primaryStatValue,
      secondaryStat: workCategory.secondaryStat,
      secondaryStatValue: workCategory.secondaryStat ? pawn.stats[workCategory.secondaryStat] : undefined
    };
  }
}

/**
 * Equipment bonus calculation stage
 */
class EquipmentBonusStage implements CalculationStage<BaseEfficiencyResult, EquipmentBonusResult> {
  async execute(input: BaseEfficiencyResult, context: CalculationContext): Promise<EquipmentBonusResult> {
    const pawn = context.gameState.pawns.find(p => p.id === context.input.pawnId);
    if (!pawn) throw new CalculationError('Pawn not found');
    
    const modifiers: Modifier[] = [];
    
    // Check all equipment slots
    for (const [slot, equipment] of Object.entries(pawn.equipment)) {
      if (equipment?.itemId) {
        const item = context.services.itemService.getItemById(equipment.itemId);
        if (item?.effects) {
          // Convert item effects to modifiers
          const itemModifiers = this.convertItemEffectsToModifiers(item, context.input.workType);
          modifiers.push(...itemModifiers);
        }
      }
    }
    
    return {
      ...input,
      equipmentModifiers: modifiers,
      equipmentBonus: this.aggregateModifiers(modifiers)
    };
  }
  
  private convertItemEffectsToModifiers(item: Item, workType: string): Modifier[] {
    const modifiers: Modifier[] = [];
    
    if (item.effects) {
      // Work-specific bonuses
      const workBonus = item.effects[`${workType}Bonus`];
      if (workBonus) {
        modifiers.push({
          id: `${item.id}_${workType}_bonus`,
          source: { type: 'equipment', id: item.id, name: item.name },
          target: { type: 'work_efficiency', subtype: workType },
          type: 'equipment_bonus',
          value: workBonus,
          operation: 'multiply',
          priority: 100
        });
      }
      
      // General efficiency bonuses
      if (item.effects.efficiency) {
        modifiers.push({
          id: `${item.id}_general_efficiency`,
          source: { type: 'equipment', id: item.id, name: item.name },
          target: { type: 'work_efficiency' },
          type: 'equipment_bonus',
          value: item.effects.efficiency,
          operation: 'multiply',
          priority: 90
        });
      }
    }
    
    return modifiers;
  }
}
```

### Building Bonus Calculation

```typescript
/**
 * Building bonus calculation for work efficiency
 */
class BuildingBonusStage implements CalculationStage<EquipmentBonusResult, BuildingBonusResult> {
  async execute(input: EquipmentBonusResult, context: CalculationContext): Promise<BuildingBonusResult> {
    const modifiers: Modifier[] = [];
    
    // Get buildings at work location
    const workLocation = context.input.locationId;
    if (workLocation) {
      const locationBuildings = this.getBuildingsAtLocation(workLocation, context.gameState);
      
      for (const building of locationBuildings) {
        const buildingModifiers = this.getBuildingModifiers(building, context.input.workType);
        modifiers.push(...buildingModifiers);
      }
    }
    
    // Get global building bonuses
    const globalModifiers = this.getGlobalBuildingModifiers(context.gameState, context.input.workType);
    modifiers.push(...globalModifiers);
    
    return {
      ...input,
      buildingModifiers: modifiers,
      buildingBonus: this.aggregateModifiers(modifiers)
    };
  }
  
  private getBuildingModifiers(building: Building, workType: string): Modifier[] {
    const modifiers: Modifier[] = [];
    
    if (building.productionBonus) {
      const workBonus = building.productionBonus[workType];
      if (workBonus) {
        modifiers.push({
          id: `${building.id}_${workType}_production`,
          source: { type: 'building', id: building.id, name: building.name },
          target: { type: 'work_efficiency', subtype: workType },
          type: 'building_bonus',
          value: workBonus,
          operation: 'multiply',
          priority: 80
        });
      }
    }
    
    return modifiers;
  }
}
```

### Research Bonus Integration

```typescript
/**
 * Research bonus calculation stage
 */
class ResearchBonusStage implements CalculationStage<BuildingBonusResult, ResearchBonusResult> {
  async execute(input: BuildingBonusResult, context: CalculationContext): Promise<ResearchBonusResult> {
    const modifiers: Modifier[] = [];
    
    // Check completed research for relevant bonuses
    for (const researchId of context.gameState.completedResearch) {
      const research = context.services.researchService.getResearchById(researchId);
      if (research?.effects) {
        const researchModifiers = this.convertResearchEffectsToModifiers(research, context.input.workType);
        modifiers.push(...researchModifiers);
      }
    }
    
    return {
      ...input,
      researchModifiers: modifiers,
      researchBonus: this.aggregateModifiers(modifiers)
    };
  }
}
```

## Caching Strategy

### Multi-Level Caching Architecture

```typescript
/**
 * Hierarchical caching system for calculations
 */
interface CalculationCacheManager {
  // L1 Cache: Immediate results (in-memory, fast access)
  l1Cache: Map<string, CacheEntry>;
  
  // L2 Cache: Intermediate calculations (persisted, medium access)
  l2Cache: Map<string, CacheEntry>;
  
  // L3 Cache: Base data lookups (database/file, slow access)
  l3Cache: Map<string, CacheEntry>;
  
  // Cache operations
  get<T>(key: string, level?: CacheLevel): Promise<T | null>;
  set<T>(key: string, value: T, ttl: number, level?: CacheLevel): Promise<void>;
  invalidate(key: string, level?: CacheLevel): Promise<void>;
  invalidatePattern(pattern: string): Promise<void>;
  
  // Cache statistics
  getStatistics(): CacheStatistics;
  clearStatistics(): void;
}

/**
 * Cache entry with metadata
 */
interface CacheEntry {
  value: any;
  timestamp: number;
  ttl: number;
  accessCount: number;
  lastAccessed: number;
  dependencies: string[];
}

/**
 * Cache invalidation strategies
 */
interface CacheInvalidationStrategy {
  // Time-based invalidation
  timeBasedInvalidation: {
    enabled: boolean;
    defaultTtl: number;
    maxTtl: number;
  };
  
  // Dependency-based invalidation
  dependencyInvalidation: {
    enabled: boolean;
    dependencyGraph: Map<string, string[]>;
  };
  
  // Event-based invalidation
  eventBasedInvalidation: {
    enabled: boolean;
    eventTriggers: Map<string, string[]>; // event -> cache keys to invalidate
  };
}
```

### Cache Key Generation

```typescript
/**
 * Standardized cache key generation
 */
class CacheKeyGenerator {
  // Work efficiency cache keys
  static workEfficiency(pawnId: string, workType: string, locationId?: string): string {
    return `work_efficiency:${pawnId}:${workType}:${locationId || 'global'}`;
  }
  
  // Modifier aggregation cache keys
  static modifierSet(sourceType: string, sourceId: string, targetType: string): string {
    return `modifiers:${sourceType}:${sourceId}:${targetType}`;
  }
  
  // Building effects cache keys
  static buildingEffects(buildingId: string, locationId?: string): string {
    return `building_effects:${buildingId}:${locationId || 'global'}`;
  }
  
  // Pawn stat cache keys
  static pawnStats(pawnId: string): string {
    return `pawn_stats:${pawnId}`;
  }
  
  // Research bonus cache keys
  static researchBonuses(researchIds: string[], targetType: string): string {
    const sortedIds = researchIds.sort().join(',');
    return `research_bonuses:${sortedIds}:${targetType}`;
  }
}
```

## Performance Optimization

### Calculation Batching

```typescript
/**
 * Batch calculation system for performance
 */
interface BatchCalculationManager {
  // Batch work efficiency calculations for all pawns
  batchWorkEfficiencyCalculations(
    requests: WorkEfficiencyRequest[]
  ): Promise<Map<string, EfficiencyResult>>;
  
  // Batch resource production calculations
  batchResourceProductionCalculations(
    workAssignments: WorkAssignment[]
  ): Promise<Map<string, ResourceProductionResult>>;
  
  // Batch modifier aggregations
  batchModifierAggregations(
    requests: ModifierAggregationRequest[]
  ): Promise<Map<string, ModifierSet>>;
}

/**
 * Calculation request queuing
 */
interface CalculationQueue {
  // Add calculation request to queue
  enqueue(request: CalculationRequest): Promise<string>; // returns request ID
  
  // Process queued calculations in batches
  processBatch(batchSize: number): Promise<CalculationBatchResult>;
  
  // Get calculation result
  getResult(requestId: string): Promise<any>;
  
  // Queue statistics
  getQueueStatistics(): QueueStatistics;
}
```

### Lazy Calculation Strategy

```typescript
/**
 * Lazy calculation for expensive operations
 */
interface LazyCalculationManager {
  // Register lazy calculation
  registerLazyCalculation<T>(
    key: string,
    calculator: () => Promise<T>,
    dependencies: string[]
  ): void;
  
  // Get lazy calculation result (calculates if needed)
  getLazyResult<T>(key: string): Promise<T>;
  
  // Invalidate lazy calculations
  invalidateLazyCalculation(key: string): void;
  invalidateLazyCalculationsByDependency(dependency: string): void;
}
```

## Implementation Plan

### Phase 1: Core Infrastructure (Week 1)
1. **Create UnifiedCalculationEngine interface and basic implementation**
   - Define core calculation methods
   - Implement basic modifier system
   - Create calculation pipeline framework

2. **Implement Modifier System**
   - Create Modifier interfaces and types
   - Implement modifier aggregation rules
   - Create modifier source detection

3. **Basic Caching Implementation**
   - Implement L1 cache (in-memory)
   - Create cache key generation system
   - Basic cache invalidation

### Phase 2: Work Efficiency Integration (Week 1-2)
1. **Migrate Work Efficiency Calculations**
   - Replace scattered work efficiency calculations
   - Implement work efficiency calculation pipeline
   - Integrate with existing WorkService

2. **Equipment and Building Bonus Integration**
   - Migrate equipment bonus calculations
   - Integrate building production bonuses
   - Implement location-based modifiers

3. **Testing and Validation**
   - Unit tests for calculation pipelines
   - Integration tests with existing systems
   - Performance benchmarking

### Phase 3: Advanced Features (Week 2)
1. **Advanced Caching**
   - Implement L2 and L3 cache levels
   - Dependency-based cache invalidation
   - Cache performance optimization

2. **Batch Calculations**
   - Implement batch calculation manager
   - Optimize for turn processing
   - Queue management for expensive calculations

3. **Research and Event Integration**
   - Migrate research bonus calculations
   - Integrate temporary effect modifiers
   - Event-based calculation triggers

## Success Criteria

### Performance Metrics
- **Calculation Speed**: 90% of calculations complete in <10ms
- **Cache Hit Rate**: >80% cache hit rate for repeated calculations
- **Memory Usage**: <50MB additional memory for caching system
- **Turn Processing**: No increase in turn processing time

### Accuracy Metrics
- **Consistency**: 100% consistent results across all calculation contexts
- **Correctness**: All existing calculation results maintained
- **Coverage**: 100% of modifier sources integrated into unified system

### Integration Metrics
- **Service Integration**: All services use unified calculation system
- **Code Reduction**: 50% reduction in scattered calculation code
- **Maintainability**: Single location for all calculation logic modifications

## Migration Strategy

### Backward Compatibility
- Maintain existing calculation method signatures during transition
- Implement adapter pattern for legacy calculation calls
- Gradual migration with feature flags for rollback capability

### Testing Strategy
- Comprehensive unit tests for each calculation pipeline stage
- Integration tests comparing old vs new calculation results
- Performance regression tests
- Load testing with realistic game state sizes

### Rollback Plan
- Feature flags to disable unified calculations
- Fallback to original calculation methods
- Data migration rollback procedures
- Performance monitoring and alerting