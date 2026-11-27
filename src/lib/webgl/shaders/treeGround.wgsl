const TG_BED: f32 = 0.5;
const TG_CORE: f32 = 0.86;
const TG_RAG: f32 = 0.56;
const TG_HARD_RAG: f32 = 0.72;
const TG_RIM: f32 = 0.035;
const TG_LIP: f32 = 3.0;
const TG_KIND_ROWS: i32 = 5;
const TG_HALF: i32 = 8;
const TG_FLECK: i32 = 6;
const TG_SUMMER: i32 = 0;
const TG_AUTUMN: i32 = 1;
const TG_WINTER: i32 = 2;
const TG_BURIED: i32 = 0;
const TG_WELL: i32 = 1;
const TG_MELT: i32 = 2;
const TG_ICE: i32 = 3;
const TG_WET: i32 = 1;
const TG_HEX: i32 = 2;
const TG_RIME: i32 = 3;
const TG_LEAF: i32 = 0;
const TG_CORE_ON: i32 = 1;
const TG_HERB_ON: i32 = 2;
const TG_FALL_ON: i32 = 4;
const TG_MOSS_ON: i32 = 8;
const TG_CRACK_ON: i32 = 16;
const TG_HOT_ON: i32 = 32;
const TG_GLOW_ON: i32 = 64;
const TG_STAIN_ON: i32 = 128;
const TG_GRASSY: i32 = 1;
const TG_DRY: i32 = 2;
const TG_LUM: vec3f = vec3f(0.3, 0.59, 0.11);

const TG_SHAPE_SLOTS: i32 = 5;
const TG_SHAPE_COUNT = array<i32, 3>(5, 5, 4);
const TG_SHAPE_SIZE = array<i32, 15>(2, 2, 2, 3, 2, 3, 4, 3, 3, 3, 1, 1, 2, 5, 0);
const TG_SHAPES = array<vec2i, 75>(
    vec2i(0, 0), vec2i(1, 0), vec2i(0), vec2i(0), vec2i(0),
    vec2i(0, 0), vec2i(0, 1), vec2i(0), vec2i(0), vec2i(0),
    vec2i(0, 0), vec2i(1, 1), vec2i(0), vec2i(0), vec2i(0),
    vec2i(0, 0), vec2i(1, 0), vec2i(1, 1), vec2i(0), vec2i(0),
    vec2i(0, 0), vec2i(-1, 1), vec2i(0), vec2i(0), vec2i(0),
    vec2i(0, 0), vec2i(1, -1), vec2i(2, -2), vec2i(0), vec2i(0),
    vec2i(0, 0), vec2i(1, 0), vec2i(2, 0), vec2i(3, 0), vec2i(0),
    vec2i(0, 0), vec2i(1, 1), vec2i(2, 2), vec2i(0), vec2i(0),
    vec2i(0, 0), vec2i(1, 0), vec2i(2, -1), vec2i(0), vec2i(0),
    vec2i(0, 0), vec2i(0, 1), vec2i(1, 2), vec2i(0), vec2i(0),
    vec2i(0, 0), vec2i(0), vec2i(0), vec2i(0), vec2i(0),
    vec2i(0, 0), vec2i(0), vec2i(0), vec2i(0), vec2i(0),
    vec2i(0, 0), vec2i(1, 0), vec2i(0), vec2i(0), vec2i(0),
    vec2i(0, 0), vec2i(0, -1), vec2i(0, 1), vec2i(-1, 0), vec2i(1, 0),
    vec2i(0), vec2i(0), vec2i(0), vec2i(0), vec2i(0));

struct TgKind {
    id: i32,
    gain: f32,
    hard: bool,
    remap: bool,
    winter: i32,
    tint: i32,
    reach: f32,
    herb: f32,
    herbLow: i32,
    shape: i32,
    fleckBed: f32,
    fleckOut: f32,
    carpet: f32,
    moss: f32,
    mossBase: i32,
    flags: i32,
    bedN: i32,
    coreN: i32,
    herbN: i32,
    tintN: i32,
    fallN: i32,
    mossN: i32,
    stainN: i32,
    fleckN: i32,
}

struct TgSoil {
    gain: f32,
    grassy: bool,
    dry: bool,
}

struct TgSpot {
    level: f32,
    kind: i32,
    season: i32,
}

fn tgBytes(at: vec2i) -> vec4i {
    return vec4i(textureLoad(u_trees, at, 0) * 255.0 + 0.5);
}

