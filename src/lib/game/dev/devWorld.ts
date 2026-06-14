/**
 * devWorld.ts — Dev-mode world setup
 *
 * Called after world generation when dev mode is active.
 * Places real tile-based zones on the map (stockpile, forage, scavenge)
 * and pre-stocks the stockpile zone with every item so you can test any
 * feature without playing through early-game.
 *
 * Zone layout (relative to nearest walkable anchor near map centre ax, ay):
 *   Stockpile  : ax-4..ax+3,   ay-4..ay+3    (8×8, centred on anchor)
 *   Forage     : ax-26..ax-11, ay-8..ay+7    (16×16, left)
 *   Scavenge   : ax+11..ax+26, ay-8..ay+7    (16×16, right)
 */

import type {
  GameState,
  StockpileZone,
  ZoneInstance,
  ZoneFilter,
  DroppedItem,
  DesignationType
} from '../core/types';
import itemsData from '../database/items.jsonc';
import researchData from '../database/research.jsonc';

// Exclude `natural_weapon` items (fists/kick/claw/bite…) — they're innate attacks, never real
// droppable objects, so spawning/pre-stocking them as physical piles is nonsensical.
const ALL_ITEM_IDS = (itemsData as unknown as { id: string; category?: string }[])
  .filter((i) => i.category !== 'natural_weapon')
  .map((i) => i.id);
const ALL_RESEARCH_IDS = (researchData as unknown as { id: string }[]).map((r) => r.id);

const EMPTY_FILTER: ZoneFilter = { allowedCategories: [], blockedItems: [] };

// ---- helpers --------------------------------------------------------

function tileKey(x: number, y: number): string {
  return `${x},${y}`;
}

/**
 * Spiral outward from (cx, cy) using Chebyshev distance to find the
 * nearest walkable tile. Guarantees the returned tile is inside the map.
 */
function findWalkableAnchor(
  worldMap: GameState['worldMap'],
  cx: number,
  cy: number
): { x: number; y: number } {
  const mapH = worldMap.length;
  const mapW = worldMap[0]?.length ?? 0;
  const maxR = Math.max(mapW, mapH);
  for (let r = 0; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; // ring only
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= mapW || y >= mapH) continue;
        if (worldMap[y][x].walkable) return { x, y };
      }
    }
  }
  return { x: cx, y: cy };
}

/** Collect all "x,y" keys in a rect, keeping only walkable tiles in the world map. */
function rectTiles(
  worldMap: GameState['worldMap'],
  x1: number,
  y1: number,
  x2: number,
  y2: number
): string[] {
  const mapH = worldMap.length;
  const mapW = worldMap[0]?.length ?? 0;
  const keys: string[] = [];
  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) {
      if (x < 0 || y < 0 || x >= mapW || y >= mapH) continue;
      if (worldMap[y][x].walkable) keys.push(tileKey(x, y));
    }
  }
  return keys;
}

// ---- main export ----------------------------------------------------

export function applyDevWorld(state: GameState, itemQty = 500): GameState {
  const mapW = state.worldMap[0]?.length ?? 240;
  const mapH = state.worldMap.length;
  const cx = Math.floor(mapW / 2);
  const cy = Math.floor(mapH / 2);

  // Spiral-search from the geometric centre to guarantee a walkable anchor.
  // All zones are placed relative to this anchor so at least the stockpile
  // centre tile is always walkable.
  const anchor = findWalkableAnchor(state.worldMap, cx, cy);
  const ax = anchor.x;
  const ay = anchor.y;

  // --- 1. Zone geometry -------------------------------------------
  const stockpileTiles = rectTiles(state.worldMap, ax - 4, ay - 4, ax + 3, ay + 3); // 8×8

  // --- 2. Build stockpile inventory --------------------------------
  const stockpileInventory: Record<string, number> = {};
  ALL_ITEM_IDS.forEach((id) => {
    stockpileInventory[id] = itemQty;
  });
  const aggregate: Record<string, number> = { ...stockpileInventory };

  // --- 2b. Physical stored items (droppedItems with stored=true) ---
  // Each unique item type gets one tile in the stockpile so the renderer
  // shows glyphs and the capacity system tracks them correctly.
  const stockpileTileCoords = stockpileTiles.map((key) => {
    const [x, y] = key.split(',').map(Number);
    return { key, x, y };
  });
  const storedDrops: DroppedItem[] = [];
  let tileIdx = 0;
  for (const [itemId, qty] of Object.entries(stockpileInventory)) {
    if (tileIdx >= stockpileTileCoords.length) break;
    const tile = stockpileTileCoords[tileIdx++];
    storedDrops.push({
      id: `dev-stored-${itemId}`,
      resourceId: itemId,
      x: tile.x,
      y: tile.y,
      quantity: qty,
      stored: true
    });
  }

  // --- 3. StockpileZone (replaces zone-general) --------------------
  const stockpileZone: StockpileZone = {
    id: 'zone-general',
    name: 'Dev Stockpile',
    tiles: stockpileTiles,
    filter: EMPTY_FILTER,
    inventory: stockpileInventory
  };

  // --- 4. ZoneInstances -------------------------------------------
  // NOTE: 'harvest' is a WORK glyph (!) not a zone tint — do not use it here.
  const stockpileInstance: ZoneInstance = {
    id: 'dev-stockpile-1',
    type: 'stockpile',
    label: 'Dev Stockpile',
    filter: EMPTY_FILTER
  };

  // --- 5. Designations + zoneId map --------------------------------
  // Strip any pre-existing 'harvest' work designations left over from old saves.
  const designations: Record<string, string> = {};
  for (const [k, v] of Object.entries(state.designations ?? {})) {
    if (v !== 'harvest') designations[k] = v;
  }
  const designationZoneId: Record<string, string> = { ...(state.designationZoneId ?? {}) };
  // Stockpile is a standing zone — store it in zoneTiles (not the single-value designations map)
  // so it coexists with harvest/woodcut orders on the same tile.
  const zoneTiles: Record<string, DesignationType[]> = { ...(state.zoneTiles ?? {}) };

  for (const k of stockpileTiles) {
    const cur = zoneTiles[k] ?? [];
    if (!cur.includes('stockpile')) zoneTiles[k] = [...cur, 'stockpile'];
    designationZoneId[k] = stockpileInstance.id;
  }

  // --- 6. Assemble new state --------------------------------------
  return {
    ...state,
    stockpile: aggregate,
    stockpileZones: [stockpileZone],
    zoneInstances: [stockpileInstance],
    designations: designations as GameState['designations'],
    zoneTiles,
    designationZoneId,
    droppedItems: storedDrops,
    completedResearch: ALL_RESEARCH_IDS,
    availableResearch: [],
    currentResearch: undefined,
    currentToolLevel: 5,
    maxPopulation: 50,
    turn: 100 // 08:00
  };
}

