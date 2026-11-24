precision highp float;
precision highp int;
precision highp sampler2D;
precision highp isampler2D;

uniform ivec2 u_origin;
uniform ivec2 u_size;
uniform ivec2 u_mid;
uniform ivec2 u_midSize;
uniform ivec2 u_fine;
uniform ivec2 u_fineSize;
uniform ivec2 u_at;
uniform isampler2D u_jfa;
uniform sampler2D u_far;
uniform ivec2 u_farOrigin;
uniform ivec2 u_farSize;
uniform sampler2D u_foot;
uniform sampler2D u_atlas;
uniform int u_step;
uniform sampler2D u_src;
uniform ivec2 u_dir;
uniform int u_radius;
uniform sampler2D u_soft;
uniform sampler2D u_wide;
uniform sampler2D u_crag;
uniform sampler2D u_cell;
uniform sampler2D u_tone;
uniform sampler2D u_edge;
uniform int u_snow;
uniform ivec2 u_chunk;
uniform ivec2 u_mapPx;
uniform int u_lift;
uniform ivec2 u_drain;
uniform ivec2 u_drainSize;
uniform ivec2 u_blurSize;
uniform sampler2D u_route;
uniform sampler2D u_down;
uniform sampler2D u_flow;
uniform sampler2D u_chan;
uniform sampler2D u_fan;

const int NONE = -30000;
const float TILE = 32.0;
const vec3 SUN = vec3(-1.0, 0.15, 1.15);
const float STEEP = 0.88;
const float BENCH = 30.0;
const float STRATA = 13.0;
const int KIND_NONE = -1;
const int KIND_ROCK = 0;
const int KIND_SNOW = 1;
const int KIND_SCREE = 2;
const int KIND_GULLY = 3;
const int B4[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);

float hash(int x, int y, int z) {
    uint n = (uint(x) * 374761393u) ^ (uint(y) * 668265263u) ^ (uint(z) * 1274126177u);
    n = (n ^ (n >> 13u)) * 1274126177u;
    return min(float(n ^ (n >> 16u)) / 4294967296.0, 0.99999994);
}

float noise(vec2 p, int s) {
    vec2 i = floor(p);
    vec2 f = p - i;
    f = f * f * (3.0 - 2.0 * f);
    ivec2 c = ivec2(i);
    float top = mix(hash(c.x, c.y, s), hash(c.x + 1, c.y, s), f.x);
    float bottom = mix(hash(c.x, c.y + 1, s), hash(c.x + 1, c.y + 1, s), f.x);
    return mix(top, bottom, f.y);
}

float fbm(vec2 p, int s, int octaves) {
    float a = 0.5;
    float f = 1.0;
    float v = 0.0;
    float n = 0.0;
    for (int i = 0; i < octaves; i++) {
        v += a * noise(p * f, s + i * 17);
        n += a;
        a *= 0.5;
        f *= 2.0;
    }
    return v / n;
}

float ridged(vec2 p, int s) {
    return 1.0 - abs(2.0 * noise(p, s) - 1.0);
}

