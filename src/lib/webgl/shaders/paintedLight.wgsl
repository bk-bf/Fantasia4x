const LIGHT_STEPS: f32 = 7.0;
const LIGHT_SQUASH: f32 = 1.25;
const LIGHT_CEIL: f32 = 1.5;

fn stepped(d: f32, threshold: f32) -> f32 {
    if (d >= 1.0) {
        return 0.0;
    }
    return floor((1.0 - d) * (1.0 - d) * LIGHT_STEPS + threshold) / LIGHT_STEPS;
}

fn graded(art: vec2f) -> vec3f {
    let threshold = dither(art);
    var near = vec3f(0.0);
    var day = vec3f(0.0);
    for (var i = 0; i < lightFrame.u_lightCount; i++) {
        let at = lightFrame.u_lights[i * 2];
        let tone = lightFrame.u_lights[i * 2 + 1];
        let d = length(vec2f(art.x - at.x, (art.y - at.y) * LIGHT_SQUASH));
        near += tone.rgb * stepped(d / at.z, threshold) * tone.a;
        if (at.w > 0.0) {
            day += tone.rgb * stepped(d / at.w, threshold) * tone.a;
        }
    }
    let w = lightFrame.u_weights;
    let s = lightFrame.u_timeStrength;
    var m = w.x * min(vec3f(LIGHT_CEIL), lightFrame.u_timeAmbient[0] + s.x * day);
    m += w.y * min(vec3f(LIGHT_CEIL), lightFrame.u_timeAmbient[1] + s.y * near);
    m += w.z * min(vec3f(LIGHT_CEIL), lightFrame.u_timeAmbient[2] + s.z * near);
    return m;
}

@fragment
fn fs(@builtin(position) frag: vec4f) -> @location(0) vec4f {
    let art = floor((frag.xy / view.u_zoom + view.u_viewOffset) * lightFrame.u_artPerBase);
    return vec4f(graded(art) * 0.5, 1.0);
}
