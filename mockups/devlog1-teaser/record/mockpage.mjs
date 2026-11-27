import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { chromium, sleep, log } from './session.mjs';

const LIVE = process.env.MOCK_LIVE === '1';
export const MOCK = LIVE ? 'http://ubuntuserver:8794' : 'http://mockups.local';
const ROOT = process.env.MOCK_ROOT || '/tmp/f4x-mockserve';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.svg': 'image/svg+xml' };
let patchBody = null;
async function serve(route) {
  let path = decodeURIComponent(new URL(route.request().url()).pathname);
  if (path.endsWith('/')) path += 'index.html';
  try {
    let body = await readFile(join(ROOT, path));
    if (patchBody && path.endsWith('.html')) body = patchBody(path, body.toString());
    await route.fulfill({ body, contentType: TYPES[extname(path)] ?? 'application/octet-stream' });
  } catch {
    await route.fulfill({ status: 404, body: '' });
  }
}
export const CHROME = '#mock,#hud,#marks,#stamp,#busy,header,footer,[class*=comment],[id*=comment],.mockhide{display:none!important}';

export async function openMock({ path, width, height, hide = CHROME, ready, clock = true, settle = 1500, patch = null }) {
  patchBody = patch;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  if (!LIVE) await page.route(`${MOCK}/**`, serve);
  page.on('pageerror', (e) => log('pageerror ' + e.message));
  await page.goto(`${MOCK}/${path}`, { waitUntil: 'load' });
  await page.waitForFunction(ready ?? (() => true), null, { timeout: 3600000, polling: 2000 });
  await page.addStyleTag({ content: hide });
  await sleep(settle);
  if (clock) {
    await page.clock.install({ time: 1_700_000_000_000 });
    await page.clock.pauseAt(1_700_000_001_000);
    await page.clock.runFor(100);
  }
  log('mock ready ' + path);
  return { page, browser, close: () => browser.close() };
}
