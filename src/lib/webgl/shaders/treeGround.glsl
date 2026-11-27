uniform highp sampler2D u_trees;

const float TG_BED = 0.5;
const float TG_CORE = 0.86;
const float TG_RAG = 0.56;
const float TG_HARD_RAG = 0.72;
const float TG_RIM = 0.035;
const float TG_LIP = 3.0;
const int TG_KIND_ROWS = 5;
const int TG_HALF = 8;
const int TG_FLECK = 6;
const int TG_SUMMER = 0;
const int TG_AUTUMN = 1;
const int TG_WINTER = 2;
const int TG_BURIED = 0;
const int TG_WELL = 1;
const int TG_MELT = 2;
const int TG_ICE = 3;
const int TG_WET = 1;
const int TG_HEX = 2;
const int TG_RIME = 3;
const int TG_REMAP = 4;
const int TG_LEAF = 0;
const int TG_CORE_ON = 1;
const int TG_HERB_ON = 2;
const int TG_FALL_ON = 4;
const int TG_MOSS_ON = 8;
const int TG_CRACK_ON = 16;
const int TG_HOT_ON = 32;
const int TG_GLOW_ON = 64;
const int TG_STAIN_ON = 128;
const int TG_GRASSY = 1;
const int TG_DRY = 2;
const vec3 TG_LUM = vec3(0.3, 0.59, 0.11);

const int TG_SHAPE_SLOTS = 5;
const int TG_SHAPE_COUNT[3] = int[3](5, 5, 4);
const int TG_SHAPE_SIZE[15] = int[15](2, 2, 2, 3, 2, 3, 4, 3, 3, 3, 1, 1, 2, 5, 0);
const ivec2 TG_SHAPES[75] = ivec2[75](
    ivec2(0, 0), ivec2(1, 0), ivec2(0), ivec2(0), ivec2(0),
    ivec2(0, 0), ivec2(0, 1), ivec2(0), ivec2(0), ivec2(0),
    ivec2(0, 0), ivec2(1, 1), ivec2(0), ivec2(0), ivec2(0),
    ivec2(0, 0), ivec2(1, 0), ivec2(1, 1), ivec2(0), ivec2(0),
    ivec2(0, 0), ivec2(-1, 1), ivec2(0), ivec2(0), ivec2(0),
    ivec2(0, 0), ivec2(1, -1), ivec2(2, -2), ivec2(0), ivec2(0),
    ivec2(0, 0), ivec2(1, 0), ivec2(2, 0), ivec2(3, 0), ivec2(0),
    ivec2(0, 0), ivec2(1, 1), ivec2(2, 2), ivec2(0), ivec2(0),
    ivec2(0, 0), ivec2(1, 0), ivec2(2, -1), ivec2(0), ivec2(0),
    ivec2(0, 0), ivec2(0, 1), ivec2(1, 2), ivec2(0), ivec2(0),
    ivec2(0, 0), ivec2(0), ivec2(0), ivec2(0), ivec2(0),
    ivec2(0, 0), ivec2(0), ivec2(0), ivec2(0), ivec2(0),
    ivec2(0, 0), ivec2(1, 0), ivec2(0), ivec2(0), ivec2(0),
    ivec2(0, 0), ivec2(0, -1), ivec2(0, 1), ivec2(-1, 0), ivec2(1, 0),
    ivec2(0), ivec2(0), ivec2(0), ivec2(0), ivec2(0));

struct TgKind {
    int id;
    float gain;
    bool hard;
    bool remap;
    int winter;
    int tint;
    float reach;
    float herb;
    int herbLow;
    int shape;
    float fleckBed;
    float fleckOut;
    float carpet;
    float moss;
    int mossBase;
    int flags;
    int bedN;
    int coreN;
    int herbN;
    int tintN;
    int fallN;
    int mossN;
    int stainN;
    int fleckN;
};

struct TgSoil {
    float gain;
    bool grassy;
    bool dry;
};

struct TgSpot {
    float level;
    int kind;
    int season;
};

ivec4 tgBytes(highp ivec2 at) {
    return ivec4(texelFetch(u_trees, at, 0) * 255.0 + 0.5);
}

