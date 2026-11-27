import { chromium } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';
import { mountDir, ORIGIN } from './serve.mjs';

const here = new URL('.', import.meta.url).pathname;
const NARRATOR = {
  id: 'devlog-narrator',
  culture: 'rynek',
  pawn: { sex: 'male', age: 33, height: 178, weight: 76, traits: [] },
  look: { style: 'short', beard: 'full', sleeves: 'rolled', apron: true, pouch: true, hat: 'none', cloak: null }
};
const ANIMS = ['talk', 'idle'];

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await mountDir(page, here + 'rig');
await page.goto(ORIGIN + '/export.html');
const out = await page.evaluate(async ({ NARRATOR, ANIMS }) => {
  const data = await (await fetch('catalog-data.json')).json();
  DBX.fromData(data.objects);
  MOTION_LOAD.init(data.objects);
  LOOK_STYLE.pieces = true;
  const culture = FOLK_CAST.cultures.find(c => c.id === NARRATOR.culture);
  const pawn = { id: NARRATOR.id, ...NARRATOR.pawn };
  LOOK_CAST['folk-narrator'] = { name: 'Narrator', look: { ...pawnLookOf(pawn, culturePreference(culture), FOLK_CAST.traitRarity), ...NARRATOR.look }, gear: null };
  const A = mkActor('pawn', 'folk-narrator', { tool: null, shield: null });
  const raw = [];
  for (const anim of ANIMS) {
    const def = animOf(A, anim), n = def.n || 6;
    for (let i = 0; i < n; i++) {
      const u = (i + .5) / n, f = frameOf(A, { anim, u, t: u * def.dur, face: 's', flip: true }, 3, false);
      raw.push({ anim, i, n, dur: def.dur, s: f.s, dx: f.dx || 0, dy: f.dy || 0 });
    }
  }
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const r of raw) {
    const s = r.s;
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (s.c[y * s.w + x]) {
      const X = x - s.ax + r.dx, Y = y - s.ay + r.dy;
      x0 = Math.min(x0, X); x1 = Math.max(x1, X); y0 = Math.min(y0, Y); y1 = Math.max(y1, Y);
    }
  }
  const W = x1 - x0 + 1, H = y1 - y0 + 1;
  const frames = raw.map(r => {
    const s = r.s, cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d'), im = ctx.createImageData(W, H);
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
      const c = s.c[y * s.w + x];
      if (!c) continue;
      const X = x - s.ax + r.dx - x0, Y = y - s.ay + r.dy - y0;
      im.data.set([c[0], c[1], c[2], 255], (Y * W + X) * 4);
    }
    ctx.putImageData(im, 0, 0);
    return { anim: r.anim, i: r.i, n: r.n, dur: r.dur, png: cv.toDataURL('image/png') };
  });
  return { W, H, footX: -x0, footY: -y0, frames };
}, { NARRATOR, ANIMS });
await browser.close();
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
await mkdir(here + 'pawn', { recursive: true });
const meta = { w: out.W, h: out.H, footX: out.footX, footY: out.footY, anims: {} };
for (const f of out.frames) {
  const name = `${f.anim}-${f.i}.png`;
  await writeFile(here + 'pawn/' + name, Buffer.from(f.png.split(',')[1], 'base64'));
  (meta.anims[f.anim] ||= { dur: f.dur, frames: [] }).frames.push('pawn/' + name);
}
await writeFile(here + 'pawn/pawn.json', JSON.stringify(meta, null, 1));
console.log(`pawn ${out.W}x${out.H}`, Object.entries(meta.anims).map(([k, v]) => k + ':' + v.frames.length).join(' '));
