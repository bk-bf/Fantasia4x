flat in highp vec4 v_tree;

uniform highp vec4 u_wind;
uniform highp vec4 u_treeWind;
uniform highp vec4 u_treeTime;
uniform highp vec3 u_treeVeil;

const int TREE_CURTAIN = 2;
const int TREE_HEART = 4;
const int TREE_PULSE = 8;
const int TREE_SOUL = 16;
const int TREE_FROST = 32;
const int TREE_IRON = 64;
const int TREE_MATURE = 128;

const int PART_BOUGH = 2;
const int PART_LEAF = 3;
const int PART_STRAND = 4;
const int PART_PINE = 5;
const int PART_VEIN = 6;
const int PART_TIP = 7;
const int PART_HOLLOW = 8;
const int PART_COVER = 9;
const int PART_COVER_TIP = 12;
const int PHASE_BITS = 127;
const int FRONT_BIT = 64;
const int BUNCH_BITS = 63;

const highp float TAU = 6.2831853;
const highp float FLUTTER_RATE = 4.6;
const highp float BOB_RATE = 2.3;
const float VEIL_GUESS = 0.45;
const float VEIL_RATE = 1.1;
const float VEIL_DELAY = 0.8;
const int VEIL_HEIGHTS = 16;
const int COVER_REACH = 3;
const vec3 SOUL_SHINE = vec3(0.843, 0.98, 0.925);
const vec3 FROST_GLINT = vec3(1.0);
const vec3 FROST_ARM = vec3(0.812, 0.902, 0.949);
const vec3 IRON_GLINT = vec3(0.816, 0.847, 0.839);

struct TreePixel {
    bool hit;
    highp ivec2 at;
    vec4 mark;
};

highp ivec2 g_treeOrg;
highp ivec2 g_treeDim;
int g_treeFlags;

bool treeFlag(int bit) {
    return (g_treeFlags & bit) != 0;
}

bool inTree(highp ivec2 p) {
    return p.x >= 0 && p.y >= 0 && p.x < g_treeDim.x && p.y < g_treeDim.y;
}

vec4 treeMark(highp ivec2 p) {
    if (!inTree(p)) return vec4(0.0);
    return texelFetch(u_lightAtlas, g_treeOrg + p, 0);
}

int markCode(vec4 m) {
    return int(m.b * 255.0 + 0.5);
}

int markKind(vec4 m) {
    return markCode(m) & 15;
}

int markPhase(vec4 m) {
    return int(m.g * 255.0 + 0.5) & PHASE_BITS;
}

bool leafPart(int k) {
    return k == PART_LEAF || k == PART_PINE;
}

bool strandPart(int k) {
    return k == PART_STRAND || k == PART_TIP || k == PART_COVER || k == PART_COVER_TIP;
}

bool tipPart(int k) {
    return k == PART_TIP || k == PART_COVER_TIP;
}

int settled(highp float v) {
    return int(floor(v + 0.5));
}

highp float treeClock() {
    return u_treeTime.w;
}

highp float riseAt(int row) {
    highp float h = float(g_treeDim.y);
    highp float rise = clamp((h - float(row) + float(row - (row / 3) * 3)) / h, 0.0, 1.0);
    return rise * sqrt(rise);
}

int veilShift(vec4 m, int row) {
    highp float h = float(g_treeDim.y);
    highp float smooth_ = clamp((h - float(row)) / h, 0.0, 1.0);
    int hang = settled(v_lean * smooth_ * sqrt(smooth_));
    highp float f = (float(markCode(m) >> 4) + 0.5) / float(VEIL_HEIGHTS);
    highp float push = u_wind.x * (u_treeVeil.x + u_treeVeil.y * v_tree.y);
    highp float swing = u_wind.x * u_treeVeil.z;
    highp float phi = float(markPhase(m) & BUNCH_BITS) * 2.39 + v_tree.w * 0.01;
    highp float v = push * pow(f, 1.3) + swing * sin((treeClock() - f * VEIL_DELAY) * VEIL_RATE + phi) * pow(f, 1.5);
    return hang + settled(v);
}

TreePixel strandAt(highp ivec2 q, bool front) {
    TreePixel none = TreePixel(false, q, vec4(0.0));
    highp float h = float(g_treeDim.y);
    highp float smooth_ = clamp((h - float(q.y)) / h, 0.0, 1.0);
    highp float push = u_wind.x * (u_treeVeil.x + u_treeVeil.y * v_tree.y);
    int guess = settled(v_lean * smooth_ * sqrt(smooth_)) + settled(push * pow(VEIL_GUESS, 1.3));
    highp ivec2 p = ivec2(q.x - guess, q.y);
    for (int n = 0; n < 3; n++) {
        vec4 m = treeMark(p);
        if (!strandPart(markKind(m))) return none;
        int shift = veilShift(m, p.y);
        if (p.x + shift == q.x) {
            if (((markPhase(m) & FRONT_BIT) != 0) != front) return none;
            return TreePixel(true, p, m);
        }
        p = ivec2(q.x - shift, q.y);
    }
    return none;
}

int flutterAt(int phase) {
    highp float v = sin(treeClock() * FLUTTER_RATE + float(phase) / float(PHASE_BITS) * TAU + v_tree.w * 0.013);
    highp float a = abs(v);
    if (a <= u_treeWind.x) return 0;
    return int(sign(v)) * (a > u_treeWind.y ? 2 : 1);
}

int bobAt(int phase) {
    highp float b = sin(treeClock() * BOB_RATE + float(phase) / float(PHASE_BITS) * TAU + v_tree.w * 0.01);
    return b > u_treeWind.z ? 1 : 0;
}

