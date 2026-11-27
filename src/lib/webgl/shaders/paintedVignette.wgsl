const VIGNETTE_START: f32 = 0.62;
const VIGNETTE_SPAN: f32 = 0.8;
const VIGNETTE_STEPS: f32 = 4.0;
const VIGNETTE_COLOR = vec3f(0.0, 0.0, 14.0 / 255.0);

@fragment
fn fs(@builtin(position) frag: vec4f) -> @location(0) vec4f {
    let px = floor(frag.xy);
    let centre = max(vec2f(0.5), (view.u_canvas - 1.0) * 0.5);
    let v = clamp((length((px - centre) / centre) - VIGNETTE_START) / VIGNETTE_SPAN, 0.0, 1.0);
    let q = min(VIGNETTE_STEPS, floor(v * v * (3.0 - 2.0 * v) * VIGNETTE_STEPS + dither(px)));
    if (q < 1.0) {
        discard;
    }
    return vec4f(VIGNETTE_COLOR, q * vignette.u_strength);
}
