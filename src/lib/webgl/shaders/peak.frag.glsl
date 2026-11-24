#version 300 es
precision mediump float;

in highp vec2 v_art;

uniform highp sampler2D u_peak;
uniform highp ivec2 u_chunk;
uniform sampler2D u_paintAtlas;
uniform vec2 u_rockRamp;
uniform vec2 u_snowRamp;
uniform float u_rockLift;
uniform highp sampler2D u_lightTexture;
uniform float u_fieldLit;
uniform vec3 u_ambient;
uniform float u_saturation;
uniform float u_brightness;
uniform highp float u_rowPx;
uniform highp float u_rowDepth;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
const int SNOW_CODE = 8;

out vec4 fragColor;

#define ROCK_SURFACE_CODE

vec3 weathered(vec3 c) {
    return mix(vec3(dot(c, LUMA)), c, u_saturation) * u_brightness;
}

void main() {
    highp ivec2 p = ivec2(floor(v_art));
    vec4 t = texelFetch(u_peak, p - u_chunk, 0);
    int code = int(t.r * 255.0 + 0.5);
    if (code == 0 || underCut(p)) discard;
    highp int off = int(t.g * 255.0 + 0.5) + 256 * int(t.b * 255.0 + 0.5);
    highp ivec2 src = ivec2(p.x, p.y + int(u_rockLift + 0.5) + off);
    vec3 rock = code >= SNOW_CODE
        ? texelFetch(u_paintAtlas, ivec2(u_snowRamp) + ivec2(code - SNOW_CODE, 0), 0).rgb
        : texelFetch(u_paintAtlas, ivec2(u_rockRamp) + ivec2(code - 1, 0), 0).rgb;
    highp ivec2 tile = tileOf(src);
    highp uvec4 info = peakTile(tile);
    if (info.g > 0u && code < SNOW_CODE) {
        highp vec2 at = vec2(src) + 0.5;
        rock = vein(rock, at, at, false, vec4(float(info.g - 1u), float(info.b), vec2(tile)), float(info.a));
    }
    vec3 light = u_fieldLit > 0.5
        ? texelFetch(u_lightTexture, ivec2(gl_FragCoord.xy), 0).rgb * 2.0
        : min(u_ambient, vec3(1.6));
    gl_FragDepth = 0.5 - 0.5 * float(src.y) / u_rowPx * u_rowDepth;
    fragColor = vec4(weathered(rock * light), 1.0);
}
