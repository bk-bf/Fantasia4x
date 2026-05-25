#version 300 es
/* filepath: src/lib/webgl/shaders/fragment.glsl */
precision mediump float;

in vec2 v_texCoord;
in vec3 v_foreground;
in vec3 v_background;
in vec3 v_detail;

uniform sampler2D u_fontAtlas;

out vec4 fragColor;

void main() {
    vec4 sprite = texture(u_fontAtlas, v_texCoord);

    // Use alpha channel for glyph coverage (transparent atlas = 0, glyph pixel = 1).
    // Luminance of glyph pixels drives the foreground↔detail blend:
    //   dark pixels  → v_foreground (base glyph color)
    //   bright pixels → v_detail    (highlight / shading layer)
    float luma = dot(sprite.rgb, vec3(0.299, 0.587, 0.114));
    vec3 tinted = mix(v_foreground, v_detail, luma);

    // Composite: background fills the full tile, glyph blends on top.
    fragColor = vec4(mix(v_background, tinted, sprite.a), 1.0);
}