vec3 tgColour(int x, int row) {
    return texelFetch(u_trees, ivec2(x, u_treeRow + row), 0).rgb;
}

vec3 tgRamp(TgKind k, int row, int off, int n, int i) {
    return tgColour(off + clamp(i, 0, max(n - 1, 0)), k.id * TG_KIND_ROWS + row);
}

vec3 tgShared(int row, int off, int i, int n) {
    return tgColour(off + clamp(i, 0, n - 1), u_treeKinds * TG_KIND_ROWS + row);
}

vec3 tgSnow(int i) { return tgShared(0, 0, i, 5); }
vec3 tgFrost(int i) { return tgShared(0, TG_HALF, i, 6); }
vec3 tgMud(int i) { return tgShared(1, 0, i, 6); }
vec3 tgIce(int i) { return tgShared(1, TG_HALF, i, 4); }

TgSoil tgSoil(uint ground) {
    ivec4 b = tgBytes(ivec2(int(ground), u_treeRow + u_treeKinds * TG_KIND_ROWS + 2));
    return TgSoil(float(b.r) / 255.0, (b.g & TG_GRASSY) != 0, (b.g & TG_DRY) != 0);
}

TgKind tgKind(int id) {
    int row = u_treeRow + id * TG_KIND_ROWS + 4;
    ivec4 p0 = tgBytes(ivec2(0, row));
    ivec4 p1 = tgBytes(ivec2(1, row));
    ivec4 p2 = tgBytes(ivec2(2, row));
    ivec4 p3 = tgBytes(ivec2(3, row));
    ivec4 p4 = tgBytes(ivec2(4, row));
    ivec4 p5 = tgBytes(ivec2(5, row));
    ivec4 p6 = tgBytes(ivec2(6, row));
    ivec4 p7 = tgBytes(ivec2(7, row));
    return TgKind(id, float(p0.r) / 127.5, p0.g > 0, p0.b > 0, p1.r, p1.g, float(p1.b) / 255.0,
        float(p2.r) / 255.0, p2.g, p2.b, float(p3.r) / 255.0, float(p3.g) / 255.0, float(p3.b) / 255.0,
        float(p4.r) / 255.0, p4.g, p4.b, p5.r, p5.g, p5.b, p6.r, p6.g, p6.b, p7.r, p7.g);
}

bool tgOn(TgKind k, int flag) {
    return (k.flags & flag) != 0;
}

int tgSoilShade(ivec2 q) {
    return (fieldAt(q).r & SHADE_MASK) - 3;
}

int tgGrassShade(ivec2 q) {
    return ((fieldAt(q + u_grassShift).r >> SHADE_BITS) & SHADE_MASK) - 3;
}

float tgCover(ivec2 q) {
    return float(fieldAt(q).g) / 255.0;
}

bool tgNear(vec2 p) {
    if (u_treeRow <= 0) return false;
    ivec2 t = clamp(ivec2(floor(p / u_tileArt)), ivec2(0), u_mapSize - 1);
    return tgBytes(t).b > 0;
}

TgSpot tgSpot(vec2 w, ivec2 q, TgSoil soil) {
    TgSpot s = TgSpot(-1.0, -1, 0);
    if (soil.gain <= 0.0) return s;
    vec2 g = w / u_tileArt - 0.5;
    ivec2 a = clamp(ivec2(floor(g)), ivec2(0), u_mapSize - 2);
    vec2 f = clamp(g - vec2(a), 0.0, 1.0);
    ivec4 c00 = tgBytes(a);
    ivec4 c10 = tgBytes(a + ivec2(1, 0));
    ivec4 c01 = tgBytes(a + ivec2(0, 1));
    ivec4 c11 = tgBytes(a + ivec2(1, 1));
    float w00 = float(c00.r) * (1.0 - f.x) * (1.0 - f.y);
    float w10 = float(c10.r) * f.x * (1.0 - f.y);
    float w01 = float(c01.r) * (1.0 - f.x) * f.y;
    float w11 = float(c11.r) * f.x * f.y;
    float sum = (w00 + w10 + w01 + w11) / 255.0;
    if (sum <= 0.0) return s;
    float top = max(max(w00, w10), max(w01, w11));
    ivec4 own = top == w00 ? c00 : top == w10 ? c10 : top == w01 ? c01 : c11;
    if (own.g == 0) return s;
    s.kind = own.g - 1;
    s.season = own.a;
    bool hard = tgBytes(ivec2(0, u_treeRow + s.kind * TG_KIND_ROWS + 4)).g > 0;
    s.level = sum * soil.gain + (tgCover(q) - 0.5) * (hard ? TG_RAG * TG_HARD_RAG : TG_RAG);
    return s;
}

