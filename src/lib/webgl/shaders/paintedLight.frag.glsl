#version 300 es
precision highp float;
precision highp int;

out vec4 fragColor;

const float LIGHT_STEPS = 7.0;
const float LIGHT_SQUASH = 1.25;
const float LIGHT_CEIL = 1.5;
const float BAYER4[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);

float dither(vec2 cell) {
    ivec2 i = ivec2(cell) & 3;
    return (BAYER4[(i.y << 2) | i.x] + 0.5) / 16.0;
}

float stepped(float d, float threshold) {
    if (d >= 1.0) return 0.0;
    return floor((1.0 - d) * (1.0 - d) * LIGHT_STEPS + threshold) / LIGHT_STEPS;
}

vec3 graded(vec2 art) {
    float threshold = dither(art);
    vec3 near = vec3(0.0);
    vec3 day = vec3(0.0);
    for (int i = 0; i < u_lightCount; i++) {
        vec4 at = u_lights[i * 2];
        vec4 tone = u_lights[i * 2 + 1];
        float d = length(vec2(art.x - at.x, (art.y - at.y) * LIGHT_SQUASH));
        near += tone.rgb * stepped(d / at.z, threshold) * tone.a;
        if (at.w > 0.0) day += tone.rgb * stepped(d / at.w, threshold) * tone.a;
    }
    vec3 m = u_weights.x * min(vec3(LIGHT_CEIL), u_timeAmbient[0] + u_timeStrength.x * day);
    m += u_weights.y * min(vec3(LIGHT_CEIL), u_timeAmbient[1] + u_timeStrength.y * near);
    m += u_weights.z * min(vec3(LIGHT_CEIL), u_timeAmbient[2] + u_timeStrength.z * near);
    return m;
}

void main() {
    vec2 screen = vec2(gl_FragCoord.x, u_canvas.y - gl_FragCoord.y);
    vec2 art = floor((screen / u_zoom + u_viewOffset) * u_artPerBase);
    fragColor = vec4(graded(art) * 0.5, 1.0);
}
