import type {
  GameState,
  StockpileZone,
  ZoneInstance,
  ZoneFilter,
  DroppedItem,
  DesignationType
} from '../core/types';
import itemsData from '../database/items/items.json';
import researchData from '../database/progression/research.json';

const ALL_ITEM_IDS = (itemsData as unknown as { id: string; category?: string }[])
  .filter((i) => i.category !== 'natural_weapon')
  .map((i) => i.id);
const ALL_RESEARCH_IDS = (researchData as unknown as { id: string }[]).map((r) => r.id);

const EMPTY_FILTER: ZoneFilter = { allowedCategories: [], blockedItems: [] };

function tileKey(x: number, y: number): string {
  return `${x},${y}`;
}

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
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= mapW || y >= mapH) continue;
        if (worldMap[y][x].walkable) return { x, y };
      }
    }
  }
  return { x: cx, y: cy };
}

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

export function applyDevWorld(state: GameState, itemQty = 500): GameState {
  const mapW = state.worldMap[0]?.length ?? 240;
  const mapH = state.worldMap.length;
  const cx = Math.floor(mapW / 2);
  const cy = Math.floor(mapH / 2);

  const anchor = findWalkableAnchor(state.worldMap, cx, cy);
  const ax = anchor.x;
  const ay = anchor.y;

  const stockpileTiles = rectTiles(state.worldMap, ax - 4, ay - 4, ax + 3, ay + 3);

  const stockpileInventory: Record<string, number> = {};
  ALL_ITEM_IDS.forEach((id) => {
    stockpileInventory[id] = itemQty;
  });
  const aggregate: Record<string, number> = { ...stockpileInventory };

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

  const stockpileZone: StockpileZone = {
    id: 'zone-general',
    name: 'Dev Stockpile',
    tiles: stockpileTiles,
    filter: EMPTY_FILTER,
    inventory: stockpileInventory
  };

  const stockpileInstance: ZoneInstance = {
    id: 'dev-stockpile-1',
    type: 'stockpile',
    label: 'Dev Stockpile',
    filter: EMPTY_FILTER
  };

  const designations: Record<string, string> = {};
  for (const [k, v] of Object.entries(state.designations ?? {})) {
    if (v !== 'harvest') designations[k] = v;
  }
  const designationZoneId: Record<string, Partial<Record<DesignationType, string>>> = {
    ...(state.designationZoneId ?? {})
  };
  const zoneTiles: Record<string, DesignationType[]> = { ...(state.zoneTiles ?? {}) };

  for (const k of stockpileTiles) {
    const cur = zoneTiles[k] ?? [];
    if (!cur.includes('stockpile')) zoneTiles[k] = [...cur, 'stockpile'];
    designationZoneId[k] = { ...designationZoneId[k], stockpile: stockpileInstance.id };
  }

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
    turn: 100
  };
}

export function devSpawnLooseItems(state: GameState, qty = 500): GameState {
  const worldMap = state.worldMap;
  const mapW = worldMap[0]?.length ?? 240;
  const mapH = worldMap.length;
  const start = state.pawns?.find((p) => p.position)?.position ?? {
    x: Math.floor(mapW / 2),
    y: Math.floor(mapH / 2)
  };
  const anchor = findWalkableAnchor(worldMap, start.x, start.y);

  const occupied = new Set((state.droppedItems ?? []).map((d) => tileKey(d.x, d.y)));
  const newDrops: DroppedItem[] = [];
  let placed = 0;
  const maxR = Math.max(mapW, mapH);

  for (let r = 0; r <= maxR && placed < ALL_ITEM_IDS.length; r++) {
    for (let dy = -r; dy <= r && placed < ALL_ITEM_IDS.length; dy++) {
      for (let dx = -r; dx <= r && placed < ALL_ITEM_IDS.length; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
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
