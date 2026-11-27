#version 300 es
precision mediump float;

in highp vec2 v_art;

uniform highp sampler2D u_tierFieldTexture;
uniform sampler2D u_paintAtlas;
uniform highp sampler2D u_rockTexture;
uniform highp vec2 u_rockRamp;
uniform float u_rockLift;
uniform highp sampler2D u_lightTexture;
uniform float u_fieldLit;
uniform vec3 u_ambient;
uniform float u_saturation;
uniform float u_brightness;
uniform highp float u_rowPx;
uniform highp float u_rowDepth;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
const uint TIER_REACH = 8u;
const int STEP = 24;
const int TOP_TIER = 4;
const int RAMP_TOP = 6;
const float JAG = 0.4;
const float TIER_TONE = 0.045;
const int LIP = 3;
const float SHADE_TONE = 0.2;
const highp vec2 SUN = vec2(-0.958, -0.287);
const int SUN_SAMPLES = 5;
const float SUN_STRIDE = 4.0;
const float SUN_RISE = 1.1;
const float SUN_SOFT = 4.0;
const float FACE_SPAN = 1.25;
const float FACE_LOW = 0.75;
const float FACE_KEY = 0.4;
const float FACE_FALL = 0.24;
const float FACE_LIP = 0.2;
const float FACE_SCALE = 0.8;
const float FACE_DITHER = 0.3;
const float FACE_LIT = 1.14;
const float FACE_DARK = 0.72;
const float FACE_FOOT = 0.6;

out vec4 fragColor;

#define ROCK_SURFACE_CODE

vec3 weathered(vec3 c) {
    return mix(vec3(dot(c, LUMA)), c, u_saturation) * u_brightness;
}

highp vec4 fieldAt(highp ivec2 p) {
    highp vec2 size = vec2(textureSize(u_tierFieldTexture, 0)) * float(VEIN_TILE);
    return texture(u_tierFieldTexture, (vec2(p) + 0.5) / size);
}

int levelAt(highp ivec2 p) {
    vec4 f = fieldAt(p);
    float cut = 0.5 - (tierNoise(p).r - 0.5) * JAG;
    if (f.r <= cut) return 0;
    if (f.g <= cut) return 1;
    if (f.b <= cut) return 2;
    if (f.a <= cut) return 3;
    return TOP_TIER;
}

float shadowAt(highp ivec2 src, int level) {
    float dark = 0.0;
    float base = float(level * STEP);
    for (int i = 1; i <= SUN_SAMPLES; i++) {
        float d = float(i) * SUN_STRIDE;
        highp ivec2 q = src + ivec2(floor(SUN * d + 0.5));
        float over = float(levelAt(q) * STEP) - (base + d * SUN_RISE);
        if (over > 0.0) dark = max(dark, min(1.0, over / SUN_SOFT));
    }
    return dark;
}

vec3 rampAt(highp vec2 ramp, int k) {
    return texelFetch(u_paintAtlas, ivec2(ramp) + ivec2(clamp(k, 0, RAMP_TOP), 0), 0).rgb;
}

vec3 face(highp ivec2 p, highp ivec2 src, int level, int k, int span) {
    float t = FACE_KEY - float(k) / float(span) * FACE_FALL + tierNoise(p).g * FACE_SPAN - FACE_LOW;
    if (k == 1) t += FACE_LIP;
    int i = int(floor(clamp(t * FACE_SCALE, 0.0, 1.0) * float(RAMP_TOP) + 0.5 + (bayer(p) - 0.5) * FACE_DITHER));
    vec3 c = rampAt(u_rockRamp, i);
    if (levelAt(src - ivec2(1, 0)) < level) c = min(c * FACE_LIT, vec3(1.0));
    else if (levelAt(src + ivec2(1, 0)) < level) c = vec3(c.rg * FACE_DARK, c.b * (FACE_DARK + 0.1));
    if (k == span - 1) c = vec3(c.rg * FACE_FOOT, c.b * (FACE_FOOT + 0.1));
    return c;
}

vec3 ledge(highp ivec2 src, int level, float shadow) {
    bool up = levelAt(src - ivec2(0, 1)) < level;
    bool left = levelAt(src - ivec2(1, 0)) < level;
    bool right = levelAt(src + ivec2(1, 0)) < level;
    int rim = up || left ? 1 : right ? 2 : 0;
    bool lip = levelAt(src - ivec2(0, LIP)) < level || levelAt(src - ivec2(LIP, 0)) < level;
    highp ivec2 size = textureSize(u_rockTexture, 0);
    int shade = int(texelFetch(u_rockTexture, (src % size + size) % size, 0)[rim] * 255.0 + 0.5);
    if (snowLies(src, level, rim, lip)) return snowOn(src, shade, rim, shadow);
    float lift = (float(level) * TIER_TONE - shadow * SHADE_TONE) * float(RAMP_TOP);
    vec3 rock = rampAt(u_rockRamp, shade + int(floor(lift + tierNoise(src).a)));
    highp ivec2 tile = tileOf(src);
    highp uvec4 info = tierTile(tile);
    if (info.g == 0u) return rock;
    highp vec2 at = vec2(src) + 0.5;
    return vein(rock, at, at, false, vec4(float(info.g - 1u), float(info.b), vec2(tile)), float(info.a));
}

void main() {
    highp ivec2 p = ivec2(floor(v_art));
    if ((tierTile(tileOf(p)).r & TIER_REACH) == 0u || underCut(p)) discard;
    highp int ground = p.y + int(u_rockLift + 0.5);
    highp int y = ground;
    int level = -1;
    for (int band = TOP_TIER; band >= 1 && level < 0; band--) {
        highp int hi = ground + STEP * band;
        int at = levelAt(ivec2(p.x, hi));
        if (at >= band) {
            y = hi;
            level = at;
            break;
        }
        highp int lo = ground + STEP * (band - 1) + 1;
        int low = levelAt(ivec2(p.x, lo));
        if (low < band) continue;
        while (hi - lo > 1) {
            highp int mid = (lo + hi) / 2;
            int m = levelAt(ivec2(p.x, mid));
            if (m >= band) {
                lo = mid;
                low = m;
            } else hi = mid;
        }
        y = lo;
        level = low;
    }
    if (level < 0) level = levelAt(ivec2(p.x, ground));
    highp ivec2 src = ivec2(p.x, y);
    int k = ground - y + STEP * level;
    vec3 rock;
    if (k > 0) {
        int south = levelAt(src + ivec2(0, 1));
        rock = face(p, src, level, k, 1 + STEP * max(level - south, 0));
    } else {
        if (level == 0) discard;
        rock = ledge(src, level, shadowAt(src, level));
    }
    vec3 light = u_fieldLit > 0.5
        ? texelFetch(u_lightTexture, ivec2(gl_FragCoord.xy), 0).rgb * 2.0
        : min(u_ambient, vec3(1.6));
    gl_FragDepth = 0.5 - 0.5 * float(y) / u_rowPx * u_rowDepth;
    fragColor = vec4(weathered(rock * light), 1.0);
}
