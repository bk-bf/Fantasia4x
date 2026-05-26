import type { GameState, ResearchProject, Building, Item, PlacedBuilding } from './types';
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

	// ===== PHASE 4: STOCKPILE =====

	addToStockpile(id: string, amount: number): void {
		const current = this.state.stockpile?.[id] ?? 0;
		this.state.stockpile = { ...(this.state.stockpile ?? {}), [id]: current + amount };
	}

	getStockpileAmount(id: string): number {
		return this.state.stockpile?.[id] ?? 0;
	}

	// ===== PHASE 4: WORLD RESOURCE DEPLETION =====

	depleteWorldResource(x: number, y: number, id: string, amount: number): boolean {
		const map = this.state.worldMap;
		if (!map[y]?.[x]) return false;
		const tile = map[y][x];
		const current = tile.resources?.[id] ?? 0;
		if (current <= 0) return false;
		const newAmount = Math.max(0, current - amount);
		const newTile = { ...tile, resources: { ...tile.resources, [id]: newAmount } };
		const newMap = map.map((row, ry) =>
			ry === y ? row.map((col, rx) => (rx === x ? newTile : col)) : row
		);
		this.state.worldMap = newMap;
		return true;
	}

	// ===== PHASE 4: PLACED BUILDINGS =====

	addBuilding(building: PlacedBuilding): void {
		this.state.buildings = [...(this.state.buildings ?? []), building];
	}

	updateBuilding(id: string, updates: Partial<PlacedBuilding>): void {
		this.state.buildings = (this.state.buildings ?? []).map(b =>
			b.id === id ? { ...b, ...updates } : b
		);
	}

	removeBuilding(id: string): void {
		this.state.buildings = (this.state.buildings ?? []).filter(b => b.id !== id);
	}

	/** Count complete buildings of a given type (replaces legacy buildingCounts[type]) */
	getCompleteBuildingCount(type: string): number {
		return (this.state.buildings ?? []).filter(b => b.type === type && b.status === 'complete').length;
	}

	/** Update a pawn by id using an updater function */
	updatePawn(pawnId: string, updater: (pawn: NonNullable<GameState['pawns'][number]>) => GameState['pawns'][number]): void {
		this.state.pawns = this.state.pawns.map(p => p.id === pawnId ? updater(p) : p);
	}
}