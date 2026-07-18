// Worker-safe runtime check instead of $app/environment (which can't bundle into the sim worker
// that imports this service — ADR-021 W1). `isClientRuntime` is true in the browser main thread
// AND in a Web Worker, false in SSR/Node/vitest — same gate semantics as the old `browser`.
import { isClientRuntime } from '../core/runtime';
import type { PathfinderService } from './PathfinderService.js';

type WasmMod = {
  find_path: (
    walkable: Uint8Array,
    costs: Float32Array,
    width: number,
    height: number,
    sx: number,
    sy: number,
    ex: number,
    ey: number,
    max_iter: number
  ) => Uint32Array;
  // ENGINE-PERFORMANCE-II §S1: batch nearest-entity query (uniform grid). For each query point, the
  // index into `points` of the nearest within `maxDist`, or -1.
  nearest_each: (points: Float32Array, queries: Float32Array, maxDist: number) => Int32Array;
};

class WasmPathfinderServiceImpl implements PathfinderService {
  private mod: WasmMod | null = null;
  private _initPromise: Promise<void> | null = null;

  /**
   * Initialize WASM. Idempotent — safe to call multiple times.
   *
   * Browser/worker: the wasm-bindgen `--target web` default path (fetch by URL).
   * Node (HEADLESS-SIM / ADR-033): the same glue + the same `.wasm`, but the bytes are read off
   * disk and handed to `initSync` — `fetch` can't load `file:` URLs in Node, and rebuilding with
   * `--target nodejs` would fork the artifact. Same module either way, so A* tie-breaking is
   * byte-identical between the client and a headless run. Existing non-headless vitest suites are
   * unaffected: nothing inits unless it explicitly awaits `init()`.
   */
  async init(): Promise<void> {
    if (this.mod) return;
    if (!this._initPromise) {
      this._initPromise = (async () => {
        const m = await import('$lib/spatial-core-pkg/spatial_core.js');
        if (isClientRuntime) {
          await (m as { default: () => Promise<unknown> }).default();
        } else {
          // Dynamic specifier via a variable so client/worker bundles never try to resolve node:fs.
          const fsSpecifier = 'node:fs/promises';
          const { readFile } = (await import(/* @vite-ignore */ fsSpecifier)) as {
            readFile: (p: URL) => Promise<Uint8Array>;
          };
          const bytes = await readFile(
            new URL('../../spatial-core-pkg/spatial_core_bg.wasm', import.meta.url)
          );
          (m as unknown as { initSync: (o: { module: BufferSource }) => unknown }).initSync({
            module: bytes as BufferSource
          });
        }
        this.mod = m as unknown as WasmMod;
      })();
    }
    return this._initPromise;
  }

  isReady(): boolean {
    return this.mod !== null;
  }

  findPath(
    walkable: Uint8Array,
    costs: Float32Array,
    width: number,
    height: number,
    sx: number,
    sy: number,
    ex: number,
    ey: number,
    /** Per-call node-expansion cap (0 = full-grid default, for long pawn paths). Mob callers pass a
     *  tight cap so an unreachable goal bails fast instead of sweeping the whole connected region. */
    maxIter = 0
  ): { x: number; y: number }[] {
    if (!this.mod) return [];
    const raw = this.mod.find_path(walkable, costs, width, height, sx, sy, ex, ey, maxIter);
    const path: { x: number; y: number }[] = [];
    for (let i = 0; i + 1 < raw.length; i += 2) {
      path.push({ x: raw[i], y: raw[i + 1] });
    }
    return path;
  }

  /**
   * ENGINE-PERFORMANCE-II §S1: batch nearest-entity. For each `[qx,qy]` in `queries`, returns the
   * index into `points` (flat `[x,y,…]`) of the nearest within `maxDist`, or -1. Returns `null` if
   * the WASM isn't ready yet (caller falls back to a JS scan). O(N · nearby) via a uniform grid.
   */
  nearestEach(points: Float32Array, queries: Float32Array, maxDist: number): Int32Array | null {
    if (!this.mod) return null;
    return this.mod.nearest_each(points, queries, maxDist);
  }
}

export const wasmPathfinderService = new WasmPathfinderServiceImpl();
