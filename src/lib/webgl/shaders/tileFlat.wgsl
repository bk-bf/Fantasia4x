@vertex
fn vs(glyph: GlyphIn) -> TileOut {
    return tileVertex(glyph, RowIn(0.0, vec4f(0.0, 0.0, 0.0, 1.0), 0.0, 0.0, 0.0));
}

@fragment
fn fs(frag: TileOut) -> @location(0) vec4f {
    return tilePixel(frag).color;
}
