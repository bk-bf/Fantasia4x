use std::time::Instant;
fn main() {
    let ents: usize = std::env::args().nth(1).map(|s| s.parse().unwrap()).unwrap_or(2419);
    let ticks: u32 = 600;
    let mut w = sim_core::SimWorld::new(ents + 16, 1060, 1060);
    for _ in 0..ents { w.spawn(); }
    w.bench_step(ticks);
    let mut s = vec![];
    for _ in 0..7 { let t = Instant::now(); std::hint::black_box(w.bench_step(ticks)); s.push(t.elapsed().as_secs_f64() * 1000.0 / ticks as f64); }
    s.sort_by(|a, b| a.partial_cmp(b).unwrap());
    println!("native-rust {} ents ms/tick median {:.5}", ents, s[3]);
}
