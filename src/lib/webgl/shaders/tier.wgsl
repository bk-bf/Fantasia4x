const CORNERS = array<vec2f, 6>(vec2f(0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(1.0), vec2f(0.0, 1.0));
const TIER_REACH: u32 = 8u;
const STEP: i32 = 24;
const TOP_TIER: i32 = 4;
const RAMP_TOP: i32 = 6;
const JAG: f32 = 0.4;
const TIER_TONE: f32 = 0.045;
const LIP: i32 = 3;
const SHADE_TONE: f32 = 0.2;
const SUN = vec2f(-0.958, -0.287);
const SUN_SAMPLES: i32 = 5;
const SUN_STRIDE: f32 = 4.0;
const SUN_RISE: f32 = 1.1;
const SUN_SOFT: f32 = 4.0;
const FACE_SPAN: f32 = 1.25;
const FACE_LOW: f32 = 0.75;
const FACE_KEY: f32 = 0.4;
const FACE_FALL: f32 = 0.24;
const FACE_LIP: f32 = 0.2;
const FACE_SCALE: f32 = 0.8;
const FACE_DITHER: f32 = 0.3;
const FACE_LIT: f32 = 1.14;
const FACE_DARK: f32 = 0.72;
const FACE_FOOT: f32 = 0.6;

struct TierOut {
    @builtin(position) position: vec4f,
    @location(0) art: vec2f,
}

struct TierPixel {
    @location(0) color: vec4f,
    @builtin(frag_depth) depth: f32,
}

@vertex
fn vs(@builtin(vertex_index) index: u32) -> TierOut {
    let art = mix(tierFrame.u_rect.xy, tierFrame.u_rect.zw, CORNERS[index]);
    let base = art / tierFrame.u_atlasScale;
    var out: TierOut;
    out.position = view.u_projection * vec4f((base - view.u_viewOffset) * view.u_zoom, 0.0, 1.0);
    out.art = art;
    return out;
}

fn fieldAt(p: vec2i) -> vec4f {
    let size = vec2f(textureDimensions(u_tierFieldTexture, 0)) * f32(VEIN_TILE);
    return textureSampleLevel(u_tierFieldTexture, linearSampler, (vec2f(p) + 0.5) / size, 0.0);
}

fn levelAt(p: vec2i) -> i32 {
    let f = fieldAt(p);
    let cut = 0.5 - (tierNoise(p).r - 0.5) * JAG;
    if (f.r <= cut) { return 0; }
    if (f.g <= cut) { return 1; }
    if (f.b <= cut) { return 2; }
    if (f.a <= cut) { return 3; }
    return TOP_TIER;
}

fn shadowAt(src: vec2i, level: i32) -> f32 {
    var dark = 0.0;
    let base = f32(level * STEP);
    for (var i = 1; i <= SUN_SAMPLES; i++) {
        let d = f32(i) * SUN_STRIDE;
        let q = src + vec2i(floor(SUN * d + 0.5));
        let over = f32(levelAt(q) * STEP) - (base + d * SUN_RISE);
        if (over > 0.0) {
            dark = max(dark, min(1.0, over / SUN_SOFT));
        }
    }
    return dark;
}

fn rampAt(ramp: vec2f, k: i32) -> vec3f {
    return textureLoad(u_paintAtlas, vec2i(ramp) + vec2i(clamp(k, 0, RAMP_TOP), 0), 0).rgb;
}

fn face(p: vec2i, src: vec2i, level: i32, k: i32, span: i32) -> vec3f {
    var t = FACE_KEY - f32(k) / f32(span) * FACE_FALL + tierNoise(p).g * FACE_SPAN - FACE_LOW;
    if (k == 1) {
        t += FACE_LIP;
    }
    let i = i32(floor(clamp(t * FACE_SCALE, 0.0, 1.0) * f32(RAMP_TOP) + 0.5 + (bayer(p) - 0.5) * FACE_DITHER));
    var c = rampAt(tierFrame.u_rockRamp, i);
    if (levelAt(src - vec2i(1, 0)) < level) {
        c = min(c * FACE_LIT, vec3f(1.0));
    } else if (levelAt(src + vec2i(1, 0)) < level) {
        c = vec3f(c.rg * FACE_DARK, c.b * (FACE_DARK + 0.1));
    }
    if (k == span - 1) {
        c = vec3f(c.rg * FACE_FOOT, c.b * (FACE_FOOT + 0.1));
    }
    return c;
}

fn ledge(src: vec2i, level: i32, shadow: f32) -> vec3f {
    let up = levelAt(src - vec2i(0, 1)) < level;
    let left = levelAt(src - vec2i(1, 0)) < level;
    let right = levelAt(src + vec2i(1, 0)) < level;
    let rim = select(select(0, 2, right), 1, up || left);
    let lip = levelAt(src - vec2i(0, LIP)) < level || levelAt(src - vec2i(LIP, 0)) < level;
    let shade = rockShade(rim, src);
    if (snowLies(src, level, rim, lip, tierFrame.u_snow)) {
        return snowOn(src, shade, rim, shadow, tierFrame.u_snowRamp);
    }
    let lift = (f32(level) * TIER_TONE - shadow * SHADE_TONE) * f32(RAMP_TOP);
    let rock = rampAt(tierFrame.u_rockRamp, shade + i32(floor(lift + tierNoise(src).a)));
    let tile = tileOf(src);
    let info = tierTile(tile);
    if (info.g == 0u) {
        return rock;
    }
    let at = vec2f(src) + 0.5;
    return vein(rock, at, at, false, vec4f(f32(info.g - 1u), f32(info.b), vec2f(tile)), f32(info.a));
}

@fragment
fn fs(frag: TierOut) -> TierPixel {
    let p = vec2i(floor(frag.art));
    if ((tierTile(tileOf(p)).r & TIER_REACH) == 0u || underCut(p, tierFrame.u_rockLift)) {
        discard;
    }
    let ground = p.y + i32(tierFrame.u_rockLift + 0.5);
    var y = ground;
    var level = -1;
    for (var band = TOP_TIER; band >= 1 && level < 0; band--) {
        var hi = ground + STEP * band;
        let at = levelAt(vec2i(p.x, hi));
        if (at >= band) {
            y = hi;
            level = at;
            break;
        }
        var lo = ground + STEP * (band - 1) + 1;
        var low = levelAt(vec2i(p.x, lo));
        if (low < band) {
            continue;
        }
        while (hi - lo > 1) {
            let mid = (lo + hi) / 2;
            let m = levelAt(vec2i(p.x, mid));
            if (m >= band) {
                lo = mid;
                low = m;
            } else {
                hi = mid;
            }
        }
        y = lo;
        level = low;
    }
    if (level < 0) {
        level = levelAt(vec2i(p.x, ground));
    }
    let src = vec2i(p.x, y);
    let k = ground - y + STEP * level;
    var rock: vec3f;
    if (k > 0) {
        let south = levelAt(src + vec2i(0, 1));
        rock = face(p, src, level, k, 1 + STEP * max(level - south, 0));
    } else {
        if (level == 0) {
            discard;
        }
        rock = ledge(src, level, shadowAt(src, level));
    }
    var light = min(tierFrame.u_ambient, vec3f(1.6));
    if (tierFrame.u_fieldLit > 0.5) {
        light = textureLoad(u_lightTexture, vec2i(frag.position.xy), 0).rgb * 2.0;
    }
    return TierPixel(vec4f(weathered(rock * light, tierFrame.u_saturation, tierFrame.u_brightness), 1.0), 0.5 - 0.5 * f32(y) / tierFrame.u_rowPx * tierFrame.u_rowDepth);
}
