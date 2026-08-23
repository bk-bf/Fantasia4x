import type {
  GameState,
  ResearchProject,
  Building,
  Item,
  PlacedBuilding,
  Job,
  StockpileZone,
  DroppedItem,
  ItemInstance
} from './types';
import { rng } from './rng';
import { mergeConditions } from './carcassCondition';
import {
  vesselAllows,
  isFluidId,
  litresToUnits,
  takeOut,
  heldQuantity,
  litresPerUnit,
  putIn,
  pickVesselFor,
  unitsToLitres,
  vesselAccepts,
  vesselOf
} from './vessels';
import { allItemDefs, itemDefById } from './itemDefs';
import buildingsData from '../database/world/buildings.jsonc';
import itemsData from '../database/items/items.jsonc';

// Static tier table for tool items (type === 'tool', numeric `tier`). Built once — the item DB never
// mutates at runtime. Used by `colonyToolTier` so owning a crafted tool satisfies tier gates.
const TOOL_TIER_BY_ID: Map<string, number> = new Map(
  (itemsData as unknown as Item[])
    .filter((i) => i.type === 'tool' && typeof i.tier === 'number')
    .map((i) => [i.id, i.tier as number])
);

const BUILDING_DEFS = buildingsData as unknown as Building[];

// Storage bins — buildings whose `effects.storageStacks` (> 1) let their tile hold several distinct
// stored piles AND act as a stockpile slot on their own (no drawn zone needed). Precomputed once.
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
// Category MATCHING lives in the services layer — core only knows the list / whether a tile is filtered.
const STORAGE_BIN_FILTER = new Map<string, string[]>(
  BUILDING_DEFS.filter((d) => (d.storageFilter?.length ?? 0) > 0).map((d) => [
    d.id,
    d.storageFilter!
  ])
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
    this.state.turn += 1;
  }

  private addToItemArray(_itemId: string, _amount: number): void {
    // Deprecated — stockpile is the single source of truth. No-op.
  }

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

  // ===== STOCKPILE =====

  addToStockpile(id: string, amount: number): void {
    this.state = addToStockpileZone(this.state, null, { [id]: amount });
  }

  getStockpileAmount(id: string): number {
    return this.state.stockpile?.[id] ?? 0;
  }

  // ===== WORLD RESOURCE DEPLETION =====

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

  // ===== PLACED BUILDINGS =====

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

  getCompleteBuildingCount(type: string): number {
    return (this.state.buildings ?? []).filter((b) => b.type === type && b.status === 'complete')
      .length;
  }

  updatePawn(
    pawnId: string,
    updater: (pawn: NonNullable<GameState['pawns'][number]>) => GameState['pawns'][number]
  ): void {
    this.state.pawns = this.state.pawns.map((p) => (p.id === pawnId ? updater(p) : p));
  }

  // ===== JOB POOL =====

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
    // CONTAINERS-AND-FLUIDS: a stored VESSEL puts its contents in the colony's stock too — a barrel of
    // water on a stockpile tile is the colony's water. Counted in recipe UNITS (doses), never litres,
    // so the whole rest of the game keeps speaking one number.
    creditVesselContents(agg, d);
  }
  return agg;
}

/**
 * CONTAINERS-AND-FLUIDS §2 — commit a new `droppedItems` array to the state, spilling anything that
 * cannot legally lie loose on its way in. Today that is exactly one thing: a FLUID. A fluid may only
 * exist inside a vessel that accepts it, so a bare stack of water, brine or ale — however it got
 * created — evaporates here rather than becoming a puddle the rest of the sim has to reason about.
 *
 * This is the chokepoint every drops-mutating path goes through, so the rule cannot be forgotten at a
 * callsite. It is also the only place the aggregate is rebuilt, so the two can never disagree.
 */
export function withDrops(state: GameState, drops: DroppedItem[]): GameState {
  let spilled = false;
  for (const d of drops) {
    if (isFluidId(d.resourceId)) {
      spilled = true;
      break;
    }
  }
  const kept = spilled ? drops.filter((d) => !isFluidId(d.resourceId)) : drops;
  return { ...state, droppedItems: kept, stockpile: colonyStock(kept, state.buildings) };
}

/**
 * The colony's stock: everything on a stockpile tile, everything inside a vessel on one, and
 * everything a STATION is holding in its own body (a vat of brine, a cask of ale). A batch fermenting
 * in a cask is stock the colony owns — leaving it out of the ledger made brewing look like a hole.
 */
