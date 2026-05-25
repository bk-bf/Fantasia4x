#version 300 es
/* filepath: src/lib/webgl/shaders/fragment.glsl */
precision mediump float;

in vec2 v_texCoord;
in vec3 v_foreground;
in vec3 v_background;

uniform sampler2D u_fontAtlas;

out vec4 fragColor;

void main() {
    float charAlpha = texture(u_fontAtlas, v_texCoord).r;
    
    // Use character alpha for transparency - no background mixing
    // charAlpha > 0 means we're rendering the character, charAlpha == 0 means transparent background
    if (charAlpha < 0.1) {
        // Fully transparent background
        fragColor = vec4(0.0, 0.0, 0.0, 0.0);
    } else {
        // Render character with foreground color and character's alpha
        fragColor = vec4(v_foreground, charAlpha);
    }
}