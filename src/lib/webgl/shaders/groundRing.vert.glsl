#version 300 es

uniform vec2 u_canvas;
uniform vec4 u_area;

void main() {
    vec2 corner = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1));
    vec2 px = u_area.xy + corner * u_area.zw;
    gl_Position = vec4(px.x / u_canvas.x * 2.0 - 1.0, 1.0 - px.y / u_canvas.y * 2.0, 0.0, 1.0);
}
