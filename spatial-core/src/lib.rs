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

    let mut g: Vec<f32> = vec![f32::INFINITY; n];
    let mut parent: Vec<u32> = vec![u32::MAX; n];
    g[start] = 0.0;

    let mut open: BinaryHeap<(Reverse<F32Ord>, u32)> = BinaryHeap::new();
    open.push((Reverse(F32Ord(octile(sx, sy, ex, ey))), start as u32));

    const DIRS: [(i32, i32); 8] = [
        (0, -1), (1, 0), (0, 1), (-1, 0),
        (1, -1), (1, 1), (-1, 1), (-1, -1),
    ];

    let mut iters = 0u32;

    while let Some((_, cur_u32)) = open.pop() {
        let cur = cur_u32 as usize;
        if cur == end {
            return reconstruct(&parent, start, end, w);
        }
        iters += 1;
        if iters >= cap {
            return vec![];
        }

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
            let tentative_g = g[cur] + step * costs[ni].max(1.0);

            if tentative_g < g[ni] {
                g[ni] = tentative_g;
                parent[ni] = cur as u32;
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
