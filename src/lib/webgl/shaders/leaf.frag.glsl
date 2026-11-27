#version 300 es
precision highp float;

flat in vec2 v_texel;
flat in float v_turn;
flat in vec2 v_rgb;
flat in vec3 v_look;
in vec2 v_cell;

uniform sampler2D u_paintAtlas;
uniform highp sampler2D u_lightTexture;

out vec4 fragColor;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
const int SHAPE_LEAF = 0;
const int SHAPE_DOT = 1;
const int SHAPE_PLUS = 2;
const int SHAPE_APPLE = 3;
const int SHAPE_PUFF = 4;
const float ARM_ALPHA = 0.6;
const float APPLE_LOW = 0.62;
const float BAYER4[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);

vec3 unpacked(float c) {
    float r = floor(c / 65536.0);
    float g = floor((c - r * 65536.0) / 256.0);
    return vec3(r, g, c - r * 65536.0 - g * 256.0) / 255.0;
}

void main() {
    ivec2 at = ivec2(floor(v_cell));
    int shape = int(v_look.z + 0.5);
    float alpha = v_look.y;
    float glow = v_look.x;
    vec3 rgb;
    if (shape == SHAPE_LEAF) {
        bool second = v_turn > 0.5 ? at == ivec2(0, 1) : at == ivec2(1, 0);
        if (at != ivec2(0) && !second) discard;
        vec4 c = texelFetch(u_paintAtlas, ivec2(v_texel), 0);
        if (c.a < 0.5) discard;
        rgb = c.rgb * (second ? u_shade : 1.0);
    } else if (shape == SHAPE_DOT) {
        if (at != ivec2(0)) discard;
        rgb = unpacked(v_rgb.x);
    } else if (shape == SHAPE_PLUS) {
        ivec2 d = abs(at);
        if (d.x + d.y > 1) discard;
        bool arm = d.x + d.y == 1;
        rgb = unpacked(arm ? v_rgb.y : v_rgb.x);
        if (arm) {
            alpha *= ARM_ALPHA;
            glow *= ARM_ALPHA;
        }
    } else if (shape == SHAPE_APPLE) {
        if (at.x < 0 || at.y < 0 || at.x > 1 || at.y > 1) discard;
        rgb = unpacked(v_rgb.x) * (at.y == 1 ? APPLE_LOW : 1.0);
    } else {
        bool puff = at == ivec2(0) || at == ivec2(1, 0) || at == ivec2(0, -1) || at == ivec2(-1, 0) || at == ivec2(1, -1) || at == ivec2(-1, 1);
        if (!puff) discard;
        rgb = unpacked(v_rgb.x);
    }
    ivec2 b = ivec2(gl_FragCoord.xy) & 3;
    if (alpha < 1.0 && alpha <= (BAYER4[(b.y << 2) | b.x] + 0.5) / 16.0) discard;
    vec3 light = u_fieldLit > 0.5
        ? texelFetch(u_lightTexture, ivec2(gl_FragCoord.xy), 0).rgb * 2.0
        : u_ambient;
    light = mix(light, vec3(1.0), glow);
    rgb *= light;
    fragColor = vec4(mix(vec3(dot(rgb, LUMA)), rgb, u_tone.x) * u_tone.y, 1.0);
}
