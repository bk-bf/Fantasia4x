import type { ResearchProject, EntityStats, GameState } from '../core/types';
import { consumeFromStockpiles, availableQuantityFromDrops } from '../core/state/stockpile';
import researchData from '../database/progression/research.jsonc';
import { perTick } from '../core/util/time';
import { gatedConsole as console } from '../core/util/log';

const RESEARCH_DATABASE = researchData as unknown as ResearchProject[];

export interface ResearchService {
  getResearchById(id: string): ResearchProject | undefined;
  getAllResearch(): ResearchProject[];
  getResearchByCategory(category: string): ResearchProject[];
  getResearchByTier(tier: number): ResearchProject[];
  getAvailableResearch(gameState: GameState): ResearchProject[];

  canStartResearch(researchId: string, gameState: GameState): boolean;
  hasPrerequisites(researchId: string, gameState: GameState): boolean;
  hasRequiredScrolls(researchId: string, gameState: GameState): boolean;
  hasRequiredMaterials(researchId: string, gameState: GameState): boolean;
  hasRequiredBuilding(researchId: string, gameState: GameState): boolean;
  hasRequiredPopulation(researchId: string, gameState: GameState): boolean;

  calculateResearchProgress(
    researchId: string,
    gameState: GameState
  ): {
    canStart: boolean;
    scrollsNeeded: Record<string, number>;
    materialsNeeded: Record<string, number>;
  };
  calculateResearchTime(researchId: string, gameState: GameState): number;

  getResearchRequirements(researchId: string): {
    scrolls: Record<string, number>;
    materials: Record<string, number>;
    buildings: string[];
    population: number;
    prerequisites: string[];
  };
  getResearchUnlocks(researchId: string): {
    buildings: string[];
    items: string[];
    abilities: string[];
    effects: Record<string, number>;
    toolTier: number;
  };

  startResearch(researchId: string, gameState: GameState): GameState;
  completeResearch(researchId: string, gameState: GameState): GameState;
  processCurrentResearch(gameState: GameState): GameState;
  processResearchTick(gameState: GameState): GameState;
}

export class ResearchServiceImpl implements ResearchService {
  getResearchById(id: string): ResearchProject | undefined {
    return RESEARCH_DATABASE.find((research) => research.id === id);
  }

  getAllResearch(): ResearchProject[] {
    return [...RESEARCH_DATABASE];
  }

  getResearchByCategory(category: string): ResearchProject[] {
    return RESEARCH_DATABASE.filter((research) => research.category === category);
  }

  getResearchByTier(tier: number): ResearchProject[] {
    return RESEARCH_DATABASE.filter((research) => research.tier === tier);
  }

  getAvailableResearch(gameState: GameState): ResearchProject[] {
    return RESEARCH_DATABASE.filter((research) => {
      if (gameState.completedResearch.includes(research.id)) return false;

      return this.canStartResearch(research.id, gameState);
    });
  }

  canStartResearch(researchId: string, gameState: GameState): boolean {
    const research = this.getResearchById(researchId);
    if (!research) return false;

    return (
      this.hasPrerequisites(researchId, gameState) &&
      this.hasRequiredScrolls(researchId, gameState) &&
      this.hasRequiredMaterials(researchId, gameState) &&
      this.hasRequiredBuilding(researchId, gameState) &&
      this.hasRequiredPopulation(researchId, gameState)
    );
  }

  hasPrerequisites(researchId: string, gameState: GameState): boolean {
    const research = this.getResearchById(researchId);
    if (!research) return false;

    return research.prerequisites.every((prereq) => gameState.completedResearch.includes(prereq));
  }

  hasRequiredScrolls(researchId: string, gameState: GameState): boolean {
    const research = this.getResearchById(researchId);
    if (!research?.scrollRequirement) return true;

    return Object.entries(research.scrollRequirement).every(([scrollId, amount]) => {
      const available = availableQuantityFromDrops(gameState.droppedItems, scrollId);
      return available >= amount;
    });
  }

  hasRequiredMaterials(researchId: string, gameState: GameState): boolean {
    const research = this.getResearchById(researchId);
    if (!research?.materialRequirement) return true;

    return Object.entries(research.materialRequirement).every(([materialId, amount]) => {
      const available = availableQuantityFromDrops(gameState.droppedItems, materialId);
      return available >= amount;
    });
  }

  hasRequiredBuilding(researchId: string, gameState: GameState): boolean {
    const research = this.getResearchById(researchId);
    if (!research?.buildingRequired) return true;

    return (gameState.buildingCounts[research.buildingRequired] || 0) > 0;
  }

  hasRequiredPopulation(researchId: string, gameState: GameState): boolean {
    const research = this.getResearchById(researchId);
    if (!research?.populationRequired) return true;

    return gameState.pawns.length >= research.populationRequired;
  }

  calculateResearchProgress(
    researchId: string,
    gameState: GameState
  ): {
    canStart: boolean;
    scrollsNeeded: Record<string, number>;
    materialsNeeded: Record<string, number>;
  } {
    const research = this.getResearchById(researchId);
    if (!research) return { canStart: false, scrollsNeeded: {}, materialsNeeded: {} };

    const scrollsNeeded: Record<string, number> = {};
    const materialsNeeded: Record<string, number> = {};
    let canStart = true;

    if (research.scrollRequirement) {
      Object.entries(research.scrollRequirement).forEach(([scrollId, required]) => {
        const available = availableQuantityFromDrops(gameState.droppedItems, scrollId);
        if (available < required) {
          scrollsNeeded[scrollId] = required - available;
          canStart = false;
        }
      });
    }

    if (research.materialRequirement) {
      Object.entries(research.materialRequirement).forEach(([materialId, required]) => {
        const available = availableQuantityFromDrops(gameState.droppedItems, materialId);
        if (available < required) {
          materialsNeeded[materialId] = required - available;
          canStart = false;
        }
      });
    }

    return {
      canStart,
      scrollsNeeded,
      materialsNeeded
    };
  }

