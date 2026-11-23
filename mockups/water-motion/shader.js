'use strict';
window.WATER_VERT = `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`;

window.WATER_FRAG = `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;

uniform usampler2D u_kinds;
uniform ivec2 u_mapSize;
uniform float u_tileArt;
uniform vec2 u_origin;
uniform float u_viewH;
uniform sampler2D u_tide;
uniform sampler2D u_waterField;
uniform int u_waterBlock;
uniform vec4 u_sea[13];
uniform int u_variant;
uniform vec4 u_grain;
uniform vec4 u_body;
uniform vec4 u_weather;
uniform vec4 u_ice;

out vec4 fragColor;

const float WARP_WIDE_FREQ = 0.042;
const float WARP_WIDE_AMP = 22.0;
const float WARP_FINE_FREQ = 0.155;
const float WARP_FINE_AMP = 7.0;
const float TONE_SCALE = 32.0;
const float TONE_OFFSET = 2.0;
const float DITHER = 0.45;
const int OPEN_CELL = 128;
const float OPEN_CELL_DROP = 1.0;
const float FIELD_PERIOD = 2048.0;
const vec2 RIPPLE_CELLS = vec2(174.0, 553.0);
const vec2 GLINT_CELLS = vec2(225.0, 2253.0);
const float RIPPLE_CREST = 1.0;
const float RIPPLE_TROUGH = 0.5;
const float GLINT_RISE = 0.8;
const int RAPIDS = 3;

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
const int NOISE_WRAP = 1023;
const float TAU = 6.2831853;
const float LAMBDA[4] = float[4](30.0, 19.0, 12.0, 8.0);
const float DIST_STEPS = 32.0;
const float GRAD_STEP = 4.0;
const vec3 SEA_LIGHT = vec3(-0.4511, -0.5514, 0.7018);
const vec3 SEA_HALF = vec3(-0.2445, -0.2989, 0.9224);
const float SHADE_STEPS = 4.5;
const float SPEC_STEPS = 2.5;
const int BANDS = 6;
const float BAND_WOBBLE = 0.12;
const float BAND_DITHER = 0.5;
const float SWASH = 3.0;
const float FOAM_HIGH = 0.62;
const float FOAM_LOW = 0.36;
const float FOAM_DITHER = 0.24;
const float GLINT_STEP = 0.5;
const vec3 WET_SAND[2] = vec3[2](vec3(112.0, 98.0, 74.0) / 255.0, vec3(138.0, 122.0, 92.0) / 255.0);

const int V_DOWNWIND = 1;
const int V_EBB = 2;
const int V_GUSTS = 3;
const int V_SWELL = 4;
const int V_ALL = 5;

const float BAYER[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
const vec3 DEEP[6] = vec3[6](
    vec3(15.0, 29.0, 51.0) / 255.0, vec3(21.0, 42.0, 71.0) / 255.0, vec3(27.0, 58.0, 92.0) / 255.0,
    vec3(36.0, 80.0, 114.0) / 255.0, vec3(47.0, 104.0, 136.0) / 255.0, vec3(74.0, 138.0, 162.0) / 255.0);
const vec3 SHALLOWS[6] = vec3[6](
    vec3(28.0, 74.0, 82.0) / 255.0, vec3(38.0, 96.0, 102.0) / 255.0, vec3(51.0, 120.0, 122.0) / 255.0,
    vec3(74.0, 148.0, 144.0) / 255.0, vec3(111.0, 176.0, 164.0) / 255.0, vec3(165.0, 210.0, 192.0) / 255.0);
const vec3 FOAM[3] = vec3[3](
    vec3(169.0, 207.0, 208.0) / 255.0, vec3(207.0, 230.0, 226.0) / 255.0, vec3(238.0, 247.0, 242.0) / 255.0);
const vec3 GRASS[4] = vec3[4](
    vec3(58.0, 82.0, 40.0) / 255.0, vec3(70.0, 97.0, 46.0) / 255.0, vec3(84.0, 112.0, 52.0) / 255.0, vec3(101.0, 128.0, 60.0) / 255.0);

const vec3 ICE[4] = vec3[4](
    vec3(111.0, 147.0, 172.0) / 255.0, vec3(148.0, 180.0, 198.0) / 255.0, vec3(188.0, 211.0, 220.0) / 255.0, vec3(221.0, 233.0, 236.0) / 255.0);
const vec3 SNOW[5] = vec3[5](
    vec3(124.0, 142.0, 166.0) / 255.0, vec3(164.0, 182.0, 200.0) / 255.0, vec3(200.0, 214.0, 224.0) / 255.0,
    vec3(230.0, 238.0, 240.0) / 255.0, vec3(248.0, 252.0, 252.0) / 255.0);
const float ICE_SHOWS = 0.08;
const float ICE_REACH = 1.3;
const float ICE_DEPTH = 0.85;

float dither(ivec2 q) {
    return (BAYER[((q.y & 3) << 2) | (q.x & 3)] + 0.5) / 16.0;
}

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

uint kindAt(vec2 art) {
    ivec2 tile = clamp(ivec2(floor(art / u_tileArt)), ivec2(0), u_mapSize - 1);
    return texelFetch(u_kinds, tile, 0).r;
}

int rampStep(float tone, ivec2 q) {
    return clamp(int(floor(clamp(tone, 0.0, 5.0) + 0.5 + (dither(q) - 0.5) * DITHER)), 0, 5);
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

vec3 waveField(vec2 p) {
    vec4 state = u_sea[SEA_STATE];
    float chop = state.x;
    float choppy = state.y;
    vec2 warp = vec2(wn(p * 0.013, 41), wn(p * 0.013 + 9.0, 41)) - 0.5;
    vec2 qR = p + warp * 11.5;
    vec2 qC = p + warp * 46.0;
    vec3 h = vec3(0.0);
    for (int i = 0; i < 4; i++) {
        float amp = u_sea[SEA_AMP][i];
        if (amp <= 0.0) continue;
        float k = TAU / LAMBDA[i];
        float om = u_sea[SEA_PHASE][i];
        float lift = amp * (0.55 + 0.9 * wn(p * 0.012 + float(i) * 3.1 - u_sea[SEA_DRIFT].xy, 43));
        if (choppy < 1.0) {
            vec2 d = seaDir(SEA_ROUGH, i);
            float ph = dot(qR, d) * k - om + wn(qR * 0.008 + float(i) * 7.0, 44) * 5.75;
            h += (1.0 - choppy) * lift * crest(ph, chop, d * k);
        }
        if (choppy > 0.0) {
            vec2 d = seaDir(SEA_CHOPPY, i);
            float ph = dot(qC, d) * k - om + wn(qC * 0.008 + float(i) * 7.0, 44) * 11.0;
            h += choppy * lift * crest(ph, chop, d * k);
        }
    }
    return h;
}

mat2 turnBy(float a) {
    float c = cos(a);
    float s = sin(a);
    return mat2(c, s, -s, c);
}

vec3 swellField(vec2 q) {
    mat2 r = turnBy(u_body.w);
    vec3 h = waveField(r * q * 0.55 + vec2(137.0, 59.0));
    return vec3(h.x, transpose(r) * h.yz * 0.55);
}

float gustAt(vec2 q) {
    vec2 dir = u_sea[SEA_WIND].xy;
    vec2 g = q - dir * u_body.z;
    float n = wn(g * 0.018, 61) * 0.65 + wn(g * 0.05 + 17.0, 62) * 0.35;
    return smoothstep(0.42, 0.7, n);
}

const float POCK_CELL = 7.0;
const float POCK_RATE = 2.2;

int rainPock(ivec2 a) {
    float rain = u_weather.y;
    if (rain <= 0.0) return 0;
    ivec2 c = ivec2(floor(vec2(a) / POCK_CELL));
    float tt = u_weather.z * POCK_RATE + hash(c.x, c.y, 81);
    int slot = int(floor(tt));
    float age = fract(tt);
    if (hash(c.x, c.y, 82 + slot % 97) > rain * 0.55) return 0;
    vec2 centre = vec2(c) * POCK_CELL + 1.0 + floor(vec2(hash(c.x, c.y, 83 + slot % 89), hash(c.x, c.y, 84 + slot % 83)) * (POCK_CELL - 2.0));
    float r = length(vec2(a) - centre);
    if (age < 0.15 && r < 1.0) return 2;
    if (age < 0.7 && abs(r - age * 3.0) < 0.5) return 1;
    return 0;
}

float shoreAt(vec2 art) {
    return (texture(u_tide, art / u_tileArt / vec2(u_mapSize)).b * 255.0 / DIST_STEPS - 0.5) * u_tileArt;
}

vec2 warpAt(vec2 p) {
    vec2 wide = vec2(valueNoise(p * WARP_WIDE_FREQ, 11), valueNoise(p * WARP_WIDE_FREQ, 14));
    vec2 fine = vec2(valueNoise(p * WARP_FINE_FREQ, 12), valueNoise(p * WARP_FINE_FREQ, 15));
    return p + (wide - 0.5) * WARP_WIDE_AMP + (fine - 0.5) * WARP_FINE_AMP;
}

float grainAt(ivec2 art, vec4 shift, float deep, float ruffle) {
    ivec2 at = art % textureSize(u_waterField, 0);
    vec2 fq = vec2(at);
    vec4 field = texelFetch(u_waterField, at, 0);
    float ripple = periodicNoise(fq, RIPPLE_CELLS, vec2(40.0, 0.0) + shift.xy * RIPPLE_CELLS / FIELD_PERIOD, 33);
    float rippled = ripple > 0.7 ? RIPPLE_CREST : ripple < 0.25 ? -RIPPLE_TROUGH : 0.0;
    return field.r * 255.0 / TONE_SCALE - TONE_OFFSET
        + rippled * ruffle
        + (periodicNoise(fq, GLINT_CELLS, shift.zw * GLINT_CELLS / FIELD_PERIOD, 39) > 0.84 ? GLINT_RISE : 0.0)
        - (int(field.g * 255.0 + 0.5) >= OPEN_CELL ? OPEN_CELL_DROP * (1.0 - deep) : 0.0);
}

float iceAt(vec2 q, float depth, float near) {
    float front = u_ice.x * ICE_REACH - depth * ICE_DEPTH + smoothstep(10.0, 0.0, near) * 0.08
        + (wn(q * 0.06, 91) - 0.5) * 0.22 + (wn(q * 0.25, 92) - 0.5) * 0.06;
    return front - ICE_SHOWS;
}

vec3 iceSheet(ivec2 cell, vec2 q, float margin, float depth) {
    ivec2 at = cell % textureSize(u_waterField, 0);
    float grain = texelFetch(u_waterField, at, 0).r * 255.0 / TONE_SCALE - TONE_OFFSET;
    float thick = smoothstep(0.0, 0.35, margin);
    float tone = 0.6 + thick * 2.0 + (grain - 1.5) * 0.45 - depth * 0.6;
    float crack = abs(wn(q * 0.09, 93) - 0.5) + (wn(q * 0.4, 94) - 0.5) * 0.04;
    if (crack < 0.012 && thick > 0.4) tone -= 1.4;
    if (margin < 0.025) return mix(SHALLOWS[3], ICE[1], step(0.5, dither(cell)));
    vec3 c = ICE[clamp(int(floor(tone + (dither(cell) - 0.5) * 0.8)), 0, 3)];
    float drift = wn(q * 0.08 - u_sea[SEA_WIND].xy * u_ice.z * 0.4, 95) + (wn(q * 0.3, 96) - 0.5) * 0.3;
    float cover = u_ice.y * thick * 0.5;
    if (drift < cover - 0.08 + (dither(cell) - 0.5) * 0.15)
        c = SNOW[clamp(int(floor(2.0 + drift * 3.0 + (dither(cell) - 0.5))), 1, 4)];
    return c;
}

vec3 waveWater(vec2 w, vec2 p, int kind) {
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
    float ice = iceAt(q, tide.a, dist);
    if (ice > 0.0) return iceSheet(cell << shift, q, ice, tide.a);
    float edge = SWASH * (1.0 - u_sea[SEA_SURGE].x) * (0.6 + 0.8 * wn(q * 0.2, 55));
    if (dist < edge) return WET_SAND[dist > edge - 1.0 ? 0 : 1];
    float near = dist - edge;
    vec4 state = u_sea[SEA_STATE];
    vec4 look = u_sea[SEA_LOOK];
    float dw = near + wn(q * 0.035, 45) * 7.0 + wn(q * 0.11, 46) * 2.0;
    float arg = dw * 0.36 + u_sea[SEA_SHORE].x;
    float sb = max(sin(arg) * 0.5 + 0.5, 1e-4);
    float sh = pow(sb, 2.5);
    float shoal = smoothstep(45.0, 8.0, near) * (1.0 + 1.3 * smoothstep(14.0, 3.0, near));
    float bl = smoothstep(45.0, 12.0, near);

    bool ebb = u_variant == V_EBB || u_variant == V_ALL;
    bool gusty = u_variant == V_GUSTS || u_variant == V_ALL;
    vec2 seaward = length(slope) > 1e-3 ? normalize(slope) : vec2(0.0);
    float pull = ebb ? sin(arg - 1.1) * smoothstep(60.0, 6.0, near) : 0.0;
    vec2 bodyQ = q + u_body.xy - seaward * pull * 2.2;
    float gust = gusty ? gustAt(q) : 1.0;

    vec3 hw = waveField(bodyQ);
    if (u_variant == V_SWELL) hw = hw * 0.7 + swellField(bodyQ) * 0.75;
    if (gusty) hw *= mix(1.0, 0.3 + 0.95 * gust, 0.4 + 0.6 * u_weather.x);
    hw.x += (wn(q * 0.3 + u_sea[SEA_SHORE].zw, 47) - 0.5) * look.z;
    float lift = shoal * state.z * 2.2;
    vec3 surge = vec3(sh * lift, slope * (1.25 * sh / sb * cos(arg) * 0.36 * lift));
    vec3 h = mix(hw, surge + hw * 0.3, bl);
    vec3 n = normalize(vec3(-h.yz * 0.55, 1.0));
    float shade = clamp(dot(n, SEA_LIGHT) / SEA_LIGHT.z, 0.0, 2.0);
    float spec = pow(max(dot(n, SEA_HALF), 0.0), 90.0) * look.y;
    vec4 brkAt = u_sea[SEA_BREAK];
    float brk = wn(q * 0.5 + brkAt.xy, 48) * 0.6 + wn(q * 1.4 - brkAt.zz, 49) * 0.4;
    vec4 motif = u_sea[SEA_SURGE];
    float cap = motif.w * smoothstep(0.62, 1.0, h.x / max(look.w * 0.6, 0.2))
        * smoothstep(0.45, 0.72, wn(q * 0.45 + u_sea[SEA_DRIFT].zw, 50)) * state.w * (1.0 - bl * 0.7);
    if (gusty) cap *= smoothstep(0.35, 0.8, gust);
    vec2 dir = u_sea[SEA_WIND].xy;
    vec2 qa = vec2(dot(q, dir), dot(q, vec2(-dir.y, dir.x)));
    float streak = 0.0;
    if (state.w > 0.4 || kind == RAPIDS)
        streak = smoothstep(0.55, 0.85, wn(vec2(qa.x * 0.025 - brkAt.w, qa.y * 0.35), 51))
            * smoothstep(0.3, 0.7, wn(q * 0.06, 52)) * look.x * max((state.w - 0.4) * motif.w, kind == RAPIDS ? 0.6 : 0.0) * 1.6;
    float run = u_sea[SEA_SHORE].y;
    float surf = smoothstep(0.55, 1.0, sh) * smoothstep(12.0, 1.5, near) * smoothstep(0.3, 0.6, brk) * state.z * 0.8;
    surf += smoothstep(run, run * 0.4, near) * smoothstep(0.28, 0.6, brk);
    surf += smoothstep(0.7, 0.0, abs(near - run * 1.5)) * smoothstep(0.45, 0.75, brk) * 0.5 * state.z;
    float foam = clamp(cap + streak * 0.5 + surf, 0.0, 1.0) * 0.8 + (d - 0.5) * FOAM_DITHER;
    if (foam > FOAM_HIGH) return FOAM[shade > 1.0 ? 2 : 1];
    if (foam > FOAM_LOW) return FOAM[0];
    int pock = rainPock(cell << shift);
    if (pock == 2) return FOAM[1];
    float glint = pow(max(dot(n, SEA_HALF), 0.0), 70.0) * smoothstep(0.3, 0.75, wn(q * 0.2 + u_sea[SEA_WIND].z, 53));
    float depth = tide.a + (wn(q * 0.05, 54) - 0.5) * BAND_WOBBLE;
    int band = clamp(int(floor(clamp(depth, 0.0, 1.0) * float(BANDS - 1) + 0.5 + (d - 0.5) * BAND_DITHER)), 0, BANDS - 1);
    float deep = float(band) / float(BANDS - 1);
    vec4 grain = u_grain;
    if (ebb) grain += vec4(seaward, seaward) * pull * vec4(9.0, 9.0, 4.0, 4.0);
    float ruffle = gusty ? smoothstep(0.15, 0.6, gust) : 1.0;
    float tone = grainAt((cell << shift) + ((1 << shift) >> 1), grain, deep, ruffle)
        + motif.w * ((shade - 1.0) * look.x * SHADE_STEPS + spec * SPEC_STEPS + (glint > GLINT_STEP ? 2.0 : 0.0));
    if (pock == 1) tone += 1.5;
    int tier = rampStep(tone, cell);
    return mix(SHALLOWS[tier], DEEP[min(tier + 1, 5)], deep);
}

vec3 ground(vec2 p) {
    ivec2 q = ivec2(p);
    float n = valueNoise(p * 0.09, 71) * 0.6 + valueNoise(p * 0.31, 72) * 0.4;
    int step = clamp(int(floor(n * 4.0 + (dither(q) - 0.5) * 0.9)), 0, 3);
    return GRASS[step];
}

void main() {
    vec2 frag = vec2(gl_FragCoord.x, u_viewH - gl_FragCoord.y);
    vec2 p = floor(u_origin + frag);
    vec2 w = warpAt(p);
    uint k = kindAt(w);
    vec3 c = k >= 2u ? waveWater(w, p, 1) : ground(p);
    fragColor = vec4(c, 1.0);
}`;
