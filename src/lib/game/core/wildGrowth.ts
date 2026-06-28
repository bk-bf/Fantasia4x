import type { WorldTile } from './types';

/**
 * Worker-side set of tiles whose wild ground-cover (berry bush, wild grain, grass…) is REGROWING
 * after a harvest/graze — i.e. a `regrowsFromZero` resource sitting at count 0 with growth < 100.
 *
 * These plants don't snap back via a binary regrowth cooldown (the tree/rock model). On harvest their
 * growth is reset to 0 (the tile shows bare soil), then `GameEngineImpl.processWildGrowth` climbs growth
 * gradually 0→100 and restores the node's count at maturity — so the plant fades back in instead of
 * popping. This set is the bounded work-list that pass iterates, mirroring the `regrowthQueue` heap: it
 * never scans the whole map per tick (ENGINE-PERFORMANCE — no per-tick O(map) pass), only the handful of
 * tiles currently recovering. The sim is single-threaded inside the worker, so a module singleton is safe.
 *
 * Fed from the harvest set-site (`jobs/harvest.ts`) and grazing depletion (`entity/entityAI.ts`); rebuilt
 * once from the map on a worldMap REPLACE (load / regen / test) via {@link rebuildWildGrowth}.
 */

/** Below this growth% a regrowing plant is drawn as bare soil and is not yet selectable as a resource
 *  (it reappears, dimmed, once it crosses the threshold). Shared by the renderer + selection. */
export const RESOURCE_VISIBLE_GROWTH = 20;

// Keyed "y,x" (matches tileDeltas) so repeated adds to the same tile collapse.
const regrowing = new Set<string>();

/** Mark `worldMap[y][x]` as having a regrowing wild plant (call when its count drops to 0). */
export function addWildGrowth(x: number, y: number): void {
  regrowing.add(y + ',' + x);
}

/** Remove a tile from the regrow work-list (its plant matured, or the tile was cleared). */
export function removeWildGrowth(x: number, y: number): void {
  regrowing.delete(y + ',' + x);
}

/** Number of tiles currently regrowing (the consumer early-outs when 0 — peace path is free). */
export function wildGrowthSize(): number {
  return regrowing.size;
}

/** Snapshot the regrowing tiles as `{x,y}` (a copy, so the consumer can remove during iteration). */
export function wildGrowthEntries(): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (const key of regrowing) {
    const ci = key.indexOf(',');
    out.push({ y: +key.slice(0, ci), x: +key.slice(ci + 1) });
  }
  return out;
}

/** Reset the work-list (tests / hard resets). */
export function clearWildGrowth(): void {
  regrowing.clear();
}

/**
 * Rebuild the work-list from a worldMap — called once on a map REPLACE (load / regen / test). Scans the
 * map (O(map), but only on replace, never per-tick) and adds every tile holding a `regrowsFromZero`
 * resource that is still immature (growth < 100) and depleted (count 0). `isRegrowsFromZero` is injected
 * by the caller (the resource DB lives a layer up — keeping this core module dependency-free).
 */
export function rebuildWildGrowth(
  worldMap: WorldTile[][],
  isRegrowsFromZero: (resourceId: string) => boolean
): void {
  regrowing.clear();
  for (let y = 0; y < worldMap.length; y++) {
    const row = worldMap[y];
    for (let x = 0; x < row.length; x++) {
      const growth = row[x].growth;
      if (!growth) continue;
      for (const id in growth) {
        if (growth[id] >= 100) continue;
        if ((row[x].resources?.[id] ?? 0) > 0) continue;
        if (isRegrowsFromZero(id)) {
          regrowing.add(y + ',' + x);
          break;
        }
      }
    }
  }
}
