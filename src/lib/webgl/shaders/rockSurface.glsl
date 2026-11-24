uniform highp sampler2D u_veinTexture;
uniform highp usampler2D u_peakTileTexture;

const int VEIN_EDGE = 4;
const int VEIN_TILE = 32;
const float VEIN_SCORE = 2.6;
const float VEIN_KEEP = 1.412;
const float VEIN_THIN = 0.48;
const int VEIN_REACH = 8;
const float VEIN_CLEAR = 4.0;
const float VEIN_FADE = 6.0;
const uint PEAK_ROOF = 2u;
const uint PEAK_NEAR = 4u;
const float CUT_CLEAR = 9.0;
const float CUT_FEATHER = 30.0;
const float CUT_WOBBLE = 12.0;
const float CUT_REACH = 45.0;
const float UNDER_ROCK = 0.74;
const int CUT_B4[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);

bool veinNearBit(float near, int bit) {
    return (int(near + 0.5) & (1 << bit)) != 0;
}

float veinFade(highp vec2 local, bool face, float near) {
    float d = float(VEIN_TILE);
    float far = float(VEIN_TILE) - 1.0;
    if (face) local.y = far * 0.5;
    if (!veinNearBit(near, 0)) d = min(d, local.y);
    if (!veinNearBit(near, 2)) d = min(d, far - local.x);
    if (!veinNearBit(near, 4)) d = min(d, far - local.y);
    if (!veinNearBit(near, 6)) d = min(d, local.x);
    if (!veinNearBit(near, 1)) d = min(d, length(vec2(far - local.x, local.y)));
    if (!veinNearBit(near, 3)) d = min(d, length(vec2(far - local.x, far - local.y)));
    if (!veinNearBit(near, 5)) d = min(d, length(vec2(local.x, far - local.y)));
    if (!veinNearBit(near, 7)) d = min(d, length(local));
    return clamp((d - VEIN_CLEAR) / VEIN_FADE, 0.0, 1.0);
}

vec3 vein(vec3 rock, highp vec2 at, highp vec2 ground, bool face, vec4 info, float near) {
    if (info.x < 0.0) return rock;
    highp ivec2 tile = ivec2(floor(ground)) / VEIN_TILE;
    if (tile != ivec2(info.zw)) return rock;
    highp ivec2 shift = ivec2(int(info.x) * 97 + int(info.y) * 31, int(info.y) * 89 + int(info.x) * 17);
    highp ivec2 size = textureSize(u_veinTexture, 0);
    highp ivec2 q = ivec2(floor(at)) + shift;
    vec4 cell = texelFetch(u_veinTexture, (q % size + size) % size, 0);
    int packed = int(cell.b * 255.0 + 0.5);
    highp vec2 centre = ground + vec2(packed / (2 * VEIN_REACH) - VEIN_REACH, packed % (2 * VEIN_REACH) - VEIN_REACH);
    float fade = veinFade(centre - vec2(tile * VEIN_TILE), face, near);
    if (fade <= 0.0 || cell.g * VEIN_SCORE - VEIN_THIN * (1.0 - fade) < VEIN_KEEP) return rock;
    int k = int(cell.r * 255.0 + 0.5);
    if (k == VEIN_EDGE) return rock * vec3(0.5, 0.5, 0.6);
    return texelFetch(u_paintAtlas, ivec2(info.xy) + ivec2(clamp(k - (face ? 1 : 0), 0, 3), 0), 0).rgb;
}

highp uvec4 peakTile(highp ivec2 t) {
    highp ivec2 size = textureSize(u_peakTileTexture, 0);
    if (any(lessThan(t, ivec2(0))) || any(greaterThanEqual(t, size))) return uvec4(0u);
    return texelFetch(u_peakTileTexture, t, 0);
}

highp ivec2 tileOf(highp ivec2 p) {
    return ivec2(floor(vec2(p) / float(VEIN_TILE)));
}

bool roofedTile(highp ivec2 t) {
    return (peakTile(t).r & PEAK_ROOF) != 0u;
}

float cutHash(highp int x, highp int y) {
    highp uint n = (uint(x) * 374761393u) ^ (uint(y) * 668265263u) ^ (401u * 1274126177u);
    n = (n ^ (n >> 13u)) * 1274126177u;
    return float(n ^ (n >> 16u)) / 4294967296.0;
}

float cutWobble(highp ivec2 p) {
    highp vec2 u = vec2(p) / CUT_WOBBLE;
    highp vec2 i = floor(u);
    vec2 f = u - i;
    highp ivec2 c = ivec2(i);
    float a = mix(cutHash(c.x, c.y), cutHash(c.x + 1, c.y), f.x);
    float b = mix(cutHash(c.x, c.y + 1), cutHash(c.x + 1, c.y + 1), f.x);
    return (mix(a, b, f.y) - 0.5) * CUT_WOBBLE;
}

float cutDistance(highp ivec2 p) {
    highp int lift = int(u_rockLift + 0.5);
    highp ivec2 c = tileOf(p + ivec2(0, lift));
    if ((peakTile(c).r & PEAK_NEAR) == 0u) return 1e9;
    float best = 1e9;
    for (int j = -2; j <= 2; j++)
        for (int i = -2; i <= 2; i++) {
            highp ivec2 t = c + ivec2(i, j);
            if (!roofedTile(t)) continue;
            highp ivec2 lo = t * VEIN_TILE - ivec2(0, lift);
            highp ivec2 hi = lo + ivec2(VEIN_TILE - 1);
            vec2 d = vec2(max(max(lo - p, p - hi), ivec2(0)));
            best = min(best, length(d));
        }
    return best;
}

bool underCut(highp ivec2 p) {
    float d = cutDistance(p);
    if (d >= CUT_REACH) return false;
    float keep = (d + cutWobble(p) - CUT_CLEAR) / CUT_FEATHER;
    float dither = (float(CUT_B4[((p.y & 3) << 2) | (p.x & 3)]) + 0.5) / 16.0;
    return keep <= dither * 0.96 + 0.02;
}
