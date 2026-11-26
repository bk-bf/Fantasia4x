import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const THUMBS = (process.env.THUMBS || 'split,night,magic').split(',');
const SOURCES = { 'src/old-glyph.png': 'dev glyph renderer', 'src/new-day.png': 'HUD mockup', 'src/new-night.png': 'HUD mockup', 'src/magic.png': 'big-trees mockup' };
const FONT_PIXEL = { Jersey20: 34, Blackletter: 43 };
const WRITE = process.argv.includes('--write');
const here = new URL('.', import.meta.url).pathname;
const URL_BASE = process.env.PAGE || 'http://ubuntuserver:8794/fantasia4x-devlog-render/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
await page.route('**/_comments/**', r => r.abort());
let failed = 0;

for (const id of THUMBS) {
  await page.goto(`${URL_BASE}thumb.html?t=${id}`);
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
    const strays = [...th.querySelectorAll('img:not(.art), canvas:not(.ov), svg, div:not(.clip):not(.seam)')];
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
    for (const c of th.querySelectorAll('canvas.ov, .seam')) {
      if (c.matches('.seam')) {
        const r = c.getBoundingClientRect(), [cr, cg, cb] = getComputedStyle(c).backgroundColor.match(/\d+/g).map(Number);
        layers.push({ name: 'seam', solid: (255 << 24 | cb << 16 | cg << 8 | cr) >>> 0, r });
        continue;
      }
      if (c.matches('.txt') && +c.dataset.size !== fontPixel[c.dataset.font]) out.push(`text in ${c.dataset.font}: drawn at ${c.dataset.size}px, not its one-font-pixel size ${fontPixel[c.dataset.font]}px, so its pixels land unevenly`);
      const name = c.classList.contains('txt') ? `text "${JSON.parse(c.dataset.lines).flat().map(s => s[0]).join(' ')}"` : 'arrow';
      const d = pixels(c), g = scaled(c, c.width, c.height, name);
      let soft = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] !== 0 && d[i] !== 255) soft++;
      if (soft) out.push(`${name}: ${soft} blended (semi-transparent) source px`);
      if (g) { layers.push({ name, ...g, w: c.width, h: c.height, px: u32(d), alpha: d }); out.push(`ok? ${name} ×${g.k} at ${g.ox},${g.oy}: ${c.width}×${c.height} source px, ${soft} soft`); }
    }
    const overlay = (x, y) => {
      for (let i = layers.length - 1; i >= 0; i--) {
        const L = layers[i];
        if (x < L.r.left || x >= L.r.right || y < L.r.top || y >= L.r.bottom) continue;
        if (L.solid !== undefined) return [L.solid, L];
        const sx = Math.floor((x - L.ox) / L.k), sy = Math.floor((y - L.oy) / L.k), j = sy * L.w + sx;
        if (L.alpha[j * 4 + 3] === 255) return [L.px[j], L];
      }
      return null;
    };
    const stats = new Map(layers.map(L => [L, { wrong: 0, at: null, n: 0 }]));
    for (const im of th.querySelectorAll('img.art')) {
      const name = im.getAttribute('src');
      if (!sources[name]) out.push(`${name}: not a known source (${Object.keys(sources).join(', ')})`);
      const g = scaled(im, im.naturalWidth, im.naturalHeight, name);
      if (!g) continue;
      const clip = im.parentElement.getBoundingClientRect(), src = u32(pixels(im)), palette = new Set(src), W = im.naturalWidth;
      let checked = 0, wrong = 0, foreign = 0, at = null;
      const x0 = Math.max(0, Math.ceil(clip.left)), x1 = Math.min(SW, Math.floor(clip.right)), y0 = Math.max(0, Math.ceil(clip.top)), y1 = Math.min(SH, Math.floor(clip.bottom));
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const v = screen[y * SW + x], o = overlay(x, y);
        if (o) { const st = stats.get(o[1]); st.n++; if (v !== o[0]) { st.wrong++; st.at = st.at || [x, y]; } continue; }
        const sx = Math.floor((x - g.ox) / g.k), sy = Math.floor((y - g.oy) / g.k);
        if (sx < 0 || sy < 0 || sx >= W || sy >= im.naturalHeight) continue;
        checked++;
        if (!palette.has(v)) foreign++;
        if (v !== src[sy * W + sx]) { wrong++; at = at || [x, y]; }
      }
      if (foreign) out.push(`${name}: ${foreign} px in colours not in the source palette`);
      if (wrong) out.push(`${name}: ${wrong} px differ from nearest-neighbour ×${g.k} (smoothing or misplacement), first at ${at}`);
      out.push(`ok? ${name} (${sources[name]}) ×${g.k} at ${g.ox},${g.oy}: ${checked} px checked`);
    }
    for (const [L, st] of stats) {
      if (st.wrong) out.push(`${L.name}: ${st.wrong} of ${st.n} screen px differ from its ×${L.k ?? 1} grid (antialiased or misplaced), first at ${st.at}`);
      else out.push(`ok? ${L.name}: ${st.n} screen px exact`);
    }
    return out;
  }, [shot.toString('base64'), SOURCES, FONT_PIXEL]);
  const bad = report.filter(l => !l.startsWith('ok?'));
  failed += bad.length;
  console.log(`${bad.length ? 'FAIL' : 'PASS'} ${id}`);
  for (const l of report) console.log('  ' + (l.startsWith('ok?') ? l.slice(4) : '✗ ' + l));
}
await browser.close();
process.exit(failed ? 1 : 0);
