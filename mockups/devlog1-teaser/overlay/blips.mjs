import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { config, blipTimes } from './timing.mjs';

const here = new URL('.', import.meta.url).pathname;
const { values: o } = parseArgs({ options: {
  lines: { type: 'string', default: 'lines.json' },
  blip: { type: 'string', default: here + 'blip.wav' },
  duration: { type: 'string' },
  out: { type: 'string', default: 'blips.wav' },
  gain: { type: 'string', default: '0.6' }
} });

function readWav(buf) {
  let p = 12, fmt = null, data = null;
  while (p < buf.length) {
    const id = buf.toString('ascii', p, p + 4), size = buf.readUInt32LE(p + 4);
    if (id === 'fmt ') fmt = { ch: buf.readUInt16LE(p + 10), rate: buf.readUInt32LE(p + 12), bits: buf.readUInt16LE(p + 22) };
    if (id === 'data') data = buf.subarray(p + 8, p + 8 + size);
    p += 8 + size + (size & 1);
  }
  if (!fmt || fmt.bits !== 16 || fmt.ch !== 1) throw new Error('blip must be 16-bit mono PCM');
  const s = new Float32Array(data.length / 2);
  for (let i = 0; i < s.length; i++) s[i] = data.readInt16LE(i * 2) / 32768;
  return { rate: fmt.rate, s };
}

function writeWav(s, rate) {
  const buf = Buffer.alloc(44 + s.length * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + s.length * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(s.length * 2, 40);
  for (let i = 0; i < s.length; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s[i])) * 32767), 44 + i * 2);
  return buf;
}

const cfg = config(JSON.parse(await readFile(resolve(o.lines), 'utf8')));
const blip = readWav(await readFile(resolve(o.blip)));
const duration = o.duration ? Number(o.duration) : cfg.duration, rate = blip.rate, gain = Number(o.gain);
const mix = new Float32Array(Math.ceil(duration * rate));
const hits = blipTimes(cfg);
for (const { t, rate: pitch } of hits) {
  const at = Math.round(t * rate), n = Math.floor(blip.s.length / pitch);
  for (let k = 0; k < n && at + k < mix.length; k++) {
    const x = k * pitch, i = Math.floor(x), f = x - i;
    mix[at + k] += gain * (blip.s[i] * (1 - f) + (blip.s[i + 1] || 0) * f);
  }
}
await writeFile(resolve(o.out), writeWav(mix, rate));
console.log(`${hits.length} blips, ${duration}s -> ${resolve(o.out)}`);
