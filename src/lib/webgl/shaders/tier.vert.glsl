#version 300 es

out highp vec2 v_art;

const vec2 CORNERS[6] = vec2[6](vec2(0.0), vec2(1.0, 0.0), vec2(0.0, 1.0), vec2(1.0, 0.0), vec2(1.0), vec2(0.0, 1.0));

void main() {
    highp vec2 art = mix(u_rect.xy, u_rect.zw, CORNERS[gl_VertexID]);
    vec2 base = art / u_atlasScale;
    gl_Position = u_projection * vec4((base - u_viewOffset) * u_zoom, 0.0, 1.0);
    v_art = art;
}
