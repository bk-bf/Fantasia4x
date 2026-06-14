//! sim-core — Struct-of-Arrays simulation data model (ENGINE-PERFORMANCE ★ ACTIVE, R0).
//!
//! Owns the **hot per-tick state** as contiguous typed buffers so the simulation can iterate it
//! cache-friendly and GC-free, run multi-core later (R4), and hand the renderer a zero-copy view
//! (R3). This file is **R0: the data model only** — layout, allocation, slot management, and the
//! chunked world grid. The actual tick logic (movement / needs / FSM / combat) is ported on top of
//! it in R2; pathfinding already lives in the sibling `spatial-core` crate (ADR-008).
//!
//! ## Layout
//! Entity state is **field-major SoA in four typed planes** (f32 / i32 / u8 / i16). A field `F` of
//! entity `i` lives at `plane[F * cap + i]`, so "decay hunger for every entity" walks one
//! contiguous run. Field indices are the `F_* / I_* / U_* / S_*` consts below — these are the
//! **contract mirrored in `simWorldView.ts`** (guarded by a layout test on both sides).
//!
//! The world is a **chunked tile grid**: tiles are stored chunk-major in `CH×CH` blocks so a 1000×1000
//! map (1M tiles) iterates per-chunk with locality and tracks dirty chunks (for terrain re-upload /
//! regrowth scans) instead of re-walking the whole map every tick.
//!
//! ## Zero-copy & memory stability
//! All buffers are allocated once in `SimWorld::new` and **never resized** (fixed entity `cap`,
//! fixed map dims). So the `*_ptr()` byte offsets are stable and JS can build `Float32Array` /
//! `Int32Array` / … views straight over `wasm_memory().buffer`. The ONE caveat is that growing wasm
//! linear memory *detaches* every existing ArrayBuffer view — which is why nothing here allocates
//! after construction, and the TS view re-derives its arrays if it ever sees a detached buffer.

use wasm_bindgen::prelude::*;

/// Chunk edge length (tiles). 32×32 = 1024 tiles/chunk — a good locality/granularity tradeoff.
const CH: usize = 32;

// ── Entity field planes — MIRRORED in simWorldView.ts (layout test guards drift) ──────────────
// f32 plane: needs (0–100), survival pools, combat timers, sub-tile movement budget.
pub const F_HUNGER: usize = 0;
pub const F_FATIGUE: usize = 1;
pub const F_SLEEP: usize = 2;
pub const F_THIRST: usize = 3;
pub const F_HYGIENE: usize = 4;
pub const F_HEALTH: usize = 5;
pub const F_MAX_HEALTH: usize = 6;
pub const F_BLOOD: usize = 7;
pub const F_MAX_BLOOD: usize = 8;
pub const F_STAMINA: usize = 9;
pub const F_MAX_STAMINA: usize = 10;
pub const F_PAIN: usize = 11;
pub const F_ATTACK_CD: usize = 12;
pub const F_AGGRO_RANGE: usize = 13;
pub const F_NEXT_CELL_COST: usize = 14;
pub const NF32: usize = 15;

// i32 plane: tile position, FSM/needs timestamps (turn numbers), movement cursor, target slot.
pub const I_X: usize = 0;
pub const I_Y: usize = 1;
pub const I_STATE_SINCE: usize = 2;
pub const I_LAST_SLEEP: usize = 3;
pub const I_LAST_MEAL: usize = 4;
pub const I_LAST_DRINK: usize = 5;
pub const I_LAST_WASH: usize = 6;
pub const I_PATH_INDEX: usize = 7;
pub const I_BLOCKED_TICKS: usize = 8;
pub const I_TARGET: usize = 9; // entity slot of hunt/flee/attack target, -1 = none
pub const NI32: usize = 10;

// u8 plane: small enums + bitflags.
pub const U_KIND: usize = 0; // 0 = pawn, 1 = animal, 2 = hostile
pub const U_ALIVE: usize = 1; // 0/1
pub const U_STATE: usize = 2; // unified FSM state id (mapping owned by TS)
pub const U_FLAGS: usize = 3; // bit0 isMoving, bit1 reachedDest, bit2 drafted, …
pub const NU8: usize = 4;

