/**
 * simWorldView — TypeScript mirror/view over the `sim-core` SoA data model (ENGINE-PERFORMANCE
 * ★ ACTIVE, R0). Pairs with `sim-core/src/lib.rs`.
 *
 * The Rust `SimWorld` owns the hot per-tick state as contiguous typed buffers. This view:
 *  1. boots the wasm module and constructs a `SimWorld`,
 *  2. builds **zero-copy** `TypedArray` views straight over the wasm linear memory (no marshalling
 *     — JS reads/writes the same bytes the Rust tick will, which is the whole point of SoA), and
 *  3. exposes the field-plane indices + tile addressing that MUST match the Rust side.
 *
 * The `F_* / I_* / U_* / S_*` constants and `CHUNK` here are the **mirror of the Rust contract**.
 * Drift is caught two ways: a runtime assert (`assertLayout`) checks the plane widths reported by
 * wasm against these constants, and `simWorldView.test.ts` checks the tile-index math in pure TS.
 *
 * R0 is the data model only. The tick logic (movement/needs/FSM/combat) is ported onto these
 * buffers in R2; the renderer snapshot becomes a view of them in R3.
 */
import { isClientRuntime } from '../core/runtime';

// ── Field-plane indices — MUST match sim-core/src/lib.rs ───────────────────────────────────────
// f32 plane
export const F_HUNGER = 0;
export const F_FATIGUE = 1;
export const F_SLEEP = 2;
export const F_THIRST = 3;
export const F_HYGIENE = 4;
export const F_HEALTH = 5;
export const F_MAX_HEALTH = 6;
export const F_BLOOD = 7;
export const F_MAX_BLOOD = 8;
export const F_STAMINA = 9;
export const F_MAX_STAMINA = 10;
export const F_PAIN = 11;
export const F_ATTACK_CD = 12;
export const F_AGGRO_RANGE = 13;
export const F_NEXT_CELL_COST = 14;
export const NF32 = 15;

// i32 plane
export const I_X = 0;
export const I_Y = 1;
export const I_STATE_SINCE = 2;
export const I_LAST_SLEEP = 3;
export const I_LAST_MEAL = 4;
export const I_LAST_DRINK = 5;
export const I_LAST_WASH = 6;
export const I_PATH_INDEX = 7;
export const I_BLOCKED_TICKS = 8;
export const I_TARGET = 9;
export const NI32 = 10;

// u8 plane
export const U_KIND = 0;
export const U_ALIVE = 1;
export const U_STATE = 2;
export const U_FLAGS = 3;
export const NU8 = 4;

// i16 plane
export const S_STR = 0;
export const S_DEX = 1;
export const S_INT = 2;
export const S_PER = 3;
export const S_CHA = 4;
export const S_CON = 5;
export const NI16 = 6;

/** Chunk edge length — MUST match `CH` in sim-core. */
export const CHUNK = 32;

/** Entity kind discriminator (`U_KIND`). */
export const KIND = { PAWN: 0, ANIMAL: 1, HOSTILE: 2 } as const;

/** Per-entity flag bits (`U_FLAGS`). */
export const FLAG = { MOVING: 1, REACHED_DEST: 2, DRAFTED: 4 } as const;

/**
 * Unified FSM state ids (`U_STATE`) — the SoA entity table is shared by pawns and mobs, so their
 * states fold into one numeric space. This is the R0 contract; R2 wires the string↔id mapping at
 * the JS boundary. Keep additions append-only so saved ids stay stable.
 */
export const STATE = {
  // shared
  IDLE: 0,
  MOVING: 1,
  EATING: 2,
  SLEEPING: 3,
  FLEEING: 4,
  FIGHTING: 5,
  DEAD: 6,
  // pawn
  WORKING: 7,
  HAULING: 8,
  // mob
  WANDER: 20,
  GRAZING: 21,
  STARTLED: 22,
  ALERTED: 23,
  ATTACKING: 24,
  EXHAUSTED: 25,
  FORAGING: 26,
  HUNTING: 27,
  COLLAPSED: 28,
  TAMED: 29,
  CORPSE: 30
} as const;

