import { isClientRuntime } from '../core/util/runtime';
import { realSimLogSink } from '../../stores/simLogBridge';
import {
  markRenderTileDirty,
  markSnowRenderTileDirty,
  clearRenderTileDeltas
} from '../../components/UI/canvas/mainTileDeltas';
import { batchLogReplay } from '../../stores/Log';
import { vlog, setVerboseLogging } from '../core/util/logSink';
import type { SimLogEvent, EntitySync } from './simProtocol';
import type { GameState, Pawn, Mob, WorldTile, DroppedItem } from '../core/types';

function updateEntityMirror<T extends { id: string }>(
  mirror: Map<string, T>,
  sync: EntitySync<T>,
  replace = false
): void {
  if ('full' in sync) {
    mirror.clear();
    for (const e of sync.full) mirror.set(e.id, e);
    return;
  }
  for (const u of sync.upserts) {
    if (replace) {
      mirror.set(u.id, u as T);
    } else {
      const prev = mirror.get(u.id);
      mirror.set(u.id, prev ? ({ ...prev, ...u } as T) : (u as T));
    }
  }
  for (const id of sync.removed) mirror.delete(id);
}

function applyEntitySync<T extends { id: string }>(
  mirror: Map<string, T>,
  sync: EntitySync<T>
): T[] {
  updateEntityMirror(mirror, sync, false);
  if ('full' in sync) return sync.full;
  return sync.order.map((id) => mirror.get(id)).filter((e): e is T => e !== undefined);
}

function applyDropSync(
  mirror: Map<string, DroppedItem>,
  sync: EntitySync<DroppedItem>
): DroppedItem[] {
  updateEntityMirror(mirror, sync, true);
  if ('full' in sync) return sync.full;
  return sync.order.map((id) => mirror.get(id)).filter((e): e is DroppedItem => e !== undefined);
}

export function verifyWasmInWorker(): void {
  if (!isClientRuntime) {
    console.warn('[SIM-WORKER] not in a browser; cannot spawn worker');
    return;
  }
  // eslint-disable-next-line no-console -- one-shot W1 verifier, not on the sim path
  console.info('[SIM-WORKER] spawning worker, running wasm-check…');
  const w = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
  w.onmessage = (e: MessageEvent) => {
    const d = e.data;
    if (d?.type === 'wasm-result') {
      if (d.ready)
        // eslint-disable-next-line no-console -- one-shot W1 verifier, not on the sim path
        console.info('[SIM-WORKER] ✅ WASM initialised IN the worker (browser=%s)', d.browser);
      else if (d.browser === false)
        console.error('[SIM-WORKER] ❌ browser FALSE in worker → init gate skipped WASM.');
      else
        console.error(
          '[SIM-WORKER] ❌ WASM failed to load in the worker:',
          d.error ?? '(no error)'
        );
      w.terminate();
    }
  };
  w.onerror = (e) => console.error('[SIM-WORKER] worker error:', e.message || e);
  w.postMessage({ kind: 'wasm-check' });
}

export const USE_SIM_WORKER: boolean = isClientRuntime;

class SimWorkerBridge {
  private w: Worker | null = null;
  private worldMap: GameState['worldMap'] = [];
  private lastState: Partial<GameState> = {};
  private pawnMirror = new Map<string, Pawn>();
  private mobMirror = new Map<string, Mob>();
  private dropMirror = new Map<string, DroppedItem>();
  onState: ((s: GameState, flush: boolean) => void) | null = null;
  onFullState: ((s: GameState) => void) | null = null;
  private paused = false;
  private verbose = false;

  start(): void {
    if (this.w) return;
    this.w = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
    this.w.onmessage = (e: MessageEvent) => this.handle(e.data);
    this.w.onerror = (e) => console.error('[SIM-WORKER] error:', e.message || e);
  }

