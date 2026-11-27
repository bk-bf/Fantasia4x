import { deflateSync } from 'node:zlib';

function chunk(type: string, body: Uint8Array): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, 'ascii');
  return Buffer.concat([head, Buffer.from(body), Buffer.alloc(4)]);
}

function predictor(filter: number, a: number, b: number, c: number): number {
  if (filter === 1) return a;
  if (filter === 2) return b;
  if (filter === 3) return (a + b) >> 1;
  if (filter === 4) {
    const p = a + b - c;
    const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  }
  return 0;
}

export function encodePng(
  pixels: Uint8Array,
  width: number,
  height: number,
  filterOf: (y: number) => number = () => 0,
  header: { depth?: number; colour?: number; interlace?: number } = {}
): Uint8Array {
  const stride = width * 4;
  const rows = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const filter = filterOf(y);
    rows[y * (stride + 1)] = filter;
    for (let x = 0; x < stride; x++) {
      const at = y * stride + x;
      const a = x >= 4 ? pixels[at - 4] : 0;
      const b = y > 0 ? pixels[at - stride] : 0;
      const c = x >= 4 && y > 0 ? pixels[at - stride - 4] : 0;
      rows[y * (stride + 1) + 1 + x] = (pixels[at] - predictor(filter, a, b, c)) & 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = header.depth ?? 8;
  ihdr[9] = header.colour ?? 6;
  ihdr[12] = header.interlace ?? 0;
  const compressed = deflateSync(rows);
  const half = compressed.length >> 1;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed.subarray(0, half)),
    chunk('IDAT', compressed.subarray(half)),
    chunk('IEND', new Uint8Array(0))
  ]);
}

export function coordinateAtlas(width: number, height: number): Uint8Array {
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      pixels.set([x & 255, y & 255, (x >> 8) | ((y >> 8) << 4), 255], (y * width + x) * 4);
  return encodePng(pixels, width, height);
}

export function paintedFetch(manifest: unknown, atlas: Uint8Array) {
  return async (url: string) =>
    url.endsWith('atlas.png')
      ? { ok: true, arrayBuffer: async () => atlas.slice().buffer }
      : url.endsWith('.png')
        ? { ok: false, status: 404 }
        : { ok: true, json: async () => manifest };
}

export class FakeImageData {
  constructor(
    readonly data: Uint8ClampedArray,
    readonly width: number,
    readonly height: number
  ) {}
}
