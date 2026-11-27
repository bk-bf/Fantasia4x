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

const TAU: f32 = 6.2831853;
const FLUTTER_RATE: f32 = 4.6;
const BOB_RATE: f32 = 2.3;
const VEIL_GUESS: f32 = 0.45;
const VEIL_RATE: f32 = 1.1;
const VEIL_DELAY: f32 = 0.8;
const VEIL_HEIGHTS: i32 = 16;
const COVER_REACH: i32 = 3;
const SOUL_SHINE = vec3f(0.843, 0.98, 0.925);
const FROST_GLINT = vec3f(1.0);
const FROST_ARM = vec3f(0.812, 0.902, 0.949);
const IRON_GLINT = vec3f(0.816, 0.847, 0.839);

struct TreePixel {
    hit: bool,
    at: vec2i,
    mark: vec4f,
}

var<private> g_treeOrg: vec2i;
var<private> g_treeDim: vec2i;
var<private> g_treeFlags: i32;

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

fn markPhase(m: vec4f) -> i32 {
    return i32(m.g * 255.0 + 0.5) & PHASE_BITS;
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
    return tileFrame.u_treeTime.w;
}

fn riseAt(row: i32) -> f32 {
    let h = f32(g_treeDim.y);
    let rise = clamp((h - f32(row) + f32(row - (row / 3) * 3)) / h, 0.0, 1.0);
    return rise * sqrt(rise);
}

fn veilPush() -> f32 {
    return tileFrame.u_wind.x * (tileFrame.u_treeVeil.x + tileFrame.u_treeVeil.y * vary.tree.y);
}

fn hangAt(row: f32) -> i32 {
    let h = f32(g_treeDim.y);
    let smoothed = clamp((h - row) / h, 0.0, 1.0);
    return settled(vary.lean * smoothed * sqrt(smoothed));
}

fn veilShift(m: vec4f, row: i32) -> i32 {
    let f = (f32(markCode(m) >> 4u) + 0.5) / f32(VEIL_HEIGHTS);
    let swing = tileFrame.u_wind.x * tileFrame.u_treeVeil.z;
    let phi = f32(markPhase(m) & BUNCH_BITS) * 2.39 + vary.tree.w * 0.01;
    let v = veilPush() * pow(f, 1.3) + swing * sin((treeClock() - f * VEIL_DELAY) * VEIL_RATE + phi) * pow(f, 1.5);
    return hangAt(f32(row)) + settled(v);
}

fn strandAt(q: vec2i, front: bool) -> TreePixel {
    let none = TreePixel(false, q, vec4f(0.0));
    let guess = hangAt(f32(q.y)) + settled(veilPush() * pow(VEIL_GUESS, 1.3));
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
            return TreePixel(true, p, m);
        }
        p = vec2i(q.x - shift, q.y);
    }
    return none;
}

fn flutterAt(phase: i32) -> i32 {
    let v = sin(treeClock() * FLUTTER_RATE + f32(phase) / f32(PHASE_BITS) * TAU + vary.tree.w * 0.013);
    let a = abs(v);
    if (a <= tileFrame.u_treeWind.x) {
        return 0;
    }
    return i32(sign(v)) * select(1, 2, a > tileFrame.u_treeWind.y);
}

fn bobAt(phase: i32) -> i32 {
    let b = sin(treeClock() * BOB_RATE + f32(phase) / f32(PHASE_BITS) * TAU + vary.tree.w * 0.01);
    return select(0, 1, b > tileFrame.u_treeWind.z);
}

fn leafAt(i: vec2i, m: vec4f) -> TreePixel {
    let ph = markPhase(m);
    let j = i - vec2i(flutterAt(ph), select(0, bobAt(ph), markKind(m) == PART_PINE));
    let n = treeMark(j);
    if (leafPart(markKind(n))) {
        return TreePixel(true, j, n);
    }
    return TreePixel(true, i, m);
}

fn bodyAt(q: vec2i) -> TreePixel {
    let f = riseAt(q.y);
    let i = q - vec2i(settled(vary.lean * f), 0);
    let m = treeMark(i);
    let k = markKind(m);
    if (leafPart(k)) {
        return leafAt(i, m);
    }
    if (k == PART_COVER || k == PART_COVER_TIP) {
        for (var side = -1; side <= 1; side += 2) {
            let under = i + vec2i(side * COVER_REACH, 0);
            let u = treeMark(under);
            if (leafPart(markKind(u))) {
                return leafAt(under, u);
            }
        }
    }
    let b = q - vec2i(settled(vary.tree.x * f), 0);
    let mb = treeMark(b);
    if (markKind(mb) == PART_BOUGH) {
        return TreePixel(true, b, mb);
    }
    let t = q - vec2i(settled(vary.lean * tileFrame.u_treeWind.w * f), 0);
    let mt = treeMark(t);
    let kt = markKind(mt);
    if (!inTree(t) || leafPart(kt) || kt == PART_BOUGH || strandPart(kt)) {
        return TreePixel(false, t, mt);
    }
    return TreePixel(true, t, mt);
}

fn treePixelAt(q: vec2i) -> TreePixel {
    if (treeFlag(TREE_CURTAIN)) {
        let front = strandAt(q, true);
        if (front.hit) {
            return front;
        }
    }
    let body = bodyAt(q);
    if (body.hit && textureLoad(u_paintAtlas, g_treeOrg + body.at, 0).a > 0.0) {
        return body;
    }
    if (treeFlag(TREE_CURTAIN)) {
        return strandAt(q, false);
    }
    return TreePixel(false, q, vec4f(0.0));
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

fn treeColor(px: TreePixel, world: vec2i, glow: ptr<function, f32>) -> vec4f {
    var c = textureLoad(u_paintAtlas, g_treeOrg + px.at, 0);
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
