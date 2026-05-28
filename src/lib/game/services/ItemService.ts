import type { Item, GameState } from '../core/types';
import itemsData from '../database/items.jsonc';
import { RARITY_COLORS } from '../database/colors';

const ITEMS_DATABASE = itemsData as unknown as Item[];

/**
 * ItemService - Clean interface for item queries and operations
 * Separates business logic from data definitions
 */
export interface ItemService {
	// Query Methods
	getItemById(id: string): Item | undefined;
	getItemsByType(type: string): Item[];
	getItemsByCategory(category: string): Item[];
	getCraftableItems(gameState: GameState, pawnId?: string): Item[];
	getItemsByWorkType(workType: string): Item[];

	// Validation Methods
	canCraftItem(itemId: string, gameState: GameState, pawnId?: string): boolean;
	hasRequiredMaterials(itemId: string, gameState: GameState): boolean;
	hasRequiredTools(itemId: string, gameState: GameState): boolean;
	hasRequiredBuilding(itemId: string, gameState: GameState): boolean;

	// Calculation Methods
	calculateCraftingTime(itemId: string, gameState: GameState, pawnId?: string): number;
	calculateCraftingCost(itemId: string): Record<string, number>;
	calculateItemEffects(itemId: string): Record<string, number>;

	// Display Methods
	getItemIcon(itemId: string): string;
	getItemColor(itemId: string): string;
	getItemRarityColor(rarity: string): string;

	// Inventory Methods
	getAvailableQuantity(itemId: string, gameState: GameState): number;
	consumeItems(itemIds: Record<string, number>, gameState: GameState): GameState;
	addItems(itemIds: Record<string, number>, gameState: GameState): GameState;

	// Crafting Queue Processing
	processCraftingQueue(gameState: GameState): GameState;
}

/**
 * ItemService Implementation
 */
export class ItemServiceImpl implements ItemService {
	getItemById(id: string): Item | undefined {
		return ITEMS_DATABASE.find((item) => item.id === id);
	}

	getItemsByType(type: string): Item[] {
		return ITEMS_DATABASE.filter((item) => item.type === type);
	}

	getItemsByCategory(category: string): Item[] {
		return ITEMS_DATABASE.filter((item) => item.category === category);
	}

	getItemsByWorkType(workType: string): Item[] {
		return ITEMS_DATABASE.filter((item) => item.workTypes && item.workTypes.includes(workType));
	}

	getCraftableItems(gameState: GameState, pawnId?: string): Item[] {
		return ITEMS_DATABASE.filter((item) => {
			// Must have crafting requirements
			if (!item.craftingCost) return false;

			// Check if can craft
			return this.canCraftItem(item.id, gameState, pawnId);
		});
	}

	canCraftItem(itemId: string, gameState: GameState, pawnId?: string): boolean {
		const item = this.getItemById(itemId);
		if (!item || !item.craftingCost) return false;

		// Check materials
		if (!this.hasRequiredMaterials(itemId, gameState)) return false;

		// Check tools
		if (!this.hasRequiredTools(itemId, gameState)) return false;

		// Check building
		if (!this.hasRequiredBuilding(itemId, gameState)) return false;

		// Check research
		if (item.researchRequired && !gameState.completedResearch.includes(item.researchRequired)) {
			return false;
		}

		// Check population
		if (item.populationRequired && gameState.pawns.length < item.populationRequired) {
			return false;
		}

		// Phase 6: stew items require a clay_cooking_pot in the colony
		if (item.workshopType === 'campfire' && item.id === 'stew') {
			const hasCookingPot = (gameState.item ?? []).some(
				(i) => i.id === 'clay_cooking_pot' && i.amount > 0
			) || ((gameState.stockpile ?? {})['clay_cooking_pot'] ?? 0) > 0;
			if (!hasCookingPot) return false;
		}

		return true;
	}

	hasRequiredMaterials(itemId: string, gameState: GameState): boolean {
		const item = this.getItemById(itemId);
		if (!item?.craftingCost) return true;

		return Object.entries(item.craftingCost).every(([materialId, required]) => {
			const available = this.getAvailableQuantity(materialId, gameState);
			return available >= required;
		});
	}

	hasRequiredTools(itemId: string, gameState: GameState): boolean {
		const item = this.getItemById(itemId);
		if (!item?.toolTierRequired) return true;

		return gameState.currentToolLevel >= item.toolTierRequired;
	}

