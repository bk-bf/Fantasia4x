import { readFileSync, writeFileSync } from 'node:fs';
const DEV = process.argv[2];
if (!DEV) throw new Error('usage: node capture-glyph.mjs <dev-worktree>  (git worktree add --detach /tmp/f4x-dev dev && pnpm -C /tmp/f4x-dev install)');
const OUT = new URL('src/', import.meta.url).pathname;
const session = readFileSync(`${DEV}/tools/work-pins/browser-session.mjs`, 'utf8').replace(
  "await page.getByRole('button', { name: 'Load Game', exact: true }).dispatchEvent('click');",
  "await page.evaluate(() => [...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') ?? b.textContent.trim()) === 'Load Game').click());");
writeFileSync(`${DEV}/tools/work-pins/capture-session.mjs`, session);
const { openGame, logger } = await import(`${DEV}/tools/work-pins/capture-session.mjs`);
const g = await openGame({ tree: DEV, fixture: `${DEV}/tools/work-pins/fixtures/dev-save.json.gz`, serverLog: '/tmp/f4x-glyph-server.log', log: logger('cap'), clock: false, workPins: false, init: [[c => sessionStorage.setItem('fantasia4x-camera', c), JSON.stringify({ viewX: 250, viewY: 221, tileWidth: 48 })]], args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const { page } = g;
const sleep = ms => new Promise(r => setTimeout(r, ms));
await page.evaluate(() => document.querySelector('button.ctrl-btn')?.click());
await page.setViewportSize({ width: 1280, height: 1088 });
const info = await page.evaluate(async () => {
  const { gameState } = await import('/src/lib/stores/gameState.ts');
  let s; gameState.subscribe(v => s = v)();
  const cmd = (type, payload) => gameState.command({ type, payload, save: false });
  cmd('setWeather', { type: 'clear' }); cmd('setSeason', { season: 'summer' }); cmd('setTimeOfDay', { timeOfDay: 0.5 }); cmd('devSetMapSnow', { value: 0 }); cmd('devSetMapIce', { value: 0 });
  gameState.subscribe(v => s = v)();
  const W = 12, H = 8, ok = (x0, y0) => { for (let y = y0 - 1; y < y0 + H + 5; y++) for (let x = x0 - 1; x < x0 + W + 1; x++) { const t = s.worldMap?.[y]?.[x]; if (!t || t.walkable === false) return false; } return true; };
  let best = null;
  for (let r = 0; r < 40 && !best; r++) for (let dy = -r; dy <= r && !best; dy++) for (let dx = -r; dx <= r && !best; dx++) if (ok(257 + dx, 225 + dy)) best = [257 + dx, 225 + dy];
  if (!best) return 'no spot';
  const [X, Y] = best, put = (id, x, y) => cmd('devSpawnBuildingAt', { buildingId: id, x, y });
  for (let x = X; x < X + W; x++) { put('stone_block_wall', x, Y); if (x !== X + 4) put('stone_block_wall', x, Y + H - 1); }
  for (let y = Y + 1; y < Y + H - 1; y++) { put('stone_block_wall', X, y); put('stone_block_wall', X + W - 1, y); }
  put('door', X + 4, Y + H - 1);
  for (let y = Y + 1; y < Y + H - 1; y++) for (let x = X + 1; x < X + W - 1; x++) put('wooden_floor', x, y);
  put('hide_bed', X + 2, Y + 1); put('hide_bed', X + 4, Y + 1); put('hearth', X + 7, Y + 1); put('bear_rug', X + 2, Y + 4); put('wooden_table', X + 6, Y + 4); put('wooden_stool', X + 5, Y + 5); put('armchair', X + 9, Y + 4);
  put('well', X + 8, Y + H + 2); put('campfire', X + 2, Y + H + 3);
  for (let x = X - 1; x <= X + W; x++) put('palisade', x, Y - 2);
  gameState.subscribe(v => s = v)();
  return { best, nb: s.buildings.length };
});
console.log(JSON.stringify(info));
await sleep(3000);
await page.addStyleTag({ content: 'aside.left-panel, aside.right-panel, .game-header, nav.bottom-nav, .event-overlay, .weather-canvas { visibility: hidden !important }' });
await sleep(3000);
const shot = await page.screenshot({ timeout: 900000 });
writeFileSync(OUT + 'old-glyph.png', shot);
console.log('wrote src/old-glyph.png');
console.log(await page.evaluate(() => sessionStorage.getItem('fantasia4x-camera')));
console.log(JSON.stringify(g.errors.slice(0,5)));
await g.close();
