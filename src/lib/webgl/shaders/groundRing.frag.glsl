#version 300 es
precision highp float;

out vec4 fragColor;

bool onRing(vec2 p) {
    vec2 outer = u_ring.zw * 0.5;
    vec2 d = p - (u_ring.xy + outer);
    if (dot(d / outer, d / outer) > 1.0) return false;
    vec2 inner = outer - u_line;
    return inner.x <= 0.0 || inner.y <= 0.0 || dot(d / inner, d / inner) >= 1.0;
}

void main() {
    vec2 p = vec2(gl_FragCoord.x, u_canvas.y - gl_FragCoord.y);
    if (onRing(p)) fragColor = vec4(u_color, 1.0);
    else if (onRing(p - u_offset)) fragColor = vec4(u_shadow, 1.0);
    else discard;
}
