use wasm_bindgen::prelude::*;

const CH: usize = 32;

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

pub const I_X: usize = 0;
pub const I_Y: usize = 1;
pub const I_STATE_SINCE: usize = 2;
pub const I_LAST_SLEEP: usize = 3;
pub const I_LAST_MEAL: usize = 4;
pub const I_LAST_DRINK: usize = 5;
pub const I_LAST_WASH: usize = 6;
pub const I_PATH_INDEX: usize = 7;
pub const I_BLOCKED_TICKS: usize = 8;
pub const I_TARGET: usize = 9;
pub const NI32: usize = 10;

pub const U_KIND: usize = 0;
pub const U_ALIVE: usize = 1;
pub const U_STATE: usize = 2;
pub const U_FLAGS: usize = 3;
pub const NU8: usize = 4;

pub const S_STR: usize = 0;
pub const S_DEX: usize = 1;
pub const S_INT: usize = 2;
pub const S_PER: usize = 3;
pub const S_CHA: usize = 4;
pub const S_CON: usize = 5;
pub const NI16: usize = 6;

#[wasm_bindgen]
pub struct SimWorld {
    cap: usize,
    high: usize,
    free: Vec<u32>,
    f32p: Vec<f32>,
    i32p: Vec<i32>,
    u8p: Vec<u8>,
    i16p: Vec<i16>,

    width: usize,
    height: usize,
    chunks_x: usize,
    chunks_y: usize,
    tile_total: usize,
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
            t_walk: vec![1; tile_total],
            t_terrain: vec![0; tile_total],
            t_cost: vec![1.0; tile_total],
            t_res_id: vec![0; tile_total],
            t_res_amt: vec![0.0; tile_total],
            t_res_cd: vec![0; tile_total],
            t_flags: vec![0; tile_total],
            chunk_dirty: vec![0; chunks_x * chunks_y],
        }
    }

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

    pub fn kill(&mut self, i: u32) {
        let idx = i as usize;
        if idx < self.cap && self.u8p[U_ALIVE * self.cap + idx] == 1 {
            self.u8p[U_ALIVE * self.cap + idx] = 0;
            self.free.push(i);
        }
    }

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

    pub fn mark_dirty(&mut self, x: u32, y: u32) {
        let (x, y) = (x as usize, y as usize);
        if x < self.width && y < self.height {
            self.chunk_dirty[(y / CH) * self.chunks_x + (x / CH)] = 1;
        }
    }

    pub fn clear_dirty(&mut self) {
        for d in self.chunk_dirty.iter_mut() {
            *d = 0;
        }
    }

    pub fn cap(&self) -> usize {
        self.cap
    }
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
                let hu = &mut self.f32p[F_HUNGER * cap + i];
                *hu = (*hu + 0.10).min(100.0);
                let fa = &mut self.f32p[F_FATIGUE * cap + i];
                *fa = (*fa + 0.05).min(100.0);
                let th = &mut self.f32p[F_THIRST * cap + i];
                *th = (*th + 0.08).min(100.0);
                let hy = &mut self.f32p[F_HYGIENE * cap + i];
                *hy = (*hy + 0.02).min(100.0);
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

#[wasm_bindgen]
pub fn wasm_memory() -> JsValue {
    wasm_bindgen::memory()
}

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
        assert_eq!(w.spawn(), 0);
        assert_eq!(w.spawn(), 2);
        assert_eq!(w.spawn(), 3);
        assert_eq!(w.spawn(), -1);
    }

    #[test]
    fn field_major_addressing_is_contiguous_per_field() {
        let w = SimWorld::new(8, 32, 32);
        let a = F_HUNGER * w.cap + 3;
        let b = F_HUNGER * w.cap + 4;
        assert_eq!(b - a, 1);
        assert_eq!(w.f32p.len(), NF32 * 8);
        assert_eq!(w.i32p.len(), NI32 * 8);
    }

    #[test]
    fn tile_index_is_chunk_major_and_bounds_checked() {
        let w = SimWorld::new(1, 100, 100);
        assert_eq!(w.chunks_x, 4);
        assert_eq!(w.tile_index(0, 0), 0);
        assert_eq!(w.tile_index(1, 0), 1);
        assert_eq!(w.tile_index(0, 1), CH as u32);
        assert_eq!(w.tile_index(32, 0), (CH * CH) as u32);
        assert_eq!(w.tile_index(100, 0), u32::MAX);
    }

    #[test]
    fn dirty_chunks_track_and_clear() {
        let mut w = SimWorld::new(1, 100, 100);
        w.mark_dirty(40, 5);
        assert_eq!(w.chunk_dirty[1], 1);
        assert_eq!(w.chunk_dirty[0], 0);
        w.clear_dirty();
        assert_eq!(w.chunk_dirty[1], 0);
    }
}
