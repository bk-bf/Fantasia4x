const VEIN_EDGE: i32 = 4;
const VEIN_TILE: i32 = 32;
const VEIN_SCORE: f32 = 2.6;
const VEIN_KEEP: f32 = 1.412;
const VEIN_THIN: f32 = 0.48;
const VEIN_REACH: i32 = 8;
const VEIN_CLEAR: f32 = 4.0;
const VEIN_FADE: f32 = 6.0;
const TIER_ROOF: u32 = 2u;
const TIER_NEAR: u32 = 4u;
const ROOF_CLEAR: f32 = 9.0;
const ROOF_FEATHER: f32 = 30.0;
const ROOF_WOBBLE: f32 = 12.0;
const ROOF_REACH: f32 = 45.0;
const ROOF_SALT: u32 = 4118456049u;
const UNDER_ROCK: f32 = 0.74;
const TIER_NOISE: i32 = 511;
const SNOW_TOP: i32 = 4;
const SNOW_LEVEL: f32 = 0.15;
const SNOW_LIP: f32 = 0.28;
const SNOW_BARE: f32 = 0.22;
const SNOW_LINE: f32 = 0.66;
const SNOW_DRIFT: f32 = 2.6;
const SNOW_KEY: f32 = 0.62;
const SNOW_GRAIN: f32 = 0.8;
const SNOW_SHADE: f32 = 0.4;
const SNOW_DITHER: f32 = 0.45;

fn wrapped(q: vec2i, size: vec2i) -> vec2i {
    return (q % size + size) % size;
}

fn rockShade(rim: i32, p: vec2i) -> i32 {
    let size = vec2i(textureDimensions(u_rockTexture, 0));
    return i32(textureLoad(u_rockTexture, wrapped(p, size), 0)[rim] * 255.0 + 0.5);
}

fn veinNearBit(near: f32, bit: u32) -> bool {
    return (i32(near + 0.5) & (1 << bit)) != 0;
}

fn veinFade(at: vec2f, face: bool, near: f32) -> f32 {
    var local = at;
    var d = f32(VEIN_TILE);
    let far = f32(VEIN_TILE) - 1.0;
    if (face) {
        local.y = far * 0.5;
    }
    if (!veinNearBit(near, 0u)) { d = min(d, local.y); }
    if (!veinNearBit(near, 2u)) { d = min(d, far - local.x); }
    if (!veinNearBit(near, 4u)) { d = min(d, far - local.y); }
    if (!veinNearBit(near, 6u)) { d = min(d, local.x); }
    if (!veinNearBit(near, 1u)) { d = min(d, length(vec2f(far - local.x, local.y))); }
    if (!veinNearBit(near, 3u)) { d = min(d, length(vec2f(far - local.x, far - local.y))); }
    if (!veinNearBit(near, 5u)) { d = min(d, length(vec2f(local.x, far - local.y))); }
    if (!veinNearBit(near, 7u)) { d = min(d, length(local)); }
    return clamp((d - VEIN_CLEAR) / VEIN_FADE, 0.0, 1.0);
}

fn vein(rock: vec3f, at: vec2f, ground: vec2f, face: bool, info: vec4f, near: f32) -> vec3f {
    if (info.x < 0.0) {
        return rock;
    }
    let tile = vec2i(floor(ground)) / VEIN_TILE;
    if (any(tile != vec2i(info.zw))) {
        return rock;
    }
    let shift = vec2i(i32(info.x) * 97 + i32(info.y) * 31, i32(info.y) * 89 + i32(info.x) * 17);
    let q = vec2i(floor(at)) + shift;
    let cell = textureLoad(u_veinTexture, wrapped(q, vec2i(textureDimensions(u_veinTexture, 0))), 0);
    let packed = i32(cell.b * 255.0 + 0.5);
    let centre = ground + vec2f(f32(packed / (2 * VEIN_REACH) - VEIN_REACH), f32(packed % (2 * VEIN_REACH) - VEIN_REACH));
    let fade = veinFade(centre - vec2f(tile * VEIN_TILE), face, near);
    if (fade <= 0.0 || cell.g * VEIN_SCORE - VEIN_THIN * (1.0 - fade) < VEIN_KEEP) {
        return rock;
    }
    let k = i32(cell.r * 255.0 + 0.5);
    if (k == VEIN_EDGE) {
        return rock * vec3f(0.5, 0.5, 0.6);
    }
    return textureLoad(u_paintAtlas, vec2i(info.xy) + vec2i(clamp(k - select(0, 1, face), 0, 3), 0), 0).rgb;
}