/**
 * Dev timesaver that respects ADR-016 (items are ALWAYS physical objects in a location).
 * Spawns `qty` of EVERY item as **loose `DroppedItem`s on distinct walkable ground tiles**,
 * spiralling out from the colony (the first pawn, else map centre). They are real objects on
 * the ground — the normal haul pipeline carries them into stockpiles (respecting tile capacity),
 * exactly like anything gathered. Nothing is written to the derived `stockpile` aggregate, so
 * there is **no ephemeral/magical pathway** into the colony's stock.
 */
export function devSpawnLooseItems(state: GameState, qty = 500): GameState {
  const worldMap = state.worldMap;
  const mapW = worldMap[0]?.length ?? 240;
  const mapH = worldMap.length;
  const start = state.pawns?.find((p) => p.position)?.position ?? {
    x: Math.floor(mapW / 2),
    y: Math.floor(mapH / 2)
  };
  const anchor = findWalkableAnchor(worldMap, start.x, start.y);

  // Keep one loose pile per tile so placement stays physical — never stack unlike items.
  const occupied = new Set((state.droppedItems ?? []).map((d) => tileKey(d.x, d.y)));
  const newDrops: DroppedItem[] = [];
  let placed = 0;
  const maxR = Math.max(mapW, mapH);

  for (let r = 0; r <= maxR && placed < ALL_ITEM_IDS.length; r++) {
    for (let dy = -r; dy <= r && placed < ALL_ITEM_IDS.length; dy++) {
      for (let dx = -r; dx <= r && placed < ALL_ITEM_IDS.length; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; // current ring only
        const x = anchor.x + dx;
        const y = anchor.y + dy;
        if (x < 0 || y < 0 || x >= mapW || y >= mapH) continue;
        if (!worldMap[y][x].walkable) continue;
        const key = tileKey(x, y);
        if (occupied.has(key)) continue;
        occupied.add(key);
        const itemId = ALL_ITEM_IDS[placed++];
        newDrops.push({
          id: `dev-loose-${itemId}-${x}-${y}`,
          resourceId: itemId,
          x,
          y,
          quantity: qty,
          stored: false
        });
      }
    }
  }

  return { ...state, droppedItems: [...(state.droppedItems ?? []), ...newDrops] };
}

/**
 * Dev inverse of {@link devSpawnLooseItems}: destroy ALL physical items in the colony — every
 * `DroppedItem` (loose and stored) and everything carried in pawn inventories. The derived
 * `stockpile` aggregate empties itself (it only counts `stored` drops, now none). Worn equipment
 * is left alone. In-flight craft/build orders that reserved now-gone inputs simply go unsupplied.
 */
export function devDestroyAllItems(state: GameState): GameState {
  return {
    ...state,
    droppedItems: [],
    stockpile: {},
    pawns: state.pawns.map((p) =>
      p.inventory ? { ...p, inventory: { ...p.inventory, items: {}, instances: [] } } : p
    )
  };
}
