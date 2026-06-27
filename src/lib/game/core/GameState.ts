import type {
  GameState,
  ResearchProject,
  Building,
  Item,
  PlacedBuilding,
  Job,
  StockpileZone,
  DroppedItem
} from './types';
import { rng } from './rng';
import { mergeConditions } from './carcassCondition';
import buildingsData from '../database/buildings.jsonc';

const BUILDING_DEFS = buildingsData as unknown as Building[];

// §F storage bins — buildings whose `effects.storageStacks` (> 1) turn their tile into a DENSE store
// that holds several distinct stored piles instead of the usual one, AND act as a stockpile slot on
// their own (no drawn zone needed). Precomputed once: defs are static, so the per-tile/per-tick checks
// below stay O(buildings) with O(1) lookups rather than rescanning every def. Other storage buildings
// just add a `storageStacks` to their effects to opt in. `preservation` (0–1) slows food spoilage.
const STORAGE_BIN_STACKS = new Map<string, number>(
  BUILDING_DEFS.filter((d) => (d.effects?.storageStacks ?? 0) > 0).map((d) => [
    d.id,
    d.effects.storageStacks
  ])
);
function binStacksForType(type: string): number {
  return STORAGE_BIN_STACKS.get(type) ?? 0;
}
// A specialized store's allow-list (categories OR item ids); only types that actually restrict appear.
// The category MATCHING lives in the services layer (it needs item defs); core only needs to know the
// list and whether a tile is filtered (so the generic fallback never dumps into a specialized bin).
const STORAGE_BIN_FILTER = new Map<string, string[]>(
  BUILDING_DEFS.filter((d) => (d.storageFilter?.length ?? 0) > 0).map((d) => [d.id, d.storageFilter!])
);

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
    console.warn(
      '[GameState] DEPRECATED: advanceTurn() called directly. Use GameEngine.processGameTurn() instead.'
    );
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
    this.state.buildings = (this.state.buildings ?? []).map((b) =>
      b.id === id ? { ...b, ...updates } : b
    );
  }

  removeBuilding(id: string): void {
    this.state.buildings = (this.state.buildings ?? []).filter((b) => b.id !== id);
  }

  /** Count complete buildings of a given type (replaces legacy buildingCounts[type]) */
  getCompleteBuildingCount(type: string): number {
    return (this.state.buildings ?? []).filter((b) => b.type === type && b.status === 'complete')
      .length;
  }

  /** Update a pawn by id using an updater function */
  updatePawn(
    pawnId: string,
    updater: (pawn: NonNullable<GameState['pawns'][number]>) => GameState['pawns'][number]
  ): void {
    this.state.pawns = this.state.pawns.map((p) => (p.id === pawnId ? updater(p) : p));
  }

  // ===== PHASE 5a: JOB POOL =====

  addJob(job: Job): void {
    const jobs = this.state.jobs ?? [];
    if (!jobs.find((j) => j.id === job.id)) {
      this.state.jobs = [...jobs, job];
    }
  }

  updateJob(jobId: string, updates: Partial<Job>): void {
    this.state.jobs = (this.state.jobs ?? []).map((j) =>
      j.id === jobId ? { ...j, ...updates } : j
    );
  }

  removeJob(jobId: string): void {
    this.state.jobs = (this.state.jobs ?? []).filter((j) => j.id !== jobId);
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
  for (const zone of zones ?? []) {
    for (const [id, amt] of Object.entries(zone.inventory)) {
      if (amt > 0) agg[id] = (agg[id] ?? 0) + amt;
    }
  }
  return agg;
}

// ===== PER-TILE STORAGE (refactor Stage 2) =====
// Items physically live as `stored` DroppedItems on tiles. A tile has a capacity
// (base + storage-building bonus); zones are drop-off designations, not holders.

/** Base item capacity of a bare map tile, before any storage building. */
export const BASE_TILE_CAPACITY = 200;

/** Sum `stored` DroppedItems (the per-tile authority) into an aggregate by resourceId. */
export function aggregateFromDrops(drops: DroppedItem[] | undefined): Record<string, number> {
  const agg: Record<string, number> = {};
  for (const d of drops ?? []) {
    if (!d.stored || (d.quantity ?? 0) <= 0) continue;
    agg[d.resourceId] = (agg[d.resourceId] ?? 0) + d.quantity;
  }
  return agg;
}

/**
 * ADR-016: quantity of `itemId` physically available to spend — `stored` drops not reserved
 * for a craft order. `stockpile` (aggregateFromDrops) still counts reserved stacks (they're
 * physically present, shown in the UI); affordability/consumption must use this instead so
 * two orders can't double-spend the same stock.
 */