fn tgColour(x: i32, row: i32) -> vec3f {
    return textureLoad(u_trees, vec2i(x, groundFrame.u_treeRow + row), 0).rgb;
}

fn tgRamp(k: TgKind, row: i32, off: i32, n: i32, i: i32) -> vec3f {
    return tgColour(off + clamp(i, 0, max(n - 1, 0)), k.id * TG_KIND_ROWS + row);
}

fn tgShared(row: i32, off: i32, i: i32, n: i32) -> vec3f {
    return tgColour(off + clamp(i, 0, n - 1), groundStatic.u_treeKinds * TG_KIND_ROWS + row);
}

fn tgSnow(i: i32) -> vec3f { return tgShared(0, 0, i, 5); }
fn tgFrost(i: i32) -> vec3f { return tgShared(0, TG_HALF, i, 6); }
fn tgMud(i: i32) -> vec3f { return tgShared(1, 0, i, 6); }
fn tgIce(i: i32) -> vec3f { return tgShared(1, TG_HALF, i, 4); }

fn tgSoil(ground: u32) -> TgSoil {
    let b = tgBytes(vec2i(i32(ground), groundFrame.u_treeRow + groundStatic.u_treeKinds * TG_KIND_ROWS + 2));
    return TgSoil(f32(b.r) / 255.0, (b.g & TG_GRASSY) != 0, (b.g & TG_DRY) != 0);
}

fn tgKind(id: i32) -> TgKind {
    let row = groundFrame.u_treeRow + id * TG_KIND_ROWS + 4;
    let p0 = tgBytes(vec2i(0, row));
    let p1 = tgBytes(vec2i(1, row));
    let p2 = tgBytes(vec2i(2, row));
    let p3 = tgBytes(vec2i(3, row));
    let p4 = tgBytes(vec2i(4, row));
    let p5 = tgBytes(vec2i(5, row));
    let p6 = tgBytes(vec2i(6, row));
    let p7 = tgBytes(vec2i(7, row));
    return TgKind(id, f32(p0.r) / 127.5, p0.g > 0, p0.b > 0, p1.r, p1.g, f32(p1.b) / 255.0,
        f32(p2.r) / 255.0, p2.g, p2.b, f32(p3.r) / 255.0, f32(p3.g) / 255.0, f32(p3.b) / 255.0,
        f32(p4.r) / 255.0, p4.g, p4.b, p5.r, p5.g, p5.b, p6.r, p6.g, p6.b, p7.r, p7.g);
}

fn tgOn(k: TgKind, flag: i32) -> bool {
    return (k.flags & flag) != 0;
}

fn tgSoilShade(q: vec2i) -> i32 {
    return (fieldAt(q).r & SHADE_MASK) - 3;
}

fn tgGrassShade(q: vec2i) -> i32 {
    return ((fieldAt(q + groundStatic.u_grassShift).r >> SHADE_BITS) & SHADE_MASK) - 3;
}

fn tgCover(q: vec2i) -> f32 {
    return f32(fieldAt(q).g) / 255.0;
}

fn tgNear(p: vec2f) -> bool {
    if (groundFrame.u_treeRow <= 0) {
        return false;
    }
    let t = clamp(vec2i(floor(p / groundStatic.u_tileArt)), vec2i(0), groundFrame.u_mapSize - 1);
    return tgBytes(t).b > 0;
}

fn tgSpot(w: vec2f, q: vec2i, soil: TgSoil) -> TgSpot {
    var s = TgSpot(-1.0, -1, 0);
    if (soil.gain <= 0.0) {
        return s;
    }
    let g = w / groundStatic.u_tileArt - 0.5;
    let a = clamp(vec2i(floor(g)), vec2i(0), groundFrame.u_mapSize - 2);
    let f = clamp(g - vec2f(a), vec2f(0.0), vec2f(1.0));
    let c00 = tgBytes(a);
    let c10 = tgBytes(a + vec2i(1, 0));
    let c01 = tgBytes(a + vec2i(0, 1));
    let c11 = tgBytes(a + vec2i(1, 1));
    let w00 = f32(c00.r) * (1.0 - f.x) * (1.0 - f.y);
    let w10 = f32(c10.r) * f.x * (1.0 - f.y);
    let w01 = f32(c01.r) * (1.0 - f.x) * f.y;
    let w11 = f32(c11.r) * f.x * f.y;
    let sum = (w00 + w10 + w01 + w11) / 255.0;
    if (sum <= 0.0) {
        return s;
    }
    let top = max(max(w00, w10), max(w01, w11));
    var own = c11;
    if (top == w00) {
        own = c00;
    } else if (top == w10) {
        own = c10;
    } else if (top == w01) {
        own = c01;
    }
    if (own.g == 0) {
        return s;
    }
    s.kind = own.g - 1;
    s.season = own.a;
    let hard = tgBytes(vec2i(0, groundFrame.u_treeRow + s.kind * TG_KIND_ROWS + 4)).g > 0;
    s.level = sum * soil.gain + (tgCover(q) - 0.5) * select(TG_RAG, TG_RAG * TG_HARD_RAG, hard);
    return s;
}