// i16 plane: the six D&D-style stats.
pub const S_STR: usize = 0;
pub const S_DEX: usize = 1;
pub const S_INT: usize = 2;
pub const S_PER: usize = 3;
pub const S_CHA: usize = 4;
pub const S_CON: usize = 5;
pub const NI16: usize = 6;

/// The Struct-of-Arrays world: fixed-capacity entity planes + a chunked tile grid.
#[wasm_bindgen]
pub struct SimWorld {
    cap: usize,
    high: usize,      // high-water mark of slots ever handed out
    free: Vec<u32>,   // recycled slots (from `kill`)
    f32p: Vec<f32>,
    i32p: Vec<i32>,
    u8p: Vec<u8>,
    i16p: Vec<i16>,

    // world (chunk-major)
    width: usize,
    height: usize,
    chunks_x: usize,
    chunks_y: usize,
    tile_total: usize, // padded to whole chunks
    t_walk: Vec<u8>,
    t_terrain: Vec<u16>,
    t_cost: Vec<f32>,
    t_res_id: Vec<u16>,
    t_res_amt: Vec<f32>,
    t_res_cd: Vec<i32>,
    t_flags: Vec<u8>,
    chunk_dirty: Vec<u8>,
}

#[wasm_bindgen]
impl SimWorld {
    /// Allocate every buffer once. `cap` = max simultaneous entities; `width`/`height` = map size.
    /// Nothing allocates after this, so all pointers stay valid for the instance's lifetime.
    #[wasm_bindgen(constructor)]
    pub fn new(cap: usize, width: usize, height: usize) -> SimWorld {
        let chunks_x = (width + CH - 1) / CH;
        let chunks_y = (height + CH - 1) / CH;
        let tile_total = chunks_x * chunks_y * CH * CH;
        SimWorld {
            cap,
            high: 0,
            free: Vec::new(),
            f32p: vec![0.0; NF32 * cap],
            i32p: vec![0; NI32 * cap],
            u8p: vec![0; NU8 * cap],
            i16p: vec![0; NI16 * cap],
            width,
            height,
            chunks_x,
            chunks_y,
            tile_total,
            t_walk: vec![1; tile_total], // default walkable
            t_terrain: vec![0; tile_total],
            t_cost: vec![1.0; tile_total], // default plains cost
            t_res_id: vec![0; tile_total],
            t_res_amt: vec![0.0; tile_total],
            t_res_cd: vec![0; tile_total],
            t_flags: vec![0; tile_total],
            chunk_dirty: vec![0; chunks_x * chunks_y],
        }
    }

    // ── slot management ───────────────────────────────────────────────────────────────────────
    /// Claim a free slot (recycled first, else the high-water mark). Sets `alive = 1`, clears the
    /// per-entity flags byte, zeroes the target. Returns the slot index, or `-1` if at capacity.
    pub fn spawn(&mut self) -> i32 {
        let i = if let Some(s) = self.free.pop() {
            s as usize
        } else if self.high < self.cap {
            let s = self.high;
            self.high += 1;
            s
        } else {
            return -1;
        };
        self.u8p[U_ALIVE * self.cap + i] = 1;
        self.u8p[U_FLAGS * self.cap + i] = 0;
        self.i32p[I_TARGET * self.cap + i] = -1;
        i as i32
    }

    /// Free a slot for reuse (`alive = 0`). The field bytes are left as-is until the slot is reused.
    pub fn kill(&mut self, i: u32) {
        let idx = i as usize;
        if idx < self.cap && self.u8p[U_ALIVE * self.cap + idx] == 1 {
            self.u8p[U_ALIVE * self.cap + idx] = 0;
            self.free.push(i);
        }
    }

    // ── world indexing (mirror these in TS) ─────────────────────────────────────────────────────
    /// Flat index of tile (x,y) in the chunk-major store. Out-of-range returns `u32::MAX`.
    pub fn tile_index(&self, x: u32, y: u32) -> u32 {
        let (x, y) = (x as usize, y as usize);
        if x >= self.width || y >= self.height {
            return u32::MAX;
        }
        let cx = x / CH;
        let cy = y / CH;
        let lx = x % CH;
        let ly = y % CH;
        ((cy * self.chunks_x + cx) * CH * CH + ly * CH + lx) as u32
    }

