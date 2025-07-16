# GameEngine ↔ Work ↔ Buildings Integration Guide

This document outlines how to establish clean integration between GameEngine, WorkService, and BuildingService following the architecture refactoring principles.

## Overview

The integration ensures that:
- **Buildings boost work efficiency** (smelting furnace improves metalworking)
- **Buildings enable advanced work** (alchemy lab required for alchemy work)
- **Building bonuses stack** (multiple workshops provide cumulative bonuses)
- **GameEngine coordinates** complex building-work interactions

## Integration Flow

```
GameEngine → WorkService → BuildingService (for bonuses)
GameEngine → BuildingService (for direct building queries)
WorkService → BuildingService (for work-related building effects)
```

## 1. Add Building Effects to Work Calculations

Update `WorkService` to consider building bonuses when calculating work efficiency:

```typescript
// filepath: /Users/kirillboychenko/Documents/Coding_Projects/commercial_projects/video_games/Fantasia4x/src/lib/game/services/WorkService.ts
// Add this import at the top
import { buildingService } from './BuildingService';

// ...existing code...

// Update calculateWorkEfficiency method to include building bonuses
calculateWorkEfficiency(
    pawn: Pawn,
    workCategory: WorkCategory,
    location?: Location,
    gameState?: GameState
): number {
    // Existing efficiency calculation
    let efficiency = workCategory.baseEfficiency;
    const primaryStatValue = pawn.stats[workCategory.primaryStat] || 10;
    efficiency *= primaryStatValue / 10;

    if (workCategory.secondaryStat) {
        const secondaryStatValue = pawn.stats[workCategory.secondaryStat] || 10;
        efficiency *= 1 + (secondaryStatValue - 10) / 50;
    }

    // Location work modifiers
    if (location?.workModifiers && location.workModifiers[workCategory.id]) {
        efficiency *= location.workModifiers[workCategory.id];
    }

    // ADD: Building production bonuses
    if (gameState) {
        const buildingBonus = this.calculateBuildingWorkBonus(workCategory.id, gameState);
        efficiency *= buildingBonus;
        console.log(`[WorkService] Building bonus for ${workCategory.id}: ${buildingBonus}`);
    }

    return Math.max(0.1, efficiency);
}

// ADD: New method to calculate building bonuses for work
private calculateBuildingWorkBonus(workType: string, gameState: GameState): number {
    let totalBonus = 1.0;

    // Check each building type for work bonuses
    Object.entries(gameState.buildingCounts).forEach(([buildingId, count]) => {
        if (count > 0) {
            const building = buildingService.getBuildingById(buildingId);
            if (building?.productionBonus) {
                // Check for direct work type bonuses
                if (building.productionBonus[workType]) {
                    totalBonus += (building.productionBonus[workType] - 1.0) * count;
                    console.log(`[WorkService] ${buildingId} provides ${building.productionBonus[workType]} bonus to ${workType}`);
                }

                // Check for related bonuses (e.g., crafting buildings help tool-making work)
                const relatedBonuses = this.getRelatedWorkBonuses(workType, building.productionBonus);
                relatedBonuses.forEach(bonus => {
                    totalBonus += (bonus - 1.0) * count * 0.5; // Half bonus for related work
                });
            }
        }
    });

    return totalBonus;
}

// ADD: Helper method to find related work bonuses
private getRelatedWorkBonuses(workType: string, productionBonus: Record<string, number>): number[] {
    const bonuses: number[] = [];
    
    // Define work type relationships
    const workRelations: Record<string, string[]> = {
        'crafting': ['crafting_tools', 'woodworking_tools', 'basic_weapons'],
        'metalworking': ['copper_ingot', 'bronze_ingot', 'iron_weapons', 'bronze_weapons'],
        'woodcutting': ['woodworking_tools'],
        'mining': ['refined_metals', 'copper_ingot'],
        'foraging': ['food_gathering', 'wild_berries'],
        'hunting': ['meat_processing', 'hide_processing'],
        'fishing': ['fish']
    };

    const relatedKeys = workRelations[workType] || [];
    relatedKeys.forEach(key => {
        if (productionBonus[key]) {
            bonuses.push(productionBonus[key]);
        }
    });

    return bonuses;
}
```

## 2. Add Building Requirements to Work Categories

Update work categories to consider building requirements:

