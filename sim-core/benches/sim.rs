use std::hint::black_box;

use gungraun::prelude::*;
use gungraun::{Callgrind, FlamegraphConfig};
use sim_core::SimWorld;

struct DirtyTiles {
    world: SimWorld,
    tiles: Vec<(u32, u32)>,
}

fn populated(entities: u32, dead_every: u32, width: usize, height: usize) -> SimWorld {
    let mut world = SimWorld::new(entities as usize + 16, width, height);
    for _ in 0..entities {
        world.spawn();
    }
    if dead_every > 0 {
        for i in (0..entities).step_by(dead_every as usize) {
            world.kill(i);
        }
    }
    world.bench_step(300);
    world
}

fn moved_tiles(count: u32, width: u32, height: u32) -> DirtyTiles {
    DirtyTiles {
        world: SimWorld::new(16, width as usize, height as usize),
        tiles: (0..count)
            .map(|i| ((i * 7919) % width, (i * 104_729 + 13) % height))
            .collect(),
    }
}

#[library_benchmark]
#[bench::colony(args = (600, 0, 500, 500), setup = populated)]
#[bench::with_dead(args = (2000, 5, 500, 500), setup = populated)]
fn bench_step(mut world: SimWorld) -> f64 {
    black_box(world.bench_step(black_box(10)))
}

#[library_benchmark]
#[bench::save_sized(args = (542, 500, 500), setup = moved_tiles)]
fn dirty_chunks(mut input: DirtyTiles) -> SimWorld {
    for &(x, y) in &input.tiles {
        input.world.mark_dirty(black_box(x), black_box(y));
    }
    input.world.clear_dirty();
    black_box(input.world)
}

library_benchmark_group!(name = sim, benchmarks = [bench_step, dirty_chunks]);

main!(
    config = LibraryBenchmarkConfig::default()
        .tool(Callgrind::default().flamegraph(FlamegraphConfig::default())),
    library_benchmark_groups = sim
);