fn tierTile(t: vec2i) -> vec4u {
    let size = vec2i(textureDimensions(u_tierTileTexture, 0));
    if (any(t < vec2i(0)) || any(t >= size)) {
        return vec4u(0u);
    }
    return textureLoad(u_tierTileTexture, t, 0);
}

fn tileOf(p: vec2i) -> vec2i {
    return vec2i(floor(vec2f(p) / f32(VEIN_TILE)));
}

fn roofedTile(t: vec2i) -> bool {
    return (tierTile(t).r & TIER_ROOF) != 0u;
}

fn tierNoise(p: vec2i) -> vec4f {
    return textureLoad(u_tierNoiseTexture, p & vec2i(TIER_NOISE), 0);
}

fn roofHash(x: i32, y: i32) -> f32 {
    var n = (u32(x) * 374761393u) ^ (u32(y) * 668265263u) ^ ROOF_SALT;
    n = (n ^ (n >> 13u)) * 1274126177u;
    return f32(n ^ (n >> 16u)) / 4294967296.0;
}

fn roofWobble(p: vec2i) -> f32 {
    let u = vec2f(p) / ROOF_WOBBLE;
    let i = floor(u);
    let f = u - i;
    let c = vec2i(i);
    let a = mix(roofHash(c.x, c.y), roofHash(c.x + 1, c.y), f.x);
    let b = mix(roofHash(c.x, c.y + 1), roofHash(c.x + 1, c.y + 1), f.x);
    return (mix(a, b, f.y) - 0.5) * ROOF_WOBBLE;
}

fn roofDistance(p: vec2i, rockLift: f32) -> f32 {
    let lift = i32(rockLift + 0.5);
    let c = tileOf(p + vec2i(0, lift));
    if ((tierTile(c).r & TIER_NEAR) == 0u) {
        return 1e9;
    }
    var best = 1e9;
    for (var j = -2; j <= 2; j++) {
        for (var i = -2; i <= 2; i++) {
            let t = c + vec2i(i, j);
            if (!roofedTile(t)) {
                continue;
            }
            let lo = t * VEIN_TILE - vec2i(0, lift);
            let hi = lo + vec2i(VEIN_TILE - 1);
            let d = vec2f(max(max(lo - p, p - hi), vec2i(0)));
            best = min(best, length(d));
        }
    }
    return best;
}

fn underCut(p: vec2i, rockLift: f32) -> bool {
    let d = roofDistance(p, rockLift);
    if (d >= ROOF_REACH) {
        return false;
    }
    let keep = (d + roofWobble(p) - ROOF_CLEAR) / ROOF_FEATHER;
    return keep <= bayer(p) * 0.96 + 0.02;
}

fn snowLies(src: vec2i, level: i32, rim: i32, lip: bool, snow: f32) -> bool {
    if (snow < 0.5) {
        return false;
    }
    let drift = (tierNoise(src).b - 0.5) * SNOW_DRIFT + 0.5;
    let edge = select(select(0.0, -SNOW_BARE, rim == 2), SNOW_LIP, lip);
    return drift + f32(level) * SNOW_LEVEL + edge > SNOW_LINE;
}

fn snowOn(src: vec2i, shade: i32, rim: i32, shadow: f32, snowRamp: vec2f) -> vec3f {
    var t = SNOW_KEY + (f32(shade) / 6.0 - SNOW_KEY) * SNOW_GRAIN - shadow * SNOW_SHADE;
    t += select(select(0.0, -0.2, rim == 2), 0.26, rim == 1);
    let k = i32(floor(clamp(t, 0.0, 1.0) * f32(SNOW_TOP) + 0.5 + (bayer(src) - 0.5) * SNOW_DITHER));
    return textureLoad(u_paintAtlas, vec2i(snowRamp) + vec2i(clamp(k, 0, SNOW_TOP), 0), 0).rgb;
}
