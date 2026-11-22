import { deflateSync } from 'node:zlib';

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf = Buffer.alloc(0)) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type = '', data = Buffer.alloc(0)) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function header(w = 0, h = 0) {
  const head = Buffer.alloc(13);
  head.writeUInt32BE(w, 0);
  head.writeUInt32BE(h, 4);
  head.set([8, 6, 0, 0, 0], 8);
  return chunk('IHDR', head);
}

function scanlines(w = 0, h = 0, rgba = new Uint8Array(0)) {
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++)
    raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1);
  return deflateSync(raw, { level: 9 });
}

export function encodePng(w = 0, h = 0, rgba = new Uint8Array(0)) {
  return Buffer.concat([
    SIGNATURE,
    header(w, h),
    chunk('IDAT', scanlines(w, h, rgba)),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

export function encodeApng(
  w = 0,
  h = 0,
  frames = [{ x: 0, y: 0, w: 0, h: 0, rgba: new Uint8Array(0) }],
  fps = 10
) {
  const control = Buffer.alloc(8);
  control.writeUInt32BE(frames.length, 0);
  const out = [SIGNATURE, header(w, h), chunk('acTL', control)];
  let seq = 0;
  frames.forEach((f, i) => {
    const fc = Buffer.alloc(26);
    fc.writeUInt32BE(seq++, 0);
    fc.writeUInt32BE(f.w, 4);
    fc.writeUInt32BE(f.h, 8);
    fc.writeUInt32BE(f.x, 12);
    fc.writeUInt32BE(f.y, 16);
    fc.writeUInt16BE(1, 20);
    fc.writeUInt16BE(fps, 22);
    fc.set([0, 1], 24);
    out.push(chunk('fcTL', fc));
    const data = scanlines(f.w, f.h, f.rgba);
    if (i === 0) out.push(chunk('IDAT', data));
    else {
      const num = Buffer.alloc(4);
      num.writeUInt32BE(seq++, 0);
      out.push(chunk('fdAT', Buffer.concat([num, data])));
    }
  });
  out.push(chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(out);
}
