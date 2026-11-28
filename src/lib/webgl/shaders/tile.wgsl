const CUT_MAX: i32 = 16;
const CUT_EDGE: f32 = 34.0;
const CUT_SOFT: f32 = 6.0;
const CUT_KEEP: f32 = 0.14;
const FACE_ALPHA: i32 = 254;
const FACE_ROWS: i32 = 22;
const OBJECT_FOOT: f32 = 23.0;

struct GlyphIn {
    @location(0) a_position: vec2f,
    @location(1) a_texCoord: vec2f,
    @location(2) a_foreground: vec3f,
    @location(3) a_background: vec4f,
    @location(4) a_detail: vec3f,
    @location(5) a_outline: vec3f,
    @location(6) a_uvBounds: vec4f,
    @location(7) a_light: vec3f,
}

struct RowIn {
    @location(8) a_row: f32,
    @location(9) a_vein: vec4f,
    @location(10) a_veinNear: f32,
    @location(11) a_sway: f32,
    @location(12) a_tree: f32,
}

struct TileOut {
    @builtin(position) position: vec4f,
    @location(0) texCoord: vec2f,
    @location(1) foreground: vec3f,
    @location(2) background: vec4f,
    @location(3) detail: vec3f,
    @location(4) outline: vec3f,
    @location(5) uvBounds: vec4f,
    @location(6) light: vec3f,
    @location(7) world: vec2f,
    @location(8) @interpolate(flat) vein: vec4f,
    @location(9) @interpolate(flat) veinNear: f32,
    @location(10) @interpolate(flat) row: f32,
    @location(11) @interpolate(flat) bend: vec4f,
    @location(12) @interpolate(flat) place: vec4f,
    @location(13) @interpolate(flat) tree: vec4f,
}

struct TilePixel {
    @location(0) color: vec4f,
    @builtin(frag_depth) depth: f32,
}

var<private> vary: TileOut;

fn floorMod(x: f32, y: f32) -> f32 {
    return x - y * floor(x / y);
}

fn gustCell(c: vec2i) -> f32 {
    var h = u32(c.x) * 374761393u + u32(c.y) * 668265263u;
    h = (h ^ (h >> 13u)) * 1274126177u;
    h = h ^ (h >> 16u);
    return f32(h & 65535u) / 65535.0;
}

fn valueNoise(p: vec2f) -> f32 {
    let i = floor(p);
    var f = p - i;
    f = f * f * (3.0 - 2.0 * f);
    let c = vec2i(i);
    let top = mix(gustCell(c), gustCell(c + vec2i(1, 0)), f.x);
    let bottom = mix(gustCell(c + vec2i(0, 1)), gustCell(c + vec2i(1, 1)), f.x);
    return mix(top, bottom, f.y);
}

const PIECE_DEPTH_V: f32 = 0.5;
const PIECE_LIFT_V: f32 = 0.6;
const GUST_WIDE = vec2f(250.0, 420.0);
const GUST_FINE = vec2f(85.0, 140.0);
const GUST_FINE_PACE: f32 = 1.4;
const GUST_FINE_SHARE: f32 = 0.32;
const SHARE_LULL = vec2f(0.72, 0.2);
const SHARE_EDGE: f32 = 0.12;
const BOW_LANE = vec2f(230.0, 96.0);
const BOW_DEPTH = vec2f(0.8, 0.5);
const BOW_RAGGED: f32 = 0.6;
const BOW_RUN: f32 = 380.0;
const TREE_SCALE = vec2f(100.0, 1.6);
const PLANT_SCALE = vec2f(40.0, 1.0);
const TREE_LOOP: f32 = 3.3;
const PLANT_LOOP: f32 = 2.7;
const TREE_RIDE: f32 = 4.4;
const PLANT_RIDE: f32 = 3.0;
const CROWN_LEAN: f32 = 6.0;
const CROWN_LAG: f32 = 0.38;
const SIZE_SPAN = vec2f(24.0, 190.0);
const HEAVE_LAG: f32 = 0.7;
const SIZE_TEMPO = vec2f(0.7, 1.4);

