#version 300 es
/* filepath: src/lib/webgl/shaders/fragment.glsl */
precision mediump float;

in vec2 v_texCoord;
in vec3 v_foreground;
in vec4 v_background;    // rgb + per-cell opacity (a; 1 = opaque terrain cell)
in vec3 v_detail;
in vec3 v_outline;
in highp vec4 v_uvBounds;  // (uMin, vMin, uMax, vMax) of this glyph in the atlas
in vec3 v_light;     // Interpolated ADDITIVE point-light contribution (0 = none)
in highp vec2 v_world;
flat in highp vec4 v_vein;
flat in float v_veinNear;
flat in highp float v_row;
flat in highp float v_lean;
flat in highp float v_reach;

uniform sampler2D u_fontAtlas;
uniform sampler2D u_paintAtlas;
uniform vec2 u_paintTexelSize;
uniform vec2 u_texelSize;  // (1/atlasWidth, 1/atlasHeight)
// Global day/night ambient (light * tint). Combined per-fragment with the baked
// additive point light so ambient changes never rebuild the vertex buffer.
uniform vec3 u_ambient;
// Global fire-flicker multiplier (~0.85..1.0). The baked v_light is static, so
// the flicker is applied here per-fragment — this keeps the terrain vertex buffer
// stable while a campfire is lit instead of rebaking every tile each frame.
uniform float u_lightFlicker;
// Overlay mode: 0 = opaque tile (background fills the cell), 1 = glyph-only
// (transparent background) so entities composite over the terrain layer below.
uniform float u_glyphOnly;
// Background-only mode: 1 = draw ONLY the per-cell background wash, no glyph. Used to split the
// snow/ice pass — the translucent WASH is drawn beneath the resource glyphs (so grass/tree/wall
// glyphs render on top of it rather than being flattened to solid white), while the snow SPRITE is
// drawn glyph-only in a later pass above the resources.
uniform float u_bgOnly;
uniform float u_alphaCut;
uniform sampler2D u_lightAtlas;
uniform highp sampler2D u_lightTexture;
uniform float u_fieldLit;
uniform float u_shadowPass;
uniform vec3 u_shade;
uniform highp float u_shadowDepth;
uniform float u_saturation;
uniform float u_brightness;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
uniform highp sampler2D u_rockTexture;
uniform highp vec2 u_rockRamp;
uniform float u_rockLift;
uniform highp float u_atlasScale;
uniform highp float u_rowPx;
uniform highp float u_rowDepth;

const int CUT_MAX = 16;
uniform highp vec4 u_cut[CUT_MAX];
uniform float u_cuts;
const highp float CUT_EDGE = 34.0;
const highp float CUT_SOFT = 6.0;
const highp float CUT_WOBBLE = 12.0;
const float CUT_KEEP = 0.14;
const float BAYER[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);

const int FACE_ALPHA = 254;
const int FACE_ROWS = 22;
const highp float OBJECT_FOOT = 23.0;
out vec4 fragColor;

int rockShade(int rim, highp ivec2 p) {
    highp ivec2 size = textureSize(u_rockTexture, 0);
    return int(texelFetch(u_rockTexture, (p % size + size) % size, 0)[rim] * 255.0 + 0.5);
}

#define ROCK_SURFACE_CODE

vec3 rockTop(int rim, highp ivec2 p) {
    int shade = rockShade(rim, p);
    if (snowLies(p, 0, rim, false)) return snowOn(p, shade, rim, 0.0);
    return texelFetch(u_paintAtlas, ivec2(u_rockRamp) + ivec2(shade, 0), 0).rgb;
}

vec3 weathered(vec3 c) {
    return mix(vec3(dot(c, LUMA)), c, u_saturation) * u_brightness;
}

highp vec2 swayed(highp vec2 uv) {
    if (v_lean == 0.0) return uv;
    highp float top = v_uvBounds.y;
    highp float rows = (v_uvBounds.w - top) / u_paintTexelSize.y;
    highp float row = floor((uv.y - top) / u_paintTexelSize.y);
    highp float rise = (rows - row + mod(row, 3.0)) / rows;
    highp float step = rise > 0.0 ? floor(v_lean * rise * sqrt(rise) + 0.5) : 0.0;
    return uv - vec2(step * u_paintTexelSize.x, 0.0);
}

bool offSprite(highp vec2 uv) {
    return v_reach > 0.0 && (uv.x < v_uvBounds.x - 2.0 || uv.x > v_uvBounds.z - 2.0);
}