export function availableQuantityFromDrops(
  drops: DroppedItem[] | undefined,
  itemId: string
): number {
  let total = 0;
  for (const d of drops ?? []) {
    if (!d.stored || d.reservedFor || d.resourceId !== itemId || (d.quantity ?? 0) <= 0) continue;
    total += d.quantity;
  }
  return total;
}

/** ADR-016: full available-stock aggregate (`stored` drops minus reservations) by resourceId. */
export function availableAggregateFromDrops(
  drops: DroppedItem[] | undefined
): Record<string, number> {
  const agg: Record<string, number> = {};
  for (const d of drops ?? []) {
    if (!d.stored || d.reservedFor || (d.quantity ?? 0) <= 0) continue;
    agg[d.resourceId] = (agg[d.resourceId] ?? 0) + d.quantity;
  }
  return agg;
}

/**
 * ADR-016: lock up to `qty` of `itemId` from free `stored` drops for craft order `orderId`,
 * splitting a stack when only part of it is needed. Reserved stacks stay physically present
 * but drop out of "available". Returns the new state plus the quantity actually reserved
 * (may be < qty if stock is short — caller should check before committing the order).
 */
export function reserveForOrder(
  state: GameState,
  itemId: string,
  qty: number,
  orderId: string
): { state: GameState; reserved: number } {
  if (qty <= 0) return { state, reserved: 0 };
  let remaining = qty;
  const drops: DroppedItem[] = [];
  for (const d of state.droppedItems ?? []) {
    if (
      remaining <= 0 ||
      !d.stored ||
      d.reservedFor ||
      d.resourceId !== itemId ||
      d.quantity <= 0
    ) {
      drops.push(d);
      continue;
    }
    if (d.quantity <= remaining) {
      // Reserve the whole stack.
      drops.push({ ...d, reservedFor: orderId });
      remaining -= d.quantity;
    } else {
      // Split: reserve a new stack of `remaining`, leave the rest free.
      drops.push({ ...d, quantity: d.quantity - remaining });
      drops.push({
        // Use the FULL orderId, not `slice(-6)`: the last-6 was the placement timestamp's tail,
        // which COLLIDES for every building drag-placed in the same batch (they share one Date.now()).
        // Colliding drop ids made `_syncFetchJobs` match the wrong stack's `reservedFor` and re-mint
        // the fetch job every tick → the Idle↔MovingToResource oscillation. orderId is unique/building.
        id: `${d.id}-resv-${orderId}`,
        resourceId: d.resourceId,
        x: d.x,
        y: d.y,
        quantity: remaining,
        stored: true,
        reservedFor: orderId
      });
      remaining = 0;
    }
  }
  return { state: { ...state, droppedItems: drops }, reserved: qty - remaining };
}

/** ADR-016: clear all reservations held by craft order `orderId` (e.g. on cancel). */
export function releaseReservation(state: GameState, orderId: string): GameState {
  let changed = false;
  const drops = (state.droppedItems ?? []).map((d) => {
    if (d.reservedFor !== orderId) return d;
    changed = true;
    const { reservedFor, ...rest } = d;
    return rest;
  });
  return changed ? { ...state, droppedItems: drops } : state;
}

/** Total stored item quantity physically held on tile (x,y). */
export function tileStoredQuantity(state: GameState, x: number, y: number): number {
  let total = 0;
  for (const d of state.droppedItems ?? []) {
    if (d.stored && d.x === x && d.y === y) total += d.quantity ?? 0;
  }
  return total;
}

/** Item capacity of tile (x,y) = base + Σ tileCapacityBonus of complete buildings on it. */
export function tileCapacity(state: GameState, x: number, y: number): number {
  let cap = BASE_TILE_CAPACITY;
  for (const b of state.buildings ?? []) {
    if (b.status !== 'complete' || b.x !== x || b.y !== y) continue;
    const def = BUILDING_DEFS.find((d) => d.id === b.type);
    if (def?.tileCapacityBonus) cap += def.tileCapacityBonus;
  }
  return cap;
}

/** Free capacity remaining on tile (x,y) for additional stored items. */
export function tileFreeCapacity(state: GameState, x: number, y: number): number {
  return Math.max(0, tileCapacity(state, x, y) - tileStoredQuantity(state, x, y));
}

// ── §F storage bins ────────────────────────────────────────────────────────────────────────────
/**
 * How many DISTINCT stored piles tile (x,y) may hold: 1 for a plain stockpile tile, or the largest
 * `storageStacks` of any complete storage-bin building on it (a wicker basket holds 4). The single
 * source of truth for per-tile pile capacity — shared by haul-job sync and the deposit search.
 */
