const TREE_CURTAIN: i32 = 2;
const TREE_HEART: i32 = 4;
const TREE_PULSE: i32 = 8;
const TREE_SOUL: i32 = 16;
const TREE_FROST: i32 = 32;
const TREE_IRON: i32 = 64;
const TREE_MATURE: i32 = 128;

const PART_BOUGH: i32 = 2;
const PART_LEAF: i32 = 3;
const PART_STRAND: i32 = 4;
const PART_PINE: i32 = 5;
const PART_VEIN: i32 = 6;
const PART_TIP: i32 = 7;
const PART_HOLLOW: i32 = 8;
const PART_COVER: i32 = 9;
const PART_COVER_TIP: i32 = 12;
const PHASE_BITS: i32 = 127;
const FRONT_BIT: i32 = 64;
const BUNCH_BITS: i32 = 63;
const WOOD: i32 = 254;
const STALK_BIT: i32 = 64;
const PLANT_CY: i32 = 63;

const TAU: f32 = 6.2831853;
const VEIL_GUESS: f32 = 0.45;
const VEIL_RATE: f32 = 1.1;
const VEIL_DELAY: f32 = 0.8;
const VEIL_HEIGHTS: i32 = 16;
const WAVELENGTH: f32 = 100.0;
const WAVE_SLANT: f32 = 0.25;
const PIECE_LIFT: f32 = 0.6;
const PIECE_DEPTH: f32 = 0.5;
const INSIDE_SHADE: f32 = 0.72;
const INSIDE_RIM: i32 = 3;
const CROWN_CURVE: f32 = 2.0;
const STALK_CURVE: f32 = 1.5;
const PIECE_EDGE: f32 = 0.2;
const SHEEN: f32 = 0.16;
const SOUL_SHINE = vec3f(0.843, 0.98, 0.925);
const FROST_GLINT = vec3f(1.0);
const FROST_ARM = vec3f(0.812, 0.902, 0.949);
const IRON_GLINT = vec3f(0.816, 0.847, 0.839);

struct TreePixel {
    hit: bool,
    at: vec2i,
    mark: vec4f,
    shade: f32,
}

var<private> g_treeOrg: vec2i;
var<private> g_treeDim: vec2i;
var<private> g_treeFlags: i32;
var<private> g_parts: bool;

fn treeFlag(bit: i32) -> bool {
    return (g_treeFlags & bit) != 0;
}

fn inTree(p: vec2i) -> bool {
    return p.x >= 0 && p.y >= 0 && p.x < g_treeDim.x && p.y < g_treeDim.y;
}

fn treeMark(p: vec2i) -> vec4f {
    if (!inTree(p)) {
        return vec4f(0.0);
    }
    return textureLoad(u_lightAtlas, g_treeOrg + p, 0);
}

fn markCode(m: vec4f) -> i32 {
    return i32(m.b * 255.0 + 0.5);
}

fn markKind(m: vec4f) -> i32 {
    return markCode(m) & 15;
}

fn markGreen(m: vec4f) -> i32 {
    return i32(m.g * 255.0 + 0.5);
}

fn markPhase(m: vec4f) -> i32 {
    return markGreen(m) & PHASE_BITS;
}

fn markPiece(m: vec4f) -> i32 {
    return i32(m.a * 255.0 + 0.5);
}

fn isPiece(m: vec4f) -> bool {
    let c = markPiece(m);
    return c >= 1 && c < WOOD;
}

fn leafPart(k: i32) -> bool {
    return k == PART_LEAF || k == PART_PINE;
}

fn strandPart(k: i32) -> bool {
    return k == PART_STRAND || k == PART_TIP || k == PART_COVER || k == PART_COVER_TIP;
}

fn tipPart(k: i32) -> bool {
    return k == PART_TIP || k == PART_COVER_TIP;
}

fn settled(v: f32) -> i32 {
    return i32(floor(v + 0.5));
}

fn treeClock() -> f32 {
    return tileFrame.u_treeClock;
}

fn pieceFrame(p: vec2f) -> vec2f {
    let dir = tileFrame.u_windDir;
    let q = p - tileFrame.u_windFrame.xy;
    return vec2f(dot(q, dir), dot(q, vec2f(-dir.y, dir.x))) + tileFrame.u_windFrame.zw;
}

fn pieceHash(world: vec2f) -> f32 {
    let c = vec2i(floor(world));
    var h = u32(c.x) * 374761393u + u32(c.y) * 668265263u + 2246822519u;
    h = (h ^ (h >> 13u)) * 1274126177u;
    h = h ^ (h >> 16u);
    return f32(h & 65535u) / 65535.0;
}

fn pieceCentre(m: vec4f) -> vec2f {
    if (!g_parts) {
        return vec2f(f32(markPiece(m) - 1), f32(markGreen(m) & PLANT_CY) * 2.0);
    }
    let scale = vec2i(select(1, 2, g_treeDim.x > 253), select(2, 4, g_treeDim.y > 254));
    return vec2f(f32((markPiece(m) - 1) * scale.x), f32(markPhase(m) * scale.y));
}