fn airFrame(p: vec2f) -> vec2f {
    let dir = tileFrame.u_windDir;
    let q = p - tileFrame.u_windFrame.xy;
    return vec2f(dot(q, dir), dot(q, vec2f(-dir.y, dir.x))) + tileFrame.u_windFrame.zw;
}

fn laneEdge(k: i32, salt: i32) -> f32 {
    return f32(k) + (gustCell(vec2i(k, salt)) - 0.5) * BOW_RAGGED;
}

fn bowOf(side: f32, run: f32, lane: f32, deep: f32, salt: i32) -> f32 {
    let x = side / lane;
    let k = i32(floor(x + 0.5));
    let here = laneEdge(k, salt);
    let before = x < here;
    let id = select(k, k - 1, before);
    let lo = select(here, laneEdge(k - 1, salt), before);
    let hi = select(laneEdge(k + 1, salt), here, before);
    let u = (x - lo) / (hi - lo);
    let r = run / BOW_RUN;
    let n = i32(floor(r));
    var t = r - f32(n);
    t = t * t * (3.0 - 2.0 * t);
    let share = mix(gustCell(vec2i(id * 7 + salt, n)), gustCell(vec2i(id * 7 + salt, n + 1)), t);
    return lane * (hi - lo) * deep * (0.25 + 0.75 * share) * 4.0 * u * (1.0 - u);
}

fn bowAt(side: f32, run: f32) -> f32 {
    return bowOf(side, run, BOW_LANE.x, BOW_DEPTH.x, 3) + bowOf(side, run, BOW_LANE.y, BOW_DEPTH.y, 5);
}

fn airAt(p: vec2f, travelled: f32) -> f32 {
    let f = airFrame(p);
    let along = f.x - bowAt(f.y, f.x - travelled);
    let wide = valueNoise(vec2f(along - travelled, f.y) / GUST_WIDE);
    let fine = valueNoise(vec2f(along - travelled * GUST_FINE_PACE, f.y) / GUST_FINE + 17.0);
    let lull = mix(SHARE_LULL.x, SHARE_LULL.y, tileFrame.u_wind.x);
    return smoothstep(lull, lull + SHARE_EDGE, mix(wide, fine, GUST_FINE_SHARE));
}

fn bySize(foot: vec2f, tall: f32, tree: bool) -> vec4f {
    let s = tileFrame.u_wind.x;
    let travelled = tileFrame.u_wind.y;
    let pace = tileFrame.u_windPace;
    let k = select(PLANT_SCALE, TREE_SCALE, tree);
    let scale = clamp(tall / k.x, 0.4, k.y);
    let size = smoothstep(SIZE_SPAN.x, SIZE_SPAN.y, tall);
    let lag = HEAVE_LAG * size;
    let air = airAt(foot, travelled - pace * lag);
    var late = air;
    if (tree) {
        late = airAt(foot, travelled - pace * (lag + CROWN_LAG));
    }
    let trunk = select(0.0, scale * CROWN_LEAN * s * s * (0.5 + 0.5 * air), tree);
    let ride = scale * select(PLANT_RIDE, TREE_RIDE, tree) * (0.35 * s + 0.65 * late);
    return vec4f(trunk, ride, air, scale * select(PLANT_LOOP, TREE_LOOP, tree));
}

