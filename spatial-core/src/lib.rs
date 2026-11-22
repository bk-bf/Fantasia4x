use std::collections::BinaryHeap;
use std::cmp::Reverse;
use wasm_bindgen::prelude::*;


#[derive(Clone, Copy, PartialEq)]
struct F32Ord(f32);

impl Eq for F32Ord {}

impl PartialOrd for F32Ord {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for F32Ord {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.0.total_cmp(&other.0)
    }
}

#[inline]
fn octile(ax: u32, ay: u32, bx: u32, by: u32) -> f32 {
    let dx = ax.abs_diff(bx) as f32;
    let dy = ay.abs_diff(by) as f32;
    let min_d = if dx < dy { dx } else { dy };
    dx + dy + (std::f32::consts::SQRT_2 - 2.0) * min_d
}


struct Scratch {
    g: Vec<f32>,
    parent: Vec<u32>,
    expanded: Vec<bool>,
    touched: Vec<u32>,
}

impl Scratch {
    const fn new() -> Scratch {
        Scratch { g: Vec::new(), parent: Vec::new(), expanded: Vec::new(), touched: Vec::new() }
    }

    fn begin(&mut self, n: usize) {
        if self.g.len() < n {
            self.g = vec![f32::INFINITY; n];
            self.parent = vec![0; n];
            self.expanded = vec![false; n];
        }
    }

    #[inline]
    fn improve(&mut self, i: usize, g: f32, parent: u32) {
        if self.g[i] == f32::INFINITY {
            self.touched.push(i as u32);
        }
        self.g[i] = g;
        self.parent[i] = parent;
        self.expanded[i] = false;
    }

    #[inline]
    fn expand_once(&mut self, i: usize) -> bool {
        !std::mem::replace(&mut self.expanded[i], true)
    }

    fn reset(&mut self) {
        for &t in &self.touched {
            self.g[t as usize] = f32::INFINITY;
            self.expanded[t as usize] = false;
        }
        self.touched.clear();
    }
}

thread_local! {
    static SCRATCH: std::cell::RefCell<Scratch> = const { std::cell::RefCell::new(Scratch::new()) };
}

struct Grid {
    walkable: Vec<u8>,
    costs: Vec<f32>,
    width: u32,
    height: u32,
}

thread_local! {
    static GRID: std::cell::RefCell<Grid> = const {
        std::cell::RefCell::new(Grid { walkable: Vec::new(), costs: Vec::new(), width: 0, height: 0 })
    };
}

#[wasm_bindgen]
pub fn load_grid(walkable: &[u8], costs: &[f32], width: u32, height: u32) {
    GRID.with(|cell| {
        let mut grid = cell.borrow_mut();
        grid.walkable.clear();
        grid.walkable.extend_from_slice(walkable);
        grid.costs.clear();
        grid.costs.extend_from_slice(costs);
        grid.width = width;
        grid.height = height;
    });
}

#[wasm_bindgen]
pub fn set_grid_walkable(index: u32, walkable: bool) {
    GRID.with(|cell| {
        if let Some(tile) = cell.borrow_mut().walkable.get_mut(index as usize) {
            *tile = u8::from(walkable);
        }
    });
}

#[wasm_bindgen]
pub fn find_path_on_grid(
    soft_blocked: &[u32],
    penalty: f32,
    sx: u32,
    sy: u32,
    ex: u32,
    ey: u32,
    max_iter: u32,
) -> Vec<u32> {
    GRID.with(|cell| {
        let mut grid = cell.borrow_mut();
        let n = grid.costs.len();
        let saved: Vec<f32> = soft_blocked
            .iter()
            .map(|&i| grid.costs.get(i as usize).copied().unwrap_or(0.0))
            .collect();
        for &i in soft_blocked {
            if (i as usize) < n {
                grid.costs[i as usize] += penalty;
            }
        }
        let path = find_path(
            &grid.walkable,
            &grid.costs,
            grid.width,
            grid.height,
            sx,
            sy,
            ex,
            ey,
            max_iter,
        );
        for (k, &i) in soft_blocked.iter().enumerate().rev() {
            if (i as usize) < n {
                grid.costs[i as usize] = saved[k];
            }
        }
        path
    })
}