export function tilePileCapacity(state: GameState, x: number, y: number): number {
  let cap = 1;
  for (const b of state.buildings ?? []) {
    if (b.status !== 'complete' || b.x !== x || b.y !== y) continue;
    const stacks = binStacksForType(b.type);
    if (stacks > cap) cap = stacks;
  }
  return cap;
}

/** Count of distinct stored piles physically sitting on tile (x,y). */
export function tileStoredPileCount(state: GameState, x: number, y: number): number {
  let n = 0;
  for (const d of state.droppedItems ?? []) if (d.stored && d.x === x && d.y === y) n++;
  return n;
}

/** A storage-bin building (effects.storageStacks) sits, complete, on tile (x,y). */
export function isStorageBinTile(state: GameState, x: number, y: number): boolean {
  for (const b of state.buildings ?? [])
    if (b.status === 'complete' && b.x === x && b.y === y && binStacksForType(b.type) > 0)
      return true;
  return false;
}

/**
 * Every tile that accepts hauled goods: drawn `stockpile` zone tiles ∪ standalone storage-bin tiles.
 * The single "where can a hauler deposit" source — shared by haul-job capacity sync, the deposit-point
 * search, the opportunistic sweep, and the absorb trigger, so a bin works with no stockpile zone drawn.
 */
export function storageTileKeys(state: GameState): string[] {
  const seen = new Set<string>();
  const zt = state.zoneTiles ?? {};
  for (const k in zt) if (zt[k]?.includes('stockpile')) seen.add(k);
  for (const b of state.buildings ?? [])
    if (b.status === 'complete' && binStacksForType(b.type) > 0) seen.add(`${b.x},${b.y}`);
  return [...seen];
}

/** True when tile (x,y) accepts hauled goods (stockpile zone tile OR a storage-bin tile). */
export function isStorageTile(state: GameState, x: number, y: number): boolean {
  if (state.zoneTiles?.[`${x},${y}`]?.includes('stockpile')) return true;
  return isStorageBinTile(state, x, y);
}

/**
 * The allow-list (categories/item-ids) of a SPECIALIZED store on tile (x,y), or null when the tile is a
 * general store (plain stockpile / unfiltered bin) that takes anything. Category matching is done by the
 * caller in the services layer; core only surfaces the list + "is this tile filtered".
 */
export function binFilterAt(state: GameState, x: number, y: number): string[] | null {
  let best: string[] | null = null;
  for (const b of state.buildings ?? []) {
    if (b.status !== 'complete' || b.x !== x || b.y !== y) continue;
    const f = STORAGE_BIN_FILTER.get(b.type);
    if (f) best = f; // a filtered bin on the tile restricts it
  }
  return best;
}

/** True when a specialized (filtered) store sits on tile (x,y) — the generic credit path skips these. */
export function isFilteredBinTile(state: GameState, x: number, y: number): boolean {
  return binFilterAt(state, x, y) !== null;
}

/**
 * Choose a tile to physically store items on. Prefers the explicit `tileKey`, then a
 * stockpile-designated tile with free capacity, then any stockpile tile, then an existing
 * stored pile, then (0,0). Capacity is advisory here — storing never fails (items are never
 * lost); capacity governs hauling/overflow elsewhere.
 */
function pickStorageTile(state: GameState, tileKey: string | null): { x: number; y: number } {
  if (tileKey) {
    const [x, y] = tileKey.split(',').map(Number);
    if (Number.isFinite(x) && Number.isFinite(y)) return { x, y };
  }
  // Generic credit fallback: scan GENERAL storage tiles only (stockpile zones + unfiltered bins) — a
  // specialized bin (hay rack/meat hooks) must never be force-fed a non-matching resource here, since
  // this path can't check categories. Prefer one with a free pile slot.
  let fallback: { x: number; y: number } | null = null;
  for (const key of storageTileKeys(state)) {
    const [x, y] = key.split(',').map(Number);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (isFilteredBinTile(state, x, y)) continue;
    if (!fallback) fallback = { x, y };
    if (tileStoredPileCount(state, x, y) < tilePileCapacity(state, x, y)) return { x, y };
  }
  if (fallback) return fallback;
  const sd = (state.droppedItems ?? []).find((d) => d.stored);
  if (sd) return { x: sd.x, y: sd.y };
  for (const z of state.stockpileZones ?? []) {
    if (z.tiles[0]) {
      const [x, y] = z.tiles[0].split(',').map(Number);
      if (Number.isFinite(x) && Number.isFinite(y)) return { x, y };
    }
  }
  return { x: 0, y: 0 };
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
  // Stage 2: items are stored as physical `stored` DroppedItems on a tile (the source of
  // truth). Zones no longer hold inventory; they only designate where haulers drop. There is
  // at most one stored pile per (resourceId, tile), so ids are deterministic and merges are O(1).
  const { x, y } = pickStorageTile(state, tileKey);
  const drops = (state.droppedItems ?? []).map((d) => ({ ...d }));

  for (const [itemId, amount] of Object.entries(items)) {
    if (amount <= 0) continue;
    const idx = drops.findIndex(
      (d) => d.stored && d.resourceId === itemId && d.x === x && d.y === y
    );
    if (idx >= 0) {
      drops[idx].quantity += amount;
    } else {
      drops.push({
        id: `stored-${itemId}-${x}-${y}`,
        resourceId: itemId,
        x,
        y,
        quantity: amount,
        stored: true
      });
    }
  }

  return { ...state, droppedItems: drops, stockpile: aggregateFromDrops(drops) };
}