float tgMossNoise(vec2 p) {
    return valueNoise(p * vec2(0.085, 0.11), 131) * 0.62 + valueNoise(p * 0.29, 137) * 0.38;
}

bool tgBed(TgKind k, ivec2 q, float level, TgSoil soil, int season, bool under, vec3 base, bool based, out vec3 c) {
    vec2 x = vec2(q);
    int sh = tgSoilShade(q);
    bool core = tgOn(k, TG_CORE_ON) && level > TG_CORE + 0.05;
    if (k.remap && based && !core) {
        if (!soil.grassy) return false;
        int n = k.bedN - 1;
        c = tgRamp(k, 0, 0, k.bedN, clamp(int(floor((dot(base, TG_LUM) - 0.16) / 0.36 * float(n) + 0.5)), 1, n));
        return true;
    }
    int idx = k.bedN - 3 + sh;
    if (level > TG_CORE) idx -= 1;
    c = core ? tgRamp(k, 0, TG_HALF, k.coreN, k.coreN - 4 + sh) : tgRamp(k, 0, 0, k.bedN, idx);
    bool fall = season == TG_AUTUMN && tgOn(k, TG_FALL_ON);
    if (fall && sh >= 1 && hash(q.x >> 1, q.y >> 1, 91) < k.carpet + 0.3)
        c = tgRamp(k, 2, 0, k.fallN, sh >= 2 ? 3 : 2);
    if (tgOn(k, TG_HERB_ON)) {
        float amount = k.herb * (soil.dry ? 0.5 : soil.grassy ? 1.0 : 0.82)
            * clamp((TG_CORE + 0.06 - level) / (TG_CORE - TG_BED), 0.0, 1.0) * (fall ? 0.5 : 1.0);
        float span = (tgCover(q + ivec2(613, 271)) - 0.2) / 0.6;
        if (span < amount) {
            vec3 g = tgRamp(k, 1, 0, k.herbN, k.herbN - 4 - k.herbLow + tgGrassShade(q));
            c = span > amount - 0.03 ? darken(g, 0.7) : g;
            return true;
        }
        if ((tgCover(q + ivec2(613, 271 - int(TG_LIP))) - 0.2) / 0.6 < amount) c = darken(c, 0.68);
    }
    if (tgOn(k, TG_MOSS_ON) && level > TG_BED + 0.1) {
        float m = tgMossNoise(x);
        float thr = 0.74 - k.moss * 0.16 - (level - TG_BED) * 0.26;
        if (m > thr) {
            int mi = k.mossBase + (m > thr + 0.07 ? 1 : 0) + (sh > 0 ? 1 : 0);
            if (tgMossNoise(x + vec2(0.0, 2.0)) <= thr) mi -= 2;
            c = tgRamp(k, 2, TG_HALF, k.mossN, mi);
        }
    }
    if (tgOn(k, TG_CRACK_ON)) {
        float cr = abs(valueNoise(x * 0.06, 141) - 0.5) + (valueNoise(x * 0.3, 143) - 0.5) * 0.06;
        if (cr < 0.013)
            c = tgOn(k, TG_HOT_ON) && hash(q.x >> 2, q.y >> 2, 145) < 0.4 ? tgColour(13, k.id * TG_KIND_ROWS + 3) : tgColour(12, k.id * TG_KIND_ROWS + 3);
    }
    if (under && soil.grassy) c = darken(c, 0.68);
    return true;
}

