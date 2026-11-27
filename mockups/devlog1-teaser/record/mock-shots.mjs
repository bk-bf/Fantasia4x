import { openMock, CHROME } from './mockpage.mjs';
import { recordHeld, lin } from './record.mjs';
import { OUT, log } from './session.mjs';

const HUD_READY = () => {
  const b = document.getElementById('busy');
  return !!(typeof HUD === 'object' && HUD.map && b && b.hidden && (!HUD.state.motion || HUD.motion.on));
};
const CANVAS_READY = () => {
  const c = document.querySelector('.pane canvas');
  if (!c || !c.width) return false;
  const d = c.getContext('2d').getImageData(c.width >> 1, c.height >> 1, 1, 1).data;
  return d[3] > 0;
};
const FRAME = 1000 / 60;
const DB_FOLK = '<script src="../fantasia4x-tileset/db-folk.js"></script>';
const PATCH = (p, t) => (p.includes('fantasia4x-hud/') ? t.replace(DB_FOLK, '<script src="../fantasia4x-tileset/folk-pieces.js"></script>' + DB_FOLK) : t);
const BT_HIDE = CHROME + '#stage{padding:0!important}.pane{outline:none!important;background:#000!important}';

function setHour(page, h) {
  return page.evaluate((h) => {
    const el = document.getElementById('hour');
    el.step = 'any';
    el.value = String(h);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, h);
}

const SHOTS = {
  opener: {
    path: 'fantasia4x-hud/?strip=0&motion=1&hour=16.5&weather=autumn_windy',
    width: 1920, height: 1088, ready: HUD_READY, frames: 900, hold: 1,
    h: { x: lin(280, 700, 900), y: () => 280 },
    v: { x: lin(420, 840, 900), y: () => 64 }
  },
  dusk: {
    path: 'fantasia4x-hud/?strip=0&motion=1&hour=16.75&weather=clear',
    width: 1920, height: 1088, ready: HUD_READY, frames: 900, hold: 1,
    perShot: (page, j, n) => setHour(page, 16.75 + (6.25 * j) / n),
    h: { x: () => 450, y: () => 250 },
    v: { x: () => 560, y: () => 64 }
  },
  rain: {
    path: 'fantasia4x-hud/?strip=0&motion=1&hour=12&weather=windy_rain',
    width: 1920, height: 1088, ready: HUD_READY, frames: 720, hold: 1,
    h: { x: lin(900, 570, 720), y: () => 300 },
    v: { x: lin(800, 470, 720), y: () => 100 }
  },
  night: {
    path: 'fantasia4x-hud/?strip=0&motion=1&hour=21.5&weather=clear',
    width: 1920, height: 1088, ready: HUD_READY, frames: 900, hold: 1,
    h: { x: lin(560, 440, 900), y: lin(300, 240, 900) },
    v: { x: lin(600, 520, 900), y: () => 64 }
  },
  magic: {
    path: 'fantasia4x-big-trees/?show=magic&see=all&light=night&zoom=1&play=off&wind=breeze&cut=on',
    width: 1920, height: 1080, ready: CANVAS_READY, hide: BT_HIDE, frames: 900, hold: 1,
    start: async (page) => {
      await page.clock.runFor(200);
      await page.locator('.grp[data-k=play] button[data-v=on]').dispatchEvent('click');
      await page.clock.runFor(3000);
    },
    h: { x: lin(330, 620, 900), y: () => 350 },
    v: { x: lin(550, 850, 900), y: () => 60 }
  }
};

const name = process.argv[2];
const s = SHOTS[name];
if (!s) throw new Error('unknown shot ' + name + '; one of ' + Object.keys(SHOTS).join(' '));
const only = process.argv[3];
const m = await openMock({ path: s.path, width: s.width, height: s.height, ready: s.ready, hide: s.hide ?? CHROME, settle: 2000, patch: process.env.MOCK_ROOT ? null : PATCH });
const outs = [];
if (only !== 'v') outs.push({ file: `${OUT}/clips/${name}.mp4`, w: 960, h: 540, scale: 2, ...s.h });
if (only !== 'h') outs.push({ file: `${OUT}/clips-vertical/${name}.mp4`, w: 540, h: 960, scale: 2, ...s.v });
const shots = Math.ceil(s.frames / s.hold);
if (s.start) await s.start(m.page);
const cssAt = (page, ms) =>
  page.evaluate((ms) => {
    const base = (window.__cssBase ??= new Map());
    for (const a of document.getAnimations()) {
      if (!base.has(a)) {
        a.pause();
        base.set(a, (a.currentTime ?? 0) - ms);
      }
      a.currentTime = base.get(a) + ms;
    }
    return base.size;
  }, ms);
log('css animations ' + (await cssAt(m.page, 0)));
await recordHeld({
  page: m.page,
  frames: s.frames,
  hold: s.hold,
  outs,
  region: { x: 0, y: 0, w: s.width, h: s.height },
  advance: async (j) => {
    if (s.perShot) await s.perShot(m.page, j, shots);
    if (j > 0) await m.page.clock.runFor(FRAME * s.hold);
    await cssAt(m.page, j * FRAME * s.hold);
  }
});
await m.close();
log('done ' + name);
