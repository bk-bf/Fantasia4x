import type { ResearchProject, LoreItem, RaceStats, GameState } from '../core/types';
import { consumeFromStockpiles } from '../core/GameState';
import researchData from '../database/research.jsonc';
import loreData from '../database/lore.jsonc';
import { perTick } from '../core/time';

const RESEARCH_DATABASE = researchData as unknown as ResearchProject[];
const LORE_DATABASE = loreData as unknown as LoreItem[];

/**
 * ResearchService - Clean interface for research progression and management
 * Separates business logic from data definitions
 */
export interface ResearchService {
	// Query Methods
	getResearchById(id: string): ResearchProject | undefined;
	getAllResearch(): ResearchProject[];
	getResearchByCategory(category: string): ResearchProject[];
	getResearchByTier(tier: number): ResearchProject[];
	getAvailableResearch(gameState: GameState): ResearchProject[];

	// Validation Methods
	canStartResearch(researchId: string, gameState: GameState): boolean;
	hasPrerequisites(researchId: string, gameState: GameState): boolean;
	hasRequiredScrolls(researchId: string, gameState: GameState): boolean;
	hasRequiredMaterials(researchId: string, gameState: GameState): boolean;
	hasRequiredBuilding(researchId: string, gameState: GameState): boolean;
	hasRequiredPopulation(researchId: string, gameState: GameState): boolean;

	// Lore System Methods
	canUnlockWithLore(researchId: string, gameState: GameState): boolean;
	getLoreItem(id: string): LoreItem | undefined;
	getAllLore(): LoreItem[];
	getApplicableLore(researchId: string): LoreItem[];

	// Calculation Methods
	calculateResearchProgress(
		researchId: string,
		gameState: GameState
	): {
		canStart: boolean;
		scrollsNeeded: Record<string, number>;
		materialsNeeded: Record<string, number>;
	};
	calculateResearchTime(researchId: string, gameState: GameState): number;

	// Research Management
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

	// Research Processing
	startResearch(researchId: string, gameState: GameState): GameState;
	completeResearch(researchId: string, gameState: GameState): GameState;
	processCurrentResearch(gameState: GameState): GameState;
	/** Continuous research accrual for one tick (+perTick(1) of researchTime). */
	processResearchTick(gameState: GameState): GameState;
}

/**
 * ResearchService Implementation
 */
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
			// Already completed
			if (gameState.completedResearch.includes(research.id)) return false;

			// Check if can start
			return this.canStartResearch(research.id, gameState);
		});
	}

	canStartResearch(researchId: string, gameState: GameState): boolean {
		const research = this.getResearchById(researchId);
		if (!research) return false;

		// Check all requirements
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
			const available = (gameState.stockpile ?? {})[scrollId] ?? 0;
			return available >= amount;
		});
	}

	hasRequiredMaterials(researchId: string, gameState: GameState): boolean {
		const research = this.getResearchById(researchId);
		if (!research?.materialRequirement) return true;

		return Object.entries(research.materialRequirement).every(([materialId, amount]) => {
			const available = (gameState.stockpile ?? {})[materialId] ?? 0;
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

	canUnlockWithLore(researchId: string, gameState: GameState): boolean {
		const research = this.getResearchById(researchId);
		if (!research?.canBypassWithLore) return false;

		return gameState.discoveredLore.some((lore) => lore.researchUnlocks.includes(researchId));
	}

	getLoreItem(id: string): LoreItem | undefined {
		return LORE_DATABASE.find((lore) => lore.id === id);
	}

	getAllLore(): LoreItem[] {
		return [...LORE_DATABASE];
	}

	getApplicableLore(researchId: string): LoreItem[] {
		return LORE_DATABASE.filter((lore) => lore.researchUnlocks.includes(researchId));
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

		// Check scroll requirements
		if (research.scrollRequirement) {
			Object.entries(research.scrollRequirement).forEach(([scrollId, required]) => {
				const available = (gameState.stockpile ?? {})[scrollId] ?? 0;
				if (available < required) {
					scrollsNeeded[scrollId] = required - available;
					canStart = false;
				}
			});
		}

		// Check material requirements
		if (research.materialRequirement) {
			Object.entries(research.materialRequirement).forEach(([materialId, required]) => {
				const available = (gameState.stockpile ?? {})[materialId] ?? 0;
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

		// Apply research speed bonuses from buildings
		const researchBuildings = ['scroll_hut', 'learning_hall', 'scholars_workshop'];
		let speedBonus = 1.0;

		researchBuildings.forEach((buildingId) => {
			const count = gameState.buildingCounts[buildingId] || 0;
			if (count > 0) {
				// Each research building provides speed bonus
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
		const newState = Object.keys(consumables).length > 0
			? consumeFromStockpiles({ ...gameState }, consumables)
			: { ...gameState };

		// Set current research
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

		// Add to completed research
		if (!newState.completedResearch.includes(researchId)) {
			newState.completedResearch.push(researchId);
		}

		// Apply unlocks
		const unlocks = this.getResearchUnlocks(researchId);

		// Update tool tier
		if (unlocks.toolTier > newState.currentToolLevel) {
			newState.currentToolLevel = unlocks.toolTier;
		}

		// Add unlocked items to available research
		if (unlocks.items.length > 0) {
			newState.availableResearch = [
				...newState.availableResearch,
				...unlocks.items.filter((item) => !newState.availableResearch.includes(item))
			];
		}

		// Clear current research
		newState.currentResearch = undefined;

		return newState;
	}

	processCurrentResearch(gameState: GameState): GameState {
		console.log('[ResearchService] Processing current research');

		// Process current research - scroll-based progression
		// PER-TURN RATE (+1/turn). Accrual now happens smoothly each tick via
		// processResearchTick(); this whole-step variant is kept for any caller that
		// still wants to advance a full turn at once.
		if (gameState.currentResearch) {
			const updatedCurrentResearch = {
				...gameState.currentResearch,
				currentProgress: (gameState.currentResearch.currentProgress || 0) + 1
			};

			if (updatedCurrentResearch.currentProgress >= updatedCurrentResearch.researchTime) {
				// Research completed - use the completeResearch method
				console.log('[ResearchService] Research completed:', updatedCurrentResearch.id);
				return this.completeResearch(updatedCurrentResearch.id, gameState);
			} else {
				// Research still in progress
				return {
					...gameState,
					currentResearch: updatedCurrentResearch
				};
			}
		}

		return gameState;
	}

	/**
	 * Continuous research accrual for ONE simulation tick (60 Hz): adds
	 * perTick(1) of scroll progress and completes mid-stream once the
	 * threshold is reached. Over a full turn this nets +1 progress — identical
	 * pacing to the legacy per-turn step, just smooth (and save-safe: currentProgress
	 * is already a plain number).
	 */
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

// Export singleton instance
export const researchService = new ResearchServiceImpl();
