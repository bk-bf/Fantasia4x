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
const int SHALLOW = 1;
const int RAPIDS = 3;

const float BAYER[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
const vec3 DEEP[6] = vec3[6](
    vec3(15.0, 29.0, 51.0) / 255.0, vec3(21.0, 42.0, 71.0) / 255.0, vec3(27.0, 58.0, 92.0) / 255.0,
    vec3(36.0, 80.0, 114.0) / 255.0, vec3(47.0, 104.0, 136.0) / 255.0, vec3(74.0, 138.0, 162.0) / 255.0);
const vec3 SHALLOWS[6] = vec3[6](
    vec3(28.0, 74.0, 82.0) / 255.0, vec3(38.0, 96.0, 102.0) / 255.0, vec3(51.0, 120.0, 122.0) / 255.0,
    vec3(74.0, 148.0, 144.0) / 255.0, vec3(111.0, 176.0, 164.0) / 255.0, vec3(165.0, 210.0, 192.0) / 255.0);
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

float fbm2(vec2 p, int seed) {
    return (0.5 * valueNoise(p, seed) + 0.25 * valueNoise(p * 2.0, seed + 17)) / 0.75;
}

bool openCell(vec2 p, float scale, int seed) {
    vec2 g = p / scale;
    ivec2 c = ivec2(floor(g));
    float d1 = 9.0;
    float d2 = 9.0;
    float id = 0.0;
    for (int j = -1; j <= 1; j++)
        for (int i = -1; i <= 1; i++) {
            ivec2 n = c + ivec2(i, j);
            float d = distance(g, vec2(n) + vec2(hash(n.x, n.y, seed), hash(n.x, n.y, seed + 7)));
            if (d < d1) {
                d2 = d1;
                d1 = d;
                id = hash(n.x, n.y, seed + 13);
            } else if (d < d2) d2 = d;
        }
    return id > 0.8 && (d2 - d1) * scale > 1.4;
}

vec3 ramp(int kind, float t, ivec2 q) {
    float dither = (BAYER[((q.y & 3) << 2) | (q.x & 3)] + 0.5) / 16.0;
    int i = clamp(int(floor(clamp(t, 0.0, 1.0) * 5.0 + 0.5 + (dither - 0.5) * 0.45)), 0, 5);
    return kind == SHALLOW ? SHALLOWS[i] : DEEP[i];
}

vec3 water(vec2 p, vec2 w, int kind) {
    ivec2 q = ivec2(p);
    float ph = u_waterPhase;
    if (landWithin(w, FOAM_REACH)) return FOAM[((int(floor(ph)) + (q.x >> 2)) & 1) == 1 ? 1 : 2];
    if (landWithin(w, WET_REACH) && hash(q.x >> 1, q.y, 17) > WET_BREAK) return FOAM[0];
    float t = 0.12 + fbm2(p * 0.022, 31) * 0.5;
    if (kind == SHALLOW && openCell(p, 7.0, 37)) t -= 0.2;
    float rip = valueNoise(vec2(p.x * 0.085 + 40.0, p.y * 0.27 - ph * 0.9), 33);
    if (rip > 0.7) t += 0.2;
    else if (rip < 0.25) t -= 0.1;
    if (valueNoise(vec2(p.x * 0.11, p.y * 1.1 + ph * 0.7), 39) > 0.84) t += 0.16;
    if (levelAt(w - vec2(0.0, BANK_REACH)) > SHORE_LEVEL) t -= 0.28;
    if (kind == RAPIDS) {
        float f = valueNoise(vec2(p.x * 0.21 + 9.0, p.y * 0.055 - ph * 1.7), 35)
            + (valueNoise(vec2(p.x * 0.5, p.y * 0.45 - ph * 2.0), 39) - 0.5) * 0.4;
        if (f > 0.68) return FOAM[f > 0.8 ? 2 : 1];
        if (f > 0.6) return SHALLOWS[4];
        t += 0.15;
    }
    return ramp(kind, t, q);
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
    if (layer.y > 0.5) c = water(p, w, int(layer.y + 0.5));
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