  calculateResearchTime(researchId: string, gameState: GameState): number {
    const research = this.getResearchById(researchId);
    if (!research) return 0;

    let time = research.researchTime;

    const researchBuildings = ['scroll_hut', 'learning_hall', 'scholars_workshop'];
    let speedBonus = 1.0;

    researchBuildings.forEach((buildingId) => {
      const count = gameState.buildingCounts[buildingId] || 0;
      if (count > 0) {
        switch (buildingId) {
          case 'scroll_hut':
            speedBonus *= 1.2;
            break;
          case 'learning_hall':
            speedBonus *= 1.5;
            break;
          case 'scholars_workshop':
            speedBonus *= 2.0;
            break;
        }
      }
    });

    time = Math.round(time / speedBonus);
    return Math.max(1, time);
  }

  getResearchRequirements(researchId: string): {
    scrolls: Record<string, number>;
    materials: Record<string, number>;
    buildings: string[];
    population: number;
    prerequisites: string[];
  } {
    const research = this.getResearchById(researchId);
    if (!research)
      return {
        scrolls: {},
        materials: {},
        buildings: [],
        population: 0,
        prerequisites: []
      };

    return {
      scrolls: research.scrollRequirement || {},
      materials: research.materialRequirement || {},
      buildings: research.buildingRequired ? [research.buildingRequired] : [],
      population: research.populationRequired || 0,
      prerequisites: research.prerequisites
    };
  }

  getResearchUnlocks(researchId: string): {
    buildings: string[];
    items: string[];
    abilities: string[];
    effects: Record<string, number>;
    toolTier: number;
  } {
    const research = this.getResearchById(researchId);
    if (!research)
      return {
        buildings: [],
        items: [],
        abilities: [],
        effects: {},
        toolTier: 0
      };

    return {
      buildings: research.unlocks.buildings || [],
      items: research.unlocks.items || [],
      abilities: research.unlocks.abilities || [],
      effects: research.unlocks.effects || {},
      toolTier: research.unlocks.toolTierRequired || 0
    };
  }

  startResearch(researchId: string, gameState: GameState): GameState {
    const research = this.getResearchById(researchId);
    if (!research || !this.canStartResearch(researchId, gameState)) {
      return gameState;
    }

    const consumables: Record<string, number> = {};
    if (research.scrollRequirement) {
      Object.entries(research.scrollRequirement).forEach(([scrollId, amount]) => {
        consumables[scrollId] = (consumables[scrollId] ?? 0) + amount;
      });
    }
    if (research.materialRequirement) {
      Object.entries(research.materialRequirement).forEach(([materialId, amount]) => {
        consumables[materialId] = (consumables[materialId] ?? 0) + amount;
      });
    }
    const newState =
      Object.keys(consumables).length > 0
        ? consumeFromStockpiles({ ...gameState }, consumables)
        : { ...gameState };

    newState.currentResearch = {
      ...research,
      currentProgress: 0
    };

    return newState;
  }

  completeResearch(researchId: string, gameState: GameState): GameState {
    const research = this.getResearchById(researchId);
    if (!research) return gameState;

    const newState = { ...gameState };

    if (!newState.completedResearch.includes(researchId)) {
      newState.completedResearch.push(researchId);
    }

    const unlocks = this.getResearchUnlocks(researchId);

    if (unlocks.toolTier > newState.currentToolLevel) {
      newState.currentToolLevel = unlocks.toolTier;
    }

    if (unlocks.items.length > 0) {
      newState.availableResearch = [
        ...newState.availableResearch,
        ...unlocks.items.filter((item) => !newState.availableResearch.includes(item))
      ];
    }

    newState.currentResearch = undefined;

    return newState;
  }

  processCurrentResearch(gameState: GameState): GameState {
    console.log('[ResearchService] Processing current research');

    if (gameState.currentResearch) {
      const updatedCurrentResearch = {
        ...gameState.currentResearch,
        currentProgress: (gameState.currentResearch.currentProgress || 0) + 1
      };

      if (updatedCurrentResearch.currentProgress >= updatedCurrentResearch.researchTime) {
        console.log('[ResearchService] Research completed:', updatedCurrentResearch.id);
        return this.completeResearch(updatedCurrentResearch.id, gameState);
      } else {
        return {
          ...gameState,
          currentResearch: updatedCurrentResearch
        };
      }
    }

    return gameState;
  }

  processResearchTick(gameState: GameState): GameState {
    if (!gameState.currentResearch) return gameState;

    const updated = {
      ...gameState.currentResearch,
      currentProgress: (gameState.currentResearch.currentProgress || 0) + perTick(1)
    };

    if (updated.currentProgress >= updated.researchTime) {
      console.log('[ResearchService] Research completed:', updated.id);
      return this.completeResearch(updated.id, gameState);
    }

    return { ...gameState, currentResearch: updated };
  }
}

export const researchService = new ResearchServiceImpl();
