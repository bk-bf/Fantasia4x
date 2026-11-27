struct VertexOut {
    @builtin(position) position: vec4f,
    @location(0) art: vec2f,
}

@vertex
fn vs(@location(0) a_position: vec2f) -> VertexOut {
    let pos = (a_position - view.u_viewOffset) * view.u_zoom;
    var out: VertexOut;
    out.position = view.u_projection * vec4f(pos, 0.0, 1.0);
    out.art = a_position * groundStatic.u_artPerBase;
    return out;
}

const WARP_WIDE_FREQ: f32 = 0.042;
const WARP_WIDE_AMP: f32 = 22.0;
const WARP_FINE_FREQ: f32 = 0.155;
const WARP_FINE_AMP: f32 = 7.0;
const LIP_REACH: f32 = 4.0;
const LIP_STEP: f32 = 0.4;
const UNDER_HIGHER: f32 = 0.68;
const ABOVE_LOW: f32 = 0.8;
const LOW_GROUND: f32 = 2.0;
const BANK_REACH: f32 = 6.0;
const FOAM_REACH: f32 = 2.0;
const WET_REACH: f32 = 4.5;
const WET_BREAK: f32 = 0.45;
const RAPIDS: i32 = 3;
const BANK_DROP: f32 = 1.4;
const RAPIDS_RISE: f32 = 0.75;
const OPEN_CELL_DROP: f32 = 1.0;
const TONE_SCALE: f32 = 32.0;
const TONE_OFFSET: f32 = 2.0;
const EDGE_LEVELS: f32 = 8.0;
const EDGE_WOBBLE: f32 = 0.6;
const DITHER: f32 = 0.45;
const OPEN_CELL: i32 = 128;
const WATER_FPS: f32 = 8.0;
const WATER_LOOP: i32 = 16;
const WATER_BLEND: i32 = 4;
const PHASE_STEP: f32 = 0.26;
const FIELD_PERIOD: f32 = 2048.0;
const RIPPLE_CELLS: vec2f = vec2f(174.0, 553.0);
const GLINT_CELLS: vec2f = vec2f(225.0, 2253.0);
const STREAK_CELLS: vec2f = vec2f(430.0, 113.0);
const CHURN_CELLS: vec2f = vec2f(1024.0, 922.0);
const RIPPLE_CREST: f32 = 1.0;
const RIPPLE_TROUGH: f32 = 0.5;
const GLINT_RISE: f32 = 0.8;
const CHURN_WEIGHT: f32 = 0.4;
const SHADE_MASK: i32 = 7;
const SHADE_BITS: u32 = 3u;
const SOIL_ROW: i32 = 0;
const GRASS_ROW: i32 = 1;
const PEBBLE_ROW: i32 = 2;
const META_ROW: i32 = 5;
const SOIL_SHIFT: i32 = 13;
const GRASS_SHIFT: i32 = 14;
const AMOUNT: i32 = 15;
const OFFSET_STEP: i32 = 8;
const RIM: i32 = 3;
const LIP: i32 = 3;
const RAMP_PIECES: i32 = 3;
const NO_PIECE: i32 = 255;
const GRASS_RIM: f32 = 0.7;
const SOIL_LIP: f32 = 0.68;
const FAR_ART_PER_PX: f32 = 4.0;
const FAR_SHIFT: u32 = 3u;
const RAG_MID_FREQ: f32 = 0.07;
const RAG_MID_AMP: f32 = 34.0;
const RAG_FINE_FREQ: f32 = 0.28;
const RAG_FINE_AMP: f32 = 7.0;
const RAG_GRAIN: f32 = 10.0;

const WAVE_STYLE: i32 = 1;
const SEA_PHASE: i32 = 0;
const SEA_AMP: i32 = 1;
const SEA_ROUGH: i32 = 2;
const SEA_CHOPPY: i32 = 4;
const SEA_STATE: i32 = 6;
const SEA_LOOK: i32 = 7;
const SEA_DRIFT: i32 = 8;
const SEA_BREAK: i32 = 9;
const SEA_SHORE: i32 = 10;
const SEA_WIND: i32 = 11;
const SEA_SURGE: i32 = 12;
const SEA_GRAIN: i32 = 13;
const SEA_BODY: i32 = 14;
const SEA_FADE: i32 = 15;
const SEA_AIR: i32 = 16;
const SEA_RIVER: i32 = 17;
const NOISE_WRAP: i32 = 1023;
const TAU: f32 = 6.2831853;
const LAMBDA = array<f32, 4>(30.0, 19.0, 12.0, 8.0);
const ANGLE = array<f32, 4>(-0.45, -0.12, 0.22, 0.55);
const ROUGH_TURN: f32 = 1.25;
const CHOPPY_TURN: f32 = 2.0;
const FIELD_MEAN: f32 = 1.86;
const FLUID_VEC4: i32 = 7;
const WATER_FLUID: i32 = 0;
const BREEZE_SLACK: f32 = 0.05;
const BREEZE_PER_SPEED: f32 = 0.8;
const BANK_KEEP: f32 = 0.15;
const BANK_SWASH: f32 = 0.62;
const RIVER_SPREAD: f32 = 0.3;
const DIST_STEPS: f32 = 32.0;
const GRAD_STEP: f32 = 4.0;
const SEA_LIGHT: vec3f = vec3f(-0.4511, -0.5514, 0.7018);
const SEA_HALF: vec3f = vec3f(-0.2445, -0.2989, 0.9224);
const SHADE_STEPS: f32 = 4.5;
const SPEC_STEPS: f32 = 2.5;
const BANDS: i32 = 6;
const BAND_WOBBLE: f32 = 0.12;
const BAND_DITHER: f32 = 0.5;
const FOAM_HIGH: f32 = 0.62;
const FOAM_LOW: f32 = 0.36;
const FOAM_DITHER: f32 = 0.24;
const GLINT_STEP: f32 = 0.5;
const POCK_CELL: f32 = 7.0;
const POCK_RATE: f32 = 2.2;
const PULL_REACH: f32 = 2.2;
const PULL_GRAIN: vec4f = vec4f(9.0, 9.0, 4.0, 4.0);
const ICE_UNIT: f32 = 2.0;
const ICE_SHOWS: f32 = 0.08;
const ICE_REACH: f32 = 1.3;
const ICE_DEPTH: f32 = 0.85;
const ICE_CALM: f32 = 0.6;
const ICE = array<vec3f, 4>(
    vec3f(111.0, 147.0, 172.0) / 255.0, vec3f(148.0, 180.0, 198.0) / 255.0, vec3f(188.0, 211.0, 220.0) / 255.0, vec3f(221.0, 233.0, 236.0) / 255.0);
