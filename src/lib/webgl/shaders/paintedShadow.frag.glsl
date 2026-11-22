#version 300 es
precision highp float;
precision highp int;

uniform vec2 u_canvas;
uniform vec2 u_viewOffset;
uniform vec2 u_zoom;
uniform float u_artPerBase;
uniform float u_tileArt;
uniform sampler2D u_heights;
uniform ivec2 u_origin;
uniform vec3 u_shade;
uniform float u_depth;

out vec4 fragColor;

const vec2 CAST_STEP = vec2(5.0, 3.0);
const vec2 CAST_FAR = vec2(19.0, 12.0);
const float CAST_RISE = 6.0;
const float CAST_TOP = 22.0;

float heightAt(vec2 art) {
    ivec2 t = ivec2(floor(art / u_tileArt)) - u_origin;
    ivec2 size = textureSize(u_heights, 0);
    if (any(lessThan(t, ivec2(0))) || any(greaterThanEqual(t, size))) return 0.0;
    return texelFetch(u_heights, t, 0).r * 255.0;
}

void main() {
    vec2 screen = vec2(gl_FragCoord.x, u_canvas.y - gl_FragCoord.y);
    vec2 art = floor((screen / u_zoom + u_viewOffset) * u_artPerBase);
    bool shaded = heightAt(art - CAST_STEP) >= CAST_RISE
        || heightAt(art - CAST_STEP * 2.0) >= CAST_RISE * 2.0
        || heightAt(art - CAST_STEP * 3.0) >= CAST_RISE * 3.0
        || heightAt(art - CAST_FAR) >= CAST_TOP;
    if (!shaded) discard;
    gl_FragDepth = u_depth;
    fragColor = vec4(u_shade, 1.0);
}
