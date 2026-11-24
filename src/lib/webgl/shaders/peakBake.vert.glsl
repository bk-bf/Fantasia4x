uniform ivec2 u_size;

in vec2 a_position;
in vec2 a_uv;

out vec2 v_uv;

void main() {
    v_uv = a_uv;
#if defined(PASS_FOOT)
    gl_Position = vec4(a_position / vec2(u_size) * 2.0 - 1.0, 0.0, 1.0);
#else
    vec2 corner = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
    gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
#endif
}
