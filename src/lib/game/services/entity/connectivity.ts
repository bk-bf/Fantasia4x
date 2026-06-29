/* filepath: src/lib/game/services/entity/connectivity.ts */
/**
 * Walkable-connectivity components (ADR-008-adjacent — but a slow LABELLING pass, not a per-query spatial
 * service like A-star / nearest / fog, so it lives worker-side in TS like the thermal field + wild-growth).
 *
 * A cheap periodic flood-fill stamps every walkable tile with a component id, so AI target selection can
 * reject an UNREACHABLE goal in O(1) — a forager only eyes food in its OWN component, a hunter only
 * reachable prey — instead of the old "pick nearest → A* → fail → sweep the whole region" (the 78%-fail
 * perf cliff on a big, disconnected map). It also reads cleaner: targeting knows reachability up front.
 *
 * Connectivity matches the WASM A* EXACTLY: 8-connected, with diagonal CORNER-CUT prevention (a diagonal
 * links only when at least one of the two orthogonal neighbours is walkable — see spatial-core find_path).
 * So `reachable()` never over-reports vs. what A* can actually walk; the per-call A* node cap remains the
 * backstop for the rare stale label (a passage mined / ice thawed between rebuilds).
 *
 * Rebuilt on a SLOW cadence — connectivity only changes on mining a wall, build/deconstruct, or ice
 * freeze/thaw, all infrequent — plus immediately on a worldMap REF change (new map / load). Single-
 * threaded sim ⇒ a module singleton is safe (same pattern as rebuildThermalField / wildGrowth).
 */
import type { WorldTile } from '../../core/types';

let _comp: Int32Array | null = null;
let _w = 0;
let _h = 0;
let _ref: WorldTile[][] | null = null;
let _builtTurn = -1e9;

/** Ticks between full rebuilds. Connectivity changes are rare + slow, so this only bounds how quickly a
 *  freshly-mined passage / thawed crossing is recognised (≈5s at 1×). The flood is O(map), done off-tick
 *  cadence; the A* node cap covers the gap between rebuilds. */
const REBUILD_TICKS = 300;

/** Full flood-fill relabel of every walkable component (O(map); each tile visited once). */
export function rebuildConnectivity(worldMap: WorldTile[][]): void {
  const h = worldMap.length;
  const w = h ? (worldMap[0]?.length ?? 0) : 0;
  const n = w * h;
  const comp = new Int32Array(n).fill(-1);
  const stack = new Int32Array(n); // preallocated DFS stack (each tile pushed at most once) — no GC churn
  let id = 0;
  for (let s = 0; s < n; s++) {
    if (comp[s] !== -1 || !worldMap[(s / w) | 0][s % w].walkable) continue;
    comp[s] = id;
    let sp = 0;
    stack[sp++] = s;
    while (sp > 0) {
      const c = stack[--sp];
      const cx = c % w;
      const cy = (c / w) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = cy + dy;
        if (ny < 0 || ny >= h) continue;
        const row = worldMap[ny];
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = cx + dx;
          if (nx < 0 || nx >= w) continue;
          const ni = ny * w + nx;
          if (comp[ni] !== -1 || !row[nx].walkable) continue;
          // Corner-cut rule (match A*): a diagonal links only if an orthogonal neighbour is also open.
          if (dx !== 0 && dy !== 0 && !worldMap[cy][nx].walkable && !worldMap[ny][cx].walkable) continue;
          comp[ni] = id;
          stack[sp++] = ni;
        }
      }
    }
    id++;
  }
  _comp = comp;
  _w = w;
  _h = h;
}

/** Rebuild if the map reference changed (new map / load) or the cadence elapsed. Call once per tick. */
export function maybeRebuildConnectivity(worldMap: WorldTile[][], turn: number): void {
  if (worldMap !== _ref || turn - _builtTurn >= REBUILD_TICKS) {
    rebuildConnectivity(worldMap);
    _ref = worldMap;
    _builtTurn = turn;
  }
}

/** Component id at a tile (−1 = unwalkable / out of bounds / not yet built). */
export function componentAt(x: number, y: number): number {
  if (!_comp || x < 0 || y < 0 || x >= _w || y >= _h) return -1;
  return _comp[y * _w + x];
}

/**
 * Whether (x1,y1) and (x2,y2) sit in the SAME walkable component — i.e. A* could path between them.
 * Returns `true` when connectivity hasn't been built yet (no map), so callers degrade to the old
 * try-and-bail behaviour rather than refusing every target before the first flood.
 */
export function reachable(x1: number, y1: number, x2: number, y2: number): boolean {
  if (!_comp) return true; // not built yet → don't gate (A* + node cap still protect us)
  const a = componentAt(x1, y1);
  return a >= 0 && a === componentAt(x2, y2);
}

/** Test / hard-reset hook. */
export function clearConnectivity(): void {
  _comp = null;
  _ref = null;
  _builtTurn = -1e9;
}