fn tgMossNoise(p: vec2f) -> f32 {
    return valueNoise(p * vec2f(0.085, 0.11), 131) * 0.62 + valueNoise(p * 0.29, 137) * 0.38;
}

fn tgBed(k: TgKind, q: vec2i, level: f32, soil: TgSoil, season: i32, under: bool, base: vec3f, based: bool, c: ptr<function, vec3f>) -> bool {
    let x = vec2f(q);
    let sh = tgSoilShade(q);
    let core = tgOn(k, TG_CORE_ON) && level > TG_CORE + 0.05;
    if (k.remap && based && !core) {
        if (!soil.grassy) {
            return false;
        }
        let n = k.bedN - 1;
        *c = tgRamp(k, 0, 0, k.bedN, clamp(i32(floor((dot(base, TG_LUM) - 0.16) / 0.36 * f32(n) + 0.5)), 1, n));
        return true;
    }
    var idx = k.bedN - 3 + sh;
    if (level > TG_CORE) {
        idx -= 1;
    }
    if (core) {
        *c = tgRamp(k, 0, TG_HALF, k.coreN, k.coreN - 4 + sh);
    } else {
        *c = tgRamp(k, 0, 0, k.bedN, idx);
    }
    let fall = season == TG_AUTUMN && tgOn(k, TG_FALL_ON);
    if (fall && sh >= 1 && hash(q.x >> 1u, q.y >> 1u, 91) < k.carpet + 0.3) {
        *c = tgRamp(k, 2, 0, k.fallN, select(2, 3, sh >= 2));
    }
    if (tgOn(k, TG_HERB_ON)) {
        let amount = k.herb * select(select(0.82, 1.0, soil.grassy), 0.5, soil.dry)
            * clamp((TG_CORE + 0.06 - level) / (TG_CORE - TG_BED), 0.0, 1.0) * select(1.0, 0.5, fall);
        let span = (tgCover(q + vec2i(613, 271)) - 0.2) / 0.6;
        if (span < amount) {
            let g = tgRamp(k, 1, 0, k.herbN, k.herbN - 4 - k.herbLow + tgGrassShade(q));
            *c = select(g, darken(g, 0.7), span > amount - 0.03);
            return true;
        }
        if ((tgCover(q + vec2i(613, 271 - i32(TG_LIP))) - 0.2) / 0.6 < amount) {
            *c = darken(*c, 0.68);
        }
    }
    if (tgOn(k, TG_MOSS_ON) && level > TG_BED + 0.1) {
        let m = tgMossNoise(x);
        let thr = 0.74 - k.moss * 0.16 - (level - TG_BED) * 0.26;
        if (m > thr) {
            var mi = k.mossBase + select(0, 1, m > thr + 0.07) + select(0, 1, sh > 0);
            if (tgMossNoise(x + vec2f(0.0, 2.0)) <= thr) {
                mi -= 2;
            }
            *c = tgRamp(k, 2, TG_HALF, k.mossN, mi);
        }
    }
    if (tgOn(k, TG_CRACK_ON)) {
        let cr = abs(valueNoise(x * 0.06, 141) - 0.5) + (valueNoise(x * 0.3, 143) - 0.5) * 0.06;
        if (cr < 0.013) {
            if (tgOn(k, TG_HOT_ON) && hash(q.x >> 2u, q.y >> 2u, 145) < 0.4) {
                *c = tgColour(13, k.id * TG_KIND_ROWS + 3);
            } else {
                *c = tgColour(12, k.id * TG_KIND_ROWS + 3);
            }
        }
    }
    if (under && soil.grassy) {
        *c = darken(*c, 0.68);
    }
    return true;
}