    /// Mark the chunk containing (x,y) dirty (terrain changed → re-upload / re-scan).
    pub fn mark_dirty(&mut self, x: u32, y: u32) {
        let (x, y) = (x as usize, y as usize);
        if x < self.width && y < self.height {
            self.chunk_dirty[(y / CH) * self.chunks_x + (x / CH)] = 1;
        }
    }

    /// Clear all dirty flags (after the consumer has processed them this tick/frame).
    pub fn clear_dirty(&mut self) {
        for d in self.chunk_dirty.iter_mut() {
            *d = 0;
        }
    }

    // ── dimensions ──────────────────────────────────────────────────────────────────────────────
    pub fn cap(&self) -> usize {
        self.cap
    }
    /// High-water mark: slots `0..count` may be live (check `U_ALIVE`). NOT a live count.
    pub fn count(&self) -> usize {
        self.high
    }
    pub fn width(&self) -> usize {
        self.width
    }
    pub fn height(&self) -> usize {
        self.height
    }
    pub fn chunk_size(&self) -> usize {
        CH
    }
    pub fn chunks_x(&self) -> usize {
        self.chunks_x
    }
    pub fn chunks_y(&self) -> usize {
        self.chunks_y
    }
    pub fn tile_total(&self) -> usize {
        self.tile_total
    }
    pub fn chunk_count(&self) -> usize {
        self.chunks_x * self.chunks_y
    }
    // plane widths so the TS view can build the right-length arrays / assert the mirror
    pub fn nf32(&self) -> usize {
        NF32
    }
    pub fn ni32(&self) -> usize {
        NI32
    }
    pub fn nu8(&self) -> usize {
        NU8
    }
    pub fn ni16(&self) -> usize {
        NI16
    }

    // ── zero-copy pointers (byte offsets into wasm linear memory) ────────────────────────────────
    // Entity planes (length NX*cap of the respective element type).
    pub fn f32_ptr(&self) -> usize {
        self.f32p.as_ptr() as usize
    }
    pub fn i32_ptr(&self) -> usize {
        self.i32p.as_ptr() as usize
    }
    pub fn u8_ptr(&self) -> usize {
        self.u8p.as_ptr() as usize
    }
    pub fn i16_ptr(&self) -> usize {
        self.i16p.as_ptr() as usize
    }
    // Tile planes (length tile_total of the respective element type).
    pub fn t_walk_ptr(&self) -> usize {
        self.t_walk.as_ptr() as usize
    }
    pub fn t_terrain_ptr(&self) -> usize {
        self.t_terrain.as_ptr() as usize
    }
    pub fn t_cost_ptr(&self) -> usize {
        self.t_cost.as_ptr() as usize
    }
    pub fn t_res_id_ptr(&self) -> usize {
        self.t_res_id.as_ptr() as usize
    }
    pub fn t_res_amt_ptr(&self) -> usize {
        self.t_res_amt.as_ptr() as usize
    }
    pub fn t_res_cd_ptr(&self) -> usize {
        self.t_res_cd.as_ptr() as usize
    }
    pub fn t_flags_ptr(&self) -> usize {
        self.t_flags.as_ptr() as usize
    }
    pub fn chunk_dirty_ptr(&self) -> usize {
        self.chunk_dirty.as_ptr() as usize
    }

