#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;

in highp vec2 v_art;

uniform usampler2D u_kinds;
uniform sampler2D u_paintAtlas;
uniform sampler2D u_light;
uniform ivec2 u_mapSize;
uniform float u_tileArt;
uniform vec4 u_patch[64];
uniform vec2 u_layer[64];
uniform vec3 u_ambient;
uniform float u_lightFlicker;
uniform highp sampler2D u_lightTexture;
uniform float u_fieldLit;
uniform float u_saturation;
uniform float u_brightness;
uniform float u_waterTime;
uniform sampler2D u_tide;
uniform sampler2D u_waterField;

out vec4 fragColor;

const float WARP_WIDE_FREQ = 0.042;
const float WARP_WIDE_AMP = 22.0;
const float WARP_FINE_FREQ = 0.155;
const float WARP_FINE_AMP = 7.0;
const float LIP_REACH = 4.0;
const float LIP_STEP = 0.4;
const float UNDER_HIGHER = 0.68;
const float ABOVE_LOW = 0.8;
const float LOW_GROUND = 2.0;
const float BANK_REACH = 6.0;
const float FOAM_REACH = 2.0;
const float WET_REACH = 4.5;
const float WET_BREAK = 0.45;
const int RAPIDS = 3;
const float BANK_DROP = 1.4;
const float RAPIDS_RISE = 0.75;
const float OPEN_CELL_DROP = 1.0;
const float TONE_SCALE = 32.0;
const float TONE_OFFSET = 2.0;
const float EDGE_LEVELS = 8.0;
const float EDGE_WOBBLE = 0.6;
const float DITHER = 0.45;
const int OPEN_CELL = 128;
const float WATER_FPS = 8.0;
const int WATER_LOOP = 16;
const int WATER_BLEND = 4;
const float PHASE_STEP = 0.26;
const float FIELD_PERIOD = 2048.0;
const vec2 RIPPLE_CELLS = vec2(174.0, 553.0);
const vec2 GLINT_CELLS = vec2(225.0, 2253.0);
const vec2 STREAK_CELLS = vec2(430.0, 113.0);
const vec2 CHURN_CELLS = vec2(1024.0, 922.0);
const float RIPPLE_CREST = 1.0;
const float RIPPLE_TROUGH = 0.5;
const float GLINT_RISE = 0.8;
const float CHURN_WEIGHT = 0.4;

