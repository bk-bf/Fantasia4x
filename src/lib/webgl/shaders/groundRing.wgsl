@vertex
fn vs(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
    let corner = vec2f(f32(index & 1u), f32(index >> 1u));
    let px = ringDraw.u_area.xy + corner * ringDraw.u_area.zw;
    return vec4f(px.x / view.u_canvas.x * 2.0 - 1.0, 1.0 - px.y / view.u_canvas.y * 2.0, 0.0, 1.0);
}

fn onRing(p: vec2f) -> bool {
    let outer = ringDraw.u_ring.zw * 0.5;
    let d = p - (ringDraw.u_ring.xy + outer);
    if (dot(d / outer, d / outer) > 1.0) {
        return false;
    }
    let inner = outer - ringFrame.u_line;
    return inner.x <= 0.0 || inner.y <= 0.0 || dot(d / inner, d / inner) >= 1.0;
}

@fragment
fn fs(@builtin(position) frag: vec4f) -> @location(0) vec4f {
    let p = frag.xy;
    if (onRing(p)) {
        return vec4f(ringFrame.u_color, 1.0);
    }
    if (!onRing(p - ringFrame.u_offset)) {
        discard;
    }
    return vec4f(ringFrame.u_shadow, 1.0);
}
