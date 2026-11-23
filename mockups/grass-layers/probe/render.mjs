import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
const [, , TREE, PORT, OUT] = process.argv;
const VIG = process.env.VIG === '1';
const { chromium } = createRequire(`${TREE}/package.json`)('playwright');
const meta = JSON.parse(readFileSync(`${OUT}/meta.json`, 'utf8'));
const manifest = JSON.parse(readFileSync(`${TREE}/static/tilesets/painted/manifest.json`, 'utf8'));
const save = JSON.parse(gunzipSync(readFileSync(`${TREE}/tools/work-pins/fixtures/dev-save.json.gz`)).toString('utf8'));
const DRESS = /patch$|^savanna$|moss$|deposit$/;
const bySub = new Map(), anySub = new Map();
let mountain = null;
for (const row of save.world) for (const t of row) {
  const keys = Object.keys(t.resources || {});
  if (!mountain && keys.length === 1 && keys[0] === 'mountain_wall') mountain = t;
  if (!anySub.has(t.subType)) anySub.set(t.subType, t);
  if (keys.some((k) => !DRESS.test(k))) continue;
  if (!bySub.has(t.subType)) bySub.set(t.subType, []);
  bySub.get(t.subType).push(t);
}
const hash = (x, y) => { let n = (x * 374761393) ^ (y * 668265263); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
const SUB = { tilled: 'dirt' };
const treeAt = new Map(meta.trees.map((t) => [`${t.tx},${t.ty}`, t.kind]));
const map = [];
const missing = new Set();
for (let ty = 0; ty < meta.TH; ty++) {
  const row = [];
  for (let tx = 0; tx < meta.TW; tx++) {
    const i = ty * meta.TW + tx;
    const sub = SUB[meta.ground[i]] ?? meta.ground[i];
    let t;
    if (meta.wall[i] === meta.mountain) t = { ...mountain, resources: { mountain_wall: 4 } };
    else {
      const pool = bySub.get(sub);
      if (!pool) missing.add(sub);
      const src = pool ? pool[Math.floor(hash(tx, ty) * pool.length)] : { ...(anySub.get(sub) ?? bySub.get('grass')[0]), resources: {} };
      t = { ...src, subType: sub, resources: { ...(src.resources || {}) } };
      const kind = treeAt.get(`${tx},${ty}`);
      const res = kind && `${kind}_tree`;
      if (res && manifest.map.resource[res]) t.resources = { [res]: 1 };
    }
    delete t.growth;
    row.push({ ...t, x: tx, y: ty, discovered: true });
  }
  map.push(row);
}
console.log('missing ground templates', [...missing]);
const dyn = meta.lights.filter((l) => l.flicker), rest = meta.lights.filter((l) => !l.flicker);
const lights = [...dyn, ...rest].map((l) => ({ x: 0, y: 0, color: l.col, radius: 0, intensity: 1, flicker: !!l.flicker, art: { x: l.x, y: l.y, rad: l.rad, night: !!l.night } }));
const GR = ['grass_patch', 'tall_grass_patch', 'deep_grass_patch'];
mkdirSync(`${OUT}/layers`, { recursive: true });
writeFileSync(`${OUT}/layers/dress.json`, JSON.stringify(map.flat().flatMap((t) => { const k = Object.keys(t.resources || {}).find((r) => GR.includes(r)); return k ? [[t.x, t.y, k]] : []; })));
const haveDress = existsSync(`${OUT}/layers/dress-dress.png`);
const b64 = (f) => readFileSync(`${OUT}/${f}`).toString('base64');
const layerInput = {
  atlas: b64('layers/atlas.png'),
  cover: b64('layers/field.png'),
  table: JSON.parse(readFileSync(`${OUT}/layers/table.json`, 'utf8')),
  decals: { ...Object.fromEntries(['strict', 'permissive', 'mockup'].map((n) => [n, b64(`layers/decals-${n}.png`)])), ...(haveDress ? { dress: b64('layers/dress-dress.png'), dense: b64('layers/dress-dense.png') } : {}) },
  GR
};
const setup = async (o) => {
  performance.now = () => 3000;
  const { WebGLRendererCore } = await import('/src/lib/webgl/renderer-core.ts');
  const { GameGrid } = await import('/src/lib/webgl/game-grid.ts');
  const Wd = await import('/src/lib/webgl/fantasia-world.ts');
  const { paintedGroundIds } = await import('/src/lib/webgl/painted/tileset.ts');
  const vert = (await import('/src/lib/webgl/shaders/groundBlend.vert.glsl?raw')).default;
  const frag = (await import('/src/lib/webgl/shaders/groundBlend.frag.glsl?raw')).default;
  const mask = Wd.computeHiddenMask(o.map);
  const canvas = document.createElement('canvas'); canvas.width = o.W; canvas.height = o.H; document.body.appendChild(canvas);
  const core = new WebGLRendererCore({ canvas, tileWidth: 32, tileHeight: 32 });
  await core.waitForInitialization(); core.resize(o.W, o.H);
  if (!core.painted || !core.lightPass || !core.groundBlend) return 'painted, light pass or ground blend missing';
  core.vignette = null;
  const ground = new GameGrid(), short = new GameGrid(), tall = new GameGrid(), shortBare = new GameGrid(), tallBare = new GameGrid();
  for (const row of o.map) for (const t of row) { Wd.applyTileToGrid(ground, t, mask); Wd.applyResourceToGrid(short, tall, t, mask, o.season, o.map); }
  const stripped = o.map.map((row) => row.map((t) => ({ ...t, resources: Object.fromEntries(Object.entries(t.resources || {}).filter(([k]) => !o.layers.GR.includes(k))) })));
  for (const row of stripped) for (const t of row) Wd.applyResourceToGrid(shortBare, tallBare, t, mask, o.season, stripped);
  core.setLightSampler(() => [0, 0, 0]); core.setGrid(ground);
  core.setResourceOverlayGrid(short); core.setResourceTallOverlayGrid(tall);
  core.setPointLights(o.lights); core.setDynamicLight(true); core.setMapWeather('clear');
  core.setViewTileOffset(0, 0);
  const gl = core.getContext();
  const gb = core.groundBlend;
  const marker = 'vec3 c = texelFetch(u_paintAtlas, ivec2(patchRect.xy) + local, 0).rgb;';
  if (!frag.includes(marker)) return 'marker not found in ground blend shader';
  const layered = frag
    .replace('out vec4 fragColor;', 'uniform highp sampler2D u_cover;\nvec4 fieldAt(vec2 q) { vec4 t = texelFetch(u_cover, ivec2(q), 0); return vec4((t.r * 65280.0 + t.g * 255.0) / 65535.0, floor(t.b * 255.0 / 60.0 + 0.5) - 1.0, floor((1.0 - t.a) * 255.0 / 60.0 + 0.5) - 1.0, 1.0); }\nuniform sampler2D u_layers;\nuniform sampler2D u_decals;\nuniform vec2 u_lay[64];\nuniform float u_dbg;\nout vec4 fragColor;')
    .replace(/fragColor = vec4\(mix(.*)\);\n}\s*$/, (m0) => m0.replace(/\n}\s*$/, '\n    if (u_dbg > 0.5) fragColor = vec4(fieldAt(floor(v_art)).r, fract(v_art.x / 32.0), fract(v_art.y / 32.0), 1.0);\n}\n'))
    .replace(marker, `${marker}
    vec2 lay = u_lay[k];
    if (lay.x >= 0.0) {
        ivec2 l128 = ivec2(mod(p, 128.0));
        int row = int(lay.x) * 128;
        vec4 fld = fieldAt(p);
        float cv = fld.r;
        if (lay.y > 0.0 && cv < lay.y) {
            c = texelFetch(u_layers, ivec2(int(4.0 + fld.g) * 128, row) + l128, 0).rgb;
            if (cv > lay.y - 0.011) c = darken(c, 0.7);
        } else {
            c = texelFetch(u_layers, ivec2(int(1.0 + fld.b) * 128, row) + l128, 0).rgb;
            if (lay.y > 0.0 && fieldAt(vec2(p.x, max(0.0, p.y - 3.0))).r < lay.y) c = darken(c, 0.68);
        }
        if (layer.y < 0.5) { vec4 dc = texelFetch(u_decals, ivec2(p), 0); if (dc.a > 0.5) c = dc.rgb; }
    }`);
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, vert)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, layered));
  gl.bindAttribLocation(prog, gl.getAttribLocation(gb.program, 'a_position'), 'a_position');
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return 'link: ' + gl.getProgramInfoLog(prog);
  const oldAt = gb.at, oldProg = gb.program;
  const newAt = Object.fromEntries(Object.keys(oldAt).concat(['u_cover', 'u_layers', 'u_decals', 'u_lay', 'u_dbg']).map((n) => [n, gl.getUniformLocation(prog, n)]));
  const copyUniform = (n) => { const loc = oldAt[n]; if (!loc) return null; return gl.getUniform(oldProg, loc); };
  const consts = { u_paintAtlas: '1i', u_kinds: '1i', u_light: '1i', u_tileArt: '1f', u_artPerBase: '1f' };
  gl.useProgram(oldProg);
  const vals = Object.fromEntries(Object.keys(consts).map((n) => [n, copyUniform(n)]));
  const patch = new Float32Array(256), layer = new Float32Array(128);
  for (let i = 0; i < 64; i++) { const pv = gl.getUniformLocation(oldProg, `u_patch[${i}]`); const lv = gl.getUniformLocation(oldProg, `u_layer[${i}]`); if (pv) patch.set(gl.getUniform(oldProg, pv), i * 4); if (lv) layer.set(gl.getUniform(oldProg, lv), i * 2); }
  gl.useProgram(prog);
  for (const [n, t] of Object.entries(consts)) if (newAt[n] && vals[n] !== null) gl[`uniform${t}`](newAt[n], vals[n]);
  gl.uniform4fv(newAt.u_patch, patch); gl.uniform2fv(newAt.u_layer, layer);
  const lay = new Float32Array(128).fill(-1);
  const ids = paintedGroundIds();
  const used = [];
  ids.forEach((id, i) => { const e = o.layers.table[id]; if (e && i + 1 < 64) { lay[(i + 1) * 2] = e.row; lay[(i + 1) * 2 + 1] = e.amount; used.push(id); } });
  gl.uniform2fv(newAt.u_lay, lay);
  gl.uniform1i(newAt.u_cover, 10); gl.uniform1i(newAt.u_layers, 11); gl.uniform1i(newAt.u_decals, 12);
  const img = async (b) => { const i = new Image(); i.src = 'data:image/png;base64,' + b; await i.decode(); return i; };
  const tex = (unit, upload) => { gl.activeTexture(gl.TEXTURE0 + unit); const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE); upload(); for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, p, gl.NEAREST); for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, p, gl.CLAMP_TO_EDGE); gl.activeTexture(gl.TEXTURE0); return t; };
  const fieldImg = await img(o.layers.cover);
  const covTex = tex(10, () => gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, fieldImg));
  const covErr = gl.getError();
  const atlasImg = await img(o.layers.atlas);
  const layTex = tex(11, () => gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlasImg));
  const decalTex = {};
  for (const [n, b] of Object.entries(o.layers.decals)) { const im = await img(b); decalTex[n] = tex(12, () => gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im)); }
  window.__core = core; window.__grids = { short, tall, shortBare, tallBare }; window.__gb = { gb, oldProg, oldAt, prog, newAt, decalTex, covTex, layTex };
  return 'ok ' + used.length + ' covErr ' + covErr ;
};
const frame = (a) => {
  const core = window.__core, gl = core.getContext(), G = window.__gb;
  const gr = window.__grids, strip = a.strip;
  core.setResourceOverlayGrid(a.bare ? null : strip ? gr.shortBare : gr.short); core.setResourceTallOverlayGrid(a.bare ? null : strip ? gr.tallBare : gr.tall);
  if (a.decals) { gl.useProgram(G.prog); gl.uniform1f(G.newAt.u_dbg, a.dbg ? 1 : 0); G.gb.program = G.prog; G.gb.at = G.newAt; gl.activeTexture(gl.TEXTURE0 + 10); gl.bindTexture(gl.TEXTURE_2D, G.covTex); gl.activeTexture(gl.TEXTURE0 + 11); gl.bindTexture(gl.TEXTURE_2D, G.layTex); gl.activeTexture(gl.TEXTURE0 + 12); gl.bindTexture(gl.TEXTURE_2D, G.decalTex[a.decals]); gl.activeTexture(gl.TEXTURE0); }
  else { G.gb.program = G.oldProg; G.gb.at = G.oldAt; }
  core.setAmbient(a.light, a.tint, a.tint);
  core.beginFrame(); core.endFrame();
  const px = new Uint8Array(a.W * a.H * 4);
  gl.readPixels(0, 0, a.W, a.H, gl.RGBA, gl.UNSIGNED_BYTE, px);
  let s = ''; for (let i = 0; i < px.length; i += 0x8000) s += String.fromCharCode.apply(null, px.subarray(i, i + 0x8000));
  return btoa(s);
};
const W = meta.W, H = meta.H;
const save1 = (b, file) => {
  const raw = Buffer.from(b, 'base64'), flip = Buffer.alloc(raw.length), row = W * 4;
  for (let y = 0; y < H; y++) raw.copy(flip, (H - 1 - y) * row, y * row, (y + 1) * row);
  writeFileSync(file, flip);
};
mkdirSync(`${OUT}/raw`, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  page.on('console', (m) => { if (/painted|warn|error/i.test(m.text()) && !/SvelteKitError|Not found/.test(m.text())) console.log('console', m.text().slice(0, 300)); });
  await page.goto(`http://127.0.0.1:${PORT}/__scene?painted=1&blend=1`, { waitUntil: 'load', timeout: 180000 });
  const ok = await page.evaluate(setup, { map, lights, W, H, season: 'summer', layers: layerInput });
  console.log('setup', ok);
  if (!ok.startsWith('ok')) throw new Error(ok);
  const { layerOps } = await import('./ambient.mjs');
  const noon = layerOps(13);
  for (const v of [{ tag: 'today' }, { tag: 'strict', decals: 'strict' }, { tag: 'permissive', decals: 'permissive' }, { tag: 'mockupset', decals: 'mockup' }, ...(haveDress ? [{ tag: 'dress', decals: 'dress', strip: true }, { tag: 'densecheck', decals: 'dense', strip: true }] : [])])
    for (const bare of [false, true])
      save1(await page.evaluate(frame, { ...noon, W, H, bare, decals: v.decals, dbg: v.dbg, strip: v.strip }), `${OUT}/raw/v-${v.tag}${bare ? '-bare' : ''}.rgba`);
  console.log('rendered');
} catch (e) { console.log('failed', e.message); process.exitCode = 1; } finally { await browser.close(); }
