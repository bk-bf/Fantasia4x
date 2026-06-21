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
    ey: number
  ) => Uint32Array;
  // ENGINE-PERFORMANCE-II §S1: batch nearest-entity query (uniform grid). For each query point, the
  // index into `points` of the nearest within `maxDist`, or -1.
  nearest_each: (points: Float32Array, queries: Float32Array, maxDist: number) => Int32Array;
};

class WasmPathfinderServiceImpl implements PathfinderService {
  private mod: WasmMod | null = null;
  private _initPromise: Promise<void> | null = null;

  /** Initialize WASM. Idempotent — safe to call multiple times. */
  async init(): Promise<void> {
    if (!isClientRuntime || this.mod) return;
    if (!this._initPromise) {
      this._initPromise = (async () => {
        const m = await import('$lib/spatial-core-pkg/spatial_core.js');
        await (m as { default: () => Promise<unknown> }).default();
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
    ey: number
  ): { x: number; y: number }[] {
    if (!this.mod) return [];
    const raw = this.mod.find_path(walkable, costs, width, height, sx, sy, ex, ey);
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
