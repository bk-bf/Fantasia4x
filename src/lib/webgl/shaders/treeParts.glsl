flat in highp vec4 v_bend;
flat in highp vec4 v_place;
flat in highp vec4 v_tree;

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
const int WOOD = 254;
const int STALK_BIT = 64;
const int PLANT_CY = 63;

const highp float TAU = 6.2831853;
const float VEIL_GUESS = 0.45;
const float VEIL_RATE = 1.1;
const float VEIL_DELAY = 0.8;
const int VEIL_HEIGHTS = 16;
const float WAVELENGTH = 100.0;
const float WAVE_SLANT = 0.25;
const float PIECE_LIFT = 0.6;
const float PIECE_DEPTH = 0.5;
const float INSIDE_SHADE = 0.72;
const int INSIDE_RIM = 3;
const float CROWN_CURVE = 2.0;
const float STALK_CURVE = 1.5;
const float PIECE_EDGE = 0.2;
const float SHEEN = 0.16;
const vec3 SOUL_SHINE = vec3(0.843, 0.98, 0.925);
const vec3 FROST_GLINT = vec3(1.0);
const vec3 FROST_ARM = vec3(0.812, 0.902, 0.949);
const vec3 IRON_GLINT = vec3(0.816, 0.847, 0.839);

struct TreePixel {
    bool hit;
    highp ivec2 at;
    vec4 mark;
    float shade;
};

highp ivec2 g_treeOrg;
highp ivec2 g_treeDim;
int g_treeFlags;
bool g_parts;

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

int markGreen(vec4 m) {
    return int(m.g * 255.0 + 0.5);
}

int markPhase(vec4 m) {
    return markGreen(m) & PHASE_BITS;
}

int markPiece(vec4 m) {
    return int(m.a * 255.0 + 0.5);
}

bool isPiece(vec4 m) {
    int c = markPiece(m);
    return c >= 1 && c < WOOD;
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
    return u_treeClock;
}

highp vec2 pieceFrame(highp vec2 p) {
    highp vec2 q = p - u_windFrame.xy;
    return vec2(dot(q, u_windDir), dot(q, vec2(-u_windDir.y, u_windDir.x))) + u_windFrame.zw;
}

float pieceHash(highp vec2 world) {
    highp ivec2 c = ivec2(floor(world));
    uint h = uint(c.x) * 374761393u + uint(c.y) * 668265263u + 2246822519u;
    h = (h ^ (h >> 13u)) * 1274126177u;
    h = h ^ (h >> 16u);
    return float(h & 65535u) / 65535.0;
}

highp vec2 pieceCentre(vec4 m) {
    if (!g_parts) return vec2(float(markPiece(m) - 1), float(markGreen(m) & PLANT_CY) * 2.0);
    highp ivec2 scale = ivec2(g_treeDim.x > 253 ? 2 : 1, g_treeDim.y > 254 ? 4 : 2);
    return vec2(float((markPiece(m) - 1) * scale.x), float(markPhase(m) * scale.y));
}

highp ivec2 offsetOf(vec4 m, int row) {
    highp vec2 centre = pieceCentre(m);
    highp float h = float(g_treeDim.y);
    float up = clamp((h - centre.y) / h, 0.0, 1.0);
    if (g_parts && !leafPart(markKind(m))) return ivec2(0);
    float weight = float(markCode(m) >> 4) / 15.0;
    if (!g_parts) weight = (markGreen(m) & STALK_BIT) != 0 ? pow(clamp((h - float(row)) / h, 0.0, 1.0), STALK_CURVE) : up;
    highp vec2 world = v_place.xy + centre;
    highp vec2 f = pieceFrame(world);
    highp float a = TAU * (u_wind.z * v_place.w - (f.x + WAVE_SLANT * f.y - v_place.z) / WAVELENGTH);
    float start = pieceHash(world) * (1.0 - PIECE_EDGE);
    float shake = v_bend.w * smoothstep(start, start + PIECE_EDGE, v_bend.z);
    float along = v_bend.x * pow(up, CROWN_CURVE) + v_bend.y * weight + weight * shake * (0.5 - 0.5 * cos(a));
    float lift = weight * shake * PIECE_LIFT * max(sin(a), 0.0);
    return ivec2(settled(along * u_windDir.x), settled(along * u_windDir.y * PIECE_DEPTH - lift));
}

bool sameClump(vec4 a, vec4 b) {
    return markPiece(a) == markPiece(b) && markPhase(a) == markPhase(b) && markCode(a) == markCode(b);
}

