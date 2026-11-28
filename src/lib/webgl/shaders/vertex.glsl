#version 300 es
/* filepath: src/lib/webgl/shaders/vertex.glsl */

// Vertex attributes
in vec2 a_position;      // Vertex position in screen coordinates
in vec2 a_texCoord;      // Texture coordinates for character atlas
in vec3 a_foreground;    // Foreground (dark glyph pixel) color
in vec4 a_background;    // Background (transparent pixel) color + per-cell opacity (a; 1 = opaque)
in vec3 a_detail;        // Detail/highlight (bright glyph pixel) color
in vec3 a_outline;       // Outline color (vec3(0) = no outline)
in vec4 a_uvBounds;      // Glyph UV bounds: (uMin, vMin, uMax, vMax)
in vec3 a_light;         // Per-corner ADDITIVE point-light contribution (0 = none)
in float a_row;
in vec4 a_vein;
in float a_veinNear;
in float a_sway;
in float a_tree;

// Varying outputs (passed to fragment shader)
out vec2 v_texCoord;     // Pass texture coordinates to fragment
out vec3 v_foreground;   // Pass foreground color to fragment
out vec4 v_background;   // Pass background color + opacity to fragment
out vec3 v_detail;       // Pass detail color to fragment
out vec3 v_outline;      // Pass outline color to fragment
out vec4 v_uvBounds;     // Pass glyph UV bounds to fragment
out vec3 v_light;        // Interpolated per-tile light across the quad
out highp vec2 v_world;
flat out vec4 v_vein;
flat out float v_veinNear;
flat out highp float v_row;
flat out highp vec4 v_bend;
flat out highp vec4 v_place;
flat out highp vec4 v_tree;

const int TREE_CURTAIN = 2;
const float DEPTH = 0.5;
const float LIFT = 0.6;
const vec2 GUST_WIDE = vec2(250.0, 420.0);
const vec2 GUST_FINE = vec2(85.0, 140.0);
const float GUST_FINE_PACE = 1.4;
const float GUST_FINE_SHARE = 0.32;
const vec2 SHARE_LULL = vec2(0.72, 0.2);
const float SHARE_EDGE = 0.12;
const vec2 BOW_LANE = vec2(230.0, 96.0);
const vec2 BOW_DEPTH = vec2(0.8, 0.5);
const float BOW_RAGGED = 0.6;
const float BOW_RUN = 380.0;
const vec2 TREE_SCALE = vec2(100.0, 1.6);
const vec2 PLANT_SCALE = vec2(40.0, 1.0);
const float TREE_LOOP = 3.3;
const float PLANT_LOOP = 2.7;
const float TREE_RIDE = 4.4;
const float PLANT_RIDE = 3.0;
const float CROWN_LEAN = 6.0;
const float CROWN_LAG = 0.38;
const vec2 SIZE_SPAN = vec2(24.0, 190.0);
const float HEAVE_LAG = 0.7;
const vec2 SIZE_TEMPO = vec2(0.7, 1.4);

float cell(ivec2 c) {
    uint h = uint(c.x) * 374761393u + uint(c.y) * 668265263u;
    h = (h ^ (h >> 13u)) * 1274126177u;
    h = h ^ (h >> 16u);
    return float(h & 65535u) / 65535.0;
}

float valueNoise(highp vec2 p) {
    highp vec2 i = floor(p);
    vec2 f = p - i;
    f = f * f * (3.0 - 2.0 * f);
    ivec2 c = ivec2(i);
    float top = mix(cell(c), cell(c + ivec2(1, 0)), f.x);
    float bottom = mix(cell(c + ivec2(0, 1)), cell(c + ivec2(1, 1)), f.x);
    return mix(top, bottom, f.y);
}

highp vec2 airFrame(highp vec2 p) {
    highp vec2 q = p - u_windFrame.xy;
    return vec2(dot(q, u_windDir), dot(q, vec2(-u_windDir.y, u_windDir.x))) + u_windFrame.zw;
}

float laneEdge(int k, int salt) {
    return float(k) + (cell(ivec2(k, salt)) - 0.5) * BOW_RAGGED;
}

highp float bowOf(highp float side, highp float run, float lane, float deep, int salt) {
    highp float x = side / lane;
    int k = int(floor(x + 0.5));
    float here = laneEdge(k, salt);
    bool before = x < here;
    int id = before ? k - 1 : k;
    float lo = before ? laneEdge(k - 1, salt) : here;
    float hi = before ? here : laneEdge(k + 1, salt);
    float u = float((x - lo) / (hi - lo));
    highp float r = run / BOW_RUN;
    int n = int(floor(r));
    float t = float(r - float(n));
    t = t * t * (3.0 - 2.0 * t);
    float share = mix(cell(ivec2(id * 7 + salt, n)), cell(ivec2(id * 7 + salt, n + 1)), t);
    return lane * (hi - lo) * deep * (0.25 + 0.75 * share) * 4.0 * u * (1.0 - u);
}