const float BAYER[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
const vec3 DEEP[6] = vec3[6](
    vec3(15.0, 29.0, 51.0) / 255.0, vec3(21.0, 42.0, 71.0) / 255.0, vec3(27.0, 58.0, 92.0) / 255.0,
    vec3(36.0, 80.0, 114.0) / 255.0, vec3(47.0, 104.0, 136.0) / 255.0, vec3(74.0, 138.0, 162.0) / 255.0);
const vec3 SHALLOWS[6] = vec3[6](
    vec3(28.0, 74.0, 82.0) / 255.0, vec3(38.0, 96.0, 102.0) / 255.0, vec3(51.0, 120.0, 122.0) / 255.0,
    vec3(74.0, 148.0, 144.0) / 255.0, vec3(111.0, 176.0, 164.0) / 255.0, vec3(165.0, 210.0, 192.0) / 255.0);
float dither(ivec2 q) {
    return (BAYER[((q.y & 3) << 2) | (q.x & 3)] + 0.5) / 16.0;
}

const vec3 FOAM[3] = vec3[3](
    vec3(169.0, 207.0, 208.0) / 255.0, vec3(207.0, 230.0, 226.0) / 255.0, vec3(238.0, 247.0, 242.0) / 255.0);

float hash(int x, int y, int z) {
    uint n = (uint(x) * 374761393u) ^ (uint(y) * 668265263u) ^ (uint(z) * 1274126177u);
    n = (n ^ (n >> 13u)) * 1274126177u;
    return float(n ^ (n >> 16u)) / 4294967296.0;
}

float valueNoise(vec2 p, int seed) {
    vec2 i = floor(p);
    vec2 f = p - i;
    f = f * f * (3.0 - 2.0 * f);
    ivec2 c = ivec2(i);
    float top = mix(hash(c.x, c.y, seed), hash(c.x + 1, c.y, seed), f.x);
    float bottom = mix(hash(c.x, c.y + 1, seed), hash(c.x + 1, c.y + 1, seed), f.x);
    return mix(top, bottom, f.y);
}

float periodicNoise(vec2 q, vec2 cells, vec2 offset, int seed) {
    vec2 g = q * cells / FIELD_PERIOD + offset;
    vec2 i = floor(g);
    vec2 f = g - i;
    f = f * f * (3.0 - 2.0 * f);
    ivec2 a = ivec2(mod(i, cells));
    ivec2 b = ivec2(mod(i + 1.0, cells));
    float top = mix(hash(a.x, a.y, seed), hash(b.x, a.y, seed), f.x);
    float bottom = mix(hash(a.x, b.y, seed), hash(b.x, b.y, seed), f.x);
    return mix(top, bottom, f.y);
}

float waterPhase(ivec2 q) {
    int frame = int(floor(u_waterTime * WATER_FPS)) % WATER_LOOP;
    if (frame < WATER_BLEND
        && BAYER[((q.y & 3) << 2) | (q.x & 3)] >= float((frame + 1) * 16) / float(WATER_BLEND + 1))
        frame += WATER_LOOP;
    return float(frame) * PHASE_STEP;
}

uint kindAt(vec2 art) {
    ivec2 tile = clamp(ivec2(floor(art / u_tileArt)), ivec2(0), u_mapSize - 1);
    return texelFetch(u_kinds, tile, 0).r;
}

bool landAt(vec2 art) {
    ivec2 tile = clamp(ivec2(floor(art / u_tileArt)), ivec2(0), u_mapSize - 1);
    return texelFetch(u_tide, tile, 0).g > 0.5;
}

bool landWithin(vec2 w, float r) {
    return landAt(w + vec2(r, 0.0)) || landAt(w - vec2(r, 0.0))
        || landAt(w + vec2(0.0, r)) || landAt(w - vec2(0.0, r));
}

int rampStep(float tone, ivec2 q) {
    return clamp(int(floor(clamp(tone, 0.0, 5.0) + 0.5 + (dither(q) - 0.5) * DITHER)), 0, 5);
}

vec3 water(vec2 w, int kind, ivec2 q) {
    float ph = waterPhase(q);
    if (landWithin(w, WET_REACH)) {
        if (landWithin(w, FOAM_REACH))
            return FOAM[((int(floor(ph)) + (q.x >> 2)) & 1) == 1 ? 1 : 2];
        if (hash(q.x >> 1, q.y, 17) > WET_BREAK) return FOAM[0];
    }
    ivec2 at = q % textureSize(u_waterField, 0);
    vec2 fq = vec2(at);
    vec4 field = texelFetch(u_waterField, at, 0);
    float ripple = periodicNoise(fq, RIPPLE_CELLS, vec2(40.0, -ph * 0.9), 33);
    float tone = field.r * 255.0 / TONE_SCALE - TONE_OFFSET
        + (ripple > 0.7 ? RIPPLE_CREST : ripple < 0.25 ? -RIPPLE_TROUGH : 0.0)
        + (periodicNoise(fq, GLINT_CELLS, vec2(0.0, ph * 0.7), 39) > 0.84 ? GLINT_RISE : 0.0)
        - (landAt(w - vec2(0.0, BANK_REACH)) ? BANK_DROP : 0.0);
    float edge = field.b * 255.0 / (EDGE_LEVELS - 1.0) - 0.5;
    bool deep = texture(u_tide, w / u_tileArt / vec2(u_mapSize)).r > 0.5 + edge * EDGE_WOBBLE;
    if (kind == RAPIDS && deep) {
        float foam = periodicNoise(fq, STREAK_CELLS, vec2(9.0, -ph * 1.7), 35)
            + (periodicNoise(fq, CHURN_CELLS, vec2(0.0, -ph * 2.0), 39) - 0.5) * CHURN_WEIGHT;
        if (foam > 0.8) return FOAM[2];
        if (foam > 0.68) return FOAM[1];
        if (foam > 0.6) return SHALLOWS[4];
        return DEEP[rampStep(tone + RAPIDS_RISE, q)];
    }
    if (deep) return DEEP[rampStep(tone, q)];
    return SHALLOWS[rampStep(tone - (int(field.g * 255.0 + 0.5) >= OPEN_CELL ? OPEN_CELL_DROP : 0.0), q)];
}

vec3 darken(vec3 c, float k) {
    return vec3(c.r * k, c.g * k, min(1.0, c.b * (k + 0.1)));
}

void main() {
    vec2 p = floor(v_art);
    uint own = kindAt(p);
    if (own == 0u) discard;

    vec2 wide = vec2(valueNoise(p * WARP_WIDE_FREQ, 11), valueNoise(p * WARP_WIDE_FREQ, 14));
    vec2 fine = vec2(valueNoise(p * WARP_FINE_FREQ, 12), valueNoise(p * WARP_FINE_FREQ, 15));
    vec2 w = p + (wide - 0.5) * WARP_WIDE_AMP + (fine - 0.5) * WARP_FINE_AMP;

    uint k = kindAt(w);
    if (k == 0u) k = own;
    vec2 layer = u_layer[k];
    vec3 c;
    if (layer.y > 0.5) c = water(w, int(layer.y + 0.5), ivec2(p));
    else {
        vec4 patchRect = u_patch[k];
        c = texelFetch(u_paintAtlas, ivec2(patchRect.xy) + ivec2(mod(p, patchRect.z)), 0).rgb;
        uint up = kindAt(w - vec2(0.0, LIP_REACH));
        uint down = kindAt(w + vec2(0.0, LIP_REACH));
        vec2 upLayer = up == 0u ? layer : u_layer[up];
        vec2 downLayer = down == 0u ? layer : u_layer[down];
        if (upLayer.x > layer.x + LIP_STEP && upLayer.y < 0.5) c = darken(c, UNDER_HIGHER);
        else if (downLayer.x < layer.x - LIP_STEP && downLayer.x < LOW_GROUND) c = darken(c, ABOVE_LOW);
    }

    vec2 corner = v_art / u_tileArt;
    vec3 point = texture(u_light, (corner + 0.5) / vec2(u_mapSize + 1)).rgb;
    vec3 light = u_fieldLit > 0.5
        ? texelFetch(u_lightTexture, ivec2(gl_FragCoord.xy), 0).rgb * 2.0
        : min(u_ambient + point * u_lightFlicker, vec3(1.6));
    vec3 lit = c * light;
    fragColor = vec4(mix(vec3(dot(lit, vec3(0.2126, 0.7152, 0.0722))), lit, u_saturation) * u_brightness, 1.0);
}