bool clumpAt(highp ivec2 q, highp ivec2 last, vec4 m, out TreePixel px) {
    for (int n = 0; n < 2; n++) {
        if (!isPiece(m)) return false;
        highp ivec2 at = q - offsetOf(m, q.y);
        vec4 there = at == last ? m : treeMark(at);
        if (sameClump(m, there)) {
            px = TreePixel(!g_parts || leafPart(markKind(m)), at, there, 1.0);
            return px.hit;
        }
        last = at;
        m = there;
    }
    return false;
}

bool deepIn(highp ivec2 p, vec4 m) {
    return leafPart(markKind(m)) && leafPart(markKind(treeMark(p - ivec2(INSIDE_RIM, 0)))) && leafPart(markKind(treeMark(p + ivec2(INSIDE_RIM, 0))));
}

TreePixel pieceAt(highp ivec2 q) {
    TreePixel px = TreePixel(false, q, vec4(0.0), 1.0);
    float reach = v_bend.y + 0.5 * v_bend.w * v_bend.z;
    highp ivec2 guess = q - ivec2(settled(reach * u_windDir.x), settled(reach * u_windDir.y * PIECE_DEPTH));
    vec4 mg = treeMark(guess);
    if (clumpAt(q, guess, mg, px)) return px;
    vec4 mq = guess == q ? mg : treeMark(q);
    if (guess != q && clumpAt(q, q, mq, px)) return px;
    if (g_parts ? markPiece(mq) == WOOD && !strandPart(markKind(mq)) : !isPiece(mq)) return TreePixel(true, q, mq, 1.0);
    if (g_parts && deepIn(guess, mg)) return TreePixel(true, guess, mg, INSIDE_SHADE);
    return TreePixel(false, q, mq, 1.0);
}

int hangAt(int row) {
    highp float h = float(g_treeDim.y);
    float up = clamp((h - float(row)) / h, 0.0, 1.0);
    return settled((v_bend.x * pow(up, CROWN_CURVE) + v_bend.y * up) * u_windDir.x);
}

highp float veilPush() {
    return u_wind.x * (u_treeVeil.x + u_treeVeil.y * v_bend.z);
}

int veilShift(vec4 m, int row) {
    highp float f = (float(markCode(m) >> 4) + 0.5) / float(VEIL_HEIGHTS);
    highp float swing = u_wind.x * u_treeVeil.z;
    highp float phi = float(markPhase(m) & BUNCH_BITS) * 2.39 + v_tree.w * 0.01;
    highp float v = veilPush() * pow(f, 1.3) + swing * sin((treeClock() - f * VEIL_DELAY) * VEIL_RATE + phi) * pow(f, 1.5);
    return hangAt(row) + settled(v);
}

TreePixel strandAt(highp ivec2 q, bool front) {
    TreePixel none = TreePixel(false, q, vec4(0.0), 1.0);
    int guess = hangAt(q.y) + settled(veilPush() * pow(VEIL_GUESS, 1.3));
    highp ivec2 p = ivec2(q.x - guess, q.y);
    for (int n = 0; n < 3; n++) {
        vec4 m = treeMark(p);
        if (!strandPart(markKind(m))) return none;
        int shift = veilShift(m, p.y);
        if (p.x + shift == q.x) {
            if (((markPhase(m) & FRONT_BIT) != 0) != front) return none;
            return TreePixel(true, p, m, 1.0);
        }
        p = ivec2(q.x - shift, q.y);
    }
    return none;
}

TreePixel treePixelAt(highp ivec2 q, out vec4 colour) {
    colour = vec4(0.0);
    if (treeFlag(TREE_CURTAIN)) {
        TreePixel front = strandAt(q, true);
        if (front.hit) {
            colour = texelFetch(u_paintAtlas, g_treeOrg + front.at, 0);
            return front;
        }
    }
    TreePixel body = pieceAt(q);
    if (body.hit && inTree(body.at)) {
        colour = texelFetch(u_paintAtlas, g_treeOrg + body.at, 0);
        if (colour.a > 0.0) return body;
    }
    if (treeFlag(TREE_CURTAIN)) {
        TreePixel back = strandAt(q, false);
        if (back.hit) colour = texelFetch(u_paintAtlas, g_treeOrg + back.at, 0);
        return back;
    }
    return TreePixel(false, q, vec4(0.0), 1.0);
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

vec4 treeColor(TreePixel px, vec4 c, highp ivec2 world, inout float glow) {
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