fn tileVertex(glyph: GlyphIn, row: RowIn) -> TileOut {
    var pos = (glyph.a_position - view.u_viewOffset) * view.u_zoom;
    var out: TileOut;
    out.bend = vec4f(0.0);
    out.place = vec4f(0.0);
    out.tree = vec4f(0.0);
    var texCoord = glyph.a_texCoord;
    let span = glyph.a_uvBounds.w - glyph.a_uvBounds.y;
    let wind = tileFrame.u_wind;
    if (row.a_sway > 0.0 && wind.x > 0.0 && span > 0.0) {
        let texel = tileStatic.u_paintTexelSize;
        let dir = tileFrame.u_windDir;
        let foot = (row.a_vein.zw + vec2f(0.5, 1.0)) * wind.w;
        let local = (glyph.a_texCoord - (glyph.a_uvBounds.xy - vec2f(2.0, 0.0))) / texel;
        let tall = span / texel.y;
        let bend = bySize(foot, tall, row.a_tree > 0.0);
        out.bend = bend;
        let tempo = 1.0 / mix(SIZE_TEMPO.x, SIZE_TEMPO.y, smoothstep(SIZE_SPAN.x, SIZE_SPAN.y, tall));
        out.place = vec4f(glyph.a_position * tileStatic.u_atlasScale - local, bowAt(airFrame(foot).y, 0.0), tempo);
        out.tree = vec4f(1.0, bend.z, row.a_tree, foot.x);
        let most = bend.x + bend.y + bend.w;
        let shove = vec2f(most * dir.x, most * dir.y * PIECE_DEPTH_V);
        var veil = 0.0;
        if ((i32(row.a_tree) & TREE_CURTAIN) != 0) {
            let v = tileFrame.u_treeVeil;
            veil = ceil(wind.x * (v.x + v.y + v.z));
        }
        let left = glyph.a_texCoord.x * 2.0 < glyph.a_uvBounds.x + glyph.a_uvBounds.z - 4.0;
        let top = glyph.a_texCoord.y * 2.0 < glyph.a_uvBounds.y + glyph.a_uvBounds.w;
        let reach = vec2f(
            select(1.0, -1.0, left) * (ceil(max(0.0, select(shove.x, -shove.x, left))) + veil + 1.0),
            select(ceil(max(0.0, shove.y)) + 1.0, -(ceil(max(0.0, -shove.y) + bend.w * PIECE_LIFT_V) + 1.0), top)
        );
        pos += reach * tileFrame.u_basePerArt * view.u_zoom;
        texCoord += reach * texel;
    }
    out.position = view.u_projection * vec4f(pos, 0.0, 1.0);
    out.position.z = (0.5 - 0.5 * row.a_row * tileStatic.u_rowDepth) * out.position.w;
    out.texCoord = texCoord;
    out.foreground = glyph.a_foreground;
    out.background = glyph.a_background;
    out.detail = glyph.a_detail;
    out.outline = glyph.a_outline;
    out.uvBounds = glyph.a_uvBounds;
    out.light = glyph.a_light;
    out.world = glyph.a_position;
    out.vein = row.a_vein;
    out.veinNear = row.a_veinNear;
    out.row = row.a_row;
    return out;
}

fn tileTone(c: vec3f) -> vec3f {
    return weathered(c, tileFrame.u_saturation, tileFrame.u_brightness);
}

fn rockTop(rim: i32, p: vec2i) -> vec3f {
    let shade = rockShade(rim, p);
    if (snowLies(p, 0, rim, false, tileFrame.u_snow)) {
        return snowOn(p, shade, rim, 0.0, tileStatic.u_snowRamp);
    }
    return textureLoad(u_paintAtlas, vec2i(tileStatic.u_rockRamp) + vec2i(shade, 0), 0).rgb;
}

fn offSprite(uv: vec2f) -> bool {
    let cell = vary.uvBounds - vec4f(2.0, 0.0, 2.0, 0.0);
    return uv.x < cell.x || uv.x > cell.z || uv.y < cell.y || uv.y > cell.w;
}

fn paintedUv(uv: vec2f) -> vec2f {
    let cell = vary.uvBounds - vec4f(2.0, 0.0, 2.0, 0.0);
    let inset = 0.5 / vec2f(textureDimensions(u_paintAtlas, 0));
    return clamp(uv, cell.xy + inset, cell.zw - inset);
}

fn sampled(t: texture_2d<f32>, uv: vec2f) -> vec4f {
    return textureSampleLevel(t, nearestSampler, uv, 0.0);
}

fn treePart(uv: vec2f) -> bool {
    return sampled(u_lightAtlas, uv).b > 0.0;
}

