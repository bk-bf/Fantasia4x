// src/lib/game/core/GameState.ts
import type { GameState, ResearchProject, Building, Item } from './types';
import { getItemInfo } from './Items';
import { calculateHarvestAmount, getResourceFromWorkType } from './Work';

export class GameStateManager {
  private state: GameState;

  constructor(initialState: GameState) {
    this.state = initialState;
  }

  getState(): GameState {
    return { ...this.state };
  }

  updateState(updates: Partial<GameState>): void {
    this.state = { ...this.state, ...updates };
  }

  advanceTurn(): void {
    this.state.turn += 1;
    this.processResources();
    this.processBuildings();
    this.processCrafting();
    this.processResearch();
    this.processWorkHarvesting(); // Now properly integrated
  }

  private processResources(): void {
    // Basic resource generation logic using items array
    const foodProduction = this.state.race.population * 2;
    this.addToItemArray('food', foodProduction);
    
    // Add wood and stone production
    const woodProduction = 2 + (this.state._woodBonus || 0);
    const stoneProduction = 1 + (this.state._stoneBonus || 0);
    
    this.addToItemArray('wood', woodProduction);
    this.addToItemArray('stone', stoneProduction);
  }

  private processBuildings(): void {
    // Process building queue - buildings under construction
    if (this.state.buildingQueue.length > 0) {
      this.state.buildingQueue = this.state.buildingQueue.map(building => ({
        ...building,
        turnsRemaining: building.turnsRemaining - 1
      })).filter(building => {
        if (building.turnsRemaining <= 0) {
          // Building completed - add to building counts
          this.state.buildingCounts[building.building.id] = 
            (this.state.buildingCounts[building.building.id] || 0) + 1;
          return false;
        }
        return true;
      });
    }
  }

  private processCrafting(): void {
    // Process crafting queue - items being crafted
    if (this.state.craftingQueue.length > 0) {
      this.state.craftingQueue = this.state.craftingQueue.map(crafting => ({
        ...crafting,
        turnsRemaining: crafting.turnsRemaining - 1
      })).filter(crafting => {
        if (crafting.turnsRemaining <= 0) {
          // Crafting completed - add to items array (not inventory)
          const itemId = crafting.item.id;
          const quantity = crafting.quantity || 1;
          this.addToItemArray(itemId, quantity);
          return false;
        }
        return true;
      });
    }
  }

  private processResearch(): void {
    // Process current research - scroll-based progression
    if (this.state.currentResearch) {
      this.state.currentResearch.currentProgress = 
        (this.state.currentResearch.currentProgress || 0) + 1;
      
      if (this.state.currentResearch.currentProgress >= this.state.currentResearch.researchTime) {
        // Research completed
        this.state.completedResearch.push(this.state.currentResearch.id);
        
        // Apply research unlocks
        if (this.state.currentResearch.unlocks.toolTierRequired) {
          this.state.currentToolLevel = Math.max(
            this.state.currentToolLevel,
            this.state.currentResearch.unlocks.toolTierRequired
          );
        }
        
        // Clear current research
        this.state.currentResearch = undefined;
      }
    }
  }

  // NEW: Work harvesting system integration
  private processWorkHarvesting(): void {
    if (!this.state.pawns || this.state.pawns.length === 0) return;

    const harvestedResources: Record<string, number> = {};

    // Process each pawn's work assignments
    this.state.pawns.forEach(pawn => {
      const workAssignment = this.state.workAssignments[pawn.id];
      if (!workAssignment) return;

      // Find the highest priority work for this pawn
      const sortedWork = Object.entries(workAssignment.workPriorities)
        .filter(([_, priority]) => priority > 0)
        .sort(([_, a], [__, b]) => b - a);

      if (sortedWork.length === 0) return;

      const [topWorkType, priority] = sortedWork[0];

      // Calculate harvesting based on priority and pawn stats
      const harvestAmount = calculateHarvestAmount(pawn, topWorkType, priority, this.state);

      if (harvestAmount > 0) {
        const resourceType = getResourceFromWorkType(topWorkType);
        if (resourceType) {
          harvestedResources[resourceType] = (harvestedResources[resourceType] || 0) + harvestAmount;
        }
      }
    });

    // Apply harvested resources to items array
    Object.entries(harvestedResources).forEach(([resourceId, amount]) => {
      this.addToItemArray(resourceId, amount);
    });
  }

  // UPDATED: Use items array instead of separate resource tracking
  private addToItemArray(itemId: string, amount: number): void {
    const itemIndex = this.state.item.findIndex(item => item.id === itemId);
    if (itemIndex !== -1) {
      // Update existing item immutably
      this.state.item[itemIndex] = {
        ...this.state.item[itemIndex],
        amount: this.state.item[itemIndex].amount + amount
      };
    } else {
      // Add new item if it doesn't exist
      const itemInfo = getItemInfo(itemId);
      if (itemInfo) {
        this.state.item.push({ ...itemInfo, amount });
      }
    }
  }

  // DEPRECATED: Remove inventory methods
  // addToInventory and removeFromInventory are no longer needed

  // UPDATED: Use items array for resource management
  addResource(resourceId: string, amount: number): void {
    this.addToItemArray(resourceId, amount);
  }

  // NEW: Get item amount from items array
  getItemAmount(itemId: string): number {
    const item = this.state.item.find(i => i.id === itemId);
    return item ? item.amount : 0;
  }

  // NEW: Remove item amount from items array
  removeItemAmount(itemId: string, amount: number): boolean {
    const itemIndex = this.state.item.findIndex(item => item.id === itemId);
    if (itemIndex !== -1 && this.state.item[itemIndex].amount >= amount) {
      this.state.item[itemIndex] = {
        ...this.state.item[itemIndex],
        amount: this.state.item[itemIndex].amount - amount
      };
      return true;
    }
    return false;
  }

  startResearch(research: ResearchProject): boolean {
    // Check if research can be started
    if (this.state.currentResearch) {
      return false; // Already researching something
    }
    
    // Set current research
    this.state.currentResearch = {
      ...research,
      currentProgress: 0
    };
    
    return true;
  }

  startBuilding(building: Building): boolean {
    // Add building to construction queue
    this.state.buildingQueue.push({
      building,
      turnsRemaining: building.buildTime,
      startedAt: this.state.turn
    });
    
    return true;
  }

  startCrafting(item: Item, quantity: number = 1): boolean {
    // Add item to crafting queue
    this.state.craftingQueue.push({
      item,
      quantity,
      turnsRemaining: item.craftingTime || 1,
      startedAt: this.state.turn
    });
    
    return true;
  }
}
