// Background-maintained cache of the EXPLORE tab's "every discovered resource node" ledger.
//
// The scan is O(map) — on a big forested 500×500 map that's tens of thousands of nodes plus a sort,
// which is too slow to run synchronously when the tab is clicked open (the component used to build it
// on mount, so every open paid the full cost). Instead this store keeps the rows cached and rebuilds
// them lazily in the BACKGROUND: a turn-bucket dirty flag marks the cache stale, and the actual scan
// runs in idle time, throttled. Opening the tab then just reads a ready array — no work on the click
// path. Kept warm from game start by being imported in +page.svelte (see refreshDiscoveredResources).
import { writable, get } from 'svelte/store';
import { gameState } from './gameState';
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

// Throttle: rebuild at most once per REFRESH_TURNS-turn bucket — resource discovery/harvest/regrow
// only meaningfully shifts the ledger across turns, so a per-tick rebuild would be wasted work.
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

// Marked dirty when the turn advances into a new bucket; the scan itself is deferred to idle time so
// it never blocks a frame or the sim. Coalesced via `scheduled` so a burst of turns books one rebuild.
function maybeScheduleRebuild(turn: number) {
  const bucket = Math.floor(turn / REFRESH_TURNS);
  if (bucket === builtBucket || scheduled) return;
  scheduled = true;
  scheduleIdle(() => {
    scheduled = false;
    rebuildNow();
  });
}

// Self-maintaining subscription: fires immediately with the current state (warming the cache shortly
// after load) and on every subsequent turn advance. Lives for the app's lifetime — there is one
// gameState, and the cache is cheap to hold.
gameState.subscribe((s) => maybeScheduleRebuild(s.turn ?? 0));

/** Force a synchronous rebuild *only if the cache has never been built* — the EXPLORE tab calls this
 *  on mount as a safety net so a first open before the idle warm-up still shows data (subsequent opens
 *  and all updates come from the background rebuild). */
export function ensureDiscoveredResources(): void {
  if (builtBucket === -1) rebuildNow();
}
