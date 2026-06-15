/**
 * simProtocol — the message contract between the main thread and the sim worker (ADR-021).
 *
 * The worker owns the canonical GameState. The main thread sends serializable **commands**
 * (player/dev actions) and lifecycle control; the worker replies with per-tick **snapshots** (the
 * minimal set the renderer/HUD need) + occasional full-state for saving. Everything here must be
 * structured-cloneable — NO functions (that's the whole reason commands are named, not closures).
 *
 * Migration note (W3): until every command is serializable + the worker tick loop exists, the
 * SAME command registry (`commands.ts`) is dispatched on the MAIN thread (behaviour-preserving), so
 * the game keeps working at every step. The worker cutover flips the dispatch target only.
 */
import type { GameState, Pawn, Mob } from '../core/types';

/**
 * Per-entity sync for pawns/mobs (W2b). Cloning whole pawns/mobs every flush dominated the boundary
 * (deep limbs/skills/inventory/equipment trees on ~290 entities). Instead each flush sends a SLIM
 * projection (every field EXCEPT the heavy/static cold ones — see ENTITY_COLD_FIELDS in the worker),
 * which keeps position/needs/state/combat-scalars fresh at the flush rate; the heavy cold fields are
 * re-sent in FULL on a periodic resync (`{ full }`). The bridge keeps a per-id mirror and merges
 * slim upserts onto it, so the cold fields persist between resyncs (≤ resync-interval stale) and no
 * field is ever undefined (a newly-seen id is always sent full). `order` re-establishes array order;
 * `removed` reaps despawned ids.
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
  /** Mirror of the old updateWithSave vs update split — persist after applying. */
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
 * A buffered sim-log/feedback call forwarded worker→main. The sim emits chronicle entries + floating
 * combat text through `simLog` (core/logSink), whose real implementation lives in the store layer
 * (DOM/stores — main-thread only). In the worker that sink can't run, so calls are captured as
 * `{ method, args }` and replayed against the real sink on the main thread. All args are
 * structured-cloneable (ids, names, numbers, CombatTurnEntry). Buffered per batch to avoid a
 * postMessage per swing.
 */
export interface SimLogEvent {
  m: string;
  a: unknown[];
}

/** Worker → main. */
export type WorkerToMain =
  | { kind: 'ready' }
  // W2 sectional diff: `state` carries ONLY the top-level GameState fields whose ref changed since
  // the last flush (the bridge reassembles the full state from its mirror), EXCLUDING pawns/mobs/
  // worldMap. pawns/mobs ride in their own per-entity `EntitySync` (W2b); worldMap is sent
  // separately, only when its ref changes. `_terrainRev` rides inside `state`.
  | {
      kind: 'snapshot';
      state: Partial<GameState>;
      pawns: EntitySync<Pawn>;
      mobs: EntitySync<Mob>;
      worldMap?: GameState['worldMap'];
      flush: boolean;
    }
  | { kind: 'fullState'; state: GameState } // for save/load reconciliation
  | { kind: 'simlog'; events: SimLogEvent[] }
  | { kind: 'error'; error: string };

/**
 * The minimal per-tick render set (W2). NOT the whole GameState — sending pawns/mobs/worldMap every
 * tick would dominate the boundary. Hot position data is a packed `Float32Array` (transferable) so
 * the clone cost stays flat as entity counts grow; the rest is small structured data the HUD reads.
 * Exact fields filled in W2 once the renderer's read surface is enumerated.
 */
export interface RenderSnapshot {
  turn: number;
  /** Interleaved [id-index, x, y, …] or parallel arrays — finalised in W2 (transferable). */
  entityPositions: Float32Array;
  /** Small structured side-channel (selected entity, resource totals, alerts…) — TBD in W2. */
  hud: unknown;
}
