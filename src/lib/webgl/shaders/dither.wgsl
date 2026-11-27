const BAYER4 = array<f32, 16>(0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);

fn dither(cell: vec2f) -> f32 {
    let i = vec2i(cell) & vec2i(3);
    return (BAYER4[(i.y << 2u) | i.x] + 0.5) / 16.0;
}