const WET_SAND = array<vec3f, 2>(vec3f(112.0, 98.0, 74.0) / 255.0, vec3f(138.0, 122.0, 92.0) / 255.0);

const BAYER = array<f32, 16>(0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
const DEEP = array<vec3f, 6>(
    vec3f(15.0, 29.0, 51.0) / 255.0, vec3f(21.0, 42.0, 71.0) / 255.0, vec3f(27.0, 58.0, 92.0) / 255.0,
    vec3f(36.0, 80.0, 114.0) / 255.0, vec3f(47.0, 104.0, 136.0) / 255.0, vec3f(74.0, 138.0, 162.0) / 255.0);
const SHALLOWS = array<vec3f, 6>(
    vec3f(28.0, 74.0, 82.0) / 255.0, vec3f(38.0, 96.0, 102.0) / 255.0, vec3f(51.0, 120.0, 122.0) / 255.0,
    vec3f(74.0, 148.0, 144.0) / 255.0, vec3f(111.0, 176.0, 164.0) / 255.0, vec3f(165.0, 210.0, 192.0) / 255.0);
const FOAM = array<vec3f, 3>(
    vec3f(169.0, 207.0, 208.0) / 255.0, vec3f(207.0, 230.0, 226.0) / 255.0, vec3f(238.0, 247.0, 242.0) / 255.0);

fn texSize(t: texture_2d<f32>) -> vec2i {
    return vec2i(textureDimensions(t));
}

fn glslMod(x: vec2f, y: vec2f) -> vec2f {
    return x - y * floor(x / y);
}

fn dither(q: vec2i) -> f32 {
    return (BAYER[((q.y & 3) << 2u) | (q.x & 3)] + 0.5) / 16.0;
}

fn hash(x: i32, y: i32, z: i32) -> f32 {
    var n = (u32(x) * 374761393u) ^ (u32(y) * 668265263u) ^ (u32(z) * 1274126177u);
    n = (n ^ (n >> 13u)) * 1274126177u;
    return f32(n ^ (n >> 16u)) / 4294967296.0;
}

fn valueNoise(p: vec2f, seed: i32) -> f32 {
    let i = floor(p);
    var f = p - i;
    f = f * f * (3.0 - 2.0 * f);
    let c = vec2i(i);
    let top = mix(hash(c.x, c.y, seed), hash(c.x + 1, c.y, seed), f.x);
    let bottom = mix(hash(c.x, c.y + 1, seed), hash(c.x + 1, c.y + 1, seed), f.x);
    return mix(top, bottom, f.y);
}

fn periodicNoise(q: vec2f, cells: vec2f, offset: vec2f, seed: i32) -> f32 {
    let g = q * cells / FIELD_PERIOD + offset;
    let i = floor(g);
    var f = g - i;
    f = f * f * (3.0 - 2.0 * f);
    let a = vec2i(glslMod(i, cells));
    let b = vec2i(glslMod(i + 1.0, cells));
    let top = mix(hash(a.x, a.y, seed), hash(b.x, a.y, seed), f.x);
    let bottom = mix(hash(a.x, b.y, seed), hash(b.x, b.y, seed), f.x);
    return mix(top, bottom, f.y);
}

fn waterPhase(q: vec2i) -> f32 {
    var frame = i32(floor(groundFrame.u_waterTime * WATER_FPS)) % WATER_LOOP;
    if (frame < WATER_BLEND
        && BAYER[((q.y & 3) << 2u) | (q.x & 3)] >= f32((frame + 1) * 16) / f32(WATER_BLEND + 1)) {
        frame += WATER_LOOP;
    }
    return f32(frame) * PHASE_STEP;
}

fn kindAt(art: vec2f) -> u32 {
    let tile = clamp(vec2i(floor(art / groundStatic.u_tileArt)), vec2i(0), groundFrame.u_mapSize - 1);
    return textureLoad(u_kinds, tile, 0).r;
}

fn tideUv(art: vec2f) -> vec2f {
    return art / groundStatic.u_tileArt / vec2f(groundFrame.u_mapSize);
}

fn tideAt(art: vec2f) -> vec2f {
    return textureSampleLevel(u_tide, linearSampler, tideUv(art), 0.0).rg;
}

fn landWithin(bank: f32, reach: f32) -> bool {
    return bank > 0.5 - reach / groundStatic.u_tileArt;
}

fn rampStep(tone: f32, q: vec2i) -> i32 {
    return clamp(i32(floor(clamp(tone, 0.0, 5.0) + 0.5 + (dither(q) - 0.5) * DITHER)), 0, 5);
}

fn water(w: vec2f, kind: i32, q: vec2i) -> vec3f {
    let ph = waterPhase(q);
    let tide = tideAt(w);
    if (landWithin(tide.g, FOAM_REACH)) {
        return FOAM[select(2, 1, ((i32(floor(ph)) + (q.x >> 2u)) & 1) == 1)];
    }
    if (landWithin(tide.g, WET_REACH) && hash(q.x >> 1u, q.y, 17) > WET_BREAK) {
        return FOAM[0];
    }
    let at = q % texSize(u_waterField);
    let fq = vec2f(at);
    let field = textureLoad(u_waterField, at, 0);
    let ripple = periodicNoise(fq, RIPPLE_CELLS, vec2f(40.0, -ph * 0.9), 33);
    var rippled = 0.0;
    if (ripple > 0.7) {
        rippled = RIPPLE_CREST;
    } else if (ripple < 0.25) {
        rippled = -RIPPLE_TROUGH;
    }
    let tone = field.r * 255.0 / TONE_SCALE - TONE_OFFSET
        + rippled
        + select(0.0, GLINT_RISE, periodicNoise(fq, GLINT_CELLS, vec2f(0.0, ph * 0.7), 39) > 0.84)
        - select(0.0, BANK_DROP, tideAt(w - vec2f(0.0, BANK_REACH)).g > 0.5);
    let edge = field.b * 255.0 / (EDGE_LEVELS - 1.0) - 0.5;
    let deep = tide.r > 0.5 + edge * EDGE_WOBBLE;
    if (kind == RAPIDS && deep) {
        let foam = periodicNoise(fq, STREAK_CELLS, vec2f(9.0, -ph * 1.7), 35)
            + (periodicNoise(fq, CHURN_CELLS, vec2f(0.0, -ph * 2.0), 39) - 0.5) * CHURN_WEIGHT;
        if (foam > 0.8) {
            return FOAM[2];
        }
        if (foam > 0.68) {
            return FOAM[1];
        }
        if (foam > 0.6) {
            return SHALLOWS[4];
        }
        return DEEP[rampStep(tone + RAPIDS_RISE, q)];
    }
    if (deep) {
        return DEEP[rampStep(tone, q)];
    }
    return SHALLOWS[rampStep(tone - select(0.0, OPEN_CELL_DROP, i32(field.g * 255.0 + 0.5) >= OPEN_CELL), q)];
}

fn wn(p: vec2f, seed: i32) -> f32 {
    let i = floor(p);
    var f = p - i;
    f = f * f * (3.0 - 2.0 * f);
    let a = vec2i(i) & vec2i(NOISE_WRAP);
    let b = (a + 1) & vec2i(NOISE_WRAP);
    let top = mix(hash(a.x, a.y, seed), hash(b.x, a.y, seed), f.x);
    let bottom = mix(hash(a.x, b.y, seed), hash(b.x, b.y, seed), f.x);
    return mix(top, bottom, f.y);
}

fn sea(i: i32) -> vec4f {
    return groundFrame.u_sea[i];
}

fn seaDir(base: i32, i: i32) -> vec2f {
    let d = sea(base + (i >> 1u));
    return select(d.zw, d.xy, (i & 1) == 0);
}

fn crest(ph: f32, chop: f32, dk: vec2f) -> vec3f {
    let s = max(sin(ph) * 0.5 + 0.5, 1e-4);
    let v = pow(s, chop);
    return vec3f(v * 2.0 - 1.0, dk * (chop * v / s * cos(ph)));
}

struct Sea {
    amp: vec4f,
    state: vec4f,
    look: vec4f,
}

fn seaNow() -> Sea {
    return Sea(sea(SEA_AMP), sea(SEA_STATE), sea(SEA_LOOK));
}

fn seaAt(wind: f32) -> Sea {
    let u = smoothstep(0.1, 1.0, wind);
    let amp = vec4f(mix(0.55, 0.9, u), mix(0.28, 1.15, u), mix(0.12, 1.0, u), mix(0.05, 0.75, u)) * mix(1.0, 1.45, u);
    let a = vec4f(mix(1.3, 2.6, u), mix(1.0, 0.25, u), mix(1.0, 1.6, u), mix(0.12, 0.9, u));
    return Sea(amp * sea(SEA_FADE),
        vec4f(a.x, clamp((a.y - 0.25) / 0.75, 0.0, 1.0), a.z, a.w),
        vec4f(mix(0.33, 0.6, u), mix(0.45, 0.35, u), 0.6 * (amp.z + amp.w) * sea(SEA_AIR).z, amp.x + amp.y + amp.z + amp.w));
}

fn turned(i: i32, turn: f32) -> vec2f {
    let g = sea(SEA_WIND).xy;
    let a = ANGLE[i] * turn;
    return vec2f(g.x * cos(a) - g.y * sin(a), g.x * sin(a) + g.y * cos(a));
}

fn waveField(p: vec2f, s: Sea, spread: f32) -> vec3f {
    let chop = s.state.x;
    let choppy = s.state.y;
    let warp = vec2f(wn(p * 0.013, 41), wn(p * 0.013 + 9.0, 41)) - 0.5;
    let qR = p + warp * 11.5;
    let qC = p + warp * 46.0;
    var h = vec3f(0.0);
    for (var i = 0; i < 4; i++) {
        let amp = s.amp[i];
        if (amp <= 0.0) {
            continue;
        }
        let k = TAU / LAMBDA[i];
        let om = sea(SEA_PHASE)[i];
        let lift = amp * (0.55 + 0.9 * wn(p * 0.012 + f32(i) * 3.1 - sea(SEA_DRIFT).xy, 43));
        if (choppy < 1.0) {
            var d: vec2f;
            if (spread < 1.0) {
                d = turned(i, ROUGH_TURN * spread);
            } else {
                d = seaDir(SEA_ROUGH, i);
            }
            let ph = dot(qR, d) * k - om + wn(qR * 0.008 + f32(i) * 7.0, 44) * 5.75;
            h += (1.0 - choppy) * lift * crest(ph, chop, d * k);
        }
        if (choppy > 0.0) {
            var d: vec2f;
            if (spread < 1.0) {
                d = turned(i, CHOPPY_TURN * spread);
            } else {
                d = seaDir(SEA_CHOPPY, i);
            }
            let ph = dot(qC, d) * k - om + wn(qC * 0.008 + f32(i) * 7.0, 44) * 11.0;
            h += choppy * lift * crest(ph, chop, d * k);
        }
    }
    return h;
}

fn shoreAt(art: vec2f) -> f32 {
    return (textureSampleLevel(u_tide, linearSampler, tideUv(art), 0.0).b * 255.0 / DIST_STEPS - 0.5) * groundStatic.u_tileArt;
}

fn warpAt(p: vec2f) -> vec2f {
    let wide = vec2f(valueNoise(p * WARP_WIDE_FREQ, 11), valueNoise(p * WARP_WIDE_FREQ, 14));
    let fine = vec2f(valueNoise(p * WARP_FINE_FREQ, 12), valueNoise(p * WARP_FINE_FREQ, 15));
    return p + (wide - 0.5) * WARP_WIDE_AMP + (fine - 0.5) * WARP_FINE_AMP;
}

fn grainAt(art: vec2i, shift: vec4f, ruffle: f32) -> f32 {
    let size = texSize(u_waterField);
    let at = ((art % size) + size) % size;
    let fq = vec2f(at);
    let field = textureLoad(u_waterField, at, 0);
    let ripple = periodicNoise(fq, RIPPLE_CELLS, vec2f(40.0, 0.0) + shift.xy * RIPPLE_CELLS / FIELD_PERIOD, 33);
    var rippled = 0.0;
    if (ripple > 0.7) {
        rippled = RIPPLE_CREST;
    } else if (ripple < 0.25) {
        rippled = -RIPPLE_TROUGH;
    }
    return field.r * 255.0 / TONE_SCALE - TONE_OFFSET
        + rippled * ruffle
        + select(0.0, GLINT_RISE, periodicNoise(fq, GLINT_CELLS, shift.zw * GLINT_CELLS / FIELD_PERIOD, 39) > 0.84);
}

fn gustAt(q: vec2f) -> f32 {
    let g = q - sea(SEA_WIND).xy * sea(SEA_BODY).z;
    let n = wn(g * 0.018, 61) * 0.65 + wn(g * 0.05 + 17.0, 62) * 0.35;
    return smoothstep(0.42, 0.7, n);
}

fn flowAt(at: vec2f) -> vec4f {
    let f = textureSampleLevel(u_flow, linearSampler, at, 0.0);
    let d = f.rg * 2.0 - 1.0;
    let len = length(d);
    var dir = vec2f(0.0);
    if (len > 0.05) {
        dir = d / len;
    }
    return vec4f(dir, f.b, f.a);
}

fn streamAt(art: vec2f) -> vec4f {
    let size = texSize(u_stream);
    let g = art / groundStatic.u_tileArt * vec2f(size) / vec2f(groundFrame.u_mapSize) - 0.5;
    let i = floor(g);
    let f = g - i;
    let a = clamp(vec2i(i), vec2i(0), size - 1);
    let b = clamp(vec2i(i) + 1, vec2i(0), size - 1);
    return mix(mix(textureLoad(u_stream, a, 0), textureLoad(u_stream, vec2i(b.x, a.y), 0), f.x),
        mix(textureLoad(u_stream, vec2i(a.x, b.y), 0), textureLoad(u_stream, b, 0), f.x), f.y);
}

struct Frame {
    p: vec2f,
    along: vec2f,
    stretch: f32,
}

fn frameAt(art: vec2f) -> Frame {
    let st = streamAt(art);
    let len = length(st.zw);
    let g = sea(SEA_WIND).xy;
    var along = g;
    if (len > 1e-4) {
        along = st.zw / len;
    }
    return Frame(g * (st.x - sea(SEA_RIVER).y) + vec2f(-g.y, g.x) * st.y, along, max(len, 1e-4));
}

fn intoFrame(fr: Frame, v: vec2f) -> vec2f {
    let g = sea(SEA_WIND).xy;
    return g * dot(v, fr.along) * fr.stretch + vec2f(-g.y, g.x) * dot(v, vec2f(-fr.along.y, fr.along.x));
}

fn slopeOutOf(fr: Frame, slope: vec2f) -> vec2f {
    let g = sea(SEA_WIND).xy;
    return fr.along * dot(slope, g) * fr.stretch + vec2f(-fr.along.y, fr.along.x) * dot(slope, vec2f(-g.y, g.x));
}

fn streakAt(p: vec2f, brk: f32) -> f32 {
    let dir = sea(SEA_WIND).xy;
    let qa = vec2f(dot(p, dir), dot(p, vec2f(-dir.y, dir.x)));
    return smoothstep(0.55, 0.85, wn(vec2f(qa.x * 0.025 - brk, qa.y * 0.35), 51));
}

fn flowGrain(art: vec2i, q: vec2f, drift: vec2f, ruffle: f32, cycle: f32) -> f32 {
    let turn = sea(SEA_AIR).w * (1.0 / cycle) + wn(q * 0.05, 71);
    let f0 = fract(turn);
    let f1 = fract(turn + 0.5);
    let w0 = 1.0 - abs(2.0 * f0 - 1.0);
    let reach = drift * cycle;
    let o0 = vec2i(floor(reach * (f0 - 0.5) + 0.5));
    let o1 = vec2i(floor(reach * (f1 - 0.5) + 0.5));
    let keep = mix(1.0, inverseSqrt(w0 * w0 + (1.0 - w0) * (1.0 - w0)), smoothstep(4.0, 16.0, length(reach)));
    let a = grainAt(art - o0, vec4f(0.0), ruffle) - FIELD_MEAN;
    let b = grainAt(art - o1, vec4f(0.0), ruffle) - FIELD_MEAN;
    return FIELD_MEAN + (a * w0 + b * (1.0 - w0)) * keep;
}

fn rainPock(a: vec2i) -> i32 {
    let rain = sea(SEA_SURGE).y;
    if (rain <= 0.0) {
        return 0;
    }
    let c = vec2i(floor(vec2f(a) / POCK_CELL));
    let tt = sea(SEA_SURGE).z * POCK_RATE + hash(c.x, c.y, 81);
    let slot = i32(floor(tt));
    let age = fract(tt);
    if (hash(c.x, c.y, 82 + slot % 97) > rain * 0.55) {
        return 0;
    }
    let centre = vec2f(c) * POCK_CELL + 1.0
        + floor(vec2f(hash(c.x, c.y, 83 + slot % 89), hash(c.x, c.y, 84 + slot % 83)) * (POCK_CELL - 2.0));
    let r = length(vec2f(a) - centre);
    if (age < 0.15 && r < 1.0) {
        return 2;
    }
    if (age < 0.7 && abs(r - age * 3.0) < 0.5) {
        return 1;
    }
    return 0;
}

fn iceAt(level: f32, q: vec2f, depth: f32, near: f32) -> f32 {
    if (level < ICE_SHOWS) {
        return -1.0;
    }
    let rough = smoothstep(10.0, 0.0, near) * 0.08 + (wn(q * 0.06, 91) - 0.5) * 0.22 + (wn(q * 0.25, 92) - 0.5) * 0.06;
    return level * ICE_REACH - depth * ICE_DEPTH + rough * min(1.0, level / 0.3) - ICE_SHOWS;
}

fn iceSheet(cell: vec2i, q: vec2f, margin: f32, depth: f32, near: f32) -> vec3f {
    let d = dither(cell);
    let wobble = depth + (wn(q * 0.05, 54) - 0.5) * BAND_WOBBLE;
    let band = clamp(i32(floor(clamp(wobble, 0.0, 1.0) * f32(BANDS - 1) + 0.5 + (d - 0.5) * BAND_DITHER)), 0, BANDS - 1);
    let deep = f32(band) / f32(BANDS - 1);
    let tier = rampStep(grainAt(cell, vec4f(0.0), 0.5), cell);
    let under = mix(SHALLOWS[tier], DEEP[min(tier + 1, 5)], deep);
    let thick = smoothstep(0.0, 0.4, margin);
    let frost = 0.14 + 0.22 * thick + 0.3 * smoothstep(6.0, 0.0, near) + (wn(q * 0.12, 98) - 0.5) * 0.16;
    let level = floor(clamp(frost, 0.0, 0.8) * 5.0 + d) / 5.0;
    let c = mix(under, ICE[2 + i32(step(0.6, frost))], level);
    if (margin < 0.02) {
        return mix(under, ICE[3], 0.35);
    }
    let crack = abs(wn(q * 0.09, 93) - 0.5) + (wn(q * 0.4, 94) - 0.5) * 0.04;
    if (crack < 0.01 && thick > 0.3) {
        return mix(c, ICE[3], 0.7);
    }
    if (thick > 0.25 && hash(cell.x >> 1u, cell.y >> 1u, 97) > 0.996) {
        return ICE[3];
    }
    return c;
}

fn blockShift() -> u32 {
    return u32(groundFrame.u_waterBlock);
}

fn blockSample(w: vec2f, cell: vec2i, shift: u32) -> vec2f {
    if (shift == 0u) {
        return w + 0.5;
    }
    return warpAt(vec2f(cell << vec2u(shift)) + f32(1 << shift) * 0.5);
}

fn frozenAt(w: vec2f, p: vec2f, c: ptr<function, vec3f>) -> bool {
    let shift = blockShift();
    let cell = vec2i(p) >> vec2u(shift);
    let s = blockSample(w, cell, shift);
    let at = s / groundStatic.u_tileArt / vec2f(groundFrame.u_mapSize);
    let level = textureSampleLevel(u_ice, linearSampler, at, 0.0).r;
    if (level < ICE_SHOWS) {
        return false;
    }
    let tide = textureSampleLevel(u_tide, linearSampler, at, 0.0);
    let dist = (tide.b * 255.0 / DIST_STEPS - 0.5) * groundStatic.u_tileArt / ICE_UNIT;
    let q = s / ICE_UNIT;
    let margin = iceAt(level, q, tide.a, dist);
    if (margin <= 0.0) {
        return false;
    }
    *c = iceSheet(cell << vec2u(shift), q, margin, tide.a, dist);
    return true;
}

fn grainCell(cell: vec2i, shift: u32, grain: f32) -> vec2i {
    return vec2i(floor(vec2f((cell << vec2u(shift)) + ((1 << shift) >> 1u)) / grain));
}

fn waveWater(w: vec2f, p: vec2f, kind: i32) -> vec3f {
    let base = WATER_FLUID * FLUID_VEC4;
    let fMove = groundFrame.u_fluid[base + 2];
    let fEdge = groundFrame.u_fluid[base + 3];
    let fBody = groundFrame.u_fluid[base + 4];
    let fTint = groundFrame.u_fluid[base + 5];
    let fFlow = groundFrame.u_fluid[base + 6];
    let shift = blockShift();
    let cell = vec2i(p) >> vec2u(shift);
    let s = blockSample(w, cell, shift);
    let unit = sea(SEA_WIND).w;
    let at = s / groundStatic.u_tileArt / vec2f(groundFrame.u_mapSize);
    let tide = textureSampleLevel(u_tide, linearSampler, at, 0.0);
    let distArt = (tide.b * 255.0 / DIST_STEPS - 0.5) * groundStatic.u_tileArt;
    let dist = distArt / unit;
    let q = s / unit;
    let slope = vec2f(shoreAt(s + vec2f(GRAD_STEP, 0.0)) - distArt, shoreAt(s + vec2f(0.0, GRAD_STEP)) - distArt) / GRAD_STEP;
    let d = dither(cell);
    let flow = flowAt(at);
    let river = flow.w;
    let current = sea(SEA_RIVER);
    let push = river * current.x;
    let edge = fMove.w * (1.0 - mix(sea(SEA_SURGE).x, BANK_SWASH, river)) * (0.6 + 0.8 * wn(q * 0.2, 55));
    if (dist < edge) {
        return WET_SAND[select(1, 0, dist > edge - fEdge.x)];
    }
    let near = dist - edge;
    let bank = mix(1.0, BANK_KEEP, river);
    let wind = sea(SEA_AIR).x;
    let local = mix(wind, clamp(BREEZE_SLACK + BREEZE_PER_SPEED * flow.z * current.z, 0.0, 1.0), current.x);
    let pushed = push > 0.002;
    let lakeSea = seaNow();
    var riverSea = lakeSea;
    var s2 = lakeSea;
    if (pushed) {
        riverSea = seaAt(local);
        s2 = seaAt(mix(wind, local, river));
    }
    let state = s2.state;
    let look = s2.look;
    let dw = near + wn(q * 0.035, 45) * 7.0 + wn(q * 0.11, 46) * 2.0;
    let arg = dw * 0.36 + sea(SEA_SHORE).x;
    let sb = max(sin(arg) * 0.5 + 0.5, 1e-4);
    let sh = pow(sb, 2.5);
    let shoal = smoothstep(45.0, 8.0, near) * (1.0 + 1.3 * smoothstep(14.0, 3.0, near));
    let bl = smoothstep(45.0, 12.0, near) * bank;
    let calm = 1.0 - min(1.0, textureSampleLevel(u_ice, linearSampler, at, 0.0).r / ICE_CALM) * 0.75;
    var seaward = vec2f(0.0);
    if (length(slope) > 1e-3) {
        seaward = normalize(slope);
    }
    let pull = sin(arg - 1.1) * smoothstep(60.0, 6.0, near) * bank;
    var gust = gustAt(q);
    var rough = wn(q * 0.3 - sea(SEA_SHORE).zw, 47);
    var capAt = wn(q * 0.45 - sea(SEA_DRIFT).zw, 50);
    var hw = vec3f(0.0);
    if (push < 0.998) {
        hw = waveField(q + sea(SEA_BODY).xy - seaward * pull * PULL_REACH, lakeSea, 1.0);
    }
    var fr = Frame(q, sea(SEA_WIND).xy, 1.0);
    if (pushed) {
        fr = frameAt(s);
        var hr = waveField(fr.p - intoFrame(fr, seaward) * pull * PULL_REACH, riverSea, RIVER_SPREAD);
        let turnedSlope = slopeOutOf(fr, hr.yz);
        hr = vec3f(hr.x, turnedSlope);
        hw = (hw * (1.0 - push) + hr * push) * inverseSqrt((1.0 - push) * (1.0 - push) + push * push);
        gust = mix(gust, gustAt(fr.p), push);
        rough = mix(rough, wn(fr.p * 0.3 - sea(SEA_SHORE).zw, 47), push);
        capAt = mix(capAt, wn(fr.p * 0.45 - sea(SEA_DRIFT).zw, 50), push);
    }
    hw *= mix(1.0, 0.3 + 0.95 * gust, 0.4 + 0.6 * sea(SEA_SURGE).w) * calm;
    hw.x += (rough - 0.5) * look.z;
    let lift = shoal * state.z * 2.2 * calm * bank;
    let surge = vec3f(sh * lift, slope * (1.25 * sh / sb * cos(arg) * 0.36 * lift));
    let h = mix(hw, surge + hw * 0.3, bl);
    let n = normalize(vec3f(-h.yz * 0.55, 1.0));
    let shade = clamp(dot(n, SEA_LIGHT) / SEA_LIGHT.z, 0.0, 2.0);
    let spec = pow(max(dot(n, SEA_HALF), 0.0), 90.0) * look.y;
    let brkAt = sea(SEA_BREAK);
    let brk = wn(q * 0.5 + brkAt.xy, 48) * 0.6 + wn(q * 1.4 - brkAt.zz, 49) * 0.4;
    let strength = sea(SEA_BODY).w;
    let cap = strength * smoothstep(0.62, 1.0, h.x / max(look.w * 0.6, 0.2))
        * smoothstep(0.45, 0.72, capAt) * state.w * (1.0 - bl * 0.7) * smoothstep(0.35, 0.8, gust);
    var streak = 0.0;
    if (state.w > 0.4 || kind == RAPIDS) {
        var streakN = streakAt(q, brkAt.w);
        if (pushed) {
            streakN = mix(streakN, streakAt(fr.p, brkAt.w), push);
        }
        streak = streakN * smoothstep(0.3, 0.7, wn(q * 0.06, 52)) * look.x
            * max((state.w - 0.4) * strength, select(0.0, 0.6, kind == RAPIDS)) * 1.6;
    }
    let run = mix(sea(SEA_SHORE).y, 1.2 + 1.04 * sea(SEA_STATE).z, river);
    var surf = smoothstep(0.55, 1.0, sh) * smoothstep(12.0, 1.5, near) * smoothstep(0.3, 0.6, brk) * state.z * 0.8 * bank;
    surf += smoothstep(run, run * 0.4, near) * smoothstep(0.28, 0.6, brk);
    surf += smoothstep(0.7, 0.0, abs(near - run * 1.5)) * smoothstep(0.45, 0.75, brk) * 0.5 * state.z * bank;
    let foam = clamp(cap + streak * 0.5 + surf, 0.0, 1.0) * fEdge.w + (d - 0.5) * FOAM_DITHER;
    if (foam > FOAM_HIGH) {
        return FOAM[select(1, 2, shade > 1.0)];
    }
    if (foam > FOAM_LOW) {
        return FOAM[0];
    }
    let pock = rainPock(cell << vec2u(shift));
    if (pock == 2) {
        return FOAM[1];
    }
    let glint = pow(max(dot(n, SEA_HALF), 0.0), 70.0) * smoothstep(0.3, 0.75, wn(q * 0.2 + sea(SEA_WIND).z, 53));
    let depth = tide.a * fBody.y + (wn(q * 0.05, 54) - 0.5) * BAND_WOBBLE;
    let band = clamp(i32(floor(clamp(depth, 0.0, 1.0) * f32(BANDS - 1) + 0.5 + (d - 0.5) * BAND_DITHER)), 0, BANDS - 1);
    let deep = f32(band) / f32(BANDS - 1);
    let grain = sea(SEA_GRAIN) + vec4f(seaward, seaward) * pull * PULL_GRAIN;
    let ruffle = smoothstep(0.15, 0.6, gust) * fMove.x;
    let art = grainCell(cell, shift, groundFrame.u_fluid[base + 1].w);
    var still = 0.0;
    if (river < 0.998) {
        still = grainAt(art, grain, ruffle);
    }
    if (river > 0.002) {
        let drift = current.x * flow.xy * flow.z * fFlow.y * current.z + (1.0 - current.x) * sea(SEA_WIND).xy * sea(SEA_AIR).y;
        still = mix(still, flowGrain(art, q, drift, ruffle, fFlow.x), river);
    }
    let tone = still
        + fBody.x
        + select(0.0, 1.5, pock == 1)
        + strength * ((shade - 1.0) * look.x * SHADE_STEPS + spec * SPEC_STEPS + select(0.0, 2.0, glint > GLINT_STEP));
    let tier = rampStep(tone, cell);
    return mix(SHALLOWS[tier], DEEP[min(tier + 1, 5)], deep) * fTint.rgb;
}

fn darken(c: vec3f, k: f32) -> vec3f {
    return vec3f(c.r * k, c.g * k, min(1.0, c.b * (k + 0.1)));
}

const STILL_UNIT: f32 = 2.0;

fn afloatAt(patchColour: vec3f, piece: bool) -> bool {
    return piece || (patchColour.g > 0.37 && patchColour.g > patchColour.r * 1.15);
}

fn stillFluid(f: i32, ground: vec3f, afloat: bool, w: vec2f, p: vec2f) -> vec3f {
    let base = f * FLUID_VEC4;
    let shifts = groundFrame.u_fluid[base];
    let slow = groundFrame.u_fluid[base + 1];
    let motion = groundFrame.u_fluid[base + 2];
    let edge = groundFrame.u_fluid[base + 3];
    let body = groundFrame.u_fluid[base + 4];
    let tint = groundFrame.u_fluid[base + 5];
    let shift = blockShift();
    let cell = vec2i(p) >> vec2u(shift);
    let s = w + 0.5;
    let at = s / groundStatic.u_tileArt / vec2f(groundFrame.u_mapSize);
    let reach = (textureSampleLevel(u_ice, linearSampler, at, 0.0).g * 255.0 / DIST_STEPS - 0.5) * groundStatic.u_tileArt / STILL_UNIT;
    let q = s / STILL_UNIT;
    let lap = sin(slow.z + wn(q * 0.05, 64) * TAU) * motion.z;
    let into = reach - motion.w * (0.6 + 0.8 * wn(q * 0.2, 55)) - lap;
    if (into < 0.0) {
        if (into > -edge.x && !afloat) {
            return darken(ground, edge.y);
        }
        return ground;
    }
    let paw = smoothstep(0.58, 0.82, wn((q - slow.xy) * 0.04, 66));
    let tone = grainAt(grainCell(cell, shift, slow.w), shifts, motion.x * (0.5 + paw)) + body.x + paw * motion.y;
    let tier = rampStep(tone, cell);
    var film = mix(SHALLOWS[tier], DEEP[min(tier + 1, 5)], body.y) * tint.rgb;
    if (into < edge.z && !afloat && hash(cell.x >> 1u, cell.y, 17) > 0.45) {
        film = mix(film, FOAM[0], edge.w);
    }
    let cover = tint.w * (0.55 + 0.45 * smoothstep(0.0, body.z, into));
    return mix(ground, film, select(cover, cover * body.w, afloat));
}

fn fieldAt(q: vec2i) -> vec4i {
    if (groundFrame.u_artPerPx >= FAR_ART_PER_PX) {
        let size = texSize(u_groundFar);
        let at = q >> vec2u(FAR_SHIFT);
        return vec4i(textureLoad(u_groundFar, (at % size + size) % size, 0) * 255.0 + 0.5);
    }
    let size = texSize(u_groundField);
    return vec4i(textureLoad(u_groundField, (q % size + size) % size, 0) * 255.0 + 0.5);
}

fn metaAt(block: vec2i, col: i32) -> vec4i {
    return vec4i(textureLoad(u_paintAtlas, block + vec2i(col, META_ROW), 0) * 255.0 + 0.5);
}

fn rampAt(block: vec2i, row: i32, at: i32) -> vec3f {
    return textureLoad(u_paintAtlas, block + vec2i(at, row), 0).rgb;
}

fn shadeAt(q: vec2i, block: vec2i, grass: bool) -> i32 {
    let shift = metaAt(block, select(SOIL_SHIFT, GRASS_SHIFT, grass)).rg * OFFSET_STEP;
    let packed = fieldAt(q + shift).r;
    return select(packed & SHADE_MASK, (packed >> SHADE_BITS) & SHADE_MASK, grass);
}

fn fieldGround(q: vec2i, block: vec2i, cover: i32) -> vec3f {
    let amount = metaAt(block, AMOUNT).r;
    let grass = cover < amount;
    let c = rampAt(block, select(SOIL_ROW, GRASS_ROW, grass), shadeAt(q, block, grass));
    if (grass) {
        return select(c, darken(c, GRASS_RIM), cover > amount - RIM);
    }
    if (groundFrame.u_artPerPx >= FAR_ART_PER_PX) {
        return c;
    }
    return select(c, darken(c, SOIL_LIP), fieldAt(q - vec2i(0, LIP)).g < amount);
}

fn fieldPiece(here: vec4i, block: vec2i, c: vec3f) -> vec3f {
    if (here.b == 0) {
        return c;
    }
    let kind = (here.b >> 4u) - 1;
    let colour = here.b & 15;
    if (NO_PIECE - here.a >= metaAt(block, kind).r) {
        return c;
    }
    if (kind < RAMP_PIECES) {
        return rampAt(block, PEBBLE_ROW + kind, colour);
    }
    return textureLoad(u_paintAtlas, vec2i(groundStatic.u_pieces) + vec2i(colour, kind + 1), 0).rgb;
}

fn ragAt(p: vec2f) -> vec2f {
    let mid = vec2f(valueNoise(p * RAG_MID_FREQ, 21), valueNoise(p * RAG_MID_FREQ, 22));
    let fine = vec2f(valueNoise(p * RAG_FINE_FREQ, 23), valueNoise(p * RAG_FINE_FREQ, 24));
    let cell = vec2i(p) >> vec2u(1u);
    let grain = vec2f(hash(cell.x, cell.y, 25), hash(cell.x, cell.y, 26));
    return (mid - 0.5) * RAG_MID_AMP + (fine - 0.5) * RAG_FINE_AMP + (grain - 0.5) * RAG_GRAIN;
}

fn raggedKind(k: u32) -> bool {
    let layer = groundStatic.u_layer[k];
    return layer.y < 0.5 && layer.z >= 0.0 && metaAt(vec2i(layer.zw), AMOUNT).b > 0;
}

@fragment
fn fs(frag: VertexOut) -> @location(0) vec4f {
    let p = floor(frag.art);
    let own = kindAt(p);
    if (own == 0u) {
        discard;
    }

    var w = warpAt(p);
    let tw = w;

    var k = kindAt(w);
    if (k == 0u) {
        k = own;
    }
    let wr = w + ragAt(p);
    let kr = kindAt(wr);
    if (kr != 0u && kr != k && groundStatic.u_layer[k].y < 0.5 && groundStatic.u_layer[kr].y < 0.5 && (raggedKind(k) || raggedKind(kr))) {
        k = kr;
        w = wr;
    }
    let layer = groundStatic.u_layer[k];
    var c: vec3f;
    if (groundDraw.u_treeOnly == 1) {
        if (layer.y > 0.5 || !treeGroundWinter(p, tw, k, &c)) {
            discard;
        }
    } else if (layer.y > 0.5) {
        if (!frozenAt(w, p, &c)) {
            if (groundFrame.u_waterStyle == WAVE_STYLE) {
                c = waveWater(w, p, i32(layer.y + 0.5));
            } else {
                c = water(w, i32(layer.y + 0.5), vec2i(p));
            }
        }
    } else {
        let patchRect = groundStatic.u_patch[k];
        let q = vec2i(p);
        let block = vec2i(layer.zw);
        let field = layer.z >= 0.0;
        var here = vec4i(0);
        if (field) {
            here = fieldAt(q);
        }
        if (patchRect.z > 0.5) {
            c = textureLoad(u_paintAtlas, vec2i(patchRect.xy) + vec2i(glslMod(p, vec2f(patchRect.z))), 0).rgb;
        } else {
            c = fieldGround(q, block, here.g);
        }
        let bare = c;
        if (field) {
            c = fieldPiece(here, block, c);
        }
        if (patchRect.w > 0.5) {
            c = stillFluid(i32(patchRect.w + 0.5) - 1, c, afloatAt(bare, any(c != bare)), w, p);
        }
        let up = kindAt(w - vec2f(0.0, LIP_REACH));
        let down = kindAt(w + vec2f(0.0, LIP_REACH));
        let upLayer = select(groundStatic.u_layer[up].xy, layer.xy, up == 0u);
        let downLayer = select(groundStatic.u_layer[down].xy, layer.xy, down == 0u);
        if (upLayer.x > layer.x + LIP_STEP && upLayer.y < 0.5) {
            c = darken(c, UNDER_HIGHER);
        } else if (downLayer.x < layer.x - LIP_STEP && downLayer.x < LOW_GROUND) {
            c = darken(c, ABOVE_LOW);
        }
        c = treeGroundOver(c, p, tw, k);
    }

    let corner = frag.art / groundStatic.u_tileArt;
    let point = textureSampleLevel(u_light, linearSampler, (corner + 0.5) / vec2f(groundFrame.u_mapSize + 1), 0.0).rgb;
    var light: vec3f;
    if (groundFrame.u_fieldLit > 0.5) {
        light = textureLoad(u_lightTexture, vec2i(frag.position.xy), 0).rgb * 2.0;
    } else {
        light = min(groundFrame.u_ambient + point * groundFrame.u_lightFlicker, vec3f(1.6));
    }
    let lit = c * light;
    return vec4f(mix(vec3f(dot(lit, vec3f(0.2126, 0.7152, 0.0722))), lit, groundFrame.u_saturation) * groundFrame.u_brightness, 1.0);
}