#[wasm_bindgen]
pub fn find_path(
    walkable: &[u8],
    costs: &[f32],
    width: u32,
    height: u32,
    sx: u32,
    sy: u32,
    ex: u32,
    ey: u32,
    max_iter: u32,
) -> Vec<u32> {
    let w = width as usize;
    let h = height as usize;
    let n = w * h;

    if sx as usize >= w
        || sy as usize >= h
        || ex as usize >= w
        || ey as usize >= h
    {
        return vec![];
    }
    let start = sy as usize * w + sx as usize;
    let end   = ey as usize * w + ex as usize;
    if start >= n || end >= n {
        return vec![];
    }
    if walkable[start] == 0 || walkable[end] == 0 {
        return vec![];
    }
    if start == end {
        return vec![sx, sy];
    }

    let cap = if max_iter == 0 { (w * h).min(100_000) as u32 } else { max_iter };

    SCRATCH.with(|cell| {
        let mut scratch = cell.borrow_mut();
        scratch.begin(n);
        let path = search(&mut scratch, walkable, costs, w, h, start, end, ex, ey, cap);
        scratch.reset();
        path
    })
}

fn search(
    scratch: &mut Scratch,
    walkable: &[u8],
    costs: &[f32],
    w: usize,
    h: usize,
    start: usize,
    end: usize,
    ex: u32,
    ey: u32,
    cap: u32,
) -> Vec<u32> {
    scratch.improve(start, 0.0, u32::MAX);

    let mut open: BinaryHeap<(Reverse<F32Ord>, u32)> = BinaryHeap::new();
    let (sx, sy) = ((start % w) as u32, (start / w) as u32);
    open.push((Reverse(F32Ord(octile(sx, sy, ex, ey))), start as u32));

    const DIRS: [(i32, i32); 8] = [
        (0, -1), (1, 0), (0, 1), (-1, 0),
        (1, -1), (1, 1), (-1, 1), (-1, -1),
    ];

    let mut iters = 0u32;

    while let Some((_, cur_u32)) = open.pop() {
        let cur = cur_u32 as usize;
        if cur == end {
            return reconstruct(&scratch.parent, start, end, w);
        }
        iters += 1;
        if iters >= cap {
            return vec![];
        }

        if !scratch.expand_once(cur) {
            continue;
        }
        let g_cur = scratch.g[cur];

        let cx = (cur % w) as i32;
        let cy = (cur / w) as i32;

        for &(dx, dy) in &DIRS {
            let nx = cx + dx;
            let ny = cy + dy;
            if nx < 0 || ny < 0 || nx >= w as i32 || ny >= h as i32 {
                continue;
            }
            let ni = ny as usize * w + nx as usize;
            if walkable[ni] == 0 {
                continue;
            }

            if dx != 0 && dy != 0 {
                let ortho1 = cy as usize * w + nx as usize;
                let ortho2 = ny as usize * w + cx as usize;
                if walkable[ortho1] == 0 && walkable[ortho2] == 0 {
                    continue;
                }
            }

            let step = if dx == 0 || dy == 0 { 1.0f32 } else { std::f32::consts::SQRT_2 };
            let tentative_g = g_cur + step * costs[ni].max(1.0);

            if tentative_g < scratch.g[ni] {
                scratch.improve(ni, tentative_g, cur as u32);
                let h_val = octile(nx as u32, ny as u32, ex, ey);
                open.push((Reverse(F32Ord(tentative_g + h_val)), ni as u32));
            }
        }
    }

    vec![]
}


#[wasm_bindgen]
pub fn nearest_each(points: &[f32], queries: &[f32], max_dist: f32) -> Vec<i32> {
    let np = points.len() / 2;
    let nq = queries.len() / 2;
    let mut out = vec![-1i32; nq];
    if np == 0 || nq == 0 {
        return out;
    }
    let cell = if max_dist >= 1.0 { max_dist } else { 1.0 };

    let mut minx = f32::INFINITY;
    let mut miny = f32::INFINITY;
    let mut maxx = f32::NEG_INFINITY;
    let mut maxy = f32::NEG_INFINITY;
    for i in 0..np {
        let x = points[2 * i];
        let y = points[2 * i + 1];
        if x < minx { minx = x; }
        if x > maxx { maxx = x; }
        if y < miny { miny = y; }
        if y > maxy { maxy = y; }
    }
    let gw = (((maxx - minx) / cell).floor() as usize) + 1;
    let gh = (((maxy - miny) / cell).floor() as usize) + 1;

    let mut buckets: Vec<Vec<u32>> = vec![Vec::new(); gw * gh];
    for i in 0..np {
        let cx = (((points[2 * i] - minx) / cell).floor() as usize).min(gw - 1);
        let cy = (((points[2 * i + 1] - miny) / cell).floor() as usize).min(gh - 1);
        buckets[cy * gw + cx].push(i as u32);
    }

    let max_d2 = max_dist * max_dist;
    const EPS2: f32 = 1e-4;
    for q in 0..nq {
        let qx = queries[2 * q];
        let qy = queries[2 * q + 1];
        let qcx = ((qx - minx) / cell).floor() as isize;
        let qcy = ((qy - miny) / cell).floor() as isize;
        let mut best: i32 = -1;
        let mut best_d2 = max_d2;
        for dy in -1..=1isize {
            let cy = qcy + dy;
            if cy < 0 || cy as usize >= gh {
                continue;
            }
            for dx in -1..=1isize {
                let cx = qcx + dx;
                if cx < 0 || cx as usize >= gw {
                    continue;
                }
                for &pi in &buckets[cy as usize * gw + cx as usize] {
                    let px = points[2 * pi as usize];
                    let py = points[2 * pi as usize + 1];
                    let ddx = px - qx;
                    let ddy = py - qy;
                    let d2 = ddx * ddx + ddy * ddy;
                    if d2 > EPS2 && d2 < best_d2 {
                        best_d2 = d2;
                        best = pi as i32;
                    }
                }
            }
        }
        out[q] = best;
    }
    out
}