fn cutAway(at: vec2f, part: bool) -> bool {
    if (tileFrame.u_cuts < 0.5 || !part) {
        return false;
    }
    let p = vec2i(floor(at));
    let edge = CUT_EDGE + roofWobble(p);
    var keep = 1.0;
    for (var i = 0; i < CUT_MAX; i++) {
        if (f32(i) >= tileFrame.u_cuts) {
            break;
        }
        let c = tileFrame.u_cut[i];
        if (c.z >= vary.row) {
            continue;
        }
        let d = length((at - c.xy) * vec2f(1.0, 1.1));
        if (d < edge) {
            keep = min(keep, CUT_KEEP + (1.0 - CUT_KEEP) * clamp((d - edge + CUT_SOFT) / CUT_SOFT, 0.0, 1.0));
        }
    }
    if (keep >= 1.0) {
        return false;
    }
    return bayer(p) >= keep;
}

fn groundDepth(ground: f32) -> f32 {
    return 0.5 - 0.5 * ground / tileStatic.u_rowPx * tileStatic.u_rowDepth;
}


fn tilePixel(frag: TileOut) -> TilePixel {
    vary = frag;
    let rowPx = tileStatic.u_rowPx;
    let rockLift = tileStatic.u_rockLift;
    var depth = frag.position.z;
    if (rowPx > 0.0) {
        depth = groundDepth(frag.row * rowPx + OBJECT_FOOT);
    }
    var light = min(tileFrame.u_ambient + frag.light * tileFrame.u_lightFlicker, vec3f(1.6));
    if (tileFrame.u_fieldLit > 0.5) {
        light = textureLoad(u_lightTexture, vec2i(frag.position.xy), 0).rgb * 2.0;
    }
    if (PAINTED && tileDraw.u_shadowPass > 0.5) {
        if (frag.uvBounds.x < 2.0 || offSprite(frag.texCoord) || sampled(u_lightAtlas, paintedUv(frag.texCoord)).g < 0.5) {
            discard;
        }
        return TilePixel(vec4f(tileStatic.u_shade, 1.0), tileStatic.u_shadowDepth);
    }
    if (tileDraw.u_bgOnly > 0.5) {
        return TilePixel(vec4f(tileTone(frag.background.rgb * light), frag.background.a), depth);
    }
    var sprite: vec4f;
    let painted = PAINTED && frag.uvBounds.x >= 2.0;
    if (painted) {
        let at = frag.world * tileStatic.u_atlasScale;
        if (frag.tree.x > 0.0) {
            g_treeFlags = i32(frag.tree.z + 0.5);
            g_parts = g_treeFlags > 0;
            let size = vec2f(textureDimensions(u_paintAtlas, 0));
            let cell = frag.uvBounds - vec4f(2.0, 0.0, 2.0, 0.0);
            g_treeOrg = vec2i(floor(cell.xy * size + 0.5));
            g_treeDim = vec2i(floor((cell.zw - cell.xy) * size + 0.5));
            let q = vec2i(floor((frag.texCoord - cell.xy) * size));
            var colour = vec4f(0.0);
            var px: TreePixel;
            if (g_parts) {
                px = treePixelAt(q, &colour);
            } else {
                px = pieceAt(q);
                if (px.hit && inTree(px.at)) {
                    colour = textureLoad(u_paintAtlas, g_treeOrg + px.at, 0);
                }
            }
            var glow = px.mark.r;
            sprite = vec4f(0.0);
            if (px.hit) {
                sprite = colour;
                if (g_parts) {
                    sprite = treeColor(px, colour, vec2i(floor(at)), &glow);
                } else {
                    let rise = clamp(f32(g_treeDim.y - px.at.y) / f32(g_treeDim.y), 0.0, 1.0);
                    sprite = vec4f(sprite.rgb * (1.0 + SHEEN * frag.bend.z * smoothstep(0.15, 0.9, rise)), sprite.a);
                }
                sprite = vec4f(sprite.rgb * px.shade, sprite.a);
            }
            if (tileFrame.u_fieldLit > 0.5 && px.hit && glow > 0.0) {
                light = mix(tileFrame.u_ambient, vec3f(1.0), glow);
            }
            if (sprite.a > 0.0 && cutAway(at, px.hit && (g_parts || (markCode(px.mark) & 15) != 0))) {
                discard;
            }
        } else {
            let off = offSprite(frag.texCoord);
            let uv = paintedUv(frag.texCoord);
            sprite = vec4f(0.0);
            if (!off) {
                sprite = sampled(u_paintAtlas, uv);
            }
            if (tileFrame.u_fieldLit > 0.5 && !off) {
                let glow = sampled(u_lightAtlas, uv).r;
                if (glow > 0.0) {
                    light = mix(tileFrame.u_ambient, vec3f(1.0), glow);
                }
            }
            if (sprite.a > 0.0 && !off && cutAway(at, treePart(uv))) {
                discard;
            }
        }
        let alpha = i32(sprite.a * 255.0 + 0.5);
        var ground = frag.row * rowPx + OBJECT_FOOT;
        if (alpha == 255 && sprite.r > 0.99 && sprite.b > 0.99 && sprite.g < 0.05) {
            let top = at + vec2f(0.0, rockLift);
            var rgb = vein(rockTop(i32(sprite.g * 255.0 + 0.5), vec2i(floor(top))), top, top, false, frag.vein, frag.veinNear);
            if (underCut(vec2i(floor(at)), rockLift)) {
                rgb *= UNDER_ROCK;
            }
            sprite = vec4f(rgb, sprite.a);
            ground = top.y;
        } else if (alpha <= FACE_ALPHA && alpha > FACE_ALPHA - FACE_ROWS) {
            let fy = FACE_ALPHA - alpha;
            let foot = at + vec2f(0.0, rockLift - 1.0 - f32(fy));
            var rgb = sprite.rgb;
            if (fy > 1) {
                rgb = vein(rgb, at + vec2f(0.0, rockLift), foot, true, frag.vein, frag.veinNear);
            }
            if (roofedTile(tileOf(vec2i(floor(foot)))) && underCut(vec2i(floor(at)), rockLift)) {
                rgb *= UNDER_ROCK;
            }
            sprite = vec4f(rgb, 1.0);
            ground = foot.y;
        }
        if (rowPx > 0.0) {
            depth = groundDepth(ground);
        }
    } else {
        sprite = sampled(u_fontAtlas, frag.texCoord);
    }
    if (dot(frag.outline, frag.outline) > 0.001 && sprite.a < 0.5) {
        let ts = tileStatic.u_texelSize;
        let lo = frag.uvBounds.xy;
        let hi = frag.uvBounds.zw;
        let nN = frag.texCoord + vec2f(0.0, -ts.y);
        let nS = frag.texCoord + vec2f(0.0, ts.y);
        let nE = frag.texCoord + vec2f(ts.x, 0.0);
        let nW = frag.texCoord + vec2f(-ts.x, 0.0);
        let aN = select(0.0, sampled(u_fontAtlas, nN).a, nN.y >= lo.y);
        let aS = select(0.0, sampled(u_fontAtlas, nS).a, nS.y <= hi.y);
        let aE = select(0.0, sampled(u_fontAtlas, nE).a, nE.x <= hi.x);
        let aW = select(0.0, sampled(u_fontAtlas, nW).a, nW.x >= lo.x);
        if (aN > 0.5 || aS > 0.5 || aE > 0.5 || aW > 0.5) {
            return TilePixel(vec4f(tileTone(frag.outline * light), 1.0), depth);
        }
    }
    let luma = dot(sprite.rgb, vec3f(0.299, 0.587, 0.114));
    let tinted = select(mix(frag.foreground, frag.detail, luma), sprite.rgb, painted);
    if (tileDraw.u_glyphOnly > 0.5) {
        if (sprite.a < tileStatic.u_alphaCut) {
            discard;
        }
        return TilePixel(vec4f(tileTone(tinted * light), sprite.a), depth);
    }
    if (painted && frag.background.a <= 0.0 && sprite.a < 0.5) {
        discard;
    }
    let lit = mix(frag.background.rgb, tinted, sprite.a);
    return TilePixel(vec4f(tileTone(lit * light), mix(frag.background.a, 1.0, sprite.a)), depth);
}
