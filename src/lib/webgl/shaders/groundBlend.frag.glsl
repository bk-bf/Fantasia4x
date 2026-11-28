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
uniform vec4 u_layer[64];
uniform highp sampler2D u_groundField;
uniform highp sampler2D u_groundFar;
uniform float u_artPerPx;
uniform vec2 u_pieces;
uniform vec3 u_ambient;
uniform float u_lightFlicker;
uniform highp sampler2D u_lightTexture;
uniform float u_fieldLit;
uniform float u_saturation;
uniform float u_brightness;
uniform float u_waterTime;
uniform sampler2D u_tide;
uniform sampler2D u_waterField;
uniform int u_waterStyle;
uniform int u_waterBlock;
uniform vec4 u_sea[18];
uniform sampler2D u_ice;
uniform sampler2D u_flow;
uniform highp sampler2D u_stream;
uniform vec4 u_fluid[28];

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
const int SHADE_MASK = 7;
const int SHADE_BITS = 3;
const int SOIL_ROW = 0;
const int GRASS_ROW = 1;
const int PEBBLE_ROW = 2;
const int META_ROW = 5;
const int SOIL_SHIFT = 13;
const int GRASS_SHIFT = 14;
const int AMOUNT = 15;
const int OFFSET_STEP = 8;
const int RIM = 3;
const int LIP = 3;
const int RAMP_PIECES = 3;
const int NO_PIECE = 255;
const float GRASS_RIM = 0.7;
const float SOIL_LIP = 0.68;
const float FAR_ART_PER_PX = 4.0;
const int FAR_SHIFT = 3;
const float RAG_MID_FREQ = 0.07;
const float RAG_MID_AMP = 34.0;
const float RAG_FINE_FREQ = 0.28;
const float RAG_FINE_AMP = 7.0;
const float RAG_GRAIN = 10.0;

const int WAVE_STYLE = 1;
const int SEA_PHASE = 0;
const int SEA_AMP = 1;
const int SEA_ROUGH = 2;
const int SEA_CHOPPY = 4;
const int SEA_STATE = 6;
const int SEA_LOOK = 7;
const int SEA_DRIFT = 8;
const int SEA_BREAK = 9;
const int SEA_SHORE = 10;
const int SEA_WIND = 11;
const int SEA_SURGE = 12;
const int SEA_GRAIN = 13;
const int SEA_BODY = 14;
const int SEA_FADE = 15;
const int SEA_AIR = 16;
const int SEA_RIVER = 17;
const int NOISE_WRAP = 1023;
const float TAU = 6.2831853;
const float LAMBDA[4] = float[4](30.0, 19.0, 12.0, 8.0);
const float ANGLE[4] = float[4](-0.45, -0.12, 0.22, 0.55);
const float ROUGH_TURN = 1.25;
const float CHOPPY_TURN = 2.0;
const float FIELD_MEAN = 1.86;
const int FLUID_VEC4 = 7;
const int WATER_FLUID = 0;
const float BREEZE_SLACK = 0.05;
const float BREEZE_PER_SPEED = 0.8;
const float BANK_KEEP = 0.15;
const float BANK_SWASH = 0.62;
const float RIVER_SPREAD = 0.3;
const float DIST_STEPS = 32.0;
const float GRAD_STEP = 4.0;
const vec3 SEA_LIGHT = vec3(-0.4511, -0.5514, 0.7018);
const vec3 SEA_HALF = vec3(-0.2445, -0.2989, 0.9224);
const float SHADE_STEPS = 4.5;
const float SPEC_STEPS = 2.5;
const int BANDS = 6;
const float BAND_WOBBLE = 0.12;
const float BAND_DITHER = 0.5;
const float FOAM_HIGH = 0.62;
const float FOAM_LOW = 0.36;
const float FOAM_DITHER = 0.24;
const float GLINT_STEP = 0.5;
const float POCK_CELL = 7.0;
const float POCK_RATE = 2.2;
const float PULL_REACH = 2.2;
const vec4 PULL_GRAIN = vec4(9.0, 9.0, 4.0, 4.0);
const float ICE_UNIT = 2.0;
const float ICE_SHOWS = 0.08;
const float ICE_REACH = 1.3;
const float ICE_DEPTH = 0.85;
const float ICE_CALM = 0.6;
const vec3 ICE[4] = vec3[4](
    vec3(111.0, 147.0, 172.0) / 255.0, vec3(148.0, 180.0, 198.0) / 255.0, vec3(188.0, 211.0, 220.0) / 255.0, vec3(221.0, 233.0, 236.0) / 255.0);
