import { chromium } from 'playwright';
import { writeFileSync, readFileSync } from 'node:fs';

const LAYOUT = process.argv.find(a => a.startsWith('--layout='))?.slice(9);
const LAYOUT_JSON = LAYOUT && JSON.parse(readFileSync(LAYOUT, 'utf8'));
const THUMBS = LAYOUT_JSON ? [LAYOUT_JSON.v] : (process.env.THUMBS || 'night,night-ai,night-brush,night-block,night-pixel,ember,ember-ai,day,night-inset,number,oak,heartwood,oak-pair,grove').split(',');
const SOURCES = { 'src/old-glyph.png': 'dev glyph renderer', 'src/new-day.png': 'HUD mockup', 'src/new-dusk.png': 'HUD mockup', 'src/new-night.png': 'HUD mockup', 'src/new-summer.png': 'HUD mockup', 'src/magic-night.png': 'big-trees mockup', 'src/magic.png': 'big-trees mockup', 'src/forest.png': 'big-trees mockup', 'src/trees.png': 'big-trees mockup', 'src/ground-autumn.png': 'tree-ground mockup' };
const FONT_PIXEL = { Jersey20: 34, Blackletter: 43 };
const WRITE = process.argv.includes('--write');
const here = new URL('.', import.meta.url).pathname;
const URL_BASE = process.env.PAGE || 'http://ubuntuserver:8794/fantasia4x-devlog-render/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
await page.route('**/_comments/**', r => r.abort());
let failed = 0;