export function colonyStock(
  drops: DroppedItem[] | undefined,
  buildings: PlacedBuilding[] | undefined
): Record<string, number> {
  const agg = aggregateFromDrops(drops);
  for (const b of buildings ?? []) {
    if (!b.fluidContents?.length) continue;
    for (const e of b.fluidContents) {
      const qty = e.litres != null ? litresToUnits(e.itemId, e.litres) : (e.amount ?? 0);
      if (qty > 0) agg[e.itemId] = (agg[e.itemId] ?? 0) + qty;
    }
  }
  return agg;
}

/** Add one stored drop's nested contents to an aggregate. One level — `putIn` refuses any deeper. */
function creditVesselContents(agg: Record<string, number>, d: DroppedItem): void {
  const contents = d.instance?.contents;
  if (!contents?.length) return;
  for (const e of contents) {
    const qty = e.litres != null ? litresToUnits(e.itemId, e.litres) : (e.amount ?? 0);
    if (qty > 0) agg[e.itemId] = (agg[e.itemId] ?? 0) + qty;
  }
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
    if (!d.stored || d.reservedFor || (d.quantity ?? 0) <= 0) continue;
    if (d.resourceId === itemId) total += d.quantity;
    // A fluid is never a stack of its own — what the colony has is what its vessels hold.
    const held = heldQuantity(d.instance, itemId);
    if (held > 0) total += isFluidId(itemId) ? litresToUnits(itemId, held) : held;
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
 * ADR-009: the colony's effective tool tier — the higher of the research-granted `currentToolLevel`
 * and the highest `tier` among tool items physically in stock. Crafting/owning a tier-N tool (e.g. a
 * stone_axe is tier 1) satisfies a `toolTierRequired: N` build/craft gate even without the research
 * that would also grant tier N — matching the colony-stock harvest gate (R4). Reserved stacks still
 * count: the tool is owned even while earmarked as a building cost.
 */
export function colonyToolTier(state: GameState): number {
  let tier = state.currentToolLevel ?? 0;
  for (const d of state.droppedItems ?? []) {
    if (!d.stored || (d.quantity ?? 0) <= 0) continue;
    const t = TOOL_TIER_BY_ID.get(d.resourceId);
    if (t != null && t > tier) tier = t;
  }
  return tier;
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
    if (remaining <= 0 || !d.stored || d.reservedFor || d.quantity <= 0) {
      drops.push(d);
      continue;
    }
    // CONTAINERS-AND-FLUIDS: a fluid input is met by reserving the VESSEL that holds it — you cannot
    // split two litres out of a barrel and leave the rest behind on the tile. The whole vessel is
    // reserved and hauled to the station; the craft draws what it needs and the vessel comes back.
    if (d.resourceId !== itemId) {
      const held = heldQuantity(d.instance, itemId);
      if (held > 0) {
        drops.push({ ...d, reservedFor: orderId });
        remaining -= isFluidId(itemId) ? held / litresPerUnit(itemId) : held;
      } else {
        drops.push(d);
      }
      continue;
    }
    if (d.quantity <= remaining) {
      // Reserve the whole stack.
      drops.push({ ...d, reservedFor: orderId });
      remaining -= d.quantity;
    } else {
      // Split: reserve a new stack of `remaining`, leave the rest free. Carcass `unitConditions` follow
      // the split (top `remaining` units reserved, the rest stay free) so freshness isn't lost/duplicated.
      drops.push({
        ...d,
        quantity: d.quantity - remaining,
        ...(d.unitConditions ? { unitConditions: d.unitConditions.slice(remaining) } : {})
      });
      drops.push({
        ...(d.unitConditions ? { unitConditions: d.unitConditions.slice(0, remaining) } : {}),
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
  for (const b of state.buildings ?? []) {
    if (b.status !== 'complete' || b.x !== x || b.y !== y) continue;
    if (binStacksForType(b.type) <= 0) continue; // not a storage bin
    // Player override (the FILTER fly-out) wins — an explicit item-id list, even empty (= take nothing).
    const override = b.storageSettings?.allowedItemIds;
    if (override !== undefined) return override;
    // Else the building's static default: a specialized bin's category list, or null = general (all).
    return STORAGE_BIN_FILTER.get(b.type) ?? null;
  }
  return null;
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
    // CONTAINERS-AND-FLUIDS §2: a fluid cannot be set down as a stack, so a deliberate credit of one
    // arrives the way it would in the world — in something. It tops up a vessel already standing here
    // that takes it, and mints a fresh vessel for whatever is left over. (A hauler is not this
    // generous: it only fills what the player's allow-list names. This path is a credit, not a chore —
    // a caravan sells you the wine and the cask it came in.)
    if (isFluidId(itemId)) {
      creditFluid(drops, itemId, amount, x, y);
      continue;
    }
    // A VESSEL is credited as individual tracked instances rather than a counted stack. It has to be:
    // a bare count cannot hold anything, so a stockpile "×4 glassware" that could never be filled is
    // four ornaments. One instance each, each with its own (empty) allow-list.
    if (vesselOf(itemId)) {
      for (let n = 0; n < amount; n++) {
        const seq = drops.length;
        drops.push({
          id: `stored-${itemId}-${x}-${y}-${seq}`,
          resourceId: itemId,
          x,
          y,
          quantity: 1,
          stored: true,
          instance: {
            instanceId: `vessel-${itemId}-${x}-${y}-${seq}`,
            itemId,
            durability: itemDefById(itemId)?.maxDurability ?? 100,
            filter: []
          }
        });
      }
      continue;
    }
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

  return withDrops(state, drops);
}

/** Pour `units` of a fluid onto tile (x,y): top up vessels already there, then mint what is needed. */
function creditFluid(
  drops: DroppedItem[],
  itemId: string,
  units: number,
  x: number,
  y: number
): void {
  let remainingL = unitsToLitres(itemId, units);

  for (let i = 0; i < drops.length && remainingL > 0; i++) {
    const d = drops[i];
    if (!d.stored || d.x !== x || d.y !== y || !d.instance) continue;
    if (!vesselAccepts(d.resourceId, itemId)) continue;
    const inst = { ...d.instance, contents: d.instance.contents?.map((e) => ({ ...e })) };
    const poured = putIn(inst, itemId, remainingL);
    if (poured <= 0) continue;
    // Anything the colony deliberately puts in a vessel is on that vessel's list from then on, or the
    // next hauler would read it as an orphan and start looking for somewhere else to put it.
    inst.filter = [...new Set([...(inst.filter ?? []), itemId])];
    drops[i] = { ...d, instance: inst };
    remainingL -= poured;
  }

  let guard = 0;
  while (remainingL > 0 && guard++ < 64) {
    const vesselId = pickVesselFor(itemId, remainingL);
    if (!vesselId) return; // nothing in the game holds this — it spills, which is the rule working
    const n = drops.length;
    const inst: ItemInstance = {
      instanceId: `vessel-${vesselId}-${x}-${y}-${n}`,
      itemId: vesselId,
      durability: itemDefById(vesselId)?.maxDurability ?? 100,
      filter: [itemId]
    };
    const poured = putIn(inst, itemId, remainingL);
    if (poured <= 0) return;
    drops.push({
      id: `stored-${vesselId}-${x}-${y}-${n}`,
      resourceId: vesselId,
      x,
      y,
      quantity: 1,
      stored: true,
      instance: inst
    });
    remainingL -= poured;
  }
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
      if (!d.stored || d.reservedFor || (d.quantity ?? 0) <= 0) continue;
      if (d.resourceId === itemId) {
        const take = Math.min(d.quantity, remaining);
        newDropped[i] = { ...d, quantity: d.quantity - take };
        remaining -= take;
        continue;
      }
      // CONTAINERS-AND-FLUIDS: draw the rest out of what the stored VESSELS hold. The vessel itself
      // survives — emptying a jug leaves a jug — so only its contents are deducted.
      remaining = drawFromVessel(newDropped, i, itemId, remaining);
    }
  }

  const kept = newDropped.filter((d) => !d.stored || d.quantity > 0);
  return withDrops(state, kept);
}

/**
 * Take up to `remaining` UNITS of `itemId` out of the vessel at `drops[i]`, replacing that entry with
 * a copy whose instance carries the reduced contents (the array is the caller's working copy, but the
 * nested instance is still shared with the live state until this clones it). Returns what is left to
 * find elsewhere.
 */
function drawFromVessel(
  drops: DroppedItem[],
  i: number,
  itemId: string,
  remaining: number
): number {
  const d = drops[i];
  const held = heldQuantity(d.instance, itemId);
  if (held <= 0 || !d.instance) return remaining;
  const fluid = isFluidId(itemId);
  const wantNative = fluid ? remaining * litresPerUnit(itemId) : remaining;
  const inst = { ...d.instance, contents: d.instance.contents?.map((e) => ({ ...e })) };
  const got = takeOut(inst, itemId, Math.min(held, wantNative));
  if (got <= 0) return remaining;
  drops[i] = { ...d, instance: inst };
  return remaining - (fluid ? got / litresPerUnit(itemId) : got);
}

/**
 * CONTAINERS-AND-FLUIDS §3 — the item ids a stockpile zone's filter admits, for SEEDING a vessel that
 * has just been set down in it. A zone filters by CATEGORY; a vessel's own allow-list is by ID (a
 * waterskin is set to water, not to "drinks"), so the categories are expanded once, here, at the one
 * moment the two vocabularies have to meet. An unfiltered zone seeds nothing: "this stockpile takes
 * anything" is not the same instruction as "fill this barrel with anything you like".
 */
function zoneSeedFilter(state: GameState, x: number, y: number): string[] {
  if (!(state.zoneTiles?.[`${x},${y}`] ?? []).includes('stockpile')) return [];
  const zone = (state.zoneInstances ?? []).find(
    (z) => z.type === 'stockpile' && z.filter.allowedCategories.length > 0
  );
  if (!zone) return [];
  const allowed = new Set(zone.filter.allowedCategories);
  const blocked = new Set(zone.filter.blockedItems);
  const ids: string[] = [];
  for (const def of allItemDefs())
    if (allowed.has(def.category) && !blocked.has(def.id)) ids.push(def.id);
  return ids;
}

/** How many VESSELS are already standing, stored, on tile (x,y). */
export function tileVesselCount(state: GameState, x: number, y: number): number {
  let n = 0;
  for (const d of state.droppedItems ?? [])
    if (d.stored && d.x === x && d.y === y && d.instance && vesselOf(d.resourceId)) n++;
  return n;
}

/**
 * CONTAINERS-AND-FLUIDS §3 — pack a stored pile INTO a vessel already standing on its tile, DF-style:
 * a bin in a stockpile swallows the goods rather than the tile growing another loose heap. Only a
 * vessel whose own allow-list names the item takes it, so this can never quietly reshuffle a barrel
 * the player set aside for something else.
 *
 * Mutates `drops` in place (the caller's working copy) and returns how many units went in.
 */
function packIntoVesselOnTile(drops: DroppedItem[], idx: number, x: number, y: number): number {
  const d = drops[idx];
  if (!d || d.instance || (d.quantity ?? 0) <= 0) return 0; // a vessel is never packed into a vessel
  let packed = 0;
  for (let i = 0; i < drops.length && packed < d.quantity; i++) {
    const v = drops[i];
    if (i === idx || !v.stored || v.x !== x || v.y !== y || !v.instance) continue;
    if (!vesselAllows(v.instance, d.resourceId)) continue;
    const inst = { ...v.instance, contents: v.instance.contents?.map((e) => ({ ...e })) };
    const took = putIn(inst, d.resourceId, d.quantity - packed);
    if (took <= 0) continue;
    drops[i] = { ...v, instance: inst };
    packed += took;
  }
  return packed;
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

  // CONTAINERS-AND-FLUIDS §3 — DF's model: if a VESSEL standing on this tile takes the goods, they go
  // IN it rather than becoming another loose heap beside it. That is what makes a bin worth crafting.
  // Only what a vessel's own allow-list names is packed, so this can never repurpose a barrel quietly.
  if (drop.name == null && drop.instance == null && drop.quality == null) {
    const packing = (state.droppedItems ?? []).map((d) => ({ ...d }));
    const idx = packing.findIndex((d) => d.id === dropId);
    const packed = idx >= 0 ? packIntoVesselOnTile(packing, idx, drop.x, drop.y) : 0;
    if (packed > 0) {
      const left = drop.quantity - packed;
      const kept = packing.filter((d) => d.id !== dropId || left > 0);
      const j = kept.findIndex((d) => d.id === dropId);
      if (j >= 0) kept[j] = { ...kept[j], quantity: left, stored: true };
      return withDrops(state, kept);
    }
  }

  // Identity-tracked drops (a per-instance `name` override, a tracked `instance`, or a §Q craft
  // `quality` tier) must NOT be folded into a counted pile — that would erase the identity / merge
  // across quality tiers. Mark it stored in place as its own distinct pile.
  if (drop.name != null || drop.instance != null || drop.quality != null) {
    // A VESSEL set down in a stockpile inherits that stockpile's filter when it has none of its own —
    // telling a zone "food only" tells its barrels the same thing, instead of a second round of clicks.
    const seeded =
      drop.instance && vesselOf(drop.resourceId) && !(drop.instance.filter ?? []).length
        ? zoneSeedFilter(state, drop.x, drop.y)
        : null;
    const newDropped = (state.droppedItems ?? []).map((d) =>
      d.id === dropId
        ? {
            ...d,
            stored: true,
            ...(seeded?.length ? { instance: { ...d.instance!, filter: seeded } } : {})
          }
        : d
    );
    return withDrops(state, newDropped);
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
  return withDrops(state, newDropped);
}