const vec3 WET_SAND[2] = vec3[2](vec3(112.0, 98.0, 74.0) / 255.0, vec3(138.0, 122.0, 92.0) / 255.0);

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

vec2 tideAt(vec2 art) {
    return texture(u_tide, art / u_tileArt / vec2(u_mapSize)).rg;
}

bool landWithin(float bank, float reach) {
    return bank > 0.5 - reach / u_tileArt;
}

int rampStep(float tone, ivec2 q) {
    return clamp(int(floor(clamp(tone, 0.0, 5.0) + 0.5 + (dither(q) - 0.5) * DITHER)), 0, 5);
}

vec3 water(vec2 w, int kind, ivec2 q) {
    float ph = waterPhase(q);
    vec2 tide = tideAt(w);
    if (landWithin(tide.g, FOAM_REACH))
        return FOAM[((int(floor(ph)) + (q.x >> 2)) & 1) == 1 ? 1 : 2];
    if (landWithin(tide.g, WET_REACH) && hash(q.x >> 1, q.y, 17) > WET_BREAK) return FOAM[0];
    ivec2 at = q % textureSize(u_waterField, 0);
    vec2 fq = vec2(at);
    vec4 field = texelFetch(u_waterField, at, 0);
    float ripple = periodicNoise(fq, RIPPLE_CELLS, vec2(40.0, -ph * 0.9), 33);
    float tone = field.r * 255.0 / TONE_SCALE - TONE_OFFSET
        + (ripple > 0.7 ? RIPPLE_CREST : ripple < 0.25 ? -RIPPLE_TROUGH : 0.0)
        + (periodicNoise(fq, GLINT_CELLS, vec2(0.0, ph * 0.7), 39) > 0.84 ? GLINT_RISE : 0.0)
        - (tideAt(w - vec2(0.0, BANK_REACH)).g > 0.5 ? BANK_DROP : 0.0);
    float edge = field.b * 255.0 / (EDGE_LEVELS - 1.0) - 0.5;
    bool deep = tide.r > 0.5 + edge * EDGE_WOBBLE;
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

float wn(vec2 p, int seed) {
    vec2 i = floor(p);
    vec2 f = p - i;
    f = f * f * (3.0 - 2.0 * f);
    ivec2 a = ivec2(i) & NOISE_WRAP;
    ivec2 b = (a + 1) & NOISE_WRAP;
    float top = mix(hash(a.x, a.y, seed), hash(b.x, a.y, seed), f.x);
    float bottom = mix(hash(a.x, b.y, seed), hash(b.x, b.y, seed), f.x);
    return mix(top, bottom, f.y);
}

vec2 seaDir(int base, int i) {
    vec4 d = u_sea[base + (i >> 1)];
    return (i & 1) == 0 ? d.xy : d.zw;
}

vec3 crest(float ph, float chop, vec2 dk) {
    float s = max(sin(ph) * 0.5 + 0.5, 1e-4);
    float v = pow(s, chop);
    return vec3(v * 2.0 - 1.0, dk * (chop * v / s * cos(ph)));
}

struct Sea {
    vec4 amp;
    vec4 state;
    vec4 look;
};

Sea seaNow() {
    return Sea(u_sea[SEA_AMP], u_sea[SEA_STATE], u_sea[SEA_LOOK]);
}

Sea seaAt(float wind) {
    float u = smoothstep(0.1, 1.0, wind);
    vec4 amp = vec4(mix(0.55, 0.9, u), mix(0.28, 1.15, u), mix(0.12, 1.0, u), mix(0.05, 0.75, u)) * mix(1.0, 1.45, u);
    vec4 a = vec4(mix(1.3, 2.6, u), mix(1.0, 0.25, u), mix(1.0, 1.6, u), mix(0.12, 0.9, u));
    return Sea(amp * u_sea[SEA_FADE],
        vec4(a.x, clamp((a.y - 0.25) / 0.75, 0.0, 1.0), a.z, a.w),
        vec4(mix(0.33, 0.6, u), mix(0.45, 0.35, u), 0.6 * (amp.z + amp.w) * u_sea[SEA_AIR].z, amp.x + amp.y + amp.z + amp.w));
}

vec2 turned(int i, float turn) {
    vec2 g = u_sea[SEA_WIND].xy;
    float a = ANGLE[i] * turn;
    return vec2(g.x * cos(a) - g.y * sin(a), g.x * sin(a) + g.y * cos(a));
}

vec3 waveField(vec2 p, Sea sea, float spread) {
    float chop = sea.state.x;
    float choppy = sea.state.y;
    vec2 warp = vec2(wn(p * 0.013, 41), wn(p * 0.013 + 9.0, 41)) - 0.5;
    vec2 qR = p + warp * 11.5;
    vec2 qC = p + warp * 46.0;
    vec3 h = vec3(0.0);
    for (int i = 0; i < 4; i++) {
        float amp = sea.amp[i];
        if (amp <= 0.0) continue;
        float k = TAU / LAMBDA[i];
        float om = u_sea[SEA_PHASE][i];
        float lift = amp * (0.55 + 0.9 * wn(p * 0.012 + float(i) * 3.1 - u_sea[SEA_DRIFT].xy, 43));
        if (choppy < 1.0) {
            vec2 d = spread < 1.0 ? turned(i, ROUGH_TURN * spread) : seaDir(SEA_ROUGH, i);
            float ph = dot(qR, d) * k - om + wn(qR * 0.008 + float(i) * 7.0, 44) * 5.75;
            h += (1.0 - choppy) * lift * crest(ph, chop, d * k);
        }
        if (choppy > 0.0) {
            vec2 d = spread < 1.0 ? turned(i, CHOPPY_TURN * spread) : seaDir(SEA_CHOPPY, i);
            float ph = dot(qC, d) * k - om + wn(qC * 0.008 + float(i) * 7.0, 44) * 11.0;
            h += choppy * lift * crest(ph, chop, d * k);
        }
    }
    return h;
}

float shoreAt(vec2 art) {
    return (texture(u_tide, art / u_tileArt / vec2(u_mapSize)).b * 255.0 / DIST_STEPS - 0.5) * u_tileArt;
}

vec2 warpAt(vec2 p) {
    vec2 wide = vec2(valueNoise(p * WARP_WIDE_FREQ, 11), valueNoise(p * WARP_WIDE_FREQ, 14));
    vec2 fine = vec2(valueNoise(p * WARP_FINE_FREQ, 12), valueNoise(p * WARP_FINE_FREQ, 15));
    return p + (wide - 0.5) * WARP_WIDE_AMP + (fine - 0.5) * WARP_FINE_AMP;
}

float grainAt(ivec2 art, vec4 shift, float ruffle) {
    ivec2 size = textureSize(u_waterField, 0);
    ivec2 at = ((art % size) + size) % size;
    vec2 fq = vec2(at);
    vec4 field = texelFetch(u_waterField, at, 0);
    float ripple = periodicNoise(fq, RIPPLE_CELLS, vec2(40.0, 0.0) + shift.xy * RIPPLE_CELLS / FIELD_PERIOD, 33);
    float rippled = ripple > 0.7 ? RIPPLE_CREST : ripple < 0.25 ? -RIPPLE_TROUGH : 0.0;
    return field.r * 255.0 / TONE_SCALE - TONE_OFFSET
        + rippled * ruffle
        + (periodicNoise(fq, GLINT_CELLS, shift.zw * GLINT_CELLS / FIELD_PERIOD, 39) > 0.84 ? GLINT_RISE : 0.0);
}

float gustAt(vec2 q) {
    vec2 g = q - u_sea[SEA_WIND].xy * u_sea[SEA_BODY].z;
    float n = wn(g * 0.018, 61) * 0.65 + wn(g * 0.05 + 17.0, 62) * 0.35;
    return smoothstep(0.42, 0.7, n);
}

vec4 flowAt(vec2 at) {
    vec4 f = textureLod(u_flow, at, 0.0);
    vec2 d = f.rg * 2.0 - 1.0;
    float len = length(d);
    return vec4(len > 0.05 ? d / len : vec2(0.0), f.b, f.a);
}

vec4 streamAt(vec2 art) {
    ivec2 size = textureSize(u_stream, 0);
    vec2 g = art / u_tileArt * vec2(size) / vec2(u_mapSize) - 0.5;
    vec2 i = floor(g);
    vec2 f = g - i;
    ivec2 a = clamp(ivec2(i), ivec2(0), size - 1);
    ivec2 b = clamp(ivec2(i) + 1, ivec2(0), size - 1);
    return mix(mix(texelFetch(u_stream, a, 0), texelFetch(u_stream, ivec2(b.x, a.y), 0), f.x),
        mix(texelFetch(u_stream, ivec2(a.x, b.y), 0), texelFetch(u_stream, b, 0), f.x), f.y);
}

struct Frame {
    vec2 p;
    vec2 along;
    float stretch;
};

Frame frameAt(vec2 art) {
    vec4 st = streamAt(art);
    float len = length(st.zw);
    vec2 g = u_sea[SEA_WIND].xy;
    return Frame(g * (st.x - u_sea[SEA_RIVER].y) + vec2(-g.y, g.x) * st.y, len > 1e-4 ? st.zw / len : g, max(len, 1e-4));
}

vec2 intoFrame(Frame fr, vec2 v) {
    vec2 g = u_sea[SEA_WIND].xy;
    return g * dot(v, fr.along) * fr.stretch + vec2(-g.y, g.x) * dot(v, vec2(-fr.along.y, fr.along.x));
}

vec2 slopeOutOf(Frame fr, vec2 slope) {
    vec2 g = u_sea[SEA_WIND].xy;
    return fr.along * dot(slope, g) * fr.stretch + vec2(-fr.along.y, fr.along.x) * dot(slope, vec2(-g.y, g.x));
}

float streakAt(vec2 p, float brk) {
    vec2 dir = u_sea[SEA_WIND].xy;
    vec2 qa = vec2(dot(p, dir), dot(p, vec2(-dir.y, dir.x)));
    return smoothstep(0.55, 0.85, wn(vec2(qa.x * 0.025 - brk, qa.y * 0.35), 51));
}

float flowGrain(ivec2 art, vec2 q, vec2 drift, float ruffle, float cycle) {
    float turn = u_sea[SEA_AIR].w * (1.0 / cycle) + wn(q * 0.05, 71);
    float f0 = fract(turn);
    float f1 = fract(turn + 0.5);
    float w0 = 1.0 - abs(2.0 * f0 - 1.0);
    vec2 reach = drift * cycle;
    ivec2 o0 = ivec2(floor(reach * (f0 - 0.5) + 0.5));
    ivec2 o1 = ivec2(floor(reach * (f1 - 0.5) + 0.5));
    float keep = mix(1.0, inversesqrt(w0 * w0 + (1.0 - w0) * (1.0 - w0)), smoothstep(4.0, 16.0, length(reach)));
    float a = grainAt(art - o0, vec4(0.0), ruffle) - FIELD_MEAN;
    float b = grainAt(art - o1, vec4(0.0), ruffle) - FIELD_MEAN;
    return FIELD_MEAN + (a * w0 + b * (1.0 - w0)) * keep;
}

int rainPock(ivec2 a) {
    float rain = u_sea[SEA_SURGE].y;
    if (rain <= 0.0) return 0;
    ivec2 c = ivec2(floor(vec2(a) / POCK_CELL));
    float tt = u_sea[SEA_SURGE].z * POCK_RATE + hash(c.x, c.y, 81);
    int slot = int(floor(tt));
    float age = fract(tt);
    if (hash(c.x, c.y, 82 + slot % 97) > rain * 0.55) return 0;
    vec2 centre = vec2(c) * POCK_CELL + 1.0
        + floor(vec2(hash(c.x, c.y, 83 + slot % 89), hash(c.x, c.y, 84 + slot % 83)) * (POCK_CELL - 2.0));
    float r = length(vec2(a) - centre);
    if (age < 0.15 && r < 1.0) return 2;
    if (age < 0.7 && abs(r - age * 3.0) < 0.5) return 1;
    return 0;
}

float iceAt(float level, vec2 q, float depth, float near) {
    if (level < ICE_SHOWS) return -1.0;
    float rough = smoothstep(10.0, 0.0, near) * 0.08 + (wn(q * 0.06, 91) - 0.5) * 0.22 + (wn(q * 0.25, 92) - 0.5) * 0.06;
    return level * ICE_REACH - depth * ICE_DEPTH + rough * min(1.0, level / 0.3) - ICE_SHOWS;
}

vec3 iceSheet(ivec2 cell, vec2 q, float margin, float depth, float near) {
    float d = dither(cell);
    float wobble = depth + (wn(q * 0.05, 54) - 0.5) * BAND_WOBBLE;
    int band = clamp(int(floor(clamp(wobble, 0.0, 1.0) * float(BANDS - 1) + 0.5 + (d - 0.5) * BAND_DITHER)), 0, BANDS - 1);
    float deep = float(band) / float(BANDS - 1);
    int tier = rampStep(grainAt(cell, vec4(0.0), 0.5), cell);
    vec3 under = mix(SHALLOWS[tier], DEEP[min(tier + 1, 5)], deep);
    float thick = smoothstep(0.0, 0.4, margin);
    float frost = 0.14 + 0.22 * thick + 0.3 * smoothstep(6.0, 0.0, near) + (wn(q * 0.12, 98) - 0.5) * 0.16;
    float level = floor(clamp(frost, 0.0, 0.8) * 5.0 + d) / 5.0;
    vec3 c = mix(under, ICE[2 + int(step(0.6, frost))], level);
    if (margin < 0.02) return mix(under, ICE[3], 0.35);
    float crack = abs(wn(q * 0.09, 93) - 0.5) + (wn(q * 0.4, 94) - 0.5) * 0.04;
    if (crack < 0.01 && thick > 0.3) return mix(c, ICE[3], 0.7);
    if (thick > 0.25 && hash(cell.x >> 1, cell.y >> 1, 97) > 0.996) return ICE[3];
    return c;
}

bool frozenAt(vec2 w, vec2 p, out vec3 c) {
    int shift = u_waterBlock;
    ivec2 cell = ivec2(p) >> shift;
    vec2 s = shift == 0 ? w + 0.5 : warpAt(vec2(cell << shift) + float(1 << shift) * 0.5);
    vec2 at = s / u_tileArt / vec2(u_mapSize);
    float level = texture(u_ice, at).r;
    if (level < ICE_SHOWS) return false;
    vec4 tide = texture(u_tide, at);
    float dist = (tide.b * 255.0 / DIST_STEPS - 0.5) * u_tileArt / ICE_UNIT;
    vec2 q = s / ICE_UNIT;
    float margin = iceAt(level, q, tide.a, dist);
    if (margin <= 0.0) return false;
    c = iceSheet(cell << shift, q, margin, tide.a, dist);
    return true;
}

ivec2 grainCell(ivec2 cell, int shift, float grain) {
    return ivec2(floor(vec2((cell << shift) + ((1 << shift) >> 1)) / grain));
}

vec3 waveWater(vec2 w, vec2 p, int kind) {
    int base = WATER_FLUID * FLUID_VEC4;
    vec4 fMove = u_fluid[base + 2];
    vec4 fEdge = u_fluid[base + 3];
    vec4 fBody = u_fluid[base + 4];
    vec4 fTint = u_fluid[base + 5];
    vec4 fFlow = u_fluid[base + 6];
    int shift = u_waterBlock;
    ivec2 cell = ivec2(p) >> shift;
    vec2 s = shift == 0 ? w + 0.5 : warpAt(vec2(cell << shift) + float(1 << shift) * 0.5);
    float unit = u_sea[SEA_WIND].w;
    vec2 at = s / u_tileArt / vec2(u_mapSize);
    vec4 tide = texture(u_tide, at);
    float distArt = (tide.b * 255.0 / DIST_STEPS - 0.5) * u_tileArt;
    float dist = distArt / unit;
    vec2 q = s / unit;
    vec2 slope = vec2(shoreAt(s + vec2(GRAD_STEP, 0.0)) - distArt, shoreAt(s + vec2(0.0, GRAD_STEP)) - distArt) / GRAD_STEP;
    float d = dither(cell);
    vec4 flow = flowAt(at);
    float river = flow.w;
    vec4 current = u_sea[SEA_RIVER];
    float push = river * current.x;
    float edge = fMove.w * (1.0 - mix(u_sea[SEA_SURGE].x, BANK_SWASH, river)) * (0.6 + 0.8 * wn(q * 0.2, 55));
    if (dist < edge) return WET_SAND[dist > edge - fEdge.x ? 0 : 1];
    float near = dist - edge;
    float bank = mix(1.0, BANK_KEEP, river);
    float wind = u_sea[SEA_AIR].x;
    float local = mix(wind, clamp(BREEZE_SLACK + BREEZE_PER_SPEED * flow.z * current.z, 0.0, 1.0), current.x);
    bool pushed = push > 0.002;
    Sea lakeSea = seaNow();
    Sea riverSea = lakeSea;
    Sea sea = lakeSea;
    if (pushed) {
        riverSea = seaAt(local);
        sea = seaAt(mix(wind, local, river));
    }
    vec4 state = sea.state;
    vec4 look = sea.look;
    float dw = near + wn(q * 0.035, 45) * 7.0 + wn(q * 0.11, 46) * 2.0;
    float arg = dw * 0.36 + u_sea[SEA_SHORE].x;
    float sb = max(sin(arg) * 0.5 + 0.5, 1e-4);
    float sh = pow(sb, 2.5);
    float shoal = smoothstep(45.0, 8.0, near) * (1.0 + 1.3 * smoothstep(14.0, 3.0, near));
    float bl = smoothstep(45.0, 12.0, near) * bank;
    float calm = 1.0 - min(1.0, texture(u_ice, at).r / ICE_CALM) * 0.75;
    vec2 seaward = length(slope) > 1e-3 ? normalize(slope) : vec2(0.0);
    float pull = sin(arg - 1.1) * smoothstep(60.0, 6.0, near) * bank;
    float gust = gustAt(q);
    float rough = wn(q * 0.3 - u_sea[SEA_SHORE].zw, 47);
    float capAt = wn(q * 0.45 - u_sea[SEA_DRIFT].zw, 50);
    vec3 hw = push < 0.998 ? waveField(q + u_sea[SEA_BODY].xy - seaward * pull * PULL_REACH, lakeSea, 1.0) : vec3(0.0);
    Frame fr = Frame(q, u_sea[SEA_WIND].xy, 1.0);
    if (pushed) {
        fr = frameAt(s);
        vec3 hr = waveField(fr.p - intoFrame(fr, seaward) * pull * PULL_REACH, riverSea, RIVER_SPREAD);
        hr.yz = slopeOutOf(fr, hr.yz);
        hw = (hw * (1.0 - push) + hr * push) * inversesqrt((1.0 - push) * (1.0 - push) + push * push);
        gust = mix(gust, gustAt(fr.p), push);
        rough = mix(rough, wn(fr.p * 0.3 - u_sea[SEA_SHORE].zw, 47), push);
        capAt = mix(capAt, wn(fr.p * 0.45 - u_sea[SEA_DRIFT].zw, 50), push);
    }
    hw *= mix(1.0, 0.3 + 0.95 * gust, 0.4 + 0.6 * u_sea[SEA_SURGE].w) * calm;
    hw.x += (rough - 0.5) * look.z;
    float lift = shoal * state.z * 2.2 * calm * bank;
    vec3 surge = vec3(sh * lift, slope * (1.25 * sh / sb * cos(arg) * 0.36 * lift));
    vec3 h = mix(hw, surge + hw * 0.3, bl);
    vec3 n = normalize(vec3(-h.yz * 0.55, 1.0));
    float shade = clamp(dot(n, SEA_LIGHT) / SEA_LIGHT.z, 0.0, 2.0);
    float spec = pow(max(dot(n, SEA_HALF), 0.0), 90.0) * look.y;
    vec4 brkAt = u_sea[SEA_BREAK];
    float brk = wn(q * 0.5 + brkAt.xy, 48) * 0.6 + wn(q * 1.4 - brkAt.zz, 49) * 0.4;
    float strength = u_sea[SEA_BODY].w;
    float cap = strength * smoothstep(0.62, 1.0, h.x / max(look.w * 0.6, 0.2))
        * smoothstep(0.45, 0.72, capAt) * state.w * (1.0 - bl * 0.7) * smoothstep(0.35, 0.8, gust);
    float streak = 0.0;
    if (state.w > 0.4 || kind == RAPIDS) {
        float streakN = streakAt(q, brkAt.w);
        if (pushed) streakN = mix(streakN, streakAt(fr.p, brkAt.w), push);
        streak = streakN * smoothstep(0.3, 0.7, wn(q * 0.06, 52)) * look.x
            * max((state.w - 0.4) * strength, kind == RAPIDS ? 0.6 : 0.0) * 1.6;
    }
    float run = mix(u_sea[SEA_SHORE].y, 1.2 + 1.04 * u_sea[SEA_STATE].z, river);
    float surf = smoothstep(0.55, 1.0, sh) * smoothstep(12.0, 1.5, near) * smoothstep(0.3, 0.6, brk) * state.z * 0.8 * bank;
    surf += smoothstep(run, run * 0.4, near) * smoothstep(0.28, 0.6, brk);
    surf += smoothstep(0.7, 0.0, abs(near - run * 1.5)) * smoothstep(0.45, 0.75, brk) * 0.5 * state.z * bank;
    float foam = clamp(cap + streak * 0.5 + surf, 0.0, 1.0) * fEdge.w + (d - 0.5) * FOAM_DITHER;
    if (foam > FOAM_HIGH) return FOAM[shade > 1.0 ? 2 : 1];
    if (foam > FOAM_LOW) return FOAM[0];
    int pock = rainPock(cell << shift);
    if (pock == 2) return FOAM[1];
    float glint = pow(max(dot(n, SEA_HALF), 0.0), 70.0) * smoothstep(0.3, 0.75, wn(q * 0.2 + u_sea[SEA_WIND].z, 53));
    float depth = tide.a * fBody.y + (wn(q * 0.05, 54) - 0.5) * BAND_WOBBLE;
    int band = clamp(int(floor(clamp(depth, 0.0, 1.0) * float(BANDS - 1) + 0.5 + (d - 0.5) * BAND_DITHER)), 0, BANDS - 1);
    float deep = float(band) / float(BANDS - 1);
    vec4 grain = u_sea[SEA_GRAIN] + vec4(seaward, seaward) * pull * PULL_GRAIN;
    float ruffle = smoothstep(0.15, 0.6, gust) * fMove.x;
    ivec2 art = grainCell(cell, shift, u_fluid[base + 1].w);
    float still = river < 0.998 ? grainAt(art, grain, ruffle) : 0.0;
    if (river > 0.002) {
        vec2 drift = current.x * flow.xy * flow.z * fFlow.y * current.z + (1.0 - current.x) * u_sea[SEA_WIND].xy * u_sea[SEA_AIR].y;
        still = mix(still, flowGrain(art, q, drift, ruffle, fFlow.x), river);
    }
    float tone = still
        + fBody.x
        + (pock == 1 ? 1.5 : 0.0)
        + strength * ((shade - 1.0) * look.x * SHADE_STEPS + spec * SPEC_STEPS + (glint > GLINT_STEP ? 2.0 : 0.0));
    int tier = rampStep(tone, cell);
    return mix(SHALLOWS[tier], DEEP[min(tier + 1, 5)], deep) * fTint.rgb;
}

vec3 darken(vec3 c, float k) {
    return vec3(c.r * k, c.g * k, min(1.0, c.b * (k + 0.1)));
}

const float STILL_UNIT = 2.0;

bool afloatAt(vec3 patchColour, bool piece) {
    return piece || (patchColour.g > 0.37 && patchColour.g > patchColour.r * 1.15);
}

vec3 stillFluid(int f, vec3 ground, bool afloat, vec2 w, vec2 p) {
    int base = f * FLUID_VEC4;
    vec4 shifts = u_fluid[base];
    vec4 slow = u_fluid[base + 1];
    vec4 move = u_fluid[base + 2];
    vec4 edge = u_fluid[base + 3];
    vec4 body = u_fluid[base + 4];
    vec4 tint = u_fluid[base + 5];
    int shift = u_waterBlock;
    ivec2 cell = ivec2(p) >> shift;
    vec2 s = w + 0.5;
    vec2 at = s / u_tileArt / vec2(u_mapSize);
    float reach = (texture(u_ice, at).g * 255.0 / DIST_STEPS - 0.5) * u_tileArt / STILL_UNIT;
    vec2 q = s / STILL_UNIT;
    float lap = sin(slow.z + wn(q * 0.05, 64) * TAU) * move.z;
    float into = reach - move.w * (0.6 + 0.8 * wn(q * 0.2, 55)) - lap;
    if (into < 0.0) return into > -edge.x && !afloat ? darken(ground, edge.y) : ground;
    float paw = smoothstep(0.58, 0.82, wn((q - slow.xy) * 0.04, 66));
    float tone = grainAt(grainCell(cell, shift, slow.w), shifts, move.x * (0.5 + paw)) + body.x + paw * move.y;
    int tier = rampStep(tone, cell);
    vec3 film = mix(SHALLOWS[tier], DEEP[min(tier + 1, 5)], body.y) * tint.rgb;
    if (into < edge.z && !afloat && hash(cell.x >> 1, cell.y, 17) > 0.45) film = mix(film, FOAM[0], edge.w);
    float cover = tint.w * (0.55 + 0.45 * smoothstep(0.0, body.z, into));
    return mix(ground, film, afloat ? cover * body.w : cover);
}

ivec4 fieldAt(ivec2 q) {
    if (u_artPerPx >= FAR_ART_PER_PX) {
        ivec2 size = textureSize(u_groundFar, 0);
        ivec2 at = q >> FAR_SHIFT;
        return ivec4(texelFetch(u_groundFar, (at % size + size) % size, 0) * 255.0 + 0.5);
    }
    ivec2 size = textureSize(u_groundField, 0);
    return ivec4(texelFetch(u_groundField, (q % size + size) % size, 0) * 255.0 + 0.5);
}

ivec4 metaAt(ivec2 block, int col) {
    return ivec4(texelFetch(u_paintAtlas, block + ivec2(col, META_ROW), 0) * 255.0 + 0.5);
}

vec3 rampAt(ivec2 block, int row, int step) {
    return texelFetch(u_paintAtlas, block + ivec2(step, row), 0).rgb;
}

int shadeAt(ivec2 q, ivec2 block, bool grass) {
    ivec2 shift = metaAt(block, grass ? GRASS_SHIFT : SOIL_SHIFT).rg * OFFSET_STEP;
    int packed = fieldAt(q + shift).r;
    return grass ? (packed >> SHADE_BITS) & SHADE_MASK : packed & SHADE_MASK;
}

vec3 fieldGround(ivec2 q, ivec2 block, int cover) {
    int amount = metaAt(block, AMOUNT).r;
    bool grass = cover < amount;
    vec3 c = rampAt(block, grass ? GRASS_ROW : SOIL_ROW, shadeAt(q, block, grass));
    if (grass) return cover > amount - RIM ? darken(c, GRASS_RIM) : c;
    if (u_artPerPx >= FAR_ART_PER_PX) return c;
    return fieldAt(q - ivec2(0, LIP)).g < amount ? darken(c, SOIL_LIP) : c;
}

vec3 fieldPiece(ivec4 here, ivec2 block, vec3 c) {
    if (here.b == 0) return c;
    int type = (here.b >> 4) - 1;
    int colour = here.b & 15;
    if (NO_PIECE - here.a >= metaAt(block, type).r) return c;
    if (type < RAMP_PIECES) return rampAt(block, PEBBLE_ROW + type, colour);
    return texelFetch(u_paintAtlas, ivec2(u_pieces) + ivec2(colour, type + 1), 0).rgb;
}

vec2 ragAt(vec2 p) {
    vec2 mid = vec2(valueNoise(p * RAG_MID_FREQ, 21), valueNoise(p * RAG_MID_FREQ, 22));
    vec2 fine = vec2(valueNoise(p * RAG_FINE_FREQ, 23), valueNoise(p * RAG_FINE_FREQ, 24));
    ivec2 cell = ivec2(p) >> 1;
    vec2 grain = vec2(hash(cell.x, cell.y, 25), hash(cell.x, cell.y, 26));
    return (mid - 0.5) * RAG_MID_AMP + (fine - 0.5) * RAG_FINE_AMP + (grain - 0.5) * RAG_GRAIN;
}

bool raggedKind(uint k) {
    vec4 layer = u_layer[k];
    return layer.y < 0.5 && layer.z >= 0.0 && metaAt(ivec2(layer.zw), AMOUNT).b > 0;
}

#define TREE_GROUND_CODE

void main() {
    vec2 p = floor(v_art);
    uint own = kindAt(p);
    if (own == 0u) discard;

    vec2 w = warpAt(p);
    vec2 tw = w;

    uint k = kindAt(w);
    if (k == 0u) k = own;
    vec2 wr = w + ragAt(p);
    uint kr = kindAt(wr);
    if (kr != 0u && kr != k && u_layer[k].y < 0.5 && u_layer[kr].y < 0.5 && (raggedKind(k) || raggedKind(kr))) {
        k = kr;
        w = wr;
    }
    vec4 layer = u_layer[k];
    vec3 c;
    if (u_treeOnly == 1) {
        if (layer.y > 0.5 || !treeGroundWinter(p, tw, k, c)) discard;
    } else if (layer.y > 0.5) {
        if (!frozenAt(w, p, c))
            c = u_waterStyle == WAVE_STYLE ? waveWater(w, p, int(layer.y + 0.5)) : water(w, int(layer.y + 0.5), ivec2(p));
    } else {
        vec4 patchRect = u_patch[k];
        ivec2 q = ivec2(p);
        ivec2 block = ivec2(layer.zw);
        bool field = layer.z >= 0.0;
        ivec4 here = field ? fieldAt(q) : ivec4(0);
        if (patchRect.z > 0.5)
            c = texelFetch(u_paintAtlas, ivec2(patchRect.xy) + ivec2(mod(p, patchRect.z)), 0).rgb;
        else c = fieldGround(q, block, here.g);
        vec3 bare = c;
        if (field) c = fieldPiece(here, block, c);
        if (patchRect.w > 0.5) c = stillFluid(int(patchRect.w + 0.5) - 1, c, afloatAt(bare, c != bare), w, p);
        uint up = kindAt(w - vec2(0.0, LIP_REACH));
        uint down = kindAt(w + vec2(0.0, LIP_REACH));
        vec2 upLayer = up == 0u ? layer.xy : u_layer[up].xy;
        vec2 downLayer = down == 0u ? layer.xy : u_layer[down].xy;
        if (upLayer.x > layer.x + LIP_STEP && upLayer.y < 0.5) c = darken(c, UNDER_HIGHER);
        else if (downLayer.x < layer.x - LIP_STEP && downLayer.x < LOW_GROUND) c = darken(c, ABOVE_LOW);
        c = treeGroundOver(c, p, tw, k);
    }

    vec2 corner = v_art / u_tileArt;
    vec3 point = texture(u_light, (corner + 0.5) / vec2(u_mapSize + 1)).rgb;
    vec3 light = u_fieldLit > 0.5
        ? texelFetch(u_lightTexture, ivec2(gl_FragCoord.xy), 0).rgb * 2.0
        : min(u_ambient + point * u_lightFlicker, vec3(1.6));
    vec3 lit = c * light;
    fragColor = vec4(mix(vec3(dot(lit, vec3(0.2126, 0.7152, 0.0722))), lit, u_saturation) * u_brightness, 1.0);
}
