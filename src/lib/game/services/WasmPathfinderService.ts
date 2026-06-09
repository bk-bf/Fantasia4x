import { browser } from '$app/environment';
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
};

class WasmPathfinderServiceImpl implements PathfinderService {
  private mod: WasmMod | null = null;
  private _initPromise: Promise<void> | null = null;

  /** Initialize WASM. Idempotent — safe to call multiple times. */
  async init(): Promise<void> {
    if (!browser || this.mod) return;
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
}

export const wasmPathfinderService = new WasmPathfinderServiceImpl();
