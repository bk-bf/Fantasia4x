use std::hint::black_box;

use gungraun::prelude::*;
use gungraun::{Callgrind, FlamegraphConfig};

struct Route {
    walkable: Vec<u8>,
    costs: Vec<f32>,
    width: u32,
    height: u32,
    start: (u32, u32),
    end: (u32, u32),
    max_iter: u32,
}

struct Herd {
    points: Vec<f32>,
    queries: Vec<f32>,
    max_dist: f32,
}

fn hash(i: u32) -> u32 {
    let mut x = i.wrapping_add(0x9E37_79B9).wrapping_mul(0x85EB_CA6B);
    x ^= x >> 13;
    x = x.wrapping_mul(0xC2B2_AE35);
    x ^ (x >> 16)
}

impl Route {
    fn scattered(width: u32, height: u32, blocked_per_mille: u32) -> Route {
        let n = (width * height) as usize;
        let mut walkable = vec![1u8; n];
        let mut costs = vec![1.0f32; n];
        for i in 0..n {
            let h = hash(i as u32);
            if h % 1000 < blocked_per_mille {
                walkable[i] = 0;
            }
            costs[i] = 1.0 + ((h >> 20) % 4) as f32 * 0.5;
        }
        Route {
            walkable,
            costs,
            width,
            height,
            start: (0, 0),
            end: (0, 0),
            max_iter: 0,
        }
    }

    fn set(&mut self, x: u32, y: u32, walkable: bool) {
        self.walkable[(y * self.width + x) as usize] = u8::from(walkable);
    }

    fn between(mut self, start: (u32, u32), end: (u32, u32), max_iter: u32) -> Route {
        self.set(start.0, start.1, true);
        self.set(end.0, end.1, true);
        self.start = start;
        self.end = end;
        self.max_iter = max_iter;
        self
    }
}

fn scattered_route() -> Route {
    Route::scattered(200, 200, 150).between((4, 4), (195, 190), 0)
}

fn walled_route() -> Route {
    let mut route = Route::scattered(200, 200, 80);
    for (k, x) in (20..200).step_by(30).enumerate() {
        let gap = if k % 2 == 0 { 185 } else { 14 };
        for y in 0..route.height {
            route.set(x, y, y.abs_diff(gap) <= 1);
        }
    }
    route.between((4, 100), (195, 100), 100_000)
}

fn enclosed_route() -> Route {
    let mut route = Route::scattered(200, 200, 150);
    for y in 147..=153 {
        for x in 147..=153 {
            if x == 147 || x == 153 || y == 147 || y == 153 {
                route.set(x, y, false);
            }
        }
    }
    route.between((10, 10), (150, 150), 8000)
}

fn scatter(count: u32, seed: u32, extent: u32) -> Vec<f32> {
    (0..count * 2)
        .map(|i| (hash(seed.wrapping_add(i)) % extent) as f32)
        .collect()
}

fn herd(predators: u32, prey: u32, extent: u32) -> Herd {
    Herd {
        points: scatter(predators, 1, extent),
        queries: scatter(prey, 0x4000_0000, extent),
        max_dist: 40.0,
    }
}

#[library_benchmark]
#[bench::scattered(setup = scattered_route)]
#[bench::walled(setup = walled_route)]
#[bench::unreachable(setup = enclosed_route)]
fn find_path(route: Route) -> Vec<u32> {
    black_box(spatial_core::find_path(
        black_box(&route.walkable),
        black_box(&route.costs),
        route.width,
        route.height,
        route.start.0,
        route.start.1,
        route.end.0,
        route.end.1,
        route.max_iter,
    ))
}

#[library_benchmark]
#[bench::save_sized(args = (180, 362, 500), setup = herd)]
#[bench::dense(args = (1000, 2000, 256), setup = herd)]
fn nearest_each(herd: Herd) -> Vec<i32> {
    black_box(spatial_core::nearest_each(
        black_box(&herd.points),
        black_box(&herd.queries),
        herd.max_dist,
    ))
}

library_benchmark_group!(name = spatial, benchmarks = [find_path, nearest_each]);

main!(
    config = LibraryBenchmarkConfig::default()
        .tool(Callgrind::default().flamegraph(FlamegraphConfig::default())),
    library_benchmark_groups = spatial
);