  init(state: GameState, seed: number, opts?: { preview?: boolean }): void {
    this.worldMap = state.worldMap;
    this.lastState = {};
    this.pawnMirror.clear();
    this.mobMirror.clear();
    this.dropMirror.clear();
    this.w?.postMessage({
      kind: 'init',
      state,
      seed,
      preview: opts?.preview ?? false,
      verbose: this.verbose
    });
  }
  command(cmd: unknown): void {
    this.w?.postMessage({ kind: 'command', cmd });
  }
  setSpeed(speed: number): void {
    this.w?.postMessage({ kind: 'setSpeed', speed });
  }
  setVerbose(on: boolean): void {
    this.verbose = on;
    setVerboseLogging(on);
    this.w?.postMessage({ kind: 'setVerbose', on });
  }
  setPaused(paused: boolean): void {
    this.paused = paused;
    this.w?.postMessage({ kind: 'setPaused', paused });
  }
  requestSave(): void {
    this.w?.postMessage({ kind: 'requestSave' });
  }

  private handle(m: {
    kind: string;
    state?: GameState;
    pawns?: EntitySync<Pawn>;
    mobs?: EntitySync<Mob>;
    drops?: EntitySync<DroppedItem>;
    worldMap?: GameState['worldMap'];
    worldMapDelta?: Array<{ y: number; x: number; tile: Partial<WorldTile>; k?: 1 }>;
    flush?: boolean;
    commit?: boolean;
    error?: string;
    events?: SimLogEvent[];
  }): void {
    if (m.kind === 'snapshot') {
      if (m.worldMap) {
        this.worldMap = m.worldMap;
        clearRenderTileDeltas();
      } else if (m.worldMapDelta) {
        for (const d of m.worldMapDelta) {
          const row = this.worldMap[d.y];
          if (row) {
            if (d.k === 1) {
              Object.assign(row[d.x], d.tile);
              markSnowRenderTileDirty(d.y, d.x);
            } else {
              row[d.x] = { ...row[d.x], ...d.tile };
              markRenderTileDirty(d.y, d.x);
            }
          }
        }
      }
      this.lastState = { ...this.lastState, ...(m.state as object) };

      if (this.paused && !m.commit) {
        if (m.pawns) updateEntityMirror(this.pawnMirror, m.pawns, false);
        if (m.mobs) updateEntityMirror(this.mobMirror, m.mobs, false);
        if (m.drops) updateEntityMirror(this.dropMirror, m.drops, true);
        return;
      }

      if (m.pawns && 'upserts' in m.pawns) {
        for (const u of m.pawns.upserts) {
          if (u && 'inventory' in u) {
            const inv = (u as { inventory?: { items?: Record<string, number> } }).inventory;
            vlog(
              'item',
              this.lastState.turn ?? 0,
              `RECV←worker: ${u.id} inventory = ${JSON.stringify(inv?.items ?? {})}`
            );
          }
        }
      }
      const pawns = m.pawns
        ? applyEntitySync(this.pawnMirror, m.pawns)
        : (this.lastState.pawns ?? []);
      const mobs = m.mobs ? applyEntitySync(this.mobMirror, m.mobs) : (this.lastState.mobs ?? []);
      const droppedItems = m.drops
        ? applyDropSync(this.dropMirror, m.drops)
        : (this.lastState.droppedItems ?? []);
      this.onState?.(
        { ...this.lastState, pawns, mobs, droppedItems, worldMap: this.worldMap } as GameState,
        m.flush ?? true
      );
    } else if (m.kind === 'simlog') {
      const sink = realSimLogSink as unknown as Record<string, (...a: unknown[]) => unknown>;
      const events = m.events ?? [];
      batchLogReplay(() => {
        for (const ev of events) sink[ev.m]?.(...ev.a);
      });
    } else if (m.kind === 'fullState' && m.state) {
      this.worldMap = m.state.worldMap;
      this.onFullState?.(m.state);
    } else if (m.kind === 'error') {
      console.error('[SIM-WORKER]', m.error);
    }
  }
}

export const simWorkerBridge = new SimWorkerBridge();

if (isClientRuntime && import.meta.env.DEV) {
  (globalThis as Record<string, unknown>).verifyWasmInWorker = verifyWasmInWorker;
  (globalThis as Record<string, unknown>).runSimCoreBench = async (...args: number[]) =>
    (await import('../sim-core/bench')).runSimCoreBench(...args);
}
