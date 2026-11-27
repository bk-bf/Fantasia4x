import { openGame, readSave, step, log, setPaused, TICKS_PER_DAY, OUT } from './session.mjs';
import { stagedSave, stageColony, warm, cmd } from './stage.mjs';
import { recordHeld, lin } from './record.mjs';

const VW = 1200;
const VH = 1000;
const HOLD = 1;
const clearSky = {
  type: 'clear', intensity: 0, precip: 'none', windLevel: 'breezy',
  turnsRemaining: 999999, windTurns: 999999, wind: 0.45, windDir: 2, phase: 'steady'
};

function rawSave(hour) {
  const save = readSave();
  save.dynamic.turn = TICKS_PER_DAY * 40 + Math.round((hour / 24) * TICKS_PER_DAY);
  save.dynamic.weather = clearSky;
  return save;
}

async function mobIds(page, pred) {
  return page.evaluate(async (src) => {
    const { gameState } = await import('/src/lib/stores/gameState.ts');
    let s;
    gameState.subscribe((v) => (s = v))();
    const f = new Function('m', 'return ' + src);
    return (s.mobs ?? []).filter((m) => f(m)).map((m) => m.id);
  }, pred);
}

const centre = (cx, cy, w, h) => ({ x: () => cx - w / 2, y: () => cy - h / 2 });

const SHOTS = {
  land: {
    save: () => rawSave(10),
    camera: { viewX: 190, viewY: 118, tileWidth: 32 },
    setup: async (page) => {
      await setPaused(page, false);
      await warm(page, 120);
    },
    frames: 900,
    h: { x: lin(0, 239, 900), y: () => 200 },
    v: { x: lin(0, 200, 900), y: () => 20 }
  },
  colony: {
    save: () => stagedSave({ hour: 9.5, weather: clearSky }),
    camera: { viewX: 229, viewY: 115, tileWidth: 32 },
    setup: async (page) => {
      await stageColony(page);
      await setPaused(page, false);
      await warm(page, 900);
    },
    frames: 900,
    h: centre(600, 490, 960, 540),
    v: centre(600, 490, 540, 960)
  },
  herd: {
    save: () => rawSave(8),
    camera: { viewX: 258, viewY: 118, tileWidth: 32 },
    setup: async (page) => {
      await setPaused(page, false);
      await warm(page, 240);
    },
    frames: 900,
    h: { x: lin(240, 0, 900), y: () => 230 },
    v: { x: lin(420, 181, 900), y: () => 20 }
  },
  hudgame: {
    save: () => stagedSave({ hour: 10, weather: clearSky }),
    camera: { viewX: 228, viewY: 121, tileWidth: 32 },
    viewport: [960, 540],
    hud: true,
    css: '.bi.turn,.bi.perf{display:none!important}',
    setup: async (page) => {
      await stageColony(page);
      await setPaused(page, false);
      await warm(page, 1200);
    },
    frames: 900,
    h: { x: () => 0, y: () => 0 },
    v: { x: () => 0, y: () => 26 },
    vsize: [270, 480]
  },
  hunt: {
    save: () => stagedSave({ hour: 15, weather: clearSky, pawnSpots: [[262, 128], [263, 130], [261, 131], [264, 127], [262, 133]] }),
    camera: { viewX: 252, viewY: 113, tileWidth: 32 },
    setup: async (page) => {
      await stageColony(page, { blueprints: false, woodcut: false });
      await setPaused(page, false);
      const ids = await mobIds(page, "m.creatureId === 'elk' && m.x > 262 && m.x < 290 && m.y > 118 && m.y < 150");
      log('hunt targets ' + ids.length);
      await cmd(page, [['markMobsForHunt', { ids }]]);
      await warm(page, 180);
    },
    frames: 840,
    h: centre(600, 520, 960, 540),
    v: centre(600, 520, 540, 960)
  }
};

const name = process.argv[2];
const s = SHOTS[name];
if (!s) throw new Error('unknown shot ' + name + '; one of ' + Object.keys(SHOTS).join(' '));
const [W, H] = s.viewport ?? [VW, VH];
const g = await openGame({ save: s.save(), width: W, height: H, camera: s.camera, hud: !!s.hud });
if (s.css) await g.page.addStyleTag({ content: s.css });
if (s.setup) await s.setup(g.page);
log('turn ' + (await g.page.evaluate(() => window.__f4xWorkPins.step(0))));
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
  }, ms);
await recordHeld({
  page: g.page,
  frames: s.frames,
  hold: HOLD,
  region: { x: 0, y: 0, w: W, h: H },
  outs: [
    { file: `${OUT}/clips/${name}.mp4`, w: 960, h: 540, scale: 2, ...s.h },
    { file: `${OUT}/clips-vertical/${name}.mp4`, w: s.vsize?.[0] ?? 540, h: s.vsize?.[1] ?? 960, scale: s.vsize ? 4 : 2, ...s.v }
  ],
  advance: async (j) => {
    await (j > 0 ? step(g.page, HOLD, (1000 / 60) * HOLD) : step(g.page, 0));
    await cssAt(g.page, (j * 1000 * HOLD) / 60);
  }
});
log('errors ' + JSON.stringify(g.errors.slice(0, 5)));
await g.close();
log('done ' + name);
