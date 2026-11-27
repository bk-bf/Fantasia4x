import { chromium } from 'playwright';
import { mkdir, rm, link, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { spawnSync } from 'node:child_process';
import { basename, dirname, resolve } from 'node:path';
import { mountDir, ORIGIN } from './serve.mjs';

const here = new URL('.', import.meta.url).pathname;
const { values: o } = parseArgs({ options: {
  lines: { type: 'string', default: 'lines.json' },
  size: { type: 'string', default: '1920x1080' },
  fps: { type: 'string', default: '60' },
  duration: { type: 'string' },
  out: { type: 'string' },
  codec: { type: 'string', default: 'prores' }
} });
const [W, H] = o.size.split('x').map(Number), fps = Number(o.fps);
const linesPath = resolve(o.lines);
const out = resolve(o.out || `overlay-${o.size}.mov`);
const frameDir = resolve(dirname(out), 'frames', basename(out).replace(/\.[^.]+$/, ''));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await mountDir(page, here);
await page.route(ORIGIN + '/__lines.json', route => route.fulfill({ path: linesPath, contentType: 'application/json' }));
await page.goto(`${ORIGIN}/overlay.html?size=${o.size}&lines=__lines.json`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 }).catch(() => {});
if (errors.length || !(await page.evaluate(() => window.__ready))) { console.error(errors.join('\n') || 'overlay never became ready'); process.exit(1); }
const duration = o.duration ? Number(o.duration) : await page.evaluate(() => window.__narrator.cfg.duration);
const frames = Math.round(duration * fps);

await rm(frameDir, { recursive: true, force: true });
await mkdir(frameDir, { recursive: true });
const name = i => `${frameDir}/${String(i).padStart(6, '0')}.png`;
let lastKey = null, lastFile = null, shot = 0;
for (let i = 0; i < frames; i++) {
  const k = await page.evaluate(t => window.__seek(t), i / fps);
  if (k === lastKey && lastFile) { await link(lastFile, name(i)); continue; }
  await page.screenshot({ path: name(i), omitBackground: true, clip: { x: 0, y: 0, width: W, height: H } });
  lastKey = k; lastFile = name(i); shot++;
}
await browser.close();
console.log(`${frames} frames, ${shot} distinct, ${o.size} @ ${fps}`);

const enc = o.codec === 'vp9'
  ? ['-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '18', '-row-mt', '1']
  : ['-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le', '-alpha_bits', '16'];
const r = spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', String(fps), '-i', `${frameDir}/%06d.png`, ...enc, out], { stdio: 'inherit' });
if (r.status) process.exit(r.status);
await writeFile(out + '.json', JSON.stringify({ size: o.size, fps, duration, frames, lines: linesPath, frameDir }, null, 1));
console.log('wrote', out);