fn tgTint(k: TgKind, b: vec3f, soil: TgSoil) -> vec3f {
    if (k.tint == TG_WET) {
        return b * vec3f(0.72, 0.78, 0.82);
    }
    if (k.tint == TG_HEX) {
        return b * vec3f(0.7, 0.6, 0.84);
    }
    let l = dot(b, TG_LUM);
    if (k.tint == TG_RIME) {
        if (l > 0.4) {
            return tgFrost(5);
        }
        if (l > 0.3) {
            return tgFrost(4);
        }
        return vec3f(b.r * 0.7, b.g * 0.9, min(1.0, b.b * 1.05 + 26.0 / 255.0));
    }
    if (!soil.grassy) {
        return b * vec3f(0.86, 0.84, 0.82);
    }
    let n = k.tintN - 1;
    return tgRamp(k, 1, TG_HALF, k.tintN, clamp(i32(floor((l - 0.14) / 0.4 * f32(n) + 0.5)), 0, n));
}

fn tgFrozen(k: TgKind, q: vec2i, level: f32, soil: TgSoil, under: bool, c: ptr<function, vec3f>) -> bool {
    let x = vec2f(q);
    let none = vec3f(0.0);
    if (k.winter == TG_WELL || k.winter == TG_MELT) {
        let melt = k.winter == TG_MELT;
        let edge = select(TG_BED, TG_BED - 0.16, melt);
        if (level >= TG_BED + 0.03) {
            var col: vec3f;
            tgBed(k, q, level, soil, TG_SUMMER, false, none, false, &col);
            if (!melt && level < TG_CORE - 0.1 && tgCover(q + vec2i(37, 11)) < 0.4) {
                *c = tgSnow(select(2, 4, tgCover(q + vec2i(37, 8)) < 0.4));
                return true;
            }
            *c = select(col, darken(col, 0.8), under && !melt);
            return true;
        }
        if (level >= edge) {
            if (melt) {
                *c = tgMud(clamp(1 + tgSoilShade(q), 0, 3));
            } else if (tgOn(k, TG_STAIN_ON) && valueNoise(x * 0.12, 151) > 0.5) {
                *c = vec3f(226.0, 196.0, 172.0) / 255.0;
            } else {
                *c = tgSnow(1);
            }
            return true;
        }
        if (level >= edge - 0.05) {
            *c = tgSnow(select(2, 1, melt));
            return true;
        }
        return false;
    }
    if (k.winter == TG_ICE) {
        if (level >= TG_BED) {
            let cr = abs(valueNoise(x * 0.09, 93) - 0.5) + (valueNoise(x * 0.4, 94) - 0.5) * 0.04;
            let t = valueNoise(x * vec2f(0.07, 0.1), 161);
            if (cr < 0.012) {
                *c = tgSnow(4);
            } else if (level > TG_CORE) {
                *c = tgFrost(3);
            } else if (t > 0.62) {
                *c = tgIce(2);
            } else if (t > 0.38) {
                *c = tgIce(1);
            } else {
                *c = tgFrost(4);
            }
            return true;
        }
        if (level >= TG_BED - 0.05) {
            *c = tgSnow(1);
            return true;
        }
        return false;
    }
    if (level >= TG_CORE + 0.03) {
        var col: vec3f;
        tgBed(k, q, level, soil, TG_SUMMER, false, none, false, &col);
        *c = darken(col, 0.9);
        return true;
    }
    if (level >= TG_CORE - 0.02) {
        *c = tgSnow(1);
        return true;
    }
    if (level >= TG_BED) {
        let m = tgMossNoise(x);
        let glow = tgColour(14, k.id * TG_KIND_ROWS + 3);
        if (tgOn(k, TG_GLOW_ON) && m > 0.5) {
            *c = select(glow * 0.5 + vec3f(118.0, 121.0, 124.0) / 255.0, glow, m > 0.6);
        } else if (tgOn(k, TG_STAIN_ON) && m > 0.52) {
            *c = tgRamp(k, 3, 0, k.stainN, select(4, 3, m > 0.6));
        } else {
            *c = tgSnow(select(3, 2, tgCover(q + vec2i(19, 5)) > 0.56));
        }
        return true;
    }
    if (level >= TG_BED - 0.04) {
        *c = tgSnow(2);
        return true;
    }
    return false;
}

fn tgShapePixel(shape: i32, pick: i32, d: vec2i) -> i32 {
    let base = (shape * 5 + pick) * TG_SHAPE_SLOTS;
    let size = TG_SHAPE_SIZE[shape * 5 + pick];
    for (var i = 0; i < TG_SHAPE_SLOTS; i++) {
        if (i >= size) {
            break;
        }
        if (all(TG_SHAPES[base + i] == d)) {
            return i;
        }
    }
    return -1;
}