/**
 * Consume items from zones greedily (iterates zones in order).
 * state.stockpile is always recomputed from zones after the deduction.
 * Does not validate sufficiency — caller must check state.stockpile first.
 */
export function consumeFromStockpiles(state: GameState, items: Record<string, number>): GameState {
  // Stage 2: deduct from `stored` DroppedItems (the source of truth). Loose/in-transit drops
  // are not "in stockpile" and are not consumable here. Caller must check `state.stockpile`.
  const newDropped = (state.droppedItems ?? []).map((d) => ({ ...d }));

  for (const [itemId, amount] of Object.entries(items)) {
    if (amount <= 0) continue;
    let remaining = amount;
    for (let i = 0; i < newDropped.length && remaining > 0; i++) {
      const d = newDropped[i];
      // ADR-016: never consume a stack reserved for a craft order from the general pool.
      if (!d.stored || d.reservedFor || d.resourceId !== itemId || (d.quantity ?? 0) <= 0) continue;
      const take = Math.min(d.quantity, remaining);
      newDropped[i] = { ...d, quantity: d.quantity - take };
      remaining -= take;
    }
  }

  const kept = newDropped.filter((d) => !d.stored || d.quantity > 0);
  return { ...state, droppedItems: kept, stockpile: aggregateFromDrops(kept) };
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

  // Stockpile zone tile OR a standalone storage-bin tile (a basket stores without a drawn zone).
  if (!isStorageTile(state, drop.x, drop.y)) return state;

  // Identity-tracked drops (a per-instance `name` override, a tracked `instance`, or a §Q craft
  // `quality` tier) must NOT be folded into a counted pile — that would erase the identity / merge
  // across quality tiers. Mark it stored in place as its own distinct pile.
  if (drop.name != null || drop.instance != null || drop.quality != null) {
    const newDropped = (state.droppedItems ?? []).map((d) =>
      d.id === dropId ? { ...d, stored: true } : d
    );
    return { ...state, droppedItems: newDropped, stockpile: aggregateFromDrops(newDropped) };
  }

  // Try to merge into an existing stored pile of the same resource at the same tile.
  const existingIdx = (state.droppedItems ?? []).findIndex(
    (d) => d.stored && d.resourceId === drop.resourceId && d.x === drop.x && d.y === drop.y
  );

  let newDropped: DroppedItem[];
  if (existingIdx >= 0) {
    // Merge: increase existing stored pile, remove the new unstored drop. Carcasses concat their
    // per-unit conditions so each unit keeps its own condition across the merge (no averaging).
    const existing = (state.droppedItems ?? [])[existingIdx];
    const mergedConditions =
      existing.unitConditions || drop.unitConditions
        ? mergeConditions(
            existing.unitConditions,
            existing.quantity,
            drop.unitConditions,
            drop.quantity
          )
        : undefined;
    newDropped = (state.droppedItems ?? [])
      .map((d, i) =>
        i === existingIdx
          ? {
              ...d,
              quantity: d.quantity + drop.quantity,
              ...(mergedConditions ? { unitConditions: mergedConditions } : {})
            }
          : d
      )
      .filter((d) => d.id !== dropId);
  } else {
    // Mark the drop as stored in-place.
    newDropped = (state.droppedItems ?? []).map((d) =>
      d.id === dropId ? { ...d, stored: true } : d
    );
  }

  // Stage 2: marking the drop `stored` IS the credit (drops are the source of truth).
  // No separate zone-inventory bookkeeping; just recompute the aggregate from drops.
  return { ...state, droppedItems: newDropped, stockpile: aggregateFromDrops(newDropped) };
}
