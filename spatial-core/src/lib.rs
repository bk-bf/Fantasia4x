use std::collections::BinaryHeap;
use std::cmp::Reverse;
use wasm_bindgen::prelude::*;

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

/// Wrapper so f32 is usable as a `BinaryHeap` key (min-heap via `Reverse`).
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

/// Octile heuristic: `dx + dy + (√2 - 2) * min(dx, dy)` with unit cost = 1.
/// Admissible when all tile movement costs are >= 1.
#[inline]
fn octile(ax: u32, ay: u32, bx: u32, by: u32) -> f32 {
    let dx = ax.abs_diff(bx) as f32;
    let dy = ay.abs_diff(by) as f32;
    let min_d = if dx < dy { dx } else { dy };
    dx + dy + (std::f32::consts::SQRT_2 - 2.0) * min_d
}

// ──────────────────────────────────────────────────────────────────────────────
// Public WASM export
// ──────────────────────────────────────────────────────────────────────────────

/// A* pathfinder with octile heuristic and 8-direction movement.
///
/// # Arguments
/// * `walkable` – flat `u8` array, length `width*height`; `1` = walkable, `0` = blocked
/// * `costs`    – flat `f32` movement-cost array, same layout; `1.0` = plains baseline
/// * `width`, `height` – grid dimensions
/// * `sx`, `sy` – start tile
/// * `ex`, `ey` – end tile
///
/// Returns interleaved `[x0,y0, x1,y1, …]` pairs (u32) for the found path,
/// or an empty vec if no path exists or the search limit is hit.
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
) -> Vec<u32> {
    let w = width as usize;
    let h = height as usize;
    let n = w * h;

    // Bounds / walkability guards
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

    // Search limit: allow up to the full grid size worth of node expansions.
    // The old formula (w*h/10*1500/10000) gave only ~144 for a 120×80 map
    // which was far too low for long cross-map paths.
    let max_iter = (w * h).min(100_000) as u32;

    // g_cost per node (f32, initialized to +∞)
    let mut g: Vec<f32> = vec![f32::INFINITY; n];
    let mut parent: Vec<u32> = vec![u32::MAX; n];
    g[start] = 0.0;

    // Min-heap: (Reverse(f_cost), flat_index)
    let mut open: BinaryHeap<(Reverse<F32Ord>, u32)> = BinaryHeap::new();
    open.push((Reverse(F32Ord(octile(sx, sy, ex, ey))), start as u32));

    // 8-direction offsets: 4 cardinal first, 4 diagonal
    const DIRS: [(i32, i32); 8] = [
        (0, -1), (1, 0), (0, 1), (-1, 0),   // cardinal
        (1, -1), (1, 1), (-1, 1), (-1, -1), // diagonal
    ];

    let mut iters = 0u32;

    while let Some((_, cur_u32)) = open.pop() {
        let cur = cur_u32 as usize;
        if cur == end {
            return reconstruct(&parent, start, end, w);
        }
        iters += 1;
        if iters >= max_iter {
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

            // Diagonal wall-cut prevention:
            // allow diagonal only when at least one orthogonal neighbour is walkable
            if dx != 0 && dy != 0 {
                let ortho1 = cy as usize * w + nx as usize; // (nx, cy)
                let ortho2 = ny as usize * w + cx as usize; // (cx, ny)
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

fn reconstruct(parent: &[u32], start: usize, end: usize, w: usize) -> Vec<u32> {
    // Reconstruct as node indices first, then reverse node order.
    // Reversing a flat [x,y,x,y,...] list corrupts coordinate pairing.
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

    // Match engine expectation: path excludes start tile, contains next steps only.
    let mut path: Vec<u32> = Vec::with_capacity((rev_nodes.len().saturating_sub(1)) * 2);
    for &node in rev_nodes.iter().skip(1) {
        path.push((node % w) as u32);
        path.push((node / w) as u32);
    }
    path
}