fn reconstruct(parent: &[u32], start: usize, end: usize, w: usize) -> Vec<u32> {
    let mut rev_nodes: Vec<usize> = Vec::new();
    let mut cur = end;
    rev_nodes.push(cur);

    while cur != start {
        let p = parent[cur] as usize;
        if p == usize::MAX {
            return vec![];
        }
        cur = p;
        rev_nodes.push(cur);
    }

    rev_nodes.reverse();

    let mut path: Vec<u32> = Vec::with_capacity((rev_nodes.len().saturating_sub(1)) * 2);
    for &node in rev_nodes.iter().skip(1) {
        path.push((node % w) as u32);
        path.push((node / w) as u32);
    }
    path
}

#[cfg(test)]
mod tests {
    use super::*;

    fn open(w: usize, h: usize) -> (Vec<u8>, Vec<f32>) {
        (vec![1u8; w * h], vec![1.0f32; w * h])
    }

    fn nodes(flat: Vec<u32>) -> Vec<(u32, u32)> {
        flat.chunks(2).map(|c| (c[0], c[1])).collect()
    }

    #[test]
    fn open_grid_goes_straight_down_the_diagonal() {
        let (walk, costs) = open(5, 5);
        let path = nodes(find_path(&walk, &costs, 5, 5, 0, 0, 4, 4, 0));
        assert_eq!(path, vec![(1, 1), (2, 2), (3, 3), (4, 4)]);
    }

    #[test]
    fn a_diagonal_step_costs_more_than_a_straight_one() {
        let (walk, mut costs) = open(5, 3);
        for x in 1..5 {
            costs[x] = 1.2;
        }
        let path = nodes(find_path(&walk, &costs, 5, 3, 0, 0, 4, 0, 0));
        assert_eq!(path, vec![(1, 0), (2, 0), (3, 0), (4, 0)]);
    }

    #[test]
    fn a_diagonal_may_pass_one_blocked_corner() {
        let (mut walk, costs) = open(3, 3);
        walk[1] = 0;
        let path = nodes(find_path(&walk, &costs, 3, 3, 0, 0, 1, 1, 0));
        assert_eq!(path, vec![(1, 1)]);
    }

    #[test]
    fn a_diagonal_never_squeezes_between_two_blocked_corners() {
        let (mut walk, costs) = open(3, 3);
        walk[1] = 0;
        walk[3] = 0;
        assert!(find_path(&walk, &costs, 3, 3, 0, 0, 1, 1, 0).is_empty());
    }

    #[test]
    fn an_unwalkable_end_has_no_path() {
        let (mut walk, costs) = open(5, 5);
        walk[4 * 5 + 4] = 0;
        assert!(find_path(&walk, &costs, 5, 5, 0, 0, 4, 4, 0).is_empty());
    }

    #[test]
    fn a_cheaper_route_found_later_replaces_a_dearer_one() {
        let (walk, mut costs) = open(5, 3);
        for x in 1..4 {
            costs[5 + x] = 9.0;
        }
        let path = nodes(find_path(&walk, &costs, 5, 3, 0, 1, 4, 1, 0));
        assert_eq!(path.len(), 4);
        assert!(path[..3].iter().all(|&(_, y)| y != 1));
        assert_eq!(path[3], (4, 1));
    }
}
