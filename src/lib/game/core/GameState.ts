import type { GameState, ResearchProject, Building, Item, PlacedBuilding, Job, StockpileZone, DroppedItem } from './types';

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
	private addToItemArray(_itemId: string, _amount: number): void {
		// Deprecated — stockpile is the single source of truth. No-op.
	}



	// KEEP: Public utility methods
	addResource(resourceId: string, amount: number): void {
		this.state = addToStockpileZone(this.state, null, { [resourceId]: amount });
	}

	getItemAmount(itemId: string): number {
		return this.state.stockpile[itemId] ?? 0;
	}

	removeItemAmount(itemId: string, amount: number): boolean {
		const current = this.state.stockpile[itemId] ?? 0;
		if (current < amount) return false;
		this.state = consumeFromStockpiles(this.state, { [itemId]: amount });
		return true;
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
			turnsRemaining: building.workAmount,
			startedAt: this.state.turn
		});
		return true;
	}

	startCrafting(item: Item, quantity: number = 1): boolean {
		const id = `craft-${item.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
		this.state.craftingQueue.push({
			id,
			item,
			quantity,
			turnsRemaining: item.craftingTime || 1,
			startedAt: this.state.turn,
			workRequired: (item.craftingTime || 1) * 5,
			workDone: 0,
			materialsReserved: true
		});
		return true;
	}

	// ===== PHASE 4: STOCKPILE =====

	addToStockpile(id: string, amount: number): void {
		this.state = addToStockpileZone(this.state, null, { [id]: amount });
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

	// ===== PHASE 5a: JOB POOL =====

	addJob(job: Job): void {
		const jobs = this.state.jobs ?? [];
		if (!jobs.find(j => j.id === job.id)) {
			this.state.jobs = [...jobs, job];
		}
	}

	updateJob(jobId: string, updates: Partial<Job>): void {
		this.state.jobs = (this.state.jobs ?? []).map(j =>
			j.id === jobId ? { ...j, ...updates } : j
		);
	}

	removeJob(jobId: string): void {
		this.state.jobs = (this.state.jobs ?? []).filter(j => j.id !== jobId);
	}
}

// ===== STOCKPILE ZONE ID =====

/** ID of the virtual catch-all zone for items added without a specific map tile. */
export const GENERAL_ZONE_ID = 'zone-general';

// ===== PURE STOCKPILE HELPERS =====

/**
 * Compute the aggregate stockpile by summing all zone inventories.
 * This is the single source of truth — never mutate state.stockpile directly.
 */
export function computeAggregate(zones: StockpileZone[]): Record<string, number> {
	const agg: Record<string, number> = {};
	for (const zone of (zones ?? [])) {
		for (const [id, amt] of Object.entries(zone.inventory)) {
			if (amt > 0) agg[id] = (agg[id] ?? 0) + amt;
		}
	}
	return agg;
}

/**
 * Add items to the zone that owns `tileKey`.
 * Falls back to the general zone when tileKey is null or no zone owns the tile.
 * Auto-creates the general zone if it doesn't exist.
 * state.stockpile is always recomputed from zones — never tracked separately.
 */
export function addToStockpileZone(
	state: GameState,
	tileKey: string | null,
	items: Record<string, number>
): GameState {
	const zones = (state.stockpileZones ?? []).map((z) => ({ ...z, inventory: { ...z.inventory } }));

	let targetIdx = tileKey !== null ? zones.findIndex((z) => z.tiles.includes(tileKey)) : -1;
	if (targetIdx === -1) targetIdx = zones.findIndex((z) => z.id === GENERAL_ZONE_ID);
	if (targetIdx === -1) {
		zones.push({
			id: GENERAL_ZONE_ID,
			name: 'Colony Stockpile',
			tiles: [],
			filter: { allowedCategories: [], blockedItems: [] },
			inventory: {}
		} satisfies StockpileZone);
		targetIdx = zones.length - 1;
	}

	for (const [itemId, amount] of Object.entries(items)) {
		if (amount <= 0) continue;
		zones[targetIdx].inventory[itemId] = (zones[targetIdx].inventory[itemId] ?? 0) + amount;
	}

	return { ...state, stockpileZones: zones, stockpile: computeAggregate(zones) };
}

/**
 * Consume items from zones greedily (iterates zones in order).
 * state.stockpile is always recomputed from zones after the deduction.
 * Does not validate sufficiency — caller must check state.stockpile first.
 */
export function consumeFromStockpiles(
	state: GameState,
	items: Record<string, number>
): GameState {
	const zones = (state.stockpileZones ?? []).map((z) => ({ ...z, inventory: { ...z.inventory } }));

	// Also reduce stored DroppedItems so the physical map stays in sync.
	// Only touches items that have a physical stored representation; items that
	// exist only in zone.inventory (e.g. crafted output added without a tile drop)
	// are unaffected here and are correctly handled by the zone loop above.
	const newDropped = (state.droppedItems ?? []).map((d) => ({ ...d }));

	for (const [itemId, amount] of Object.entries(items)) {
		if (amount <= 0) continue;

		// Deduct from zone inventories.
		let remaining = amount;
		for (const zone of zones) {
			if (remaining <= 0) break;
			const available = zone.inventory[itemId] ?? 0;
			if (available <= 0) continue;
			const take = Math.min(available, remaining);
			zone.inventory[itemId] = available - take;
			remaining -= take;
		}

		// Deduct from stored drops (physical truth).
		remaining = amount;
		for (let i = 0; i < newDropped.length && remaining > 0; i++) {
			const d = newDropped[i];
			if (!d.stored || d.resourceId !== itemId || (d.quantity ?? 0) <= 0) continue;
			const take = Math.min(d.quantity, remaining);
			newDropped[i] = { ...d, quantity: d.quantity - take };
			remaining -= take;
		}
	}

	return {
		...state,
		droppedItems: newDropped.filter((d) => !d.stored || d.quantity > 0),
		stockpileZones: zones,
		stockpile: computeAggregate(zones)
	};
}

/**
 * Single absorption trigger: if `dropId` is an unstored DroppedItem sitting on a
 * stockpile-designated tile, mark it stored and credit the zone.
 *
 * If a stored drop of the same resource already exists at that tile the quantities are
 * merged so there is always at most one stored pile per resource per tile.
 *
 * Returns state unchanged when the drop is already stored, the tile is not a stockpile,
 * or the drop doesn't exist.
 */
export function absorbDropIfOnStockpileTile(state: GameState, dropId: string): GameState {
	const drop = (state.droppedItems ?? []).find((d) => d.id === dropId);
	if (!drop || drop.stored) return state;

	const tileKey = `${drop.x},${drop.y}`;
	if ((state.designations ?? {})[tileKey] !== 'stockpile') return state;

	// Try to merge into an existing stored pile of the same resource at the same tile.
	const existingIdx = (state.droppedItems ?? []).findIndex(
		(d) => d.stored && d.resourceId === drop.resourceId && d.x === drop.x && d.y === drop.y
	);

	let newDropped: DroppedItem[];
	if (existingIdx >= 0) {
		// Merge: increase existing stored pile, remove the new unstored drop.
		newDropped = (state.droppedItems ?? [])
			.map((d, i) => (i === existingIdx ? { ...d, quantity: d.quantity + drop.quantity } : d))
			.filter((d) => d.id !== dropId);
	} else {
		// Mark the drop as stored in-place.
		newDropped = (state.droppedItems ?? []).map((d) =>
			d.id === dropId ? { ...d, stored: true } : d
		);
	}

	const withDrop = { ...state, droppedItems: newDropped };
	return addToStockpileZone(withDrop, tileKey, { [drop.resourceId]: drop.quantity });
}