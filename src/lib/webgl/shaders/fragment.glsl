#version 300 es
/* filepath: src/lib/webgl/shaders/fragment.glsl */
precision mediump float;

in vec2 v_texCoord;
in vec3 v_foreground;
in vec3 v_background;
in vec3 v_detail;
in vec3 v_outline;
in vec4 v_uvBounds;  // (uMin, vMin, uMax, vMax) of this glyph in the atlas

uniform sampler2D u_fontAtlas;
uniform vec2 u_texelSize;  // (1/atlasWidth, 1/atlasHeight)

// Day/night ambient lighting (Phase A — LIVING-WORLD spec §Subsystem 1)
uniform float u_ambient;       // 0.0–1.0 brightness scalar
uniform vec3  u_ambient_tint;  // pre-normalised colour tint (1,1,1 = neutral)

out vec4 fragColor;

void main() {
    vec4 sprite = texture(u_fontAtlas, v_texCoord);

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
            fragColor = vec4(v_outline * u_ambient * u_ambient_tint, 1.0);
            return;
        }
    }

    // Use alpha channel for glyph coverage (transparent atlas = 0, glyph pixel = 1).
    // Luminance of glyph pixels drives the foreground↔detail blend:
    //   dark pixels  → v_foreground (base glyph color)
    //   bright pixels → v_detail    (highlight / shading layer)
    float luma = dot(sprite.rgb, vec3(0.299, 0.587, 0.114));
    vec3 tinted = mix(v_foreground, v_detail, luma);

    // Composite: background fills the full tile, glyph blends on top.
    vec3 lit = mix(v_background, tinted, sprite.a);
    fragColor = vec4(lit * u_ambient * u_ambient_tint, 1.0);
}