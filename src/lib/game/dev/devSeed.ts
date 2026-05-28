/**
 * devSeed.ts — Dev/test utility
 *
 * Calling buildDevSeedState() patches a GameState snapshot so you can
 * immediately test any feature without grinding through early-game:
 *   - All items added to the general stockpile at a configurable quantity
 *   - All locations discovered in LocationService + state
 *   - All research completed, no current research in progress
 *   - Tool level set to max (5)
 *   - Max population raised to 50
 */

import type { GameState } from '../core/types';
import { addToStockpileZone } from '../core/GameState';
import { locationService } from '../services/LocationServices';
import { LOCATION_TEMPLATES } from '../core/Locations';
import itemsData from '../database/items.jsonc';
import researchData from '../database/research.jsonc';

const ALL_ITEM_IDS = (itemsData as unknown as { id: string }[]).map((i) => i.id);
const ALL_RESEARCH_IDS = (researchData as unknown as { id: string }[]).map((r) => r.id);

export function buildDevSeedState(state: GameState, itemQty = 500): GameState {
    // 1. Mark every location as discovered inside the service
    LOCATION_TEMPLATES.forEach((t) => locationService.discoverLocation(t.id));

    // 2. Sync state.discoveredLocations with what the service now considers discovered
    const allDiscovered = locationService
        .getDiscoveredLocations()
        .map((loc) => ({ ...loc, discovered: true }));

    // 3. Build item payload
    const itemPayload: Record<string, number> = {};
    ALL_ITEM_IDS.forEach((id) => {
        itemPayload[id] = itemQty;
    });

    // 4. Inject items into the general stockpile
    let seeded = addToStockpileZone(state, null, itemPayload);

    // 5. Patch research, tool level, population, and discovered locations
    seeded = {
        ...seeded,
        completedResearch: ALL_RESEARCH_IDS,
        availableResearch: [],
        currentResearch: undefined,
        currentToolLevel: 5,
        maxPopulation: 50,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        discoveredLocations: allDiscovered as any
    };

    return seeded;
}
