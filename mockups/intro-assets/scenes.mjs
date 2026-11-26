import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.env.MOCKUPS || 'http://ubuntuserver:8794';
const OUT = (process.argv[2] || process.env.HOME + '/.cache/fantasia4x-intro') + '/scenes/hud/';
const HIDE = '#mock,#hud,#marks,#stamp,#busy,#wx,header,footer,[class*=comment],[id*=comment]{display:none!important}';
const SHOTS = [
  [6.5, 'clear'], [9, 'clear'], [13, 'clear'], [17, 'clear'], [19, 'clear'], [21, 'clear'], [23.5, 'clear'],
  [13, 'rain'], [13, 'storm'], [13, 'fog'], [13, 'snow'], [13, 'blizzard'],
  [13, 'spring_windy'], [13, 'summer_windy'], [13, 'autumn_windy'], [13, 'winter_windy'], [23.5, 'snow'],
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
for (const [hour, weather] of SHOTS) {
  const p = await browser.newPage({ viewport: { width: 1920, height: 1088 }, deviceScaleFactor: 1 });
  await p.goto(`${BASE}/fantasia4x-hud/?strip=0&hour=${hour}&weather=${weather}`, { waitUntil: 'networkidle' });
  await p.waitForFunction(() => document.getElementById('busy').hidden && HUD.map, null, { timeout: 120000 });
  await p.addStyleTag({ content: HIDE });
  await p.waitForTimeout(600);
  const name = `hud-${String(hour).replace('.', '_').padStart(2, '0')}h-${weather}.png`;
  writeFileSync(OUT + name, await p.screenshot());
  console.log('wrote', name);
  await p.close();
}
await browser.close();
