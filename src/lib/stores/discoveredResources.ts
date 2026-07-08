// Cached ledger of every discovered resource node (EXPLORE tab). The scan is O(map) — too slow for
// the tab-open click path — so rows rebuild in idle time, gated by a turn-bucket dirty flag.
import { writable, get } from 'svelte/store';
import { gameState } from './gameState';
import { uiState } from './uiState';
import { resourceObjectService } from '$lib/game/services/ResourceObjectService';
import type { WorldTile } from '$lib/game/core/types';

export interface ResourceRow {
  id: string;
  name: string;
  color: string;
  type: string; // work category (woodcutting / mining / foraging …) or "lair"
  amount: number;
  x: number;
  y: number;
}

export const discoveredResources = writable<ResourceRow[]>([]);

function rgb(c: [number, number, number]): string {
  return `rgb(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)})`;
}

// One row per resource present on each discovered tile, sorted by name then position.
function buildRows(worldMap: WorldTile[][]): ResourceRow[] {
  const out: ResourceRow[] = [];
  for (const line of worldMap ?? []) {
    for (const t of line) {
      if (!t.discovered || !t.resources) continue;
      for (const id in t.resources) {
        const amount = t.resources[id];
        if (amount <= 0) continue;
        const def = resourceObjectService.getById(id);
        out.push({
          id,
          name: def?.displayName ?? id.replace(/_/g, ' '),
          color: def?.fg ? rgb(def.fg) : 'var(--text-dim)',
          // Lairs read as "lair" (not their harvest workCategory "foraging") — clearer, and lets the
          // search term "lair" match every den/nest/warren even though their names don't contain it.
          type: def?.lair ? 'lair' : (def?.interaction?.workCategory ?? '—'),
          amount,
          x: t.x,
          y: t.y
        });
      }
    }
  }
  out.sort((a, b) => a.name.localeCompare(b.name) || a.x - b.x || a.y - b.y);
  return out;
}

// Rebuild at most once per REFRESH_TURNS-turn bucket — the ledger only shifts meaningfully across turns.
const REFRESH_TURNS = 15;
let builtBucket = -1;
let scheduled = false;

function scheduleIdle(fn: () => void) {
  if (typeof requestIdleCallback !== 'undefined') requestIdleCallback(fn, { timeout: 500 });
  else if (typeof setTimeout !== 'undefined') setTimeout(fn, 0);
  else fn();
}

function rebuildNow() {
  const s = get(gameState);
  builtBucket = Math.floor((s.turn ?? 0) / REFRESH_TURNS);
  discoveredResources.set(buildRows(s.worldMap ?? []));
}

// Only maintain the ledger while the EXPLORE tab is OPEN — closed means no rebuilds; opening
// rebuilds once if stale, then keeps it fresh.
let exploreOpen = false;

// Scan is deferred to idle time so it never blocks a frame or the sim; coalesced via `scheduled`
// so a burst of turns books one rebuild.
function maybeScheduleRebuild(turn: number) {
  if (!exploreOpen) return;
  const bucket = Math.floor(turn / REFRESH_TURNS);
  if (bucket === builtBucket || scheduled) return;
  scheduled = true;
  scheduleIdle(() => {
    scheduled = false;
    rebuildNow();
  });
}

// App-lifetime subscription — there is one gameState.
gameState.subscribe((s) => maybeScheduleRebuild(s.turn ?? 0));

// Rebuild on the EXPLORE tab opening if the cache is stale.
uiState.subscribe((s) => {
  const open = s.currentScreen === 'exploration';
  if (open && !exploreOpen) {
    const bucket = Math.floor((get(gameState).turn ?? 0) / REFRESH_TURNS);
    if (bucket !== builtBucket) rebuildNow();
  }
  exploreOpen = open;
});

/** Synchronous rebuild only if the cache has never been built — mount-time safety net so a first
 *  open before the idle warm-up still shows data. */
export function ensureDiscoveredResources(): void {
  if (builtBucket === -1) rebuildNow();
}