vec3 tgTint(TgKind k, vec3 b, TgSoil soil) {
    if (k.tint == TG_WET) return b * vec3(0.72, 0.78, 0.82);
    if (k.tint == TG_HEX) return b * vec3(0.7, 0.6, 0.84);
    float l = dot(b, TG_LUM);
    if (k.tint == TG_RIME)
        return l > 0.4 ? tgFrost(5) : l > 0.3 ? tgFrost(4) : vec3(b.r * 0.7, b.g * 0.9, min(1.0, b.b * 1.05 + 26.0 / 255.0));
    if (!soil.grassy) return b * vec3(0.86, 0.84, 0.82);
    int n = k.tintN - 1;
    return tgRamp(k, 1, TG_HALF, k.tintN, clamp(int(floor((l - 0.14) / 0.4 * float(n) + 0.5)), 0, n));
}

bool tgFrozen(TgKind k, ivec2 q, float level, TgSoil soil, bool under, out vec3 c) {
    vec2 x = vec2(q);
    vec3 none = vec3(0.0);
    if (k.winter == TG_WELL || k.winter == TG_MELT) {
        bool melt = k.winter == TG_MELT;
        float edge = melt ? TG_BED - 0.16 : TG_BED;
        if (level >= TG_BED + 0.03) {
            vec3 col;
            tgBed(k, q, level, soil, TG_SUMMER, false, none, false, col);
            if (!melt && level < TG_CORE - 0.1 && tgCover(q + ivec2(37, 11)) < 0.4) {
                c = tgSnow(tgCover(q + ivec2(37, 8)) < 0.4 ? 4 : 2);
                return true;
            }
            c = under && !melt ? darken(col, 0.8) : col;
            return true;
        }
        if (level >= edge) {
            if (melt) c = tgMud(clamp(1 + tgSoilShade(q), 0, 3));
            else c = tgOn(k, TG_STAIN_ON) && valueNoise(x * 0.12, 151) > 0.5 ? vec3(226.0, 196.0, 172.0) / 255.0 : tgSnow(1);
            return true;
        }
        if (level >= edge - 0.05) {
            c = tgSnow(melt ? 1 : 2);
            return true;
        }
        return false;
    }
    if (k.winter == TG_ICE) {
        if (level >= TG_BED) {
            float cr = abs(valueNoise(x * 0.09, 93) - 0.5) + (valueNoise(x * 0.4, 94) - 0.5) * 0.04;
            float t = valueNoise(x * vec2(0.07, 0.1), 161);
            c = cr < 0.012 ? tgSnow(4) : level > TG_CORE ? tgFrost(3) : t > 0.62 ? tgIce(2) : t > 0.38 ? tgIce(1) : tgFrost(4);
            return true;
        }
        if (level >= TG_BED - 0.05) {
            c = tgSnow(1);
            return true;
        }
        return false;
    }
    if (level >= TG_CORE + 0.03) {
        vec3 col;
        tgBed(k, q, level, soil, TG_SUMMER, false, none, false, col);
        c = darken(col, 0.9);
        return true;
    }
    if (level >= TG_CORE - 0.02) {
        c = tgSnow(1);
        return true;
    }
    if (level >= TG_BED) {
        float m = tgMossNoise(x);
        vec3 glow = tgColour(14, k.id * TG_KIND_ROWS + 3);
        if (tgOn(k, TG_GLOW_ON) && m > 0.5) c = m > 0.6 ? glow : glow * 0.5 + vec3(118.0, 121.0, 124.0) / 255.0;
        else if (tgOn(k, TG_STAIN_ON) && m > 0.52) c = tgRamp(k, 3, 0, k.stainN, m > 0.6 ? 3 : 4);
        else c = tgSnow(tgCover(q + ivec2(19, 5)) > 0.56 ? 2 : 3);
        return true;
    }
    if (level >= TG_BED - 0.04) {
        c = tgSnow(2);
        return true;
    }
    return false;
}

int tgShapePixel(int shape, int pick, ivec2 d) {
    int base = (shape * 5 + pick) * TG_SHAPE_SLOTS;
    int size = TG_SHAPE_SIZE[shape * 5 + pick];
    for (int i = 0; i < TG_SHAPE_SLOTS; i++) {
        if (i >= size) break;
        if (TG_SHAPES[base + i] == d) return i;
    }
    return -1;
}