```typescript
// filepath: /Users/kirillboychenko/Documents/Coding_Projects/commercial_projects/video_games/Fantasia4x/src/lib/game/services/WorkService.ts
// Update getAvailableWork method to consider buildings
getAvailableWork(gameState: GameState, locationId?: string): WorkCategory[] {
    return WORK_CATEGORIES.filter((work) => {
        // Existing tool check
        const hasTools =
            !work.toolsRequired ||
            work.toolsRequired.some((toolType) => {
                return gameState.item.some(
                    (item) => item.type === 'tool' && item.category === toolType && item.amount > 0
                );
            });

        // NEW: Check building requirements for advanced work
        const hasBuildingRequirements = this.checkBuildingRequirements(work, gameState);

        return hasTools && hasBuildingRequirements;
    });
}

// ADD: Check if required buildings exist for advanced work
private checkBuildingRequirements(workCategory: WorkCategory, gameState: GameState): boolean {
    // Define building requirements for certain work types
    const buildingRequirements: Record<string, string[]> = {
        'metalworking': ['smelting_furnace', 'bronze_foundry', 'iron_forge'], // Any of these
        'alchemy': ['alchemist_lab'], // Specific requirement
        'research': ['scroll_hut', 'study_hall', 'scholars_workshop'], // Any research building
        'cooking': ['kitchen'], // Specific for advanced cooking
        'baking': ['bakery'] // Specific for bread making
    };

    const requiredBuildings = buildingRequirements[workCategory.id];
    if (!requiredBuildings) {
        return true; // No building requirement
    }

    // Check if any of the required buildings exist
    return requiredBuildings.some(buildingId => {
        const count = gameState.buildingCounts[buildingId] || 0;
        return count > 0;
    });
}
```

## 3. Add GameEngine Coordination Methods

Add methods to GameEngine for building-work coordination:

```typescript
// filepath: /Users/kirillboychenko/Documents/Coding_Projects/commercial_projects/video_games/Fantasia4x/src/lib/game/systems/GameEngineImpl.ts
// Add these methods to the GameEngineImpl class

/**
 * GameEngine coordination method - gets building bonuses for work type
 * Coordinates between WorkService and BuildingService
 */
getBuildingBonusesForWork(workType: string): Record<string, number> {
    if (!this.gameState) return {};

    console.log(`[GameEngine] Getting building bonuses for work type: ${workType}`);
    
    const bonuses: Record<string, number> = {};
    
    // Check each building for work-related bonuses
    Object.entries(this.gameState.buildingCounts).forEach(([buildingId, count]) => {
        if (count > 0) {
            const building = buildingService.getBuildingById(buildingId);
            if (building?.productionBonus) {
                // Direct work bonuses
                if (building.productionBonus[workType]) {
                    bonuses[buildingId] = building.productionBonus[workType] * count;
                }
                
                // Resource production bonuses that affect work
                Object.entries(building.productionBonus).forEach(([resource, bonus]) => {
                    // Check if this resource is produced by this work type
                    const resourcesForWork = this.getLocationResourcesForWorkType('', workType);
                    if (resourcesForWork.includes(resource)) {
                        bonuses[`${buildingId}_${resource}`] = bonus * count;
                    }
                });
            }
        }
    });

    console.log(`[GameEngine] Building bonuses for ${workType}:`, bonuses);
    return bonuses;
}

/**
 * GameEngine coordination method - checks if buildings enable work type
 */
canPerformWorkWithBuildings(workType: string): boolean {
    if (!this.gameState) return false;

    // Get available work categories (which includes building checks)
    const availableWork = workService.getAvailableWork(this.gameState);
    return availableWork.some(work => work.id === workType);
}
```

## 4. Add Required Import

Make sure BuildingService is imported in WorkService:

```typescript
// filepath: /Users/kirillboychenko/Documents/Coding_Projects/commercial_projects/video_games/Fantasia4x/src/lib/game/services/WorkService.ts
// Add this import at the top with other imports
import { buildingService } from './BuildingService';
```

## 5. Add BuildingService Import to GameEngine

```typescript
// filepath: /Users/kirillboychenko/Documents/Coding_Projects/commercial_projects/video_games/Fantasia4x/src/lib/game/systems/GameEngineImpl.ts
// Add this import at the top with other imports
import { buildingService } from '../services/BuildingService';
```

## 6. Ensure Correct Processing Order

The current `processGameTurn()` method already processes systems in the correct order:

```typescript
// Process all systems in correct order
this.processResources();           // Work harvesting (uses building bonuses)
this.processBuildings();          // Building construction
this.processCrafting();           // Item crafting (may use building bonuses)
this.processResearch();           // Research (may use building bonuses)
this.processLocationRenewal();    // Location renewal
```

## Example Building-Work Relationships

### Direct Work Bonuses
- **Smelting Furnace**: +50% metalworking efficiency
- **Workshop**: +25% crafting efficiency
- **Study Hall**: +30% research efficiency

### Building Requirements
- **Alchemy**: Requires Alchemist Lab
- **Advanced Metalworking**: Requires Smelting Furnace
- **Scholarly Research**: Requires Study Hall or Scholars Workshop

### Resource Production Bonuses
- **Granary**: +20% food storage, affects foraging efficiency
- **Lumber Mill**: +30% wood processing, affects woodcutting
- **Mine Shaft**: +40% ore extraction, affects mining

## Architecture Benefits

This integration maintains clean architecture by:

✅ **Unidirectional Dependencies**: WorkService → BuildingService (no circular imports)
✅ **Service Layer Coordination**: GameEngine coordinates complex interactions
✅ **Separation of Concerns**: Each service handles its domain
✅ **Extensible Design**: Easy to add new building-work relationships

The pattern follows your architecture refactoring goals while providing rich gameplay mechanics through