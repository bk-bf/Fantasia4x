#version 300 es
precision highp float;

flat in vec2 v_texel;
flat in float v_turn;
in vec2 v_cell;

uniform sampler2D u_paintAtlas;
uniform highp sampler2D u_lightTexture;
uniform float u_fieldLit;
uniform vec3 u_ambient;
uniform vec2 u_tone;
uniform float u_shade;

out vec4 fragColor;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

void main() {
    ivec2 at = ivec2(floor(v_cell));
    bool second = v_turn > 0.5 ? at == ivec2(0, 1) : at == ivec2(1, 0);
    if (at != ivec2(0) && !second) discard;
    vec4 c = texelFetch(u_paintAtlas, ivec2(v_texel), 0);
    if (c.a < 0.5) discard;
    vec3 light = u_fieldLit > 0.5
        ? texelFetch(u_lightTexture, ivec2(gl_FragCoord.xy), 0).rgb * 2.0
        : u_ambient;
    vec3 rgb = c.rgb * (second ? u_shade : 1.0) * light;
    fragColor = vec4(mix(vec3(dot(rgb, LUMA)), rgb, u_tone.x) * u_tone.y, 1.0);
}
