#version 300 es
precision highp float;
precision highp int;

uniform vec2 u_canvas;
uniform vec2 u_viewOffset;
uniform vec2 u_zoom;
uniform float u_artPerBase;
uniform vec3 u_ambient;
uniform float u_vignette;
uniform int u_lightCount;
uniform vec4 u_lights[128];
uniform int u_pass;

out vec4 fragColor;

const float LIGHT_STEPS = 7.0;
const float LIGHT_SQUASH = 1.25;
const float LIGHT_CEIL = 1.5;
const float VIGNETTE_START = 0.62;
const float VIGNETTE_SPAN = 0.8;
const float VIGNETTE_STEPS = 4.0;
const vec3 VIGNETTE_COLOR = vec3(0.0, 0.0, 14.0 / 255.0);
const float BAYER4[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);

float dither(vec2 cell) {
    ivec2 i = ivec2(cell) & 3;
    return (BAYER4[(i.y << 2) | i.x] + 0.5) / 16.0;
}

vec3 pointLight(vec2 art) {
    float threshold = dither(art);
    vec3 sum = vec3(0.0);
    for (int i = 0; i < u_lightCount; i++) {
        vec4 at = u_lights[i * 2];
        vec2 offset = vec2(art.x - at.x, (art.y - at.y) * LIGHT_SQUASH);
        float d = length(offset) / at.z;
        if (d >= 1.0) continue;
        float q = floor((1.0 - d) * (1.0 - d) * LIGHT_STEPS + threshold) / LIGHT_STEPS;
        sum += u_lights[i * 2 + 1].rgb * q * at.w;
    }
    return sum;
}

void main() {
    vec2 screen = vec2(gl_FragCoord.x, u_canvas.y - gl_FragCoord.y);
    float artPx = u_zoom.x / u_artPerBase;
    if (u_pass == 0) {
        vec2 art = floor((screen / u_zoom + u_viewOffset) * u_artPerBase);
        vec3 light = min(vec3(LIGHT_CEIL), u_ambient + pointLight(art));
        fragColor = vec4(light * 0.5, 1.0);
        return;
    }
    vec2 cells = max(vec2(1.0), floor(u_canvas / artPx));
    vec2 cell = floor(screen / artPx);
    vec2 centre = (cells - 1.0) * 0.5;
    float v = clamp((length((cell - centre) / centre) - VIGNETTE_START) / VIGNETTE_SPAN, 0.0, 1.0);
    float q = min(VIGNETTE_STEPS, floor(v * v * (3.0 - 2.0 * v) * VIGNETTE_STEPS + dither(cell)));
    if (q < 1.0) discard;
    fragColor = vec4(VIGNETTE_COLOR, q * u_vignette);
}
