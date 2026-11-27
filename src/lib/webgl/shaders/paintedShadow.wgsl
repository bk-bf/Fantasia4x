const CAST_STEP = vec2f(5.0, 3.0);
const CAST_FAR = vec2f(19.0, 12.0);
const CAST_RISE: f32 = 6.0;
const CAST_TOP: f32 = 22.0;

struct Shaded {
    @location(0) color: vec4f,
    @builtin(frag_depth) depth: f32,
}

fn heightAt(art: vec2f) -> f32 {
    let t = vec2i(floor(art / shadowCast.u_tileArt)) - shadowCast.u_origin;
    let size = vec2i(textureDimensions(u_heights, 0));
    if (any(t < vec2i(0)) || any(t >= size)) {
        return 0.0;
    }
    return textureLoad(u_heights, t, 0).r * 255.0;
}

@fragment
fn fs(@builtin(position) frag: vec4f) -> Shaded {
    let art = floor((frag.xy / view.u_zoom + view.u_viewOffset) * shadowCast.u_artPerBase);
    let shaded = heightAt(art - CAST_STEP) >= CAST_RISE
        || heightAt(art - CAST_STEP * 2.0) >= CAST_RISE * 2.0
        || heightAt(art - CAST_STEP * 3.0) >= CAST_RISE * 3.0
        || heightAt(art - CAST_FAR) >= CAST_TOP;
    if (!shaded) {
        discard;
    }
    return Shaded(vec4f(shadowCast.u_shade, 1.0), shadowCast.u_depth);
}
