#version 300 es

in vec4 a_leaf;
in float a_turn;

uniform vec2 u_canvas;
uniform vec2 u_viewOffset;
uniform vec2 u_zoom;
uniform float u_basePerArt;

flat out vec2 v_texel;
flat out float v_turn;
out vec2 v_cell;

void main() {
    vec2 corner = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1));
    vec2 art = a_leaf.xy + corner * 2.0;
    vec2 px = (art * u_basePerArt - u_viewOffset) * u_zoom;
    gl_Position = vec4(px.x / u_canvas.x * 2.0 - 1.0, 1.0 - px.y / u_canvas.y * 2.0, 0.0, 1.0);
    v_texel = a_leaf.zw;
    v_turn = a_turn;
    v_cell = corner * 2.0;
}
