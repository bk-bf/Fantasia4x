/**
 * devWorld.ts — Dev-mode world setup
 *
 * Called after world generation when dev mode is active.
 * Places real tile-based zones on the map (stockpile, forage, harvest,
 * scavenge) and pre-stocks the stockpile zone with every item so you
 * can test any feature without playing through early-game.
 *
 * Zone layout (relative to map centre cx, cy):
 *   Stockpile  : cx-4..cx+3,  cy-4..cy+3   (8×8 block)
 *   Forage     : cx-18..cx-11, cy-4..cy+3   (left)
 *   Harvest    : cx+11..cx+18, cy-4..cy+3   (right)
 *   Scavenge   : cx-4..cx+3,  cy-18..cy-11  (above)
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

/** Collect all "x,y" keys in a rect, keeping only walkable tiles in the world map. */
function rectTiles(
	state: GameState,
	x1: number, y1: number,
	x2: number, y2: number
): string[] {
	const mapH = state.worldMap.length;
	const mapW = state.worldMap[0]?.length ?? 0;
	const keys: string[] = [];
	for (let y = y1; y <= y2; y++) {
		for (let x = x1; x <= x2; x++) {
			if (x < 0 || y < 0 || x >= mapW || y >= mapH) continue;
			if (state.worldMap[y][x].walkable) keys.push(tileKey(x, y));
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

	// --- 1. Zone geometry -------------------------------------------
	const stockpileTiles = rectTiles(state, cx - 4, cy - 4, cx + 3, cy + 3);
	const forageTiles    = rectTiles(state, cx - 18, cy - 4, cx - 11, cy + 3);
	const harvestTiles   = rectTiles(state, cx + 11, cy - 4, cx + 18, cy + 3);
	const scavengeTiles  = rectTiles(state, cx - 4, cy - 18, cx + 3, cy - 11);

	// --- 2. Build stockpile inventory --------------------------------
	const stockpileInventory: Record<string, number> = {};
	ALL_ITEM_IDS.forEach((id) => { stockpileInventory[id] = itemQty; });

	// Aggregate across ALL zones (stockpile is the only one with items)
	const aggregate: Record<string, number> = { ...stockpileInventory };

	// --- 3. StockpileZone (replaces zone-general) --------------------
	const stockpileZone: StockpileZone = {
		id: 'zone-general',
		name: 'Dev Stockpile',
		tiles: stockpileTiles,
		filter: EMPTY_FILTER,
		inventory: stockpileInventory
	};

	// --- 4. ZoneInstances (work zones) -------------------------------
	const forageInstance: ZoneInstance   = { id: 'dev-forage-1',   type: 'forage',   label: 'Forage 1',   filter: EMPTY_FILTER };
	const harvestInstance: ZoneInstance  = { id: 'dev-harvest-1',  type: 'harvest',  label: 'Harvest 1',  filter: EMPTY_FILTER };
	const scavengeInstance: ZoneInstance = { id: 'dev-scavenge-1', type: 'scavenge', label: 'Scavenge 1', filter: EMPTY_FILTER };

	// --- 5. Designations + zoneId map --------------------------------
	const designations: Record<string, string> = { ...(state.designations ?? {}) };
	const designationZoneId: Record<string, string> = { ...(state.designationZoneId ?? {}) };

	for (const k of stockpileTiles) {
		designations[k] = 'stockpile';
	}
	for (const k of forageTiles) {
		designations[k] = 'forage';
		designationZoneId[k] = forageInstance.id;
	}
	for (const k of harvestTiles) {
		designations[k] = 'harvest';
		designationZoneId[k] = harvestInstance.id;
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
		zoneInstances: [forageInstance, harvestInstance, scavengeInstance],
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