type WasmModule = typeof import('$lib/sim-core-pkg/sim_core.js');
type SimWorld = InstanceType<WasmModule['SimWorld']>;

let _mod: WasmModule | null = null;
let _memory: WebAssembly.Memory | null = null;
let _initPromise: Promise<void> | null = null;

/** Boot the sim-core wasm module (idempotent). No-op outside a browser/worker runtime. */
async function ensureModule(): Promise<void> {
  if (!isClientRuntime || _mod) return;
  if (!_initPromise) {
    _initPromise = (async () => {
      const m = await import('$lib/sim-core-pkg/sim_core.js');
      const out = (await (
        m as { default: () => Promise<{ memory: WebAssembly.Memory }> }
      ).default())!;
      _mod = m;
      _memory = out.memory;
    })();
  }
  return _initPromise;
}

/**
 * A live, zero-copy view over a `sim-core` `SimWorld`. Build with `SimWorldView.create(...)`.
 *
 * Field access is `plane[field * cap + entity]` (field-major SoA): consecutive entities of one
 * field are adjacent, so the future Rust tick walks each field as one contiguous run.
 */
export class SimWorldView {
  readonly cap: number;
  readonly width: number;
  readonly height: number;
  readonly chunksX: number;
  readonly chunksY: number;
  readonly tileTotal: number;

  // entity planes
  f32!: Float32Array;
  i32!: Int32Array;
  u8!: Uint8Array;
  i16!: Int16Array;
  // tile planes
  tWalk!: Uint8Array;
  tTerrain!: Uint16Array;
  tCost!: Float32Array;
  tResId!: Uint16Array;
  tResAmt!: Float32Array;
  tResCd!: Int32Array;
  tFlags!: Uint8Array;
  chunkDirty!: Uint8Array;

  private constructor(
    private readonly world: SimWorld,
    private readonly mod: WasmModule
  ) {
    this.cap = world.cap();
    this.width = world.width();
    this.height = world.height();
    this.chunksX = world.chunks_x();
    this.chunksY = world.chunks_y();
    this.tileTotal = world.tile_total();
    this.assertLayout();
    this.rebuildViews();
  }

  /** Boot wasm, allocate a `SimWorld(cap, width, height)`, and return its view. */
  static async create(cap: number, width: number, height: number): Promise<SimWorldView> {
    await ensureModule();
    if (!_mod) throw new Error('[sim-core] not available in this runtime');
    const world = new _mod.SimWorld(cap, width, height);
    return new SimWorldView(world, _mod);
  }

  /** Verify the wasm plane widths + chunk size match this file's mirror constants. */
  private assertLayout(): void {
    const w = this.world;
    const mismatch =
      w.nf32() !== NF32 ||
      w.ni32() !== NI32 ||
      w.nu8() !== NU8 ||
      w.ni16() !== NI16 ||
      w.chunk_size() !== CHUNK;
    if (mismatch) {
      throw new Error(
        `[sim-core] layout drift: wasm(${w.nf32()},${w.ni32()},${w.nu8()},${w.ni16()},ch${w.chunk_size()}) ` +
          `vs ts(${NF32},${NI32},${NU8},${NI16},ch${CHUNK}). Re-sync simWorldView.ts with lib.rs.`
      );
    }
  }

