#version 300 es

in vec2 a_position;

uniform float u_artPerBase;

out highp vec2 v_art;

void main() {
    vec2 pos = (a_position - u_viewOffset) * u_zoom;
    gl_Position = u_projection * vec4(pos, 0.0, 1.0);
    v_art = a_position * u_artPerBase;
}
