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

// Uniforms (constant for all vertices in a draw call)
uniform mat4 u_projection;  // Orthographic projection matrix
uniform vec2 u_viewOffset;  // Camera top-left in BASE-tile pixels; applied here so
                            // panning never rebuilds the vertex buffer.
uniform vec2 u_zoom;        // actualTileSize / BASE_TILE_PX; applied here so zoom
                            // never rebuilds the vertex buffer either.
uniform float u_rowDepth;
uniform vec4 u_wind;
uniform vec2 u_windDir;
uniform vec4 u_swayShape;
uniform vec4 u_gustShape;
uniform vec4 u_gustNoise;
uniform vec4 u_windPhase;
uniform float u_basePerArt;
uniform float u_swayReach;
uniform mediump vec2 u_paintTexelSize;
uniform highp vec4 u_treeTime;
uniform vec3 u_treeVeil;

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
flat out highp float v_lean;
flat out highp float v_reach;
flat out highp vec4 v_pose;
flat out highp vec4 v_tree;

const int TREE_CURTAIN = 2;
const float FLUTTER_REACH = 2.0;

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

float gustAt(highp vec2 p, highp float scroll) {
    vec2 across = vec2(-u_windDir.y, u_windDir.x);
    highp float raw = dot(p, u_windDir) * u_windPhase.z - dot(p, across) * u_windPhase.w
        + valueNoise(p * u_gustNoise.xy) * u_gustShape.z
        + valueNoise(p * u_gustNoise.zw) * u_gustShape.w - scroll;
    highp float wave = mod(raw, 256.0);
    if (wave < u_gustShape.x) return 0.0;
    float s = sin((wave - u_gustShape.x) / u_gustShape.y * 3.14159265);
    return s * s;
}

float leanAt(highp vec2 foot, float amp, highp float scroll, highp float clock) {
    float ph = dot(foot, u_windPhase.xy);
    float gust = gustAt(foot, scroll) * u_swayShape.y;
    float flutter = (1.0 - abs(u_windDir.x)) * sin(clock * u_swayShape.w + ph);
    float idle = sin(clock * u_swayShape.z + ph) * u_swayShape.x;
    return amp * u_wind.x * (idle + gust * (u_windDir.x + flutter));
}

void main() {
    // a_position holds world coordinates baked at a FIXED base tile size. Pan
    // (u_viewOffset) and zoom (u_zoom) are applied here as uniforms, so neither
    // scrolling nor zooming ever requires rebuilding the vertex buffer.
    vec2 pos = (a_position - u_viewOffset) * u_zoom;
    v_lean = 0.0;
    v_reach = 0.0;
    v_pose = vec4(0.0);
    if (a_sway < 0.0) {
        float code = -a_sway - 1.0;
        v_pose = vec4(1.0, mod(floor(code / 8.0), 8.0) - 4.0, mod(code, 8.0) - 4.0, floor(code / 64.0) - 4.0);
    }
    v_tree = vec4(0.0);
    vec2 texCoord = a_texCoord;
    float span = a_uvBounds.w - a_uvBounds.y;
    if (a_sway > 0.0 && u_wind.x > 0.0 && span > 0.0) {
        highp vec2 foot = (a_vein.zw + vec2(0.5, 1.0)) * u_wind.w;
        v_lean = leanAt(foot, a_sway, u_wind.y, u_wind.z);
        v_reach = ceil(a_sway * u_swayReach);
        if (a_tree > 0.0) {
            float lag = leanAt(foot, a_sway, u_treeTime.x, u_treeTime.y) * u_treeTime.z;
            v_tree = vec4(lag, gustAt(foot, u_wind.y), a_tree, foot.x);
            v_reach += FLUTTER_REACH;
            if ((int(a_tree) & TREE_CURTAIN) != 0)
                v_reach += ceil(u_wind.x * (u_treeVeil.x + u_treeVeil.y + u_treeVeil.z)) + 1.0;
        }
        float side = a_texCoord.x * 2.0 < a_uvBounds.x + a_uvBounds.z - 4.0 ? -1.0 : 1.0;
        pos.x += side * v_reach * u_basePerArt * u_zoom.x;
        texCoord.x += side * v_reach * u_paintTexelSize.x;
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