vec2 paintedUv(highp vec2 uv) {
    vec4 cell = v_uvBounds - vec4(2.0, 0.0, 2.0, 0.0);
    vec2 inset = 0.5 * u_paintTexelSize;
    return clamp(uv, cell.xy + inset, cell.zw - inset);
}

highp float cutCell(highp ivec2 c) {
    highp uint h = uint(c.x) * 374761393u + uint(c.y) * 668265263u;
    h = (h ^ (h >> 13u)) * 1274126177u;
    h = h ^ (h >> 16u);
    return float(h & 65535u) / 65535.0;
}

highp float cutNoise(highp vec2 p) {
    highp vec2 i = floor(p);
    highp vec2 f = p - i;
    f = f * f * (3.0 - 2.0 * f);
    highp ivec2 c = ivec2(i);
    highp float top = mix(cutCell(c), cutCell(c + ivec2(1, 0)), f.x);
    highp float bottom = mix(cutCell(c + ivec2(0, 1)), cutCell(c + ivec2(1, 1)), f.x);
    return mix(top, bottom, f.y);
}

bool treePart(vec2 uv) {
    return texture(u_lightAtlas, uv).b > 0.0;
}

bool cutAway(highp vec2 at, vec2 uv) {
    if (u_cuts < 0.5 || !treePart(uv)) return false;
    highp float edge = CUT_EDGE + (cutNoise(at / 7.0) - 0.5) * CUT_WOBBLE;
    float keep = 1.0;
    for (int i = 0; i < CUT_MAX; i++) {
        if (float(i) >= u_cuts) break;
        highp vec4 c = u_cut[i];
        if (c.z >= v_row) continue;
        highp float d = length((at - c.xy) * vec2(1.0, 1.1));
        if (d < edge) keep = min(keep, CUT_KEEP + (1.0 - CUT_KEEP) * clamp((d - edge + CUT_SOFT) / CUT_SOFT, 0.0, 1.0));
    }
    if (keep >= 1.0) return false;
    highp ivec2 p = ivec2(floor(at)) & 3;
    return (BAYER[p.y * 4 + p.x] + 0.5) / 16.0 >= keep;
}

highp float groundDepth(highp float ground) {
    return 0.5 - 0.5 * ground / u_rowPx * u_rowDepth;
}

