const LUMA = vec3f(0.2126, 0.7152, 0.0722);

fn weathered(c: vec3f, saturation: f32, brightness: f32) -> vec3f {
    return mix(vec3f(dot(c, LUMA)), c, saturation) * brightness;
}
