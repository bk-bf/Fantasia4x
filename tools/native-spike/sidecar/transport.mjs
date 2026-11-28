import { spawn } from 'node:child_process';
import { connect } from 'node:net';
import { readFileSync, writeFileSync } from 'node:fs';
import { once } from 'node:events';

const [, , bin, snapFile, out = ''] = process.argv;
const snap = readFileSync(snapFile);
const opaque = Buffer.concat([Buffer.from('#'), snap.subarray(1)]);
const obj = JSON.parse(snap.toString('utf8'));
const full = Buffer.alloc(7_300_000, 120);
const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const stats = (xs, bytes) => { const t = xs.reduce((a, b) => a + b, 0); return { n: xs.length, p50: pct(xs, 0.5), p95: pct(xs, 0.95), mean: t / xs.length, mbPerS: bytes ? (bytes * xs.length) / 1e6 / (t / 1000) : undefined }; };

function framer(readable) {
  let acc = Buffer.alloc(0);
  let waiting = null;
  readable.on('data', (d) => {
    acc = Buffer.concat([acc, d]);
    while (acc.length >= 4 && waiting) {
      const v = acc.readUInt32LE(0);
      acc = acc.subarray(4);
      const w = waiting;
      waiting = null;
      w(v);
    }
  });
  return () => new Promise((r) => { waiting = r; if (acc.length >= 4) readable.emit('data', Buffer.alloc(0)); });
}

async function bench(write, next) {
  const call = (payload) => { const h = Buffer.alloc(4); h.writeUInt32LE(payload.length); write(Buffer.concat([h, payload])); return next(); };
  const loop = async (n, fn) => { const xs = []; for (let i = 0; i < n; i++) { const t = performance.now(); await fn(); xs.push(performance.now() - t); } return xs; };
  await loop(200, () => call(Buffer.from('x')));
  const r = {};
  r.ping = stats(await loop(2000, () => call(Buffer.from('x'))));
  r.snapshot = stats(await loop(300, () => call(opaque)), snap.length);
  r.snapshotWithStringify = stats(await loop(300, () => call(Buffer.from('#' + JSON.stringify(obj).slice(1)))), snap.length);
  const us = [];
  for (let i = 0; i < 100; i++) us.push(await call(snap));
  r.peerParseUs = { p50: pct(us, 0.5), p95: pct(us, 0.95) };
  r.full = stats(await loop(10, () => call(full)), full.length);
  r.snapshotParsedByPeer = stats(await loop(300, () => call(snap)), snap.length);
  return r;
}

const res = { runtime: `node ${process.version}`, snapshotBytes: snap.length };
{
  const p = spawn(bin, [], { stdio: ['pipe', 'pipe', 'inherit'] });
  res.pipe = await bench((b) => p.stdin.write(b), framer(p.stdout));
  p.stdin.end();
}
{
  const path = `/tmp/claude-1000/frame-echo-${process.pid}.sock`;
  const p = spawn(bin, [path], { stdio: ['ignore', 'pipe', 'inherit'] });
  await once(p.stdout, 'data');
  const s = connect(path);
  await once(s, 'connect');
  res.unixSocket = await bench((b) => s.write(b), framer(s));
  s.end();
}
{
  const dst = Buffer.alloc(snap.length);
  const xs = [];
  for (let i = 0; i < 2000; i++) { const t = performance.now(); snap.copy(dst); xs.push(performance.now() - t); }
  res.sharedMemoryCopyFloor = stats(xs, snap.length);
  const js = [];
  for (let i = 0; i < 300; i++) { const t = performance.now(); JSON.stringify(obj); js.push(performance.now() - t); }
  res.stringify = stats(js);
}
console.log(JSON.stringify(res, null, 1));
if (out) writeFileSync(out, JSON.stringify(res, null, 1));
