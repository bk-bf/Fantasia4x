const SPAN: f32 = 4.0;
const LUMA = vec3f(0.2126, 0.7152, 0.0722);
const SHAPE_LEAF: i32 = 0;
const SHAPE_DOT: i32 = 1;
const SHAPE_PLUS: i32 = 2;
const SHAPE_APPLE: i32 = 3;
const ARM_ALPHA: f32 = 0.6;
const APPLE_LOW: f32 = 0.62;

struct LeafOut {
    @builtin(position) position: vec4f,
    @location(0) @interpolate(flat) texel: vec2f,
    @location(1) @interpolate(flat) turn: f32,
    @location(2) @interpolate(flat) rgb: vec2f,
    @location(3) @interpolate(flat) look: vec3f,
    @location(4) cell: vec2f,
}

@vertex
fn vs(
    @builtin(vertex_index) index: u32,
    @location(0) a_leaf: vec4f,
    @location(1) a_turn: f32,
    @location(2) a_rgb: vec2f,
    @location(3) a_look: vec3f,
) -> LeafOut {
    let corner = vec2f(f32(index & 1u), f32(index >> 1u));
    let art = a_leaf.xy - 1.0 + corner * SPAN;
    let px = (art * leafFrame.u_basePerArt - view.u_viewOffset) * view.u_zoom;
    var out: LeafOut;
    out.position = vec4f(px.x / view.u_canvas.x * 2.0 - 1.0, 1.0 - px.y / view.u_canvas.y * 2.0, 0.0, 1.0);
    out.texel = a_leaf.zw;
    out.turn = a_turn;
    out.rgb = a_rgb;
    out.look = a_look;
    out.cell = corner * SPAN - 1.0;
    return out;
}

fn unpacked(c: f32) -> vec3f {
    let r = floor(c / 65536.0);
    let g = floor((c - r * 65536.0) / 256.0);
    return vec3f(r, g, c - r * 65536.0 - g * 256.0) / 255.0;
}

fn at2(at: vec2i, x: i32, y: i32) -> bool {
    return all(at == vec2i(x, y));
}

@fragment
fn fs(frag: LeafOut) -> @location(0) vec4f {
    let at = vec2i(floor(frag.cell));
    let shape = i32(frag.look.z + 0.5);
    var alpha = frag.look.y;
    var glow = frag.look.x;
    var rgb: vec3f;
    if (shape == SHAPE_LEAF) {
        let second = select(at2(at, 1, 0), at2(at, 0, 1), frag.turn > 0.5);
        if (!at2(at, 0, 0) && !second) {
            discard;
        }
        let c = textureLoad(u_paintAtlas, vec2i(frag.texel), 0);
        if (c.a < 0.5) {
            discard;
        }
        rgb = c.rgb * select(1.0, leafFrame.u_shade, second);
    } else if (shape == SHAPE_DOT) {
        if (!at2(at, 0, 0)) {
            discard;
        }
        rgb = unpacked(frag.rgb.x);
    } else if (shape == SHAPE_PLUS) {
        let d = abs(at);
        if (d.x + d.y > 1) {
            discard;
        }
        let arm = d.x + d.y == 1;
        rgb = unpacked(select(frag.rgb.x, frag.rgb.y, arm));
        if (arm) {
            alpha *= ARM_ALPHA;
            glow *= ARM_ALPHA;
        }
    } else if (shape == SHAPE_APPLE) {
        if (at.x < 0 || at.y < 0 || at.x > 1 || at.y > 1) {
            discard;
        }
        rgb = unpacked(frag.rgb.x) * select(1.0, APPLE_LOW, at.y == 1);
    } else {
        let puff = at2(at, 0, 0) || at2(at, 1, 0) || at2(at, 0, -1) || at2(at, -1, 0) || at2(at, 1, -1) || at2(at, -1, 1);
        if (!puff) {
            discard;
        }
        rgb = unpacked(frag.rgb.x);
    }
    let glFrag = vec2f(frag.position.x, view.u_canvas.y - frag.position.y);
    if (alpha < 1.0 && alpha <= dither(glFrag)) {
        discard;
    }
    var light = leafFrame.u_ambient;
    if (leafFrame.u_fieldLit > 0.5) {
        light = textureLoad(u_lightTexture, vec2i(frag.position.xy), 0).rgb * 2.0;
    }
    light = mix(light, vec3f(1.0), glow);
    rgb *= light;
    return vec4f(mix(vec3f(dot(rgb, LUMA)), rgb, leafFrame.u_tone.x) * leafFrame.u_tone.y, 1.0);
}