    // ── R1 spike workload ─────────────────────────────────────────────────────────────────────
    /// Run `ticks` iterations of a representative hot loop over the SoA: per-entity needs decay +
    /// one-step movement with a chunked-grid tile-cost read. This is the R1 benchmark workload (and
    /// the seed of the real R2 needs/movement tick); the JS variants in `bench.ts` do the identical
    /// work so the comparison is apples-to-apples. Returns a checksum so nothing is optimised away.
    pub fn bench_step(&mut self, ticks: u32) -> f64 {
        const DIRS: [(i32, i32); 8] = [
            (1, 0), (0, 1), (-1, 0), (0, -1), (1, 1), (-1, 1), (1, -1), (-1, -1),
        ];
        let cap = self.cap;
        let w = self.width as i32;
        let h = self.height as i32;
        let mut checksum = 0.0f64;
        for _ in 0..ticks {
            for i in 0..self.high {
                if self.u8p[U_ALIVE * cap + i] == 0 {
                    continue;
                }
                // needs decay (clamped to 100)
                let hu = &mut self.f32p[F_HUNGER * cap + i];
                *hu = (*hu + 0.10).min(100.0);
                let fa = &mut self.f32p[F_FATIGUE * cap + i];
                *fa = (*fa + 0.05).min(100.0);
                let th = &mut self.f32p[F_THIRST * cap + i];
                *th = (*th + 0.08).min(100.0);
                let hy = &mut self.f32p[F_HYGIENE * cap + i];
                *hy = (*hy + 0.02).min(100.0);
                // movement: drain sub-tile budget, step on expiry, read new tile cost
                let ncc = self.f32p[F_NEXT_CELL_COST * cap + i] - 1.0;
                if ncc <= 0.0 {
                    let (dx, dy) = DIRS[i & 7];
                    let mut nx = self.i32p[I_X * cap + i] + dx;
                    let mut ny = self.i32p[I_Y * cap + i] + dy;
                    if nx < 0 || nx >= w {
                        nx -= 2 * dx;
                    }
                    if ny < 0 || ny >= h {
                        ny -= 2 * dy;
                    }
                    self.i32p[I_X * cap + i] = nx;
                    self.i32p[I_Y * cap + i] = ny;
                    let ti = self.tile_index(nx as u32, ny as u32) as usize;
                    self.f32p[F_NEXT_CELL_COST * cap + i] = self.t_cost[ti];
                } else {
                    self.f32p[F_NEXT_CELL_COST * cap + i] = ncc;
                }
                checksum += self.i32p[I_X * cap + i] as f64 + self.f32p[F_HUNGER * cap + i] as f64;
            }
        }
        checksum
    }
}

/// The module's `WebAssembly.Memory`, so JS can build typed-array views over the SoA buffers.
/// (`wasm-pack --target web` keeps the instance internal; this is the supported access path.)
#[wasm_bindgen]
pub fn wasm_memory() -> JsValue {
    wasm_bindgen::memory()
}

// ──────────────────────────────────────────────────────────────────────────────
// Native unit tests (cargo test) — verify the data model without a wasm host.
// ──────────────────────────────────────────────────────────────────────────────
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn spawn_recycles_slots_and_marks_alive() {
        let mut w = SimWorld::new(4, 64, 64);
        assert_eq!(w.spawn(), 0);
        assert_eq!(w.spawn(), 1);
        assert_eq!(w.u8p[U_ALIVE * w.cap + 0], 1);
        w.kill(0);
        assert_eq!(w.u8p[U_ALIVE * w.cap + 0], 0);
        assert_eq!(w.spawn(), 0); // recycled
        // exhaust capacity
        assert_eq!(w.spawn(), 2);
        assert_eq!(w.spawn(), 3);
        assert_eq!(w.spawn(), -1); // full
    }

    #[test]
    fn field_major_addressing_is_contiguous_per_field() {
        let w = SimWorld::new(8, 32, 32);
        // hunger of entity i is f32p[F_HUNGER*cap + i]; consecutive entities are adjacent.
        let a = F_HUNGER * w.cap + 3;
        let b = F_HUNGER * w.cap + 4;
        assert_eq!(b - a, 1);
        assert_eq!(w.f32p.len(), NF32 * 8);
        assert_eq!(w.i32p.len(), NI32 * 8);
    }

    #[test]
    fn tile_index_is_chunk_major_and_bounds_checked() {
        let w = SimWorld::new(1, 100, 100); // chunks_x = ceil(100/32) = 4
        assert_eq!(w.chunks_x, 4);
        // (0,0) → chunk 0, local 0
        assert_eq!(w.tile_index(0, 0), 0);
        // (1,0) → chunk 0, local 1
        assert_eq!(w.tile_index(1, 0), 1);
        // (0,1) → chunk 0, local CH
        assert_eq!(w.tile_index(0, 1), CH as u32);
        // (32,0) → chunk 1, local 0 → CH*CH
        assert_eq!(w.tile_index(32, 0), (CH * CH) as u32);
        // out of range
        assert_eq!(w.tile_index(100, 0), u32::MAX);
    }

    #[test]
    fn dirty_chunks_track_and_clear() {
        let mut w = SimWorld::new(1, 100, 100);
        w.mark_dirty(40, 5); // chunk (1,0) = index 1
        assert_eq!(w.chunk_dirty[1], 1);
        assert_eq!(w.chunk_dirty[0], 0);
        w.clear_dirty();
        assert_eq!(w.chunk_dirty[1], 0);
    }
}
