import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const THUMBS = ['split', 'night', 'magic'];
const WRITE = process.argv.includes('--write');
const here = new URL('.', import.meta.url).pathname;
const URL_BASE = process.env.PAGE || 'http://ubuntuserver:8794/fantasia4x-devlog-render/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
await page.route('**/_comments/**', r => r.abort());
let failed = 0;

for (const id of THUMBS) {
  await page.goto(`${URL_BASE}thumb.html?t=${id}`);
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(i => i.decode())); });
  const shot = await page.screenshot({ type: 'png' });
  if (WRITE) writeFileSync(`${here}img/thumb-${id}.png`, shot);
  const report = await page.evaluate(async b64 => {
    const load = src => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
    const pixels = im => { const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; const g = c.getContext('2d'); g.drawImage(im, 0, 0); return new Uint32Array(g.getImageData(0, 0, c.width, c.height).data.buffer); };
    const screen = pixels(await load('data:image/png;base64,' + b64)), SW = 1280;
    const th = document.querySelector('.th.on'), T = th.getBoundingClientRect();
    const skip = [...th.querySelectorAll('.t, .ov, .seam')].map(e => { const b = e.getBoundingClientRect(), m = e.matches('.t') ? 32 : 0; return { left: b.left - m, right: b.right + m, top: b.top - m, bottom: b.bottom + m }; });
    const out = [];
    const strays = [...th.querySelectorAll('img:not(.art), canvas:not(.ov), svg')];
    if (strays.length) out.push(`${strays.length} element(s) not drawn from a source sprite`);
    for (const im of th.querySelectorAll('img.art')) {
      const name = im.getAttribute('src'), r = im.getBoundingClientRect(), clip = im.parentElement.getBoundingClientRect();
      const kx = r.width / im.naturalWidth, ky = r.height / im.naturalHeight, k = Math.round(kx);
      if (kx !== ky || !Number.isInteger(kx)) { out.push(`${name}: non-integer scale ${kx}×${ky}`); continue; }
      if (getComputedStyle(im).imageRendering !== 'pixelated') out.push(`${name}: image-rendering is ${getComputedStyle(im).imageRendering}, not pixelated`);
      const ox = r.left - T.left, oy = r.top - T.top;
      if (ox % k || oy % k) out.push(`${name}: off the ${k}px grid at ${ox},${oy}`);
      const src = pixels(im), palette = new Set(src), W = im.naturalWidth;
      let checked = 0, wrong = 0, foreign = 0, at = null;
      const x0 = Math.max(0, Math.ceil(clip.left)), x1 = Math.min(1280, Math.floor(clip.right)), y0 = Math.max(0, Math.ceil(clip.top)), y1 = Math.min(720, Math.floor(clip.bottom));
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        if (skip.some(s => x >= s.left && x < s.right && y >= s.top && y < s.bottom)) continue;
        const sx = Math.floor((x - ox) / k), sy = Math.floor((y - oy) / k);
        if (sx < 0 || sy < 0 || sx >= W || sy >= im.naturalHeight) continue;
        const v = screen[y * SW + x]; checked++;
        if (!palette.has(v)) foreign++;
        if (v !== src[sy * W + sx]) { wrong++; at = at || [x, y]; }
      }
      if (foreign) out.push(`${name}: ${foreign} px in colours not in the source palette`);
      if (wrong) out.push(`${name}: ${wrong} px differ from nearest-neighbour ×${k} (smoothing or misplacement), first at ${at}`);
      out.push(`ok? ${name} ×${k} at ${ox},${oy}: ${checked} px checked`);
    }
    return out;
  }, shot.toString('base64'));
  const bad = report.filter(l => !l.startsWith('ok?'));
  failed += bad.length;
  console.log(`${bad.length ? 'FAIL' : 'PASS'} ${id}`);
  for (const l of report) console.log('  ' + (l.startsWith('ok?') ? l.slice(4) : '✗ ' + l));
}
await browser.close();
process.exit(failed ? 1 : 0);
