import { spawn } from 'node:child_process';
import { log } from './session.mjs';

function encoder(file, w, h, scale = 1) {
  const p = spawn('ffmpeg', [
    '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', '60', '-c:v', 'png', '-i', '-',
    '-vf', `scale=${w * scale}:${h * scale}:flags=neighbor`,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
    '-r', '60', '-an', '-movflags', '+faststart', file
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((ok, fail) => p.on('exit', (c) => (c === 0 ? ok() : fail(new Error(`ffmpeg ${c} ${file}`)))));
  const write = (buf) => new Promise((ok) => (p.stdin.write(buf) ? ok() : p.stdin.once('drain', ok)));
  return { write, end: () => (p.stdin.end(), done) };
}

export async function record({ page, frames, advance, outs }) {
  const cdp = await page.context().newCDPSession(page);
  const encs = outs.map((o) => encoder(o.file, o.w, o.h, o.scale ?? 1));
  const t0 = Date.now();
  for (let i = 0; i < frames; i++) {
    await advance(i);
    for (let k = 0; k < outs.length; k++) {
      const o = outs[k];
      const x = Math.round(o.x(i));
      const y = Math.round(o.y(i));
      const { data } = await cdp.send('Page.captureScreenshot', {
        format: 'png', fromSurface: true, optimizeForSpeed: true,
        clip: { x, y, width: o.w, height: o.h, scale: 1 }
      });
      await encs[k].write(Buffer.from(data, 'base64'));
    }
    if (i % 60 === 0) log(`frame ${i}/${frames} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  await Promise.all(encs.map((e) => e.end()));
  log('encoded ' + outs.map((o) => o.file).join(' '));
}

export const ease = (a, b, n) => (i) => {
  const t = Math.min(1, Math.max(0, i / (n - 1)));
  const s = t * t * (3 - 2 * t);
  return a + (b - a) * s;
};
export const lin = (a, b, n) => (i) => a + ((b - a) * i) / (n - 1);

function cropExpr(f, N) {
  const a = Math.round(f(0));
  const b = Math.round(f(N - 1));
  return a === b ? String(a) : `floor(${a}+(${b - a})*n/${N - 1}+0.5)`;
}

export async function recordHeld({ page, frames, hold, advance, outs, region }) {
  const cdp = await page.context().newCDPSession(page);
  const shots = Math.ceil(frames / hold);
  const fps = 60 / hold;
  const graph = [`[0]fps=60,split=${outs.length}${outs.map((_, k) => `[s${k}]`).join('')}`];
  outs.forEach((o, k) => {
    const sc = o.scale ?? 1;
    graph.push(`[s${k}]crop=${o.w}:${o.h}:${cropExpr((i) => o.x(i) - region.x, frames)}:${cropExpr((i) => o.y(i) - region.y, frames)},scale=${o.w * sc}:${o.h * sc}:flags=neighbor[o${k}]`);
  });
  const args = ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-', '-filter_complex', graph.join(';')];
  outs.forEach((o, k) => args.push('-map', `[o${k}]`, '-frames:v', String(frames), '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', '60', '-an', '-movflags', '+faststart', o.file));
  const p = spawn('ffmpeg', args, { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((ok, fail) => p.on('exit', (c) => (c === 0 ? ok() : fail(new Error('ffmpeg ' + c)))));
  const t0 = Date.now();
  for (let j = 0; j <= shots; j++) {
    await advance(j);
    const { data } = await cdp.send('Page.captureScreenshot', {
      format: 'png', fromSurface: true, optimizeForSpeed: true,
      clip: { x: region.x, y: region.y, width: region.w, height: region.h, scale: 1 }
    });
    const buf = Buffer.from(data, 'base64');
    await new Promise((ok) => (p.stdin.write(buf) ? ok() : p.stdin.once('drain', ok)));
    if (j % 15 === 0) log(`shot ${j}/${shots} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  p.stdin.end();
  await done;
  log('encoded ' + outs.map((o) => o.file).join(' '));
}
