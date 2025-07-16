import type { GameState, ResearchProject, Building, Item } from './types';
import { itemService } from '../services/ItemService';

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
		console.warn('[GameState] DEPRECATED: advanceTurn() called directly. Use GameEngine.processGameTurn() instead.');
		// For backward compatibility, just increment turn
		this.state.turn += 1;
	}

	// KEEP: Utility methods for item management
	private addToItemArray(itemId: string, amount: number): void {
		const itemIndex = this.state.item.findIndex((item) => item.id === itemId);
		if (itemIndex !== -1) {
			this.state.item[itemIndex] = {
				...this.state.item[itemIndex],
				amount: this.state.item[itemIndex].amount + amount
			};
		} else {
			const itemInfo = itemService.getItemById(itemId);
			if (itemInfo) {
				this.state.item.push({ ...itemInfo, amount });
			}
		}

	}



	// KEEP: Public utility methods
	addResource(resourceId: string, amount: number): void {
		this.addToItemArray(resourceId, amount);
	}

	getItemAmount(itemId: string): number {
		const item = this.state.item.find((i) => i.id === itemId);
		return item ? item.amount : 0;
	}

	removeItemAmount(itemId: string, amount: number): boolean {
		const itemIndex = this.state.item.findIndex((item) => item.id === itemId);
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
		if (this.state.currentResearch) {
			return false;
		}
		this.state.currentResearch = {
			...research,
			currentProgress: 0
		};
		return true;
	}

	startBuilding(building: Building): boolean {
		this.state.buildingQueue.push({
			building,
			turnsRemaining: building.buildTime,
			startedAt: this.state.turn
		});
		return true;
	}

	startCrafting(item: Item, quantity: number = 1): boolean {
		this.state.craftingQueue.push({
			item,
			quantity,
			turnsRemaining: item.craftingTime || 1,
			startedAt: this.state.turn
		});
		return true;
	}
}