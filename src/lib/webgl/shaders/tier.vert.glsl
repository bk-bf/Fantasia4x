#version 300 es

uniform mat4 u_projection;
uniform vec2 u_viewOffset;
uniform vec2 u_zoom;
uniform highp float u_atlasScale;
uniform highp vec4 u_rect;

out highp vec2 v_art;

const vec2 CORNERS[6] = vec2[6](vec2(0.0), vec2(1.0, 0.0), vec2(0.0, 1.0), vec2(1.0, 0.0), vec2(1.0), vec2(0.0, 1.0));

void main() {
    highp vec2 art = mix(u_rect.xy, u_rect.zw, CORNERS[gl_VertexID]);
    vec2 base = art / u_atlasScale;
    gl_Position = u_projection * vec4((base - u_viewOffset) * u_zoom, 0.0, 1.0);
    v_art = art;
}