TreePixel leafAt(highp ivec2 i, vec4 m) {
    int ph = markPhase(m);
    highp ivec2 j = i - ivec2(flutterAt(ph), markKind(m) == PART_PINE ? bobAt(ph) : 0);
    vec4 n = treeMark(j);
    if (leafPart(markKind(n))) return TreePixel(true, j, n);
    return TreePixel(true, i, m);
}

TreePixel bodyAt(highp ivec2 q) {
    highp float f = riseAt(q.y);
    highp ivec2 i = q - ivec2(settled(v_lean * f), 0);
    vec4 m = treeMark(i);
    int k = markKind(m);
    if (leafPart(k)) return leafAt(i, m);
    if (k == PART_COVER || k == PART_COVER_TIP) {
        for (int side = -1; side <= 1; side += 2) {
            highp ivec2 under = i + ivec2(side * COVER_REACH, 0);
            vec4 u = treeMark(under);
            if (leafPart(markKind(u))) return leafAt(under, u);
        }
    }
    highp ivec2 b = q - ivec2(settled(v_tree.x * f), 0);
    vec4 mb = treeMark(b);
    if (markKind(mb) == PART_BOUGH) return TreePixel(true, b, mb);
    highp ivec2 t = q - ivec2(settled(v_lean * u_treeWind.w * f), 0);
    vec4 mt = treeMark(t);
    int kt = markKind(mt);
    if (!inTree(t) || leafPart(kt) || kt == PART_BOUGH || strandPart(kt)) return TreePixel(false, t, mt);
    return TreePixel(true, t, mt);
}

TreePixel treePixelAt(highp ivec2 q) {
    if (treeFlag(TREE_CURTAIN)) {
        TreePixel front = strandAt(q, true);
        if (front.hit) return front;
    }
    TreePixel body = bodyAt(q);
    if (body.hit && texelFetch(u_paintAtlas, g_treeOrg + body.at, 0).a > 0.0) return body;
    if (treeFlag(TREE_CURTAIN)) return strandAt(q, false);
    return TreePixel(false, q, vec4(0.0));
}

float treeNoise(highp vec2 p) {
    highp vec2 i = floor(p);
    vec2 f = p - i;
    f = f * f * (3.0 - 2.0 * f);
    highp ivec2 c = ivec2(i);
    float a = mix(roofHash(c.x, c.y), roofHash(c.x + 1, c.y), f.x);
    float b = mix(roofHash(c.x, c.y + 1), roofHash(c.x + 1, c.y + 1), f.x);
    return mix(a, b, f.y);
}

bool glintAt(highp ivec2 p, highp float rate, highp float life, int salt) {
    highp float t = treeClock() / life + roofHash(p.x + salt, p.y);
    highp int epoch = int(floor(t));
    return roofHash(p.x * 7 + epoch, p.y * 13 - salt) < rate * life;
}

vec4 treeColor(TreePixel px, highp ivec2 world, inout float glow) {
    vec4 c = texelFetch(u_paintAtlas, g_treeOrg + px.at, 0);
    int k = markKind(px.mark);
    int ph = markPhase(px.mark);
    highp float t = treeClock();
    if (treeFlag(TREE_HEART) && glow > 0.0) {
        float breath = 0.72 + 0.28 * sin(t * 1.1);
        c.rgb *= 0.86 + 0.24 * breath;
        glow *= breath;
    }
    if (k == PART_VEIN && treeFlag(TREE_PULSE)) {
        float w = max(0.0, sin(t * 1.6 - float(ph) * 0.14));
        c.rgb *= 1.0 + 0.3 * w * w;
        glow = min(1.0, glow * (0.6 + 0.6 * w));
    }
    if (k == PART_HOLLOW) {
        float depth = float(ph) / float(PHASE_BITS);
        float lit = clamp(
            depth * (0.74 + 0.16 * sin(t * 0.8 + v_tree.w * 0.01) + 0.06 * sin(t * 2.1 + 1.0))
                + (treeNoise(vec2(world) * vec2(0.21, 0.09) - vec2(0.0, t * 0.35)) - 0.5) * 0.4 * depth,
            0.0,
            1.0
        );
        c.rgb *= 0.55 + 0.8 * lit;
        glow = max(glow, min(1.0, lit * 1.15));
    }
    if (tipPart(k) && treeFlag(TREE_SOUL) && sin(t * 0.9 + float(ph & BUNCH_BITS) * 1.7 + float(px.at.x) * 0.05) > 0.94) {
        c.rgb = c.rgb * 0.7 + SOUL_SHINE * 0.3;
        glow = max(glow, 0.55);
    }
    bool bright = dot(c.rgb, vec3(0.3, 0.59, 0.11)) > 0.686;
    highp ivec2 spot = px.at + ivec2(int(v_tree.w), 0);
    if (treeFlag(TREE_FROST) && bright && glintAt(spot, treeFlag(TREE_MATURE) ? 0.004 : 0.0015, 0.45, 17)) {
        c.rgb = FROST_GLINT;
        glow = 1.0;
    } else if (treeFlag(TREE_FROST) && bright && glintAt(spot, 0.0008, 0.3, 29)) {
        c.rgb = FROST_ARM;
        glow = max(glow, 0.8);
    }
    if (treeFlag(TREE_IRON) && treeFlag(TREE_MATURE) && v_tree.y > 0.45 && (bright || leafPart(k)) && glintAt(spot, 0.01, 0.3, 41)) {
        c.rgb = IRON_GLINT;
        glow = max(glow, 0.3);
    }
    return c;
}
