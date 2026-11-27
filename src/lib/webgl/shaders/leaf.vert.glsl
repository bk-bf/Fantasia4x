#version 300 es

in vec4 a_leaf;
in float a_turn;
in vec2 a_rgb;
in vec3 a_look;

uniform float u_basePerArt;

flat out vec2 v_texel;
flat out float v_turn;
flat out vec2 v_rgb;
flat out vec3 v_look;
out vec2 v_cell;

const float SPAN = 4.0;

void main() {
    vec2 corner = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1));
    vec2 art = a_leaf.xy - 1.0 + corner * SPAN;
    vec2 px = (art * u_basePerArt - u_viewOffset) * u_zoom;
    gl_Position = vec4(px.x / u_canvas.x * 2.0 - 1.0, 1.0 - px.y / u_canvas.y * 2.0, 0.0, 1.0);
    v_texel = a_leaf.zw;
    v_turn = a_turn;
    v_rgb = a_rgb;
    v_look = a_look;
    v_cell = corner * SPAN - 1.0;
}
