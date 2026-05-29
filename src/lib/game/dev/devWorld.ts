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

import type { GameState, StockpileZone, ZoneInstance, ZoneFilter } from '../core/types';
import { locationService } from '../services/LocationServices';
import { LOCATION_TEMPLATES } from '../core/Locations';
import itemsData from '../database/items.jsonc';
import researchData from '../database/research.jsonc';

const ALL_ITEM_IDS = (itemsData as unknown as { id: string }[]).map((i) => i.id);
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
    x1: number, y1: number,
    x2: number, y2: number
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
    const stockpileTiles = rectTiles(state.worldMap, ax - 4, ay - 4, ax + 3, ay + 3);  // 8×8
    const forageTiles = rectTiles(state.worldMap, ax - 26, ay - 8, ax - 11, ay + 7);  // 16×16
    const scavengeTiles = rectTiles(state.worldMap, ax + 11, ay - 8, ax + 26, ay + 7);  // 16×16

    // --- 2. Build stockpile inventory --------------------------------
    const stockpileInventory: Record<string, number> = {};
    ALL_ITEM_IDS.forEach((id) => { stockpileInventory[id] = itemQty; });
    const aggregate: Record<string, number> = { ...stockpileInventory };

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
    const stockpileInstance: ZoneInstance = { id: 'dev-stockpile-1', type: 'stockpile', label: 'Dev Stockpile', filter: EMPTY_FILTER };
    const forageInstance: ZoneInstance = { id: 'dev-forage-1', type: 'forage', label: 'Forage 1', filter: EMPTY_FILTER };
    const scavengeInstance: ZoneInstance = { id: 'dev-scavenge-1', type: 'scavenge', label: 'Scavenge 1', filter: EMPTY_FILTER };

    // --- 5. Designations + zoneId map --------------------------------
    // Strip any pre-existing 'harvest' work designations left over from old saves.
    const designations: Record<string, string> = {};
    for (const [k, v] of Object.entries(state.designations ?? {})) {
        if (v !== 'harvest') designations[k] = v;
    }
    const designationZoneId: Record<string, string> = { ...(state.designationZoneId ?? {}) };

    for (const k of stockpileTiles) {
        designations[k] = 'stockpile';
        designationZoneId[k] = stockpileInstance.id;
    }
    for (const k of forageTiles) {
        designations[k] = 'forage';
        designationZoneId[k] = forageInstance.id;
    }
    for (const k of scavengeTiles) {
        designations[k] = 'scavenge';
        designationZoneId[k] = scavengeInstance.id;
    }

    // --- 6. Discover all locations -----------------------------------
    LOCATION_TEMPLATES.forEach((t) => locationService.discoverLocation(t.id));
    const allDiscovered = locationService
        .getDiscoveredLocations()
        .map((loc) => ({ ...loc, discovered: true }));

    // --- 7. Assemble new state --------------------------------------
    return {
        ...state,
        stockpile: aggregate,
        stockpileZones: [stockpileZone],
        zoneInstances: [stockpileInstance, forageInstance, scavengeInstance],
        designations: designations as GameState['designations'],
        designationZoneId,
        completedResearch: ALL_RESEARCH_IDS,
        availableResearch: [],
        currentResearch: undefined,
        currentToolLevel: 5,
        maxPopulation: 50,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        discoveredLocations: allDiscovered as any
    };
}