for (const id of THUMBS) {
  await page.goto(`${URL_BASE}thumb.html?t=${id}` + (LAYOUT_JSON ? '&layout=' + encodeURIComponent(JSON.stringify(LAYOUT_JSON)) : ''));
  await page.waitForFunction(() => document.body.dataset.ready === '1');
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.querySelectorAll('.th.on img')].map(i => i.decode())); });
  const shot = await page.screenshot({ type: 'png' });
  if (WRITE) writeFileSync(`${here}img/thumb-${id}.png`, shot);
  const report = await page.evaluate(async ([b64, sources, fontPixel]) => {
    const load = src => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
    const pixels = el => { const c = document.createElement('canvas'); c.width = el.naturalWidth ?? el.width; c.height = el.naturalHeight ?? el.height; const g = c.getContext('2d'); g.drawImage(el, 0, 0); return g.getImageData(0, 0, c.width, c.height).data; };
    const u32 = d => new Uint32Array(d.buffer);
    const SW = 1280, SH = 720, screen = u32(pixels(await load('data:image/png;base64,' + b64)));
    const th = document.querySelector('.th.on'), T = th.getBoundingClientRect();
    const out = [];
    const strays = [...th.querySelectorAll('img:not(.art), canvas:not(.ov), svg:not(.arrow), svg.arrow *:not(path), div:not(.clip):not(.seam)')];
    if (strays.length) out.push(`${strays.length} element(s) neither a source sprite, an overlay canvas nor the seam`);
    const scaled = (el, w, h, name) => {
      const r = el.getBoundingClientRect(), kx = r.width / w, ky = r.height / h;
      if (kx !== ky || !Number.isInteger(kx)) { out.push(`${name}: non-integer scale ${kx}×${ky}`); return null; }
      if (getComputedStyle(el).imageRendering !== 'pixelated') out.push(`${name}: image-rendering is ${getComputedStyle(el).imageRendering}, not pixelated`);
      const ox = r.left - T.left, oy = r.top - T.top;
      if (ox % kx || oy % kx) out.push(`${name}: off the ${kx}px grid at ${ox},${oy}`);
      return { k: kx, ox, oy, r };
    };
    const layers = [];
    const tf = el => { const d = el.dataset; if (d.x === undefined) return null; return { k: +d.k, rot: (((+d.rot || 0) % 360) + 360) % 360, x: +d.x, y: +d.y, px: +d.px, py: +d.py }; };
    const exactTf = t => Number.isInteger(t.k) && t.rot % 90 === 0 && t.x % t.k === 0 && t.y % t.k === 0 && (t.rot === 0 || (t.px % t.k === 0 && t.py % t.k === 0));
    const why = t => [!Number.isInteger(t.k) && `free zoom ×${+t.k.toFixed(3)}`, t.rot % 90 && `rotation ${t.rot}°`, Number.isInteger(t.k) && t.rot % 90 === 0 && 'off its grid'].filter(Boolean).join(', ');
    const inv = (t, X, Y) => {
      const a = -t.rot * Math.PI / 180, c = Math.round(Math.cos(a) * 1e12) / 1e12, s = Math.round(Math.sin(a) * 1e12) / 1e12, dx = X - T.left + .5 - t.px, dy = Y - T.top + .5 - t.py;
      return [Math.floor((t.px + dx * c - dy * s - t.x) / t.k), Math.floor((t.py + dx * s + dy * c - t.y) / t.k)];
    };
    for (const el of th.querySelectorAll('*')) { const cs = getComputedStyle(el); if (cs.filter !== 'none' || cs.backdropFilter !== 'none' || cs.mixBlendMode !== 'normal') out.push(`${el.tagName.toLowerCase()}.${el.className.baseVal ?? el.className}: filter ${cs.filter}, backdrop ${cs.backdropFilter}, blend ${cs.mixBlendMode} would change the art`); }
    for (const s of th.querySelectorAll('svg.arrow')) {
      const r = s.getBoundingClientRect(), im = await load('data:image/svg+xml;base64,' + btoa(new XMLSerializer().serializeToString(s)));
      const c = document.createElement('canvas'); c.width = r.width; c.height = r.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0);
      const a = g.getImageData(0, 0, c.width, c.height).data, W = c.width, H = c.height, mask = new Uint8Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (a[(y * W + x) * 4 + 3]) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < W && Y < H) mask[Y * W + X] = 1; }
      layers.push({ el: s, name: `vector arrow (${s.dataset.kind})`, vector: mask, w: W, ox: r.left - T.left, oy: r.top - T.top, r });
    }
    for (const c of th.querySelectorAll('canvas.ov, .seam')) {
      if (c.matches('.seam')) {
        const r = c.getBoundingClientRect(), [cr, cg, cb] = getComputedStyle(c).backgroundColor.match(/\d+/g).map(Number);
        layers.push({ el: c, name: 'seam', solid: (255 << 24 | cb << 16 | cg << 8 | cr) >>> 0, r });
        continue;
      }
      const ct = tf(c);
      if (ct) {
        const name = `text "${JSON.parse(c.dataset.lines).flat().map(s => s[0]).join(' ')}"`, d = pixels(c), ex = exactTf(ct);
        if (+c.dataset.size !== fontPixel[c.dataset.font]) out.push(`text in ${c.dataset.font}: drawn at ${c.dataset.size}px, not its one-font-pixel size ${fontPixel[c.dataset.font]}px, so its pixels land unevenly`);
        if (getComputedStyle(c).imageRendering !== 'pixelated') out.push(`${name}: image-rendering is ${getComputedStyle(c).imageRendering}, not pixelated`);
        let soft = 0;
        for (let i = 3; i < d.length; i += 4) if (d[i] !== 0 && d[i] !== 255) soft++;
        if (soft) out.push(`${name}: ${soft} blended (semi-transparent) source px`);
        if (!ex) out.push(`warn ${name}: ${why(ct)}, drawn nearest-neighbour, not pixel-exact; its footprint is skipped`);
        layers.push({ el: c, name, t: ct, skip: !ex, w: c.width, h: c.height, px: u32(d), alpha: d, r: c.getBoundingClientRect(), k: ct.k });
        out.push(`ok? ${name} ×${+ct.k.toFixed(3)} rot ${ct.rot}° at ${ct.x},${ct.y}: ${c.width}×${c.height} source px, ${soft} soft`);
        continue;
      }
      if (c.matches('.txt') && +c.dataset.size !== fontPixel[c.dataset.font]) out.push(`text in ${c.dataset.font}: drawn at ${c.dataset.size}px, not its one-font-pixel size ${fontPixel[c.dataset.font]}px, so its pixels land unevenly`);
      const name = c.classList.contains('txt') ? `text "${JSON.parse(c.dataset.lines).flat().map(s => s[0]).join(' ')}"` : 'arrow';
      const d = pixels(c), g = scaled(c, c.width, c.height, name);
      let soft = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] !== 0 && d[i] !== 255) soft++;
      if (soft) out.push(`${name}: ${soft} blended (semi-transparent) source px`);
      if (g) { layers.push({ el: c, name, ...g, w: c.width, h: c.height, px: u32(d), alpha: d }); out.push(`ok? ${name} ×${g.k} at ${g.ox},${g.oy}: ${c.width}×${c.height} source px, ${soft} soft`); }
    }
    layers.sort((a, b) => a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
    const overlay = (x, y, under) => {
      for (let i = layers.length - 1; i >= 0; i--) {
        const L = layers[i];
        if (!(under.compareDocumentPosition(L.el) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
        if (x < L.r.left || x >= L.r.right || y < L.r.top || y >= L.r.bottom) continue;
        if (L.solid !== undefined) return [L.solid, L];
        if (L.vector) { if (L.vector[(y - L.oy) * L.w + (x - L.ox)]) return [null, L]; continue; }
        if (L.t) {
          const [sx, sy] = inv(L.t, x, y);
          if (sx < 0 || sy < 0 || sx >= L.w || sy >= L.h) continue;
          const j = sy * L.w + sx;
          if (L.alpha[j * 4 + 3] === 255) return [L.skip ? null : L.px[j], L];
          continue;
        }
        const sx = Math.floor((x - L.ox) / L.k), sy = Math.floor((y - L.oy) / L.k), j = sy * L.w + sx;
        if (L.alpha[j * 4 + 3] === 255) return [L.px[j], L];
      }
      return null;
    };
    const stats = new Map(layers.map(L => [L, { wrong: 0, at: null, n: 0 }]));
    const clips = [...th.querySelectorAll('.clip')];
    const inPoly = (pts, x, y) => { let r = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) r = !r; } return r; };
    const geo = new Map(clips.map(c => [c, [c.getBoundingClientRect(), c.dataset.poly && JSON.parse(c.dataset.poly)]]));
    const inClip = (c, x, y) => { const [r, poly] = geo.get(c); if (x < r.left || x >= r.right || y < r.top || y >= r.bottom) return false; return !poly || inPoly(poly, x - r.left + .5, y - r.top + .5); };
    for (const im of th.querySelectorAll('img.art')) {
      const later = clips.slice(clips.indexOf(im.parentElement) + 1);
      const name = im.getAttribute('src');
      if (!sources[name]) out.push(`${name}: not a known source (${Object.keys(sources).join(', ')})`);
      const it = tf(im);
      let g;
      if (it) {
        if (getComputedStyle(im).imageRendering !== 'pixelated') out.push(`${name}: image-rendering is ${getComputedStyle(im).imageRendering}, not pixelated`);
        if (!exactTf(it)) { out.push(`warn ${name}: ${why(it)}, drawn nearest-neighbour, not pixel-exact; not compared`); out.push(`ok? ${name} (${sources[name]}) ×${+it.k.toFixed(3)} rot ${it.rot}°: skipped`); continue; }
        g = { k: it.k, map: (x, y) => inv(it, x, y), label: `×${it.k} rot ${it.rot}° at ${it.x},${it.y}` };
      } else {
        const s0 = scaled(im, im.naturalWidth, im.naturalHeight, name);
        if (!s0) continue;
        g = { k: s0.k, map: (x, y) => [Math.floor((x - s0.ox) / s0.k), Math.floor((y - s0.oy) / s0.k)], label: `×${s0.k} at ${s0.ox},${s0.oy}` };
      }
      const clip = im.parentElement.getBoundingClientRect(), src = u32(pixels(im)), palette = new Set(src), W = im.naturalWidth;
      let checked = 0, wrong = 0, foreign = 0, at = null;
      const x0 = Math.max(0, Math.ceil(clip.left)), x1 = Math.min(SW, Math.floor(clip.right)), y0 = Math.max(0, Math.ceil(clip.top)), y1 = Math.min(SH, Math.floor(clip.bottom));
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        if (!inClip(im.parentElement, x, y) || later.some(c => inClip(c, x, y))) continue;
        const v = screen[y * SW + x], o = overlay(x, y, im.parentElement);
        if (o) { const st = stats.get(o[1]); st.n++; if (o[0] !== null && v !== o[0]) { st.wrong++; st.at = st.at || [x, y]; } continue; }
        const [sx, sy] = g.map(x, y);
        if (sx < 0 || sy < 0 || sx >= W || sy >= im.naturalHeight) continue;
        checked++;
        if (!palette.has(v)) foreign++;
        if (v !== src[sy * W + sx]) { wrong++; at = at || [x, y]; }
      }
      if (foreign) out.push(`${name}: ${foreign} px in colours not in the source palette`);
      if (wrong) out.push(`${name}: ${wrong} px differ from nearest-neighbour ×${g.k} (smoothing or misplacement), first at ${at}`);
      out.push(`ok? ${name} (${sources[name]}) ${g.label}: ${checked} px checked`);
    }
    for (const [L, st] of stats) {
      if (st.wrong) out.push(`${L.name}: ${st.wrong} of ${st.n} screen px differ from its ×${L.k ?? 1} grid (antialiased or misplaced), first at ${st.at}`);
      else out.push(`ok? ${L.name}: ${st.n} screen px ${L.vector ? 'vector, skipped (1px fringe)' : L.skip ? 'free transform, skipped' : 'exact'}`);
    }
    return out;
  }, [shot.toString('base64'), SOURCES, FONT_PIXEL]);
  const bad = report.filter(l => !l.startsWith('ok?') && !l.startsWith('warn ')), warn = report.filter(l => l.startsWith('warn '));
  failed += bad.length;
  console.log(`${bad.length ? 'FAIL' : warn.length ? 'PASS with warnings' : 'PASS'} ${id}`);
  for (const l of report) console.log('  ' + (l.startsWith('ok?') ? l.slice(4) : l.startsWith('warn ') ? '⚠ ' + l.slice(5) : '✗ ' + l));
}
await browser.close();
process.exit(failed ? 1 : 0);
