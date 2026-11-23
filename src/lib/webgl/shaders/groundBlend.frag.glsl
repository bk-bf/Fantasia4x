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
uniform float u_waterPhase;

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
const float SHORE_LEVEL = 1.6;
const float UNPAINTED_LEVEL = 5.0;
const float BANK_REACH = 6.0;
const float FOAM_REACH = 2.0;
const float WET_REACH = 4.5;
const float WET_BREAK = 0.45;
const float LIP_SKIP = 0.4;
const float SAME_COLOUR = 1e-4;
const int RAPIDS = 3;

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

uint kindAt(vec2 art) {
    ivec2 tile = clamp(ivec2(floor(art / u_tileArt)), ivec2(0), u_mapSize - 1);
    return texelFetch(u_kinds, tile, 0).r;
}

float levelAt(vec2 art) {
    uint k = kindAt(art);
    return k == 0u ? UNPAINTED_LEVEL : u_layer[k].x;
}

bool landWithin(vec2 w, float r) {
    float top = max(max(levelAt(w + vec2(r, 0.0)), levelAt(w - vec2(r, 0.0))),
        max(levelAt(w + vec2(0.0, r)), levelAt(w - vec2(0.0, r))));
    return top > SHORE_LEVEL;
}

vec3 bankLip(vec3 c, int kind, ivec2 q) {
    int step = 1 + (dither(q) < LIP_SKIP ? 1 : 0);
    for (int i = 0; i < 6; i++) {
        vec3 d = DEEP[i] - c;
        vec3 s = SHALLOWS[i] - c;
        if (dot(d, d) < SAME_COLOUR) return DEEP[max(i - step, 0)];
        if (kind != RAPIDS && dot(s, s) < SAME_COLOUR) return SHALLOWS[max(i - step, 0)];
    }
    return c;
}

vec3 water(vec3 c, vec2 w, int kind, ivec2 q) {
    if (landWithin(w, WET_REACH)) {
        if (landWithin(w, FOAM_REACH))
            return FOAM[((int(floor(u_waterPhase)) + (q.x >> 2)) & 1) == 1 ? 1 : 2];
        if (hash(q.x >> 1, q.y, 17) > WET_BREAK) return FOAM[0];
    }
    if (levelAt(w - vec2(0.0, BANK_REACH)) > SHORE_LEVEL) return bankLip(c, kind, q);
    return c;
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
    vec4 patchRect = u_patch[k];
    vec3 c = texelFetch(u_paintAtlas, ivec2(patchRect.xy) + ivec2(mod(p, patchRect.z)), 0).rgb;
    if (layer.y > 0.5) c = water(c, w, int(layer.y + 0.5), ivec2(p));
    else {
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