bool tgFleck(TgKind k, ivec2 q, float level, int season, out vec3 c) {
    if (level < 0.12) return false;
    bool fall = season == TG_AUTUMN && tgOn(k, TG_FALL_ON);
    float carpet = fall ? k.carpet : 0.0;
    float dens = level >= TG_BED ? k.fleckBed * (1.0 + carpet * 3.2)
        : level >= TG_BED - (fall ? 0.34 : 0.14) ? k.fleckOut + carpet * 0.42 : 0.0;
    if (season == TG_WINTER)
        dens = k.winter == TG_BURIED ? (level >= TG_BED ? k.fleckBed * 0.3 : 0.0)
            : k.winter == TG_ICE ? (level >= TG_BED ? k.fleckBed : 0.0)
            : (level >= TG_BED + 0.03 ? k.fleckBed : 0.0);
    if (dens <= 0.0) return false;
    ivec2 lo = ivec2(floor(vec2(q - ivec2(3, 2)) / float(TG_FLECK)));
    ivec2 hi = ivec2(floor(vec2(q + ivec2(1, 2)) / float(TG_FLECK)));
    for (int cy = hi.y; cy >= lo.y; cy--)
        for (int cx = hi.x; cx >= lo.x; cx--) {
            if (hash(cx, cy, 175) >= dens) continue;
            ivec2 at = ivec2(cx, cy) * TG_FLECK + ivec2(int(hash(cx, cy, 171) * float(TG_FLECK)), int(hash(cx, cy, 173) * float(TG_FLECK)));
            int count = TG_SHAPE_COUNT[k.shape];
            int n = tgShapePixel(k.shape, int(hash(cx, cy, 177) * float(count)), q - at);
            if (n < 0) continue;
            int pick = int(hash(cx, cy, 179) * 3.0);
            c = fall ? tgRamp(k, 2, 0, k.fallN, 4 - pick) : tgColour(TG_HALF + pick % max(k.fleckN, 1), k.id * TG_KIND_ROWS + 3);
            if (n > 0 && k.shape == TG_LEAF) c = darken(c, 0.72);
            return true;
        }
    return false;
}

vec3 treeGroundOver(vec3 base, vec2 p, vec2 w, uint ground) {
    if (!tgNear(p)) return base;
    ivec2 q = ivec2(p);
    TgSoil soil = tgSoil(ground);
    TgSpot s = tgSpot(w, q, soil);
    if (s.kind < 0 || s.season == TG_WINTER) return base;
    TgKind k = tgKind(s.kind);
    vec3 c = base;
    float level = s.level;
    if (level >= TG_BED) {
        bool under = tgSpot(w - vec2(0.0, TG_LIP), q - ivec2(0, int(TG_LIP)), soil).level < TG_BED;
        vec3 bed;
        if (tgBed(k, q, level, soil, s.season, under, base, true, bed)) c = bed;
    } else if (level > 0.0 && level >= TG_BED - TG_RIM && soil.grassy) c = base * vec3(0.72, 0.72, 0.76);
    else if (level > 0.0 && k.tint > 0 && level >= TG_BED - k.reach) c = tgTint(k, base, soil);
    vec3 fleck;
    if (tgFleck(k, q, level, s.season, fleck)) c = fleck;
    return c;
}

bool treeGroundWinter(vec2 p, vec2 w, uint ground, out vec3 c) {
    if (!tgNear(p)) return false;
    ivec2 q = ivec2(p);
    TgSoil soil = tgSoil(ground);
    TgSpot s = tgSpot(w, q, soil);
    if (s.kind < 0 || s.season != TG_WINTER || s.level <= 0.0) return false;
    TgKind k = tgKind(s.kind);
    bool under = s.level >= TG_BED && tgSpot(w - vec2(0.0, TG_LIP), q - ivec2(0, int(TG_LIP)), soil).level < TG_BED;
    bool hit = tgFrozen(k, q, s.level, soil, under, c);
    vec3 fleck;
    if (tgFleck(k, q, s.level, s.season, fleck)) {
        c = fleck;
        hit = true;
    }
    return hit;
}
