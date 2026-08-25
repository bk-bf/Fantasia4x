import { isClientRuntime } from '../core/util/runtime';
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
  nearest_each: (points: Float32Array, queries: Float32Array, maxDist: number) => Int32Array;
};

class WasmPathfinderServiceImpl implements PathfinderService {
  private mod: WasmMod | null = null;
  private _initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.mod) return;
    if (!this._initPromise) {
      this._initPromise = (async () => {
        const m = await import('$lib/spatial-core-pkg/spatial_core.js');
        if (isClientRuntime) {
          await (m as { default: () => Promise<unknown> }).default();
        } else {
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

  nearestEach(points: Float32Array, queries: Float32Array, maxDist: number): Int32Array | null {
    if (!this.mod) return null;
    return this.mod.nearest_each(points, queries, maxDist);
  }
}

export const wasmPathfinderService = new WasmPathfinderServiceImpl();
