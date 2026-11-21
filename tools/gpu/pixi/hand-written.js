window.handWritten = function synthetic({ W, H, ts, draws }) {
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const gl = cv.getContext('webgl2', { antialias: false, depth: true, alpha: false });
  if (!gl) return { error: 'no WebGL2' };
  const MW = 500, MH = 500, cols = Math.min(MW, Math.ceil(W / ts)), rows = Math.min(MH, Math.ceil(H / ts));
  const prog = (vs, fs) => { const p = gl.createProgram(); for (const [t, s] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) { const sh = gl.createShader(t); gl.shaderSource(sh, '#version 300 es\nprecision highp float;\n' + s); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); gl.attachShader(p, sh); } gl.linkProgram(p); return p; };
  const tex = (w, h, data, fmt, rep) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1); gl.texImage2D(gl.TEXTURE_2D, 0, fmt === 'r' ? gl.R8 : gl.RGBA, w, h, 0, fmt === 'r' ? gl.RED : gl.RGBA, gl.UNSIGNED_BYTE, data); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); const wr = rep ? gl.REPEAT : gl.CLAMP_TO_EDGE; gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wr); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wr); return t; };
  const rnd = (n) => { const a = new Uint8Array(n); for (let i = 0; i < n; i++) a[i] = (Math.imul(i + 7, 2654435761) >>> 24); return a; };
  const atlasD = new Uint8Array(256 * 256 * 4);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) { const i = (y * 256 + x) * 4, cx = (x & 31) - 15.5, cy = (y & 31) - 15.5, inside = cx * cx + cy * cy < 150; atlasD[i] = 60 + (x * 7 & 127); atlasD[i + 1] = 90 + (y * 5 & 127); atlasD[i + 2] = 50; atlasD[i + 3] = inside ? 255 : 0; }
  const atlas = tex(256, 256, atlasD, 'rgba'), idT = (() => { const d = new Uint8Array(MW * MH); for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) d[y * MW + x] = (Math.floor(x / 9) * 3 + Math.floor(y / 7) * 5) & 7; return tex(MW, MH, d, 'r'); })();
  const noiseT = tex(64, 64, rnd(64 * 64 * 4), 'rgba', true), groundT = tex(512, 64, rnd(512 * 64 * 4), 'rgba', true);
  const quads = (list) => { const f = new Float32Array(list.length * 6 * 9); let o = 0; for (const q of list) for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 0], [1, 1], [0, 1]]) { f[o++] = q.x + dx * q.w; f[o++] = q.y + dy * q.h; f[o++] = q.z; f[o++] = (q.u + dx) / 8; f[o++] = (q.v + dy) / 8; f[o++] = q.r; f[o++] = q.g; f[o++] = q.b; f[o++] = dy ? 0 : q.sway; } const vao = gl.createVertexArray(), vbo = gl.createBuffer(); gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bufferData(gl.ARRAY_BUFFER, f, gl.STATIC_DRAW); const st = 36; [[0, 2, 0], [1, 1, 8], [2, 2, 12], [3, 3, 20], [4, 1, 32]].forEach(([l, n, off]) => { gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, n, gl.FLOAT, false, st, off); }); return { vao, n: list.length * 6 }; };
  const terrain = [], glyphs = [], sprites = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const h = Math.imul(x * 73856093 ^ y * 19349663, 2654435761) >>> 0;
    terrain.push({ x: x * ts, y: y * ts, w: ts, h: ts, z: 0, u: h & 7, v: (h >> 3) & 7, r: .4, g: .6, b: .3, sway: 0 });
    if ((h >>> 8) % 100 < 45) { glyphs.push({ x: x * ts, y: y * ts, w: ts, h: ts, z: 0, u: (h >> 6) & 7, v: (h >> 9) & 7, r: .8, g: .7, b: .3, sway: 0 }); sprites.push({ x: x * ts - ts * .5, y: y * ts - ts * 2, w: ts * 2, h: ts * 3, z: (y + 1) / (rows + 2), u: (h >> 6) & 7, v: (h >> 9) & 7, r: 1, g: 1, b: 1, sway: ts * .08 }); }
  }
  const VS = `layout(location=0) in vec2 p; layout(location=1) in float z; layout(location=2) in vec2 uv; layout(location=3) in vec3 col; layout(location=4) in float sway; uniform vec2 res; uniform float t; out vec2 vuv; out vec3 vc;
    void main(){ vec2 q = p + vec2(sway * sin(t * 1.3 + p.y * .05 + p.x * .02), 0.); gl_Position = vec4(q / res * 2. - 1., 1. - z * 2., 1.); gl_Position.y = -gl_Position.y; vuv = uv; vc = col; }`;
  const pMask = prog(VS, `uniform sampler2D a; in vec2 vuv; in vec3 vc; out vec4 o; void main(){ vec4 s = texture(a, vuv); float l = dot(s.rgb, vec3(.299,.587,.114)); o = vec4(mix(vec3(.09,.07,.04), mix(vc*.3, vc, l), s.a), 1.); }`);
  const pGlyph = prog(VS, `uniform sampler2D a; in vec2 vuv; in vec3 vc; out vec4 o; void main(){ vec4 s = texture(a, vuv); float l = dot(s.rgb, vec3(.299,.587,.114)); o = vec4(mix(vc*.3, vc, l), s.a); }`);
  const pSprite = prog(VS, `uniform sampler2D a; in vec2 vuv; in vec3 vc; out vec4 o; void main(){ vec4 s = texture(a, vuv); if (s.a < .5) discard; o = vec4(s.rgb * vc, 1.); }`);
  const pBlend = prog(`void main(){ vec2 p = vec2(gl_VertexID & 1, gl_VertexID >> 1) * 4. - 1.; gl_Position = vec4(p, .999, 1.); }`,
    `uniform sampler2D ids, nz, gr; uniform vec2 res; uniform float ts, t; out vec4 o;
     float idAt(vec2 w){ return texture(ids, (floor(w / ts) + .5) / vec2(500., 500.)).r * 255.; }
     vec3 ground(float id, vec2 w){ return texture(gr, vec2((id + fract(w / 64.).x) / 8., fract(w.y / 64.))).rgb; }
     void main(){ vec2 px = vec2(gl_FragCoord.x, res.y - gl_FragCoord.y), w = px * (32. / ts);
       vec2 n1 = texture(nz, w / 256.).rg - .5, n2 = texture(nz, w / 61.).ba - .5; vec2 ww = w + n1 * 22. + n2 * 7.;
       float id = idAt(ww * ts / 32.), up = idAt((ww + vec2(0., -4.)) * ts / 32.), dn = idAt((ww + vec2(0., 4.)) * ts / 32.);
       vec3 c = ground(id, w); if (up > id) c *= .7; else if (dn < id) c *= .85;
       if (id < 1.5) c = mix(c, vec3(.1,.3,.5), .5 + .5 * sin(w.y * .3 - t * 2. + texture(nz, w / 97.).r * 6.));
       o = vec4(c, 1.); }`);
  const T = quads(terrain), G = quads(glyphs), S = quads(sprites);
  const use = (p, time) => { gl.useProgram(p); gl.uniform2f(gl.getUniformLocation(p, 'res'), W, H); gl.uniform1f(gl.getUniformLocation(p, 't'), time); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, atlas); gl.uniform1i(gl.getUniformLocation(p, 'a'), 0); };
  const draw = (b) => { gl.bindVertexArray(b.vao); gl.drawArrays(gl.TRIANGLES, 0, b.n); };
  const scenes = {
    today: (time) => { gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); use(pMask, 0); draw(T); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); use(pGlyph, 0); draw(G); gl.disable(gl.BLEND); },
    sprites: (time) => { gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); use(pMask, 0); draw(T); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); use(pSprite, time); draw(S); gl.disable(gl.DEPTH_TEST); },
    blend: (time) => { gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.useProgram(pBlend); gl.uniform2f(gl.getUniformLocation(pBlend, 'res'), W, H); gl.uniform1f(gl.getUniformLocation(pBlend, 'ts'), ts); gl.uniform1f(gl.getUniformLocation(pBlend, 't'), time); [[idT, 'ids'], [noiseT, 'nz'], [groundT, 'gr']].forEach(([tx, n], i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, tx); gl.uniform1i(gl.getUniformLocation(pBlend, n), i); }); gl.bindVertexArray(null); gl.drawArrays(gl.TRIANGLES, 0, 3); },
    full: (time) => { scenes.blend(time); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); use(pSprite, time); draw(S); gl.disable(gl.DEPTH_TEST); },
  };
  const px = new Uint8Array(4), sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px), out = { W, H, ts, tiles: cols * rows, spriteCount: sprites.length };
  gl.viewport(0, 0, W, H);
  for (const [name, fn] of Object.entries(scenes)) {
    for (let i = 0; i < 5; i++) { gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); fn(i); sync(); }
    const t0 = performance.now();
    for (let i = 0; i < draws; i++) { gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); fn(i * .016); sync(); }
    out[name] = +((performance.now() - t0) / draws).toFixed(2);
  }
  const ext = gl.getExtension('WEBGL_debug_renderer_info'); out.renderer = gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER); out.err = gl.getError();
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return out;
};