fn offsetOf(m: vec4f, row: i32) -> vec2i {
    if (g_parts && !leafPart(markKind(m))) {
        return vec2i(0);
    }
    let bend = vary.bend;
    let place = vary.place;
    let dir = tileFrame.u_windDir;
    let centre = pieceCentre(m);
    let h = f32(g_treeDim.y);
    let up = clamp((h - centre.y) / h, 0.0, 1.0);
    var weight = f32(markCode(m) >> 4u) / 15.0;
    if (!g_parts) {
        weight = up;
        if ((markGreen(m) & STALK_BIT) != 0) {
            weight = pow(clamp((h - f32(row)) / h, 0.0, 1.0), STALK_CURVE);
        }
    }
    let world = place.xy + centre;
    let f = pieceFrame(world);
    let a = TAU * (tileFrame.u_wind.z * place.w - (f.x + WAVE_SLANT * f.y - place.z) / WAVELENGTH);
    let start = pieceHash(world) * (1.0 - PIECE_EDGE);
    let shake = bend.w * smoothstep(start, start + PIECE_EDGE, bend.z);
    let along = bend.x * pow(up, CROWN_CURVE) + bend.y * weight + weight * shake * (0.5 - 0.5 * cos(a));
    let lift = weight * shake * PIECE_LIFT * max(sin(a), 0.0);
    return vec2i(settled(along * dir.x), settled(along * dir.y * PIECE_DEPTH - lift));
}

fn sameClump(a: vec4f, b: vec4f) -> bool {
    return markPiece(a) == markPiece(b) && markPhase(a) == markPhase(b) && markCode(a) == markCode(b);
}

fn clumpAt(q: vec2i, start: vec2i, first: vec4f, px: ptr<function, TreePixel>) -> bool {
    var last = start;
    var m = first;
    for (var n = 0; n < 2; n++) {
        if (!isPiece(m)) {
            return false;
        }
        let at = q - offsetOf(m, q.y);
        var there = m;
        if (any(at != last)) {
            there = treeMark(at);
        }
        if (sameClump(m, there)) {
            let hit = !g_parts || leafPart(markKind(m));
            *px = TreePixel(hit, at, there, 1.0);
            return hit;
        }
        last = at;
        m = there;
    }
    return false;
}

fn deepIn(p: vec2i, m: vec4f) -> bool {
    return leafPart(markKind(m)) && leafPart(markKind(treeMark(p - vec2i(INSIDE_RIM, 0)))) && leafPart(markKind(treeMark(p + vec2i(INSIDE_RIM, 0))));
}

fn pieceAt(q: vec2i) -> TreePixel {
    var px = TreePixel(false, q, vec4f(0.0), 1.0);
    let bend = vary.bend;
    let dir = tileFrame.u_windDir;
    let reach = bend.y + 0.5 * bend.w * bend.z;
    let guess = q - vec2i(settled(reach * dir.x), settled(reach * dir.y * PIECE_DEPTH));
    let mg = treeMark(guess);
    if (clumpAt(q, guess, mg, &px)) {
        return px;
    }
    let moved = any(guess != q);
    var mq = mg;
    if (moved) {
        mq = treeMark(q);
        if (clumpAt(q, q, mq, &px)) {
            return px;
        }
    }
    var still = !isPiece(mq);
    if (g_parts) {
        still = markPiece(mq) == WOOD && !strandPart(markKind(mq));
    }
    if (still) {
        return TreePixel(true, q, mq, 1.0);
    }
    if (g_parts && deepIn(guess, mg)) {
        return TreePixel(true, guess, mg, INSIDE_SHADE);
    }
    return TreePixel(false, q, mq, 1.0);
}

fn hangAt(row: i32) -> i32 {
    let h = f32(g_treeDim.y);
    let up = clamp((h - f32(row)) / h, 0.0, 1.0);
    return settled((vary.bend.x * pow(up, CROWN_CURVE) + vary.bend.y * up) * tileFrame.u_windDir.x);
}

fn veilPush() -> f32 {
    return tileFrame.u_wind.x * (tileFrame.u_treeVeil.x + tileFrame.u_treeVeil.y * vary.bend.z);
}

fn veilShift(m: vec4f, row: i32) -> i32 {
    let f = (f32(markCode(m) >> 4u) + 0.5) / f32(VEIL_HEIGHTS);
    let swing = tileFrame.u_wind.x * tileFrame.u_treeVeil.z;
    let phi = f32(markPhase(m) & BUNCH_BITS) * 2.39 + vary.tree.w * 0.01;
    let v = veilPush() * pow(f, 1.3) + swing * sin((treeClock() - f * VEIL_DELAY) * VEIL_RATE + phi) * pow(f, 1.5);
    return hangAt(row) + settled(v);
}

