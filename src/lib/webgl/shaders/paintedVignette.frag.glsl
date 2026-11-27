#version 300 es
precision highp float;
precision highp int;

out vec4 fragColor;

const float VIGNETTE_START = 0.62;
const float VIGNETTE_SPAN = 0.8;
const float VIGNETTE_STEPS = 4.0;
const vec3 VIGNETTE_COLOR = vec3(0.0, 0.0, 14.0 / 255.0);
const float BAYER4[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);

float dither(vec2 cell) {
    ivec2 i = ivec2(cell) & 3;
    return (BAYER4[(i.y << 2) | i.x] + 0.5) / 16.0;
}

void main() {
    vec2 px = floor(vec2(gl_FragCoord.x, u_canvas.y - gl_FragCoord.y));
    vec2 centre = max(vec2(0.5), (u_canvas - 1.0) * 0.5);
    float v = clamp((length((px - centre) / centre) - VIGNETTE_START) / VIGNETTE_SPAN, 0.0, 1.0);
    float q = min(VIGNETTE_STEPS, floor(v * v * (3.0 - 2.0 * v) * VIGNETTE_STEPS + dither(px)));
    if (q < 1.0) discard;
    fragColor = vec4(VIGNETTE_COLOR, q * u_strength);
}