fn tgFleck(k: TgKind, q: vec2i, level: f32, season: i32, c: ptr<function, vec3f>) -> bool {
    if (level < 0.12) {
        return false;
    }
    let fall = season == TG_AUTUMN && tgOn(k, TG_FALL_ON);
    let carpet = select(0.0, k.carpet, fall);
    var dens = 0.0;
    if (level >= TG_BED) {
        dens = k.fleckBed * (1.0 + carpet * 3.2);
    } else if (level >= TG_BED - select(0.14, 0.34, fall)) {
        dens = k.fleckOut + carpet * 0.42;
    }
    if (season == TG_WINTER) {
        if (k.winter == TG_BURIED) {
            dens = select(0.0, k.fleckBed * 0.3, level >= TG_BED);
        } else if (k.winter == TG_ICE) {
            dens = select(0.0, k.fleckBed, level >= TG_BED);
        } else {
            dens = select(0.0, k.fleckBed, level >= TG_BED + 0.03);
        }
    }
    if (dens <= 0.0) {
        return false;
    }
    let lo = vec2i(floor(vec2f(q - vec2i(3, 2)) / f32(TG_FLECK)));
    let hi = vec2i(floor(vec2f(q + vec2i(1, 2)) / f32(TG_FLECK)));
    for (var cy = hi.y; cy >= lo.y; cy--) {
        for (var cx = hi.x; cx >= lo.x; cx--) {
            if (hash(cx, cy, 175) >= dens) {
                continue;
            }
            let at = vec2i(cx, cy) * TG_FLECK + vec2i(i32(hash(cx, cy, 171) * f32(TG_FLECK)), i32(hash(cx, cy, 173) * f32(TG_FLECK)));
            let count = TG_SHAPE_COUNT[k.shape];
            let n = tgShapePixel(k.shape, i32(hash(cx, cy, 177) * f32(count)), q - at);
            if (n < 0) {
                continue;
            }
            let pick = i32(hash(cx, cy, 179) * 3.0);
            if (fall) {
                *c = tgRamp(k, 2, 0, k.fallN, 4 - pick);
            } else {
                *c = tgColour(TG_HALF + pick % max(k.fleckN, 1), k.id * TG_KIND_ROWS + 3);
            }
            if (n > 0 && k.shape == TG_LEAF) {
                *c = darken(*c, 0.72);
            }
            return true;
        }
    }
    return false;
}

fn treeGroundOver(base: vec3f, p: vec2f, w: vec2f, ground: u32) -> vec3f {
    if (!tgNear(p)) {
        return base;
    }
    let q = vec2i(p);
    let soil = tgSoil(ground);
    let s = tgSpot(w, q, soil);
    if (s.kind < 0 || s.season == TG_WINTER) {
        return base;
    }
    let k = tgKind(s.kind);
    var c = base;
    let level = s.level;
    if (level >= TG_BED) {
        let under = tgSpot(w - vec2f(0.0, TG_LIP), q - vec2i(0, i32(TG_LIP)), soil).level < TG_BED;
        var bed: vec3f;
        if (tgBed(k, q, level, soil, s.season, under, base, true, &bed)) {
            c = bed;
        }
    } else if (level > 0.0 && level >= TG_BED - TG_RIM && soil.grassy) {
        c = base * vec3f(0.72, 0.72, 0.76);
    } else if (level > 0.0 && k.tint > 0 && level >= TG_BED - k.reach) {
        c = tgTint(k, base, soil);
    }
    var fleck: vec3f;
    if (tgFleck(k, q, level, s.season, &fleck)) {
        c = fleck;
    }
    return c;
}

fn treeGroundWinter(p: vec2f, w: vec2f, ground: u32, c: ptr<function, vec3f>) -> bool {
    if (!tgNear(p)) {
        return false;
    }
    let q = vec2i(p);
    let soil = tgSoil(ground);
    let s = tgSpot(w, q, soil);
    if (s.kind < 0 || s.season != TG_WINTER || s.level <= 0.0) {
        return false;
    }
    let k = tgKind(s.kind);
    let under = s.level >= TG_BED && tgSpot(w - vec2f(0.0, TG_LIP), q - vec2i(0, i32(TG_LIP)), soil).level < TG_BED;
    var hit = tgFrozen(k, q, s.level, soil, under, c);
    var fleck: vec3f;
    if (tgFleck(k, q, s.level, s.season, &fleck)) {
        *c = fleck;
        hit = true;
    }
    return hit;
}