fn strandAt(q: vec2i, front: bool) -> TreePixel {
    let none = TreePixel(false, q, vec4f(0.0), 1.0);
    let guess = hangAt(q.y) + settled(veilPush() * pow(VEIL_GUESS, 1.3));
    var p = vec2i(q.x - guess, q.y);
    for (var n = 0; n < 3; n++) {
        let m = treeMark(p);
        if (!strandPart(markKind(m))) {
            return none;
        }
        let shift = veilShift(m, p.y);
        if (p.x + shift == q.x) {
            if (((markPhase(m) & FRONT_BIT) != 0) != front) {
                return none;
            }
            return TreePixel(true, p, m, 1.0);
        }
        p = vec2i(q.x - shift, q.y);
    }
    return none;
}

fn treePixelAt(q: vec2i, colour: ptr<function, vec4f>) -> TreePixel {
    *colour = vec4f(0.0);
    if (treeFlag(TREE_CURTAIN)) {
        let front = strandAt(q, true);
        if (front.hit) {
            *colour = textureLoad(u_paintAtlas, g_treeOrg + front.at, 0);
            return front;
        }
    }
    let body = pieceAt(q);
    if (body.hit && inTree(body.at)) {
        *colour = textureLoad(u_paintAtlas, g_treeOrg + body.at, 0);
        if ((*colour).a > 0.0) {
            return body;
        }
    }
    if (treeFlag(TREE_CURTAIN)) {
        let back = strandAt(q, false);
        if (back.hit) {
            *colour = textureLoad(u_paintAtlas, g_treeOrg + back.at, 0);
        }
        return back;
    }
    return TreePixel(false, q, vec4f(0.0), 1.0);
}

fn treeNoise(p: vec2f) -> f32 {
    let i = floor(p);
    var f = p - i;
    f = f * f * (3.0 - 2.0 * f);
    let c = vec2i(i);
    let a = mix(roofHash(c.x, c.y), roofHash(c.x + 1, c.y), f.x);
    let b = mix(roofHash(c.x, c.y + 1), roofHash(c.x + 1, c.y + 1), f.x);
    return mix(a, b, f.y);
}

fn glintAt(p: vec2i, rate: f32, life: f32, salt: i32) -> bool {
    let t = treeClock() / life + roofHash(p.x + salt, p.y);
    let epoch = i32(floor(t));
    return roofHash(p.x * 7 + epoch, p.y * 13 - salt) < rate * life;
}

fn treeColor(px: TreePixel, colour: vec4f, world: vec2i, glow: ptr<function, f32>) -> vec4f {
    var c = colour;
    let k = markKind(px.mark);
    let ph = markPhase(px.mark);
    let t = treeClock();
    if (treeFlag(TREE_HEART) && *glow > 0.0) {
        let breath = 0.72 + 0.28 * sin(t * 1.1);
        c = vec4f(c.rgb * (0.86 + 0.24 * breath), c.a);
        *glow *= breath;
    }
    if (k == PART_VEIN && treeFlag(TREE_PULSE)) {
        let w = max(0.0, sin(t * 1.6 - f32(ph) * 0.14));
        c = vec4f(c.rgb * (1.0 + 0.3 * w * w), c.a);
        *glow = min(1.0, *glow * (0.6 + 0.6 * w));
    }
    if (k == PART_HOLLOW) {
        let depth = f32(ph) / f32(PHASE_BITS);
        let lit = clamp(
            depth * (0.74 + 0.16 * sin(t * 0.8 + vary.tree.w * 0.01) + 0.06 * sin(t * 2.1 + 1.0))
                + (treeNoise(vec2f(world) * vec2f(0.21, 0.09) - vec2f(0.0, t * 0.35)) - 0.5) * 0.4 * depth,
            0.0,
            1.0
        );
        c = vec4f(c.rgb * (0.55 + 0.8 * lit), c.a);
        *glow = max(*glow, min(1.0, lit * 1.15));
    }
    if (tipPart(k) && treeFlag(TREE_SOUL) && sin(t * 0.9 + f32(ph & BUNCH_BITS) * 1.7 + f32(px.at.x) * 0.05) > 0.94) {
        c = vec4f(c.rgb * 0.7 + SOUL_SHINE * 0.3, c.a);
        *glow = max(*glow, 0.55);
    }
    let bright = dot(c.rgb, vec3f(0.3, 0.59, 0.11)) > 0.686;
    let spot = px.at + vec2i(i32(vary.tree.w), 0);
    if (treeFlag(TREE_FROST) && bright && glintAt(spot, select(0.0015, 0.004, treeFlag(TREE_MATURE)), 0.45, 17)) {
        c = vec4f(FROST_GLINT, c.a);
        *glow = 1.0;
    } else if (treeFlag(TREE_FROST) && bright && glintAt(spot, 0.0008, 0.3, 29)) {
        c = vec4f(FROST_ARM, c.a);
        *glow = max(*glow, 0.8);
    }
    if (treeFlag(TREE_IRON) && treeFlag(TREE_MATURE) && vary.tree.y > 0.45 && (bright || leafPart(k)) && glintAt(spot, 0.01, 0.3, 41)) {
        c = vec4f(IRON_GLINT, c.a);
        *glow = max(*glow, 0.3);
    }
    return c;
}