void main() {
    gl_FragDepth = gl_FragCoord.z;
    if (u_rowPx > 0.0) gl_FragDepth = groundDepth(v_row * u_rowPx + OBJECT_FOOT);
    // Final light multiplier = day/night ambient + baked additive point lights
    // (animated by the global flicker uniform), clamped to the same ceiling the
    // CPU lighting model used (MAX_LIGHT = 1.6).
    vec3 light = u_fieldLit > 0.5
        ? texelFetch(u_lightTexture, ivec2(gl_FragCoord.xy), 0).rgb * 2.0
        : min(u_ambient + v_light * u_lightFlicker, vec3(1.6));

#ifdef PAINTED
    if (u_shadowPass > 0.5) {
        highp vec2 leaned = swayed(v_texCoord);
        if (v_uvBounds.x < 2.0 || offSprite(leaned) || texture(u_lightAtlas, paintedUv(leaned)).g < 0.5) discard;
        gl_FragDepth = u_shadowDepth;
        fragColor = vec4(u_shade, 1.0);
        return;
    }
#endif

    // Background-only pass (snow/ice WASH beneath the resource glyphs): emit just the per-cell wash at
    // its own alpha, no glyph — so grass/tree/wall glyphs drawn on top stay visible instead of being
    // buried under solid white. Return early; no glyph/outline sampling needed.
    if (u_bgOnly > 0.5) {
        fragColor = vec4(weathered(v_background.rgb * light), v_background.a);
        return;
    }

    vec4 sprite;
#ifdef PAINTED
    bool painted = v_uvBounds.x >= 2.0;
    if (painted) {
        highp vec2 leaned = swayed(v_texCoord);
        bool off = offSprite(leaned);
        vec2 uv = paintedUv(leaned);
        sprite = off ? vec4(0.0) : texture(u_paintAtlas, uv);
        if (u_fieldLit > 0.5 && !off) {
            float glow = texture(u_lightAtlas, uv).r;
            if (glow > 0.0) light = mix(u_ambient, vec3(1.0), glow);
        }
        highp vec2 at = v_world * u_atlasScale;
        if (sprite.a > 0.0 && !off && cutAway(at, uv)) discard;
        int alpha = int(sprite.a * 255.0 + 0.5);
        highp float ground = v_row * u_rowPx + OBJECT_FOOT;
        if (alpha == 255 && sprite.r > 0.99 && sprite.b > 0.99 && sprite.g < 0.05) {
            highp vec2 top = at + vec2(0.0, u_rockLift);
            sprite.rgb = vein(rockTop(int(sprite.g * 255.0 + 0.5), ivec2(floor(top))), top, top, false, v_vein, v_veinNear);
            if (underCut(ivec2(floor(at)))) sprite.rgb *= UNDER_ROCK;
            ground = top.y;
        } else if (alpha <= FACE_ALPHA && alpha > FACE_ALPHA - FACE_ROWS) {
            int fy = FACE_ALPHA - alpha;
            highp vec2 foot = at + vec2(0.0, u_rockLift - 1.0 - float(fy));
            if (fy > 1) sprite.rgb = vein(sprite.rgb, at + vec2(0.0, u_rockLift), foot, true, v_vein, v_veinNear);
            if (roofedTile(tileOf(ivec2(floor(foot)))) && underCut(ivec2(floor(at)))) sprite.rgb *= UNDER_ROCK;
            sprite.a = 1.0;
            ground = foot.y;
        }
        if (u_rowPx > 0.0) gl_FragDepth = groundDepth(ground);
    } else {
        sprite = texture(u_fontAtlas, v_texCoord);
    }
#else
    const bool painted = false;
    sprite = texture(u_fontAtlas, v_texCoord);
#endif

    // Outline: if this tile has an outline color and the current fragment is
    // in the background (alpha < 0.5) but a cardinal neighbour is inside the
    // glyph, draw the outline colour here.
    if (dot(v_outline, v_outline) > 0.001 && sprite.a < 0.5) {
        vec2 ts = u_texelSize;
        vec2 lo = v_uvBounds.xy;
        vec2 hi = v_uvBounds.zw;
        // Avoid clamping: out-of-bounds neighbours are treated as transparent
        // so the outline never bleeds past the glyph's atlas cell.
        vec2 nN = v_texCoord + vec2( 0.0, -ts.y);
        vec2 nS = v_texCoord + vec2( 0.0,  ts.y);
        vec2 nE = v_texCoord + vec2( ts.x,  0.0);
        vec2 nW = v_texCoord + vec2(-ts.x,  0.0);
        float aN = (nN.y >= lo.y) ? texture(u_fontAtlas, nN).a : 0.0;
        float aS = (nS.y <= hi.y) ? texture(u_fontAtlas, nS).a : 0.0;
        float aE = (nE.x <= hi.x) ? texture(u_fontAtlas, nE).a : 0.0;
        float aW = (nW.x >= lo.x) ? texture(u_fontAtlas, nW).a : 0.0;
        if (aN > 0.5 || aS > 0.5 || aE > 0.5 || aW > 0.5) {
            fragColor = vec4(weathered(v_outline * light), 1.0);
            return;
        }
    }

    // Use alpha channel for glyph coverage (transparent atlas = 0, glyph pixel = 1).
    // Luminance of glyph pixels drives the foreground↔detail blend:
    //   dark pixels  → v_foreground (base glyph color)
    //   bright pixels → v_detail    (highlight / shading layer)
    float luma = dot(sprite.rgb, vec3(0.299, 0.587, 0.114));
    vec3 tinted = painted ? sprite.rgb : mix(v_foreground, v_detail, luma);

    // Glyph-only overlay pass: draw only the glyph, transparent elsewhere, so the
    // terrain rendered underneath shows through (no opaque background quad).
    if (u_glyphOnly > 0.5) {
        if (sprite.a < u_alphaCut) discard;
        fragColor = vec4(weathered(tinted * light), sprite.a);
        return;
    }

    // Composite: background fills the full tile, glyph blends on top. Alpha carries the per-cell
    // background opacity (v_background.a): the opaque terrain pass has blending disabled so its 1.0
    // is ignored (output identical to the old vec3 path); the BLENDED weather layer (snow/ice wash)
    // uses fractional bg alpha so the cell washes the terrain beneath it, while its glyph pixels
    // (the snow sprites) stay fully opaque.
    if (painted && v_background.a <= 0.0 && sprite.a < 0.5) discard;
    vec3 lit = mix(v_background.rgb, tinted, sprite.a);
    fragColor = vec4(weathered(lit * light), mix(v_background.a, 1.0, sprite.a));
}