float smooth3(float a, float b, float v) {
    float t = clamp((v - a) / (b - a), 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
}

float dith(ivec2 p) {
    return (float(B4[((p.y & 3) << 2) | (p.x & 3)]) + 0.5) / 16.0;
}

ivec2 local(ivec2 w) {
    return clamp(w - u_origin, ivec2(0), u_size - 1);
}

ivec2 mid(ivec2 w) {
    return clamp(w - u_mid, ivec2(0), u_midSize - 1);
}

ivec2 fine(ivec2 w) {
    return clamp(w - u_fine, ivec2(0), u_fineSize - 1);
}

ivec2 here() {
    return u_at + ivec2(gl_FragCoord.xy);
}

bool footAt(ivec2 w) {
    ivec2 t = w - u_origin;
    if (any(lessThan(t, ivec2(0))) || any(greaterThanEqual(t, u_size))) return false;
    return texelFetch(u_jfa, t, 0).xy != t;
}

vec4 farTexel(ivec2 t) {
    return texelFetch(u_far, clamp(t - u_farOrigin, ivec2(0), u_farSize - 1), 0);
}

vec3 farAt(vec2 p) {
    vec2 u = p / TILE - 0.5;
    vec2 i = floor(u);
    vec2 f = u - i;
    ivec2 c = ivec2(i);
    vec3 a = mix(farTexel(c).xyz, farTexel(c + ivec2(1, 0)).xyz, f.x);
    vec3 b = mix(farTexel(c + ivec2(0, 1)).xyz, farTexel(c + ivec2(1, 1)).xyz, f.x);
    return mix(a, b, f.y);
}

vec3 edgeAt(ivec2 w) {
    ivec2 t = local(w);
    ivec2 s = texelFetch(u_jfa, t, 0).xy;
    float dj = s.x == NONE ? 1e9 : length(vec2(s - t));
    vec2 nj = vec2(s + u_origin);
    vec3 far = farAt(vec2(w) + 0.5);
    float k = smooth3(64.0, 96.0, dj);
    return vec3(mix(dj, far.x, k), mix(nj, far.yz, k));
}

float field(sampler2D tex, ivec2 w) {
    return texelFetch(tex, mid(w), 0).r;
}

struct Facet {
    ivec2 cell;
    ivec2 site;
};

int cellId(ivec2 c) {
    return c.x * 65599 + c.y;
}

Facet facet(ivec2 w, float size, int seed, float stretch, bool aligned) {
    vec2 u = vec2(1.0, 0.0);
    float k = 1.0;
    if (aligned) {
        float gx = field(u_wide, w + ivec2(4, 0)) - field(u_wide, w - ivec2(4, 0));
        float gy = field(u_wide, w + ivec2(0, 4)) - field(u_wide, w - ivec2(0, 4));
        float g = length(vec2(gx, gy));
        if (g > 0.4) {
            u = vec2(gx, gy) / g;
            k = stretch;
        }
    }
    vec2 p = vec2(w);
    ivec2 base = ivec2(floor(p / size));
    float best = 1e20;
    Facet out_ = Facet(base, w);
    for (int j = -2; j <= 2; j++)
        for (int q = -2; q <= 2; q++) {
            ivec2 c = base + ivec2(q, j);
            vec2 s = (vec2(c) + vec2(hash(c.x + 2, c.y + 2, seed), hash(c.x + 2, c.y + 2, seed + 7))) * size;
            vec2 d = p - s;
            float along = dot(d, u) / k;
            float across = d.x * u.y - d.y * u.x;
            float m = along * along + across * across;
            if (m < best) {
                best = m;
                out_ = Facet(c, ivec2(floor(s + 0.5)));
            }
        }
    return out_;
}

vec2 slopeAt(ivec2 s) {
    return vec2(
        (field(u_wide, s + ivec2(6, 0)) - field(u_wide, s - ivec2(6, 0))) / 12.0,
        (field(u_wide, s + ivec2(0, 6)) - field(u_wide, s - ivec2(0, 6))) / 12.0
    );
}

float lambertOf(vec2 g) {
    float ln = length(SUN);
    return (-g.x * SUN.x - g.y * SUN.y + SUN.z) / (length(vec3(g, 1.0)) * ln) - SUN.z / ln;
}

const int DRAIN = 2;
const float GULLY = 90.0;
const float GROOVE = 0.12;
const ivec2 NEAR8[8] = ivec2[8](ivec2(-1, -1), ivec2(0, -1), ivec2(1, -1), ivec2(-1, 0), ivec2(1, 0), ivec2(-1, 1), ivec2(0, 1), ivec2(1, 1));

ivec2 cellClamp(ivec2 c) {
    return clamp(c, ivec2(0), u_drainSize - 1);
}

float drainField(sampler2D tex, vec2 w) {
    vec2 u = (w - vec2(u_drain)) / float(DRAIN) - 0.5;
    vec2 i = floor(u);
    vec2 f = u - i;
    ivec2 c = ivec2(i);
    float a = mix(texelFetch(tex, cellClamp(c), 0).r, texelFetch(tex, cellClamp(c + ivec2(1, 0)), 0).r, f.x);
    float b = mix(texelFetch(tex, cellClamp(c + ivec2(0, 1)), 0).r, texelFetch(tex, cellClamp(c + ivec2(1, 1)), 0).r, f.x);
    return mix(a, b, f.y);
}

vec2 gully(ivec2 w) {
    vec2 p = vec2(w) + 0.5;
    return vec2(drainField(u_chan, p) > GROOVE ? 1.0 : 0.0, drainField(u_fan, p));
}

float rp(int n, float t, ivec2 p, float d) {
    float i = floor(clamp(t, 0.0, 1.0) * float(n - 1) + 0.5 + (dith(p) - 0.5) * d);
    return clamp(i, 0.0, float(n - 1));
}

#if defined(PASS_FOOT)
in vec2 v_uv;
out vec4 o_foot;
void main() {
    vec4 c = texelFetch(u_atlas, ivec2(floor(v_uv)), 0);
    if (!(c.a > 0.999 && c.r > 0.99 && c.b > 0.99 && c.g < 0.05)) discard;
    o_foot = vec4(1.0);
}
#endif

#if defined(PASS_SEED)
out ivec4 o_seed;
void main() {
    ivec2 t = ivec2(gl_FragCoord.xy);
    bool foot = texelFetch(u_foot, t, 0).r > 0.5;
    o_seed = ivec4(foot ? ivec2(NONE) : t, 0, 0);
}
#endif

#if defined(PASS_JUMP)
out ivec4 o_seed;
void main() {
    ivec2 t = ivec2(gl_FragCoord.xy);
    ivec2 best = texelFetch(u_jfa, t, 0).xy;
    float bd = best.x == NONE ? 1e20 : dot(vec2(best - t), vec2(best - t));
    for (int j = -1; j <= 1; j++)
        for (int i = -1; i <= 1; i++) {
            if (i == 0 && j == 0) continue;
            ivec2 q = t + ivec2(i, j) * u_step;
            if (any(lessThan(q, ivec2(0))) || any(greaterThanEqual(q, u_size))) continue;
            ivec2 s = texelFetch(u_jfa, q, 0).xy;
            if (s.x == NONE) continue;
            float d = dot(vec2(s - t), vec2(s - t));
            if (d < bd) {
                bd = d;
                best = s;
            }
        }
    o_seed = ivec4(best, 0, 0);
}
#endif

#if defined(PASS_RANGE)
out vec4 o_raw;
void main() {
    ivec2 w = here();
    if (!footAt(w)) {
        o_raw = vec4(0.0);
        return;
    }
    vec2 p = vec2(w);
    float d = edgeAt(w).x;
    vec2 warp = vec2(fbm(p / 110.0, 31, 2), fbm(p / 110.0, 37, 2)) - 0.5;
    ivec2 j = ivec2(floor(p + warp * 64.0 + 0.5));
    vec3 ej = edgeAt(j);
    float dw = min(footAt(j) ? ej.x : 0.0, d * 1.7 + 8.0) * 0.65 + d * 0.35;
    vec2 b = ej.yz + (vec2(noise(p / 46.0, 91), noise(p / 46.0, 93)) - 0.5) * 30.0;
    float s1 = ridged(b / 82.0, 61);
    float s2 = ridged(b / 33.0, 67);
    float spur = 0.6 * s1 * s1 + 0.4 * s2;
    float crest = 0.5 + fbm(p / 300.0, 21, 2);
    vec2 wp = p + (vec2(fbm(p / 140.0, 131, 2), fbm(p / 140.0, 137, 2)) - 0.5) * 90.0;
    float deep = smooth3(90.0, 230.0, d);
    float r1 = ridged(wp / 170.0, 41);
    float r3 = ridged(p / 37.0, 53);
    float top = 190.0;
    float flank = top * tanh(dw * 0.6 / top);
    float h = flank * (0.55 + 0.65 * spur) * crest + deep * crest * 84.0 * r1 * r1 + smooth3(4.0, 40.0, d) * 7.0 * r3 * r3;
    o_raw = vec4(min(h, d * STEEP), 0.0, 0.0, 0.0);
}
#endif

#if defined(PASS_BLUR)
out vec4 o_blur;
void main() {
    ivec2 t = ivec2(gl_FragCoord.xy);
    float s = 0.0;
    for (int k = -u_radius; k <= u_radius; k++)
        s += texelFetch(u_src, clamp(t + u_dir * k, ivec2(0), u_blurSize - 1), 0).r;
    o_blur = vec4(s / float(2 * u_radius + 1), 0.0, 0.0, 0.0);
}
#endif

#if defined(PASS_ROUTE)
out vec4 o_route;
void main() {
    ivec2 c = ivec2(gl_FragCoord.xy);
    ivec2 w = u_drain + c * DRAIN;
    if (!footAt(w)) {
        o_route = vec4(-1.0);
        return;
    }
    o_route = vec4(field(u_soft, w) + noise(vec2(w) / 16.0, 211) * 4.0 + hash(w.x, w.y, 213) * 0.4);
}
#endif

#if defined(PASS_DOWN)
out vec4 o_down;
void main() {
    ivec2 c = ivec2(gl_FragCoord.xy);
    float low = texelFetch(u_route, c, 0).r;
    float to = -1.0;
    if (low >= 0.0)
        for (int k = 0; k < 8; k++) {
            ivec2 n = c + NEAR8[k];
            if (any(lessThan(n, ivec2(0))) || any(greaterThanEqual(n, u_drainSize))) continue;
            float v = texelFetch(u_route, n, 0).r;
            if (v < low) {
                low = v;
                to = float(k);
            }
        }
    o_down = vec4(to);
}
#endif

#if defined(PASS_FLOW)
out vec4 o_flow;
void main() {
    ivec2 c = ivec2(gl_FragCoord.xy);
    if (texelFetch(u_route, c, 0).r < 0.0) {
        o_flow = vec4(0.0);
        return;
    }
    float f = 1.0;
    for (int k = 0; k < 8; k++) {
        ivec2 n = c - NEAR8[k];
        if (any(lessThan(n, ivec2(0))) || any(greaterThanEqual(n, u_drainSize))) continue;
        if (int(texelFetch(u_down, n, 0).r) == k) f += texelFetch(u_flow, n, 0).r;
    }
    o_flow = vec4(f);
}
#endif

#if defined(PASS_CHANNEL)
out vec4 o_chan;
void main() {
    float flow = texelFetch(u_flow, ivec2(gl_FragCoord.xy), 0).r * float(DRAIN * DRAIN);
    o_chan = vec4(flow > GULLY ? min(1.0, 0.35 + log2(flow / GULLY) / 5.0) : 0.0);
}
#endif

#if defined(PASS_CRAG)
layout(location = 0) out vec4 o_crag;
layout(location = 1) out vec4 o_cell;
void main() {
    ivec2 w = here();
    if (!footAt(w)) {
        o_crag = vec4(0.0, 0.0, 0.0, -1.0);
        o_cell = vec4(0.0);
        return;
    }
    float soft = field(u_soft, w);
    float d = edgeAt(w).x;
    Facet big = facet(w, 44.0, 301, 2.3, true);
    Facet chip = facet(w, 16.0, 311, 1.7, true);
    int bid = cellId(big.cell);
    int cid = cellId(chip.cell);
    float shift = hash(bid, 1, 303) * BENCH;
    float q = (soft + shift) / BENCH;
    float whole = floor(q);
    float stepped = (whole + smooth3(0.36, 0.64, q - whole)) * BENCH - shift;
    float h = soft + (stepped - soft) * 0.7 * smooth3(16.0, 60.0, soft);
    float height = clamp(min(h, d * STEEP), 0.0, float(HMAX - 1));
    vec2 bs = slopeAt(big.site);
    vec2 cs = slopeAt(chip.site);
    vec2 g = bs * 0.6 + cs * 0.4
        + (vec2(hash(bid, 2, 303), hash(bid, 3, 303)) - 0.5) * 0.5
        + (vec2(hash(cid, 2, 313), hash(cid, 3, 313)) - 0.5) * 0.3;
    float steep = min(1.0, length(bs) / 0.75);
    o_crag = vec4(height, lambertOf(g), steep, hash(bid, cid, 317));
    o_cell = vec4(hash(bid, 5, 305), hash(bid, 8, 303), hash(cid, 4, 313), 0.0);
}
#endif

#if defined(PASS_TONE)
out vec4 o_tone;

ivec2 stoneAt(ivec2 w) {
    return facet(w, 5.0, 321, 1.0, false).cell;
}

void main() {
    ivec2 w = here();
    vec4 crag = texelFetch(u_crag, fine(w), 0);
    if (crag.w < 0.0) {
        o_tone = vec4(0.0, float(KIND_NONE), 0.0, 0.0);
        return;
    }
    vec4 cell = texelFetch(u_cell, fine(w), 0);
    float h = crag.x;
    float l = crag.y;
    float steep = crag.z;
    vec2 p = vec2(w);
    vec2 sun = normalize(SUN.xy);
    bool shaded = false;
    for (int k = 1; k <= 18; k++) {
        ivec2 s = ivec2(floor(p + float(k * 3) * sun + 0.5));
        ivec2 t = s - u_fine;
        if (any(lessThan(t, ivec2(0))) || any(greaterThanEqual(t, u_fineSize))) break;
        if (texelFetch(u_crag, t, 0).x - (h + float(k * 3) * 0.8) > 2.2) {
            shaded = true;
            break;
        }
    }
    float t = 0.5 + (l > 0.0 ? l * 1.2 : l * 0.8) + (cell.z - 0.5) * 0.07;
    if (shaded) t -= 0.17;
    float layer = (h + cell.x * 16.0 + noise(p / 90.0, 81) * 14.0 + p.x * 0.05) / STRATA;
    int bed = int(floor(layer));
    if (steep > 0.3) {
        t += (hash(bed, 0, 307) - 0.5) * 0.2;
        if (layer - float(bed) < 1.2 / STRATA && hash(bed, int(floor(p.x / 43.0)), 309) > 0.5) t -= 0.17;
    }
    t = floor(clamp(t, 0.26, 0.95) * 6.0 + 0.5) / 6.0;
    float soft = field(u_soft, w);
    float d = edgeAt(w).x;
    vec2 gy = gully(w);
    float apron = 16.0 * (0.35 + 1.2 * fbm(p / 60.0, 91, 2)) + gy.y * 60.0;
    int kind = KIND_ROCK;
    if (d + (dith(w) - 0.5) * 7.0 < apron && soft < 34.0) {
        ivec2 s = stoneAt(w);
        int sid = cellId(s);
        t = 0.4 + hash(sid, 6, 323) * 0.34 + (hash(sid, 7, 323) > 0.86 ? 0.14 : 0.0);
        if (stoneAt(w - ivec2(1, 0)) != s || stoneAt(w - ivec2(0, 1)) != s) t += 0.1;
        else if (stoneAt(w + ivec2(1, 0)) != s || stoneAt(w + ivec2(0, 1)) != s) t -= 0.2;
        kind = KIND_SCREE;
    } else if (gy.x > 0.5) {
        t = gully(w - ivec2(1, 0)).x > 0.5 ? min(t - 0.17, 0.34) : 0.17;
        kind = KIND_GULLY;
    } else if (gully(w - ivec2(1, 0)).x > 0.5) t += 0.17;
    if (u_snow != 0 && kind != KIND_SCREE) {
        float line = 150.0 + (fbm(p / 70.0, 71, 2) - 0.5) * 36.0;
        bool held = kind == KIND_GULLY;
        float cover = h + min(0.0, l) * 46.0 - steep * 22.0 + (held ? 60.0 : 0.0) + (cell.y - 0.5) * 22.0 - line;
        if (cover > 0.0) {
            kind = KIND_SNOW;
            t = floor(clamp(0.72 + l * 1.5 - (shaded ? 0.22 : 0.0) - (held ? 0.14 : 0.0), 0.0, 1.0) * 4.0 + 0.5) / 4.0;
        }
    }
    o_tone = vec4(t, float(kind), crag.w, 0.0);
}
#endif

#if defined(PASS_EDGE)
out vec4 o_edge;

vec4 toneAt(ivec2 w) {
    return texelFetch(u_tone, fine(w), 0);
}

int idOf(float v) {
    return int(floor(v * 2048.0));
}

void main() {
    ivec2 w = here();
    vec4 me = toneAt(w);
    int kind = int(floor(me.y + 0.5));
    if (kind == KIND_NONE) {
        o_edge = vec4(0.0, float(KIND_NONE), 0.0, 0.0);
        return;
    }
    float t = me.x;
    if (kind == KIND_ROCK) {
        vec4 west = toneAt(w - ivec2(1, 0));
        vec4 north = toneAt(w - ivec2(0, 1));
        vec4 east = toneAt(w + ivec2(1, 0));
        vec4 south = toneAt(w + ivec2(0, 1));
        int id = idOf(me.z);
        bool w_ = footAt(w - ivec2(1, 0)) && idOf(west.z) != id;
        bool n_ = footAt(w - ivec2(0, 1)) && idOf(north.z) != id;
        if ((w_ && me.x > west.x + 0.05) || (n_ && me.x > north.x + 0.05)) t = me.x + 0.12;
        else {
            bool e_ = footAt(w + ivec2(1, 0)) && idOf(east.z) != id;
            bool s_ = footAt(w + ivec2(0, 1)) && idOf(south.z) != id;
            int other = e_ ? idOf(east.z) : s_ ? idOf(south.z) : id;
            if (other != id && hash(min(id, other), max(id, other), 315) > 0.45) t = me.x - 0.17;
        }
    }
    float rim = 0.0;
    if (!footAt(w - ivec2(0, 1)) || !footAt(w - ivec2(1, 0))) rim = 1.0;
    else if (!footAt(w + ivec2(1, 0))) rim = -1.0;
    o_edge = vec4(t, float(kind), rim, 0.0);
}
#endif

#if defined(PASS_PAINT)
out vec4 o_peak;

void main() {
    ivec2 o = ivec2(gl_FragCoord.xy);
    int x = u_chunk.x + o.x;
    int r = u_chunk.y + o.y;
    o_peak = vec4(0.0);
    if (x < 0 || x >= u_mapPx.x || r + u_lift >= u_mapPx.y || !footAt(ivec2(x, r + u_lift))) return;
    float front = 1e9;
    int owner = -1;
    int k = 0;
    int span = 0;
    for (int i = 0; i <= HMAX; i++) {
        int y = r + u_lift + HMAX - i;
        if (y >= u_mapPx.y || !footAt(ivec2(x, y))) {
            front = 1e9;
            continue;
        }
        if (front > 1e8) front = float(y - u_lift + 1);
        float row = floor(float(y - u_lift) - texelFetch(u_crag, fine(ivec2(x, y)), 0).x + 0.5);
        if (row >= front) continue;
        if (row <= float(r)) {
            owner = y;
            k = r - int(row);
            span = int(front - row);
            break;
        }
        front = row;
    }
    if (owner < 0) return;
    ivec2 src = ivec2(x, owner);
    vec4 crag = texelFetch(u_crag, fine(src), 0);
    vec4 edge = texelFetch(u_edge, fine(src), 0);
    int kind = int(floor(edge.y + 0.5));
    ivec2 dp = ivec2(x, r);
    float index;
    bool snow = false;
    if (span >= 5 && k > 0 && kind != KIND_SCREE) {
        float bedShift = texelFetch(u_cell, fine(src), 0).x * 16.0;
        float e = crag.x - float(k);
        float layer = (e + bedShift + noise(vec2(src) / 90.0, 81) * 14.0 + float(x) * 0.05) / STRATA;
        int bed = int(floor(layer));
        float t = 0.36 - float(k) / float(span) * 0.14 + crag.y * 0.5
            + (noise(vec2(float(x) / 3.0, e / 60.0), 331) - 0.5) * 0.34 + (hash(bed, 0, 307) - 0.5) * 0.16;
        if (layer - float(bed) < 1.2 / STRATA && hash(bed, int(floor(float(x) / 43.0)), 309) > 0.55) t -= 0.2;
        if (k == span - 1) t -= 0.12;
        if (kind == KIND_SNOW && span < 12) {
            snow = true;
            index = rp(5, texelFetch(u_tone, fine(src), 0).x - (span >= 9 ? 0.25 : 0.0), dp, 0.3);
        } else index = rp(7, floor(clamp(t, 0.08, 0.8) * 6.0 + 0.5) / 6.0, dp, 0.3);
    } else if (kind == KIND_SNOW) {
        snow = true;
        index = rp(5, edge.x, dp, 0.3);
    } else {
        float lip = span >= 5 ? 0.17 : 0.0;
        float rim = edge.z > 0.5 ? 0.2 : edge.z < -0.5 ? -0.18 : 0.0;
        index = rp(7, edge.x + lip + rim, dp, 0.3);
    }
    int off = owner - r - u_lift;
    float code = (snow ? 8.0 : 1.0) + index;
    o_peak = vec4(code, float(off & 255), float(off >> 8), 255.0) / 255.0;
}
#endif