  /**
   * (Re)build every typed-array view from the CURRENT wasm memory buffer. Growing wasm memory
   * detaches existing ArrayBuffer views; sim-core never allocates after construction, but call this
   * (via `ensureViews`) if a buffer is ever seen detached.
   */
  rebuildViews(): void {
    const buf = _memory!.buffer;
    const w = this.world;
    this.f32 = new Float32Array(buf, w.f32_ptr(), NF32 * this.cap);
    this.i32 = new Int32Array(buf, w.i32_ptr(), NI32 * this.cap);
    this.u8 = new Uint8Array(buf, w.u8_ptr(), NU8 * this.cap);
    this.i16 = new Int16Array(buf, w.i16_ptr(), NI16 * this.cap);
    this.tWalk = new Uint8Array(buf, w.t_walk_ptr(), this.tileTotal);
    this.tTerrain = new Uint16Array(buf, w.t_terrain_ptr(), this.tileTotal);
    this.tCost = new Float32Array(buf, w.t_cost_ptr(), this.tileTotal);
    this.tResId = new Uint16Array(buf, w.t_res_id_ptr(), this.tileTotal);
    this.tResAmt = new Float32Array(buf, w.t_res_amt_ptr(), this.tileTotal);
    this.tResCd = new Int32Array(buf, w.t_res_cd_ptr(), this.tileTotal);
    this.tFlags = new Uint8Array(buf, w.t_flags_ptr(), this.tileTotal);
    this.chunkDirty = new Uint8Array(buf, w.chunk_dirty_ptr(), w.chunk_count());
  }

  /** Cheap guard: rebuild views if the wasm buffer detached (only possible on a memory grow). */
  ensureViews(): void {
    if (this.f32.byteLength === 0) this.rebuildViews();
  }

  // ── slot management ─────────────────────────────────────────────────────────────────────────
  /** Claim an entity slot (or -1 at capacity). */
  spawn(): number {
    return this.world.spawn();
  }
  kill(i: number): void {
    this.world.kill(i);
  }
  /** High-water mark of slots ever handed out (iterate `0..count`, skip `U_ALIVE === 0`). */
  count(): number {
    return this.world.count();
  }

  // ── entity field access (field-major: plane[field*cap + i]) ───────────────────────────────────
  getF32(field: number, i: number): number {
    return this.f32[field * this.cap + i];
  }
  setF32(field: number, i: number, v: number): void {
    this.f32[field * this.cap + i] = v;
  }
  getI32(field: number, i: number): number {
    return this.i32[field * this.cap + i];
  }
  setI32(field: number, i: number, v: number): void {
    this.i32[field * this.cap + i] = v;
  }
  getU8(field: number, i: number): number {
    return this.u8[field * this.cap + i];
  }
  setU8(field: number, i: number, v: number): void {
    this.u8[field * this.cap + i] = v;
  }
  getI16(field: number, i: number): number {
    return this.i16[field * this.cap + i];
  }
  setI16(field: number, i: number, v: number): void {
    this.i16[field * this.cap + i] = v;
  }

  // ── tile addressing (mirror of Rust `tile_index`; chunk-major) ───────────────────────────────
  /** Flat index of tile (x,y) in the chunk-major store, or -1 if out of range. */
  tileIndex(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return -1;
    const cx = (x / CHUNK) | 0;
    const cy = (y / CHUNK) | 0;
    const lx = x % CHUNK;
    const ly = y % CHUNK;
    return (cy * this.chunksX + cx) * CHUNK * CHUNK + ly * CHUNK + lx;
  }

  markDirty(x: number, y: number): void {
    this.world.mark_dirty(x, y);
  }
  clearDirty(): void {
    this.world.clear_dirty();
  }

  /** Release the wasm allocation (the SoA buffers). The view is unusable afterwards. */
  free(): void {
    this.world.free();
  }
}

/**
 * Pure-TS reference of the chunk-major tile index — used by tests to verify TS/Rust parity without
 * a wasm host. Mirrors `SimWorldView.tileIndex` / Rust `tile_index`.
 */
export function tileIndexRef(
  x: number,
  y: number,
  width: number,
  height: number,
  chunksX: number
): number {
  if (x < 0 || y < 0 || x >= width || y >= height) return -1;
  const cx = (x / CHUNK) | 0;
  const cy = (y / CHUNK) | 0;
  return (cy * chunksX + cx) * CHUNK * CHUNK + (y % CHUNK) * CHUNK + (x % CHUNK);
}
