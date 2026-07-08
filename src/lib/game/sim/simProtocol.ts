/**
 * simProtocol — the message contract between the main thread and the sim worker.
 *
 * The worker owns the canonical GameState. The main thread sends serializable **commands**
 * (player/dev actions) and lifecycle control; the worker replies with per-tick **snapshots** (the
 * minimal set the renderer/HUD need) + occasional full-state for saving. Everything here must be
 * structured-cloneable — NO functions (that's the whole reason commands are named, not closures).
 */
import type { GameState, Pawn, Mob, WorldTile, DroppedItem } from '../core/types';

/**
 * Per-entity sync for pawns/mobs, so whole deep entities aren't cloned every flush. Each flush
 * sends a SLIM projection (every field except the heavy/static cold ones); cold fields ship on
 * change or in FULL (`{ full }`). The bridge keeps a per-id mirror and merges slim upserts onto
 * it, so cold fields persist and no field is ever undefined (a newly-seen id is always sent full).
 * `order` re-establishes array order; `removed` reaps despawned ids.
 */
export type EntitySync<T extends { id: string }> =
  | { full: T[] }
  | { upserts: Array<Partial<T> & { id: string }>; removed: string[]; order: string[] };

/** A serializable command: a registry key + a plain-object payload. No closures. */
export interface SimCommand {
  /** Registry id in `commands.ts` COMMANDS. */
  type: string;
  /** Plain, structured-cloneable args (ids, quantities, settings…). */
  payload?: unknown;
  /** Persist after applying. */
  save?: boolean;
}

/** Main → worker. */
export type MainToWorker =
  | { kind: 'init'; state: GameState; seed: number }
  | { kind: 'command'; cmd: SimCommand }
  | { kind: 'setSpeed'; speed: number }
  | { kind: 'setPaused'; paused: boolean }
  | { kind: 'requestSave' };

/**
 * A buffered sim-log/feedback call forwarded worker→main. The real log sink lives in the store
 * layer (main-thread only), so worker calls are captured as `{ method, args }` and replayed
 * against it. Buffered per batch to avoid a postMessage per swing.
 */
export interface SimLogEvent {
  m: string;
  a: unknown[];
}

/** Worker → main. */
export type WorkerToMain =
  | { kind: 'ready' }
  // Sectional diff: `state` carries ONLY the top-level GameState fields whose ref changed since
  // the last flush (the bridge reassembles the full state from its mirror). pawns/mobs ride in
  // their own per-entity `EntitySync`; worldMap is sent separately, only when its ref changes.
  | {
      kind: 'snapshot';
      state: Partial<GameState>;
      pawns: EntitySync<Pawn>;
      mobs: EntitySync<Mob>;
      // Dropped items ride their own per-id sync so only stacks whose object ref changed ship each
      // flush. Drops are sent WHOLE (the autosave persists this projection); reconstructed into
      // `droppedItems` by the bridge.
      drops?: EntitySync<DroppedItem>;
      worldMap?: GameState['worldMap'];
      // Changed-tile deltas: sent INSTEAD of the full worldMap when only a few tiles were mutated
      // in place (e.g. resource regrowth). Each tile is a SLIM projection (only the fields the main
      // thread reads); the bridge MERGES it onto its cached full tile. Mutually exclusive with
      // `worldMap` (a full send already carries changes).
      worldMapDelta?: Array<{ y: number; x: number; tile: Partial<WorldTile> }>;
      flush: boolean;
      // True when the snapshot is a COMMAND result or the pause hand-off (not a sim tick). The bridge
      // applies these even while paused; it drops non-commit (tick) snapshots so the renderer isn't
      // raced by in-flight frames after the user pauses.
      commit?: boolean;
    }
  | { kind: 'fullState'; state: GameState } // for save/load reconciliation
  | { kind: 'simlog'; events: SimLogEvent[] }
  | { kind: 'error'; error: string };

/**
 * The minimal per-tick render set. NOT the whole GameState — sending pawns/mobs/worldMap every
 * tick would dominate the boundary. Hot position data is a packed `Float32Array` (transferable)
 * so the clone cost stays flat as entity counts grow.
 */
export interface RenderSnapshot {
  turn: number;
  /** Interleaved [id-index, x, y, …] or parallel arrays (transferable). */
  entityPositions: Float32Array;
  /** Small structured side-channel (selected entity, resource totals, alerts…). */
  hud: unknown;
}