	hasRequiredBuilding(itemId: string, gameState: GameState): boolean {
		const item = this.getItemById(itemId);

		// All crafting requires at minimum a craft_spot — pawns need a designated safe location
		if (!item?.workshopType) {
			const hasCraftSpot = (gameState.buildings ?? []).some(
				(b) => b.type === 'craft_spot' && b.status === 'complete'
			);
			if (!hasCraftSpot) return false;
		}

		// Check Phase 5d workshopType (e.g. 'campfire', 'makers_bench', 'craft_spot')
		if (item?.workshopType) {
			const workshopOk = (gameState.buildings ?? []).some(
				(b) => b.type === item.workshopType && b.status === 'complete'
			);
			if (!workshopOk) return false;
		}

		// Check legacy buildingRequired field
		if (!item?.buildingRequired) return true;

		// Phase 5d fix: check buildings[] instead of deprecated buildingCounts
		return (gameState.buildings ?? []).some(
			(b) => b.type === item.buildingRequired && b.status === 'complete'
		);
	}

	calculateCraftingTime(itemId: string, gameState: GameState, pawnId?: string): number {
		const item = this.getItemById(itemId);
		if (!item?.craftingTime) return 0;

		let time = item.craftingTime;

		// Apply pawn-specific bonuses if provided
		if (pawnId) {
			const pawn = gameState.pawns.find((p) => p.id === pawnId);
			if (pawn) {
				// Apply stat bonuses (dexterity affects crafting speed)
				const dexterityBonus = (pawn.stats.dexterity - 10) / 20;
				time *= 1 - Math.max(-0.5, Math.min(0.5, dexterityBonus));
			}
		}

		return Math.max(1, Math.round(time));
	}

	calculateCraftingCost(itemId: string): Record<string, number> {
		const item = this.getItemById(itemId);
		return item?.craftingCost || {};
	}

	calculateItemEffects(itemId: string): Record<string, number> {
		const item = this.getItemById(itemId);
		return item?.effects || {};
	}

	getItemIcon(itemId: string): string {
		const item = this.getItemById(itemId);
		return item?.emoji || '📦';
	}

	getItemColor(itemId: string): string {
		const item = this.getItemById(itemId);
		return item?.color || '#4CAF50';
	}

	getItemRarityColor(rarity: string): string {
		return RARITY_COLORS[rarity] ?? '#9E9E9E';
	}

	getAvailableQuantity(itemId: string, gameState: GameState): number {
		const item = gameState.item.find((i) => i.id === itemId);
		return item?.amount || 0;
	}

	consumeItems(itemIds: Record<string, number>, gameState: GameState): GameState {
		const newState = { ...gameState };
		newState.item = gameState.item.map((item) => {
			const consumeAmount = itemIds[item.id];
			if (consumeAmount) {
				return { ...item, amount: Math.max(0, item.amount - consumeAmount) };
			}
			return item;
		});
		return newState;
	}

	addItems(itemIds: Record<string, number>, gameState: GameState): GameState {
		const newState = { ...gameState };
		newState.item = [...gameState.item];

		Object.entries(itemIds).forEach(([itemId, amount]) => {
			const existingIndex = newState.item.findIndex((i) => i.id === itemId);
			if (existingIndex >= 0) {
				newState.item[existingIndex] = {
					...newState.item[existingIndex],
					amount: newState.item[existingIndex].amount + amount
				};
			} else {
				const itemTemplate = this.getItemById(itemId);
				if (itemTemplate) {
					newState.item.push({ ...itemTemplate, amount });
				}
			}
		});

		return newState;
	}

	processCraftingQueue(gameState: GameState): GameState {
		console.log('[ItemService] Processing crafting queue');

		// Process crafting queue - items being crafted
		if (gameState.craftingQueue.length > 0) {
			const updatedCraftingQueue = gameState.craftingQueue
				.map((crafting) => ({
					...crafting,
					turnsRemaining: crafting.turnsRemaining - 1
				}))
				.filter((crafting) => {
					if (crafting.turnsRemaining <= 0) {
						// Crafting completed - add to items array
						const itemId = crafting.item.id;
						const quantity = crafting.quantity || 1;

						// Use the addItems method to handle adding the crafted item
						gameState = this.addItems({ [itemId]: quantity }, gameState);

						console.log('[ItemService] Crafting completed:', itemId, 'x', quantity);
						return false;
					}
					return true;
				});

			return {
				...gameState,
				craftingQueue: updatedCraftingQueue
			};
		}

		return gameState;
	}
}

// Export singleton instance
export const itemService = new ItemServiceImpl();