highp float bowAt(highp float side, highp float run) {
    return bowOf(side, run, BOW_LANE.x, BOW_DEPTH.x, 3) + bowOf(side, run, BOW_LANE.y, BOW_DEPTH.y, 5);
}

float airAt(highp vec2 p, highp float travelled) {
    highp vec2 f = airFrame(p);
    highp float along = f.x - bowAt(f.y, f.x - travelled);
    float wide = valueNoise(vec2(along - travelled, f.y) / GUST_WIDE);
    float fine = valueNoise(vec2(along - travelled * GUST_FINE_PACE, f.y) / GUST_FINE + 17.0);
    float lull = mix(SHARE_LULL.x, SHARE_LULL.y, u_wind.x);
    return smoothstep(lull, lull + SHARE_EDGE, mix(wide, fine, GUST_FINE_SHARE));
}

vec4 bySize(highp vec2 foot, float tall, bool tree) {
    float s = u_wind.x;
    vec2 k = tree ? TREE_SCALE : PLANT_SCALE;
    float scale = clamp(tall / k.x, 0.4, k.y);
    float size = smoothstep(SIZE_SPAN.x, SIZE_SPAN.y, tall);
    float lag = HEAVE_LAG * size;
    float air = airAt(foot, u_wind.y - u_windPace * lag);
    float late = tree ? airAt(foot, u_wind.y - u_windPace * (lag + CROWN_LAG)) : air;
    float trunk = tree ? scale * CROWN_LEAN * s * s * (0.5 + 0.5 * air) : 0.0;
    float ride = scale * (tree ? TREE_RIDE : PLANT_RIDE) * (0.35 * s + 0.65 * late);
    return vec4(trunk, ride, air, scale * (tree ? TREE_LOOP : PLANT_LOOP));
}

void main() {
    // a_position holds world coordinates baked at a FIXED base tile size. Pan
    // (u_viewOffset) and zoom (u_zoom) are applied here as uniforms, so neither
    // scrolling nor zooming ever requires rebuilding the vertex buffer.
    vec2 pos = (a_position - u_viewOffset) * u_zoom;
    v_bend = vec4(0.0);
    v_place = vec4(0.0);
    v_tree = vec4(0.0);
    vec2 texCoord = a_texCoord;
    float span = a_uvBounds.w - a_uvBounds.y;
    if (a_sway > 0.0 && u_wind.x > 0.0 && span > 0.0) {
        highp vec2 foot = (a_vein.zw + vec2(0.5, 1.0)) * u_wind.w;
        highp vec2 local = (a_texCoord - (a_uvBounds.xy - vec2(2.0, 0.0))) / u_paintTexelSize;
        float tall = span / u_paintTexelSize.y;
        bool tree = a_tree > 0.0;
        v_bend = bySize(foot, tall, tree);
        float tempo = 1.0 / mix(SIZE_TEMPO.x, SIZE_TEMPO.y, smoothstep(SIZE_SPAN.x, SIZE_SPAN.y, tall));
        v_place = vec4(a_position * u_atlasScale - local, bowAt(airFrame(foot).y, 0.0), tempo);
        v_tree = vec4(1.0, v_bend.z, a_tree, foot.x);
        float most = v_bend.x + v_bend.y + v_bend.w;
        vec2 shove = vec2(most * u_windDir.x, most * u_windDir.y * DEPTH);
        float veil = (int(a_tree) & TREE_CURTAIN) != 0 ? ceil(u_wind.x * (u_treeVeil.x + u_treeVeil.y + u_treeVeil.z)) : 0.0;
        bool left = a_texCoord.x * 2.0 < a_uvBounds.x + a_uvBounds.z - 4.0;
        bool top = a_texCoord.y * 2.0 < a_uvBounds.y + a_uvBounds.w;
        vec2 reach = vec2(
            (left ? -1.0 : 1.0) * (ceil(max(0.0, left ? -shove.x : shove.x)) + veil + 1.0),
            top ? -(ceil(max(0.0, -shove.y) + v_bend.w * LIFT) + 1.0) : ceil(max(0.0, shove.y)) + 1.0
        );
        pos += reach * u_basePerArt * u_zoom;
        texCoord += reach * u_paintTexelSize;
    }
    gl_Position = u_projection * vec4(pos, 0.0, 1.0);
    gl_Position.z = -a_row * u_rowDepth;
    
    // Pass through texture coordinates and colors to fragment shader
    v_texCoord = texCoord;
    v_foreground = a_foreground;
    v_background = a_background;
    v_detail = a_detail;
    v_outline = a_outline;
    v_uvBounds = a_uvBounds;
    v_light = a_light;
    v_world = a_position;
    v_vein = a_vein;
    v_veinNear = a_veinNear;
    v_row = a_row;
}